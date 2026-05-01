import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, PhoneMissed, RefreshCw, CheckCircle2, AlertCircle, PhoneCall, MessageSquare, ExternalLink, Send, ListPlus } from "lucide-react";
import { SaveToCampaignButton } from "./SaveToCampaignButton";
import { SmsThreadPopup } from "./SmsThreadPopup";

const DEFAULT_MESSAGE =
  "Currently in a meeting, talk with you soon. In the meanwhile, check my work out on IG: https://instagram.com/w4rr3nGURU";

type Cfg = {
  enabled: boolean;
  auto_reply_enabled: boolean;
  queue_enabled: boolean;
  forward_to: string;
  timeout_seconds: number;
  message: string;
};

type WebhookStatus = {
  number?: string;
  voice_url?: string;
  desired_voice_url?: string;
  is_configured?: boolean;
  error?: string;
};

type MissedRow = {
  id: string;
  phone_number: string;
  customer_id: string | null;
  status: string;
  callback_status: string;
  auto_reply_sent: boolean;
  voidfix_message_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  voicemail_recording_url: string | null;
  voicemail_recording_sid: string | null;
  voicemail_duration: number | null;
  voicemail_received_at: string | null;
  customer?: { full_name: string | null } | null;
};

type AuditRow = {
  id: string;
  webhook_name: string;
  event_stage: string;
  call_sid: string | null;
  dial_call_sid: string | null;
  phone_number: string | null;
  to_number: string | null;
  forwarded_phone_number: string | null;
  twilio_phone_sid: string | null;
  dial_status: string | null;
  is_missed: boolean | null;
  call_log_created: boolean;
  missed_call_row_created: boolean;
  error_message: string | null;
  created_at: string;
};

const DEFAULT_CFG: Cfg = {
  enabled: true,
  auto_reply_enabled: true,
  queue_enabled: true,
  forward_to: "+17027016192",
  timeout_seconds: 22,
  message: DEFAULT_MESSAGE,
};

type SectionMode = 'all' | 'audit' | 'recent' | 'settings';

const getMissedActivityTime = (row: MissedRow) =>
  row.voicemail_received_at || row.updated_at || row.created_at;

