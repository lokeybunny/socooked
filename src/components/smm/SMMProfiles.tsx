import { useState } from 'react';
import type { SMMProfile } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, ExternalLink, AlertTriangle, CheckCircle, User } from 'lucide-react';
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

  const handleCreate = async () => {
    if (!newUsername.trim()) return;
    await smmApi.createProfile(newUsername.trim());
    toast.success('Profile created');
    setNewUsername('');
    setDialogOpen(false);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Client Profiles</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Profile</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Profile</DialogTitle></DialogHeader>
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
          </tbody>
        </table>
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
                  {drawerProfile.connected_platforms.map(cp => (
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
                  ))}
                </div>
                <Button variant="outline" className="w-full gap-2" onClick={() => toast.info('Connect URL would open here')}>
                  <ExternalLink className="h-4 w-4" /> Connect Accounts
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
