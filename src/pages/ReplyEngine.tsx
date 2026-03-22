import { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw, Users, ExternalLink, Trophy, MousePointerClick, Radio, MessageSquare,
  ClipboardCheck, Shield, BadgeCheck, KeyRound, History, Trash2, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import TeamAuditor from "@/components/reply-engine/TeamAuditor";
import { toast } from "sonner";

const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smm-auto-shill`;
const apiHeaders = {
  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'Content-Type': 'application/json',
};

interface ShillEntry {
  id: string;
  discord_author: string;
  tweet_url: string;
  discord_msg_id: string;
  created_at: string;
  type: "detected" | "clicked";
}

interface AuthLogEntry {
  id: string;
  action: string;
  meta: any;
  created_at: string;
}

export default function ReplyEngine() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("activity");
  const [entries, setEntries] = useState<ShillEntry[]>([]);
  const [clicks, setClicks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment state
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [discordUsernames, setDiscordUsernames] = useState<Record<string, string>>({});
  const [accountHashtags, setAccountHashtags] = useState<Record<string, string>>({});
  const [allXAccounts, setAllXAccounts] = useState<string[]>([]);
  const [authLog, setAuthLog] = useState<AuthLogEntry[]>([]);

  const profileUsername = "NysonBlack";

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [activityRes, clicksRes, configRes, authLogRes] = await Promise.all([
      supabase
        .from("activity_log")
        .select("id, meta, created_at")
        .eq("entity_type", "auto-shill")
        .eq("action", "telegram-notified")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("shill_clicks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      fetch(`${FUNC_URL}?action=get-config&profile=${profileUsername}`, { headers: apiHeaders }).then(r => r.json()).catch(() => null),
      fetch(`${FUNC_URL}?action=auth-log&profile=${profileUsername}`, { headers: apiHeaders }).then(r => r.json()).catch(() => null),
    ]);

    // Activity entries
    const seenMsgIds = new Set<string>();
    const detectedEntries: ShillEntry[] = [];
    for (const row of activityRes.data || []) {
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

    const clickData = clicksRes.data || [];
    const clickEntries: ShillEntry[] = clickData.map((c: any) => ({
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
    setClicks(clickData);

    // Config / assignments
    if (configRes?.config) {
      setAssignments(configRes.config.discord_assignments || {});
      setDiscordUsernames(configRes.config.discord_usernames || {});
      setAccountHashtags(configRes.config.account_hashtags || {});
      setAllXAccounts(configRes.config.all_x_accounts || configRes.config.team_accounts || []);
    }
    if (authLogRes?.log) setAuthLog(authLogRes.log);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-poll for live tabs
  useEffect(() => {
    if (!['shillers', 'auth-log'].includes(activeTab)) return;
    const interval = setInterval(() => fetchData(), 5000);
    return () => clearInterval(interval);
  }, [activeTab, fetchData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('shill-clicks-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shill_clicks' }, () => { fetchData(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log', filter: 'entity_type=eq.shill-authorization' }, () => { fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleUnassign = async (discordUserId: string) => {
    try {
      await fetch(`${FUNC_URL}?action=admin-unassign`, {
        method: 'POST', headers: apiHeaders,
        body: JSON.stringify({ profile_username: profileUsername, discord_user_id: discordUserId }),
      });
      toast.success('User unassigned');
      fetchData();
    } catch {
      toast.error('Failed to unassign');
    }
  };

  const totalDetected = entries.filter(e => e.type === "detected").length;
  const totalClicked = clicks.length;
  const uniqueUsers = new Set(entries.map(e => e.discord_author)).size;

  const assignmentEntries = Object.entries(assignments);
  const claimedAccounts = new Set(Object.values(assignments));
  const availableAccounts = allXAccounts.filter(a => !claimedAccounts.has(a));

  const leaderboard = useMemo(() => {
    const counts: Record<string, { username: string; count: number }> = {};
    clicks.forEach((c: any) => {
      if (!counts[c.discord_user_id]) counts[c.discord_user_id] = { username: c.discord_username, count: 0 };
      counts[c.discord_user_id].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [clicks]);

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
        {!user && (
          <Link
            to="/shillteam"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Shill Team
          </Link>
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

        <div className="flex gap-2">
          <Link to="/shillers/raiders" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-sm font-medium text-foreground">
            <Shield className="h-4 w-4 text-primary" />
            Raiders
          </Link>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="activity">Activity Feed</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="auditor" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Team Auditor
            </TabsTrigger>
            {user && (
              <TabsTrigger value="shillers" className="gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Shillers
                {assignmentEntries.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[9px] px-1.5 py-0">{assignmentEntries.length}</Badge>
                )}
              </TabsTrigger>
            )}
            {user && (
              <TabsTrigger value="auth-log" className="gap-1.5">
                <History className="h-3.5 w-3.5" />
                Auth Log
                {authLog.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[9px] px-1.5 py-0">{authLog.length}</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* ═══ ACTIVITY FEED ═══ */}
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
                                <span className="font-medium text-sm text-foreground flex items-center gap-1">@{entry.discord_author}<BadgeCheck className="h-3.5 w-3.5 text-blue-500" /></span>
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

          {/* ═══ LEADERBOARD ═══ */}
          <TabsContent value="leaderboard" className="mt-4">
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <span className="text-lg font-bold text-muted-foreground w-8 text-center">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                  </span>
                  <div className="flex-1">
                    <span className="font-medium text-foreground flex items-center gap-1">@{entry.username}<BadgeCheck className="h-3.5 w-3.5 text-blue-500" /></span>
                  </div>
                  <Badge variant="secondary" className="font-mono">{entry.count} clicks</Badge>
                </div>
              ))}
              {leaderboard.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">No click data yet.</div>
              )}
            </div>
          </TabsContent>

          {/* ═══ TEAM AUDITOR ═══ */}
          <TabsContent value="auditor" className="mt-4">
            <TeamAuditor />
          </TabsContent>

          {/* ═══ SHILLERS (ASSIGNMENTS) ═══ */}
          <TabsContent value="shillers" className="mt-4">
            <div className="space-y-4">
              <div className="rounded-md border border-border p-3 bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Discord → X Account Assignments</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Workers use <code className="bg-muted px-1 py-0.5 rounded text-[9px]">/authorize account:username</code> in Discord. Only assigned users can shill. 1 user per account. Only admin can unassign.
                </p>
              </div>

              {/* Available accounts */}
              {availableAccounts.length > 0 && (
                <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-green-600">Available Accounts ({availableAccounts.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableAccounts.map(a => (
                      <Badge key={a} variant="outline" className="border-green-500/30 text-green-600 font-mono text-[10px]">@{a}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Current assignments */}
              {assignmentEntries.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <KeyRound className="h-10 w-10 text-muted-foreground mx-auto opacity-30" />
                  <p className="text-sm text-muted-foreground">No assignments yet</p>
                  <p className="text-[10px] text-muted-foreground">Workers will appear here when they use /authorize in Discord.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span className="flex-1">Discord User</span>
                    <span className="w-32">X Account</span>
                    <span className="w-24">Hashtag</span>
                    <span className="w-16 text-center">Action</span>
                  </div>

                  {assignmentEntries.map(([discordId, xAccount]) => (
                    <div key={discordId} className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-mono text-foreground">{discordId}</span>
                        {discordUsernames[discordId] && (
                          <span className="ml-2 text-xs text-muted-foreground">@{discordUsernames[discordId]}</span>
                        )}
                      </div>
                      <span className="w-32 text-sm font-mono text-primary">@{xAccount}</span>
                      <span className="w-24 text-xs font-mono text-muted-foreground">
                        {accountHashtags[xAccount] ? `#${accountHashtags[xAccount]}` : '—'}
                      </span>
                      <div className="w-16 flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleUnassign(discordId)}
                          title="Unassign (admin only)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Live indicator */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live — auto-refreshing every 5s
              </div>
            </div>
          </TabsContent>

          {/* ═══ AUTH LOG ═══ */}
          <TabsContent value="auth-log" className="mt-4">
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Authorization Audit Log</p>
                </div>
                <p className="text-[10px] text-muted-foreground">Every /authorize and admin unassign is recorded here.</p>
              </div>

              {authLog.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No authorization events yet.</div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-1">
                    {authLog.map(entry => (
                      <div key={entry.id} className="flex items-start gap-2 p-2.5 rounded-md border border-border bg-muted/20 text-xs">
                        <div className={`mt-0.5 shrink-0 ${entry.action === 'authorized' ? 'text-green-500' : 'text-destructive'}`}>
                          {entry.action === 'authorized' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant={entry.action === 'authorized' ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0">
                              {entry.action}
                            </Badge>
                            {entry.meta?.discord_username && (
                              <span className="font-medium text-foreground">{entry.meta.discord_username}</span>
                            )}
                            <span className="text-muted-foreground">→</span>
                            <span className="font-mono text-primary">@{entry.meta?.x_account}</span>
                          </div>
                          {entry.meta?.discord_user_id && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{entry.meta.discord_user_id}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
