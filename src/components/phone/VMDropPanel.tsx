import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { sendRinglessVM } from "@/lib/dropVm";
import { toast } from "sonner";
import {
  Voicemail, Loader2, Send, RefreshCw, PhoneForwarded, CheckCircle2,
  XCircle, Clock, Music2, Save, Wifi, Plus, Trash2, Star, StarOff, Library,
} from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  campaign_token: string | null;
  campaign_id?: number | null;
  audio_url: string;
  transfer_number: string;
  callback_type: number;
  is_default: boolean;
  default_caller_id?: string | null;
  webhook_url?: string | null;
  delivery_tracking_enabled?: boolean;
  enable_missed_call?: boolean;
  vm_drop_duration?: number | null;
  created_at: string;
  updated_at?: string;
};

type LogRow = {
  id: string;
  phone: string;
  status: string;
  api_status_message: string | null;
  created_at: string;
  activity_token: string | null;
  vm_drop_status_url?: string | null;
  response?: Record<string, any> | null;
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
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [active, setActive] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [testPhone, setTestPhone] = useState("");
  const [sending, setSending] = useState(false);

  // Add-campaign form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<"id" | "token">("id");
  const [pasteToken, setPasteToken] = useState("");
  const [pasteId, setPasteId] = useState("");
  const [newName, setNewName] = useState("");
  const [newTransfer, setNewTransfer] = useState("4244651253");
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<any>(null);

  // Settings drafts (active campaign)
  const [callerIdDraft, setCallerIdDraft] = useState("");
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string; details?: Record<string, any> } | null>(null);

  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [refreshingLog, setRefreshingLog] = useState<string | null>(null);
  const [refreshingPending, setRefreshingPending] = useState(false);

  async function refresh(showSpinner = true) {
    if (showSpinner) setRefreshing(true);
    try {
      const [listRes, statsRes, logsRes] = await Promise.all([
        supabase.functions.invoke("drop-vm", { body: { action: "list_campaigns" } }),
        supabase.functions.invoke("drop-vm", { body: { action: "stats" } }),
        supabase.functions.invoke("drop-vm", { body: { action: "list_logs", limit: 25 } }),
      ]);
      if (listRes.data?.success) {
        setCampaigns(listRes.data.campaigns || []);
        setActive(listRes.data.active);
        if (listRes.data.active) {
          setCallerIdDraft(listRes.data.active.default_caller_id || "");
          setTrackingEnabled(listRes.data.active.delivery_tracking_enabled !== false);
        }
      }
      if (statsRes.data?.success) setStats(statsRes.data.stats);
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
    const statusPoll = setInterval(() => handleRefreshPending(false), 60000);
    return () => {
      clearInterval(t);
      clearInterval(statusPoll);
    };
  }, []);

  async function handleRefreshPending(showToast = true) {
    if (showToast) setRefreshingPending(true);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "refresh_pending", limit: 10 },
    });
    if (showToast) setRefreshingPending(false);
    if (error || !data?.success) {
      if (showToast) toast.error(error?.message || data?.error || "Status sync failed");
      return;
    }
    const delivered = (data.results || []).filter((r: any) => r.status === "delivered").length;
    if (showToast) toast.success(`Checked ${data.checked || 0} queued drop${data.checked === 1 ? "" : "s"}${delivered ? ` · ${delivered} delivered` : ""}`);
    refresh(false);
  }

  async function handleTestSend() {
    if (!active) return toast.error("Activate a campaign first");
    if (!testPhone || testPhone.replace(/\D/g, "").length < 10) {
      return toast.error("Enter a 10-digit phone number");
    }
    setSending(true);
    const ok = await sendRinglessVM({ phone: testPhone });
    setSending(false);
    if (ok) {
      setTestPhone("");
      refresh(false);
    }
  }

  async function handleValidateToken() {
    const token = pasteToken.trim();
    if (!token) return toast.error("Paste your CampaignToken from app.drop.co");
    setValidating(true);
    setTokenPreview(null);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "validate_token", campaign_token: token },
    });
    setValidating(false);
    if (error || !data?.valid) {
      toast.error(data?.error || data?.api_status_message || error?.message || "Token rejected");
      return;
    }
    setTokenPreview(data.preview);
    if (!newName && data.preview?.campaign_name) setNewName(data.preview.campaign_name);
    toast.success(`Validated: ${data.preview?.campaign_name || "campaign"}`);
  }

  async function handleSaveCampaign() {
    const token = pasteToken.trim();
    if (!token) return toast.error("Paste a CampaignToken first");
    if (!tokenPreview) return toast.error("Click Validate first");
    if (newTransfer.replace(/\D/g, "").length < 10) return toast.error("Enter a valid transfer number");

    setSaving(true);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: {
        action: "save_token",
        campaign_token: token,
        name: newName.trim(),
        transfer_number: newTransfer.trim(),
        set_default: campaigns.length === 0,
      },
    });
    setSaving(false);
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "Failed to save");
      return;
    }
    toast.success(`Saved: ${data.campaign?.name}`);
    setPasteToken("");
    setNewName("");
    setTokenPreview(null);
    setShowAddForm(false);
    refresh(false);
  }

  async function handleSaveById() {
    const cid = parseInt(pasteId.trim(), 10);
    if (!cid || isNaN(cid)) return toast.error("Enter a numeric Campaign ID (e.g. 68797)");
    if (newTransfer.replace(/\D/g, "").length < 10) return toast.error("Enter a valid transfer number");

    setSaving(true);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: {
        action: "save_id",
        campaign_id: cid,
        name: newName.trim(),
        transfer_number: newTransfer.trim(),
        set_default: campaigns.length === 0,
      },
    });
    setSaving(false);
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "Failed to save");
      return;
    }
    toast.success(data.message || `Saved Campaign ${cid}`);
    setPasteId("");
    setNewName("");
    setShowAddForm(false);
    refresh(false);
  }

  async function handleSetDefault(c: Campaign) {
    if (c.is_default) return;
    setSwitchingTo(c.id);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "set_default", id: c.id },
    });
    setSwitchingTo(null);
    if (error || !data?.success) {
      toast.error(data?.error || "Failed to switch");
      return;
    }
    toast.success(`Now active: ${c.name}`);
    refresh(false);
  }

  async function handleDelete(c: Campaign) {
    if (!confirm(`Remove "${c.name}" from your library?\n\nThe campaign on Drop.co is NOT deleted — only this saved reference.`)) return;
    setDeletingId(c.id);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "delete_campaign", id: c.id },
    });
    setDeletingId(null);
    if (error || !data?.success) {
      toast.error(data?.error || "Failed to remove");
      return;
    }
    toast.success("Removed from library");
    refresh(false);
  }

  async function handleSaveSettings() {
    if (!active) return;
    setSavingSettings(true);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: {
        action: "update_settings",
        default_caller_id: callerIdDraft.trim() || null,
        webhook_url: null,
        delivery_tracking_enabled: trackingEnabled,
      },
    });
    setSavingSettings(false);
    if (error || !data?.success) {
      toast.error(data?.error || "Failed to save settings");
      return;
    }
    toast.success("Settings saved");
    refresh(false);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "test_connection" },
    });
    setTesting(false);
    if (error) {
      setTestResult({ valid: false, message: error.message });
      return toast.error("Test failed: " + error.message);
    }
    const valid = !!data?.valid;
    setTestResult({
      valid,
      message: data?.message || data?.api_status_message || (valid ? "Connection OK" : "Failed"),
      details: {
        "Customer": data?.customer_name,
        "Balance": data?.balance != null ? `$${data.balance}` : null,
        "Pending": data?.pending_cost != null ? `$${data.pending_cost}` : null,
        "Active": data?.campaign_name,
        "Successes (30d)": data?.success_count,
        "Failures (30d)": data?.fail_count,
        "Delivery Rate": data?.delivery_rate ? `${data.delivery_rate}%` : null,
      },
    });
    if (valid) toast.success("Drop.co connection OK");
    else toast.error("Connection check failed");
  }

  async function handleRefreshLog(log: LogRow) {
    if (!log.activity_token) return toast.error("No ActivityToken — can't refresh");
    setRefreshingLog(log.id);
    const { data, error } = await supabase.functions.invoke("drop-vm", {
      body: { action: "refresh_status", activity_token: log.activity_token },
    });
    setRefreshingLog(null);
    if (error || !data?.success) {
      toast.error(error?.message || data?.message || "Refresh failed");
      return;
    }
    const suffix = data.voidfix?.ok ? " · VoidFix sent" : "";
    toast.success(`Status: ${data.status || data.message || "unknown"}${suffix}`);
    refresh(false);
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
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleTestConnection} disabled={testing} className="h-8 gap-1 text-xs">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
              Test API
            </Button>
            <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={refreshing} className="h-8 gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            {/* Test result banner */}
            {testResult && (
              <div className={`rounded-lg border p-2.5 text-[11px] space-y-1 ${
                testResult.valid
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                  : "border-destructive/30 bg-destructive/5 text-destructive"
              }`}>
                <div className="flex items-center gap-1.5 font-medium">
                  {testResult.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {testResult.valid ? "Drop.co API OK" : "Connection failed"}
                  <button onClick={() => setTestResult(null)} className="ml-auto text-[10px] opacity-60 hover:opacity-100">×</button>
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

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Total Drops" value={stats?.total ?? 0} accent="text-foreground" />
              <StatTile label="Last 24h" value={stats?.last_24h ?? 0} accent="text-primary" />
              <StatTile label="Queued" value={stats?.queued ?? 0} accent="text-amber-400" />
              <StatTile label="Failed" value={stats?.failed ?? 0} accent="text-destructive" />
            </div>

            {/* ============= CAMPAIGNS LIBRARY ============= */}
            <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Library className="h-3.5 w-3.5" /> Campaign Library
                  <Badge variant="outline" className="text-[10px] h-5">{campaigns.length}</Badge>
                </div>
                <Button
                  size="sm"
                  variant={showAddForm ? "ghost" : "outline"}
                  onClick={() => { setShowAddForm(!showAddForm); setTokenPreview(null); }}
                  className="h-7 px-2 gap-1 text-[11px]"
                >
                  {showAddForm ? "Cancel" : <><Plus className="h-3 w-3" />Add Campaign</>}
                </Button>
              </div>

              {/* Add new campaign form */}
              {showAddForm && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                  {/* Mode toggle */}
                  <div className="flex items-center gap-1 p-0.5 rounded-md bg-background/40 border border-border/40 w-fit">
                    <button
                      onClick={() => setAddMode("id")}
                      className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded ${
                        addMode === "id" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      By Campaign ID ✓ Easy
                    </button>
                    <button
                      onClick={() => setAddMode("token")}
                      className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded ${
                        addMode === "token" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      By Token (advanced)
                    </button>
                  </div>

                  {addMode === "id" ? (
                    <>
                      <div className="text-[11px] text-muted-foreground leading-relaxed">
                        Just enter the <strong className="text-foreground">Campaign ID</strong> shown in your Drop.co dashboard
                        (e.g. <code className="text-primary">68797</code>). The full token will be auto-captured by the
                        webhook on the first delivery event — no UUID needed.
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Campaign ID</label>
                        <Input
                          value={pasteId}
                          onChange={(e) => setPasteId(e.target.value.replace(/\D/g, ""))}
                          placeholder="68797"
                          inputMode="numeric"
                          className="text-sm h-9 font-mono"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] text-muted-foreground leading-relaxed">
                        Paste a CampaignToken from <a href="https://app.drop.co" target="_blank" rel="noreferrer" className="text-primary underline">app.drop.co</a>
                        — used only for instant validation. If you don't have it, switch to{" "}
                        <button onClick={() => setAddMode("id")} className="text-primary underline">By Campaign ID</button>.
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">CampaignToken (UUID)</label>
                        <div className="flex gap-2">
                          <Input
                            value={pasteToken}
                            onChange={(e) => { setPasteToken(e.target.value); setTokenPreview(null); }}
                            placeholder="aa3cf6b8-3a19-4ad3-86a4-1a7bf5602d83"
                            className="text-xs h-8 font-mono"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleValidateToken}
                            disabled={validating || !pasteToken.trim()}
                            className="h-8 gap-1 shrink-0"
                          >
                            {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                            Validate
                          </Button>
                        </div>
                      </div>
                      {tokenPreview && (
                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 space-y-1 text-[11px]">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Validated by Drop.co
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 text-foreground/80">
                            <div>Name: <span className="font-mono">{tokenPreview.campaign_name || "—"}</span></div>
                            <div>ID: <span className="font-mono">{tokenPreview.campaign_id ?? "—"}</span></div>
                            <div>Successes (30d): <span className="font-mono">{tokenPreview.success_count}</span></div>
                            <div>Delivery: <span className="font-mono">{tokenPreview.delivery_rate}%</span></div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Local Name</label>
                      <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={addMode === "id" ? `Campaign ${pasteId || "…"}` : "My VM Campaign"} className="text-xs h-8" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Transfer Number</label>
                      <Input value={newTransfer} onChange={(e) => setNewTransfer(e.target.value)} placeholder="4244651253" className="text-xs h-8 font-mono" />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={addMode === "id" ? handleSaveById : handleSaveCampaign}
                    disabled={saving || (addMode === "id" ? !pasteId.trim() : !tokenPreview)}
                    className="w-full h-9 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {saving ? "Saving…" : addMode === "id" ? "Save Campaign" : "Save to Library"}
                  </Button>
                </div>
              )}

              {/* Campaigns list */}
              {campaigns.length === 0 && !showAddForm && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  <Music2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  No campaigns saved yet. Click <span className="text-foreground">Add Campaign</span> and just enter your Drop.co Campaign ID.
                </div>
              )}

              {campaigns.length > 0 && (
                <div className="space-y-2">
                  {campaigns.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        c.is_default
                          ? "border-amber-500/40 bg-amber-500/5"
                          : "border-border/40 bg-background/40 hover:border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.is_default ? (
                              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                            ) : (
                              <button
                                onClick={() => handleSetDefault(c)}
                                disabled={switchingTo === c.id}
                                title="Set as active campaign"
                                className="text-muted-foreground hover:text-amber-400 transition-colors"
                              >
                                {switchingTo === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StarOff className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            <div className="font-medium text-sm truncate">{c.name}</div>
                            {c.is_default && <Badge variant="default" className="h-4 text-[9px] px-1.5">ACTIVE</Badge>}
                            {!c.campaign_token && (
                              <Badge variant="outline" className="h-4 text-[9px] px-1.5 border-amber-500/40 text-amber-400">
                                AWAITING WEBHOOK
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                            {c.campaign_id && <>ID {c.campaign_id}</>}
                            {c.campaign_token
                              ? <> · {c.campaign_token.slice(0, 8)}…{c.campaign_token.slice(-6)}</>
                              : <span className="text-amber-400/80"> · token captures on first event</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                            <PhoneForwarded className="h-3 w-3" />
                            <span className="font-mono">{fmtPhone(c.transfer_number)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!c.is_default && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSetDefault(c)}
                              disabled={switchingTo === c.id}
                              className="h-7 px-2 text-[10px] gap-1"
                            >
                              {switchingTo === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Activate"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(c)}
                            disabled={deletingId === c.id}
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {deletingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ============= ACTIVE CAMPAIGN SETTINGS + DROP ============= */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Active campaign settings */}
              <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Music2 className="h-3.5 w-3.5" />
                  {active ? "Active Campaign Settings" : "No Campaign Active"}
                </div>
                {active ? (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Default Caller ID</label>
                        <Input value={callerIdDraft} onChange={(e) => setCallerIdDraft(e.target.value)} placeholder="4244651253" className="text-xs h-8 font-mono" />
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                      <span className="text-foreground/90">
                        Auto-send VoidFix SMS on delivery
                        <span className="block text-[10px] text-muted-foreground">Follow-up text after voicemail drops</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={trackingEnabled}
                        onChange={(e) => setTrackingEnabled(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveSettings}
                      disabled={
                        savingSettings ||
                        (callerIdDraft === (active.default_caller_id || "") &&
                          trackingEnabled === (active.delivery_tracking_enabled !== false))
                      }
                      className="w-full h-8 gap-2"
                    >
                      {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Settings
                    </Button>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground py-3 text-center">
                    Add a campaign above and activate it to configure settings.
                  </div>
                )}
              </div>

              {/* Drop a VM */}
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
                    disabled={sending || !active || !active?.campaign_token}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black gap-2"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Voicemail className="h-4 w-4" />}
                    {sending
                      ? "Dropping…"
                      : !active
                        ? "Activate a Campaign First"
                        : !active.campaign_token
                          ? "Awaiting Token from Webhook…"
                          : `Drop via ${active.name}`}
                  </Button>
                  {active && active.campaign_token && (
                    <div className="text-[10px] text-muted-foreground text-center">
                      Will use campaign <span className="font-mono text-foreground/80">{active.name}</span>
                    </div>
                  )}
                  {active && !active.campaign_token && (
                    <div className="text-[10px] text-amber-400/90 text-center">
                      Token will be auto-captured on the first webhook event from Drop.co for this campaign.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ============= LOGS ============= */}
            <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Recent Drops</div>
                  <div className="text-[10px] text-muted-foreground">Webhook live at <code className="text-primary">/drop-webhook</code> — auto-captures CampaignToken &amp; fires VoidFix on confirmed delivery.</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleRefreshPending(true)} disabled={refreshingPending} className="h-8 gap-1 text-[11px] shrink-0">
                  {refreshingPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sync Status
                </Button>
              </div>
              {logs.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">No drops yet.</div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded bg-background/30 hover:bg-background/60">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-foreground">{fmtPhone(log.phone)}</div>
                        <div className="text-[10px] text-muted-foreground">{fmtTime(log.created_at)}</div>
                      </div>
                      {statusBadge(log.status)}
                      {log.response?.voidfix_followup_sent && <Badge variant="outline" className="text-[10px]">SMS sent</Badge>}
                      {log.activity_token && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRefreshLog(log)}
                          disabled={refreshingLog === log.id}
                          className="h-6 w-6 p-0"
                        >
                          {refreshingLog === log.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-3 text-center">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
