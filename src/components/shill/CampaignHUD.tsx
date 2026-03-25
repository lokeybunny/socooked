import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Save, Play, Pause, Pencil, Trash2, Radio, Shield, Target,
  Users, Activity, Zap, ExternalLink, BadgeCheck, RotateCcw, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

/* ─── Constants ─── */
const SHILL_NOW_CHANNELS = [
  { id: "1484699554271072257", label: "High Engagement Accts", emoji: "🔥" },
  { id: "1486405756591935508", label: "Crypto Accts", emoji: "🪙" },
] as const;

const DISCORD_ROOMS = {
  shillLounge: "1484998470103466156",
  raidLounge: "1485050868838564030",
};

/* ─── Types ─── */
export interface CampaignConfig {
  id: string;
  name: string;
  ticker: string;
  links: string[];
  active: boolean;
  team?: "home" | "away";
  shill_now_channel: string;       // Discord channel ID for "Shill Now"
  shill_lounge_enabled: boolean;
  raid_lounge_enabled: boolean;
}

interface RotationAccount {
  id: string;
  handle: string;
  status: "active" | "paused" | "capped";
  capped_at?: string;
  posts_today: number;
}

interface TodayStats {
  totalClicks: number;
  totalPosts: number;
  activeAccounts: number;
  cappedAccounts: number;
}

const XHandle = ({ handle }: { handle: string }) => (
  <span className="inline-flex items-center gap-1 text-sm font-medium">
    @{handle}<BadgeCheck className="h-3.5 w-3.5 text-[#1d9bf0] shrink-0" />
  </span>
);

