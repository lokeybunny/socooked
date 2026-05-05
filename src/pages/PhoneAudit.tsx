import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Phone, Play, Pause, Trash2, Download, RefreshCw } from "lucide-react";

type Job = {
  id: string;
  status: string;
  total: number;
  processed: number;
  mobile: number;
  landline: number;
  voip: number;
  invalid: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
};

type Preview = {
  total_leads: number;
  need_audit: number;
  cache_ready: number;
  estimated_cost_usd: number;
};

export default function PhoneAudit() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadPreview = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("audit-existing-phone-numbers", {
      body: { action: "preview" },
    });
    if (error) toast.error(error.message);
    else setPreview(data as Preview);
  }, []);

  const loadLatestJob = useCallback(async () => {
    const { data } = await supabase
      .from("phone_audit_jobs")
      .select("*")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data) setJob(data as Job);
  }, []);

  useEffect(() => {
    loadPreview();
    loadLatestJob();
  }, [loadPreview, loadLatestJob]);

  // Poll while running
  useEffect(() => {
    if (job?.status !== "running") return;
    const id = setInterval(() => loadLatestJob(), 3000);
    return () => clearInterval(id);
  }, [job?.status, loadLatestJob]);

  const callAudit = async (action: string) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action };
      if (job?.id && (action === "pause" || action === "resume" || action === "status")) {
        body.job_id = job.id;
      }
      const { data, error } = await supabase.functions.invoke("audit-existing-phone-numbers", { body });
      if (error) throw error;
      toast.success(`Action: ${action}`);
      await loadLatestJob();
      await loadPreview();
      return data;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const onStart = async () => {
    if (!preview) return;
    const ok = window.confirm(
      `Start audit?\n\nLeads needing lookup: ${preview.need_audit}\nEstimated Twilio cost: $${preview.estimated_cost_usd}\n\nContinue?`,
    );
    if (!ok) return;
    await callAudit("start");
  };

  const onDeleteNonMobile = async () => {
    const dry = await supabase.functions.invoke("delete-non-mobile-leads", { body: { dry_run: true } });
    if (dry.error) return toast.error(dry.error.message);
    const count = (dry.data as { would_move: number })?.would_move ?? 0;
    if (!window.confirm(`Move ${count} non-mobile leads to rejected_leads and delete them from state_leads?`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-non-mobile-leads", {
        body: { confirm: true },
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
        headers
          .map((h) => {
            const v = (r as Record<string, unknown>)[h];
            const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(","),
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Leads</div>
          <div className="text-2xl font-bold">{preview?.total_leads ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Need Audit</div>
          <div className="text-2xl font-bold">{preview?.need_audit ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Cached Lookups</div>
          <div className="text-2xl font-bold">{preview?.cache_ready ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Est. Twilio Cost</div>
          <div className="text-2xl font-bold">${preview?.estimated_cost_usd ?? "0.00"}</div>
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Audit Job</h2>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {job?.status ?? "no job yet"}
          </span>
        </div>

        {job && (
          <div className="space-y-2">
            <div className="h-2 w-full bg-muted rounded">
              <div className="h-2 bg-primary rounded transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-sm text-muted-foreground">
              {job.processed} / {job.total} processed ({pct}%)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <Stat label="Mobile" value={job.mobile} tone="text-emerald-500" />
              <Stat label="Landline" value={job.landline} tone="text-yellow-500" />
              <Stat label="VoIP" value={job.voip} tone="text-orange-500" />
              <Stat label="Invalid" value={job.invalid} tone="text-red-500" />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {(!job || job.status === "completed" || job.status === "failed") && (
            <Button onClick={onStart} disabled={loading || !preview?.need_audit}>
              <Play className="h-4 w-4 mr-2" /> Start Audit
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
          <Button variant="outline" onClick={exportRejected}>
            <Download className="h-4 w-4 mr-2" /> Export Rejected CSV
          </Button>
          <Button variant="destructive" onClick={onDeleteNonMobile} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete Non-Mobile
          </Button>
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
