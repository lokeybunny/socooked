import { useState, useEffect } from 'react';
import type { SMMProfile } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, ExternalLink, AlertTriangle, CheckCircle, User, Bell, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-500/10 text-pink-500', facebook: 'bg-blue-500/10 text-blue-500',
  tiktok: 'bg-foreground/10 text-foreground', linkedin: 'bg-sky-600/10 text-sky-600',
  youtube: 'bg-red-500/10 text-red-500', twitter: 'bg-sky-400/10 text-sky-400',
  pinterest: 'bg-red-600/10 text-red-600',
};

export default function SMMProfiles({ profiles, onRefresh }: { profiles: SMMProfile[]; onRefresh: () => void }) {
  const [newUsername, setNewUsername] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerProfile, setDrawerProfile] = useState<SMMProfile | null>(null);
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSaving, setWebhookSaving] = useState(false);

  // Load account info
  useEffect(() => {
    smmApi.getMe().then(setAccountInfo).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!newUsername.trim()) return;
    await smmApi.createProfile(newUsername.trim());
    toast.success('Profile created');
    setNewUsername('');
    setDialogOpen(false);
    onRefresh();
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete profile "${username}"? This will disconnect all accounts.`)) return;
    try {
      await smmApi.deleteProfile(username);
      toast.success('Profile deleted');
      setDrawerProfile(null);
      onRefresh();
    } catch {
      toast.error('Failed to delete profile');
    }
  };

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
              Plan: {accountInfo.plan || 'default'} · Profiles: {profiles.length}/{accountInfo.limit || '∞'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Client Profiles</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Profile</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Profile</DialogTitle>
              <DialogDescription>Enter a username for the new social media profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input placeholder="Username (e.g. acme_brand)" value={newUsername} onChange={e => setNewUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              <Button onClick={handleCreate} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left py-2 font-medium">Username</th>
              <th className="text-left py-2 font-medium">Connected Platforms</th>
              <th className="text-left py-2 font-medium">Warnings</th>
              <th className="text-left py-2 font-medium">Last Activity</th>
              <th className="text-right py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerProfile(p)}>
                <td className="py-3 font-medium flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />{p.username}</td>
                <td className="py-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {p.connected_platforms.filter(cp => cp.connected).map(cp => (
                      <span key={cp.platform} className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_COLORS[cp.platform] || 'bg-muted text-muted-foreground'}`}>
                        {cp.platform}
                      </span>
                    ))}
                    {p.connected_platforms.filter(cp => cp.connected).length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                  </div>
                </td>
                <td className="py-3">
                  {p.connected_platforms.some(cp => cp.reauth_required) && (
                    <span className="flex items-center gap-1 text-xs text-amber-500"><AlertTriangle className="h-3 w-3" /> Reauth needed</span>
                  )}
                </td>
                <td className="py-3 text-muted-foreground text-xs">{format(new Date(p.last_activity), 'MMM d, h:mm a')}</td>
                <td className="py-3 text-right"><Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setDrawerProfile(p); }}>Details</Button></td>
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No profiles yet. Create one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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

      {/* Profile Drawer */}
      <Sheet open={!!drawerProfile} onOpenChange={v => !v && setDrawerProfile(null)}>
        <SheetContent className="overflow-y-auto">
          {drawerProfile && (
            <>
              <SheetHeader><SheetTitle>{drawerProfile.username}</SheetTitle></SheetHeader>
              <div className="space-y-6 mt-4">
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connected Accounts</h4>
                  {drawerProfile.connected_platforms.length > 0 ? drawerProfile.connected_platforms.map(cp => (
                    <div key={cp.platform} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_COLORS[cp.platform]}`}>{cp.platform}</span>
                        {cp.connected && <span className="text-xs text-muted-foreground">{cp.display_name}</span>}
                      </div>
                      {cp.connected ? (
                        <div className="flex items-center gap-2">
                          {cp.reauth_required && <span className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Reauth</span>}
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not connected</span>
                      )}
                    </div>
                  )) : (
                    <p className="text-xs text-muted-foreground py-3">No accounts connected yet.</p>
                  )}
                </div>
                <Button variant="outline" className="w-full gap-2" onClick={async () => {
                  try {
                    const { access_url } = await smmApi.generateConnectJWT(drawerProfile.username);
                    if (access_url) window.open(access_url, '_blank');
                    else toast.info('Connect URL could not be generated');
                  } catch { toast.error('Failed to generate connect link'); }
                }}>
                  <ExternalLink className="h-4 w-4" /> Connect Accounts
                </Button>
                <Button variant="destructive" className="w-full gap-2" onClick={() => handleDelete(drawerProfile.username)}>
                  <Trash2 className="h-4 w-4" /> Delete Profile
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
