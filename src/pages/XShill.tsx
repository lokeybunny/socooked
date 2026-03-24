import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw, Zap, Plus, Trash2, Save, Activity, Settings,
  Radio, Globe, Clock, MessageSquare, Target, Shield, Pencil,
  Video, Play, Pause, ExternalLink, CalendarClock, RotateCcw,
  Users,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

/* ─── Types ─── */
interface CommunityTarget {
  id: string;
  community_id: string;
  community_name: string;
  x_account: string;
  enabled: boolean;
  whitehouse_interval_min: number;
  other_interval_min: number;
  whitehouse_jitter_min: number;
  other_jitter_min: number;
  ca: string;
  ticker: string;
  whitehouse_templates: string[];
  other_templates: string[];
}

interface RaidLog {
  id: string;
  created_at: string;
  action: string;
  meta: any;
}

interface RotationAccount {
  id: string;
  handle: string;
  status: "active" | "paused" | "capped";
  capped_at?: string;
  posts_today: number;
}

interface ScheduledPost {
  id: string;
  chat_id: number;
  caption: string;
  video_url: string;
  storage_path: string | null;
  community_id: string;
  x_account: string;
  scheduled_at: string;
  status: string;
  post_url: string | null;
  request_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_WH_TEMPLATES = [
  "Just Detected New Post that could be Raided $WHITEHOUSE",
  "🚨 New @WhiteHouse post just dropped! Rally $WHITEHOUSE",
  "Whitehouse just posted — time to raid $WHITEHOUSE 🏛️",
  "Fresh @WhiteHouse tweet detected 🔥 Raid opportunity for $WHITEHOUSE",
  "🏛️ New @WhiteHouse alert — $WHITEHOUSE raid incoming",
  "Spotted a new @WhiteHouse post! Lets go $WHITEHOUSE",
];

const DEFAULT_OTHER_TEMPLATES = [
  "Detected this guy on X, he gets a lot of engagement, lets try to raid and shill here",
  "This account has been getting major traction on X — worth a raid 🚀",
  "Found a high engagement post on X, lets get in there 🔥",
  "Spotted a viral thread on X — time to raid and shill",
  "This post is blowing up on X, perfect raid target 💥",
  "Big engagement detected on X, lets raid this one 🎯",
];

const DEFAULT_TARGET: Omit<CommunityTarget, "id"> = {
  community_id: "2029596385180291485",
  community_name: "$WHITEHOUSE Community",
  x_account: "xslaves",
  enabled: true,
  whitehouse_interval_min: 10,
  other_interval_min: 20,
  whitehouse_jitter_min: 3,
  other_jitter_min: 5,
  ca: "7oXNE1dbpHUp6dn1JF8pRgCtzfCy4P2FuBneWjZHpump",
  ticker: "WHITEHOUSE",
  whitehouse_templates: DEFAULT_WH_TEMPLATES,
  other_templates: DEFAULT_OTHER_TEMPLATES,
};

export default function XShill() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("overview");
  const [targets, setTargets] = useState<CommunityTarget[]>([]);
  const [logs, setLogs] = useState<RaidLog[]>([]);
  const [throttleWH, setThrottleWH] = useState<any>(null);
  const [throttleOther, setThrottleOther] = useState<any>(null);
  const [sourceEnabled, setSourceEnabled] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editTarget, setEditTarget] = useState<CommunityTarget | null>(null);
  const [editDialog, setEditDialog] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [editPost, setEditPost] = useState<ScheduledPost | null>(null);
  const [editPostDialog, setEditPostDialog] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [rotationAccounts, setRotationAccounts] = useState<RotationAccount[]>([]);
  const [newAccountHandle, setNewAccountHandle] = useState("");
  const [shillCopyTicker, setShillCopyTicker] = useState("");
  const [shillCopyCampaignUrl, setShillCopyCampaignUrl] = useState("");
  const [shillCopyCampaignLinks, setShillCopyCampaignLinks] = useState<string[]>(["", "", "", "", ""]);
  const [shillCopySaving, setShillCopySaving] = useState(false);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: targetCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "raid-community-targets")
        .single();

      if (targetCfg?.content) {
        const parsed = (targetCfg.content as any).targets || [];
        setTargets(parsed);
      } else {
        const defaultTargets = [{ ...DEFAULT_TARGET, id: crypto.randomUUID() }];
        setTargets(defaultTargets);
      }

      const { data: srcCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "raid-community-source")
        .single();
      setSourceEnabled(!!(srcCfg?.content as any)?.enabled);

      const { data: whThrottle } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "raid-community-wh")
        .single();
      setThrottleWH(whThrottle?.content || null);

      const { data: otherThrottle } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "raid-community-other")
        .single();
      setThrottleOther(otherThrottle?.content || null);

      const { data: logData } = await supabase
        .from("activity_log")
        .select("id, created_at, action, meta")
        .eq("entity_type", "smm")
        .or("action.ilike.%raid%,action.ilike.%community%,action.eq.cortex_upload-text")
        .order("created_at", { ascending: false })
        .limit(100);
      setLogs(logData || []);

      // Load scheduled posts
      const { data: posts } = await supabase
        .from("shill_scheduled_posts")
        .select("*")
        .order("scheduled_at", { ascending: true })
        .limit(200);
      setScheduledPosts((posts as any[]) || []);

      // Load rotation accounts
      const { data: rotCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "shill-rotation-accounts")
        .maybeSingle();
      if (rotCfg?.content) {
        setRotationAccounts((rotCfg.content as any).accounts || []);
      } else {
        // Seed with current default account
        setRotationAccounts([{ id: crypto.randomUUID(), handle: "xslaves", status: "active", posts_today: 0 }]);
      }

      // Load shill copy config (ticker + campaign_url for Get Shill Copy button)
      // This is stored under the profile username section (default: NysonBlack)
      const { data: shillCopyCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "NysonBlack")
        .maybeSingle();
      if (shillCopyCfg?.content) {
        setShillCopyTicker((shillCopyCfg.content as any).ticker || "");
        setShillCopyCampaignUrl((shillCopyCfg.content as any).campaign_url || "");
      }
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveTargets = async (updated: CommunityTarget[]) => {
    setTargets(updated);
    await supabase.from("site_configs").upsert({
      site_id: "smm-auto-shill",
      section: "raid-community-targets",
      content: { targets: updated } as any,
    } as any, { onConflict: "site_id,section" } as any);
    toast.success("Community targets saved");
  };

  const toggleSource = async (enabled: boolean) => {
    setSourceEnabled(enabled);
    await supabase.from("site_configs").upsert({
      site_id: "smm-auto-shill",
      section: "raid-community-source",
      content: {
        enabled,
        discord_listen_channel_id: "1484699554271072257",
        discord_channel_id: "1484699554271072257",
      } as any,
    } as any, { onConflict: "site_id,section" } as any);
    toast.success(enabled ? "Raid bot enabled" : "Raid bot disabled");
  };

  const resetThrottle = async (section: string) => {
    await supabase.from("site_configs").upsert({
      site_id: "smm-auto-shill",
      section,
      content: { last_post_ms: 0 } as any,
    } as any, { onConflict: "site_id,section" } as any);
    toast.success("Throttle reset — next detection will post immediately");
    loadAll();
  };
  const saveRotationAccounts = async (accounts: RotationAccount[]) => {
    setRotationAccounts(accounts);
    await supabase.from("site_configs").upsert({
      site_id: "smm-auto-shill",
      section: "shill-rotation-accounts",
      content: { accounts } as any,
    } as any, { onConflict: "site_id,section" } as any);
    toast.success("Rotation accounts saved");
  };

  const addRotationAccount = async () => {
    const handle = newAccountHandle.trim().replace(/^@/, "");
    if (!handle) return;
    if (rotationAccounts.find(a => a.handle === handle)) {
      toast.error("Account already exists");
      return;
    }
    const updated = [...rotationAccounts, { id: crypto.randomUUID(), handle, status: "active" as const, posts_today: 0 }];
    await saveRotationAccounts(updated);
    setNewAccountHandle("");
  };

  const removeRotationAccount = async (id: string) => {
    await saveRotationAccounts(rotationAccounts.filter(a => a.id !== id));
  };

  const toggleAccountStatus = async (id: string, status: "active" | "paused") => {
    const updated = rotationAccounts.map(a => a.id === id ? { ...a, status, capped_at: undefined } : a);
    await saveRotationAccounts(updated);
  };

  const resetAccountCap = async (id: string) => {
    const updated = rotationAccounts.map(a => a.id === id ? { ...a, status: "active" as const, capped_at: undefined, posts_today: 0 } : a);
    await saveRotationAccounts(updated);
  };

  const saveShillCopyConfig = async () => {
    setShillCopySaving(true);
    try {
      // Load existing config to merge
      const { data: existing } = await supabase
        .from("site_configs")
        .select("id, content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "NysonBlack")
        .maybeSingle();

      const existingContent = (existing?.content as any) || {};
      const updatedContent = {
        ...existingContent,
        ticker: shillCopyTicker,
        campaign_url: shillCopyCampaignUrl,
      };

      await supabase.from("site_configs").upsert({
        ...(existing?.id ? { id: existing.id } : {}),
        site_id: "smm-auto-shill",
        section: "NysonBlack",
        content: updatedContent as any,
      } as any, { onConflict: "site_id,section" } as any);

      toast.success("Shill copy config saved — Get Shill Copy button will use these values");
    } catch {
      toast.error("Failed to save shill copy config");
    }
    setShillCopySaving(false);
  };

    const deleteScheduledPost = async (id: string) => {
    setScheduledPosts((prev) => prev.filter((p) => p.id !== id));
    toast.success("Scheduled post deleted");
  };

  const updateScheduledPost = async (post: ScheduledPost) => {
    const { error } = await supabase
      .from("shill_scheduled_posts")
      .update({
        caption: post.caption,
        scheduled_at: post.scheduled_at,
      })
      .eq("id", post.id);
    if (error) {
      toast.error("Failed to update: " + error.message);
    } else {
      toast.success("Post updated");
      setScheduledPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
    }
    setEditPostDialog(false);
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const whLastPost = throttleWH?.last_post_ms ? new Date(throttleWH.last_post_ms) : null;
  const otherLastPost = throttleOther?.last_post_ms ? new Date(throttleOther.last_post_ms) : null;

  const pendingPosts = scheduledPosts.filter((p) => p.status === "scheduled");
  const completedPosts = scheduledPosts.filter((p) => p.status === "posted");
  const failedPosts = scheduledPosts.filter((p) => p.status === "failed");

  const PENDING_PAGE_SIZE = 6;
  const pendingTotalPages = Math.max(1, Math.ceil(pendingPosts.length / PENDING_PAGE_SIZE));
  const pagedPendingPosts = pendingPosts.slice((pendingPage - 1) * PENDING_PAGE_SIZE, pendingPage * PENDING_PAGE_SIZE);

  const statusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "default";
      case "processing": return "secondary";
      case "posted": return "default";
      case "failed": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              X Community Raid Bot
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Auto-post to X communities when tweets are detected in Discord
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Bot Active</span>
              <Switch checked={sourceEnabled} onCheckedChange={toggleSource} />
            </div>
            <Badge variant={sourceEnabled ? "default" : "secondary"} className="text-xs">
              <Radio className={`h-3 w-3 mr-1 ${sourceEnabled ? "animate-pulse" : ""}`} />
              {sourceEnabled ? "LIVE" : "OFF"}
            </Badge>
            <Button size="sm" variant="outline" onClick={loadAll} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-6 max-w-3xl">
            <TabsTrigger value="overview" className="text-xs"><Activity className="h-3 w-3 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="campaign" className="text-xs"><Video className="h-3 w-3 mr-1" />Campaign</TabsTrigger>
            <TabsTrigger value="accounts" className="text-xs"><Users className="h-3 w-3 mr-1" />Accounts</TabsTrigger>
            <TabsTrigger value="communities" className="text-xs"><Globe className="h-3 w-3 mr-1" />Communities</TabsTrigger>
            <TabsTrigger value="templates" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />Messages</TabsTrigger>
            <TabsTrigger value="logs" className="text-xs"><Clock className="h-3 w-3 mr-1" />Logs</TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW ═══ */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Trump / @WhiteHouse Tracker</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Last Post</span>
                    <span className="text-xs font-mono">
                      {whLastPost ? formatDistanceToNow(whLastPost, { addSuffix: true }) : "Never"}
                    </span>
                  </div>
                  {throttleWH?.last_url && (
                    <p className="text-[10px] text-muted-foreground truncate">{throttleWH.last_url}</p>
                  )}
                  <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => resetThrottle("raid-community-wh")}>
                    Reset Cooldown
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled Posts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pending</span>
                    <span className="text-sm font-bold text-primary">{pendingPosts.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Posted</span>
                    <span className="text-sm font-bold text-green-500">{completedPosts.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Failed</span>
                    <span className="text-sm font-bold text-destructive">{failedPosts.length}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Communities</span>
                    <span className="text-sm font-bold">{targets.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Active</span>
                    <span className="text-sm font-bold text-primary">{targets.filter(t => t.enabled).length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Recent Posts</span>
                    <span className="text-sm font-bold">{logs.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Shill Copy Config — controls Get Shill Copy button output */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Shill Copy Config
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">
                  These values control the <strong>📋 Get Shill Copy</strong> button output in Discord. The ticker and link appear in every generated shill/raid copy.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Campaign Ticker</label>
                    <Input
                      value={shillCopyTicker}
                      onChange={(e) => setShillCopyTicker(e.target.value)}
                      placeholder="e.g. $WHITEHOUSE"
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Campaign Link (fallback)</label>
                    <Input
                      value={shillCopyCampaignUrl}
                      onChange={(e) => setShillCopyCampaignUrl(e.target.value)}
                      placeholder="https://x.com/community/post/..."
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    💡 If a matching owned video post (with ticker) is found in Upload-Post history, that link is used instead of the campaign link.
                  </p>
                  <Button size="sm" onClick={saveShillCopyConfig} disabled={shillCopySaving} className="gap-1.5">
                    <Save className="h-3 w-3" />
                    {shillCopySaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>1. Discord channel <code className="text-foreground">1484699554271072257</code> is monitored for X/Twitter links</p>
                <p>2. Direct <code className="text-foreground">@whitehouse</code> tweets <strong>bypass throttle</strong> and post to the community instantly</p>
                <p>3. Any Trump/WhiteHouse/POTUS related content triggers a community post (10 min + random jitter cooldown)</p>
                <p>4. Keywords detected: trump, whitehouse, white house, potus, oval office, executive order, mar-a-lago, maga, realdonaldtrump</p>
                <p>5. All intervals are randomized to avoid X spam detection</p>
                <p>6. Posts via <code className="text-foreground">@ctothispump</code> (xslaves) account</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ CAMPAIGN (TikTok/Shill Scheduler) ═══ */}
          <TabsContent value="campaign" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  Shill Campaign — Scheduled Posts
                </h3>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Max 3 posts/hour • Randomized times • Auto-posted via cron
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={loadAll} disabled={refreshing}>
                <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>

            {/* Pending Posts */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">📅 Upcoming ({pendingPosts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingPosts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No scheduled posts. Use <code>/shill</code> in Telegram and choose "Schedule" to add videos.
                  </p>
                ) : (
                  <>
                    <ScrollArea className="max-h-[350px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Scheduled</TableHead>
                            <TableHead className="text-xs">Caption</TableHead>
                            <TableHead className="text-xs">Video</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedPendingPosts.map((post) => (
                            <TableRow key={post.id}>
                              <TableCell className="text-[10px] font-mono whitespace-nowrap">
                                {format(new Date(post.scheduled_at), "MMM d, h:mm a")}
                              </TableCell>
                              <TableCell className="text-xs max-w-[200px] truncate">{post.caption}</TableCell>
                              <TableCell>
                                <a href={post.video_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                  <Play className="h-3 w-3 inline mr-1" />
                                  <span className="text-[10px]">Preview</span>
                                </a>
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusColor(post.status) as any} className="text-[9px]">
                                  {post.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                                    setEditPost({ ...post });
                                    setEditPostDialog(true);
                                  }}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteScheduledPost(post.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                    <div className="flex items-center justify-between pt-3 px-1 border-t border-border mt-2">
                      <p className="text-xs text-muted-foreground">
                        Showing {(pendingPage - 1) * PENDING_PAGE_SIZE + 1}–{Math.min(pendingPage * PENDING_PAGE_SIZE, pendingPosts.length)} of {pendingPosts.length}
                      </p>
                      {pendingTotalPages > 1 && (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={pendingPage <= 1} onClick={() => setPendingPage(p => p - 1)}>
                            Previous
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={pendingPage >= pendingTotalPages} onClick={() => setPendingPage(p => p + 1)}>
                            Next
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Completed + Failed */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">✅ Posted ({completedPosts.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[300px]">
                    {completedPosts.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No completed posts yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {completedPosts.slice(0, 20).map((post) => (
                          <div key={post.id} className="flex items-center justify-between border rounded-md p-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs truncate">{post.caption}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(post.scheduled_at), "MMM d, h:mm a")}
                              </p>
                            </div>
                            {post.post_url && (
                              <a href={post.post_url} target="_blank" rel="noopener noreferrer">
                                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0">
                                  <ExternalLink className="h-3 w-3 text-primary" />
                                </Button>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">❌ Failed ({failedPosts.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[300px]">
                    {failedPosts.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No failed posts. 🎉</p>
                    ) : (
                      <div className="space-y-2">
                        {failedPosts.slice(0, 20).map((post) => (
                          <div key={post.id} className="border border-destructive/30 rounded-md p-2 space-y-1">
                            <p className="text-xs truncate">{post.caption}</p>
                            <p className="text-[10px] text-destructive">{post.error}</p>
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(post.scheduled_at), "MMM d, h:mm a")}
                              </p>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 gap-1 text-[10px] border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                                  onClick={async () => {
                                    // Re-queue to scheduled for next cron cycle
                                    const { error } = await supabase
                                      .from("shill_scheduled_posts")
                                      .update({ status: "scheduled", error: null })
                                      .eq("id", post.id);
                                    if (error) {
                                      toast.error("Failed to re-queue: " + error.message);
                                    } else {
                                      toast.success("Post queued for next cycle");
                                      setScheduledPosts((prev) =>
                                        prev.map((p) => p.id === post.id ? { ...p, status: "scheduled", error: null } : p)
                                      );
                                    }
                                  }}
                                >
                                  <Clock className="h-2.5 w-2.5" />
                                  QUE
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 gap-1 text-[10px] border-green-500/30 text-green-600 hover:bg-green-500/10"
                                  onClick={async () => {
                                    // Set to scheduled then immediately invoke shill-scheduler
                                    const { error } = await supabase
                                      .from("shill_scheduled_posts")
                                      .update({ status: "scheduled", error: null, scheduled_at: new Date().toISOString() })
                                      .eq("id", post.id);
                                    if (error) {
                                      toast.error("Failed to push: " + error.message);
                                      return;
                                    }
                                    setScheduledPosts((prev) =>
                                      prev.map((p) => p.id === post.id ? { ...p, status: "scheduled", error: null } : p)
                                    );
                                    toast.info("Pushing post now...");
                                    try {
                                      const res = await supabase.functions.invoke("shill-scheduler");
                                      if (res.error) {
                                        toast.error("Push failed: " + res.error.message);
                                      } else {
                                        toast.success("Post pushed immediately!");
                                        // Refresh list
                                        const { data } = await supabase
                                          .from("shill_scheduled_posts")
                                          .select("*")
                                          .order("scheduled_at", { ascending: false })
                                          .limit(100);
                                        if (data) setScheduledPosts(data);
                                      }
                                    } catch (e: any) {
                                      toast.error("Push error: " + e.message);
                                    }
                                  }}
                                >
                                  <Zap className="h-2.5 w-2.5" />
                                  PUSH
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══ ACCOUNTS (Rotation Pool) ═══ */}
          <TabsContent value="accounts" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-primary" />
                  X Account Rotation Pool
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">
                  Add multiple X accounts. When one hits the daily 50-post cap, the system auto-rotates to the next active account.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add account */}
                <div className="flex gap-2">
                  <Input
                    className="text-xs flex-1"
                    placeholder="@handle (e.g. xslaves)"
                    value={newAccountHandle}
                    onChange={(e) => setNewAccountHandle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addRotationAccount()}
                  />
                  <Button size="sm" onClick={addRotationAccount}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>

                {/* Account list */}
                <div className="space-y-2">
                  {rotationAccounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No accounts configured. Add one above.</p>
                  ) : (
                    rotationAccounts.map((acc, idx) => (
                      <div key={acc.id} className="flex items-center justify-between border rounded-md p-3">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-[9px] font-mono">#{idx + 1}</Badge>
                          <div>
                            <p className="text-sm font-medium">@{acc.handle}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {acc.posts_today} posts today
                              {acc.capped_at && ` • Capped ${formatDistanceToNow(new Date(acc.capped_at), { addSuffix: true })}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={acc.status === "active" ? "default" : acc.status === "capped" ? "destructive" : "secondary"}
                            className="text-[9px]"
                          >
                            {acc.status === "active" ? "🟢 ACTIVE" : acc.status === "capped" ? "🔴 CAPPED" : "⏸ PAUSED"}
                          </Badge>
                          {acc.status === "capped" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => resetAccountCap(acc.id)}>
                              Reset Cap
                            </Button>
                          )}
                          {acc.status !== "capped" && (
                            <Switch
                              checked={acc.status === "active"}
                              onCheckedChange={(v) => toggleAccountStatus(acc.id, v ? "active" : "paused")}
                            />
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeRotationAccount(acc.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <Separator />

                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">How Rotation Works:</p>
                  <p>1. Posts are sent using the first <strong>active</strong> account in the list</p>
                  <p>2. If the Upload-Post API returns a "daily cap" error, the account is auto-marked as <strong>CAPPED</strong></p>
                  <p>3. The system immediately retries with the next active account in the rotation</p>
                  <p>4. Capped accounts auto-reset at midnight UTC (or manually via "Reset Cap")</p>
                  <p>5. If all accounts are capped, posts are queued until an account is available</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="communities" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Target Communities</h3>
              <Button size="sm" onClick={() => {
                setEditTarget({ ...DEFAULT_TARGET, id: crypto.randomUUID() } as CommunityTarget);
                setEditDialog(true);
              }}>
                <Plus className="h-3 w-3 mr-1" /> Add Community
              </Button>
            </div>

            <div className="space-y-3">
              {targets.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={t.enabled ? "default" : "secondary"} className="text-[10px]">
                          {t.enabled ? "ACTIVE" : "OFF"}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">{t.community_name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">ID: {t.community_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-[10px] text-muted-foreground mr-2">
                          <p>Account: @{t.x_account}</p>
                          <p>${t.ticker} • WH: {t.whitehouse_interval_min}m / Other: {t.other_interval_min}m</p>
                        </div>
                        <Switch
                          checked={t.enabled}
                          onCheckedChange={(v) => {
                            const updated = targets.map(x => x.id === t.id ? { ...x, enabled: v } : x);
                            saveTargets(updated);
                          }}
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                          setEditTarget({ ...t });
                          setEditDialog(true);
                        }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                          saveTargets(targets.filter(x => x.id !== t.id));
                        }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {targets.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No communities configured. Add one to get started.</p>
              )}
            </div>
          </TabsContent>

          {/* ═══ TEMPLATES ═══ */}
          <TabsContent value="templates" className="space-y-4 mt-4">
            {targets.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t.community_name} — Message Templates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">@WhiteHouse Messages ({t.whitehouse_templates.length})</p>
                    <div className="space-y-2">
                      {t.whitehouse_templates.map((msg, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <Badge variant="outline" className="text-[9px] mt-1 shrink-0">{i + 1}</Badge>
                          <Textarea
                            className="text-xs min-h-[50px]"
                            value={msg}
                            onChange={(e) => {
                              const updated = targets.map(x => {
                                if (x.id !== t.id) return x;
                                const newTemplates = [...x.whitehouse_templates];
                                newTemplates[i] = e.target.value;
                                return { ...x, whitehouse_templates: newTemplates };
                              });
                              setTargets(updated);
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive" onClick={() => {
                            const updated = targets.map(x => {
                              if (x.id !== t.id) return x;
                              return { ...x, whitehouse_templates: x.whitehouse_templates.filter((_, idx) => idx !== i) };
                            });
                            setTargets(updated);
                          }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                        const updated = targets.map(x => x.id === t.id
                          ? { ...x, whitehouse_templates: [...x.whitehouse_templates, ""] }
                          : x
                        );
                        setTargets(updated);
                      }}>
                        <Plus className="h-3 w-3 mr-1" /> Add Template
                      </Button>
                    </div>
                  </div>

                  <Button className="w-full" onClick={() => saveTargets(targets)}>
                    <Save className="h-3 w-3 mr-1" /> Save All Templates
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ═══ LOGS ═══ */}
          <TabsContent value="logs" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent Raid Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Time</TableHead>
                        <TableHead className="text-xs">Action</TableHead>
                        <TableHead className="text-xs">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-[10px] font-mono whitespace-nowrap">
                            {format(new Date(log.created_at), "MMM d HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px]">{log.action}</Badge>
                          </TableCell>
                          <TableCell className="text-[10px] text-muted-foreground max-w-[300px] truncate">
                            {log.meta?.name || log.meta?.last_url || JSON.stringify(log.meta).slice(0, 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {logs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                            No raid activity yet. Posts will appear here once tweets are detected.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ═══ EDIT COMMUNITY DIALOG ═══ */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">{editTarget?.community_name ? "Edit" : "Add"} Community Target</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground">Community Name</label>
                  <Input className="text-xs" value={editTarget.community_name}
                    onChange={(e) => setEditTarget({ ...editTarget, community_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Community ID</label>
                  <Input className="text-xs font-mono" value={editTarget.community_id}
                    onChange={(e) => setEditTarget({ ...editTarget, community_id: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground">X Account</label>
                  <Input className="text-xs" value={editTarget.x_account}
                    onChange={(e) => setEditTarget({ ...editTarget, x_account: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Ticker</label>
                  <Input className="text-xs" value={editTarget.ticker}
                    onChange={(e) => setEditTarget({ ...editTarget, ticker: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">CA</label>
                  <Input className="text-xs font-mono" value={editTarget.ca}
                    onChange={(e) => setEditTarget({ ...editTarget, ca: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground">WH Interval (min)</label>
                  <Input type="number" className="text-xs" value={editTarget.whitehouse_interval_min}
                    onChange={(e) => setEditTarget({ ...editTarget, whitehouse_interval_min: +e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Other Interval (min)</label>
                  <Input type="number" className="text-xs" value={editTarget.other_interval_min}
                    onChange={(e) => setEditTarget({ ...editTarget, other_interval_min: +e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground">WH Jitter (min)</label>
                  <Input type="number" className="text-xs" value={editTarget.whitehouse_jitter_min}
                    onChange={(e) => setEditTarget({ ...editTarget, whitehouse_jitter_min: +e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Other Jitter (min)</label>
                  <Input type="number" className="text-xs" value={editTarget.other_jitter_min}
                    onChange={(e) => setEditTarget({ ...editTarget, other_jitter_min: +e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!editTarget) return;
              const exists = targets.find(t => t.id === editTarget.id);
              const updated = exists
                ? targets.map(t => t.id === editTarget.id ? editTarget : t)
                : [...targets, editTarget];
              saveTargets(updated);
              setEditDialog(false);
            }}>
              <Save className="h-3 w-3 mr-1" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ EDIT SCHEDULED POST DIALOG ═══ */}
      <Dialog open={editPostDialog} onOpenChange={setEditPostDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Scheduled Post</DialogTitle>
          </DialogHeader>
          {editPost && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground">Caption</label>
                <Textarea
                  className="text-xs min-h-[80px]"
                  value={editPost.caption}
                  onChange={(e) => setEditPost({ ...editPost, caption: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Scheduled At</label>
                <Input
                  type="datetime-local"
                  className="text-xs"
                  value={editPost.scheduled_at.slice(0, 16)}
                  onChange={(e) => setEditPost({ ...editPost, scheduled_at: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Video</label>
                <a href={editPost.video_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Preview Video
                </a>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPostDialog(false)}>Cancel</Button>
            <Button onClick={() => editPost && updateScheduledPost(editPost)}>
              <Save className="h-3 w-3 mr-1" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}