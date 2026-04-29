import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, PhoneIncoming, Radio } from 'lucide-react';
import { format } from 'date-fns';

const TWILIO_LANDLINE = '+17028298105';
const LANDLINE_LAST10 = '7028298105';

type SMSRow = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  from_address: string | null;
  to_address: string | null;
  status: string;
  external_id: string | null;
  created_at: string;
  provider: string | null;
  metadata: any;
};

function last10(raw: string | null | undefined) {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

function fmtPhone(raw: string | null | undefined) {
  const d = last10(raw);
  if (d.length !== 10) return raw || '';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function TwilioInboundFeed() {
  const [rows, setRows] = useState<SMSRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // Inbound to the Twilio landline OR outbound VoidFix auto-replies bridging that webhook
    const { data } = await supabase
      .from('communications')
      .select('id, direction, body, from_address, to_address, status, external_id, created_at, provider, metadata')
      .eq('type', 'sms')
      .order('created_at', { ascending: false })
      .limit(200);

    const filtered = ((data as SMSRow[]) || []).filter((m) => {
      // Inbound landed on the Twilio landline
      if (m.direction === 'inbound') {
        if (last10(m.to_address) === LANDLINE_LAST10) return true;
        if (m.provider === 'twilio') return true;
        if (m.metadata?.landline_reply === true) return true;
        if (m.metadata?.twilio_to === TWILIO_LANDLINE) return true;
      }
      // Outbound VoidFix auto-reply bridge tied to the landline webhook
      if (m.direction === 'outbound' && m.metadata?.bridge_from_landline === TWILIO_LANDLINE) return true;
      if (m.direction === 'outbound' && m.metadata?.voidfix_auto_reply === true) return true;
      return false;
    });
    setRows(filtered);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription — refresh on any new sms row
  useEffect(() => {
    const channel = supabase
      .channel('twilio-inbound-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'communications', filter: 'type=eq.sms' },
        () => load(),
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
      });
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const stats = useMemo(() => {
    const inbound = rows.filter((r) => r.direction === 'inbound').length;
    const replies = rows.filter((r) => r.direction === 'outbound').length;
    return { inbound, replies, total: rows.length };
  }, [rows]);

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <PhoneIncoming className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              TWILIO INBOUND
              <Badge variant="outline" className={`text-[9px] px-1.5 ${live ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-muted text-muted-foreground'}`}>
                <Radio className="h-2.5 w-2.5 mr-1" />
                {live ? 'LIVE' : 'CONNECTING'}
              </Badge>
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono">
              Webhook → {fmtPhone(TWILIO_LANDLINE)} · auto-bridges to VoidFix cell
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="text-emerald-400">IN: {stats.inbound}</span>
            <span className="text-blue-400">REPLIES: {stats.replies}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-360px)] min-h-[400px]">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10">
            <PhoneIncoming className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No inbound activity on the Twilio landline yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">{fmtPhone(TWILIO_LANDLINE)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((m) => {
              const isInbound = m.direction === 'inbound';
              return (
                <div
                  key={m.id}
                  className={`border rounded-lg p-3 ${
                    isInbound
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-purple-500/30 bg-purple-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 ${
                          isInbound
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                        }`}
                      >
                        {isInbound ? 'INBOUND → 8105' : 'VOIDFIX AUTO-REPLY'}
                      </Badge>
                      <span className="text-xs font-mono text-foreground">
                        {isInbound ? `from ${fmtPhone(m.from_address)}` : `to ${fmtPhone(m.to_address)}`}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(m.created_at), 'MMM d, h:mm:ss a')}
                    </span>
                  </div>
                  {m.body && (
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">{m.body}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                    <span>{m.status}</span>
                    {m.provider && <span>· {m.provider}</span>}
                    {m.external_id && <span className="font-mono truncate">· {m.external_id.slice(0, 20)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
