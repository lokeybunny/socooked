import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, User, Clock, Loader2 } from 'lucide-react';

type QueueItem = {
  id: string;
  phone: string;
  contact_name: string | null;
  position: number;
  status: string;
  last_result: string | null;
  retry_count: number;
  last_dialed_at: string | null;
};

export default function PowerDialQueue({ campaignId }: { campaignId: string }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('powerdial_queue')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('position', { ascending: true });
    setItems((data as QueueItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campaignId]);

  // Realtime
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
    retry_later: { label: 'Retry', class: 'bg-amber-500/20 text-amber-400' },
  };

  const resultLabels: Record<string, string> = {
    human_connected: '🟢 Human',
    voicemail: '📬 VM',
    busy: '🔴 Busy',
    no_answer: '⏱ No Ans',
    failed: '❌ Failed',
    skipped: '⏭ Skip',
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="glass-card">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{items.length} numbers in queue</p>
      </div>
      <ScrollArea className="h-[400px]">
        <div className="divide-y divide-border">
          {items.map((item, i) => {
            const badge = statusBadge[item.status] || statusBadge.pending;
            return (
              <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 ${item.status === 'dialing' ? 'bg-emerald-500/5' : ''}`}>
                <span className="text-xs text-muted-foreground w-6 text-right">{i + 1}</span>
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
                  <Badge variant="outline" className={`text-[10px] ${badge.class}`}>{badge.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
