import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, DollarSign, TrendingUp, Users, Trophy, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { formatDistanceToNow, format, subDays, startOfDay } from "date-fns";

const RATE_PER_CLICK = 0.05; // $0.05 per shill click

interface TeamMember {
  discord_user_id: string;
  username: string;
  totalClicks: number;
  verifiedClicks: number;
  todayClicks: number;
  weekClicks: number;
  earnings: number;
  pendingEarnings: number;
  todayEarnings: number;
  weekEarnings: number;
  lastActive: string;
  recentTweets: { url: string; created_at: string; status: string }[];
}

export default function TeamAuditor() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: clickData } = await supabase
      .from("shill_clicks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    const clicks = clickData || [];
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = subDays(todayStart, 7);

    const userMap: Record<string, TeamMember> = {};

    for (const c of clicks) {
      const uid = c.discord_user_id;
      if (!userMap[uid]) {
        userMap[uid] = {
          discord_user_id: uid,
          username: c.discord_username,
          totalClicks: 0,
          verifiedClicks: 0,
          todayClicks: 0,
          weekClicks: 0,
          earnings: 0,
          pendingEarnings: 0,
          todayEarnings: 0,
          weekEarnings: 0,
          lastActive: c.created_at,
          recentTweets: [],
        };
      }

      const m = userMap[uid];
      const isVerified = (c as any).status === "verified";
      m.totalClicks++;
      if (isVerified) m.verifiedClicks++;
      m.earnings = m.verifiedClicks * RATE_PER_CLICK;
      m.pendingEarnings = (m.totalClicks - m.verifiedClicks) * RATE_PER_CLICK;

      const clickDate = new Date(c.created_at);
      if (clickDate >= todayStart) {
        m.todayClicks++;
        m.todayEarnings = m.todayClicks * RATE_PER_CLICK;
      }
      if (clickDate >= weekStart) {
        m.weekClicks++;
        m.weekEarnings = m.weekClicks * RATE_PER_CLICK;
      }

      if (new Date(c.created_at) > new Date(m.lastActive)) {
        m.lastActive = c.created_at;
      }

      if (m.recentTweets.length < 10) {
        m.recentTweets.push({ url: c.tweet_url || "", created_at: c.created_at, status: (c as any).status || "clicked" });
      }
    }

    const sorted = Object.values(userMap).sort((a, b) => b.totalClicks - a.totalClicks);
    setMembers(sorted);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totals = useMemo(() => {
    const totalClicks = members.reduce((s, m) => s + m.totalClicks, 0);
    const totalEarnings = totalClicks * RATE_PER_CLICK;
    const todayClicks = members.reduce((s, m) => s + m.todayClicks, 0);
    const weekClicks = members.reduce((s, m) => s + m.weekClicks, 0);
    return { totalClicks, totalEarnings, todayClicks, weekClicks };
  }, [members]);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border p-4 text-center">
          <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-bold text-foreground">{members.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Team Members</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <TrendingUp className="h-4 w-4 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-bold text-foreground">{totals.todayClicks}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Today's Clicks</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <Trophy className="h-4 w-4 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-bold text-foreground">{totals.totalClicks}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">All-Time Clicks</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <DollarSign className="h-4 w-4 mx-auto mb-1 text-green-500" />
          <p className="text-2xl font-bold text-green-500">${totals.totalEarnings.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Owed</p>
        </div>
      </div>

      {/* Rate callout */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm text-foreground">
          Rate: <strong className="text-primary">${RATE_PER_CLICK.toFixed(2)}</strong> per shill click — Every click = money earned. Keep grinding! 💰
        </span>
      </div>

      {/* Team roster */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Team Roster & Earnings</h3>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <ScrollArea className="h-[420px]">
        <div className="space-y-2">
          {members.map((member, i) => {
            const isExpanded = expandedUser === member.discord_user_id;
            return (
              <div key={member.discord_user_id} className="rounded-lg border border-border overflow-hidden">
                {/* Main row */}
                <button
                  onClick={() => setExpandedUser(isExpanded ? null : member.discord_user_id)}
                  className="w-full flex items-center gap-3 p-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                >
                  <span className="text-lg font-bold text-muted-foreground w-8 text-center shrink-0">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{member.username}</span>
                      {member.todayClicks > 0 && (
                        <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-500">
                          active today
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last active {formatDistanceToNow(new Date(member.lastActive), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-lg font-bold text-green-500">${member.earnings.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">{member.totalClicks} clicks</p>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/10 p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-md bg-background p-2">
                        <p className="text-xs text-muted-foreground">Today</p>
                        <p className="font-bold text-foreground">{member.todayClicks} clicks</p>
                        <p className="text-xs text-green-500">${member.todayEarnings.toFixed(2)}</p>
                      </div>
                      <div className="rounded-md bg-background p-2">
                        <p className="text-xs text-muted-foreground">This Week</p>
                        <p className="font-bold text-foreground">{member.weekClicks} clicks</p>
                        <p className="text-xs text-green-500">${member.weekEarnings.toFixed(2)}</p>
                      </div>
                      <div className="rounded-md bg-background p-2">
                        <p className="text-xs text-muted-foreground">All Time</p>
                        <p className="font-bold text-foreground">{member.totalClicks} clicks</p>
                        <p className="text-xs text-green-500">${member.earnings.toFixed(2)}</p>
                      </div>
                    </div>

                    {member.recentTweets.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Recent Activity</p>
                        <div className="space-y-1">
                          {member.recentTweets.slice(0, 5).map((t, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                              {t.url ? (
                                <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                                  {t.url} <ExternalLink className="inline h-2.5 w-2.5" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">No URL recorded</span>
                              )}
                              <span className="text-muted-foreground shrink-0 ml-auto">
                                {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {members.length === 0 && !loading && (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No team activity yet. Clicks will appear when team members use the SHILL NOW button.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
