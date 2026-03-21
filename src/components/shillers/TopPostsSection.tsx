import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Repeat2, MessageSquare, Eye, Clock, TrendingUp, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface PostAnalytics {
  id: string;
  tweet_url: string;
  tweet_id: string | null;
  author_handle: string | null;
  author_name: string | null;
  text_content: string | null;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  posted_at: string | null;
  detected_at: string;
}

export default function TopPostsSection() {
  const [posts, setPosts] = useState<PostAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTopPosts() {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from("shill_post_analytics")
        .select("*")
        .gte("detected_at", twentyFourHoursAgo)
        .order("likes", { ascending: false })
        .limit(10);

      setPosts((data as PostAnalytics[]) || []);
      setLoading(false);
    }

    fetchTopPosts();
  }, []);

  if (loading) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Top Posts Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (posts.length === 0) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Top Posts Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">No enriched posts in the last 24 hours.</p>
        </CardContent>
      </Card>
    );
  }

  // Find peak posting hour
  const hourCounts: Record<number, number> = {};
  posts.forEach(p => {
    if (p.posted_at) {
      const hour = new Date(p.posted_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  });
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

  const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
  const totalRetweets = posts.reduce((s, p) => s + p.retweets, 0);
  const totalViews = posts.reduce((s, p) => s + p.views, 0);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Top Posts Today
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-md border border-border p-2.5 text-center">
            <Heart className="h-3.5 w-3.5 mx-auto mb-1 text-red-500" />
            <p className="text-lg font-bold text-foreground">{totalLikes.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Total Likes</p>
          </div>
          <div className="rounded-md border border-border p-2.5 text-center">
            <Repeat2 className="h-3.5 w-3.5 mx-auto mb-1 text-green-500" />
            <p className="text-lg font-bold text-foreground">{totalRetweets.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Total RTs</p>
          </div>
          <div className="rounded-md border border-border p-2.5 text-center">
            <Eye className="h-3.5 w-3.5 mx-auto mb-1 text-blue-500" />
            <p className="text-lg font-bold text-foreground">{totalViews > 1000 ? `${(totalViews / 1000).toFixed(1)}k` : totalViews.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Views</p>
          </div>
          <div className="rounded-md border border-border p-2.5 text-center">
            <Clock className="h-3.5 w-3.5 mx-auto mb-1 text-amber-500" />
            <p className="text-lg font-bold text-foreground">{peakHour ? `${Number(peakHour[0]) % 12 || 12}${Number(peakHour[0]) >= 12 ? 'pm' : 'am'}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Peak Hour</p>
          </div>
        </div>

        {/* Post list */}
        <div className="space-y-2">
          {posts.map((post, i) => (
            <div key={post.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
              <span className="text-sm font-bold text-muted-foreground w-5 text-center shrink-0 mt-0.5">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {post.author_handle && (
                    <span className="text-sm font-medium text-foreground">@{post.author_handle}</span>
                  )}
                  {post.posted_at && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {format(new Date(post.posted_at), 'h:mm a')}
                    </span>
                  )}
                </div>
                {post.text_content && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">{post.text_content}</p>
                )}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-red-500" />{post.likes}</span>
                  <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3 text-green-500" />{post.retweets}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.replies}</span>
                  {post.views > 0 && <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.views.toLocaleString()}</span>}
                </div>
              </div>
              <a href={post.tweet_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
