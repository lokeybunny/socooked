import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Flame, TrendingUp, Eye, Heart, MessageSquare, Repeat2, ExternalLink, RefreshCw, Trash2, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface TweetAnalytics {
  id: string;
  tweet_url: string;
  tweet_id: string;
  author_handle: string | null;
  author_name: string | null;
  text_content: string | null;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  posted_at: string | null;
  detected_at: string | null;
  updated_at: string;
  created_at: string;
}

function viralityScore(t: TweetAnalytics): number {
  // Weighted engagement rate — views are the denominator
  const v = Math.max(t.views, 1);
  const engagements = t.likes * 3 + t.retweets * 5 + t.replies * 2;
  const rate = (engagements / v) * 100;
  // Bonus for raw volume
  const volumeBonus = Math.log10(Math.max(t.views, 1)) * 2;
  return Math.round((rate + volumeBonus) * 10) / 10;
}

function scoreColor(score: number): string {
  if (score >= 20) return "text-red-500";
  if (score >= 10) return "text-orange-500";
  if (score >= 5) return "text-amber-500";
  return "text-muted-foreground";
}

function scoreBadge(score: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (score >= 20) return { label: "🔥 VIRAL", variant: "destructive" };
  if (score >= 10) return { label: "📈 Trending", variant: "default" };
  if (score >= 5) return { label: "👀 Active", variant: "secondary" };
  return { label: "📉 Low", variant: "outline" };
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ViralityTab() {
  const [tweets, setTweets] = useState<TweetAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoPrune, setAutoPrune] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Only fetch last 24h of tweets — keeps it moving
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("shill_post_analytics")
      .select("*")
      .gte("created_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Virality load error:", error.message);
      setLoading(false);
      return;
    }

    let sorted = (data || []).sort((a, b) => viralityScore(b as TweetAnalytics) - viralityScore(a as TweetAnalytics));

    // Auto-prune: keep only top 30 — the rest are noise
    if (autoPrune && sorted.length > 30) {
      sorted = sorted.slice(0, 30);
    }

    setTweets(sorted as TweetAnalytics[]);
    setLoading(false);
  }, [autoPrune]);

  useEffect(() => { load(); }, [load]);

  const refreshMetrics = async () => {
    setRefreshing(true);
    try {
      const res = await supabase.functions.invoke("virality-refresh");
      if (res.error) throw res.error;
      toast.success(`Refreshed ${res.data?.updated || 0} tweets`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    }
    setRefreshing(false);
  };

  const pruneStale = async () => {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from("shill_post_analytics")
      .delete()
      .lt("created_at", cutoff);
    if (error) toast.error(error.message);
    else {
      toast.success(`Pruned old tweets`);
      load();
    }
  };

  // ── Summary stats ──
  const topScore = tweets.length > 0 ? viralityScore(tweets[0]) : 0;
  const totalViews = tweets.reduce((s, t) => s + t.views, 0);
  const totalEngagement = tweets.reduce((s, t) => s + t.likes + t.retweets + t.replies, 0);
  const viralCount = tweets.filter(t => viralityScore(t) >= 10).length;

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Tracked", value: String(tweets.length), icon: <Eye className="h-4 w-4" /> },
          { label: "Total Views", value: formatNum(totalViews), icon: <TrendingUp className="h-4 w-4" /> },
          { label: "Engagements", value: formatNum(totalEngagement), icon: <Heart className="h-4 w-4" /> },
          { label: "Trending", value: String(viralCount), icon: <Flame className="h-4 w-4" /> },
        ].map(s => (
          <Card key={s.label} className="bg-card/50 border-border/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="text-primary">{s.icon}</div>
              <div>
                <p className="text-xl font-bold font-mono">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshMetrics} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh Metrics"}
          </Button>
          <Button variant="ghost" size="sm" onClick={pruneStale} className="gap-1.5 text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" /> Prune 48h+
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Auto-sorted by virality score · 48h window</p>
      </div>

      {/* Feed */}
      <ScrollArea className="h-[calc(100vh-380px)]">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : tweets.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">No tweets tracked yet</div>
        ) : (
          <div className="space-y-2">
            {tweets.map((t, i) => {
              const score = viralityScore(t);
              const badge = scoreBadge(score);
              const isTop3 = i < 3;

              return (
                <Card
                  key={t.id}
                  className={`border-border/50 transition-all ${isTop3 ? "bg-primary/[0.03] border-primary/20" : "bg-card/50"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      {/* Rank + content */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 text-sm font-bold ${isTop3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">@{t.author_handle || "unknown"}</span>
                            <Badge variant={badge.variant} className="text-[10px] h-5">{badge.label}</Badge>
                            <span className={`text-xs font-mono font-bold ${scoreColor(score)}`}>{score}</span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                            {t.text_content || "—"}
                          </p>
                          {/* Metrics row */}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {formatNum(t.views)}</span>
                            <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {formatNum(t.likes)}</span>
                            <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" /> {formatNum(t.retweets)}</span>
                            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {formatNum(t.replies)}</span>
                            <span className="text-muted-foreground/60">·</span>
                            <span>{t.posted_at ? formatDistanceToNow(new Date(t.posted_at), { addSuffix: true }) : "—"}</span>
                          </div>
                        </div>
                      </div>
                      {/* Link */}
                      <a href={t.tweet_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-primary transition-colors">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
