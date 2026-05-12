// Pinned Hot Replies queue — sits at the top of the Manual Campaign Dialer.
// Auto-rotates as new hot replies are imported. Mirrors the campaign queue
// row UI: name, phone, reply text, and Text / Call / Deactivate buttons.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, MessageSquare, UserX, Flame, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { SmsThreadPopup } from '@/components/phone/SmsThreadPopup';

type HotRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  reply_text: string;
  campaign_name: string | null;
  ai_classification: string | null;
  is_opt_out: boolean;
  call_status: string;
};

const DEACTIVATED_KEY = 'hot-replies-pinned-deactivated-v1';

export default function HotRepliesPinnedQueue() {
  const [rows, setRows] = useState<HotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [smsPopup, setSmsPopup] = useState<{ phone: string; name: string | null; initialBody?: string } | null>(null);
  const [deactivated, setDeactivated] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(DEACTIVATED_KEY) || '[]')); } catch { return new Set(); }
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hot_reply_imports')
      .select('id, first_name, last_name, phone, reply_text, campaign_name, ai_classification, is_opt_out, call_status')
      .eq('is_hot', true)
      .eq('is_opt_out', false)
      .neq('call_status', 'not_interested')
      .neq('call_status', 'opt_out')
      .order('imported_at', { ascending: false })
      .limit(100);
    setRows((data as HotRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('hot_replies_pinned')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hot_reply_imports' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const toggleDeactivated = (id: string) => {
    setDeactivated(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(DEACTIVATED_KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const buildSmsPrefill = (phone: string, reply: string) => {
    return [
      phone,
      reply ? `💬 "${reply}"` : '',
      '-------------------------',
      'Hey, this is Warren — following up on your reply. When works to chat for a couple minutes?',
    ].filter(Boolean).join('\n');
  };

  const callViaTwilio = async (row: HotRow) => {
    window.dispatchEvent(new CustomEvent('twilio:dial', { detail: { phone: row.phone } }));
    // Best-effort mark as called
    await supabase.from('hot_reply_imports').update({ call_status: 'called' }).eq('id', row.id);
    toast.success(`Calling ${row.first_name || row.phone} via Twilio…`);
  };

  const visible = rows.filter(r => !deactivated.has(r.id));

  return (
    <div className="rounded-xl border-2 border-orange-500/40 bg-gradient-to-br from-orange-500/5 to-red-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-foreground">Hot Replies Queue</h3>
          <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-300 border-orange-500/30">
            {visible.length} live
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="h-7">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="h-[260px] rounded-lg border border-border bg-background/30">
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading hot replies…</div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No hot replies in queue</div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((r, idx) => {
              const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
              return (
                <div key={r.id} className="px-3 py-2.5">
                  <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2">
                    <span className="text-[10px] text-muted-foreground text-right">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {name}
                        {r.ai_classification && (
                          <span className="ml-2 text-[9px] uppercase tracking-wider text-orange-300">· {r.ai_classification}</span>
                        )}
                      </p>
                      <p className="text-[11px] font-mono text-muted-foreground">{r.phone}</p>
                    </div>
                  </div>
                  <p className="mt-1 pl-7 text-[11px] italic text-amber-400 whitespace-normal break-words">
                    💬 "{r.reply_text}"
                  </p>
                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_2.25rem_minmax(0,1fr)] gap-1.5 pl-7">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-[11px]"
                      onClick={() => setSmsPopup({ phone: r.phone, name, initialBody: buildSmsPrefill(r.phone, r.reply_text) })}
                    >
                      <MessageSquare className="h-3 w-3" /> <span>Text</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-9 px-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      title="De-activate"
                      onClick={() => toggleDeactivated(r.id)}
                    >
                      <UserX className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 px-2 text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white"
                      onClick={() => callViaTwilio(r)}
                    >
                      <Phone className="h-3 w-3" /> <span>Call</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {smsPopup && (
        <SmsThreadPopup
          open={!!smsPopup}
          onOpenChange={(v) => { if (!v) setSmsPopup(null); }}
          phone={smsPopup.phone}
          contactName={smsPopup.name}
          initialBody={smsPopup.initialBody}
        />
      )}
    </div>
  );
}
