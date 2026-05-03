import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Phone, MessageSquare, Plus, X } from "lucide-react";

type LRCampaign = {
  campaign_id: string;
  campaign_name: string;
  campaign_cid?: string;
  status?: string;
  created_at?: string;
  total_leads?: number;
  drops_sent?: number;
  delivered?: number;
  list_id?: string;
  _stub?: boolean;
};

type LocalEvent = {
  id: string;
  phone_number: string | null;
  event_type: string;
  event_source: string | null;
  created_at: string;
};

const LS_PINNED = "voicedrops.pinned_ids";
const LS_PROXY = "voicedrops.proxy_url";

export default function VoiceDrops() {
  const [campaigns, setCampaigns] = useState<LRCampaign[]>([]);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_PINNED) || "[]"); } catch { return []; }
  });
  const [proxyUrl, setProxyUrl] = useState<string>(() => localStorage.getItem(LS_PROXY) || "");
  const [newId, setNewId] = useState("");

  useEffect(() => { localStorage.setItem(LS_PINNED, JSON.stringify(pinnedIds)); }, [pinnedIds]);
  useEffect(() => { localStorage.setItem(LS_PROXY, proxyUrl); }, [proxyUrl]);

  const load = async () => {
    setRefreshing(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke("leadsrain-import-campaigns", {
        body: { campaign_ids: pinnedIds, proxy_url: proxyUrl || undefined },
      });
      if (error) throw error;
      const list: LRCampaign[] = (data?.campaigns || []).map((c: any) => ({
        campaign_id: String(c.campaign_id ?? c.id ?? ""),
        campaign_name: c.campaign_name ?? c.name ?? "Untitled",
        campaign_cid: c.campaign_cid ?? c.caller_id ?? c.cid,
        status: c.status ?? c.campaign_status,
        created_at: c.created_at ?? c.created,
        total_leads: Number(c.total_leads ?? c.leads ?? 0),
        drops_sent: Number(c.drops_sent ?? c.dialed ?? 0),
        delivered: Number(c.delivered ?? c.delivered_count ?? 0),
        list_id: c.list_id ? String(c.list_id) : undefined,
        _stub: !!c._stub,
      }));
      setCampaigns(list);
      setInfo(data?.message || null);
      if (!data?.success) setError(data?.message || "LeadsRain unreachable");

      const { data: ev } = await supabase
        .from("voice_drop_events" as any)
        .select("id, phone_number, event_type, event_source, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setEvents((ev as any) || []);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch LeadsRain data");
      toast.error(e?.message || "Failed to fetch LeadsRain data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Run once on mount; re-run when pinned IDs or proxy URL change.
  // (No auto-polling — fixes the "keeps refreshing" loop.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const addPinnedId = () => {
    const id = newId.trim();
    if (!id) return;
    if (pinnedIds.includes(id)) { toast.info("Already pinned"); return; }
    setPinnedIds([...pinnedIds, id]);
    setNewId("");
    toast.success(`Pinned ${id} — refreshing…`);
    setTimeout(load, 50);
  };
  const removePinnedId = (id: string) => setPinnedIds(pinnedIds.filter(x => x !== id));

  const totals = useMemo(() => {
    const sum = (k: keyof LRCampaign) => campaigns.reduce((a, c) => a + (Number(c[k] as any) || 0), 0);
    const callbacks = events.filter(e => e.event_type === "callback_received").length;
    const missed = events.filter(e => e.event_type === "missed_call").length;
    const answered = events.filter(e => e.event_type === "answered_call").length;
    const sms = events.filter(e => e.event_type === "sms_auto_reply_sent").length;
    const drops = sum("drops_sent");
    return {
      campaigns: campaigns.length,
      active: campaigns.filter(c => (c.status || "").toLowerCase() === "active").length,
      leads: sum("total_leads"),
      drops,
      delivered: sum("delivered"),
      callbacks, missed, answered, sms,
      conv: drops > 0 ? `${((callbacks / drops) * 100).toFixed(1)}%` : "0%",
    };
  }, [campaigns, events]);

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Voice Drops</h1>
          <p className="text-muted-foreground max-w-2xl mt-1">
            Live read-only view of LeadsRain RVM campaigns. Callbacks, missed calls, and VoidFix
            SMS replies are logged via Twilio.
          </p>
        </div>
        <Button onClick={load} disabled={refreshing} variant="outline">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* API connection status — shows live campaign names so you know the LeadsRain link is real */}
      <Card className={campaigns.filter(c => !c._stub).length > 0 ? "border-green-500/50 bg-green-500/5" : "border-yellow-500/50 bg-yellow-500/5"}>
        <CardContent className="p-4">
          {campaigns.filter(c => !c._stub).length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-green-500">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                LeadsRain API Connected — {campaigns.filter(c => !c._stub).length} live campaign{campaigns.filter(c => !c._stub).length === 1 ? "" : "s"}
              </div>
              <div className="flex flex-wrap gap-2">
                {campaigns.filter(c => !c._stub).map(c => (
                  <Badge key={c.campaign_id} variant="outline" className="border-green-500/40">
                    {c.campaign_name} <span className="ml-1 opacity-60">#{c.campaign_id}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-yellow-600">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
              Not connected to LeadsRain — no live campaign names received yet
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="text-sm font-medium mb-1">LeadsRain Proxy URL (optional)</div>
            <p className="text-xs text-muted-foreground mb-2">
              LeadsRain s1/s2/s3 are HTTP-only and usually blocked from cloud egress. Deploy the
              Cloudflare Worker in <code>cloudflare-worker/leadsrain-proxy</code> and paste its HTTPS URL here.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="https://leadsrain-proxy.you.workers.dev"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
              />
              <Button onClick={load} variant="secondary" disabled={refreshing}>Save & Reload</Button>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Pin Campaign IDs</div>
            <p className="text-xs text-muted-foreground mb-2">
              Force-load campaigns by ID (useful when the list endpoint is blocked). Example: 368407.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="368407"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addPinnedId(); }}
              />
              <Button onClick={addPinnedId} variant="secondary"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            {pinnedIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {pinnedIds.map(id => (
                  <Badge key={id} variant="secondary" className="gap-1">
                    {id}
                    <button onClick={() => removePinnedId(id)} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}
      {info && !error && (
        <Card><CardContent className="p-3 text-xs text-muted-foreground">{info}</CardContent></Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Campaigns" value={totals.campaigns} />
        <Stat label="Active" value={totals.active} />
        <Stat label="Leads" value={totals.leads} />
        <Stat label="Drops" value={totals.drops} />
        <Stat label="Delivered" value={totals.delivered} />
        <Stat label="Callbacks" value={totals.callbacks} />
        <Stat label="Missed" value={totals.missed} />
        <Stat label="Answered" value={totals.answered} />
        <Stat label="SMS Replies" value={totals.sms} />
        <Stat label="Conversion" value={totals.conv} />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
          ) : campaigns.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No LeadsRain campaigns reachable. Add the proxy URL above or pin a campaign ID.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>LR ID</TableHead>
                  <TableHead>Caller ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Drops</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => (
                  <TableRow key={c.campaign_id} className={c._stub ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{c.campaign_name}</TableCell>
                    <TableCell className="text-xs">{c.campaign_id}</TableCell>
                    <TableCell>{c.campaign_cid || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={(c.status || "").toLowerCase() === "active" ? "default" : "secondary"}>
                        {c.status || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.total_leads ?? 0}</TableCell>
                    <TableCell>{c.drops_sent ?? 0}</TableCell>
                    <TableCell>{c.delivered ?? 0}</TableCell>
                    <TableCell className="text-xs">{c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Recent Activity (Twilio + VoidFix)</h2>
            <p className="text-xs text-muted-foreground">Callbacks, missed calls, and SMS auto-replies tied to campaign callers.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No events yet</TableCell></TableRow>
              ) : events.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{e.phone_number || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{e.event_type}</Badge></TableCell>
                  <TableCell className="text-xs">{e.event_source}</TableCell>
                  <TableCell className="text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {e.phone_number && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => window.open(`tel:+1${e.phone_number}`)}><Phone className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => window.open(`sms:+1${e.phone_number}`)}><MessageSquare className="w-4 h-4" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </CardContent></Card>
  );
}
