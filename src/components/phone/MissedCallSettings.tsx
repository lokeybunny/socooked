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
import { Loader2, PhoneMissed, RefreshCw, CheckCircle2, AlertCircle, PhoneCall, MessageSquare, ExternalLink, Send } from "lucide-react";

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
  customer?: { full_name: string | null } | null;
};

const DEFAULT_CFG: Cfg = {
  enabled: true,
  auto_reply_enabled: true,
  queue_enabled: true,
  forward_to: "+17027016192",
  timeout_seconds: 22,
  message: DEFAULT_MESSAGE,
};

export default function MissedCallSettings() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhook, setWebhook] = useState<WebhookStatus | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [missed, setMissed] = useState<MissedRow[]>([]);
  const [missedLoading, setMissedLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testBusy, setTestBusy] = useState(false);

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

  async function loadMissed() {
    setMissedLoading(true);
    const { data } = await supabase
      .from("missed_call_events")
      .select("id, phone_number, customer_id, status, callback_status, auto_reply_sent, voidfix_message_id, error_message, created_at, customer:customers(full_name)")
      .order("created_at", { ascending: false })
      .limit(50);
    setMissed((data as any) || []);
    setMissedLoading(false);
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
    loadWebhook();
    const ch = supabase
      .channel("missed-calls")
      .on("postgres_changes", { event: "*", schema: "public", table: "missed_call_events" }, () => loadMissed())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
    await supabase.from("missed_call_events").update({ callback_status: status }).eq("id", id);
    loadMissed();
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
      <Card>
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
      </Card>

      <Card>
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
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><PhoneMissed className="h-5 w-5" /> Recent Missed Calls</CardTitle>
              <CardDescription>Last 50 missed calls forwarded through Twilio.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={loadMissed}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {missedLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : missed.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">No missed calls yet.</div>
          ) : (
            <div className="space-y-2">
              {missed.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card/40">
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
                      <Badge variant={m.callback_status === "open" ? "default" : "outline"}>{m.callback_status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</div>
                    {m.error_message && <div className="text-xs text-destructive mt-1">{m.error_message}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`tel:${m.phone_number}`}><PhoneCall className="h-4 w-4" /></a>
                    </Button>
                    {m.callback_status === "open" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => markCallback(m.id, "callback_done")}>Done</Button>
                        <Button size="sm" variant="ghost" onClick={() => markCallback(m.id, "dismissed")}>Dismiss</Button>
                      </>
                    )}
                    {m.customer_id && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={`/customers?id=${m.customer_id}`}><ExternalLink className="h-4 w-4" /></a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
