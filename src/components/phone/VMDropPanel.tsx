import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { sendRinglessVM } from "@/lib/dropVm";
import { toast } from "sonner";
import {
  Voicemail, Loader2, Play, Send, RefreshCw, PhoneForwarded,
  CheckCircle2, XCircle, Clock, Music2, Save, Unplug, Wifi,
} from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  campaign_token: string;
  campaign_id?: number | null;
  audio_url: string;
  transfer_number: string;
  callback_type: number;
  is_default: boolean;
  default_caller_id?: string | null;
  webhook_url?: string | null;
  delivery_tracking_enabled?: boolean;
  created_at: string;
};

type LogRow = {
  id: string;
  phone: string;
  status: string;
  api_status_message: string | null;
  created_at: string;
  activity_token: string | null;
};

type Stats = { total: number; queued: number; failed: number; last_24h: number };

function fmtPhone(p: string) {
  const d = (p || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return p;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function VMDropPanel() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [testPhone, setTestPhone] = useState("");
  const [sending, setSending] = useState(false);

  const [audioDraft, setAudioDraft] = useState("");
  const [savingAudio, setSavingAudio] = useState(false);
  const [campaignTokenDraft, setCampaignTokenDraft] = useState("");
  const [campaignNameDraft, setCampaignNameDraft] = useState("Warren Default VM");
  const [campaignIdDraft, setCampaignIdDraft] = useState("");
  const [callerIdDraft, setCallerIdDraft] = useState("");
  const [webhookUrlDraft, setWebhookUrlDraft] = useState("");
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string; details?: Record<string, any> } | null>(null);

  async function refresh(showSpinner = true) {
    if (showSpinner) setRefreshing(true);
    try {
      const [statsRes, logsRes] = await Promise.all([
        supabase.functions.invoke("drop-vm", { body: { action: "stats" } }),
        supabase.functions.invoke("drop-vm", { body: { action: "list_logs", limit: 25 } }),
      ]);
      if (statsRes.data?.success) {
        setStats(statsRes.data.stats);
        setCampaign(statsRes.data.campaign);
        setAudioDraft(statsRes.data.campaign?.audio_url || "");
        setCampaignTokenDraft(statsRes.data.campaign?.campaign_token || "");
        setCampaignNameDraft(statsRes.data.campaign?.name || "Warren Default VM");
        setCampaignIdDraft(statsRes.data.campaign?.campaign_id?.toString?.() || "");
        setCallerIdDraft(statsRes.data.campaign?.default_caller_id || "");
        setWebhookUrlDraft(statsRes.data.campaign?.webhook_url || "");
        setTrackingEnabled(statsRes.data.campaign?.delivery_tracking_enabled !== false);
      }
      if (logsRes.data?.success) setLogs(logsRes.data.logs || []);
    } catch (e: any) {
      toast.error("Failed to load VMDrp data: " + e.message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(false);
    const t = setInterval(() => refresh(false), 30000);
    return () => clearInterval(t);
  }, []);

  async function handleTestSend() {
    if (!campaign) {
      toast.error("Connect a Drop.co campaign token first");
      return;
    }
    if (!testPhone || testPhone.replace(/\D/g, "").length < 10) {
      toast.error("Enter a 10-digit phone number");
      return;
    }
    setSending(true);
    const ok = await sendRinglessVM({ phone: testPhone });
    setSending(false);
    if (ok) {
      setTestPhone("");
      refresh(false);
    }
  }

  async function handleSaveAudio() {
    if (!campaign) {
      toast.error("Save a Drop.co campaign token first");
      return;
    }
    if (!audioDraft || !audioDraft.startsWith("http")) {
      toast.error("Enter a valid public audio URL");
      return;
    }
    setSavingAudio(true);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "update_audio", audio_url: audioDraft },
    });
    setSavingAudio(false);
    if (error || !data?.success) {
      toast.error("Failed to update audio");
      return;
    }
    toast.success("VM audio updated");
    setCampaign(data.campaign);
  }

  async function handleSaveCampaign() {
    if (!campaignTokenDraft.trim()) {
      toast.error("Paste the CampaignToken from Drop.co");
      return;
    }
    setSavingCampaign(true);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: {
        action: "save_campaign",
        campaign_token: campaignTokenDraft.trim(),
        campaign_id: campaignIdDraft.trim() || null,
        name: campaignNameDraft.trim() || "Warren Default VM",
        audio_url: audioDraft || undefined,
        transfer_number: campaign?.transfer_number || "4244651253",
        default_caller_id: callerIdDraft.trim() || undefined,
        webhook_url: webhookUrlDraft.trim() || undefined,
        delivery_tracking_enabled: trackingEnabled,
      },
    });
    setSavingCampaign(false);
    if (error || !data?.success) {
      toast.error(data?.error || "Failed to save Drop.co campaign");
      return;
    }
    toast.success("Drop.co campaign connected");
    setCampaign(data.campaign);
    refresh(false);
  }

  async function handleDisconnect() {
    if (!campaign) return;
    if (!confirm(`Disconnect Drop.co campaign "${campaign.name}"?\n\nYou'll need to paste a CampaignToken again before sending more drops.`)) return;
    setDisconnecting(true);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "disconnect_campaign" },
    });
    setDisconnecting(false);
    if (error || !data?.success) {
      toast.error(data?.error || "Failed to disconnect campaign");
      return;
    }
    toast.success("Campaign disconnected");
    setCampaign(null);
    setCampaignTokenDraft("");
    setCampaignIdDraft("");
    setAudioDraft("");
    refresh(false);
  }

  async function handleTestConnection() {
    if (!campaign) {
      toast.error("Save a campaign token first");
      return;
    }
    setTesting(true);
    setTestResult(null);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "test_connection" },
    });
    setTesting(false);
    if (error) {
      const msg = "Edge function error: " + error.message;
      setTestResult({ valid: false, message: msg });
      toast.error(msg);
      return;
    }
    const valid = !!data?.valid;
    const msg = data?.api_status_message || (valid ? "Campaign is live" : "Campaign validation failed");
    setTestResult({
      valid,
      message: msg,
      details: {
        "Campaign": data?.campaign_name,
        "Campaign ID": data?.campaign_id,
        "VM Duration": data?.vm_drop_duration ? `${data.vm_drop_duration}s` : null,
        "VM File": data?.vm_drop_file,
        "Missed-Call": data?.enable_missed_call ? "Enabled" : "Disabled",
        "Slots": data?.allowable_campaign_count,
        "API Code": data?.api_status_code,
      },
    });
    if (valid) toast.success("Drop.co connection OK");
    else toast.error("Connection check failed");
  }

  const statusBadge = (s: string) => {
    if (s === "queued") return <Badge variant="secondary" className="gap-1 text-[10px]"><Clock className="h-3 w-3" />Queued</Badge>;
    if (s === "delivered") return <Badge variant="default" className="gap-1 text-[10px]"><CheckCircle2 className="h-3 w-3" />Delivered</Badge>;
    if (s === "failed") return <Badge variant="destructive" className="gap-1 text-[10px]"><XCircle className="h-3 w-3" />Failed</Badge>;
    return <Badge variant="outline" className="text-[10px]">{s}</Badge>;
  };

  return (
    <Card className="glass-card border-primary/30 shadow-xl shadow-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Voicemail className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="text-base">VMDrp</div>
              <div className="text-[11px] text-muted-foreground font-normal">
                Ringless voicemail drops via Drop.co
              </div>
            </div>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={refreshing} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Total Drops" value={stats?.total ?? 0} accent="text-foreground" />
              <StatTile label="Last 24h" value={stats?.last_24h ?? 0} accent="text-primary" />
              <StatTile label="Queued" value={stats?.queued ?? 0} accent="text-amber-400" />
              <StatTile label="Failed" value={stats?.failed ?? 0} accent="text-destructive" />
            </div>

            {/* Campaign + Send */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Campaign info */}
              <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <Music2 className="h-3.5 w-3.5" /> Active Campaign
                  </div>
                  {campaign && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="h-7 px-2 gap-1 text-[11px] text-primary hover:text-primary hover:bg-primary/10"
                      >
                        {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                        Test connection
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="h-7 px-2 gap-1 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
                        Disconnect / Replace
                      </Button>
                    </div>
                  )}
                </div>
                {campaign ? (
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="text-foreground font-medium">{campaign.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono break-all">
                        token: {campaign.campaign_token}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <PhoneForwarded className="h-3.5 w-3.5 text-primary" />
                      Callbacks → <span className="font-mono text-foreground">{fmtPhone(campaign.transfer_number)}</span>
                    </div>
                    <audio controls preload="none" src={campaign.audio_url} className="w-full h-9" />
                    <div className="space-y-2 pt-1">
                      <label className="text-[11px] text-muted-foreground">Audio URL</label>
                      <div className="flex gap-2">
                        <Input
                          value={audioDraft}
                          onChange={(e) => setAudioDraft(e.target.value)}
                          placeholder="https://…/voicemail.mp3"
                          className="text-xs h-8"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSaveAudio}
                          disabled={savingAudio || audioDraft === campaign.audio_url}
                          className="h-8 gap-1"
                        >
                          {savingAudio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </Button>
                      </div>
                    </div>
                    {testResult && (
                      <div className={`rounded-lg border p-2.5 text-[11px] space-y-1 ${
                        testResult.valid
                          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                          : "border-destructive/30 bg-destructive/5 text-destructive"
                      }`}>
                        <div className="flex items-center gap-1.5 font-medium">
                          {testResult.valid
                            ? <CheckCircle2 className="h-3.5 w-3.5" />
                            : <XCircle className="h-3.5 w-3.5" />}
                          {testResult.valid ? "Connection OK" : "Connection failed"}
                        </div>
                        <div className="text-foreground/80 break-words">{testResult.message}</div>
                        {testResult.details && (
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 text-muted-foreground">
                            {Object.entries(testResult.details)
                              .filter(([, v]) => v !== null && v !== undefined && v !== "")
                              .map(([k, v]) => (
                                <div key={k} className="truncate">
                                  <span className="text-foreground/60">{k}:</span>{" "}
                                  <span className="text-foreground/90 font-mono">{String(v)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Drop.co requires campaigns to be created in their UI. Paste the CampaignToken here to connect VMDrp.
                    </div>
                    <Input
                      value={campaignTokenDraft}
                      onChange={(e) => setCampaignTokenDraft(e.target.value)}
                      placeholder="CampaignToken"
                      className="text-xs h-8 font-mono"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={campaignNameDraft}
                        onChange={(e) => setCampaignNameDraft(e.target.value)}
                        placeholder="Campaign name"
                        className="text-xs h-8"
                      />
                      <Input
                        value={campaignIdDraft}
                        onChange={(e) => setCampaignIdDraft(e.target.value)}
                        placeholder="Campaign ID optional"
                        className="text-xs h-8"
                      />
                    </div>
                    <Input
                      value={audioDraft}
                      onChange={(e) => setAudioDraft(e.target.value)}
                      placeholder="Public voicemail audio URL optional"
                      className="text-xs h-8"
                    />
                    <Button size="sm" variant="outline" onClick={handleSaveCampaign} disabled={savingCampaign} className="w-full h-8 gap-2">
                      {savingCampaign ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Campaign Token
                    </Button>
                  </div>
                )}
              </div>

              {/* Send a drop */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-300">
                  <Send className="h-3.5 w-3.5" /> Drop a Voicemail
                </div>
                <div className="space-y-2">
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="(424) 465-1253"
                    className="text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") handleTestSend(); }}
                  />
                  <Button
                    onClick={handleTestSend}
                    disabled={sending || !campaign}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black gap-2"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Voicemail className="h-4 w-4" />}
                    {sending ? "Dropping…" : campaign ? "Drop VM Now" : "Connect Campaign First"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Lands directly in their voicemail without ringing. If they call back the missed number, they're transferred to{" "}
                    <span className="font-mono text-foreground">{fmtPhone(campaign?.transfer_number || "4244651253")}</span>.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Recent activity */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Recent Drops</div>
                <div className="text-[11px] text-muted-foreground">{logs.length} shown</div>
              </div>

              {logs.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border/50 rounded-lg">
                  No drops yet. Send your first one above.
                </div>
              ) : (
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
                    {logs.map((l) => (
                      <div key={l.id} className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-mono text-foreground">{fmtPhone(l.phone)}</div>
                          {l.api_status_message && (
                            <div className="text-[10px] text-muted-foreground truncate">{l.api_status_message}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {statusBadge(l.status)}
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {fmtTime(l.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Features list */}
            <div className="rounded-xl border border-border/40 bg-background/30 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">VMDrp Features</div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs text-foreground/90">
                <Feature icon={<Voicemail className="h-3.5 w-3.5 text-amber-400" />}>Ringless voicemail (no ring on recipient)</Feature>
                <Feature icon={<PhoneForwarded className="h-3.5 w-3.5 text-primary" />}>Auto-transfer callbacks to your cell</Feature>
                <Feature icon={<Music2 className="h-3.5 w-3.5 text-primary" />}>Custom audio per campaign</Feature>
                <Feature icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}>Per-drop delivery logging</Feature>
                <Feature icon={<Play className="h-3.5 w-3.5 text-primary" />}>Preview the active VM audio</Feature>
                <Feature icon={<Send className="h-3.5 w-3.5 text-primary" />}>One-click drop from any contact thread</Feature>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className={`text-2xl font-bold ${accent}`}>{value.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div>{children}</div>
    </div>
  );
}
