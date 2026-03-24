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

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      // Load community targets from site_configs
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
        // Seed default
        const defaultTargets = [{ ...DEFAULT_TARGET, id: crypto.randomUUID() }];
        setTargets(defaultTargets);
      }

      // Load source channel config
      const { data: srcCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "raid-community-source")
        .single();
      setSourceEnabled(!!(srcCfg?.content as any)?.enabled);

      // Load throttle states
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

      // Load recent activity logs
      const { data: logData } = await supabase
        .from("activity_log")
        .select("id, created_at, action, meta")
        .eq("entity_type", "smm")
        .or("action.ilike.%raid%,action.ilike.%community%,action.eq.cortex_upload-text")
        .order("created_at", { ascending: false })
        .limit(100);
      setLogs(logData || []);
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

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const whLastPost = throttleWH?.last_post_ms ? new Date(throttleWH.last_post_ms) : null;
  const otherLastPost = throttleOther?.last_post_ms ? new Date(throttleOther.last_post_ms) : null;

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
          <TabsList className="grid w-full grid-cols-4 max-w-lg">
            <TabsTrigger value="overview" className="text-xs"><Activity className="h-3 w-3 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="communities" className="text-xs"><Globe className="h-3 w-3 mr-1" />Communities</TabsTrigger>
            <TabsTrigger value="templates" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />Messages</TabsTrigger>
            <TabsTrigger value="logs" className="text-xs"><Clock className="h-3 w-3 mr-1" />Logs</TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW ═══ */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Status Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">@WhiteHouse Tracker</CardTitle>
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

              {/* Other Tracker */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Other Accounts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Last Post</span>
                    <span className="text-xs font-mono">
                      {otherLastPost ? formatDistanceToNow(otherLastPost, { addSuffix: true }) : "Never"}
                    </span>
                  </div>
                  {throttleOther?.last_url && (
                    <p className="text-[10px] text-muted-foreground truncate">{throttleOther.last_url}</p>
                  )}
                  <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => resetThrottle("raid-community-other")}>
                    Reset Cooldown
                  </Button>
                </CardContent>
              </Card>

              {/* Stats */}
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
                    <span className="text-sm font-bold text-green-500">{targets.filter(t => t.enabled).length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Recent Posts</span>
                    <span className="text-sm font-bold">{logs.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* How it works */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>1. Discord channel <code className="text-foreground">1484699554271072257</code> is monitored for X/Twitter links</p>
                <p>2. If <code className="text-foreground">@whitehouse</code> is detected → post to community with $WHITEHOUSE message + CA (10 min + random jitter)</p>
                <p>3. If other account → post generic raid message (20 min + random jitter)</p>
                <p>4. All intervals are randomized to avoid X spam detection</p>
                <p>5. Posts via <code className="text-foreground">@ctothispump</code> (xslaves) account</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ COMMUNITIES ═══ */}
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

                  <Separator />

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Other Account Messages ({t.other_templates.length})</p>
                    <div className="space-y-2">
                      {t.other_templates.map((msg, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <Badge variant="outline" className="text-[9px] mt-1 shrink-0">{i + 1}</Badge>
                          <Textarea
                            className="text-xs min-h-[50px]"
                            value={msg}
                            onChange={(e) => {
                              const updated = targets.map(x => {
                                if (x.id !== t.id) return x;
                                const newTemplates = [...x.other_templates];
                                newTemplates[i] = e.target.value;
                                return { ...x, other_templates: newTemplates };
                              });
                              setTargets(updated);
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive" onClick={() => {
                            const updated = targets.map(x => {
                              if (x.id !== t.id) return x;
                              return { ...x, other_templates: x.other_templates.filter((_, idx) => idx !== i) };
                            });
                            setTargets(updated);
                          }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                        const updated = targets.map(x => x.id === t.id
                          ? { ...x, other_templates: [...x.other_templates, ""] }
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
    </div>
  );
}
