import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Send, Ban, X, MessageCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

type HookThread = {
  id: string;
  phone: string;
  phone_last10: string;
  original_outbound_body: string | null;
  inbound_body: string | null;
  inbound_at: string | null;
  sentiment: 'pending' | 'positive' | 'neutral' | 'negative';
  status: 'awaiting_reply' | 'followup_scheduled' | 'followup_sent' | 'dnd' | 'cancelled';
  followup_send_at: string | null;
  followup_sent_at: string | null;
  dnd_reason: string | null;
  created_at: string;
};

function formatPhone(raw: string | null | undefined) {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function sentimentColor(s: HookThread['sentiment']) {
  switch (s) {
    case 'positive': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    case 'neutral': return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
    case 'negative': return 'bg-red-500/20 text-red-400 border-red-500/40';
    default: return 'bg-muted text-muted-foreground';
  }
}

function statusColor(s: HookThread['status']) {
  switch (s) {
    case 'awaiting_reply': return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    case 'followup_scheduled': return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
    case 'followup_sent': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    case 'dnd': return 'bg-red-500/20 text-red-400 border-red-500/40';
    case 'cancelled': return 'bg-muted text-muted-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
}

export default function HookReplyTab() {
  const [threads, setThreads] = useState<HookThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'awaiting_reply' | 'followup_scheduled' | 'followup_sent' | 'dnd'>('all');
  const hasLoaded = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasLoaded.current) setLoading(true);
    const { data } = await supabase
      .from('hook_reply_threads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    setThreads((data as HookThread[]) || []);
    setLoading(false);
    hasLoaded.current = true;
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Realtime — silent refreshes
  useEffect(() => {
    const channel = supabase
      .channel('hook-reply-threads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hook_reply_threads' }, () => {
        load(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Background poll every 15s for safety
  useEffect(() => {
    const id = setInterval(() => load(true), 15000);
    return () => clearInterval(id);
  }, [load]);

  const visible = threads.filter(t => filter === 'all' ? true : t.status === filter);

  const moveToDnd = async (t: HookThread) => {
    if (!confirm(`Move ${formatPhone(t.phone)} to DND?`)) return;
    const { error: e1 } = await supabase.from('sms_dnd_list').upsert(
      { phone: t.phone, phone_last10: t.phone_last10, reason: 'manual_from_hook_reply', source: 'hook_reply', original_message_body: t.inbound_body },
      { onConflict: 'phone_last10' },
    );
    if (e1) { toast.error(e1.message); return; }
    const { error: e2 } = await supabase
      .from('hook_reply_threads')
      .update({ status: 'dnd', dnd_reason: 'manual_from_hook_reply' })
      .eq('id', t.id);
    if (e2) { toast.error(e2.message); return; }
    toast.success('Moved to DND');
    load(true);
  };

  const cancelFollowup = async (t: HookThread) => {
    const { error } = await supabase
      .from('hook_reply_threads')
      .update({ status: 'cancelled' })
      .eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Follow-up cancelled');
    load(true);
  };

  const sendNow = async (t: HookThread) => {
    if (!confirm(`Send the Instagram follow-up to ${formatPhone(t.phone)} right now?`)) return;
    // Move follow-up time to now and let cron pick it up immediately
    const { error } = await supabase
      .from('hook_reply_threads')
      .update({ followup_send_at: new Date().toISOString() })
      .eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    // Trigger the cron immediately
    try {
      await supabase.functions.invoke('hook-reply-followup-cron', { body: {} });
      toast.success('Follow-up triggered');
    } catch {
      toast.success('Scheduled — will send within 15 minutes');
    }
    load(true);
  };

  const counts = {
    all: threads.length,
    awaiting_reply: threads.filter(t => t.status === 'awaiting_reply').length,
    followup_scheduled: threads.filter(t => t.status === 'followup_scheduled').length,
    followup_sent: threads.filter(t => t.status === 'followup_sent').length,
    dnd: threads.filter(t => t.status === 'dnd').length,
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <MessageCircle className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-semibold flex-1">Hook Reply</span>
        <Button size="sm" variant="ghost" onClick={() => load(false)}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Listens for replies to the Warren Guru voicemail auto-reply. Negative replies go to DND.
        Positive/neutral replies get a follow-up Instagram nudge sent automatically 72 hours later.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {([
          ['all', 'All'],
          ['awaiting_reply', 'Awaiting'],
          ['followup_scheduled', 'Scheduled'],
          ['followup_sent', 'Sent'],
          ['dnd', 'DND'],
        ] as const).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? 'default' : 'outline'}
            className="h-7 text-[11px]"
            onClick={() => setFilter(key as any)}
          >
            {label} <span className="ml-1 text-muted-foreground">({counts[key as keyof typeof counts]})</span>
          </Button>
        ))}
      </div>

      <ScrollArea className="h-[calc(100vh-360px)] min-h-[400px]">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No threads</p>
        ) : (
          <div className="space-y-2">
            {visible.map(t => (
              <div key={t.id} className="border border-border rounded-lg p-3 bg-card/50">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-mono font-semibold">{formatPhone(t.phone)}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] ${sentimentColor(t.sentiment)}`}>
                      {t.sentiment.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className={`text-[9px] ${statusColor(t.status)}`}>
                      {t.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </div>

                {t.inbound_body && (
                  <div className="mt-2 text-xs text-foreground bg-muted/40 rounded px-2 py-1.5">
                    <span className="text-muted-foreground">↪ Reply:</span> {t.inbound_body}
                  </div>
                )}

                {t.followup_send_at && t.status === 'followup_scheduled' && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-purple-400">
                    <Clock className="h-3 w-3" />
                    Follow-up at {format(new Date(t.followup_send_at), 'MMM d, h:mm a')}
                  </div>
                )}

                {t.followup_sent_at && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
                    <Send className="h-3 w-3" />
                    Follow-up sent {format(new Date(t.followup_sent_at), 'MMM d, h:mm a')}
                  </div>
                )}

                {t.dnd_reason && (
                  <div className="mt-2 text-[11px] text-red-400">
                    DND reason: {t.dnd_reason}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {t.status === 'followup_scheduled' && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => sendNow(t)}>
                        <Send className="h-3 w-3 mr-1" /> Send now
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => cancelFollowup(t)}>
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    </>
                  )}
                  {t.status !== 'dnd' && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] text-red-400 border-red-500/40" onClick={() => moveToDnd(t)}>
                      <Ban className="h-3 w-3 mr-1" /> Move to DND
                    </Button>
                  )}
                </div>

                <div className="mt-1 text-[10px] text-muted-foreground">
                  Hooked {format(new Date(t.created_at), 'MMM d, h:mm a')}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
