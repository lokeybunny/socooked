import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Loader2, RefreshCw, Search, AlertTriangle, RadioTower, Send,
  RotateCw, MessageSquare, Download, Info, Settings as SettingsIcon,
} from "lucide-react";
import {
  type LRSubmissionRow, submissionStatusStyle, timeAgo, exportSubmissionsCsv,
} from "@/lib/leadsrainAnalytics";

const REFRESH_MS = 20_000;

export default function LeadsRainAnalytics() {
  const [rows, setRows] = useState<LRSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<LRSubmissionRow | null>(null);
  const [apiHealth, setApiHealth] = useState<"Healthy" | "Down" | "Checking">("Checking");
  const [busy, setBusy] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultListId, setDefaultListId] = useState("");
  const [defaultCallerId, setDefaultCallerId] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadSettings = async () => {
    const { data } = await supabase.from("leadsrain_settings" as any).select("default_list_id, default_caller_id").limit(1).maybeSingle();
    setDefaultListId(((data as any)?.default_list_id) || "");
    setDefaultCallerId(((data as any)?.default_caller_id) || "");
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const { data: existing } = await supabase.from("leadsrain_settings" as any).select("id").limit(1).maybeSingle();
    const payload = { default_list_id: defaultListId.trim() || null, default_caller_id: defaultCallerId.trim() || null };
    if ((existing as any)?.id) {
      await supabase.from("leadsrain_settings" as any).update(payload).eq("id", (existing as any).id);
    } else {
      await supabase.from("leadsrain_settings" as any).insert(payload);
    }
    setSavingSettings(false);
    setSettingsOpen(false);
    toast.success("Settings saved");
  };

  const loadAll = async () => {
    const { data } = await supabase
      .from("leadsrain_submissions" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows(((data as any) || []) as LRSubmissionRow[]);
    setLoading(false);
  };

  const checkHealth = async () => {
    // Health = success rate of recent submissions in last hour
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("leadsrain_submissions" as any)
      .select("status, created_at")
      .gte("created_at", cutoff);
    const recent = (data as any[]) || [];
    if (recent.length === 0) { setApiHealth("Checking"); return; }
    const failed = recent.filter((r) => r.status === "failed_to_submit").length;
    setApiHealth(failed / recent.length > 0.5 ? "Down" : "Healthy");
  };

  useEffect(() => { loadAll(); checkHealth(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("lr-submissions")
      .on("postgres_changes", { event: "*", schema: "public", table: "leadsrain_submissions" }, () => {
        loadAll(); checkHealth();
      })
      .subscribe();
    const i = setInterval(() => { loadAll(); checkHealth(); }, REFRESH_MS);
    return () => { supabase.removeChannel(ch); clearInterval(i); };
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.campaign_name || "").toLowerCase().includes(q) ||
      r.phone_number.toLowerCase().includes(q) ||
      (r.caller_id || "").toLowerCase().includes(q)
    );
  }), [rows, search, statusFilter]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const accepted = rows.filter((r) => r.status === "accepted_by_api" || r.status === "sms_followup_sent").length;
    const failed = rows.filter((r) => r.status === "failed_to_submit").length;
    const sms = rows.filter((r) => r.voidfix_sms_sent).length;
    const last = rows[0]?.created_at || null;
    return { total, accepted, failed, sms, last };
  }, [rows]);

  const statusOptions = ["all", "submitted_to_leadsrain", "accepted_by_api", "sms_followup_sent", "failed_to_submit", "draft"];

  const sendTest = async () => {
    const phone = testPhone.trim();
    if (!phone) { toast.error("Enter a 10-digit US phone"); return; }
    setBusy("test");
    try {
      const { data, error } = await supabase.functions.invoke("leadsrain-submit-lead", {
        body: { phone_number: phone, campaign_name: "Test Voice Drop", send_voidfix: true },
      });
      if (error) throw error;
      const ok = (data as any)?.ok;
      ok ? toast.success("Test submission sent") : toast.error((data as any)?.error || "Submission failed");
      loadAll();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(null); }
  };

  const retryFailed = async () => {
    const failed = rows.filter((r) => r.status === "failed_to_submit").slice(0, 25);
    if (!failed.length) { toast.info("No failed submissions to retry"); return; }
    setBusy("retry");
    let okCount = 0;
    for (const r of failed) {
      try {
        const { data } = await supabase.functions.invoke("leadsrain-submit-lead", {
          body: {
            phone_number: r.phone_number,
            caller_id: r.caller_id,
            campaign_name: r.campaign_name,
            audio_url: r.audio_url,
            lead_id: r.lead_id, contact_id: r.contact_id, customer_id: r.customer_id,
            send_voidfix: true,
          },
        });
        if ((data as any)?.ok) okCount++;
      } catch {}
    }
    toast.success(`Retried ${failed.length} • ${okCount} accepted`);
    setBusy(null);
    loadAll();
  };

  const triggerVoidfix = async () => {
    if (!selected) { toast.error("Open a submission first"); return; }
    setBusy("vf");
    try {
      const { data, error } = await supabase.functions.invoke("powerdial-sms", {
        body: {
          action: "send",
          to: selected.phone_number,
          body: "Hey, this is Warren — just left you a quick voicemail.",
          customer_id: selected.customer_id,
        },
      });
      if (error) throw error;
      await supabase.from("leadsrain_submissions" as any).update({
        voidfix_sms_sent: true,
        voidfix_sms_at: new Date().toISOString(),
        status: "sms_followup_sent",
      }).eq("id", selected.id);
      toast.success("VoidFix SMS sent");
      loadAll();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(null); }
  };

  const exportCsv = () => {
    const csv = exportSubmissionsCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leadsrain-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const healthColor = apiHealth === "Healthy" ? "green" : apiHealth === "Down" ? "red" : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-[1600px] mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <RadioTower className="w-7 h-7 text-lime-400" />
              LeadsRain Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              CRM-only mode — tracks voice drops submitted via the HTTPS Postlead endpoint.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="10-digit phone"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="w-[160px]"
            />
            <Button onClick={sendTest} disabled={busy === "test"} className="bg-lime-500 hover:bg-lime-400 text-black font-semibold">
              {busy === "test" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Test Voice Drop
            </Button>
            <Button variant="outline" onClick={retryFailed} disabled={busy === "retry"}>
              {busy === "retry" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCw className="w-4 h-4 mr-2" />}
              Retry Failed
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button variant="ghost" onClick={() => { loadAll(); checkHealth(); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* CRM-only banner */}
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-3 flex items-start gap-2 text-sm">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <strong>CRM-only mode is active.</strong> This dashboard tracks voice drops submitted by this CRM.
              Live LeadsRain campaign delivery stats require an external proxy/VPS because LeadsRain's campaign
              analytics API is served through HTTP-only s-shard endpoints unreachable from Supabase Edge Functions.
            </div>
          </CardContent>
        </Card>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Metric label="Total Submitted" value={metrics.total} />
          <Metric label="Accepted by API" value={metrics.accepted} accent="green" />
          <Metric label="Failed" value={metrics.failed} accent="red" />
          <Metric label="VoidFix SMS Sent" value={metrics.sms} accent="lime" />
          <Metric label="Last Submission" value={timeAgo(metrics.last)} />
          <Metric
            label="Submit API Health"
            value={apiHealth}
            accent={healthColor as any}
            sub={apiHealth === "Healthy"
              ? "HTTPS Postlead endpoint working"
              : apiHealth === "Down"
                ? "HTTPS Postlead endpoint failing"
                : "Limited Mode — campaign analytics unavailable"}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search phone, caller ID, campaign…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Submissions table */}
        <Card className="border-border/50 bg-card/60 backdrop-blur">
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                {rows.length === 0 ? "No voice drops submitted yet — try Send Test Voice Drop." : "No matches."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Caller ID</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>LR Lead ID</TableHead>
                    <TableHead>VoidFix SMS</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {filtered.map((r) => {
                      const st = submissionStatusStyle(r.status);
                      return (
                        <motion.tr
                          key={r.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="cursor-pointer hover:bg-accent/40 border-b transition-colors"
                          onClick={() => setSelected(r)}
                        >
                          <TableCell className="text-xs">{timeAgo(r.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={st.cls}>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${st.dot}`} />
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.phone_number}</TableCell>
                          <TableCell className="font-mono text-xs">{r.caller_id || "—"}</TableCell>
                          <TableCell className="text-xs">{r.campaign_name || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{r.leadsrain_lead_id || "—"}</TableCell>
                          <TableCell className="text-xs">{r.voidfix_sms_sent ? "✓" : "—"}</TableCell>
                          <TableCell className="text-xs text-red-400 max-w-[300px] truncate">{r.error_message || ""}</TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            )}
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
                  <span className={`inline-block w-2 h-2 rounded-full ${submissionStatusStyle(selected.status).dot}`} />
                  {selected.phone_number}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">{selected.campaign_name || "No campaign name"}</p>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <DetailRow label="Status" value={submissionStatusStyle(selected.status).label} />
                <DetailRow label="Caller ID" value={selected.caller_id || "—"} />
                <DetailRow label="Audio URL" value={selected.audio_url || "—"} />
                <DetailRow label="LR Lead ID" value={selected.leadsrain_lead_id || "—"} />
                <DetailRow label="LR Message" value={selected.leadsrain_message || "—"} />
                <DetailRow label="VoidFix SMS" value={selected.voidfix_sms_sent ? `Sent ${timeAgo(selected.voidfix_sms_at)}` : "Not sent"} />
                <DetailRow label="Error" value={selected.error_message || "—"} />
                <DetailRow label="Created" value={new Date(selected.created_at).toLocaleString()} />
                <Button onClick={triggerVoidfix} disabled={busy === "vf"} className="w-full">
                  {busy === "vf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                  Trigger VoidFix SMS
                </Button>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Raw response</summary>
                  <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">{JSON.stringify(selected.raw_response, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Metric({ label, value, accent, sub }: { label: string; value: any; accent?: "green" | "red" | "lime"; sub?: string }) {
  const colorMap: Record<string, string> = {
    green: "text-green-400",
    red: "text-red-400",
    lime: "text-lime-400",
  };
  return (
    <Card className="border-border/50 bg-card/60">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${accent ? colorMap[accent] : ""}`}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm text-right break-all">{value}</span>
    </div>
  );
}
