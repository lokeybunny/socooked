import { useState, useEffect, useMemo } from 'react';
import type { SMMProfile } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ExternalLink, AlertTriangle, CheckCircle, Bell, Info, Search, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { toast } from 'sonner';
import { PLATFORM_META } from '@/lib/smm/context';

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-500/10 text-pink-500', facebook: 'bg-blue-500/10 text-blue-500',
  tiktok: 'bg-foreground/10 text-foreground', linkedin: 'bg-sky-600/10 text-sky-600',
  youtube: 'bg-red-500/10 text-red-500', twitter: 'bg-sky-400/10 text-sky-400',
  pinterest: 'bg-red-600/10 text-red-600',
};

interface ConnectedAccount {
  platform: string;
  display_name: string;
  connected: boolean;
  reauth_required?: boolean;
}

export default function SMMProfiles({ profiles, onRefresh }: { profiles: SMMProfile[]; onRefresh: () => void }) {
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [selectedAccount, setSelectedAccount] = useState<(ConnectedAccount & { profileUsername: string }) | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    smmApi.getMe().then(setAccountInfo).catch(() => {});
  }, []);

  // Build grouped data: profile -> connected accounts
  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    return profiles
      .map(p => {
        const accounts = p.connected_platforms
          .filter(cp => cp.connected)
          .filter(cp =>
            !q ||
            cp.display_name.toLowerCase().includes(q) ||
            cp.platform.toLowerCase().includes(q) ||
            p.username.toLowerCase().includes(q)
          )
          .map(cp => ({ ...cp, profileUsername: p.username }));
        return { profile: p, accounts };
      })
      .filter(g => g.accounts.length > 0);
  }, [profiles, search]);

  const totalAccounts = grouped.reduce((sum, g) => sum + g.accounts.length, 0);
  const allAccountsCount = profiles.reduce((sum, p) => sum + p.connected_platforms.filter(cp => cp.connected).length, 0);

  const handleWebhookSave = async () => {
    if (!webhookUrl.trim()) return;
    setWebhookSaving(true);
    try {
      await smmApi.configureNotifications({ webhook_url: webhookUrl, events: ['upload_completed', 'upload_failed', 'post_published'] });
      toast.success('Webhook configured');
    } catch {
      toast.error('Failed to configure webhook');
    }
    setWebhookSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Account Info Card */}
      {accountInfo && (
        <div className="glass-card p-4 flex items-center gap-4">
          <Info className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">API Account</p>
            <p className="text-xs text-muted-foreground">
              Plan: {accountInfo.plan || 'default'} · Email: {accountInfo.email || '—'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Connected Accounts</h3>
        <p className="text-xs text-muted-foreground">
          {search ? `${totalAccounts} of ${allAccountsCount}` : `${allAccountsCount}`} account{allAccountsCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search — always visible */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by handle, platform, or profile..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grouped Accounts */}
      {grouped.length > 0 ? (
        <div className="space-y-5">
          {grouped.map(({ profile, accounts }) => (
            <div key={profile.id} className="space-y-2.5">
              {/* Profile group header */}
              <div className="flex items-center gap-2 px-1">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {profile.username}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  · {accounts.length} account{accounts.length !== 1 ? 's' : ''}
                </span>
                <div className="flex-1 border-t border-border/40 ml-2" />
              </div>

              {/* Account cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {accounts.map(account => {
                  const meta = PLATFORM_META[account.platform];
                  return (
                    <button
                      key={`${account.profileUsername}-${account.platform}`}
                      onClick={() => setSelectedAccount(account)}
                      className="glass-card p-4 text-left hover:ring-1 hover:ring-primary/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        {meta && <meta.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">@{account.display_name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{account.platform}</p>
                        </div>
                        <div className="shrink-0">
                          {account.reauth_required ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {search ? 'No accounts match your search.' : 'No accounts connected yet. Connect your social accounts through the Upload-Post dashboard.'}
        </div>
      )}

      {/* Webhook Configuration */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Bell className="h-4 w-4" /> Webhook Notifications</h3>
        <p className="text-xs text-muted-foreground">Receive real-time notifications when uploads complete, fail, or posts are published.</p>
        <div className="flex gap-2">
          <Input placeholder="https://your-webhook-url.com/callback" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} className="flex-1" />
          <Button onClick={handleWebhookSave} disabled={webhookSaving || !webhookUrl.trim()} size="sm">
            {webhookSaving ? 'Saving...' : 'Configure'}
          </Button>
        </div>
      </div>

      {/* Account Detail Sheet */}
      <Sheet open={!!selectedAccount} onOpenChange={v => !v && setSelectedAccount(null)}>
        <SheetContent className="overflow-y-auto">
          {selectedAccount && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {PLATFORM_META[selectedAccount.platform] && (
                    <span className={`p-1.5 rounded-lg ${PLATFORM_COLORS[selectedAccount.platform] || 'bg-muted'}`}>
                      {(() => { const M = PLATFORM_META[selectedAccount.platform]; return M ? <M.icon className="h-4 w-4" /> : null; })()}
                    </span>
                  )}
                  @{selectedAccount.display_name}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Profile</span>
                    <span className="text-sm font-medium">{selectedAccount.profileUsername}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Platform</span>
                    <span className="text-sm font-medium capitalize">{selectedAccount.platform}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    {selectedAccount.reauth_required ? (
                      <span className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Reauth Required</span>
                    ) : (
                      <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Connected</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
