import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATE_CODES, STATE_NAMES } from "@/lib/usStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Upload, MapPin, FileSpreadsheet, AlertCircle, CheckCircle2, X, Download, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";

// Geographic-ish grid layout (rows top→bottom). Each cell = state code.
const GRID: (string | null)[][] = [
  [null, null, null, null, null, null, null, null, null, null, "ME"],
  ["AK", null, null, null, null, null, null, null, null, "VT", "NH"],
  [null, "WA", "ID", "MT", "ND", "MN", "IL", "WI", "MI", "NY", "MA"],
  [null, "OR", "UT", "WY", "SD", "IA", "IN", "OH", "PA", "NJ", "CT"],
  [null, "CA", "NV", "CO", "NE", "MO", "KY", "WV", "VA", "MD", "RI"],
  [null, null, "AZ", "NM", "KS", "AR", "TN", "NC", "SC", "DE", null],
  ["HI", null, null, "TX", "OK", "LA", "MS", "AL", "GA", "DC", null],
  [null, null, null, null, null, null, null, null, "FL", null, null],
];

type Summary = { state: string; total_leads: number; total_unique_numbers: number; last_upload_at: string | null };
type UploadLog = { id: string; state: string; file_name: string | null; total_rows: number; inserted_count: number; duplicate_count: number; created_at: string };

type AuditSummary = {
  import_batch_id: string;
  file_name: string;
  state: string;
  total_rows: number;
  unique_numbers: number;
  malformed_blank: number;
  duplicates_in_file: number;
  duplicates_in_db: number;
  mobile_approved: number;
  landlines_rejected: number;
  voip_rejected: number;
  invalid_rejected: number;
  unknown_rejected: number;
  failed_lookups: number;
  cache_hits: number;
  new_lookups: number;
  estimated_cost_usd: number;
  rejected_sample?: any[];
  inserted?: number;
  rejected_total?: number;
};

type UploadJob = {
  id: string;
  state: string;
  file_name: string;
  file_size: number;
  file?: File; // kept in memory until user confirms save
  uploadPct: number;
  phase: "uploading" | "parsing" | "parsed" | "normalizing" | "deduping" | "looking_up" | "filtering" | "audited" | "saving" | "complete" | "error";
  message?: string;
  total_rows?: number;
  to_lookup?: number;
  cache_hits?: number;
  new_lookups?: number;
  inserted?: number;
  duplicates?: number;
  audit?: AuditSummary;
  finishedAt?: number;
};

