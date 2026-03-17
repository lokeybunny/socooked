import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Music, Plus, Trash2, Upload, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ArtistCampaign {
  id: string;
  profile_username: string;
  artist_name: string;
  artist_handle: string;
  song_title: string;
  media_urls: string[];
  status: string;
  slot_index: number | null;
  days_total: number;
  days_completed: number;
  started_at: string;
  expires_at: string | null;
  continued_until: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileUsername: string;
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; label: string; color: string }> = {
  active: { icon: CheckCircle, label: 'Active', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  pending: { icon: Clock, label: 'Pending', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  expired: { icon: AlertCircle, label: 'Expired', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  completed: { icon: CheckCircle, label: 'Completed', color: 'bg-muted text-muted-foreground border-border' },
};

export default function ArtistCampaignModal({ open, onOpenChange, profileUsername, onRefresh }: Props) {
  const [campaigns, setCampaigns] = useState<ArtistCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState<string | null>(null);

  // New artist form
  const [artistName, setArtistName] = useState('');
  const [artistHandle, setArtistHandle] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('smm_artist_campaigns')
      .select('*')
      .eq('profile_username', profileUsername)
      .order('created_at', { ascending: false });
    setCampaigns((data as ArtistCampaign[]) || []);
    setLoading(false);
  }, [profileUsername]);

  useEffect(() => {
    if (open) fetchCampaigns();
  }, [open, fetchCampaigns]);

  const uploadMedia = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'mp4';
      const path = `smm-artists/${profileUsername}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('content-uploads').upload(path, file);
      if (error) {
        toast.error(`Upload failed: ${file.name}`);
        continue;
      }
      const { data: urlData } = supabase.storage.from('content-uploads').getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const handleAddArtist = async () => {
    if (!artistName.trim() || !artistHandle.trim() || !songTitle.trim()) {
      toast.error('Please fill in artist name, handle, and song title');
      return;
    }

    setAdding(true);
    try {
      let mediaUrls: string[] = [];
      if (mediaFiles.length > 0) {
        mediaUrls = await uploadMedia(mediaFiles);
      }

      const handle = artistHandle.startsWith('@') ? artistHandle : `@${artistHandle}`;

      const { error } = await supabase.from('smm_artist_campaigns').insert({
        profile_username: profileUsername,
        artist_name: artistName.trim(),
        artist_handle: handle.trim(),
        song_title: songTitle.trim(),
        media_urls: mediaUrls,
        status: 'pending',
        days_total: 7,
      });

      if (error) throw error;

      toast.success(`Added ${artistName} — "${songTitle}"`);
      setArtistName('');
      setArtistHandle('');
      setSongTitle('');
      setMediaFiles([]);
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add artist');
    } finally {
      setAdding(false);
    }
  };

  const handleSchedule = async (campaign: ArtistCampaign) => {
    setScheduling(campaign.id);
    try {
      const res = await supabase.functions.invoke('artist-campaign-scheduler', {
        body: { action: 'schedule', campaign_id: campaign.id },
      });
      if (res.error) throw res.error;
      toast.success(`Scheduled 7-day campaign for ${campaign.artist_name}`);
      fetchCampaigns();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Scheduling failed');
    } finally {
      setScheduling(null);
    }
  };

  const handleContinue = async (campaign: ArtistCampaign) => {
    setScheduling(campaign.id);
    try {
      const res = await supabase.functions.invoke('artist-campaign-scheduler', {
        body: { action: 'continue', campaign_id: campaign.id, extend_days: 30 },
      });
      if (res.error) throw res.error;
      toast.success(`Extended campaign for ${campaign.artist_name} by 30 days`);
      fetchCampaigns();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Continue failed');
    } finally {
      setScheduling(null);
    }
  };

  const handleDelete = async (campaign: ArtistCampaign) => {
    const { error } = await supabase.from('smm_artist_campaigns').delete().eq('id', campaign.id);
    if (error) {
      toast.error('Delete failed');
      return;
    }
    toast.success(`Removed ${campaign.artist_name}`);
    fetchCampaigns();
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const expiredCampaigns = campaigns.filter(c => c.status === 'expired');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            Artist Campaign Manager
          </DialogTitle>
        </DialogHeader>

        {/* Add New Artist */}
        <Card className="p-4 border-dashed border-2 border-primary/20 bg-primary/5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add New Artist
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Artist Name</Label>
              <Input
                placeholder="e.g. Lamb"
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Handle</Label>
              <Input
                placeholder="e.g. @lamb.wavv"
                value={artistHandle}
                onChange={e => setArtistHandle(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Song Title</Label>
              <Input
                placeholder="e.g. Midnight Remix"
                value={songTitle}
                onChange={e => setSongTitle(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Media Files (videos/images for 7 days)</Label>
              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  Choose Files
                  <input
                    type="file"
                    multiple
                    accept="video/*,image/*"
                    className="hidden"
                    onChange={e => setMediaFiles(Array.from(e.target.files || []))}
                  />
                </label>
                {mediaFiles.length > 0 && (
                  <span className="text-xs text-muted-foreground">{mediaFiles.length} file(s) selected</span>
                )}
              </div>
            </div>
          </div>
          <Button
            className="w-full mt-3 gap-1.5"
            size="sm"
            onClick={handleAddArtist}
            disabled={adding}
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Artist & Create 7-Day Campaign
          </Button>
        </Card>

        <Separator />

        {/* Active Campaigns */}
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Active Campaigns ({activeCampaigns.length}/5 slots)
          </h3>
          {loading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
          ) : activeCampaigns.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">No active campaigns</div>
          ) : (
            <div className="space-y-2">
              {activeCampaigns.map(c => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onSchedule={handleSchedule}
                  onContinue={handleContinue}
                  onDelete={handleDelete}
                  scheduling={scheduling === c.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pending Campaigns */}
        {campaigns.filter(c => c.status === 'pending').length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-2">Pending (Ready to Schedule)</h3>
              <div className="space-y-2">
                {campaigns.filter(c => c.status === 'pending').map(c => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    onSchedule={handleSchedule}
                    onContinue={handleContinue}
                    onDelete={handleDelete}
                    scheduling={scheduling === c.id}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Expired / Completed */}
        {expiredCampaigns.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-2">Expired</h3>
              <div className="space-y-2">
                {expiredCampaigns.map(c => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    onSchedule={handleSchedule}
                    onContinue={handleContinue}
                    onDelete={handleDelete}
                    scheduling={scheduling === c.id}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CampaignCard({
  campaign,
  onSchedule,
  onContinue,
  onDelete,
  scheduling,
}: {
  campaign: ArtistCampaign;
  onSchedule: (c: ArtistCampaign) => void;
  onContinue: (c: ArtistCampaign) => void;
  onDelete: (c: ArtistCampaign) => void;
  scheduling: boolean;
}) {
  const config = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const progress = campaign.days_total > 0 ? Math.round((campaign.days_completed / campaign.days_total) * 100) : 0;

  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{campaign.artist_name}</span>
          <span className="text-xs text-muted-foreground">{campaign.artist_handle}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
            <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
            {config.label}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          🎵 {campaign.song_title} · Day {campaign.days_completed}/{campaign.days_total}
          {campaign.media_urls.length > 0 && ` · ${campaign.media_urls.length} media`}
        </div>
        {/* Progress bar */}
        <div className="w-full h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {campaign.status === 'pending' && (
          <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => onSchedule(campaign)} disabled={scheduling}>
            {scheduling ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Schedule
          </Button>
        )}
        {(campaign.status === 'expired' || (campaign.status === 'active' && campaign.days_completed >= campaign.days_total)) && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onContinue(campaign)} disabled={scheduling}>
            {scheduling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
            Continue 30d
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(campaign)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}
