import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, PhoneIncoming, Radio, AlertCircle, CheckCircle2, Clock, Webhook, Download } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const TWILIO_LANDLINE = '+17028298105';

type LogRow = {
  id: string;
  event: string;
  level: string;
  from_number: string | null;
  to_number: string | null;
  message_sid: string | null;
  body: string | null;
  elapsed_ms: number | null;
  metadata: any;
  created_at: string;
};

function fmtPhone(raw: string | null | undefined) {
  const d = String(raw || '').replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return raw || '';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function eventStyle(event: string, level: string) {
  if (level === 'error') return { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/40', icon: AlertCircle };
  if (level === 'warn') return { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/40', icon: AlertCircle };
  if (event.startsWith('webhook:received')) return { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/40', icon: PhoneIncoming };
  if (event.startsWith('auto-reply')) return { color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/40', icon: Webhook };
  if (event.startsWith('bg:') && event.endsWith(':done')) return { color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/30', icon: CheckCircle2 };
  if (event.startsWith('bg:') && event.endsWith(':failed')) return { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/40', icon: AlertCircle };
  if (event === 'webhook:ack') return { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/40', icon: CheckCircle2 };
  return { color: 'text-muted-foreground', bg: 'bg-muted/30 border-border', icon: Clock };
}

export default function TwilioInboundFeed() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('twilio_inbound_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs((data as LogRow[]) || []);
    setLoading(false);
  }, []);

  const syncFromTwilio = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-inbound-poll', { body: {} });
      if (error || !(data as any)?.ok) {
        if (!silent) toast.error((data as any)?.error || error?.message || 'Twilio sync failed');
      } else if (!silent) {
        const d = data as any;
        toast.success(`Synced ${d.fetched} from Twilio (${d.new} new)`);
      }
      await load();
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    load();
    syncFromTwilio(true);
  }, [load, syncFromTwilio]);

  // Auto-poll Twilio every 20s as a near-realtime fallback in case the webhook is misconfigured
  useEffect(() => {
    const t = setInterval(() => syncFromTwilio(true), 20_000);
    return () => clearInterval(t);
  }, [syncFromTwilio]);

  // Realtime — append new rows as they land
  useEffect(() => {
    const channel = supabase
      .channel('twilio-inbound-logs-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'twilio_inbound_logs' },
        (payload) => {
          setLogs((prev) => [payload.new as LogRow, ...prev].slice(0, 300));
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, []);

  const stats = useMemo(() => {
    const received = logs.filter((l) => l.event === 'webhook:received' || l.event === 'twilio-poll:received').length;
    const replies = logs.filter((l) => l.event === 'auto-reply:scheduled').length;
    const errors = logs.filter((l) => l.level === 'error').length;
    return { received, replies, errors };
  }, [logs]);

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
                <Radio className={`h-2.5 w-2.5 mr-1 ${live ? 'animate-pulse' : ''}`} />
                {live ? 'LIVE' : 'CONNECTING'}
              </Badge>
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono">
              REST poll every 20s + webhook · {fmtPhone(TWILIO_LANDLINE)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-[11px]">
            <span className="text-emerald-400">RECEIVED: {stats.received}</span>
            <span className="text-purple-400">REPLIES: {stats.replies}</span>
            {stats.errors > 0 && <span className="text-red-400">ERR: {stats.errors}</span>}
          </div>
          <Button size="sm" variant="outline" onClick={() => syncFromTwilio(false)} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
            Sync Twilio
          </Button>
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
        ) : logs.length === 0 ? (
          <div className="text-center py-10">
            <Webhook className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Waiting for inbound webhook activity…</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">{fmtPhone(TWILIO_LANDLINE)}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((l) => {
              const s = eventStyle(l.event, l.level);
              const Icon = s.icon;
              return (
                <div key={l.id} className={`border rounded-lg p-2.5 ${s.bg}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${s.color}`} />
                      <span className={`text-xs font-mono font-semibold ${s.color}`}>{l.event}</span>
                      {l.from_number && (
                        <span className="text-[11px] font-mono text-foreground/80 truncate">
                          {fmtPhone(l.from_number)} → {fmtPhone(l.to_number)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {l.elapsed_ms != null && <span className="font-mono">{l.elapsed_ms}ms</span>}
                      <span>{format(new Date(l.created_at), 'h:mm:ss.SSS a')}</span>
                    </div>
                  </div>
                  {l.body && (
                    <p className="text-xs text-foreground/90 mt-1.5 pl-5 whitespace-pre-wrap break-words line-clamp-3">"{l.body}"</p>
                  )}
                  {l.message_sid && (
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-1 pl-5 truncate">sid: {l.message_sid}</p>
                  )}
                  {l.metadata && Object.keys(l.metadata).length > 0 && (
                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-1 pl-5 truncate">
                      {Object.entries(l.metadata).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