export default function UsaMap() {
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const [openState, setOpenState] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, UploadJob>>({});
  const channelsRef = useRef<Record<string, ReturnType<typeof supabase.channel>>>({});
  const [exportPrompt, setExportPrompt] = useState<string | null>(null);

  const loadAll = async () => {
    const [sumRes, logRes] = await Promise.all([
      supabase.from("state_summary").select("*"),
      supabase.from("upload_logs").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    if (sumRes.data) {
      const map: Record<string, Summary> = {};
      for (const r of sumRes.data as Summary[]) map[r.state] = r;
      setSummary(map);
    }
    if (logRes.data) setLogs(logRes.data as UploadLog[]);
  };

  useEffect(() => { loadAll(); }, []);

  const updateJob = (id: string, patch: Partial<UploadJob>) =>
    setJobs((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));

  const startUpload = async (file: File, state: string, confirmed = false, existingId?: string, existingBatch?: string) => {
    const id = existingId ?? ((crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    const importBatchId = existingBatch ?? ((crypto as any).randomUUID?.() ?? `${Date.now()}`);

    if (!existingId) {
      setJobs((prev) => ({
        ...prev,
        [id]: {
          id, state, file_name: file.name, file_size: file.size, file,
          uploadPct: 0, phase: "uploading", message: "Uploading file…",
        },
      }));
    } else {
      updateJob(id, { phase: "saving", message: "Saving approved mobile leads…", uploadPct: 0 });
    }

    const channel = supabase.channel(`audit:${id}`, { config: { broadcast: { self: true } } });
    channelsRef.current[id] = channel;
    const cleanup = () => {
      const ch = channelsRef.current[id];
      if (ch) { supabase.removeChannel(ch); delete channelsRef.current[id]; }
    };
    channel
      .on("broadcast", { event: "status" }, ({ payload }) => updateJob(id, payload as any))
      .on("broadcast", { event: "progress" }, ({ payload }) => updateJob(id, payload as any))
      .on("broadcast", { event: "audit" }, ({ payload }) => {
        updateJob(id, { audit: (payload as any).audit, phase: "audited" });
      })
      .on("broadcast", { event: "complete" }, ({ payload }) => {
        const p = payload as any;
        if (p.saved) {
          updateJob(id, { ...p, phase: "complete", finishedAt: Date.now(), inserted: p.inserted });
          toast.success(`${state}: saved ${p.inserted ?? 0} mobile leads`);
          loadAll();
          cleanup();
        } else {
          updateJob(id, { audit: p.audit, phase: "audited" });
        }
      })
      .on("broadcast", { event: "error" }, ({ payload }) => {
        updateJob(id, { phase: "error", message: (payload as any)?.message, finishedAt: Date.now() });
        toast.error(`${state} failed: ${(payload as any)?.message ?? "error"}`);
        cleanup();
      });
    await new Promise<void>((resolve) => channel.subscribe((status) => { if (status === "SUBSCRIBED") resolve(); }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-uploaded-phone-numbers`;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("selected_state", state);
      fd.append("progress_id", id);
      fd.append("import_batch_id", importBatchId);
      fd.append("confirmed", confirmed ? "true" : "false");

      await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
        if (session) xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            updateJob(id, { uploadPct: pct, phase: pct >= 100 ? "parsing" : "uploading" });
          }
        };
        xhr.onload = () => {
          try {
            const body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            if (xhr.status >= 200 && xhr.status < 300) resolve(body);
            else reject(new Error(body.error || `Upload failed (${xhr.status})`));
          } catch (e) { reject(e); }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
      });

      updateJob(id, { phase: "parsing", message: "Server processing…", uploadPct: 100 });
    } catch (e: any) {
      toast.error(`${state} failed: ${e.message}`);
      updateJob(id, { phase: "error", message: e.message, finishedAt: Date.now() });
      cleanup();
    }
  };

  const confirmSaveJob = (id: string) => {
    const j = jobs[id];
    if (!j?.file || !j.audit) return;
    startUpload(j.file, j.state, true, id, j.audit.import_batch_id);
  };

  const dismissJob = (id: string) =>
    setJobs((prev) => { const next = { ...prev }; delete next[id]; return next; });

  const exportStateCsv = async (state: string, batchSize = 3000) => {
    const tid = toast.loading(`Exporting ${state}…`);
    try {
      const pageSize = 1000;
      let from = 0;
      const rows: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("state_leads")
          .select("first_name,name,phone_e164,phone_number,office_phone,email")
          .eq("state", state)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      if (!rows.length) { toast.dismiss(tid); toast.error(`No leads for ${state}`); return; }

      const esc = (v: any) => {
        const s = (v ?? "").toString();
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = "first_name,last_name,phone_number,email";
      const toLine = (r: any) => {
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
        const phone = r.office_phone || "";
        return [esc(first), esc(last), esc(phone), esc(r.email)].join(",");
      };

      const today = new Date().toISOString().slice(0, 10);
      const totalBatches = Math.ceil(rows.length / batchSize);

      if (totalBatches <= 1) {
        const csv = [header, ...rows.map(toLine)].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${state}_leads_${today}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (let i = 0; i < totalBatches; i++) {
          const slice = rows.slice(i * batchSize, (i + 1) * batchSize);
          const csv = [header, ...slice.map(toLine)].join("\n");
          const dayNum = i + 1;
          zip.folder(`day_${dayNum}`)!.file(`${state}_day_${dayNum}.csv`, csv);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${state}_leads_${today}_${totalBatches}days.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }

      toast.dismiss(tid);
      toast.success(
        totalBatches > 1
          ? `${state}: exported ${rows.length.toLocaleString()} leads across ${totalBatches} day batches`
          : `${state}: exported ${rows.length.toLocaleString()} leads`,
      );
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(`Export failed: ${e.message}`);
    }
  };

  const maxLeads = useMemo(() => {
    const vals = Object.values(summary).map((s) => s.total_leads);
    return Math.max(1, ...vals);
  }, [summary]);

  const colorFor = (code: string) => {
    const v = summary[code]?.total_leads ?? 0;
    if (v === 0) return "hsl(var(--muted))";
    const intensity = 0.18 + (v / maxLeads) * 0.72;
    return `hsl(142 76% ${Math.max(20, 60 - intensity * 35)}%)`;
  };

  const totalAll = useMemo(() => Object.values(summary).reduce((a, s) => a + s.total_leads, 0), [summary]);
  const totalDupes = useMemo(() => logs.reduce((a, l) => a + l.duplicate_count, 0), [logs]);
  const ranked = useMemo(
    () => Object.values(summary).sort((a, b) => b.total_leads - a.total_leads).slice(0, 10),
    [summary],
  );

  const jobList = Object.values(jobs).sort((a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
  const activeJobsByState = useMemo(() => {
    const map: Record<string, UploadJob[]> = {};
    for (const j of jobList) {
      if (j.phase === "complete" || j.phase === "error") continue;
      (map[j.state] ||= []).push(j);
    }
    return map;
  }, [jobList]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <main className="flex-1 p-6 space-y-6 overflow-auto">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" /> US Lead Map Manager
            </h1>
            <p className="text-sm text-muted-foreground">Click any state to upload and manage its lead list. Uploads keep running even if you close the popup.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Stat label="Total Leads" value={totalAll.toLocaleString()} />
            <Stat label="Unique Numbers" value={totalAll.toLocaleString()} />
            <Stat label="Duplicates Prevented" value={totalDupes.toLocaleString()} />
          </div>
        </header>


        {/* Map */}
        <Card className="p-6 relative">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${GRID[0].length}, minmax(0, 1fr))` }}>
            {GRID.flatMap((row, r) =>
              row.map((code, c) => {
                if (!code) return <div key={`${r}-${c}`} />;
                const s = summary[code];
                const busy = (activeJobsByState[code]?.length ?? 0) > 0;
                return (
                  <button
                    key={code}
                    onClick={() => setOpenState(code)}
                    onMouseEnter={(e) => setHover({ code, x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => setHover({ code, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHover(null)}
                    className="aspect-[4/3] rounded-md border border-border/40 text-xs font-semibold text-foreground/90 transition hover:scale-105 hover:ring-2 hover:ring-primary hover:z-10 relative"
                    style={{ background: colorFor(code) }}
                  >
                    {code}
                    {busy && (
                      <Loader2 className="absolute top-0.5 right-0.5 h-3 w-3 animate-spin text-primary" />
                    )}
                    {s && s.total_leads > 0 && (
                      <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-background/90">
                        {s.total_leads >= 1000 ? `${Math.round(s.total_leads / 100) / 10}k` : s.total_leads}
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>

          {hover && (
            <div
              className="fixed z-50 pointer-events-none rounded-md bg-popover text-popover-foreground border border-border px-3 py-2 text-xs shadow-lg"
              style={{ left: hover.x + 14, top: hover.y + 14 }}
            >
              <div className="font-semibold">{STATE_NAMES[hover.code]}</div>
              <div className="text-muted-foreground">
                Leads: <span className="text-foreground font-medium">{summary[hover.code]?.total_leads ?? 0}</span>
              </div>
              {summary[hover.code]?.last_upload_at && (
                <div className="text-muted-foreground">
                  Last upload: {new Date(summary[hover.code]!.last_upload_at!).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Lower panels */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Top States by Leads</h2>
            {ranked.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uploads yet.</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {ranked.map((s, i) => (
                  <li key={s.state} className="flex justify-between border-b border-border/30 py-1">
                    <span><span className="text-muted-foreground mr-2">#{i + 1}</span>{STATE_NAMES[s.state] ?? s.state}</span>
                    <span className="font-mono">{s.total_leads.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-3">Recent Uploads</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uploads yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-2 border-b border-border/30 pb-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{l.file_name || "upload"}</div>
                      <div className="text-xs text-muted-foreground">
                        {STATE_NAMES[l.state] ?? l.state} · {new Date(l.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-right whitespace-nowrap">
                      <div className="text-emerald-500">+{l.inserted_count}</div>
                      <div className="text-amber-500">{l.duplicate_count} dup</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>

      {openState && (
        <StateModal
          state={openState}
          summary={summary[openState]}
          jobs={jobList.filter((j) => j.state === openState)}
          onClose={() => setOpenState(null)}
          onStartUpload={(f) => startUpload(f, openState)}
          onDismissJob={dismissJob}
          onExport={() => setExportPrompt(openState)}
        />
      )}

      {/* Floating uploads tray (persists when modal closed) */}
      {jobList.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-80 space-y-2">
          {jobList.slice(-5).map((j) => (
            <UploadCard key={j.id} job={j} onDismiss={() => dismissJob(j.id)} />
          ))}
        </div>
      )}

      {exportPrompt && (
        <Dialog open onOpenChange={(o) => !o && setExportPrompt(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Export {STATE_NAMES[exportPrompt] ?? exportPrompt} Leads</DialogTitle>
              <DialogDescription>
                Choose how you want to download the CSV. Total leads: {(summary[exportPrompt]?.total_leads ?? 0).toLocaleString()}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button
                onClick={() => { const s = exportPrompt; setExportPrompt(null); exportStateCsv(s, 3000); }}
              >
                <Download className="h-4 w-4 mr-2" /> Split by Day (3,000 / day, ZIP)
              </Button>
              <Button
                variant="outline"
                onClick={() => { const s = exportPrompt; setExportPrompt(null); exportStateCsv(s, Infinity); }}
              >
                <Download className="h-4 w-4 mr-2" /> Full Batch (single CSV)
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function UploadCard({ job, onDismiss, onConfirmSave, onCancel }: { job: UploadJob; onDismiss: () => void; onConfirmSave?: () => void; onCancel?: () => void }) {
  const isDone = job.phase === "complete";
  const isError = job.phase === "error";
  const isAudited = job.phase === "audited";
  const pct = job.uploadPct ?? 0;

  return (
    <div className={`rounded-lg border p-3 shadow-lg backdrop-blur bg-card/95 ${isError ? "border-destructive/40" : isDone ? "border-emerald-500/40" : isAudited ? "border-amber-500/40" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            {isDone ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              : isError ? <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              : isAudited ? <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
              : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            {job.state} · <span className="truncate">{job.file_name}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">
            {isDone ? "Complete" : isError ? `Error: ${job.message ?? "failed"}` : `${job.phase.replace(/_/g, " ")}${job.message ? ` — ${job.message}` : ""}`}
          </div>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>

      {!isError && !isAudited && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-border">
          <div
            className={`h-full transition-all ${isDone ? "bg-emerald-500" : "bg-primary"}`}
            style={{ width: `${isDone ? 100 : Math.min(100, pct)}%` }}
          />
        </div>
      )}

      {isAudited && job.audit && onConfirmSave && (
        <div className="mt-2 space-y-1.5 text-[11px]">
          <div className="grid grid-cols-2 gap-1">
            <div>📱 Mobile: <strong className="text-emerald-500">{job.audit.mobile_approved}</strong></div>
            <div>☎️ Landline: <strong className="text-amber-500">{job.audit.landlines_rejected}</strong></div>
            <div>🌐 VoIP: <strong className="text-amber-500">{job.audit.voip_rejected}</strong></div>
            <div>❌ Invalid: <strong className="text-destructive">{job.audit.invalid_rejected}</strong></div>
            <div>❓ Unknown: <strong>{job.audit.unknown_rejected}</strong></div>
            <div>🔁 Dupes: <strong>{job.audit.duplicates_in_file + job.audit.duplicates_in_db}</strong></div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            New lookups: {job.audit.new_lookups} · Cache hits: {job.audit.cache_hits} · Cost: ${job.audit.estimated_cost_usd.toFixed(3)}
          </div>
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-[11px] flex-1" onClick={onConfirmSave}>
              <ShieldCheck className="h-3 w-3 mr-1" /> Save {job.audit.mobile_approved} Mobile
            </Button>
            {onCancel && <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={onCancel}>Cancel</Button>}
          </div>
        </div>
      )}

      {(isDone || job.inserted != null) && !isAudited && (
        <div className="text-[10px] text-muted-foreground mt-1">
          +{(job.inserted ?? 0).toLocaleString()} mobile saved · {(job.audit?.rejected_total ?? 0).toLocaleString()} rejected
        </div>
      )}
    </div>
  );
}

function StateModal({
  state, summary, jobs, onClose, onStartUpload, onDismissJob, onExport,
}: {
  state: string;
  summary?: Summary;
  jobs: UploadJob[];
  onClose: () => void;
  onStartUpload: (file: File) => void;
  onDismissJob: (id: string) => void;
  onExport: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) { toast.error("Please upload a CSV or Excel file"); return; }
    setFile(f);
  };

  const handleUpload = () => {
    if (!file) return;
    onStartUpload(file);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {STATE_NAMES[state] ?? state}
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to add leads. You can close this popup — uploads keep running in the background.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Total Leads" value={(summary?.total_leads ?? 0).toLocaleString()} />
          <Stat label="Unique #s" value={(summary?.total_unique_numbers ?? 0).toLocaleString()} />
          <Stat label="Last Upload" value={summary?.last_upload_at ? new Date(summary.last_upload_at).toLocaleDateString() : "—"} />
        </div>

        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/50"}`}
          >
            <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">{file ? file.name : "Drag & drop CSV/Excel here"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {file ? `${Math.round(file.size / 1024)} KB · click to change` : "or click to browse"}
            </p>
            <Input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => acceptFile(e.target.files?.[0])}
              className="hidden"
            />
          </div>

          <div className="text-xs text-muted-foreground space-y-1 rounded-md bg-muted/40 p-3">
            <div className="flex items-center gap-1.5"><AlertCircle className="h-3 w-3" /> <strong>Required column:</strong> phone_number</div>
            <div><strong>Optional:</strong> name, address, city, zip, email</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleUpload} disabled={!file}>
              <Upload className="h-4 w-4 mr-2" /> Start Upload
            </Button>
            <Button variant="outline" onClick={onExport} disabled={!summary?.total_leads}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>

          {jobs.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Uploads for {STATE_NAMES[state] ?? state}
              </div>
              {jobs.map((j) => (
                <UploadCard key={j.id} job={j} onDismiss={() => onDismissJob(j.id)} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
