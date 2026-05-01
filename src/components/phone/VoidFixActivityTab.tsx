import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Smartphone, MessageSquare, PhoneMissed, PhoneIncoming, PhoneOutgoing,
  RefreshCw, Send, Search, ChevronDown, ChevronUp, Loader2, Inbox, Filter,
} from 'lucide-react';
import { format, isToday, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

type SmsRow = {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  phone_number: string | null;
  from_address: string | null;
  to_address: string | null;
  body: string | null;
  provider: string | null;
  created_at: string;
  customer_id: string | null;
  metadata: any;
};

type CallRow = {
  id: string;
  phone: string;
  twilio_status: string | null;
  disposition: string | null;
  amd_result: string | null;
  customer_id: string | null;
  created_at: string;
  meta: any;
  direction?: 'inbound' | 'outbound' | null;
  source?: 'twilio' | 'voidfix';
};

type Filter = 'all' | 'missed' | 'inbound_sms' | 'outbound_sms' | 'today' | 'week' | 'unmatched';

function normalizeLast10(p?: string | null): string {
  if (!p) return '';
  return (p.match(/\d/g) || []).join('').slice(-10);
}
function fmtPhone(p?: string | null): string {
  const d = normalizeLast10(p);
  if (d.length !== 10) return p || '';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function VoidFixActivityTab() {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sms, setSms] = useState<SmsRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [customersById, setCustomersById] = useState<Record<string, { full_name: string; phone: string | null }>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = subDays(new Date(), 30).toISOString();

      const [{ data: smsData }, { data: callData }, { data: voidfixCallData }] = await Promise.all([
        supabase
          .from('communications')
          .select('id, direction, status, phone_number, from_address, to_address, body, provider, created_at, customer_id, metadata')
          .eq('type', 'sms')
          .eq('provider', 'voidfix')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('powerdial_call_logs')
          .select('id, phone, twilio_status, disposition, amd_result, customer_id, created_at, meta, source, missed, dial_call_status')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('communications')
          .select('id, direction, status, phone_number, from_address, to_address, created_at, customer_id, metadata')
          .eq('type', 'call')
          .eq('provider', 'voidfix')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      const smsRows = (smsData || []) as SmsRow[];
      const twilioCallRows: CallRow[] = (callData || []).map((r: any) => {
        // Inbound forwarded calls (VoidFix → Twilio → Verizon) come through with source='twilio_forwarded_voidfix'
        const isForwardedInbound = (r.source || '').includes('twilio_forwarded') || r.meta?.inbound === true;
        return {
          ...r,
          source: 'twilio' as const,
          direction: (isForwardedInbound ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
        };
      });
      const voidfixCallRows: CallRow[] = (voidfixCallData || []).map((r: any) => ({
        id: r.id,
        phone: r.phone_number || r.from_address || r.to_address || '',
        twilio_status: r.status,
        disposition: r.status,
        amd_result: null,
        customer_id: r.customer_id,
        created_at: r.created_at,
        meta: r.metadata,
        direction: r.direction,
        source: 'voidfix' as const,
      }));
      const callRows: CallRow[] = [...voidfixCallRows, ...twilioCallRows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSms(smsRows);
      setCalls(callRows);

      const ids = Array.from(new Set([
        ...smsRows.map(r => r.customer_id),
        ...callRows.map(r => r.customer_id),
      ].filter(Boolean))) as string[];

      if (ids.length) {
        const { data: cust } = await supabase
          .from('customers')
          .select('id, full_name, phone')
          .in('id', ids);
        const map: Record<string, { full_name: string; phone: string | null }> = {};
        (cust || []).forEach((c: any) => { map[c.id] = { full_name: c.full_name, phone: c.phone }; });
        setCustomersById(map);
      } else {
        setCustomersById({});
      }
      setLastSync(new Date());
    } catch (e: any) {
      console.error('[VoidFixActivity] load error', e);
      toast.error('Failed to load VoidFix activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Realtime subscription for new SMS
  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel('voidfix-activity')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'communications',
        filter: 'provider=eq.voidfix',
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, load]);

  const pullVoidfix = async () => {
    setSyncing(true);
    try {
      const [smsRes, callsRes] = await Promise.all([
        supabase.functions.invoke('powerdial-sms', { body: { action: 'poll' } }),
        supabase.functions.invoke('powerdial-sms', { body: { action: 'poll_calls' } }),
      ]);
      if (smsRes.error && callsRes.error) throw smsRes.error;
      const smsImported = (smsRes.data as any)?.imported ?? 0;
      const callsImported = (callsRes.data as any)?.imported ?? 0;
      toast.success(`Synced VoidFix: ${smsImported} new SMS, ${callsImported} new calls`);
      await load();
    } catch (e: any) {
      await load();
      toast.message('Refreshed from database');
    } finally {
      setSyncing(false);
    }
  };

  // Helper: detect missed call across both sources
  const isMissedCall = (c: CallRow) => {
    if ((c as any).missed === true) return true;
    const s = (c.twilio_status || '').toLowerCase();
    const d = ((c as any).dial_call_status || '').toLowerCase();
    if (['no-answer', 'busy', 'failed', 'missed', 'canceled'].includes(s)) return true;
    if (['no-answer', 'busy', 'failed', 'canceled'].includes(d)) return true;
    return (c.disposition || '').toLowerCase().includes('miss');
  };

  // Stats (today)
  const stats = useMemo(() => {
    const todaySms = sms.filter(s => isToday(new Date(s.created_at)));
    const todayCalls = calls.filter(c => isToday(new Date(c.created_at)));
    return {
      missedToday: todayCalls.filter(isMissedCall).length,
      inboundToday: todaySms.filter(s => s.direction === 'inbound').length,
      outboundToday: todaySms.filter(s => s.direction === 'outbound').length,
    };
  }, [sms, calls]);

  // Combined feed for filtering
  type FeedItem =
    | { kind: 'sms'; row: SmsRow; ts: number }
    | { kind: 'call'; row: CallRow; ts: number };

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [
      ...sms.map(r => ({ kind: 'sms' as const, row: r, ts: new Date(r.created_at).getTime() })),
      ...calls.map(r => ({ kind: 'call' as const, row: r, ts: new Date(r.created_at).getTime() })),
    ];
    items.sort((a, b) => b.ts - a.ts);
    return items;
  }, [sms, calls]);

  const filteredFeed = useMemo(() => {
    const weekAgo = subDays(new Date(), 7).getTime();
    const q = search.trim().toLowerCase();
    return feed.filter(item => {
      // filter
      if (filter === 'missed') {
        if (item.kind !== 'call') return false;
        if (!isMissedCall(item.row)) return false;
      }
      if (filter === 'inbound_sms' && !(item.kind === 'sms' && item.row.direction === 'inbound')) return false;
      if (filter === 'outbound_sms' && !(item.kind === 'sms' && item.row.direction === 'outbound')) return false;
      if (filter === 'today' && !isToday(new Date(item.kind === 'sms' ? item.row.created_at : item.row.created_at))) return false;
      if (filter === 'week' && item.ts < weekAgo) return false;
      if (filter === 'unmatched' && item.row.customer_id) return false;

      if (q) {
        const phone = item.kind === 'sms' ? (item.row.phone_number || item.row.from_address || item.row.to_address) : item.row.phone;
        const name = item.row.customer_id ? customersById[item.row.customer_id]?.full_name : '';
        const body = item.kind === 'sms' ? (item.row.body || '') : '';
        const hay = `${phone} ${name} ${body}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [feed, filter, search, customersById]);

  const openSend = (phone?: string) => {
    setSendTo(phone || '');
    setSendBody('');
    setSendOpen(true);
  };

  const sendSms = async () => {
    const last10 = normalizeLast10(sendTo);
    if (last10.length !== 10) { toast.error('Enter a valid 10-digit US phone'); return; }
    if (!sendBody.trim()) { toast.error('Message required'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('powerdial-sms', {
        body: { action: 'send', to: `+1${last10}`, message: sendBody.trim(), source: 'phone-voidfix-tab' },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || 'send failed');
      toast.success('Text sent via VoidFix');
      setSendOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const callTypeBadge = (c: CallRow) => {
    if (isMissedCall(c)) {
      return <Badge variant="destructive" className="gap-1 text-[10px]"><PhoneMissed className="h-3 w-3" />Missed</Badge>;
    }
    const s = (c.twilio_status || '').toLowerCase();
    if (s === 'completed') {
      return c.direction === 'inbound'
        ? <Badge variant="secondary" className="gap-1 text-[10px]"><PhoneIncoming className="h-3 w-3" />Inbound</Badge>
        : <Badge variant="secondary" className="gap-1 text-[10px]"><PhoneOutgoing className="h-3 w-3" />Outbound</Badge>;
    }
    return <Badge variant="outline" className="gap-1 text-[10px]"><PhoneOutgoing className="h-3 w-3" />{c.twilio_status || 'unknown'}</Badge>;
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left">
          <Smartphone className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">VoidFix Activity</h2>
          <Badge variant="secondary" className="text-[10px]">Android Device</Badge>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <div className="flex items-center gap-2">
          {lastSync && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Synced {format(lastSync, 'h:mm a')}
            </span>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={pullVoidfix} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openSend()}>
            <Send className="h-3.5 w-3.5" /> Send Text
          </Button>
        </div>
      </div>

      {open && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={<MessageSquare className="h-4 w-4 text-primary" />} label="Inbound SMS today" value={stats.inboundToday} />
            <StatCard icon={<Send className="h-4 w-4 text-primary" />} label="Outbound SMS today" value={stats.outboundToday} />
            <StatCard icon={<Smartphone className="h-4 w-4 text-emerald-500" />} label="Device" value="Online" small />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search number, name, message…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterPill>
            <FilterPill active={filter === 'inbound_sms'} onClick={() => setFilter('inbound_sms')}>Inbound SMS</FilterPill>
            <FilterPill active={filter === 'outbound_sms'} onClick={() => setFilter('outbound_sms')}>Outbound SMS</FilterPill>
            <FilterPill active={filter === 'today'} onClick={() => setFilter('today')}>Today</FilterPill>
            <FilterPill active={filter === 'week'} onClick={() => setFilter('week')}>This week</FilterPill>
            <FilterPill active={filter === 'unmatched'} onClick={() => setFilter('unmatched')}>Unmatched</FilterPill>
          </div>

          {/* Feed */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Loading activity…
              </div>
            ) : filteredFeed.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <Inbox className="h-6 w-6 mx-auto mb-2 opacity-40" />
                No activity matches these filters.
              </div>
            ) : (
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Phone / Lead</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFeed.slice(0, 200).map(item => {
                      const phoneRaw = item.kind === 'sms'
                        ? (item.row.direction === 'inbound' ? item.row.from_address : item.row.to_address) || item.row.phone_number
                        : item.row.phone;
                      const phone = fmtPhone(phoneRaw);
                      const cust = item.row.customer_id ? customersById[item.row.customer_id] : null;
                      return (
                        <tr key={`${item.kind}-${item.row.id}`} className="border-t border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2 align-top">
                            {item.kind === 'sms' ? (
                              item.row.direction === 'inbound'
                                ? <Badge variant="secondary" className="gap-1 text-[10px]"><MessageSquare className="h-3 w-3" />In</Badge>
                                : <Badge variant="outline" className="gap-1 text-[10px]"><Send className="h-3 w-3" />Out</Badge>
                            ) : callTypeBadge(item.row)}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="font-mono text-foreground">{phone || '—'}</div>
                            {cust ? (
                              <div className="text-[10px] text-primary">{cust.full_name}</div>
                            ) : (
                              <div className="text-[10px] text-muted-foreground italic">unmatched</div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top max-w-[320px]">
                            {item.kind === 'sms' ? (
                              <div className="truncate text-muted-foreground" title={item.row.body || ''}>
                                {item.row.body || '—'}
                              </div>
                            ) : (
                              <div className="text-muted-foreground">
                                {item.row.disposition || item.row.amd_result || item.row.twilio_status || '—'}
                              </div>
                            )}
                            {item.kind === 'sms' && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Status: {item.row.status}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top text-muted-foreground whitespace-nowrap">
                            {format(new Date(item.kind === 'sms' ? item.row.created_at : item.row.created_at), 'MMM d, h:mm a')}
                          </td>
                          <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                            <Button
                              size="sm" variant="ghost" className="h-7 text-[11px] gap-1"
                              onClick={() => openSend(phoneRaw || '')}
                            >
                              <Send className="h-3 w-3" />Text
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Send SMS modal */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Send Text via VoidFix
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Recipient phone</Label>
              <Input
                value={sendTo}
                onChange={e => setSendTo(e.target.value)}
                placeholder="(555) 123-4567"
                className="font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea
                value={sendBody}
                onChange={e => setSendBody(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Type your message…"
              />
              <div className="text-[10px] text-muted-foreground text-right mt-1">{sendBody.length}/1000</div>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Sends from your connected Android device via VoidFix.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={sendSms} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: number | string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className={cn('mt-1 font-bold text-foreground', small ? 'text-base' : 'text-2xl')}>
        {value}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-md text-[11px] font-medium border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border/50 hover:bg-muted/40'
      )}
    >
      {children}
    </button>
  );
}
