import { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Users, ExternalLink, Trophy, MousePointerClick, Radio, MessageSquare, ClipboardCheck, DoorOpen, Shield } from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import TeamAuditor from "@/components/reply-engine/TeamAuditor";
import TopPostsSection from "@/components/shillers/TopPostsSection";

interface ShillEntry {
  id: string;
  discord_author: string;
  tweet_url: string;
  discord_msg_id: string;
  created_at: string;
  type: "detected" | "clicked";
}

export default function ReplyEngine() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("activity");
  const [entries, setEntries] = useState<ShillEntry[]>([]);
  const [clicks, setClicks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: activityData } = await supabase
      .from("activity_log")
      .select("id, meta, created_at")
      .eq("entity_type", "auto-shill")
      .eq("action", "telegram-notified")
      .order("created_at", { ascending: false })
      .limit(500);

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

    const all = [...detectedEntries, ...clickEntries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setEntries(all);
    setClicks(clickData || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('shill-clicks-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shill_clicks' }, () => { fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const totalDetected = entries.filter(e => e.type === "detected").length;
  const totalClicked = clicks.length;
  const uniqueUsers = new Set(entries.map(e => e.discord_author)).size;

  const leaderboard = useMemo(() => {
    const counts: Record<string, { username: string; count: number }> = {};
    clicks.forEach((c: any) => {
      if (!counts[c.discord_user_id]) counts[c.discord_user_id] = { username: c.discord_username, count: 0 };
      counts[c.discord_user_id].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [clicks]);

  // Group entries by day for minimal timestamp display
  const groupedEntries = useMemo(() => {
    const groups: { label: string; entries: ShillEntry[] }[] = [];
    let currentLabel = "";
    for (const entry of entries) {
      const d = new Date(entry.created_at);
      let label: string;
      if (isToday(d)) label = "Today";
      else if (isYesterday(d)) label = "Yesterday";
      else label = format(d, "MMM d, yyyy");

      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, entries: [] });
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [entries]);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {user ? (
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <DoorOpen className="h-5 w-5" />
          </Link>
        ) : (
          <DoorOpen className="h-5 w-5 text-muted-foreground/40 cursor-not-allowed" />
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Shillers</h1>
            <p className="text-sm text-muted-foreground mt-1">Track tweet detection &amp; shill activity</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

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

        {user && <TopPostsSection />}

        {user && (
          <Link to="/shillers/raiders" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-sm font-medium text-foreground">
            <Shield className="h-4 w-4 text-primary" />
            Manage Raiders
          </Link>
        )}

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
                  <p>No activity yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedEntries.map(group => (
                    <div key={group.label}>
                      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-1 mb-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</p>
                      </div>
                      <div className="space-y-1">
                        {group.entries.map(entry => (
                          <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                              entry.type === "clicked" ? "bg-green-500/10" : "bg-primary/10"
                            }`}>
                              {entry.type === "clicked" ? (
                                <MousePointerClick className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <MessageSquare className="h-3.5 w-3.5 text-primary" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-foreground">{entry.discord_author}</span>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] ${entry.type === "clicked" ? "border-green-500/30 text-green-500" : ""}`}
                                >
                                  {entry.type === "clicked" ? "shill" : "detect"}
                                </Badge>
                              </div>
                              {entry.tweet_url && (
                                <a href={entry.tweet_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">
                                  {entry.tweet_url.replace(/https?:\/\/(x\.com|twitter\.com)\//, '')}
                                </a>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                              {format(new Date(entry.created_at), 'h:mm a')}
                            </span>
                          </div>
                        ))}
                      </div>
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
    </div>
  );
}