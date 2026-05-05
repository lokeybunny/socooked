import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Phone, Play, Pause, Trash2, Download, RefreshCw, Upload } from "lucide-react";
import { prepareExportRows, type ExportPhoneFormat, type ExportSummary } from "@/lib/phoneFormat";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Job = {
  id: string;
  status: string;
  total: number;
  processed: number;
  mobile: number;
  landline: number;
  voip: number;
  invalid: number;
  unknown: number;
  failed: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
};

type StateCount = { state: string; count: number };

type Preview = {
  total_leads: number;
  need_audit: number;
  cache_ready: number;
  estimated_cost_usd: number;
  states: StateCount[];
};

export default function PhoneAudit() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [selectedState, setSelectedState] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [auditLimit, setAuditLimit] = useState<number | "">("");
  const [uploadJob, setUploadJob] = useState<{ status: string; processed?: number; total?: number; result?: any } | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportPhoneFormat>("us10");
  const [exportSummary, setExportSummary] = useState<(ExportSummary & { filename: string }) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stateArg = selectedState === "ALL" ? undefined : selectedState;

  const loadPreview = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("audit-existing-phone-numbers", {
      body: { action: "preview", state: stateArg },
    });
    if (error) toast.error(error.message);
    else setPreview(data as Preview);
  }, [stateArg]);

  const loadLatestJob = useCallback(async () => {
    const { data } = await supabase
      .from("phone_audit_jobs")
      .select("*")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data) setJob(data as unknown as Job);
  }, []);

  useEffect(() => { loadPreview(); }, [loadPreview]);
  useEffect(() => { loadLatestJob(); }, [loadLatestJob]);

  // Realtime updates for the audit job + poll fallback
  useEffect(() => {
    if (!job?.id) return;
    const ch = supabase
      .channel(`phone-audit-${job.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "phone_audit_jobs", filter: `id=eq.${job.id}` },
        (payload) => setJob(payload.new as unknown as Job))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [job?.id]);

  useEffect(() => {
    if (job?.status !== "running") return;
    const id = setInterval(() => { loadLatestJob(); loadPreview(); }, 4000);
    return () => clearInterval(id);
  }, [job?.status, loadLatestJob, loadPreview]);

  const callAudit = async (action: string, extra: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action, state: stateArg, ...extra };
      if (job?.id && (action === "pause" || action === "resume")) body.job_id = job.id;
      const { error } = await supabase.functions.invoke("audit-existing-phone-numbers", { body });
      if (error) throw error;
      toast.success(`Audit ${action}`);
      await loadLatestJob();
      await loadPreview();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const onStart = async () => {
    if (!preview) return;
    const scope = selectedState === "ALL" ? "all states" : selectedState;
    const planned = auditLimit && auditLimit > 0 ? Math.min(auditLimit, preview.need_audit) : preview.need_audit;
    const cost = (planned * 0.008).toFixed(2);
    if (!window.confirm(
      `Start audit for ${scope}?\n\nLeads to audit: ${planned} (of ${preview.need_audit} needing lookup)\nEstimated Twilio cost: $${cost}\n\nContinue?`,
    )) return;
    await callAudit("start", auditLimit ? { limit: auditLimit } : {});
  };

  const onDeleteNonMobile = async () => {
    const dry = await supabase.functions.invoke("delete-non-mobile-leads", { body: { dry_run: true, state: stateArg } });
    if (dry.error) return toast.error(dry.error.message);
    const count = (dry.data as { would_move: number })?.would_move ?? 0;
    if (!window.confirm(`Move ${count} non-mobile leads to rejected_leads and delete from state_leads?`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-non-mobile-leads", {
        body: { confirm: true, state: stateArg },
      });
      if (error) throw error;
      toast.success(`Deleted ${count} non-mobile leads`);
      await loadPreview();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  };

  const exportRejected = async () => {
    const { data, error } = await supabase
      .from("rejected_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50000);
    if (error) return toast.error(error.message);
    const rows = data ?? [];
    if (!rows.length) return toast.info("No rejected leads to export");
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => {
          const v = (r as Record<string, unknown>)[h];
          const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        }).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rejected_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMobile = async () => {
    const tid = toast.loading(`Exporting verified mobile numbers${stateArg ? ` for ${stateArg}` : ""}…`);
    try {
      const pageSize = 1000;
      let from = 0;
      const rows: any[] = [];
      while (true) {
        let q = supabase
          .from("state_leads")
          .select("first_name,name,phone_e164,phone_number,office_phone,email,state,phone_valid,phone_line_type")
          .eq("phone_line_type", "mobile")
          .eq("phone_valid", true)
          .range(from, from + pageSize - 1);
        if (stateArg) q = q.eq("state", stateArg);
        const { data, error } = await q;
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      toast.dismiss(tid);
      if (!rows.length) return toast.error("No verified mobile leads found");

      // Apply global export formatting layer (normalize, validate, dedup, mobile-only)
      const { rows: prepared, summary } = prepareExportRows(rows, {
        mode: exportFormat,
        mobileOnly: true,
      });

      if (!prepared.length) {
        return toast.error("No exportable numbers after formatting");
      }

      const esc = (v: any) => {
        const s = (v ?? "").toString();
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = stateArg
        ? "first_name,last_name,phone_number,email"
        : "first_name,last_name,phone_number,email,state";
      const lines = prepared.map(({ row: r, phone_number }) => {
        let first = (r.first_name ?? "").trim();
        let last = "";
        if (!first && r.name) {
          const parts = String(r.name).trim().split(/\s+/);
          first = parts.shift() ?? "";
          last = parts.join(" ");
        } else if (r.name) {
          const parts = String(r.name).trim().split(/\s+/);
          if (parts.length > 1 && parts[0].toLowerCase() === first.toLowerCase()) {
            last = parts.slice(1).join(" ");
          }
        }
        const base = [esc(first), esc(last), esc(phone_number), esc(r.email)];
        return stateArg ? base.join(",") : [...base, esc(r.state)].join(",");
      });
      const csv = [header, ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `${stateArg ?? "all"}_mobile_${exportFormat}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setExportSummary({ ...summary, filename });
      toast.success(`Exported ${summary.exported.toLocaleString()} mobile leads`);
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(`Export failed: ${e.message}`);
    }
  };

  const onUploadFile = async (file: File) => {
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) { toast.error("Upload a CSV or Excel file"); return; }
    if (selectedState === "ALL") { toast.error("Pick a state first"); return; }
    setUploadJob({ status: "uploading" });
    try {
      const text = await file.text();
      const phaseA = await supabase.functions.invoke("audit-uploaded-phone-numbers", {
        body: { state: selectedState, csv: text, confirmed: false, filename: file.name },
      });
      if (phaseA.error) throw phaseA.error;
      const audit = phaseA.data as { import_batch_id: string; total: number; mobile: number; landline: number; voip: number; invalid: number; estimated_cost_usd: number };
      setUploadJob({ status: "audited", result: audit });
      const ok = window.confirm(
        `Audit complete:\nMobile: ${audit.mobile}\nLandline: ${audit.landline}\nVoIP: ${audit.voip}\nInvalid: ${audit.invalid}\n\nSave ${audit.mobile} mobile leads to ${selectedState}?`,
      );
      if (!ok) { setUploadJob(null); return; }
      const phaseB = await supabase.functions.invoke("audit-uploaded-phone-numbers", {
        body: { state: selectedState, confirmed: true, import_batch_id: audit.import_batch_id },
      });
      if (phaseB.error) throw phaseB.error;
      toast.success(`Saved ${audit.mobile} mobile leads`);
      setUploadJob(null);
      await loadPreview();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setUploadJob(null);
    }
  };

  const pct = job && job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Phone className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Phone Number Audit</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadPreview(); loadLatestJob(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">State:</span>
        <Select value={selectedState} onValueChange={setSelectedState}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All States</SelectItem>
            {(preview?.states ?? []).map((s) => (
              <SelectItem key={s.state} value={s.state}>{s.state} ({s.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {selectedState === "ALL"
            ? "Audit/manage every state"
            : `Scope all actions to ${selectedState}`}
        </span>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Leads</div><div className="text-2xl font-bold">{preview?.total_leads ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Need Audit</div><div className="text-2xl font-bold">{preview?.need_audit ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Cached Lookups</div><div className="text-2xl font-bold">{preview?.cache_ready ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Est. Twilio Cost</div><div className="text-2xl font-bold">${preview?.estimated_cost_usd ?? "0.00"}</div></Card>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Existing Database Audit</h2>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{job?.status ?? "no job yet"}</span>
        </div>

        {job && (
          <div className="space-y-2">
            <div className="h-2 w-full bg-muted rounded">
              <div className="h-2 bg-primary rounded transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-sm text-muted-foreground">{job.processed} / {job.total} processed ({pct}%)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <Stat label="Mobile" value={job.mobile} tone="text-emerald-500" />
              <Stat label="Landline" value={job.landline} tone="text-yellow-500" />
              <Stat label="VoIP" value={job.voip} tone="text-orange-500" />
              <Stat label="Invalid" value={job.invalid} tone="text-red-500" />
            </div>
          </div>
        )}

        {(!job || job.status === "completed" || job.status === "error") && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground">Limit:</span>
            <input
              type="number"
              min={1}
              placeholder="all"
              value={auditLimit}
              onChange={(e) => setAuditLimit(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))}
              className="w-28 h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            {[100, 500, 1000, 5000].map((n) => (
              <Button key={n} type="button" size="sm" variant="outline" onClick={() => setAuditLimit(n)}>
                {n.toLocaleString()}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground">
              ≈ ${(((typeof auditLimit === "number" ? auditLimit : preview?.need_audit ?? 0)) * 0.008).toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {(!job || job.status === "completed" || job.status === "error") && (
            <Button onClick={onStart} disabled={loading || !preview?.need_audit}>
              <Play className="h-4 w-4 mr-2" />
              {auditLimit ? `Audit ${Number(auditLimit).toLocaleString()}` : "Start Full Audit"}
            </Button>
          )}
          {job?.status === "running" && (
            <Button variant="outline" onClick={() => callAudit("pause")} disabled={loading}>
              <Pause className="h-4 w-4 mr-2" /> Pause
            </Button>
          )}
          {job?.status === "paused" && (
            <Button onClick={() => callAudit("resume")} disabled={loading}>
              <Play className="h-4 w-4 mr-2" /> Resume
            </Button>
          )}
          <Button variant="outline" onClick={exportMobile}>
            <Download className="h-4 w-4 mr-2" /> Export Mobile CSV
          </Button>
          <Button variant="outline" onClick={exportRejected}>
            <Download className="h-4 w-4 mr-2" /> Export Rejected CSV
          </Button>
          <Button variant="destructive" onClick={onDeleteNonMobile} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete Non-Mobile
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Upload New CSV (gated by Twilio)</h2>
          <span className="text-xs text-muted-foreground">
            {selectedState === "ALL" ? "Pick a state above" : `Target: ${selectedState}`}
          </span>
        </div>
        <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Upload a CSV/Excel — every phone is audited via Twilio Lookup before save.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={selectedState === "ALL" || !!uploadJob}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploadJob?.status === "uploading" ? "Auditing…" : "Choose File"}
          </Button>
          {uploadJob?.result && (
            <div className="text-sm text-muted-foreground pt-2">
              Mobile {uploadJob.result.mobile} · Landline {uploadJob.result.landline} ·
              VoIP {uploadJob.result.voip} · Invalid {uploadJob.result.invalid} ·
              Est ${uploadJob.result.estimated_cost_usd}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${tone}`}>{value ?? 0}</div>
    </div>
  );
}
