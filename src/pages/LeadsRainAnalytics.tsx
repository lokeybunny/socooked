import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, Activity, AlertTriangle, CheckCircle2, RadioTower } from "lucide-react";
import { type LRCampaignRow, type LRSnapshot, type LRSyncLog, statusStyle, timeAgo, formatPct } from "@/lib/leadsrainAnalytics";

const REFRESH_FALLBACK_MS = 45_000;

export default function LeadsRainAnalytics() {
  const [campaigns, setCampaigns] = useState<LRCampaignRow[]>([]);
  const [logs, setLogs] = useState<LRSyncLog[]>([]);
  const [config, setConfig] = useState<{ enabled: boolean; interval_minutes: number; last_run_at: string | null; next_run_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<LRCampaignRow | null>(null);
  const [snapshots, setSnapshots] = useState<LRSnapshot[]>([]);
  const [, setTick] = useState(0);

  const loadAll = async () => {
    const [c, l, cfg] = await Promise.all([
      supabase.from("lr_campaigns" as any).select("*").order("last_synced_at", { ascending: false }),
      supabase.from("lr_sync_logs" as any).select("*").order("started_at", { ascending: false }).limit(50),
      supabase.from("lr_sync_config" as any).select("*").eq("id", 1).maybeSingle(),
    ]);
    setCampaigns((c.data as any) || []);
    setLogs((l.data as any) || []);
    setConfig((cfg.data as any) || { enabled: true, interval_minutes: 5, last_run_at: null, next_run_at: null });
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Realtime + fallback poll + 1s tick for "Xs ago" labels
  useEffect(() => {
    const ch = supabase
      .channel("lr-analytics")
      .on("postgres_changes", { event: "*", schema: "public", table: "lr_campaigns" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "lr_sync_logs" }, loadAll)
      .subscribe();
    const i = setInterval(loadAll, REFRESH_FALLBACK_MS);
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => { supabase.removeChannel(ch); clearInterval(i); clearInterval(t); };
  }, []);

  // Load snapshots when a campaign is selected
  useEffect(() => {
    if (!selected) { setSnapshots([]); return; }
    supabase
      .from("lr_campaign_snapshots" as any)
      .select("snapshot_at, processed_count, delivered_count, failed_count, remaining_count")
      .eq("campaign_id", selected.campaign_id)
      .order("snapshot_at", { ascending: true })
      .limit(200)
      .then(({ data }) => setSnapshots((data as any) || []));
  }, [selected?.campaign_id]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("leadsrain-poll-now", { body: {} });
      if (error) throw error;
      toast.success(`Sync complete — ${data?.seen ?? 0} campaigns seen, ${data?.changed ?? 0} updated`);
      loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const updateConfig = async (patch: { enabled?: boolean; interval_minutes?: number }) => {
    const { data, error } = await supabase.functions.invoke("leadsrain-sync-config", { body: patch });
    if (error) { toast.error("Could not save settings"); return; }
    setConfig(data as any);
    toast.success("Settings saved");
  };

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter !== "all" && (c.status || "unknown") !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (c.campaign_name || "").toLowerCase().includes(q) || c.campaign_id.toLowerCase().includes(q);
    });
  }, [campaigns, search, statusFilter]);

  const metrics = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sum = (k: keyof LRCampaignRow) => campaigns.reduce((a, c) => a + (Number(c[k] as any) || 0), 0);
    const completedToday = campaigns.filter((c) => c.status === "completed" && c.last_synced_at && new Date(c.last_synced_at) >= today).length;
    const lastSync = logs[0];
    return {
      total: campaigns.length,
      active: campaigns.filter((c) => c.status === "active").length,
      completedToday,
      failed: campaigns.filter((c) => c.status === "failed" || c.status === "cancelled").length,
      processed: sum("processed_leads"),
      delivered: sum("delivered_leads"),
      avgPct: campaigns.length ? campaigns.reduce((a, c) => a + (c.completion_percentage || 0), 0) / campaigns.length : 0,
      apiHealth: lastSync?.status === "success" ? "Healthy" : lastSync?.status === "failed" ? "Down" : "Unknown",
      lastSyncIso: lastSync?.started_at || config?.last_run_at || null,
    };
  }, [campaigns, logs, config]);

  const alerts = useMemo(() => {
    const out: { kind: "danger" | "warn"; msg: string }[] = [];
    const failed = campaigns.filter((c) => c.status === "failed");
    if (failed.length) out.push({ kind: "danger", msg: `${failed.length} failed campaign${failed.length === 1 ? "" : "s"}` });
    const stuck = campaigns.filter((c) => c.status === "active" && c.last_synced_at && Date.now() - new Date(c.last_synced_at).getTime() > 30 * 60 * 1000 && c.completion_percentage < 100);
    if (stuck.length) out.push({ kind: "warn", msg: `${stuck.length} stuck campaign${stuck.length === 1 ? "" : "s"} (no progress 30m+)` });
    const recentFails = logs.filter((l) => l.status === "failed" && Date.now() - new Date(l.started_at).getTime() < 60 * 60 * 1000).length;
    if (recentFails) out.push({ kind: "danger", msg: `${recentFails} sync failure${recentFails === 1 ? "" : "s"} in last hour` });
    return out;
  }, [campaigns, logs]);

  const statusOptions = ["all", "active", "completed", "paused", "queued", "failed", "cancelled", "unknown"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <RadioTower className="w-7 h-7 text-lime-400" />
              LeadsRain Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Live campaign operations monitor — polling every {config?.interval_minutes ?? 5} min.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`inline-block w-2 h-2 rounded-full ${config?.enabled ? "bg-lime-400 animate-pulse" : "bg-slate-500"}`} />
              Last sync: <span className="text-foreground font-medium">{timeAgo(metrics.lastSyncIso)}</span>
            </div>
            <Select value={String(config?.interval_minutes ?? 5)} onValueChange={(v) => updateConfig({ interval_minutes: Number(v) })}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Every 1 min</SelectItem>
                <SelectItem value="5">Every 5 min</SelectItem>
                <SelectItem value="15">Every 15 min</SelectItem>
                <SelectItem value="30">Every 30 min</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch checked={config?.enabled ?? true} onCheckedChange={(v) => updateConfig({ enabled: v })} />
              <span className="text-xs text-muted-foreground">Polling</span>
            </div>
            <Button onClick={syncNow} disabled={syncing} className="bg-lime-500 hover:bg-lime-400 text-black font-semibold">
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sync Now
            </Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Metric label="Total" value={metrics.total} />
          <Metric label="Active" value={metrics.active} accent="lime" />
          <Metric label="Completed Today" value={metrics.completedToday} accent="green" />
          <Metric label="Failed" value={metrics.failed} accent="red" />
          <Metric label="Leads Processed" value={metrics.processed.toLocaleString()} />
          <Metric label="Voicemails Sent" value={metrics.delivered.toLocaleString()} />
          <Metric label="Avg Completion" value={formatPct(metrics.avgPct)} />
          <Metric label="API Health" value={metrics.apiHealth} accent={metrics.apiHealth === "Healthy" ? "green" : metrics.apiHealth === "Down" ? "red" : undefined} />
        </div>

        {/* Alerts */}
        <AnimatePresence>
          {alerts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
              {alerts.map((a, i) => (
                <Card key={i} className={a.kind === "danger" ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"}>
                  <CardContent className="p-3 flex items-center gap-2 text-sm">
                    <AlertTriangle className={`w-4 h-4 ${a.kind === "danger" ? "text-red-400" : "text-amber-400"}`} />
                    {a.msg}
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search campaign name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {statusOptions.map((s) => (
              <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize text-xs h-7">
                {s} {s !== "all" && (
                  <span className="ml-1 opacity-60">{campaigns.filter((c) => (c.status || "unknown") === s).length}</span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Campaigns table */}
        <Card className="border-border/50 bg-card/60 backdrop-blur">
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                {campaigns.length === 0 ? "No campaigns synced yet — click Sync Now." : "No matches."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Processed</TableHead>
                    <TableHead className="text-right">Success%</TableHead>
                    <TableHead className="text-right">Failed%</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Last Update</TableHead>
                    <TableHead>ETA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const st = statusStyle(c.status);
                    const successPct = c.processed_leads > 0 ? (c.delivered_leads / c.processed_leads) * 100 : 0;
                    const failPct = c.processed_leads > 0 ? (c.failed_leads / c.processed_leads) * 100 : 0;
                    return (
                      <motion.tr
                        key={c.campaign_id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="cursor-pointer hover:bg-accent/40 border-b transition-colors"
                        onClick={() => setSelected(c)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {c.campaign_name || "Untitled"}
                          </div>
                          <div className="mt-1 h-1 w-32 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-lime-400" style={{ width: `${c.completion_percentage}%` }} />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono opacity-70">#{c.campaign_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{c.total_leads.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{c.processed_leads.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-green-400">{formatPct(successPct)}</TableCell>
                        <TableCell className="text-right text-red-400">{formatPct(failPct)}</TableCell>
                        <TableCell className="text-right">{c.remaining_leads.toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{c.started_at ? new Date(c.started_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-xs">{timeAgo(c.last_synced_at)}</TableCell>
                        <TableCell className="text-xs">
                          {c.estimated_completion_at ? new Date(c.estimated_completion_at).toLocaleString() : "—"}
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Sync history */}
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex items-center gap-2">
              <Activity className="w-4 h-4 text-lime-400" />
              <h2 className="font-semibold">Polling Activity</h2>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Seen</TableHead>
                    <TableHead className="text-right">Changed</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{new Date(l.started_at).toLocaleString()}</TableCell>
                      <TableCell>
                        {l.status === "success" ? (
                          <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />success</span>
                        ) : (
                          <span className="text-red-400 text-xs">{l.status}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">{l.duration_ms ? `${l.duration_ms}ms` : "—"}</TableCell>
                      <TableCell className="text-right text-xs">{l.campaigns_seen}</TableCell>
                      <TableCell className="text-right text-xs">{l.campaigns_changed}</TableCell>
                      <TableCell className="text-xs text-red-400 max-w-[400px] truncate">{l.error || ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${statusStyle(selected.status).dot}`} />
                  {selected.campaign_name}
                </SheetTitle>
                <p className="text-xs text-muted-foreground font-mono">#{selected.campaign_id}</p>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Total" value={selected.total_leads.toLocaleString()} />
                  <Metric label="Processed" value={selected.processed_leads.toLocaleString()} />
                  <Metric label="Delivered" value={selected.delivered_leads.toLocaleString()} accent="green" />
                  <Metric label="Failed" value={selected.failed_leads.toLocaleString()} accent="red" />
                  <Metric label="Remaining" value={selected.remaining_leads.toLocaleString()} />
                  <Metric label="Completion" value={formatPct(selected.completion_percentage)} accent="lime" />
                </div>

                <Card>
                  <CardContent className="p-4">
                    <div className="text-xs font-medium mb-3 text-muted-foreground">Processing Trend</div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={snapshots.map((s) => ({ t: new Date(s.snapshot_at).toLocaleTimeString(), processed: s.processed_count, delivered: s.delivered_count, failed: s.failed_count }))}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="processed" stroke="hsl(85 85% 50%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="delivered" stroke="hsl(140 70% 50%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="failed" stroke="hsl(0 80% 60%)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-xs space-y-1">
                    <div><span className="text-muted-foreground">Caller ID:</span> {selected.caller_id || "—"}</div>
                    <div><span className="text-muted-foreground">List ID:</span> {selected.list_id || "—"}</div>
                    <div><span className="text-muted-foreground">Started:</span> {selected.started_at ? new Date(selected.started_at).toLocaleString() : "—"}</div>
                    <div><span className="text-muted-foreground">Last Sync:</span> {timeAgo(selected.last_synced_at)}</div>
                    <div><span className="text-muted-foreground">ETA:</span> {selected.estimated_completion_at ? new Date(selected.estimated_completion_at).toLocaleString() : "—"}</div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: any; accent?: "lime" | "green" | "red" }) {
  const accentCls =
    accent === "lime" ? "text-lime-400" :
    accent === "green" ? "text-green-400" :
    accent === "red" ? "text-red-400" : "";
  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur">
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${accentCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
