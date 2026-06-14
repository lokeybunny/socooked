import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Instagram, Plus, RefreshCw, Trash2, Link as LinkIcon,
  CheckCircle2, AlertCircle, Loader2, Copy, ExternalLink, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { smmApi } from '@/lib/smm/store';
import type { SMMProfile } from '@/lib/smm/types';

const ACTIVE_KEY = 'reels.activeProfile';

export default function InstagramProfiles() {
  const [profiles, setProfiles] = useState<SMMProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<string>(() => localStorage.getItem(ACTIVE_KEY) || '');

  const [addOpen, setAddOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [creating, setCreating] = useState(false);

  const [connectModal, setConnectModal] = useState<{ username: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function load(showToast = false) {
    setRefreshing(true);
    try {
      const list = await smmApi.getProfiles();
      setProfiles(list);
      if (!active && list[0]) {
        setActive(list[0].username);
        localStorage.setItem(ACTIVE_KEY, list[0].username);
      }
      if (showToast) toast.success('Profiles refreshed');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load profiles');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function selectProfile(username: string) {
    setActive(username);
    localStorage.setItem(ACTIVE_KEY, username);
    toast.success(`Active profile: ${username}`);
  }

  async function handleCreate() {
    const username = newUsername.trim().replace(/^@+/, '');
    if (!username) return;
    setCreating(true);
    try {
      try {
        await smmApi.createProfile(username);
        toast.success(`Profile "${username}" created`);
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (/already in use|already exists|409/i.test(msg)) {
          toast.info(`Profile "${username}" already exists — selecting it`);
        } else {
          throw e;
        }
      }
      setNewUsername('');
      setAddOpen(false);
      await load();
      setActive(username);
      localStorage.setItem(ACTIVE_KEY, username);
      try {
        const { access_url } = await smmApi.generateConnectJWT(username);
        if (access_url) setConnectModal({ username, url: access_url });
      } catch (err) {
        console.warn('JWT generation failed:', err);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create profile');
    } finally {
      setCreating(false);
    }
  }

  async function handleConnect(username: string) {
    try {
      const { access_url } = await smmApi.generateConnectJWT(username);
      if (!access_url) throw new Error('No connect URL returned');
      setConnectModal({ username, url: access_url });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate connect link');
    }
  }

  async function handleDelete(username: string) {
    setDeleting(username);
    try {
      await smmApi.deleteProfile(username);
      toast.success(`Profile "${username}" deleted`);
      if (active === username) {
        setActive('');
        localStorage.removeItem(ACTIVE_KEY);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete profile');
    } finally {
      setDeleting(null);
      setPendingDelete(null);
    }
  }

  const igConnected = (p: SMMProfile) =>
    p.connected_platforms?.some(cp => cp.platform === 'instagram' && cp.connected);

  const sorted = useMemo(
    () => [...profiles].sort((a, b) => {
      // active first, then IG-connected, then alpha
      if (a.username === active) return -1;
      if (b.username === active) return 1;
      const ai = igConnected(a) ? 0 : 1;
      const bi = igConnected(b) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.username.localeCompare(b.username);
    }),
    [profiles, active],
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Instagram className="h-6 w-6 text-pink-500" /> Instagram Profiles
            </h1>
            <p className="text-sm text-muted-foreground">
              Add, refresh, and choose which profile is used for reel uploads.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <Card className="p-10 text-center space-y-3">
            <Instagram className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No profiles yet.</p>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add your first profile
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {sorted.map(p => {
              const ig = p.connected_platforms?.find(cp => cp.platform === 'instagram');
              const isActive = p.username === active;
              const isConnected = !!ig?.connected;
              return (
                <Card
                  key={p.id}
                  className={`p-4 flex items-center gap-4 transition-colors ${
                    isActive ? 'border-pink-500/60 bg-pink-500/5' : 'hover:border-border'
                  }`}
                >
                  <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${
                    isConnected ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    <Instagram className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{p.username}</p>
                      {isActive && (
                        <Badge className="bg-pink-500 hover:bg-pink-500 text-white gap-1">
                          <Star className="h-3 w-3" /> Active
                        </Badge>
                      )}
                      {isConnected ? (
                        <Badge variant="outline" className="text-green-500 border-green-500/30 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-500 border-amber-500/30 gap-1">
                          <AlertCircle className="h-3 w-3" /> Not connected
                        </Badge>
                      )}
                    </div>
                    {ig?.handle && (
                      <p className="text-xs text-muted-foreground truncate">@{ig.handle}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => selectProfile(p.username)}>
                        <Star className="h-3.5 w-3.5" /> Set as Default
                      </Button>
                    )}
                    <Button
                      variant="outline" size="sm" onClick={() => handleConnect(p.username)}
                      title={isConnected ? 'Reconnect / refresh OAuth' : 'Connect Instagram'}
                    >
                      <LinkIcon className="h-4 w-4 mr-1" />
                      {isConnected ? 'Reconnect' : 'Connect'}
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setPendingDelete(p.username)}
                      disabled={deleting === p.username}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {deleting === p.username
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="p-4 text-xs text-muted-foreground">
          The <strong>Active</strong> profile is used as the default in{' '}
          <Link to="/dashboard/reels" className="underline">Reel Upload</Link>. Use{' '}
          <strong>Connect</strong> to link or refresh Instagram's OAuth permissions for a profile.
        </Card>
      </div>

      {/* Add profile dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Instagram Profile</DialogTitle>
            <DialogDescription>
              Create a new Upload-Post profile, then connect it to your Instagram account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="username">Profile name</Label>
            <Input
              id="username"
              placeholder="e.g. main-brand"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !creating) handleCreate(); }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              A label for this profile inside the dashboard. After creating, you'll get a link to connect Instagram.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newUsername.trim() || creating}>
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect (OAuth) link modal */}
      <Dialog open={!!connectModal} onOpenChange={(o) => !o && setConnectModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Instagram</DialogTitle>
            <DialogDescription>
              Open this secure link to authorize Instagram for <strong>{connectModal?.username}</strong>.
              The link expires shortly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={connectModal?.url || ''} className="font-mono text-xs" />
            <Button
              variant="outline" size="icon"
              onClick={() => {
                if (connectModal?.url) {
                  navigator.clipboard.writeText(connectModal.url);
                  toast.success('Link copied');
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectModal(null)}>Close</Button>
            <Button onClick={() => connectModal?.url && window.open(connectModal.url, '_blank', 'noopener,noreferrer')}>
              <ExternalLink className="h-4 w-4 mr-2" /> Open Connect Page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{pendingDelete}</strong> from Upload-Post. Scheduled posts under this profile may stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => pendingDelete && handleDelete(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