export default function CampaignHUD() {
  const [campaigns, setCampaigns] = useState<CampaignConfig[]>([]);
  const [rotationAccounts, setRotationAccounts] = useState<RotationAccount[]>([]);
  const [stats, setStats] = useState<TodayStats>({ totalClicks: 0, totalPosts: 0, activeAccounts: 0, cappedAccounts: 0 });
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);
  const [draft, setDraft] = useState<CampaignConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [botEnabled, setBotEnabled] = useState(true);
  const [activeListenChannel, setActiveListenChannel] = useState(SHILL_NOW_CHANNELS[0].id);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load campaigns
      const { data: campaignsCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "shill-copy-campaigns")
        .maybeSingle();

      let loadedCampaigns: CampaignConfig[] = [];
      if (campaignsCfg?.content) {
        const raw = (campaignsCfg.content as any).campaigns || [];
        loadedCampaigns = raw.map((c: any) => ({
          ...c,
          shill_now_channel: c.shill_now_channel || SHILL_NOW_CHANNELS[0].id,
          shill_lounge_enabled: c.shill_lounge_enabled ?? true,
          raid_lounge_enabled: c.raid_lounge_enabled ?? true,
        }));
      }
      setCampaigns(loadedCampaigns);

      // Load Discord listener source config
      const { data: srcCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "raid-community-source")
        .maybeSingle();
      if (srcCfg?.content) {
        const src = srcCfg.content as any;
        setBotEnabled(!!src.enabled);
        setActiveListenChannel(src.discord_listen_channel_id || SHILL_NOW_CHANNELS[0].id);
      }

      // Load rotation accounts
      const { data: rotCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "shill-rotation-accounts")
        .maybeSingle();
      const accounts: RotationAccount[] = (rotCfg?.content as any)?.accounts || [];
      setRotationAccounts(accounts);

      // Load today's stats
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: clickCount } = await supabase
        .from("shill_clicks")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString());

      const { count: postCount } = await supabase
        .from("shill_scheduled_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "posted")
        .gte("updated_at", todayStart.toISOString());

      setStats({
        totalClicks: clickCount || 0,
        totalPosts: postCount || 0,
        activeAccounts: accounts.filter(a => a.status === "active").length,
        cappedAccounts: accounts.filter(a => a.status === "capped").length,
      });
    } catch (e) {
      console.error("CampaignHUD load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveListenerConfig = async (enabled: boolean, channelId: string) => {
    setBotEnabled(enabled);
    setActiveListenChannel(channelId);
    await supabase.from("site_configs").upsert({
      site_id: "smm-auto-shill",
      section: "raid-community-source",
      content: {
        enabled,
        discord_listen_channel_id: channelId,
        discord_channel_id: channelId,
      } as any,
    } as any, { onConflict: "site_id,section" } as any);
    const label = SHILL_NOW_CHANNELS.find(ch => ch.id === channelId);
    toast.success(enabled ? `Listener ON → ${label?.label || channelId}` : "Listener OFF");
  };

  const saveCampaigns = async (updated: CampaignConfig[]) => {
    setSaving(true);
    try {
      await supabase.from("site_configs").upsert({
        site_id: "smm-auto-shill",
        section: "shill-copy-campaigns",
        content: { campaigns: updated } as any,
      } as any, { onConflict: "site_id,section" } as any);

      // Sync active campaign to NysonBlack for edge function compatibility
      const activeCampaign = updated.find(c => c.active);
      const { data: existing } = await supabase
        .from("site_configs")
        .select("id, content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "NysonBlack")
        .maybeSingle();
      const existingContent = (existing?.content as any) || {};
      const updatedContent = {
        ...existingContent,
        ticker: activeCampaign?.ticker || "",
        campaign_url: activeCampaign?.links?.find(l => l.trim()) || "",
        campaign_links: activeCampaign?.links || ["", "", "", "", ""],
        shill_now_channel: activeCampaign?.shill_now_channel || SHILL_NOW_CHANNELS[0].id,
      };
      await supabase.from("site_configs").upsert({
        ...(existing?.id ? { id: existing.id } : {}),
        site_id: "smm-auto-shill",
        section: "NysonBlack",
        content: updatedContent as any,
      } as any, { onConflict: "site_id,section" } as any);

      // Also sync to raid-community-source so the discord watcher knows which channel to listen to
      if (activeCampaign) {
        await supabase.from("site_configs").upsert({
          site_id: "smm-auto-shill",
          section: "raid-community-source",
          content: {
            enabled: true,
            discord_listen_channel_id: activeCampaign.shill_now_channel,
            discord_channel_id: activeCampaign.shill_now_channel,
          } as any,
        } as any, { onConflict: "site_id,section" } as any);
      }

      setCampaigns(updated);
      toast.success(activeCampaign ? `Active: $${activeCampaign.ticker}` : "Campaigns saved");
    } catch {
      toast.error("Failed to save campaigns");
    }
    setSaving(false);
  };

  const activateCampaign = async (id: string) => {
    const updated = campaigns.map(c => ({ ...c, active: c.id === id }));
    await saveCampaigns(updated);
  };

  const deactivateCampaign = async (id: string) => {
    const updated = campaigns.map(c => c.id === id ? { ...c, active: false } : c);
    await saveCampaigns(updated);
  };

  const deleteCampaign = async (id: string) => {
    await saveCampaigns(campaigns.filter(c => c.id !== id));
  };

  const openNewCampaign = () => {
    setDraft({
      id: crypto.randomUUID(),
      name: "",
      ticker: "",
      links: ["", "", "", "", ""],
      active: false,
      shill_now_channel: SHILL_NOW_CHANNELS[0].id,
      shill_lounge_enabled: true,
      raid_lounge_enabled: true,
    });
    setIsEditing(false);
    setEditDialog(true);
  };

  const openEditCampaign = (c: CampaignConfig) => {
    setDraft({ ...c, links: [...c.links, "", "", "", "", ""].slice(0, 5) });
    setIsEditing(true);
    setEditDialog(true);
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.ticker.trim()) { toast.error("Ticker is required"); return; }
    if (!draft.name.trim()) draft.name = `$${draft.ticker.replace(/^\$/, "")} Campaign`;

    let updated: CampaignConfig[];
    if (isEditing) {
      updated = campaigns.map(c => c.id === draft.id ? draft : c);
    } else {
      updated = [...campaigns, draft];
    }
    await saveCampaigns(updated);
    setEditDialog(false);
    setDraft(null);
  };

  const activeCampaign = campaigns.find(c => c.active);
  const channelLabel = SHILL_NOW_CHANNELS.find(ch => ch.id === activeCampaign?.shill_now_channel);

  return (
    <div className="space-y-4">
      {/* Active Campaign Hero */}
      <Card className={activeCampaign ? "border-primary/50 bg-primary/5" : "border-destructive/30"}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className={`h-4 w-4 ${activeCampaign ? "text-primary animate-pulse" : "text-destructive"}`} />
              {activeCampaign ? `Active Campaign: $${activeCampaign.ticker.replace(/^\$/, "")}` : "No Active Campaign"}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={openNewCampaign} className="gap-1.5 text-xs">
              <Plus className="h-3 w-3" /> New Campaign
            </Button>
          </div>
        </CardHeader>
        {activeCampaign && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ticker</p>
                <p className="text-lg font-bold font-mono text-primary">${activeCampaign.ticker.replace(/^\$/, "")}</p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Shill Now Channel</p>
                <p className="text-sm font-semibold">{channelLabel?.emoji} {channelLabel?.label || "Unknown"}</p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Links</p>
                <p className="text-lg font-bold">{activeCampaign.links.filter(l => l.trim()).length} <span className="text-xs text-muted-foreground font-normal">/ 5</span></p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Team</p>
                <p className="text-sm font-semibold">{activeCampaign.team === "away" ? "✈️ Away" : "🏠 Home"}</p>
              </div>
            </div>

            {/* Discord Room Controls */}
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Shill Lounge</span>
                <Switch
                  checked={activeCampaign.shill_lounge_enabled}
                  onCheckedChange={async (v) => {
                    const updated = campaigns.map(c => c.id === activeCampaign.id ? { ...c, shill_lounge_enabled: v } : c);
                    await saveCampaigns(updated);
                  }}
                />
                <Badge variant={activeCampaign.shill_lounge_enabled ? "default" : "secondary"} className="text-[8px]">
                  {activeCampaign.shill_lounge_enabled ? "ON" : "OFF"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Raid Lounge</span>
                <Switch
                  checked={activeCampaign.raid_lounge_enabled}
                  onCheckedChange={async (v) => {
                    const updated = campaigns.map(c => c.id === activeCampaign.id ? { ...c, raid_lounge_enabled: v } : c);
                    await saveCampaigns(updated);
                  }}
                />
                <Badge variant={activeCampaign.raid_lounge_enabled ? "default" : "secondary"} className="text-[8px]">
                  {activeCampaign.raid_lounge_enabled ? "ON" : "OFF"}
                </Badge>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.totalClicks}</p>
            <p className="text-[10px] text-muted-foreground">Clicks Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats.totalPosts}</p>
            <p className="text-[10px] text-muted-foreground">Posts Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.activeAccounts}</p>
            <p className="text-[10px] text-muted-foreground">Active Accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.cappedAccounts}</p>
            <p className="text-[10px] text-muted-foreground">Capped Accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Active X Accounts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Active X Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rotationAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No accounts configured.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rotationAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${
                    acc.status === "active"
                      ? "border-green-500/30 bg-green-500/5 text-green-600"
                      : acc.status === "capped"
                      ? "border-destructive/30 bg-destructive/5 text-destructive"
                      : "border-muted bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {acc.status === "active" ? "✅" : acc.status === "capped" ? "⛔" : "⏸"}
                  <XHandle handle={acc.handle} />
                  {acc.posts_today > 0 && (
                    <span className="text-[9px] opacity-70">({acc.posts_today})</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Campaigns */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              All Campaigns
            </CardTitle>
            <Button size="sm" variant="outline" onClick={openNewCampaign} className="gap-1.5 text-xs">
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Only one campaign can be active at a time. Switching activates its channel routing and copy config.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No campaigns. Create your first one to get started.</p>
          )}
          {campaigns.map((c) => {
            const ch = SHILL_NOW_CHANNELS.find(ch => ch.id === c.shill_now_channel);
            return (
              <div
                key={c.id}
                className={`border rounded-lg p-4 space-y-2 transition-colors ${
                  c.active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold truncate">{c.name || `$${c.ticker} Campaign`}</span>
                    <Badge variant={c.active ? "default" : "secondary"} className="text-[9px] shrink-0">
                      {c.active ? "🟢 ACTIVE" : "INACTIVE"}
                    </Badge>
                    {c.team && (
                      <Badge variant="outline" className="text-[8px] shrink-0">
                        {c.team === "away" ? "✈️ AWAY" : "🏠 HOME"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.active ? (
                      <Button size="sm" variant="outline" onClick={() => deactivateCampaign(c.id)} className="text-[10px] h-7 px-2 gap-1">
                        <Pause className="h-3 w-3" /> Deactivate
                      </Button>
                    ) : (
                      <Button size="sm" variant="default" onClick={() => activateCampaign(c.id)} className="text-[10px] h-7 px-2 gap-1">
                        <Play className="h-3 w-3" /> Activate
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEditCampaign(c)} className="h-7 w-7 p-0">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteCampaign(c.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Ticker:</span>{" "}
                    <span className="font-mono font-bold">${c.ticker.replace(/^\$/, "")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Channel:</span>{" "}
                    <span>{ch?.emoji} {ch?.label || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Links:</span>{" "}
                    <span>{c.links.filter(l => l.trim()).length} configured</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rooms:</span>{" "}
                    <span>
                      {c.shill_lounge_enabled && "Shill"}
                      {c.shill_lounge_enabled && c.raid_lounge_enabled && " + "}
                      {c.raid_lounge_enabled && "Raid"}
                      {!c.shill_lounge_enabled && !c.raid_lounge_enabled && "None"}
                    </span>
                  </div>
                </div>

                {/* Quick link preview */}
                {c.links.filter(l => l.trim()).length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {c.links.filter(l => l.trim()).map((link, i) => (
                      <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[9px] text-primary hover:underline">
                        <ExternalLink className="h-2.5 w-2.5" />Link {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Campaign" : "New Campaign"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Campaign Name</label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. $WHITEHOUSE SHILL"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Ticker</label>
                  <Input
                    value={draft.ticker}
                    onChange={(e) => setDraft({ ...draft, ticker: e.target.value })}
                    placeholder="WHITEHOUSE"
                    className="h-9 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Team</label>
                <Select value={draft.team || "home"} onValueChange={(v) => setDraft({ ...draft, team: v as "home" | "away" })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">🏠 Home Team</SelectItem>
                    <SelectItem value="away">✈️ Away Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">"Shill Now" Channel</label>
                <p className="text-[10px] text-muted-foreground">Which Discord channel the bot listens to for auto-posting.</p>
                <Select value={draft.shill_now_channel} onValueChange={(v) => setDraft({ ...draft, shill_now_channel: v })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHILL_NOW_CHANNELS.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.emoji} {ch.label} ({ch.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Rotation Links (up to 5)</label>
                {draft.links.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] w-5 h-5 flex items-center justify-center p-0 shrink-0">
                      {idx + 1}
                    </Badge>
                    <Input
                      value={link}
                      onChange={(e) => {
                        const u = [...draft.links];
                        u[idx] = e.target.value;
                        setDraft({ ...draft, links: u });
                      }}
                      placeholder={idx === 0 ? "https://x.com/... (primary)" : "https://x.com/... (optional)"}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Discord Rooms</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={draft.shill_lounge_enabled}
                      onCheckedChange={(v) => setDraft({ ...draft, shill_lounge_enabled: v })}
                    />
                    <span className="text-xs">Shill Lounge</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={draft.raid_lounge_enabled}
                      onCheckedChange={(v) => setDraft({ ...draft, raid_lounge_enabled: v })}
                    />
                    <span className="text-xs">Raid Lounge</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={saveDraft} disabled={saving} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
