import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Phone, MessageSquare } from "lucide-react";

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
  raw?: any;
};

type LocalEvent = {
  id: string;
  phone_number: string | null;
  event_type: string;
  event_source: string | null;
  created_at: string;
};

export default function VoiceDrops() {
  const [campaigns, setCampaigns] = useState<LRCampaign[]>([]);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setRefreshing(true);
    setError(null);
    try {
      // Pull live campaigns straight from LeadsRain via edge function
      const { data, error } = await supabase.functions.invoke("leadsrain-import-campaigns", { body: {} });
      if (error) throw error;
      const list: LRCampaign[] = (data?.campaigns || data?.data || []).map((c: any) => ({
        campaign_id: String(c.campaign_id ?? c.id ?? ""),
        campaign_name: c.campaign_name ?? c.name ?? "Untitled",
        campaign_cid: c.campaign_cid ?? c.caller_id ?? c.cid,
        status: c.status ?? c.campaign_status,
        created_at: c.created_at ?? c.created,
        total_leads: Number(c.total_leads ?? c.leads ?? 0),
        drops_sent: Number(c.drops_sent ?? c.dialed ?? 0),
        delivered: Number(c.delivered ?? c.delivered_count ?? 0),
        list_id: c.list_id ? String(c.list_id) : undefined,
        raw: c,
      }));
      setCampaigns(list);

      // Pull recent local callback/missed/SMS events (logged by Twilio webhook + VoidFix)
      const { data: ev } = await supabase
        .from("voice_drop_events" as any)
        .select("id, phone_number, event_type, event_source, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setEvents((ev as any) || []);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch LeadsRain data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

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
            Live read-only view of LeadsRain ringless voicemail campaigns. Callbacks, missed calls,
            and VoidFix SMS replies are logged through Twilio.
          </p>
        </div>
        <Button onClick={load} disabled={refreshing} variant="outline">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
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
              No LeadsRain campaigns reachable. Create them in your LeadsRain dashboard — they'll appear here.
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
                  <TableRow key={c.campaign_id}>
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
