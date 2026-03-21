import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Users, ExternalLink, Trophy, MousePointerClick, Radio, MessageSquare, ClipboardCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import TeamAuditor from "@/components/reply-engine/TeamAuditor";

interface ShillEntry {
  id: string;
  discord_author: string;
  tweet_url: string;
  discord_msg_id: string;
  created_at: string;
  type: "detected" | "clicked";
}

export default function ReplyEngine() {
  const [activeTab, setActiveTab] = useState("activity");
  const [entries, setEntries] = useState<ShillEntry[]>([]);
  const [clicks, setClicks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch detected tweets from activity_log (deduplicated by discord_msg_id)
    const { data: activityData } = await supabase
      .from("activity_log")
      .select("id, meta, created_at")
      .eq("entity_type", "auto-shill")
      .eq("action", "telegram-notified")
      .order("created_at", { ascending: false })
      .limit(500);

    // Deduplicate by discord_msg_id (keep first occurrence = most recent)
    const seenMsgIds = new Set<string>();
    const detectedEntries: ShillEntry[] = [];
    for (const row of activityData || []) {
      const meta = row.meta as any;
      const msgId = meta?.discord_msg_id;
      if (msgId && !seenMsgIds.has(msgId)) {
        seenMsgIds.add(msgId);
        detectedEntries.push({
          id: row.id,
          discord_author: meta?.discord_author || "unknown",
          tweet_url: meta?.tweet_url || "",
          discord_msg_id: msgId,
          created_at: row.created_at,
          type: "detected",
        });
      }
    }

    // Fetch shill clicks
    const { data: clickData } = await supabase
      .from("shill_clicks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    const clickEntries: ShillEntry[] = (clickData || []).map((c: any) => ({
      id: c.id,
      discord_author: c.discord_username,
      tweet_url: c.tweet_url || "",
      discord_msg_id: c.discord_msg_id || "",
      created_at: c.created_at,
      type: "clicked" as const,
    }));

    // Merge and sort by time
    const all = [...detectedEntries, ...clickEntries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setEntries(all);
    setClicks(clickData || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time: auto-refresh when new shill_clicks arrive
  useEffect(() => {
    const channel = supabase
      .channel('shill-clicks-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shill_clicks' },
        () => { fetchData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const totalDetected = entries.filter(e => e.type === "detected").length;
  const totalClicked = clicks.length;
  const uniqueUsers = new Set(entries.map(e => e.discord_author)).size;

  // Build leaderboard from clicks
  const leaderboard = (() => {
    const counts: Record<string, { username: string; count: number }> = {};
    clicks.forEach((c: any) => {
      if (!counts[c.discord_user_id]) {
        counts[c.discord_user_id] = { username: c.discord_username, count: 0 };
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
              Track tweet detection &amp; shill activity from Discord
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border p-4 text-center">
            <Radio className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-3xl font-bold text-foreground">{totalDetected}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Tweets Detected</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <MousePointerClick className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-3xl font-bold text-foreground">{totalClicked}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Shill Clicks</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-3xl font-bold text-foreground">{uniqueUsers}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Users</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="activity">Activity Feed</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="auditor" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Team Auditor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-4">
            <ScrollArea className="h-[500px]">
              {entries.length === 0 && !loading ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No activity yet. Tweets will appear when detected by the Discord bot.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {entries.map(entry => (
                    <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        entry.type === "clicked" ? "bg-green-500/10" : "bg-primary/10"
                      }`}>
                        {entry.type === "clicked" ? (
                          <MousePointerClick className="h-4 w-4 text-green-500" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground">{entry.discord_author}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${entry.type === "clicked" ? "border-green-500/30 text-green-500" : ""}`}
                          >
                            {entry.type === "clicked" ? "shill click" : "tweet detected"}
                          </Badge>
                        </div>
                        {entry.tweet_url && (
                          <a href={entry.tweet_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block mt-0.5">
                            {entry.tweet_url} <ExternalLink className="inline h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
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
                <div className="text-center py-12 text-muted-foreground text-sm">No click data yet.</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="auditor" className="mt-4">
            <TeamAuditor />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
