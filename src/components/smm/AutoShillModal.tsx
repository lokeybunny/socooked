import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, MessageSquare, Zap, ExternalLink, ArrowDownCircle, Users, Clock, ShieldAlert, Repeat2, Hash } from 'lucide-react';
import { format } from 'date-fns';
import type { SMMProfile } from '@/lib/smm/types';

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

const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smm-auto-shill`;
const headers = {
  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'Content-Type': 'application/json',
};

export default function AutoShillModal({ open, onOpenChange, profileUsername, profiles = [] }: AutoShillModalProps) {
  const [config, setConfig] = useState<ShillConfig>({ enabled: false, campaign_url: '', ticker: '', discord_app_id: '', discord_public_key: '', discord_channel_id: '', team_accounts: [], retweet_accounts: [], account_hashtags: {}, discord_assignments: {} });
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'campaign' | 'team' | 'cooldown' | 'feed' | 'activity'>('campaign');
  const [shillClicks, setShillClicks] = useState<any[]>([]);

  // Derive X-connected profile usernames from profiles prop
  const xProfiles = profiles
    .filter(p => p.connected_platforms.some(cp => cp.platform === 'twitter' && cp.connected))
    .map(p => p.username);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { default: supabaseClient } = await import('@/integrations/supabase/client').then(m => ({ default: m.supabase }));
      const [configRes, feedRes, clicksRes] = await Promise.all([
        fetch(`${FUNC_URL}?action=get-config&profile=${profileUsername}`, { headers }).then(r => r.json()),
        fetch(`${FUNC_URL}?action=feed&profile=${profileUsername}`, { headers }).then(r => r.json()),
        supabaseClient.from('shill_clicks').select('*').order('created_at', { ascending: false }).limit(200),
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
    } catch {}
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    loadData(true);
  }, [open, profileUsername]);

  // Auto-poll feed every 5s when on feed or cooldown tab
  useEffect(() => {
    if (!open || (tab !== 'feed' && tab !== 'cooldown')) return;
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, [open, tab, profileUsername]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${FUNC_URL}?action=save-config`, {
        method: 'POST', headers,
        body: JSON.stringify({ profile_username: profileUsername, ...config }),
      });
      toast.success('Campaign config saved');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  const toggleTeamAccount = (username: string) => {
    setConfig(prev => {
      const current = prev.team_accounts || [];
      const isSelected = current.includes(username);
      return {
        ...prev,
        team_accounts: isSelected
          ? current.filter(u => u !== username)
          : [...current, username],
      };
    });
  };

  const toggleRetweetAccount = (username: string) => {
    setConfig(prev => {
      const current = prev.retweet_accounts || [];
      const isSelected = current.includes(username);
      return {
        ...prev,
        retweet_accounts: isSelected
          ? current.filter(u => u !== username)
          : [...current, username],
      };
    });
  };

  const receivedCount = feed.filter(e => e.action === 'received').length;
  const repliedCount = feed.filter(e => e.action === 'replied').length;
  const failedCount = feed.filter(e => e.action === 'failed').length;
  const cooldownCount = feed.filter(e => e.action === 'cooldown').length;
  const retweetedCount = feed.filter(e => e.action === 'retweeted').length;

  const COOLDOWN_MS = 5 * 60 * 1000;
  const BAN_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Build per-account cooldown info from recent feed entries
  interface AccountCooldown {
    account: string;
    lastActivityAt: Date;
    remainingMs: number;
    trigger: string;
    action: string;
    isBan: boolean;
  }

  const accountCooldownMap = new Map<string, AccountCooldown>();

  // Check for 24h reply bans first (higher priority)
  feed.forEach(e => {
    if (e.action === 'reply_banned' && e.meta?.used_account) {
      const account = e.meta.used_account;
      if (!accountCooldownMap.has(account)) {
        const activityAt = new Date(e.created_at);
        const remaining = BAN_MS - (now - activityAt.getTime());
        if (remaining > 0) {
          accountCooldownMap.set(account, {
            account,
            lastActivityAt: activityAt,
            remainingMs: remaining,
            trigger: '403 Reply ban — X anti-spam',
            action: 'reply_banned',
            isBan: true,
          });
        }
      }
    }
  });

  // Then check standard 5-min cooldowns
  feed.forEach(e => {
    if ((e.action === 'replied' || e.action === 'failed') && e.meta?.used_account) {
      const account = e.meta.used_account;
      if (!accountCooldownMap.has(account)) {
        const activityAt = new Date(e.created_at);
        const remaining = COOLDOWN_MS - (now - activityAt.getTime());
        if (remaining > 0) {
          accountCooldownMap.set(account, {
            account,
            lastActivityAt: activityAt,
            remainingMs: remaining,
            trigger: e.action === 'failed' ? (e.meta?.error?.substring(0, 80) || 'Post failed') : 'Reply posted',
            action: e.action,
            isBan: false,
          });
        }
      }
    }
  });

  const cooldownAccounts = new Set(accountCooldownMap.keys());
  const activeCooldowns = Array.from(accountCooldownMap.values()).sort((a, b) => a.remainingMs - b.remainingMs);

  // Live countdown tick
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open || tab !== 'cooldown' || activeCooldowns.length === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [open, tab, activeCooldowns.length]);

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Auto Shill</DialogTitle></DialogHeader>
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Auto Shill
          </DialogTitle>
        </DialogHeader>

        {/* Tab toggle */}
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button
            className={`flex-1 text-xs py-1.5 rounded transition-colors ${tab === 'campaign' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setTab('campaign')}
          >
            Campaign
          </button>
          <button
            className={`flex-1 text-xs py-1.5 rounded transition-colors flex items-center justify-center gap-1 ${tab === 'team' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setTab('team')}
          >
            <Users className="h-3 w-3" />
            Team ({(config.team_accounts?.length || 0) + (config.retweet_accounts?.length || 0)})
          </button>
          <button
            className={`flex-1 text-xs py-1.5 rounded transition-colors flex items-center justify-center gap-1 ${tab === 'cooldown' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setTab('cooldown')}
          >
            <Clock className="h-3 w-3" />
            Cooldown{activeCooldowns.length > 0 ? ` (${activeCooldowns.length})` : ''}
          </button>
          <button
            className={`flex-1 text-xs py-1.5 rounded transition-colors ${tab === 'feed' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setTab('feed')}
          >
            Feed ({feed.length})
          </button>
          <button
            className={`flex-1 text-xs py-1.5 rounded transition-colors flex items-center justify-center gap-1 ${tab === 'activity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setTab('activity')}
          >
            <Users className="h-3 w-3" />
            Activity ({shillClicks.length})
          </button>
        </div>

        {tab === 'campaign' ? (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4 pr-2">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Enable Auto Shill</Label>
                <Switch checked={config.enabled} onCheckedChange={(v) => setConfig(prev => ({ ...prev, enabled: v }))} />
              </div>

              {/* Ticker */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Ticker</Label>
                <Input
                  value={config.ticker}
                  onChange={(e) => setConfig(prev => ({ ...prev, ticker: e.target.value }))}
                  placeholder="e.g. $whitehouse"
                  className="h-8 text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  The ticker symbol to include in every auto-reply (e.g. $whitehouse)
                </p>
              </div>

              {/* Campaign URL */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Campaign URL</Label>
                <Input
                  value={config.campaign_url}
                  onChange={(e) => setConfig(prev => ({ ...prev, campaign_url: e.target.value }))}
                  placeholder="https://x.com/community/post/..."
                  className="h-8 text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  The X post or link you want to advertise. This gets appended to every AI-generated reply.
                </p>
              </div>

              {/* Team accounts summary */}
              {((config.team_accounts?.length || 0) > 0 || (config.retweet_accounts?.length || 0) > 0) && (
                <div className="rounded-md border border-border p-3 bg-muted/30 space-y-2">
                  {(config.team_accounts?.length || 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      <p className="text-[10px] text-muted-foreground">
                        <strong>Reply:</strong> {config.team_accounts.map(a => `@${a}`).join(', ')}
                      </p>
                    </div>
                  )}
                  {(config.retweet_accounts?.length || 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Repeat2 className="h-3.5 w-3.5 text-green-500" />
                      <p className="text-[10px] text-muted-foreground">
                        <strong>Retweet:</strong> {config.retweet_accounts.map(a => `@${a}`).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

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

              {/* How it works */}
              <div className="rounded-md border border-border p-3 bg-muted/30 space-y-1">
                <p className="text-xs font-semibold text-foreground">How it works</p>
                <ul className="text-[10px] text-muted-foreground space-y-0.5 list-disc pl-3">
                  <li>Your Discord bot POSTs X/Twitter URLs to the webhook</li>
                  <li>AI reads the tweet and generates a <strong>contextual reply</strong> with your ticker signature</li>
                  <li>Selected <strong>retweet accounts</strong> will also retweet the original post</li>
                  <li>If an account is in cooldown, the next team member posts instead</li>
                  <li>Each account gets its own 5-min cooldown to avoid anti-spam flags</li>
                </ul>
              </div>

              {/* Discord Channel Watcher */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Discord Channel ID</Label>
                <Input
                  value={config.discord_channel_id}
                  onChange={(e) => setConfig(prev => ({ ...prev, discord_channel_id: e.target.value }))}
                  placeholder="e.g. 1234567890123456789"
                  className="h-8 text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Paste X/Twitter links in this Discord channel — they'll be auto-forwarded to Auto Shill every 60s.
                  Right-click the channel → Copy Channel ID (enable Developer Mode in Discord settings).
                </p>
              </div>

              {/* Discord config (collapsed) */}
              <details className="rounded-md border border-border p-3 bg-muted/30">
                <summary className="text-xs font-semibold text-primary cursor-pointer">Discord Bot Settings (Advanced)</summary>
                <div className="space-y-2 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Application ID</Label>
                    <Input value={config.discord_app_id} onChange={(e) => setConfig(prev => ({ ...prev, discord_app_id: e.target.value }))} placeholder="e.g. 1234567890123456789" className="h-7 text-xs font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Public Key</Label>
                    <Input value={config.discord_public_key} onChange={(e) => setConfig(prev => ({ ...prev, discord_public_key: e.target.value }))} placeholder="e.g. a1b2c3d4e5f6..." className="h-7 text-xs font-mono" />
                  </div>
                </div>
              </details>
            </div>
          </ScrollArea>
        ) : tab === 'team' ? (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3 pr-2">
              {/* Info banner */}
              <div className="rounded-md border border-border p-3 bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Team Accounts</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Assign each X account a role: <strong>Reply</strong> (AI contextual reply + signature) and/or <strong>Retweet</strong> (retweet the original post).
                  An account can do both. Reply accounts rotate with cooldowns; retweet accounts all fire simultaneously.
                </p>
              </div>

              {/* Account list */}
              {xProfiles.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">No X accounts connected</p>
                  <p className="text-[10px] text-muted-foreground">Connect X accounts in the Accounts tab to add them to the team.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span className="flex-1">Account</span>
                    <span className="w-16 text-center flex items-center justify-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Reply
                    </span>
                    <span className="w-16 text-center flex items-center justify-center gap-1">
                      <Repeat2 className="h-3 w-3" /> Retweet
                    </span>
                    <span className="w-16 text-center">Status</span>
                  </div>

                  {xProfiles.map(username => {
                    const isReplySelected = (config.team_accounts || []).includes(username);
                    const isRetweetSelected = (config.retweet_accounts || []).includes(username);
                    const isPrimary = username === profileUsername;
                    const isInCooldown = cooldownAccounts.has(username);
                    const isActive = isReplySelected || isRetweetSelected;

                    return (
                      <div
                        key={username}
                        className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
                          isActive
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border bg-muted/20'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-mono font-medium text-foreground">@{username}</span>
                            {isPrimary && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">PRIMARY</span>
                            )}
                          </div>
                        </div>

                        {/* Hashtag input */}
                        <div className="w-24">
                          <Input
                            value={config.account_hashtags?.[username] || ''}
                            onChange={(e) => {
                              const val = e.target.value.replace(/^#/, '').replace(/\s/g, '');
                              setConfig(prev => ({
                                ...prev,
                                account_hashtags: { ...prev.account_hashtags, [username]: val },
                              }));
                            }}
                            placeholder="#tag"
                            className="h-6 text-[10px] font-mono px-1.5"
                          />
                        </div>

                        {/* Reply checkbox */}
                        <div className="w-14 flex justify-center">
                          <Checkbox
                            checked={isReplySelected}
                            onCheckedChange={() => toggleTeamAccount(username)}
                          />
                        </div>

                        {/* Retweet checkbox */}
                        <div className="w-14 flex justify-center">
                          <Checkbox
                            checked={isRetweetSelected}
                            onCheckedChange={() => toggleRetweetAccount(username)}
                          />
                        </div>

                        {/* Status */}
                        <div className="w-14 flex justify-center">
                          {isInCooldown ? (
                            <span className="flex items-center gap-1 text-[10px] text-yellow-500">
                              <Clock className="h-3 w-3" />
                              CD
                            </span>
                          ) : isActive ? (
                            <span className="flex items-center gap-1 text-[10px] text-green-500">
                              <CheckCircle2 className="h-3 w-3" />
                              Ready
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected summary */}
              {((config.team_accounts?.length || 0) > 0 || (config.retweet_accounts?.length || 0) > 0) && (
                <div className="rounded-md border border-border p-3 bg-muted/30 space-y-1">
                  {(config.team_accounts?.length || 0) > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      <MessageSquare className="inline h-3 w-3 mr-1" />
                      <strong>{config.team_accounts.length}</strong> reply account{config.team_accounts.length > 1 ? 's' : ''} — rotating with 5-min cooldowns.
                      {config.team_accounts.length >= 3 && ' Continuous coverage enabled.'}
                    </p>
                  )}
                  {(config.retweet_accounts?.length || 0) > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      <Repeat2 className="inline h-3 w-3 mr-1" />
                      <strong>{config.retweet_accounts.length}</strong> retweet account{config.retweet_accounts.length > 1 ? 's' : ''} — all retweet simultaneously.
                    </p>
                  )}
                </div>
              )}

              {/* Discord → X Assignments */}
              {Object.keys(config.discord_assignments || {}).length > 0 && (
                <div className="rounded-md border border-border p-3 bg-muted/30 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-semibold text-foreground">Discord → X Assignments</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Workers use <code className="bg-muted px-1 py-0.5 rounded text-[9px]">/authorize account:username</code> in Discord to link themselves.
                  </p>
                  <div className="space-y-1">
                    {Object.entries(config.discord_assignments).map(([discordId, xAccount]) => (
                      <div key={discordId} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-background border border-border">
                        <span className="text-muted-foreground font-mono">{discordId.substring(0, 8)}…</span>
                        <span className="text-foreground font-medium">→ @{xAccount}</span>
                        {config.account_hashtags?.[xAccount] && (
                          <span className="text-primary font-mono">#{config.account_hashtags[xAccount]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : tab === 'cooldown' ? (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3 pr-2">
              {activeCooldowns.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                  <p className="text-sm font-medium text-foreground">All Accounts Ready</p>
                  <p className="text-[10px] text-muted-foreground">No accounts are currently in cooldown. All team members are available for the next shill.</p>
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
                        <p className="text-[10px] text-muted-foreground">
                          {bannedCount > 0
                            ? 'Accounts with 403 reply errors are banned from replying for 24 hours. They can still retweet.'
                            : 'Accounts enter a 5-minute cooldown after each reply to prevent X anti-spam flags.'}
                        </p>
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
                              {cd.isBan ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">BANNED 24H</span>
                              ) : cd.action === 'failed' ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">FLAGGED</span>
                              ) : null}
                            </div>
                            {isReady ? (
                              <span className="flex items-center gap-1 text-xs text-green-500 font-semibold">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Ready
                              </span>
                            ) : (
                              <span className="text-sm font-mono font-bold text-foreground tabular-nums">
                                {cd.isBan ? `${hours}h ${mins}m` : `${mins}:${secs.toString().padStart(2, '0')}`}
                              </span>
                            )}
                          </div>

                          {/* Progress bar */}
                          {!isReady && (
                            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-1000 ${cd.isBan ? 'bg-destructive' : 'bg-primary'}`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          )}

                          {/* Trigger reason */}
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
        ) : (
          <ScrollArea className="h-[350px]">
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
                          {usedAccount && (
                            <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary">@{usedAccount}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{format(new Date(entry.created_at), 'MMM d, h:mm a')}</span>
                        </div>
                        {tweetUrl && (
                          <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block mt-0.5 text-[11px]">
                            {tweetUrl} <ExternalLink className="inline h-2.5 w-2.5" />
                          </a>
                        )}
                        {replyText && (
                          <p className="text-muted-foreground mt-0.5 line-clamp-2">{replyText}</p>
                        )}
                        {entry.action === 'retweeted' && entry.meta?.retweet_accounts && (
                          <p className="text-muted-foreground mt-0.5">
                            Retweeted by: {(entry.meta.retweet_accounts as string[]).map(a => `@${a}`).join(', ')}
                          </p>
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

        {tab === 'activity' && (
          <ScrollArea className="max-h-[400px] pr-2">
            {shillClicks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No shill activity yet. Clicks will appear here when team members tap "Get Shill Copy" in Discord.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">{shillClicks.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Clicks</p>
                  </div>
                  <div className="rounded-md border border-border p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {new Set(shillClicks.map((c: any) => c.discord_user_id)).size}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Unique Shillers</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Leaderboard</p>
                  {(() => {
                    const counts: Record<string, { username: string; count: number }> = {};
                    shillClicks.forEach((c: any) => {
                      if (!counts[c.discord_user_id]) counts[c.discord_user_id] = { username: c.discord_username, count: 0 };
                      counts[c.discord_user_id].count++;
                    });
                    return Object.values(counts)
                      .sort((a, b) => b.count - a.count)
                      .map((entry, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded border border-border bg-muted/30 text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground w-5">{i + 1}.</span>
                            <span className="font-medium text-foreground">{entry.username}</span>
                          </div>
                          <span className="font-mono text-primary">{entry.count} clicks</span>
                        </div>
                      ));
                  })()}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Recent Activity</p>
                  <div className="space-y-1">
                    {shillClicks.slice(0, 50).map((click: any) => (
                      <div key={click.id} className="flex items-start gap-2 p-2 rounded border border-border bg-muted/30 text-xs">
                        <Users className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{click.discord_username}</span>
                            <span className="text-[10px] text-muted-foreground">{format(new Date(click.created_at), 'MMM d, h:mm a')}</span>
                          </div>
                          {click.tweet_url && (
                            <a href={click.tweet_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block mt-0.5 text-[11px]">
                              {click.tweet_url} <ExternalLink className="inline h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        )}
        <DialogFooter>
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
