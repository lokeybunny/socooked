import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, FlaskConical, Mail, MessageSquare, Activity, ShieldCheck, Send, Timer, Cloud } from "lucide-react";

type Settings = {
  is_production: boolean;
  is_paused: boolean;
  daily_email_cap: number;
  daily_sms_cap: number;
  batch_size: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  start_hour_pt: number;
  end_hour_pt: number;
  stop_requested?: boolean;
  drain_active?: boolean;
  drain_started_at?: string | null;
  drain_last_tick_at?: string | null;
};

type Contact = {
  id: string;
  email: string | null;
  phone_e164: string | null;
  first_name: string | null;
  property_address: string | null;
  status: string;
  email_status: string | null;
  sms_status: string | null;
  email_sent_at: string | null;
  sms_sent_at: string | null;
  error_message: string | null;
  is_test: boolean;
  created_at: string;
};

type Stats = {
  emails_sent: number;
  emails_failed: number;
  sms_sent: number;
  sms_failed: number;
};

type LogRow = {
  id: string;
  level: string;
  step: string | null;
  message: string | null;
  is_test: boolean;
  created_at: string;
};

const STAGES = ["queued", "emailing", "email_sent", "texting", "completed"];
const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  emailing: "Emailing",
  email_sent: "Email Sent",
  texting: "Texting",
  sms_sent: "SMS Sent",
  completed: "Completed",
  failed: "Failed",
};

function stageIndex(status: string) {
  if (status === "completed") return 4;
  if (status === "sms_sent") return 4;
  if (status === "texting") return 3;
  if (status === "email_sent") return 2;
  if (status === "emailing") return 1;
  if (status === "failed") return -1;
  return 0;
}

