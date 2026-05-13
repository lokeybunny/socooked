// Pinned Hot Replies queue — sits at the top of the Manual Campaign Dialer.
// Auto-rotates as new hot replies are imported. Mirrors the campaign queue
// row UI: name, phone, reply text, and Text / Call / Deactivate buttons.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, MessageSquare, UserX, Flame, RefreshCw, ArrowUpDown } from 'lucide-react';
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
  is_hot: boolean;
  call_status: string;
  imported_at: string;
  original_date?: string | null;
};

const DEACTIVATED_KEY = 'hot-replies-pinned-deactivated-v1';
const FILTER_KEY = 'hot-replies-pinned-filter-v1';
const SORT_KEY = 'hot-replies-pinned-sort-v1';

const CLASS_BADGE: Record<string, string> = {
  HOT_POSITIVE: 'bg-red-500/15 text-red-400 border-red-500/30',
  WARM_INTERESTED: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  PRICING_QUESTION: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  CALLBACK_REQUEST: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  NEEDS_REVIEW: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

export default function HotRepliesPinnedQueue() {
  const [rows, setRows] = useState<HotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [smsPopup, setSmsPopup] = useState<{ phone: string; name: string | null; initialBody?: string } | null>(null);
  const [filter, setFilter] = useState<string>(() => localStorage.getItem(FILTER_KEY) || 'hot');
  const [sortDir, setSortDir] = useState<'latest' | 'earliest'>(() => {
    try { return (localStorage.getItem(SORT_KEY) as 'latest' | 'earliest') || 'latest'; } catch { return 'latest'; }
  });
  const [deactivated, setDeactivated] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(DEACTIVATED_KEY) || '[]')); } catch { return new Set(); }
  });

  const load = useCallback(async () => {
    setLoading(true);
    // Pull a wide net (any non-opt-out reply with a classification) so we can
    // filter client-side the same way the Hot Replies page does.
    const { data } = await supabase
      .from('hot_reply_imports')
      .select('id, first_name, last_name, phone, reply_text, campaign_name, ai_classification, is_opt_out, is_hot, call_status, imported_at, original_date')
      .eq('is_opt_out', false)
      .order('imported_at', { ascending: false })
      .limit(300);
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

  useEffect(() => { localStorage.setItem(FILTER_KEY, filter); }, [filter]);

  useEffect(() => { try { localStorage.setItem(SORT_KEY, sortDir); } catch {} }, [sortDir]);

  const toggleDeactivated = async (id: string) => {
    setDeactivated(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(DEACTIVATED_KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
    // Persist deactivation as "called" so it's also captured in Already Called
    await supabase.from('hot_reply_imports').update({ call_status: 'called' }).eq('id', id);
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
    await supabase.from('hot_reply_imports').update({ call_status: 'called' }).eq('id', row.id);
    toast.success(`Calling ${row.first_name || row.phone} via Twilio…`);
  };

  const isToday = (iso?: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };

  // Match HotReplies page filter semantics
  const filtered = useMemo(() => {
    let list = rows.filter(r => !r.is_opt_out && r.call_status === 'not_called');
    if (filter === 'hot') list = list.filter(r => r.is_hot && isToday(r.imported_at));
    else if (filter === 'warm') list = list.filter(r => r.ai_classification === 'WARM_INTERESTED');
    else if (filter === 'positive') list = list.filter(r => r.ai_classification === 'HOT_POSITIVE');
    else if (filter === 'pricing') list = list.filter(r => r.ai_classification === 'PRICING_QUESTION');
    else if (filter === 'callback') list = list.filter(r => r.ai_classification === 'CALLBACK_REQUEST');
    else if (filter === 'needs_review') list = list.filter(r => r.ai_classification === 'NEEDS_REVIEW');
    else if (filter === 'not_called') list = list.filter(r => r.is_hot && r.call_status === 'not_called');
    // 'all' = every uncontacted, non opt-out reply
    list.sort((a, b) => {
      const da = new Date(a.imported_at).getTime();
      const db = new Date(b.imported_at).getTime();
      return sortDir === 'latest' ? db - da : da - db;
    });
    return list;
  }, [rows, filter, sortDir]);

  const counts = useMemo(() => {
    const base = rows.filter(r => !r.is_opt_out && r.call_status === 'not_called');
    return {
      hot: base.filter(r => r.is_hot && isToday(r.imported_at)).length,
      warm: base.filter(r => r.ai_classification === 'WARM_INTERESTED').length,
      positive: base.filter(r => r.ai_classification === 'HOT_POSITIVE').length,
      pricing: base.filter(r => r.ai_classification === 'PRICING_QUESTION').length,
      callback: base.filter(r => r.ai_classification === 'CALLBACK_REQUEST').length,
      needs_review: base.filter(r => r.ai_classification === 'NEEDS_REVIEW').length,
      not_called: base.filter(r => r.is_hot && r.call_status === 'not_called').length,
    };
  }, [rows]);

  const visible = filtered.filter(r => !deactivated.has(r.id));

  return (
    <div className="rounded-xl border-2 border-orange-500/40 bg-gradient-to-br from-orange-500/5 to-red-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-foreground">Hot Replies Queue</h3>
          <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-300 border-orange-500/30">
            {visible.length} live
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-7 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hot">🔥 Hot Only ({counts.hot})</SelectItem>
              <SelectItem value="positive">Hot Positive ({counts.positive})</SelectItem>
              <SelectItem value="warm">Warm Interested ({counts.warm})</SelectItem>
              <SelectItem value="pricing">Pricing Questions ({counts.pricing})</SelectItem>
              <SelectItem value="callback">Callback Requests ({counts.callback})</SelectItem>
              <SelectItem value="needs_review">Needs Review ({counts.needs_review})</SelectItem>
              <SelectItem value="not_called">Not Called/Texted Yet ({counts.not_called})</SelectItem>
              <SelectItem value="all">All (non opt-out)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            title={sortDir === 'latest' ? 'Sorted: latest first' : 'Sorted: earliest first'}
            onClick={() => setSortDir(prev => prev === 'latest' ? 'earliest' : 'latest')}
          >
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
            {sortDir === 'latest' ? 'Latest' : 'Earliest'}
          </Button>
          <Button variant="ghost" size="sm" onClick={load} className="h-7">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[260px] rounded-lg border border-border bg-background/30">
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading hot replies…</div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No replies match this filter</div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((r, idx) => {
              const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
              const cls = r.ai_classification || '';
              return (
                <div key={r.id} className="px-3 py-2.5">
                  <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2">
                    <span className="text-[10px] text-muted-foreground text-right">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {name}
                        {cls && (
                          <Badge variant="outline" className={`ml-2 text-[9px] ${CLASS_BADGE[cls] || ''}`}>
                            {cls}
                          </Badge>
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