export default function MissedCallSettings({ section = 'all' }: { section?: SectionMode } = {}) {
  const showAutoReply = section === 'all' || section === 'settings';
  const showAudit = section === 'all' || section === 'audit';
  const showVoiceWebhook = section === 'all' || section === 'settings';
  const showRecent = section === 'all' || section === 'recent';
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhook, setWebhook] = useState<WebhookStatus | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [missed, setMissed] = useState<MissedRow[]>([]);
  const [missedLoading, setMissedLoading] = useState(false);
  const [missedPage, setMissedPage] = useState(0);
  const MISSED_PAGE_SIZE = 5;
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [smsPopup, setSmsPopup] = useState<{ phone: string; name: string | null } | null>(null);

  async function loadCfg() {
    setLoading(true);
    const { data } = await supabase.from("app_settings").select("value").eq("key", "voidfix_missed_call").maybeSingle();
    const v = (data?.value as Partial<Cfg>) || {};
    setCfg({
      enabled: v.enabled !== false,
      auto_reply_enabled: v.auto_reply_enabled !== false,
      queue_enabled: v.queue_enabled !== false,
      forward_to: v.forward_to || DEFAULT_CFG.forward_to,
      timeout_seconds: Number.isFinite(v.timeout_seconds as number) ? Number(v.timeout_seconds) : DEFAULT_CFG.timeout_seconds,
      message: v.message?.trim() || DEFAULT_CFG.message,
    });
    setLoading(false);
  }

  async function loadMissed(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setMissedLoading(true);
    const { data } = await supabase
      .from("missed_call_events")
      .select("id, phone_number, customer_id, status, callback_status, auto_reply_sent, voidfix_message_id, error_message, created_at, updated_at, voicemail_recording_url, voicemail_recording_sid, voicemail_duration, voicemail_received_at, customer:customers(full_name)")
      .order("updated_at", { ascending: false })
      .limit(500);
    const next = ((data as MissedRow[]) || []).sort(
      (a, b) => new Date(getMissedActivityTime(b)).getTime() - new Date(getMissedActivityTime(a)).getTime()
    );
    setMissed((prev) => {
      // Skip re-render if shallow signature unchanged (prevents flicker)
      const sig = (rows: MissedRow[]) => rows.map((r) => `${r.id}:${r.status}:${r.callback_status}:${r.voicemail_recording_url || ''}:${r.voicemail_received_at || ''}:${r.updated_at}`).join('|');
      return sig(prev) === sig(next) ? prev : next;
    });
    if (!opts.silent) setMissedLoading(false);
  }

  async function loadAudit(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setAuditLoading(true);
    const { data } = await (supabase as any)
      .from("missed_call_webhook_audit")
      .select("id, webhook_name, event_stage, call_sid, dial_call_sid, phone_number, to_number, forwarded_phone_number, twilio_phone_sid, dial_status, is_missed, call_log_created, missed_call_row_created, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(75);
    const next = (data as AuditRow[]) || [];
    setAuditRows((prev) => {
      const sig = (rows: AuditRow[]) => rows.map((r) => r.id).join('|');
      return sig(prev) === sig(next) ? prev : next;
    });
    if (!opts.silent) setAuditLoading(false);
  }

  async function loadWebhook() {
    const { data, error } = await supabase.functions.invoke("twilio-number-config", { body: { action: "status" } });
    if (error) {
      setWebhook({ error: error.message });
    } else {
      setWebhook(data as WebhookStatus);
    }
  }

  useEffect(() => {
    loadCfg();
    loadMissed();
    loadAudit();
    loadWebhook();
    const ch = supabase
      .channel("missed-calls")
      .on("postgres_changes", { event: "*", schema: "public", table: "missed_call_events" }, () => loadMissed({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "missed_call_webhook_audit" }, () => loadAudit({ silent: true }))
      .subscribe();
    // Silent background polling — no spinner, no flicker
    const poll = setInterval(() => {
      loadMissed({ silent: true });
      loadAudit({ silent: true });
    }, 5000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "voidfix_missed_call", value: cfg as any }, { onConflict: "key" });
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Saved", description: "Missed-call settings updated." });
  }

  async function configureTwilio() {
    setWebhookBusy(true);
    const { data, error } = await supabase.functions.invoke("twilio-number-config", { body: { action: "configure" } });
    setWebhookBusy(false);
    if (error || (data as any)?.ok === false) {
      toast({ title: "Twilio update failed", description: error?.message || (data as any)?.error || "Unknown error", variant: "destructive" });
    } else {
      toast({ title: "Twilio webhook updated", description: "Inbound calls now route through this CRM." });
      loadWebhook();
    }
  }

  async function markCallback(id: string, status: "callback_done" | "dismissed") {
    // Both Done and Dismiss remove the entry from the list entirely.
    const { error } = await supabase.from("missed_call_events").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setMissed((rows) => rows.filter((row) => row.id !== id));
    toast({
      title: status === "dismissed" ? "Voicemail dismissed" : "Marked as done",
      description: "Removed from missed-call list.",
    });
  }

  const [bulkBusy, setBulkBusy] = useState(false);
  async function bulkAddToCampaign() {
    const numbers = Array.from(new Set(
      missed
        .filter((m) => m.callback_status === "open")
        .map((m) => m.phone_number)
        .filter(Boolean)
    ));
    if (numbers.length === 0) {
      toast({ title: "Nothing to add", description: "No open missed calls or voicemails." });
      return;
    }
    setBulkBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");

      const today = new Date();
      const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const campaignName = `Callbacks ${ds}`;

      // Reuse today's callback campaign if it exists, else create
      let campaignId: string | null = null;
      const { data: existing } = await supabase
        .from("powerdial_campaigns")
        .select("id")
        .eq("name", campaignName)
        .in("status", ["idle", "paused", "running"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (existing && existing.length > 0) {
        campaignId = existing[0].id;
      } else {
        const { data: created, error: cErr } = await supabase
          .from("powerdial_campaigns")
          .insert({ name: campaignName, created_by: uid, status: "idle" })
          .select("id")
          .single();
        if (cErr) throw cErr;
        campaignId = created.id;
      }

      // Existing phones in this campaign (skip dupes)
      const { data: alreadyIn } = await supabase
        .from("powerdial_queue")
        .select("phone")
        .eq("campaign_id", campaignId);
      const existingSet = new Set((alreadyIn || []).map((r: any) => r.phone));

      const { data: lastPos } = await supabase
        .from("powerdial_queue")
        .select("position")
        .eq("campaign_id", campaignId)
        .order("position", { ascending: false })
        .limit(1);
      let nextPos = (lastPos?.[0]?.position ?? -1) + 1;

      const lookup = new Map(missed.map((m) => [m.phone_number, m]));
      const rowsToInsert = numbers
        .filter((p) => !existingSet.has(p))
        .map((p) => {
          const m = lookup.get(p);
          return {
            campaign_id: campaignId!,
            phone: p,
            contact_name: m?.customer?.full_name || null,
            customer_id: m?.customer_id || null,
            position: nextPos++,
            status: "pending",
          };
        });

      if (rowsToInsert.length === 0) {
        toast({ title: "All already in campaign", description: campaignName });
      } else {
        const { error: qErr } = await supabase.from("powerdial_queue").insert(rowsToInsert);
        if (qErr) throw qErr;

        const { data: campRow } = await supabase
          .from("powerdial_campaigns")
          .select("total_leads")
          .eq("id", campaignId)
          .single();
        await supabase
          .from("powerdial_campaigns")
          .update({ total_leads: (campRow?.total_leads ?? 0) + rowsToInsert.length })
          .eq("id", campaignId);

        toast({
          title: "Added to campaign",
          description: `${rowsToInsert.length} number(s) → ${campaignName}`,
        });
      }
    } catch (e) {
      toast({ title: "Add campaign failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  }

  async function sendTestSms() {
    const raw = testPhone.trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ title: "Enter a valid phone", description: "Need at least 10 digits.", variant: "destructive" });
      return;
    }
    const to = digits.length === 10 ? `+1${digits}` : digits.startsWith("1") ? `+${digits}` : `+${digits}`;
    setTestBusy(true);
    const { data, error } = await supabase.functions.invoke("powerdial-sms", {
      body: {
        action: "send",
        to,
        body: cfg.message,
        source: "missed-call-test-button",
        metadata: { source_kind: "missed_call_test" },
      },
    });
    setTestBusy(false);
    const ok = !error && (data as any)?.ok !== false;
    if (!ok) {
      toast({
        title: "VoidFix send failed",
        description: error?.message || (data as any)?.error || "Unknown error",
        variant: "destructive",
      });
    } else {
      toast({ title: "Test SMS sent via VoidFix", description: `Sent to ${to}` });
    }
  }

  return (
    <div className="space-y-6">
      {showAutoReply && (<Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><PhoneMissed className="h-5 w-5" /> Missed-Call Auto-Reply</CardTitle>
              <CardDescription>Twilio detects missed calls forwarded to your Verizon line and VoidFix sends the SMS.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={loadCfg}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable system</Label>
                  <p className="text-xs text-muted-foreground">Master switch for missed-call detection.</p>
                </div>
                <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-reply via VoidFix</Label>
                  <p className="text-xs text-muted-foreground">Send SMS from your VoidFix Android device.</p>
                </div>
                <Switch checked={cfg.auto_reply_enabled} onCheckedChange={(v) => setCfg({ ...cfg, auto_reply_enabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Add to PowerDial queue</Label>
                  <p className="text-xs text-muted-foreground">Auto-queue missed callers for callback.</p>
                </div>
                <Switch checked={cfg.queue_enabled} onCheckedChange={(v) => setCfg({ ...cfg, queue_enabled: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Verizon forward number</Label>
                  <Input value={cfg.forward_to} onChange={(e) => setCfg({ ...cfg, forward_to: e.target.value })} placeholder="+17027016192" />
                </div>
                <div>
                  <Label>Ring timeout (seconds)</Label>
                  <Input type="number" min={10} max={60} value={cfg.timeout_seconds} onChange={(e) => setCfg({ ...cfg, timeout_seconds: parseInt(e.target.value) || 22 })} />
                </div>
              </div>

              <div>
                <Label>Auto-reply message</Label>
                <Textarea rows={3} value={cfg.message} onChange={(e) => setCfg({ ...cfg, message: e.target.value })} />
              </div>

              <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save settings</Button>

              <div className="rounded-lg border border-dashed p-3 space-y-2 bg-muted/20">
                <div className="flex items-center gap-2 text-sm font-medium"><Send className="h-4 w-4" /> Test VoidFix → SMS leg</div>
                <p className="text-xs text-muted-foreground">Sends the auto-reply message above through VoidFix without involving Twilio. Confirms the SMS gateway works.</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="+14244651253 or 4244651253"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={sendTestSms} disabled={testBusy || !testPhone.trim()} variant="secondary">
                    {testBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Send test SMS
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>)}

      {showAudit && (<Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Missed-Call Webhook Audit</CardTitle>
              <CardDescription>Every Twilio webhook attempt, Call SID, phone ID, and missed-call row result.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => loadAudit()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : auditRows.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">No webhook attempts recorded yet.</div>
          ) : (
            <div className="max-h-[360px] overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Stage</th>
                    <th className="px-3 py-2 font-medium">Caller</th>
                    <th className="px-3 py-2 font-medium">Call SID</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(row.created_at).toLocaleTimeString()}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.event_stage}</div>
                        <div className="text-muted-foreground">{row.webhook_name}</div>
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        <div>{row.phone_number || "—"}</div>
                        <div className="text-muted-foreground">→ {row.forwarded_phone_number || row.to_number || "—"}</div>
                        <div className="text-muted-foreground">{row.twilio_phone_sid || "—"}</div>
                      </td>
                      <td className="px-3 py-2 font-mono max-w-[240px]">
                        <div className="truncate" title={row.call_sid || ""}>{row.call_sid || "—"}</div>
                        {row.dial_call_sid && <div className="truncate text-muted-foreground" title={row.dial_call_sid}>{row.dial_call_sid}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {row.dial_status && <Badge variant="outline">{row.dial_status}</Badge>}
                          {row.is_missed === true && <Badge variant="destructive">missed</Badge>}
                          {row.call_log_created && <Badge variant="secondary">call log created</Badge>}
                          {row.missed_call_row_created && <Badge variant="secondary">missed row created</Badge>}
                          {row.error_message && <Badge variant="destructive">error</Badge>}
                        </div>
                        {row.error_message && <div className="mt-1 text-destructive">{row.error_message}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>)}

      {showVoiceWebhook && (<Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PhoneCall className="h-5 w-5" /> Twilio Voice Webhook</CardTitle>
          <CardDescription>Routes inbound calls on your Twilio number through this CRM.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {webhook?.error ? (
            <div className="text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {webhook.error}</div>
          ) : webhook ? (
            <>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Number:</span> <span className="font-mono">{webhook.number}</span></div>
                <div><span className="text-muted-foreground">Current Voice URL:</span> <span className="font-mono break-all text-xs">{webhook.voice_url || "(none)"}</span></div>
                <div><span className="text-muted-foreground">Target:</span> <span className="font-mono break-all text-xs">{webhook.desired_voice_url}</span></div>
              </div>
              <div className="flex items-center gap-2">
                {webhook.is_configured ? (
                  <Badge className="bg-green-600/20 text-green-400 border-green-600/40"><CheckCircle2 className="h-3 w-3 mr-1" /> Configured</Badge>
                ) : (
                  <Badge variant="destructive">Not pointed at this CRM</Badge>
                )}
                <Button size="sm" onClick={configureTwilio} disabled={webhookBusy}>
                  {webhookBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {webhook.is_configured ? "Re-apply" : "Configure now"}
                </Button>
                <Button size="sm" variant="ghost" onClick={loadWebhook}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </>
          ) : (
            <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
          )}
        </CardContent>
      </Card>)}

      {showRecent && (<Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><PhoneMissed className="h-5 w-5" /> Recent Missed Calls</CardTitle>
              <CardDescription>Recent missed calls and voicemails forwarded through Twilio (5 per page).</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={bulkAddToCampaign} disabled={bulkBusy || missed.length === 0}>
                {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />}
                Add Campaign
              </Button>
              <Button size="sm" variant="ghost" onClick={() => loadMissed()}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {missedLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : missed.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">No missed calls yet.</div>
          ) : (
            (() => {
              const totalPages = Math.max(1, Math.ceil(missed.length / MISSED_PAGE_SIZE));
              const safePage = Math.min(missedPage, totalPages - 1);
              const start = safePage * MISSED_PAGE_SIZE;
              const pageRows = missed.slice(start, start + MISSED_PAGE_SIZE);
              return (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {pageRows.map((m) => (
                      <div key={m.id} className="flex flex-col gap-2 p-3 rounded-lg border bg-card/40">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm">{m.phone_number}</span>
                              {m.customer?.full_name && <span className="text-sm text-muted-foreground">· {m.customer.full_name}</span>}
                              {m.auto_reply_sent ? (
                                <Badge variant="outline" className="text-green-400 border-green-600/40"><MessageSquare className="h-3 w-3 mr-1" /> Replied</Badge>
                              ) : m.error_message ? (
                                <Badge variant="destructive">Reply failed</Badge>
                              ) : (
                                <Badge variant="outline">No reply</Badge>
                              )}
                              {m.voicemail_recording_sid && (
                                <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/40">
                                  Voicemail{m.voicemail_duration ? ` · ${m.voicemail_duration}s` : ""}
                                </Badge>
                              )}
                              <Badge variant={m.callback_status === "open" ? "default" : "outline"}>{m.callback_status}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {m.voicemail_received_at ? "Voicemail received" : "Missed call"}: {new Date(getMissedActivityTime(m)).toLocaleString()}
                            </div>
                            {m.error_message && <div className="text-xs text-destructive mt-1">{m.error_message}</div>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="ghost" asChild>
                              <a href={`tel:${m.phone_number}`}><PhoneCall className="h-4 w-4" /></a>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-7 text-xs"
                              onClick={() => setSmsPopup({ phone: m.phone_number, name: m.customer?.full_name || null })}
                            >
                              <MessageSquare className="h-3.5 w-3.5" /> SMS
                            </Button>
                            {m.callback_status === "open" && (
                              <Button size="sm" variant="ghost" onClick={() => markCallback(m.id, "dismissed")}>Dismiss</Button>
                            )}
                            {m.customer_id && (
                              <Button size="sm" variant="ghost" asChild>
                                <a href={`/customers?id=${m.customer_id}`}><ExternalLink className="h-4 w-4" /></a>
                              </Button>
                            )}
                          </div>
                        </div>
                        {m.voicemail_recording_sid && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <VoicemailPlayer sid={m.voicemail_recording_sid} />
                            <SaveToCampaignButton
                              phone={m.phone_number}
                              contactName={m.customer?.full_name || null}
                              customerId={m.customer_id}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs text-muted-foreground">
                      Showing {start + 1}–{Math.min(start + MISSED_PAGE_SIZE, missed.length)} of {missed.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setMissedPage((p) => Math.max(0, p - 1))}>Previous</Button>
                      <span className="text-xs text-muted-foreground">Page {safePage + 1} / {totalPages}</span>
                      <Button size="sm" variant="outline" disabled={safePage >= totalPages - 1} onClick={() => setMissedPage((p) => p + 1)}>Next</Button>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>)}
    </div>
  );
}

function VoicemailPlayer({ sid }: { sid: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-recording-proxy?sid=${encodeURIComponent(sid)}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error(`Load failed (${resp.status})`);
      const blob = await resp.blob();
      setSrc(URL.createObjectURL(blob));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [src]);

  if (src) {
    return <audio controls src={src} className="w-full h-9" />;
  }
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={load} disabled={loading}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
        Play voicemail
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
