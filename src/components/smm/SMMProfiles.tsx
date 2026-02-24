import { useState, useEffect, useMemo } from 'react';
import type { SMMProfile } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ExternalLink, AlertTriangle, CheckCircle, Bell, Info, Search, ChevronLeft, ChevronRight } from 'lucide-react';
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

const PAGE_SIZE = 10;

export default function SMMProfiles({ profiles, onRefresh }: { profiles: SMMProfile[]; onRefresh: () => void }) {
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [selectedAccount, setSelectedAccount] = useState<ConnectedAccount | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    smmApi.getMe().then(setAccountInfo).catch(() => {});
  }, []);

  // Flatten all connected accounts across profiles
  const allAccounts: (ConnectedAccount & { profileUsername: string })[] = [];
  profiles.forEach(p => {
    p.connected_platforms.filter(cp => cp.connected).forEach(cp => {
      allAccounts.push({ ...cp, profileUsername: p.username });
    });
  });

  // Search + paginate
  const filtered = useMemo(() => {
    if (!search.trim()) return allAccounts;
    const q = search.toLowerCase();
    return allAccounts.filter(a =>
      a.display_name.toLowerCase().includes(q) ||
      a.platform.toLowerCase().includes(q) ||
      a.profileUsername.toLowerCase().includes(q)
    );
  }, [allAccounts, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showPagination = filtered.length > PAGE_SIZE;

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search]);

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
        <p className="text-xs text-muted-foreground">{filtered.length} of {allAccounts.length} accounts</p>
      </div>

      {/* Search */}
      {allAccounts.length > PAGE_SIZE && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, platform, or profile..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Connected Accounts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {paginated.map(account => {
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
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
            {search ? 'No accounts match your search.' : 'No accounts connected yet. Connect your social accounts through the Upload-Post dashboard.'}
          </div>
        )}
      </div>

      {/* Pagination */}
      {showPagination && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)} className="gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            Page {safePage} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} className="gap-1">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
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
