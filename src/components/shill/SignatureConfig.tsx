import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, BadgeCheck, Shield, RefreshCw, Trash2, ChevronLeft, ChevronRight, Timer } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface SigConfig {
  enabled: boolean;
  mode: "all" | "verified";
  scrape_ids: string[];
  apply_to_shill_copy: boolean;
  shill_copy_mode: "all" | "verified";
}

interface CommScrape {
  id: string;
  name: string;
  member_count: number;
  created_at: string;
}

interface UsageEntry {
  handle: string;
  used_at: string;
  source?: string;
}

const SITE_ID = "smm-auto-shill";
const SECTION = "shill-signature-config";
const PAGE_SIZE = 25;

export default function SignatureConfig() {
  const [config, setConfig] = useState<SigConfig>({ enabled: false, mode: "all", scrape_ids: [], apply_to_shill_copy: false, shill_copy_mode: "all" });
  const [scrapes, setScrapes] = useState<CommScrape[]>([]);
  const [recentUsage, setRecentUsage] = useState<UsageEntry[]>([]);
  const [totalUsage, setTotalUsage] = useState(0);
  const [usagePage, setUsagePage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cooldownOpen, setCooldownOpen] = useState(false);
  const [cooldownHandles, setCooldownHandles] = useState<UsageEntry[]>([]);
  const [cooldownTotal, setCooldownTotal] = useState(0);
  const [cooldownPage, setCooldownPage] = useState(0);
  const COOLDOWN_PAGE_SIZE = 100;

  const loadUsagePage = useCallback(async (page: number) => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from("signature_usage")
      .select("handle, used_at, source", { count: "exact" })
      .order("used_at", { ascending: false })
      .range(from, to);
    setRecentUsage((data as UsageEntry[]) || []);
    setTotalUsage(count || 0);
    setUsagePage(page);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [cfgRes, scrapesRes] = await Promise.all([
      supabase.from("site_configs").select("content").eq("site_id", SITE_ID).eq("section", SECTION).maybeSingle(),
      supabase.from("comm_scrapes").select("id, name, member_count, created_at").order("created_at", { ascending: false }),
    ]);
    if (cfgRes.data?.content) {
      const c = cfgRes.data.content as any;
      setConfig({ enabled: !!c.enabled, mode: c.mode || "all", scrape_ids: c.scrape_ids || [], apply_to_shill_copy: !!c.apply_to_shill_copy, shill_copy_mode: c.shill_copy_mode || "all" });
    }
    setScrapes(scrapesRes.data || []);
    await loadUsagePage(0);
    setLoading(false);
  }, [loadUsagePage]);

  useEffect(() => { load(); }, [load]);

  const save = async (updated: SigConfig) => {
    setSaving(true);
    setConfig(updated);
    await supabase.from("site_configs").upsert({
      site_id: SITE_ID,
      section: SECTION,
      content: updated as any,
    } as any, { onConflict: "site_id,section" } as any);
    setSaving(false);
    toast.success("Signature config saved");
  };

  const toggleScrape = (id: string) => {
    const ids = config.scrape_ids.includes(id)
      ? config.scrape_ids.filter(s => s !== id)
      : [...config.scrape_ids, id];
    save({ ...config, scrape_ids: ids });
  };

  const clearUsageHistory = async () => {
    await supabase.from("signature_usage").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setRecentUsage([]);
    setTotalUsage(0);
    setUsagePage(0);
    toast.success("Usage history cleared — all handles available again");
  };

  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const onCooldown = new Set(recentUsage.filter(u => new Date(u.used_at) > fiveDaysAgo).map(u => u.handle));

  const selectedScrapes = scrapes.filter(s => config.scrape_ids.includes(s.id));
  const totalMembers = selectedScrapes.reduce((sum, s) => sum + s.member_count, 0);

  const totalPages = Math.ceil(totalUsage / PAGE_SIZE);
  const cooldownTotalPages = Math.ceil(cooldownTotal / COOLDOWN_PAGE_SIZE);

  const loadCooldownPage = async (page: number) => {
    const fiveDaysAgoISO = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const from = page * COOLDOWN_PAGE_SIZE;
    const to = from + COOLDOWN_PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from("signature_usage")
      .select("handle, used_at, source", { count: "exact" })
      .gte("used_at", fiveDaysAgoISO)
      .order("used_at", { ascending: false })
      .range(from, to);
    setCooldownHandles((data as UsageEntry[]) || []);
    setCooldownTotal(count || 0);
    setCooldownPage(page);
  };

  const openCooldownModal = async () => {
    setCooldownOpen(true);
    await loadCooldownPage(0);
  };

  const sourceLabel = (src?: string) => {
    if (src === "shill_copy") return "📋 Copy";
    if (src === "live_post") return "📡 Live";
    return "—";
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading signature config…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Tweet Signature — @Handle Injection
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{config.enabled ? "Active" : "Disabled"}</span>
              <Switch checked={config.enabled} onCheckedChange={v => save({ ...config, enabled: v })} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Appends random @handles from selected community scrapes to scheduled tweets. Each handle has a 5-day cooldown after use.
          </p>

          {/* Mode Toggle */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-foreground">Handle Source:</span>
            <div className="flex gap-1">
              {(["all", "verified"] as const).map(m => (
                <Button
                  key={m}
                  size="sm"
                  variant={config.mode === m ? "default" : "outline"}
                  className="text-xs h-7 px-3"
                  onClick={() => save({ ...config, mode: m })}
                >
                  {m === "all" ? (
                    <><Users className="h-3 w-3 mr-1" />All Members</>
                  ) : (
                    <><BadgeCheck className="h-3 w-3 mr-1" />Verified Only</>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Apply to Shill Copy Toggle */}
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-foreground">Apply to Get Shill Copy</span>
              <p className="text-[10px] text-muted-foreground">
                Also append @handle signatures to Discord "Get Shill Copy" output. Same cooldown rules apply.
              </p>
            </div>
            <Switch
              checked={config.apply_to_shill_copy}
              onCheckedChange={v => save({ ...config, apply_to_shill_copy: v })}
            />
          </div>

          {/* Shill Copy Mode Toggle */}
          {config.apply_to_shill_copy && (
            <div className="flex items-center gap-4 pl-1">
              <span className="text-xs font-medium text-foreground">Shill Copy Source:</span>
              <div className="flex gap-1">
                {(["all", "verified"] as const).map(m => (
                  <Button
                    key={m}
                    size="sm"
                    variant={config.shill_copy_mode === m ? "default" : "outline"}
                    className="text-xs h-7 px-3"
                    onClick={() => save({ ...config, shill_copy_mode: m })}
                  >
                    {m === "all" ? (
                      <><Users className="h-3 w-3 mr-1" />All Members</>
                    ) : (
                      <><BadgeCheck className="h-3 w-3 mr-1" />Verified Only</>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-muted-foreground">{selectedScrapes.length} source{selectedScrapes.length !== 1 ? "s" : ""} selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">{totalMembers.toLocaleString()} total members</span>
            </div>
            <button
              onClick={openCooldownModal}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-muted-foreground underline decoration-dotted">{onCooldown.size} on cooldown</span>
              <Timer className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Source Selection */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Select Community Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {scrapes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No community scrapes found. Use Comm Extract to scrape a community first.
            </p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {scrapes.map(s => (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={config.scrape_ids.includes(s.id)}
                      onCheckedChange={() => toggleScrape(s.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.member_count.toLocaleString()} members · scraped {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {config.scrape_ids.includes(s.id) && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Selected</Badge>
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Recent Usage / Cooldown with Pagination */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Recent Handle Usage ({totalUsage.toLocaleString()} total)
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadUsagePage(usagePage)}>
                <RefreshCw className="h-3 w-3 mr-1" />Refresh
              </Button>
              {totalUsage > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={clearUsageHistory}>
                  <Trash2 className="h-3 w-3 mr-1" />Clear All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {recentUsage.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No handles used yet.</p>
          ) : (
            <>
              <ScrollArea className="max-h-[200px]">
                <div className="flex flex-wrap gap-1.5">
                  {recentUsage.map((u, i) => {
                    const isActive = new Date(u.used_at) > fiveDaysAgo;
                    return (
                      <Badge
                        key={`${u.handle}-${i}`}
                        variant={isActive ? "destructive" : "secondary"}
                        className="text-[10px] font-mono"
                      >
                        @{u.handle}
                        <span className="ml-1 opacity-60">
                          {sourceLabel(u.source)} · {formatDistanceToNow(new Date(u.used_at), { addSuffix: true })}
                        </span>
                      </Badge>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    Page {usagePage + 1} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      disabled={usagePage === 0}
                      onClick={() => loadUsagePage(usagePage - 1)}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      disabled={usagePage >= totalPages - 1}
                      onClick={() => loadUsagePage(usagePage + 1)}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Preview Format</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs text-foreground leading-relaxed">
            <p>Your scheduled caption text here...</p>
            <p className="mt-1">CA - 7oXNE1d...pump</p>
            <p className="mt-2 text-muted-foreground">
              ⌈ @user1 · @user2 · @user3 · @user4 · @user5 ⌋
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Handles are selected randomly, respecting the 5-day cooldown. Max handles are calculated from remaining character space (280 char limit). Source tracked as 📡 Live (scheduled posts) or 📋 Copy (Discord shill copy).
          </p>
        </CardContent>
      </Card>

      {/* Cooldown Modal */}
      <Dialog open={cooldownOpen} onOpenChange={setCooldownOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4 text-primary" />
              Handles on 5-Day Cooldown ({cooldownTotal.toLocaleString()})
            </DialogTitle>
          </DialogHeader>
          {cooldownHandles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No handles currently on cooldown.</p>
          ) : (
            <div className="space-y-3">
              <ScrollArea className="max-h-[400px]">
                <div className="flex flex-wrap gap-1.5">
                  {cooldownHandles.map((u, i) => (
                    <Badge
                      key={`cd-${u.handle}-${i}`}
                      variant="destructive"
                      className="text-[10px] font-mono"
                    >
                      @{u.handle}
                      <span className="ml-1 opacity-60">
                        {sourceLabel(u.source)} · {formatDistanceToNow(new Date(u.used_at), { addSuffix: true })}
                      </span>
                    </Badge>
                  ))}
                </div>
              </ScrollArea>

              {cooldownTotalPages > 1 && (
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    Page {cooldownPage + 1} of {cooldownTotalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      disabled={cooldownPage === 0}
                      onClick={() => loadCooldownPage(cooldownPage - 1)}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      disabled={cooldownPage >= cooldownTotalPages - 1}
                      onClick={() => loadCooldownPage(cooldownPage + 1)}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
