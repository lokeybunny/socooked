import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Phone, User, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

type QueueItem = {
  id: string;
  phone: string;
  contact_name: string | null;
  position: number;
  status: string;
  last_result: string | null;
  retry_count: number;
  last_dialed_at: string | null;
  retry_at: string | null;
};

const ITEMS_PER_PAGE = 20;

export default function PowerDialQueue({ campaignId }: { campaignId: string }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = async () => {
    const { data } = await supabase
      .from('powerdial_queue')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('position', { ascending: true });
    setItems((data as QueueItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); setPage(1); }, [campaignId]);

  useEffect(() => {
    const channel = supabase
      .channel(`pd-queue-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'powerdial_queue', filter: `campaign_id=eq.${campaignId}` },
        () => { load(); }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  const statusBadge: Record<string, { label: string; class: string }> = {
    pending: { label: 'Pending', class: 'bg-muted text-muted-foreground' },
    dialing: { label: 'Dialing…', class: 'bg-emerald-500/20 text-emerald-400 animate-pulse' },
    completed: { label: 'Done', class: 'bg-blue-500/20 text-blue-400' },
    skipped: { label: 'Skipped', class: 'bg-muted text-muted-foreground' },
    retry_later: { label: 'Callback', class: 'bg-amber-500/20 text-amber-400' },
  };

  const resultLabels: Record<string, string> = {
    human_connected: '🟢 Human',
    voicemail: '📬 VM',
    busy: '🔴 Busy',
    no_answer: '⏱ No Ans',
    failed: '❌ Failed',
    skipped: '⏭ Skip',
    callback_human_pickup: '📞 Callback (1h cooldown)',
    skipped_24h_duplicate: '🚫 24h dup',
    skipped_already_connected: '✅ Already reached',
  };

  const formatRetry = (iso: string | null) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'now';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
  };

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const pagedItems = items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="glass-card">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{items.length} numbers in queue</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>{page} / {totalPages}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      <ScrollArea className="h-[500px]">
        <div className="divide-y divide-border">
          {pagedItems.map((item) => {
            const badge = statusBadge[item.status] || statusBadge.pending;
            const globalIndex = (page - 1) * ITEMS_PER_PAGE + items.indexOf(item) + 1;
            return (
              <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 ${item.status === 'dialing' ? 'bg-emerald-500/5' : ''}`}>
                <span className="text-xs text-muted-foreground w-6 text-right">{item.position + 1}</span>
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono text-foreground">{item.phone}</span>
                {item.contact_name && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" /> {item.contact_name}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {item.last_result && (
                    <span className="text-[10px] text-muted-foreground">{resultLabels[item.last_result] || item.last_result}</span>
                  )}
                  {item.retry_count > 0 && (
                    <span className="text-[10px] text-muted-foreground">×{item.retry_count}</span>
                  )}
                  {item.status === 'retry_later' && item.retry_at && (
                    <span className="text-[10px] text-amber-400">in {formatRetry(item.retry_at)}</span>
                  )}
                  <Badge variant="outline" className={`text-[10px] ${badge.class}`}>{badge.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      {totalPages > 1 && (
        <div className="p-2 border-t border-border flex justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
            Math.max(0, page - 3),
            Math.min(totalPages, page + 2)
          ).map(p => (
            <Button key={p} variant={p === page ? 'default' : 'ghost'} size="icon" className="h-7 w-7 text-xs" onClick={() => setPage(p)}>
              {p}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
