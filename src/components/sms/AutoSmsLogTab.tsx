import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type LogRow = {
  id: string;
  to_address: string | null;
  body: string | null;
  status: string | null;
  created_at: string;
  metadata: any;
  customer_id: string | null;
};

// Sources considered "automated" (system/trigger-driven, not manual user typing)
const AUTO_SOURCES = [
  'voidfix-first-time-auto-reply',
  'twilio-auto-reply-voidfix',
  'powerdial-voicemail-drop-sms',
  'powerdial-dropped-call-sms',
  'vapi-auto-reply',
  'vapi-hangup-auto-reply',
  'sms-sequence-engine',
  'scheduled-sms-worker',
  'hook-reply-followup',
  'hook-reply-followup-cron',
  'voidfix-mms-resend-instruction',
  'sms_blast',
  'campaign-leader',
  'autoresponder',
  'funnel-autoresponder',
];

const SOURCE_LABELS: Record<string, string> = {
  'voidfix-first-time-auto-reply': 'First-Time Auto-Reply',
  'twilio-auto-reply-voidfix': 'Twilio Auto-Reply',
  'powerdial-voicemail-drop-sms': 'Voicemail Drop SMS',
  'powerdial-dropped-call-sms': 'Dropped Call SMS',
  'vapi-auto-reply': 'Vapi Auto-Reply',
  'vapi-hangup-auto-reply': 'Vapi Hangup Auto-Reply',
  'sms-sequence-engine': 'Sequence Step',
  'scheduled-sms-worker': 'Scheduled Job',
  'hook-reply-followup': 'Hook Reply Followup',
  'hook-reply-followup-cron': 'Hook Reply Cron',
  'voidfix-mms-resend-instruction': 'MMS Resend',
  'sms_blast': 'SMS Blast',
  'campaign-leader': 'Campaign Leader',
  'autoresponder': 'Autoresponder',
  'funnel-autoresponder': 'Funnel Autoresponder',
};

function sourceColor(source: string): string {
  if (source.includes('vapi')) return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
  if (source.includes('voicemail')) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  if (source.includes('sequence') || source.includes('scheduled')) return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
  if (source.includes('hook')) return 'bg-pink-500/20 text-pink-300 border-pink-500/40';
  if (source.includes('blast') || source.includes('campaign')) return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
  if (source.includes('first-time') || source.includes('auto-reply')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  return 'bg-muted text-muted-foreground border-border';
}

export default function AutoSmsLogTab() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('communications')
      .select('id, to_address, body, status, created_at, metadata, customer_id')
      .eq('type', 'sms')
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(500);
    const filtered = (data || []).filter((r: any) => {
      const src = r?.metadata?.source;
      return src && AUTO_SOURCES.includes(src);
    });
    setRows(filtered as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('auto-sms-log')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications' }, (payload: any) => {
        const r = payload.new;
        if (r?.type === 'sms' && r?.direction === 'outbound' && AUTO_SOURCES.includes(r?.metadata?.source)) {
          setRows((prev) => [r as LogRow, ...prev].slice(0, 500));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const visibleSources = Array.from(new Set(rows.map((r) => r.metadata?.source).filter(Boolean)));

  const visible = rows.filter((r) => {
    if (filterSource !== 'all' && r.metadata?.source !== filterSource) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (r.to_address || '').toLowerCase().includes(q) ||
        (r.body || '').toLowerCase().includes(q) ||
        (r.metadata?.source || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold">Auto-SMS Audit Log</h3>
          <Badge variant="outline" className="text-[10px]">{visible.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search phone, body, source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 text-xs"
          />
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="h-8 text-xs rounded-md border border-border bg-background px-2"
          >
            <option value="all">All triggers</option>
            {visibleSources.map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={load} className="h-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Records every system-triggered outbound SMS (auto-replies, sequences, voicemail drops, blasts, etc.). Manual messages typed from the inbox are excluded.
      </p>

      <ScrollArea className="h-[600px]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No auto-SMS logged yet</p>
        ) : (
          <div className="space-y-2">
            {visible.map((r) => {
              const src = r.metadata?.source || 'unknown';
              const label = SOURCE_LABELS[src] || src;
              const trigger = r.metadata?.trigger || r.metadata?.triggered_by || r.metadata?.call_log_id || r.metadata?.sequence_id || null;
              return (
                <div key={r.id} className="border border-border rounded-lg p-3 bg-background/40">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${sourceColor(src)}`}>{label}</Badge>
                      <span className="text-xs font-mono">{r.to_address || '—'}</span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${r.status === 'sent' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-red-500/15 text-red-300 border-red-500/30'}`}
                      >
                        {r.status || 'unknown'}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground" title={new Date(r.created_at).toLocaleString()}>
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-3">{r.body}</p>
                  {trigger && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 font-mono truncate">trigger: {String(trigger)}</p>
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
