import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  CheckCircle2, AlertCircle, MessageSquare, Zap, ExternalLink, ArrowDownCircle,
  Users, Clock, ShieldAlert, Repeat2, Hash, Trash2, KeyRound, History, Radio,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { SMMProfile } from '@/lib/smm/types';
import { supabase } from '@/integrations/supabase/client';

interface AutoShillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileUsername: string;
  profiles?: SMMProfile[];
}

interface ShillConfig {
  enabled: boolean;
  campaign_url: string;
  ticker: string;
  discord_app_id: string;
  discord_public_key: string;
  discord_channel_id: string;
  discord_listen_channel_id: string;
  discord_reply_channel_id: string;
  team_accounts: string[];
  retweet_accounts: string[];
  account_hashtags: Record<string, string>;
  discord_assignments: Record<string, string>;
}

interface FeedEntry {
  id: string;
  action: string;
  meta: any;
  created_at: string;
}

interface AuthLogEntry {
  id: string;
  action: string;
  meta: any;
  created_at: string;
}

const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smm-auto-shill`;
const headers = {
  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'Content-Type': 'application/json',
};

type TabValue = 'campaign' | 'team' | 'cooldown' | 'feed' | 'assignments' | 'auth-log';

export default function AutoShillModal({ open, onOpenChange, profileUsername, profiles = [] }: AutoShillModalProps) {
  const [config, setConfig] = useState<ShillConfig>({ enabled: false, campaign_url: '', ticker: '', discord_app_id: '', discord_public_key: '', discord_channel_id: '', team_accounts: [], retweet_accounts: [], account_hashtags: {}, discord_assignments: {} });
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [authLog, setAuthLog] = useState<AuthLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabValue>('campaign');
  const [shillClicks, setShillClicks] = useState<any[]>([]);

  const xProfiles = profiles
    .flatMap(p => p.connected_platforms
      .filter(cp => cp.platform === 'twitter' && cp.connected)
      .map(cp => cp.display_name)
    );

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [configRes, feedRes, clicksRes, authLogRes] = await Promise.all([
        fetch(`${FUNC_URL}?action=get-config&profile=${profileUsername}`, { headers }).then(r => r.json()),
        fetch(`${FUNC_URL}?action=feed&profile=${profileUsername}`, { headers }).then(r => r.json()),
        supabase.from('shill_clicks').select('*').order('created_at', { ascending: false }).limit(200),
        fetch(`${FUNC_URL}?action=auth-log&profile=${profileUsername}`, { headers }).then(r => r.json()),
      ]);
      if (configRes?.config) {
        setConfig({
          ...configRes.config,
          team_accounts: configRes.config.team_accounts || [],
          retweet_accounts: configRes.config.retweet_accounts || [],
          account_hashtags: configRes.config.account_hashtags || {},
          discord_assignments: configRes.config.discord_assignments || {},
        });
      }
      if (feedRes?.feed) setFeed(feedRes.feed);
      if (clicksRes.data) setShillClicks(clicksRes.data);
      if (authLogRes?.log) setAuthLog(authLogRes.log);
    } catch {}
    if (showLoading) setLoading(false);
  }, [profileUsername]);

  useEffect(() => {
    if (!open) return;
    loadData(true);
  }, [open, profileUsername, loadData]);

  // Auto-poll when on live tabs
  useEffect(() => {
    if (!open || !['feed', 'cooldown', 'assignments', 'auth-log'].includes(tab)) return;
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, [open, tab, profileUsername, loadData]);

  // Realtime: listen for new authorizations
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('shill-auth-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_log',
        filter: 'entity_type=eq.shill-authorization',
      }, () => { loadData(false); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${FUNC_URL}?action=save-config`, {
        method: 'POST', headers,
        body: JSON.stringify({ profile_username: profileUsername, ...config, all_x_accounts: xProfiles }),
      });
      toast.success('Campaign config saved');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  const handleUnassign = async (discordUserId: string) => {
    try {
      await fetch(`${FUNC_URL}?action=admin-unassign`, {
        method: 'POST', headers,
        body: JSON.stringify({ profile_username: profileUsername, discord_user_id: discordUserId }),
      });
      toast.success('User unassigned');
      loadData(false);
    } catch {
      toast.error('Failed to unassign');
    }
  };

  const toggleTeamAccount = (username: string) => {
    setConfig(prev => ({
      ...prev,
      team_accounts: (prev.team_accounts || []).includes(username)
        ? prev.team_accounts.filter(u => u !== username)
        : [...prev.team_accounts, username],
    }));
  };

  const toggleRetweetAccount = (username: string) => {
    setConfig(prev => ({
      ...prev,
      retweet_accounts: (prev.retweet_accounts || []).includes(username)
        ? prev.retweet_accounts.filter(u => u !== username)
        : [...prev.retweet_accounts, username],
    }));
  };

  const receivedCount = feed.filter(e => e.action === 'received').length;
  const repliedCount = feed.filter(e => e.action === 'replied').length;
  const failedCount = feed.filter(e => e.action === 'failed').length;
  const cooldownCount = feed.filter(e => e.action === 'cooldown').length;
  const retweetedCount = feed.filter(e => e.action === 'retweeted').length;

  const COOLDOWN_MS = 5 * 60 * 1000;
  const BAN_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  interface AccountCooldown {
    account: string;
    lastActivityAt: Date;
    remainingMs: number;
    trigger: string;
    action: string;
    isBan: boolean;
  }

  const accountCooldownMap = new Map<string, AccountCooldown>();

  feed.forEach(e => {
    if (e.action === 'reply_banned' && e.meta?.used_account) {
      const account = e.meta.used_account;
      if (!accountCooldownMap.has(account)) {
        const activityAt = new Date(e.created_at);
        const remaining = BAN_MS - (now - activityAt.getTime());
        if (remaining > 0) {
          accountCooldownMap.set(account, { account, lastActivityAt: activityAt, remainingMs: remaining, trigger: '403 Reply ban — X anti-spam', action: 'reply_banned', isBan: true });
        }
      }
    }
  });

  feed.forEach(e => {
    if ((e.action === 'replied' || e.action === 'failed') && e.meta?.used_account) {
      const account = e.meta.used_account;
      if (!accountCooldownMap.has(account)) {
        const activityAt = new Date(e.created_at);
        const remaining = COOLDOWN_MS - (now - activityAt.getTime());
        if (remaining > 0) {
          accountCooldownMap.set(account, { account, lastActivityAt: activityAt, remainingMs: remaining, trigger: e.action === 'failed' ? (e.meta?.error?.substring(0, 80) || 'Post failed') : 'Reply posted', action: e.action, isBan: false });
        }
      }
    }
  });

  const cooldownAccounts = new Set(accountCooldownMap.keys());
  const activeCooldowns = Array.from(accountCooldownMap.values()).sort((a, b) => a.remainingMs - b.remainingMs);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open || tab !== 'cooldown' || activeCooldowns.length === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [open, tab, activeCooldowns.length]);

  // Build assignment info
  const assignments = config.discord_assignments || {};
  const assignmentEntries = Object.entries(assignments);
  const claimedAccounts = new Set(Object.values(assignments));
  const availableAccounts = xProfiles.filter(a => !claimedAccounts.has(a));

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Auto Shill</DialogTitle></DialogHeader>
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const TABS: { value: TabValue; label: string; icon: any; badge?: number }[] = [
    { value: 'campaign', label: 'Campaign', icon: Zap },
    { value: 'team', label: 'Team', icon: Users, badge: (config.team_accounts?.length || 0) + (config.retweet_accounts?.length || 0) },
    { value: 'assignments', label: 'Assignments', icon: KeyRound, badge: assignmentEntries.length },
    { value: 'cooldown', label: 'Cooldown', icon: Clock, badge: activeCooldowns.length || undefined },
    { value: 'feed', label: 'Feed', icon: Radio, badge: feed.length },
    { value: 'auth-log', label: 'Auth Log', icon: History, badge: authLog.length },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Auto Shill — {profileUsername}
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 bg-muted rounded-md p-0.5 shrink-0">
          {TABS.map(t => (
            <button
              key={t.value}
              className={`flex-1 text-xs py-1.5 rounded transition-colors flex items-center justify-center gap-1.5 ${
                tab === t.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTab(t.value)}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 min-w-4">{t.badge}</Badge>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {/* ═══ CAMPAIGN TAB ═══ */}
          {tab === 'campaign' && (
            <ScrollArea className="h-full max-h-[60vh]">
              <div className="space-y-4 pr-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Enable Auto Shill</Label>
                  <Switch checked={config.enabled} onCheckedChange={(v) => setConfig(prev => ({ ...prev, enabled: v }))} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Ticker</Label>
                  <Input value={config.ticker} onChange={(e) => setConfig(prev => ({ ...prev, ticker: e.target.value }))} placeholder="e.g. $whitehouse" className="h-8 text-sm font-mono" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Campaign URL</Label>
                  <Input value={config.campaign_url} onChange={(e) => setConfig(prev => ({ ...prev, campaign_url: e.target.value }))} placeholder="https://x.com/community/post/..." className="h-8 text-sm font-mono" />
                </div>

                {/* Stats summary */}
                {feed.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 rounded-md border border-border p-3 bg-muted/30">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{receivedCount}</p>
                      <p className="text-[10px] text-muted-foreground">Received</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-500">{repliedCount}</p>
                      <p className="text-[10px] text-muted-foreground">Replied</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-500">{retweetedCount}</p>
                      <p className="text-[10px] text-muted-foreground">Retweeted</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-destructive">{failedCount}</p>
                      <p className="text-[10px] text-muted-foreground">Failed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-yellow-500">{cooldownCount}</p>
                      <p className="text-[10px] text-muted-foreground">Cooldown</p>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Discord Channel ID</Label>
                  <Input value={config.discord_channel_id} onChange={(e) => setConfig(prev => ({ ...prev, discord_channel_id: e.target.value }))} placeholder="e.g. 1234567890123456789" className="h-8 text-sm font-mono" />
                  <p className="text-[10px] text-muted-foreground">Paste X links in this channel — auto-forwarded every 60s.</p>
                </div>

                <details className="rounded-md border border-border p-3 bg-muted/30">
                  <summary className="text-xs font-semibold text-primary cursor-pointer">Discord Bot Settings (Advanced)</summary>
                  <div className="space-y-2 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Application ID</Label>
                      <Input value={config.discord_app_id} onChange={(e) => setConfig(prev => ({ ...prev, discord_app_id: e.target.value }))} className="h-7 text-xs font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Public Key</Label>
                      <Input value={config.discord_public_key} onChange={(e) => setConfig(prev => ({ ...prev, discord_public_key: e.target.value }))} className="h-7 text-xs font-mono" />
                    </div>
                  </div>
                </details>
              </div>
            </ScrollArea>
          )}

          {/* ═══ TEAM TAB ═══ */}
          {tab === 'team' && (
            <ScrollArea className="h-full max-h-[60vh]">
              <div className="space-y-3 pr-2">
                <div className="rounded-md border border-border p-3 bg-muted/30 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-semibold text-foreground">Team Accounts</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Assign roles: <strong>Reply</strong> and/or <strong>Retweet</strong>. Workers must <code className="bg-muted px-1 rounded">/authorize</code> in Discord to claim an account.
                  </p>
                </div>

                {xProfiles.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <Users className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">No X accounts connected</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="flex-1">Account</span>
                      <span className="w-24 text-center"><Hash className="h-3 w-3 inline" /> Hashtag</span>
                      <span className="w-16 text-center"><MessageSquare className="h-3 w-3 inline" /> Reply</span>
                      <span className="w-16 text-center"><Repeat2 className="h-3 w-3 inline" /> Retweet</span>
                      <span className="w-20 text-center">Assigned To</span>
                      <span className="w-14 text-center">Status</span>
                    </div>

                    {xProfiles.map(username => {
                      const isReplySelected = (config.team_accounts || []).includes(username);
                      const isRetweetSelected = (config.retweet_accounts || []).includes(username);
                      const isPrimary = username === profileUsername;
                      const isInCooldown = cooldownAccounts.has(username);
                      const isActive = isReplySelected || isRetweetSelected;
                      const assignedDiscordId = Object.entries(assignments).find(([, acc]) => acc === username)?.[0];

                      return (
                        <div
                          key={username}
                          className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
                            isActive ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-mono font-medium text-foreground">@{username}</span>
                              {isPrimary && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">PRIMARY</span>}
                            </div>
                          </div>

                          <div className="w-24">
                            <Input
                              value={config.account_hashtags?.[username] || ''}
                              onChange={(e) => {
                                const val = e.target.value.replace(/^#/, '').replace(/\s/g, '');
                                setConfig(prev => ({ ...prev, account_hashtags: { ...prev.account_hashtags, [username]: val } }));
                              }}
                              placeholder="#tag"
                              className="h-6 text-[10px] font-mono px-1.5"
                            />
                          </div>

                          <div className="w-14 flex justify-center">
                            <Checkbox checked={isReplySelected} onCheckedChange={() => toggleTeamAccount(username)} />
                          </div>

                          <div className="w-14 flex justify-center">
                            <Checkbox checked={isRetweetSelected} onCheckedChange={() => toggleRetweetAccount(username)} />
                          </div>

                          <div className="w-20 text-center">
                            {assignedDiscordId ? (
                              <span className="text-[10px] font-mono text-green-500">{assignedDiscordId.substring(0, 8)}…</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </div>

                          <div className="w-14 flex justify-center">
                            {isInCooldown ? (
                              <span className="flex items-center gap-1 text-[10px] text-yellow-500"><Clock className="h-3 w-3" /> CD</span>
                            ) : isActive ? (
                              <span className="flex items-center gap-1 text-[10px] text-green-500"><CheckCircle2 className="h-3 w-3" /> Ready</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* ═══ ASSIGNMENTS TAB ═══ */}
          {tab === 'assignments' && (
            <ScrollArea className="h-full max-h-[60vh]">
              <div className="space-y-4 pr-2">
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
                        </div>
                        <span className="w-32 text-sm font-mono text-primary">@{xAccount}</span>
                        <span className="w-24 text-xs font-mono text-muted-foreground">
                          {config.account_hashtags?.[xAccount] ? `#${config.account_hashtags[xAccount]}` : '—'}
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
            </ScrollArea>
          )}

          {/* ═══ AUTH LOG TAB ═══ */}
          {tab === 'auth-log' && (
            <ScrollArea className="h-full max-h-[60vh]">
              <div className="space-y-3 pr-2">
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
                )}
              </div>
            </ScrollArea>
          )}

          {/* ═══ COOLDOWN TAB ═══ */}
          {tab === 'cooldown' && (
            <ScrollArea className="h-full max-h-[60vh]">
              <div className="space-y-3 pr-2">
                {activeCooldowns.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                    <p className="text-sm font-medium text-foreground">All Accounts Ready</p>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const bannedCount = activeCooldowns.filter(cd => cd.isBan).length;
                      const cdCount = activeCooldowns.filter(cd => !cd.isBan).length;
                      return (
                        <div className="rounded-md border border-border p-3 bg-destructive/5 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                            <p className="text-xs font-semibold text-foreground">
                              {bannedCount > 0 && `${bannedCount} Banned (24h)`}
                              {bannedCount > 0 && cdCount > 0 && ' · '}
                              {cdCount > 0 && `${cdCount} in Cooldown (5m)`}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="space-y-1.5">
                      {activeCooldowns.map(cd => {
                        const totalMs = cd.isBan ? BAN_MS : COOLDOWN_MS;
                        const liveRemaining = Math.max(0, cd.remainingMs - (tick * 1000));
                        const hours = Math.floor(liveRemaining / 3600000);
                        const mins = Math.floor((liveRemaining % 3600000) / 60000);
                        const secs = Math.floor((liveRemaining % 60000) / 1000);
                        const progressPct = Math.max(0, Math.min(100, ((totalMs - liveRemaining) / totalMs) * 100));
                        const isReady = liveRemaining <= 0;

                        return (
                          <div key={cd.account} className={`rounded-md border p-3 space-y-2 ${isReady ? 'border-green-500/30 bg-green-500/5' : cd.isBan ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/30'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono font-medium text-foreground">@{cd.account}</span>
                                {cd.isBan && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">BANNED 24H</span>}
                              </div>
                              {isReady ? (
                                <span className="flex items-center gap-1 text-xs text-green-500 font-semibold"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>
                              ) : (
                                <span className="text-sm font-mono font-bold text-foreground tabular-nums">
                                  {cd.isBan ? `${hours}h ${mins}m` : `${mins}:${secs.toString().padStart(2, '0')}`}
                                </span>
                              )}
                            </div>
                            {!isReady && (
                              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${cd.isBan ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${progressPct}%` }} />
                              </div>
                            )}
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>Triggered: {cd.trigger}</span>
                              <span>{format(cd.lastActivityAt, cd.isBan ? 'MMM d, h:mm a' : 'h:mm:ss a')}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}

          {/* ═══ FEED TAB ═══ */}
          {tab === 'feed' && (
            <ScrollArea className="h-full max-h-[60vh]">
              {feed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No incoming tweets yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {feed.map(entry => {
                    const tweetUrl = entry.meta?.tweet_url || entry.meta?.url || '';
                    const replyText = entry.meta?.reply_text || '';
                    const usedAccount = entry.meta?.used_account || entry.meta?.profile || '';
                    const icon = entry.action === 'replied' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      : entry.action === 'retweeted' ? <Repeat2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      : entry.action === 'received' ? <ArrowDownCircle className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      : entry.action === 'cooldown' ? <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                      : entry.action === 'skipped' ? <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;

                    return (
                      <div key={entry.id} className="flex items-start gap-2 p-2 rounded border border-border bg-muted/30 text-xs">
                        <div className="mt-0.5">{icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground uppercase">{entry.action}</span>
                            {usedAccount && <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary">@{usedAccount}</span>}
                            <span className="text-[10px] text-muted-foreground">{format(new Date(entry.created_at), 'MMM d, h:mm a')}</span>
                          </div>
                          {tweetUrl && (
                            <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block mt-0.5 text-[11px]">
                              {tweetUrl} <ExternalLink className="inline h-2.5 w-2.5" />
                            </a>
                          )}
                          {replyText && <p className="text-muted-foreground mt-0.5 line-clamp-2">{replyText}</p>}
                          {entry.action === 'retweeted' && entry.meta?.retweet_accounts && (
                            <p className="text-muted-foreground mt-0.5">Retweeted by: {(entry.meta.retweet_accounts as string[]).map(a => `@${a}`).join(', ')}</p>
                          )}
                          {entry.action === 'failed' && entry.meta?.error && (
                            <p className="text-destructive mt-0.5">{entry.meta.error.substring(0, 120)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="shrink-0">
          {(tab === 'campaign' || tab === 'team') && (
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? 'Saving...' : 'Save Campaign'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}