import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATE_CODES, STATE_NAMES } from "@/lib/usStates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Upload, MapPin, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
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

export default function UsaMap() {
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const [openState, setOpenState] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <main className="flex-1 p-6 space-y-6 overflow-auto">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" /> US Lead Map Manager
            </h1>
            <p className="text-sm text-muted-foreground">Click any state to upload and manage its lead list.</p>
          </div>
          <div className="flex gap-3 text-sm">
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
          onClose={() => setOpenState(null)}
          onUploaded={async () => { await loadAll(); }}
        />
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

function StateModal({
  state, summary, onClose, onUploaded,
}: {
  state: string;
  summary?: Summary;
  onClose: () => void;
  onUploaded: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ total_rows: number; inserted_count: number; duplicate_count: number; lgm_checked?: number; lgm_rejected?: number; lgm_enriched?: number; lgm_enabled?: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("selected_state", state);
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-state-upload`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setResult(json);
      const lgmMsg = json.lgm_enabled ? ` · LGM rejected ${json.lgm_rejected ?? 0}` : "";
      toast.success(`Inserted ${json.inserted_count}, skipped ${json.duplicate_count} duplicates${lgmMsg}`);
      await onUploaded();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {STATE_NAMES[state] ?? state}
          </DialogTitle>
          <DialogDescription>Upload a CSV or Excel file to add leads to this state.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Total Leads" value={(summary?.total_leads ?? 0).toLocaleString()} />
          <Stat label="Unique #s" value={(summary?.total_unique_numbers ?? 0).toLocaleString()} />
          <Stat label="Last Upload" value={summary?.last_upload_at ? new Date(summary.last_upload_at).toLocaleDateString() : "—"} />
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
            <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <Input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              className="cursor-pointer"
            />
            {file && <p className="text-xs text-muted-foreground mt-2">{file.name} ({Math.round(file.size / 1024)} KB)</p>}
          </div>

          <div className="text-xs text-muted-foreground space-y-1 rounded-md bg-muted/40 p-3">
            <div className="flex items-center gap-1.5"><AlertCircle className="h-3 w-3" /> <strong>Required column:</strong> phone_number</div>
            <div><strong>Optional:</strong> name, address, city, zip, email</div>
            <div className="text-emerald-500">Auto-cleaned via La Growth Machine before insert.</div>
          </div>

          <Button onClick={handleUpload} disabled={!file || uploading} className="w-full">
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…</> : <><Upload className="h-4 w-4 mr-2" /> Upload Leads</>}
          </Button>

          {result && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-500"><CheckCircle2 className="h-4 w-4" /> Upload complete</div>
              <div>Total rows processed: <strong>{result.total_rows}</strong></div>
              <div>Inserted: <strong className="text-emerald-500">{result.inserted_count}</strong></div>
              <div>Duplicates skipped: <strong className="text-amber-500">{result.duplicate_count}</strong></div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
