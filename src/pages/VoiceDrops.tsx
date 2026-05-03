import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Voicemail, RefreshCw, Plus, Trash2, CheckCircle2, XCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lrTestConnection, lrRefreshStatus, type LRTestResult } from "@/lib/leadsrain";
import SendVoiceDropModal from "@/components/voicedrops/SendVoiceDropModal";

type Conn = LRTestResult | null;

export default function VoiceDrops() {
  const [conn, setConn] = useState<Conn>(null);
  const [testing, setTesting] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [drops, setDrops] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [egressIps, setEgressIps] = useState<string[] | null>(null);
  const [loadingIp, setLoadingIp] = useState(false);

  // Settings form state
  const [followup, setFollowup] = useState(true);
  const [tmpl, setTmpl] = useState("");
  const [transferOn, setTransferOn] = useState(false);
  const [transferNum, setTransferNum] = useState("");
  const [defaultCallerId, setDefaultCallerId] = useState("");

  // New campaign form
  const [newName, setNewName] = useState("");
  const [newCallerId, setNewCallerId] = useState("");
  const [newAudio, setNewAudio] = useState("");
  const [newProviderCampaign, setNewProviderCampaign] = useState("");
  const [newProviderList, setNewProviderList] = useState("");

  async function loadAll() {
    const [c, d, s] = await Promise.all([
      supabase.from("leadsrain_campaigns").select("*").order("is_active", { ascending: false }),
      supabase.from("leadsrain_drops").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("leadsrain_settings").select("*").limit(1).maybeSingle(),
    ]);
    setCampaigns(c.data || []);
    setDrops(d.data || []);
    setSettings(s.data);
    if (s.data) {
      setFollowup(s.data.enable_voidfix_followup);
      setTmpl(s.data.voidfix_template || "");
      setTransferOn(s.data.enable_transfer);
      setTransferNum(s.data.transfer_number || "");
      setDefaultCallerId(s.data.default_caller_id || "");
    }
  }

  async function testConn() {
    setTesting(true);
    try {
      const r = await lrTestConnection();
      setConn(r);
      r.success ? toast.success(r.message) : toast.error(r.message);
    } catch (e: any) { toast.error(e?.message); }
    finally { setTesting(false); }
  }

  async function fetchEgressIp() {
    setLoadingIp(true);
    try {
      const { data, error } = await supabase.functions.invoke("leadsrain-egress-ip");
      if (error) throw error;
      setEgressIps(data?.ips || []);
      if (data?.primary_ip) {
        await navigator.clipboard.writeText(data.primary_ip).catch(() => {});
        toast.success(`Egress IP: ${data.primary_ip} (copied)`);
      } else {
        toast.error("Could not detect egress IP");
      }
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoadingIp(false); }
  }

  useEffect(() => { loadAll(); testConn(); /* eslint-disable-next-line */ }, []);

  async function saveSettings() {
    const { error } = await supabase.from("leadsrain_settings").update({
      enable_voidfix_followup: followup,
      voidfix_template: tmpl,
      enable_transfer: transferOn,
      transfer_number: transferNum || null,
      default_caller_id: defaultCallerId || null,
    }).eq("singleton", true);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    loadAll();
  }

  async function addCampaign() {
    if (!newName) return toast.error("Name required");
    const { error } = await supabase.from("leadsrain_campaigns").insert({
      campaign_name: newName,
      caller_id: newCallerId || null,
      audio_url: newAudio || null,
      provider_campaign_id: newProviderCampaign || null,
      provider_list_id: newProviderList || null,
      is_active: campaigns.length === 0,
    });
    if (error) return toast.error(error.message);
    setNewName(""); setNewCallerId(""); setNewAudio(""); setNewProviderCampaign(""); setNewProviderList("");
    toast.success("Campaign added");
    loadAll();
  }

  async function setActive(id: string) {
    await supabase.from("leadsrain_campaigns").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("leadsrain_campaigns").update({ is_active: true }).eq("id", id);
    loadAll();
  }
  async function delCampaign(id: string) {
    if (!confirm("Delete this campaign reference? (Doesn't delete from LeadsRain)")) return;
    await supabase.from("leadsrain_campaigns").delete().eq("id", id);
    loadAll();
  }
  async function refreshDrop(id: string) {
    try { await lrRefreshStatus(id); toast.success("Status refreshed"); loadAll(); }
    catch (e: any) { toast.error(e?.message); }
  }

  const stats = {
    total: drops.length,
    sent: drops.filter(d => d.status === "sent").length,
    delivered: drops.filter(d => d.status === "delivered").length,
    failed: drops.filter(d => ["failed", "rejected"].includes(d.status)).length,
    voidfix: drops.filter(d => d.voidfix_sms_sent_at).length,
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Voicemail className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold">Voice Drops</h1>
            <p className="text-xs text-muted-foreground">Ringless voicemail via LeadsRain → VoidFix SMS follow-up</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={conn?.success ? "default" : "destructive"} className={conn?.success ? "bg-emerald-600" : ""}>
            {conn?.success ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</> : <><XCircle className="h-3 w-3 mr-1" /> {conn ? "Disconnected" : "Checking…"}</>}
          </Badge>
          <Button size="sm" variant="outline" onClick={testConn} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Test
          </Button>
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black" onClick={() => setTestOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Send Test Drop
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recent">Recent Drops</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[["Total", stats.total], ["Sent", stats.sent], ["Delivered", stats.delivered], ["Failed", stats.failed], ["VoidFix SMS", stats.voidfix]].map(([k, v]) => (
              <Card key={k as string}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="text-2xl font-bold">{v}</div></CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Active Campaign</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {campaigns.find(c => c.is_active) ? (
                <div className="space-y-1">
                  <div><span className="text-muted-foreground">Name:</span> {campaigns.find(c => c.is_active)!.campaign_name}</div>
                  <div><span className="text-muted-foreground">Caller ID:</span> {campaigns.find(c => c.is_active)!.caller_id || "—"}</div>
                  <div><span className="text-muted-foreground">Provider list:</span> {campaigns.find(c => c.is_active)!.provider_list_id || <span className="text-amber-400">missing</span>}</div>
                </div>
              ) : <span className="text-muted-foreground">No active campaign. Add one in the Campaigns tab.</span>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent">
          <DropsTable drops={drops} onRefresh={refreshDrop} />
        </TabsContent>

        <TabsContent value="failed">
          <DropsTable drops={drops.filter(d => ["failed", "rejected"].includes(d.status))} onRefresh={refreshDrop} />
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Add Campaign Reference</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Create the campaign in your LeadsRain dashboard first (with audio + caller ID + lead list), then paste its IDs here.</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Campaign name" value={newName} onChange={e => setNewName(e.target.value)} />
                <Input placeholder="Caller ID (+1...)" value={newCallerId} onChange={e => setNewCallerId(e.target.value)} />
                <Input placeholder="Audio URL (display)" value={newAudio} onChange={e => setNewAudio(e.target.value)} />
                <Input placeholder="LeadsRain campaign_id" value={newProviderCampaign} onChange={e => setNewProviderCampaign(e.target.value)} />
                <Input placeholder="LeadsRain list_id (required)" value={newProviderList} onChange={e => setNewProviderList(e.target.value)} className="col-span-2" />
              </div>
              <Button size="sm" onClick={addCampaign}><Plus className="h-4 w-4 mr-1" /> Add</Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {campaigns.map(c => (
              <Card key={c.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-semibold flex items-center gap-2">
                      {c.campaign_name}
                      {c.is_active && <Badge className="bg-emerald-600">Active</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">List: {c.provider_list_id || "—"} · Caller: {c.caller_id || "—"}</div>
                  </div>
                  <div className="flex gap-1">
                    {!c.is_active && <Button size="sm" variant="outline" onClick={() => setActive(c.id)}>Set Active</Button>}
                    <Button size="sm" variant="ghost" onClick={() => delCampaign(c.id)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">Outbound IP (informational)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">
                LeadsRain authenticates by <strong>username + API key</strong> only — no IP whitelisting required.
                This button is provided for diagnostics only.
              </p>
              <Button size="sm" variant="outline" onClick={fetchEgressIp} disabled={loadingIp}>
                {loadingIp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Detect Outbound IP
              </Button>
              {egressIps && egressIps.length > 0 && (
                <div className="rounded border border-border p-3 space-y-1">
                  {egressIps.map((ip) => (
                    <div key={ip} className="flex items-center justify-between font-mono text-xs">
                      <span>{ip}</span>
                      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(ip); toast.success("Copied"); }}>Copy</Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Connection Diagnostics</CardTitle>
              <Button size="sm" onClick={testConn} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Test Connection
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!conn && <p className="text-xs text-muted-foreground">Click "Test Connection" to probe LeadsRain endpoints (s1, s2, s3, app).</p>}
              {conn && (
                <>
                  <div className={`rounded border p-3 ${conn.success ? "border-emerald-600/50 bg-emerald-600/5" : "border-red-600/50 bg-red-600/5"}`}>
                    <div className="font-medium">{conn.success ? "✅ Connected" : "❌ Not Connected"}</div>
                    <div className="text-xs text-muted-foreground mt-1">{conn.message}</div>
                    {conn.egress_ip && (
                      <div className="text-xs mt-2">
                        Outbound IP: <span className="font-mono">{conn.egress_ip}</span>
                        <Button size="sm" variant="ghost" className="h-5 ml-2 px-2" onClick={() => { navigator.clipboard.writeText(conn.egress_ip!); toast.success("Copied"); }}>Copy</Button>
                      </div>
                    )}
                    {conn.username && <div className="text-xs mt-1">Username: <span className="font-mono">{conn.username}</span></div>}
                  </div>
                  {conn.attempts && conn.attempts.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Per-endpoint results:</div>
                      {conn.attempts.map((a, i) => (
                        <details key={i} open={!a.ok} className="rounded border border-border p-2 text-xs">
                          <summary className="cursor-pointer flex items-center gap-2">
                            {a.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                            <span className="font-medium">{a.ok ? "OK" : "FAIL"}</span>
                            <span className="text-muted-foreground">HTTP {a.http_status || "—"} · {a.duration_ms}ms</span>
                          </summary>
                          <div className="mt-2 space-y-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Endpoint</div>
                              <div className="flex items-center gap-2">
                                <code className="font-mono break-all flex-1">{a.url}</code>
                                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { navigator.clipboard.writeText(a.url); toast.success("Copied"); }}>Copy</Button>
                              </div>
                            </div>
                            {a.error && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Error</div>
                                <div className="text-red-400">{a.error}</div>
                              </div>
                            )}
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Response body</div>
                              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-muted-foreground">
{a.body_preview || "(no response body)"}
                              </pre>
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">LeadsRain Integration Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Default Caller ID</Label>
                <Input value={defaultCallerId} onChange={e => setDefaultCallerId(e.target.value)} placeholder="+1XXXXXXXXXX" />
              </div>
              <div className="flex items-center justify-between rounded border border-border p-3">
                <div>
                  <div className="text-sm font-medium">VoidFix SMS after successful drop</div>
                  <div className="text-xs text-muted-foreground">Fires once per drop, on send success.</div>
                </div>
                <Switch checked={followup} onCheckedChange={setFollowup} />
              </div>
              <div>
                <Label className="text-xs">VoidFix SMS template</Label>
                <Textarea value={tmpl} onChange={e => setTmpl(e.target.value)} rows={2} />
              </div>
              <div className="flex items-center justify-between rounded border border-border p-3">
                <div className="text-sm font-medium">Enable transfer (if supported by plan)</div>
                <Switch checked={transferOn} onCheckedChange={setTransferOn} />
              </div>
              {transferOn && (
                <div>
                  <Label className="text-xs">Transfer number</Label>
                  <Input value={transferNum} onChange={e => setTransferNum(e.target.value)} placeholder="+1XXXXXXXXXX" />
                </div>
              )}
              <Button onClick={saveSettings}>Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debug">
          <Card>
            <CardHeader><CardTitle className="text-sm">Last 20 LeadsRain raw responses</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto space-y-2 text-xs">
                {drops.slice(0, 20).map(d => (
                  <details key={d.id} className="rounded border border-border p-2">
                    <summary className="cursor-pointer">{new Date(d.created_at).toLocaleString()} — {d.phone_number} — {d.status}</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(d.raw_response, null, 2)}</pre>
                  </details>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SendVoiceDropModal open={testOpen} onOpenChange={setTestOpen} onSent={() => loadAll()} />
    </div>
  );
}

function statusColor(s: string) {
  if (s === "delivered") return "bg-emerald-600";
  if (s === "sent") return "bg-blue-600";
  if (s === "queued" || s === "pending") return "bg-amber-600";
  return "bg-red-600";
}

function DropsTable({ drops, onRefresh }: { drops: any[]; onRefresh: (id: string) => void }) {
  if (drops.length === 0) return <div className="text-sm text-muted-foreground p-6">No drops yet.</div>;
  return (
    <div className="space-y-1">
      {drops.map(d => (
        <Card key={d.id}>
          <CardContent className="p-3 flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge className={statusColor(d.status)}>{d.status}</Badge>
                <span className="font-mono">{d.phone_number}</span>
                {d.voidfix_sms_sent_at && <Badge variant="outline" className="text-emerald-400 border-emerald-400/40">SMS ✓</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Sent {new Date(d.created_at).toLocaleString()}
                {d.error_message && <span className="text-red-400"> · {d.error_message}</span>}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onRefresh(d.id)}><RefreshCw className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
