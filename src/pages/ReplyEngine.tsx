import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Users, ExternalLink, Trophy, MousePointerClick } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export default function ReplyEngine() {
  const [activeTab, setActiveTab] = useState("activity");
  const [clicks, setClicks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClicks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shill_clicks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setClicks(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClicks(); }, [fetchClicks]);

  const uniqueUsers = new Set(clicks.map(c => c.discord_user_id)).size;

  // Build leaderboard
  const leaderboard = (() => {
    const counts: Record<string, { username: string; count: number; lastSeen: string }> = {};
    clicks.forEach(c => {
      if (!counts[c.discord_user_id]) {
        counts[c.discord_user_id] = { username: c.discord_username, count: 0, lastSeen: c.created_at };
      }
      counts[c.discord_user_id].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  })();

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Discord Log</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track shill activity from the Discord bot
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchClicks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border p-4 text-center">
            <MousePointerClick className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-3xl font-bold text-foreground">{clicks.length}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Clicks</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-3xl font-bold text-foreground">{uniqueUsers}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Unique Shillers</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <Trophy className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-3xl font-bold text-foreground">{leaderboard[0]?.username || "—"}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Top Shiller</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="activity">Recent Activity</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-4">
            <ScrollArea className="h-[500px]">
              {clicks.length === 0 && !loading ? (
                <div className="text-center py-16 text-muted-foreground">
                  <MousePointerClick className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No shill activity yet. Clicks will appear when team members use the Discord bot.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {clicks.map(click => (
                    <div key={click.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground">{click.discord_username}</span>
                          <Badge variant="outline" className="text-[10px]">shill copy</Badge>
                        </div>
                        {click.tweet_url && (
                          <a href={click.tweet_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block mt-0.5">
                            {click.tweet_url} <ExternalLink className="inline h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(click.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-4">
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <span className="text-lg font-bold text-muted-foreground w-8 text-center">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                  </span>
                  <div className="flex-1">
                    <span className="font-medium text-foreground">{entry.username}</span>
                  </div>
                  <Badge variant="secondary" className="font-mono">{entry.count} clicks</Badge>
                </div>
              ))}
              {leaderboard.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">No data yet.</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
