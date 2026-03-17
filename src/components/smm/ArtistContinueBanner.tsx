import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Music, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ExpiringCampaign {
  id: string;
  artist_name: string;
  song_title: string;
  days_completed: number;
  days_total: number;
}

export default function ArtistContinueBanner({ profileUsername, onRefresh }: { profileUsername?: string; onRefresh?: () => void }) {
  const [campaigns, setCampaigns] = useState<ExpiringCampaign[]>([]);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const query = supabase
        .from('smm_artist_campaigns')
        .select('id, artist_name, song_title, days_completed, days_total')
        .in('status', ['active', 'expired']);

      if (profileUsername) query.eq('profile_username', profileUsername);

      const { data } = await query;
      // Show banner for campaigns at or past their total days
      const expiring = (data as ExpiringCampaign[] || []).filter(c => c.days_completed >= c.days_total);
      setCampaigns(expiring);
    };
    fetch();
  }, [profileUsername]);

  if (campaigns.length === 0) return null;

  const handleContinue = async (id: string) => {
    setActing(id);
    try {
      const res = await supabase.functions.invoke('artist-campaign-scheduler', {
        body: { action: 'continue', campaign_id: id, extend_days: 30 },
      });
      if (res.error) throw res.error;
      toast.success('Campaign extended for 30 more days!');
      setCampaigns(prev => prev.filter(c => c.id !== id));
      onRefresh?.();
    } catch {
      toast.error('Failed to extend campaign');
    } finally {
      setActing(null);
    }
  };

  const handleDismiss = async (id: string) => {
    await supabase.from('smm_artist_campaigns').update({ status: 'completed' }).eq('id', id);
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-2">
      {campaigns.map(c => (
        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <Music className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm flex-1">
            <strong>{c.artist_name}</strong> — "{c.song_title}" campaign has reached day {c.days_completed}.
            Continue for another 30 days?
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => handleContinue(c.id)} disabled={acting === c.id}>
              {acting === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Yes, Continue
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => handleDismiss(c.id)}>
              <X className="h-3 w-3" /> Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