export default function CampaignLeader() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats>({ emails_sent: 0, emails_failed: 0, sms_sent: 0, sms_failed: 0 });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Test mode state
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testFirst, setTestFirst] = useState("");
  const [testAddr, setTestAddr] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  async function loadAll() {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })).toISOString().slice(0, 10);
    const [s, st, c, l] = await Promise.all([
      supabase.from("campaign_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("campaign_daily_stats").select("*").eq("campaign_date", today).maybeSingle(),
      supabase.from("campaign_contacts").select("*").eq("campaign_date", today).order("created_at", { ascending: false }).limit(50),
      supabase.from("campaign_activity_log").select("*").order("created_at", { ascending: false }).limit(40),
    ]);
    if (s.data) setSettings(s.data as Settings);
    if (st.data) setStats(st.data as Stats);
    if (c.data) setContacts(c.data as Contact[]);
    if (l.data) setLogs(l.data as LogRow[]);
  }

  useEffect(() => {
    loadAll();
    const ch1 = supabase
      .channel("campaign-contacts")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_contacts" }, () => loadAll())
      .subscribe();
    const ch2 = supabase
      .channel("campaign-logs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "campaign_activity_log" }, () => loadAll())
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, []);

  // Re-render every second so countdown timers tick smoothly
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Currently in-flight contact (the one the server is actively sending)
  const inFlight = useMemo(
    () => contacts.find(c => c.status === "emailing" || c.status === "texting") || null,
    [contacts],
  );

  // Most recently completed send (used to estimate the next one)
  const lastSent = useMemo(() => {
    const times = contacts
      .map(c => {
        const t = c.sms_sent_at || c.email_sent_at;
        return t ? new Date(t).getTime() : 0;
      })
      .filter(Boolean);
    return times.length ? Math.max(...times) : 0;
  }, [contacts]);

  // Average inter-send delay from settings (server picks a random value in this range)
  const avgDelaySec = settings
    ? Math.round((settings.min_delay_seconds + settings.max_delay_seconds) / 2)
    : 0;

  // Estimated seconds until next contact starts processing
  const nextSendInSec = (() => {
    if (!settings || !settings.is_production || settings.is_paused) return null;
    if (inFlight) return 0; // sending right now
    if (!lastSent) return null;
    const elapsed = Math.floor((now - lastSent) / 1000);
    return Math.max(0, avgDelaySec - elapsed);
  })();

  async function updateSettings(patch: Partial<Settings>) {
    if (!settings) return;
    const { error } = await supabase.from("campaign_settings").update(patch).eq("id", 1);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    setSettings({ ...settings, ...patch });
  }

  async function runTest(channel: "email" | "sms" | "both") {
    setBusy(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("campaign-leader-tick", {
        body: { mode: "test", email: testEmail, phone: testPhone, first_name: testFirst, property_address: testAddr, channel },
      });
      if (error) throw error;
      setTestResult(data);
      toast({ title: "Test complete", description: `Channel: ${channel}` });
    } catch (e: any) {
      toast({ title: "Test failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function runTickNow() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("campaign-leader-tick", { body: { mode: "tick" } });
      if (error) throw error;
      const summary = data?.skipped
        ? `Skipped: ${data.reason}`
        : `Processed ${data?.processed || 0} (${data?.success || 0} successful)`;
      toast({ title: "Tick complete", description: summary });
    } catch (e: any) {
      toast({ title: "Tick failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <div className="p-8 text-muted-foreground">Loading Campaign Leader…</div>;
  }

  const totalToday = (stats.emails_sent || 0) + (stats.emails_failed || 0) + (stats.sms_sent || 0) + (stats.sms_failed || 0);
  const successRate = totalToday === 0 ? 0 : Math.round(((stats.emails_sent + stats.sms_sent) / totalToday) * 100);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Campaign Leader</h1>
          <p className="text-muted-foreground">Autonomous outbound to leads from US Lead Map · 9–5 PT · Mon–Fri</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Badge variant={settings.is_production ? "default" : "outline"}>
            {settings.is_production ? "PRODUCTION ON" : "PRODUCTION LOCKED"}
          </Badge>
          <Badge variant={settings.is_paused ? "destructive" : "default"}>
            {settings.is_paused ? "PAUSED" : "ACTIVE"}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <a href="/email-deliverability"><ShieldCheck className="w-4 h-4 mr-1" />Deliverability</a>
          </Button>
        </div>
      </div>

      {/* Daily stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Emails Sent</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.emails_sent} <span className="text-sm text-muted-foreground">/ {settings.daily_email_cap}</span></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">SMS Sent</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.sms_sent} <span className="text-sm text-muted-foreground">/ {settings.daily_sms_cap}</span></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Email Failed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{stats.emails_failed}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">SMS Failed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{stats.sms_failed}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Success Rate</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{successRate}%</div></CardContent></Card>
      </div>

      {/* Live send monitor */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="w-5 h-5 text-primary" /> Live Send Monitor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Now sending */}
          {inFlight ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background border border-primary/40">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  Sending {inFlight.status === "emailing" ? "email" : "SMS"} to{" "}
                  <span className="text-primary">{inFlight.first_name || inFlight.email}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {inFlight.email}
                  {inFlight.phone_e164 && <> · {inFlight.phone_e164}</>}
                  {inFlight.property_address && <> · {inFlight.property_address}</>}
                </div>
              </div>
              <Badge>{STAGE_LABELS[inFlight.status]}</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background border">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1 text-sm">
                {!settings.is_production && <span className="text-muted-foreground">Production locked — no sends running.</span>}
                {settings.is_production && settings.is_paused && <span className="text-muted-foreground">Campaign paused.</span>}
                {settings.is_production && !settings.is_paused && nextSendInSec !== null && (
                  <span>
                    Next contact in{" "}
                    <span className="font-mono text-base font-bold text-primary tabular-nums">
                      {Math.floor(nextSendInSec / 60)}:{String(nextSendInSec % 60).padStart(2, "0")}
                    </span>
                  </span>
                )}
                {settings.is_production && !settings.is_paused && nextSendInSec === null && (
                  <span className="text-muted-foreground">Waiting for next batch from scheduler…</span>
                )}
              </div>
              {settings.is_production && !settings.is_paused && (
                <Badge variant="outline" className="text-xs">avg delay {avgDelaySec}s</Badge>
              )}
            </div>
          )}

          {/* Reassurance: keeps running in background */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Cloud className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Sends run on the server — closing this tab won't stop the campaign. When you come back,
              this page reconnects to the live feed automatically.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Campaign Controls</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant={settings.is_production ? "destructive" : "default"}
            onClick={() => updateSettings({ is_production: !settings.is_production })}
          >
            {settings.is_production ? "Lock Production" : "Enable Production"}
          </Button>
          <Button
            variant="outline"
            disabled={!settings.is_production}
            onClick={() => updateSettings({ is_paused: !settings.is_paused })}
          >
            {settings.is_paused ? <><Play className="w-4 h-4 mr-2" /> Resume</> : <><Pause className="w-4 h-4 mr-2" /> Pause</>}
          </Button>
          <Button variant="outline" onClick={runTickNow} disabled={busy || !settings.is_production || settings.is_paused}>
            <Activity className="w-4 h-4 mr-2" /> Run Batch Now
          </Button>
        </CardContent>
      </Card>

      {/* Test Mode */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5 text-amber-500" /> TEST MODE</CardTitle>
          <p className="text-sm text-muted-foreground">Sends real email/SMS but does not touch state_leads, suppression, daily caps, or campaign_contacts.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Test Email</Label><Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="you@example.com" /></div>
            <div><Label>Test Phone (E.164)</Label><Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+17025551234" /></div>
            <div><Label>First Name (optional)</Label><Input value={testFirst} onChange={e => setTestFirst(e.target.value)} placeholder="John" /></div>
            <div><Label>Property Address (optional)</Label><Input value={testAddr} onChange={e => setTestAddr(e.target.value)} placeholder="123 Main St, Las Vegas NV" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runTest("email")} disabled={busy || !testEmail}><Mail className="w-4 h-4 mr-2" /> Test Email Only</Button>
            <Button onClick={() => runTest("sms")} disabled={busy || !testPhone}><MessageSquare className="w-4 h-4 mr-2" /> Test SMS Only</Button>
            <Button onClick={() => runTest("both")} disabled={busy || !testEmail || !testPhone} variant="default">Run Full Test</Button>
          </div>
          {testResult && (
            <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-80">{JSON.stringify(testResult, null, 2)}</pre>
          )}
        </CardContent>
      </Card>

      {/* Live pipeline */}
      <Card>
        <CardHeader><CardTitle>Today's Pipeline ({contacts.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-[500px] overflow-auto">
          {contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts queued today yet.</p>}
          {contacts.map(c => {
            const idx = stageIndex(c.status);
            const failed = c.status === "failed";
            return (
              <div key={c.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{c.first_name || "—"}</span>
                    <span className="text-muted-foreground"> · {c.email}</span>
                    {c.phone_e164 && <span className="text-muted-foreground"> · {c.phone_e164}</span>}
                  </div>
                  <Badge variant={failed ? "destructive" : c.status === "completed" ? "default" : "secondary"}>{STAGE_LABELS[c.status] || c.status}</Badge>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {STAGES.map((stage, i) => (
                    <div key={stage} className="flex items-center gap-1">
                      <div className={`px-2 py-1 rounded ${i <= idx && !failed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {STAGE_LABELS[stage]}
                      </div>
                      {i < STAGES.length - 1 && <span className="text-muted-foreground">→</span>}
                    </div>
                  ))}
                </div>
                {c.error_message && <p className="text-xs text-destructive">{c.error_message}</p>}
                {c.property_address && <p className="text-xs text-muted-foreground">{c.property_address}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Activity log */}
      <Card>
        <CardHeader><CardTitle>Live Activity Feed</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-80 overflow-auto text-xs font-mono">
          {logs.map(l => (
            <div key={l.id} className={`flex gap-2 ${l.level === "error" ? "text-destructive" : l.level === "success" ? "text-green-600" : "text-muted-foreground"}`}>
              <span>{new Date(l.created_at).toLocaleTimeString()}</span>
              {l.is_test && <Badge variant="outline" className="h-4 text-[10px]">TEST</Badge>}
              <span className="font-semibold">[{l.step}]</span>
              <span>{l.message}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
