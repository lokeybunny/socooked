import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Flame, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const EMOJI_MAP: Record<string, string> = {
  'cat-themed': '🐱',
  'dog-themed': '🐶',
  'goat meta': '🐐',
  'frog meta': '🐸',
  'ai-agent coins': '🤖',
  'celebrity-backed': '⭐',
  'political memes': '🏛️',
  'anime/manga themed': '🎌',
  'food/drink themed': '🍕',
  'gaming/esports': '🎮',
  'music/artist themed': '🎵',
  'space/cosmic': '🚀',
  'absurdist/shitpost': '💩',
  'streamer/irl live challenges': '📺',
  'charity/tip meta': '💝',
  'volume-bot meta': '🤑',
  'prediction-market memes': '🔮',
  'rwa-meme hybrids': '🏠',
  'animal hybrids': '🦄',
  'tech/science memes': '🔬',
  'fashion/luxury': '👜',
  'nature/environment': '🌿',
  'sports themed': '⚽',
  'historical figures': '📜',
};

function getEmoji(cat: string): string {
  const lower = cat.toLowerCase();
  for (const [key, emoji] of Object.entries(EMOJI_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return emoji;
  }
  return '🔥';
}

interface MetaItem {
  rank: number;
  category: string;
  mentions: number;
  pct: number;
  is_green: boolean;
  hours_today: number;
  bullish_score: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MetaPopup({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [top10, setTop10] = useState<MetaItem[]>([]);
  const [totalMentions, setTotalMentions] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchMeta = async () => {
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-ai`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ action: 'top_meta' }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        setTop10(result.data.top10 || []);
        setTotalMentions(result.data.total_mentions || 0);
        setLastUpdated(result.data.last_updated);
      }
    } catch (err) {
      console.error('Meta fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchMeta();
  }, [open]);

  // Realtime subscription
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('meta_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meta_mentions' }, () => {
        fetchMeta();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Top 10 Meta — Last 10 Minutes
            <span className="text-xs text-muted-foreground font-normal">(real-time)</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">
            {totalMentions} total mentions
          </span>
          <Button variant="ghost" size="sm" onClick={fetchMeta} disabled={loading} className="gap-1.5 h-7">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>

        {loading && top10.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : top10.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No meta categories detected in the last 10 minutes.</p>
            <p className="text-xs mt-1">Messages from channel will populate this automatically.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {top10.map((item) => (
              <div
                key={item.category}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                  item.is_green
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-muted/30 border-border"
                )}
              >
                <span className="text-lg font-bold text-muted-foreground w-6 text-right">{item.rank}</span>
                <span className="text-xl">{getEmoji(item.category)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground capitalize truncate">{item.category}</span>
                    {item.is_green && (
                      <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold shrink-0">
                        <Flame className="h-2.5 w-2.5" /> BULLISH
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{item.mentions} mentions</span>
                    <span>·</span>
                    <span>{item.pct}% of msgs</span>
                    {item.hours_today > 0 && (
                      <>
                        <span>·</span>
                        <span>{item.hours_today}h today</span>
                      </>
                    )}
                  </div>
                </div>
                <div className={cn(
                  "text-sm font-bold px-2.5 py-1 rounded-full",
                  item.is_green ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"
                )}>
                  {item.mentions}
                </div>
              </div>
            ))}
          </div>
        )}

        {lastUpdated && (
          <p className="text-[10px] text-muted-foreground text-right mt-2">
            Last updated: {new Date(lastUpdated).toLocaleTimeString()}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
