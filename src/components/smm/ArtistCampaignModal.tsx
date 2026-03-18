import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import {
  Music, Plus, Trash2, Upload, CheckCircle, Clock, AlertCircle,
  Loader2, ChevronDown, ChevronUp, Video, ImageIcon, X, Edit2,
} from 'lucide-react';
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
  schedule_pattern?: string;
  platforms?: string[];
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
  paused: { icon: Clock, label: 'Paused (Missing Media)', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
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
  const [schedulePattern, setSchedulePattern] = useState('daily');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram']);

  const fetchCampaigns = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);

    const { data } = await supabase
      .from('smm_artist_campaigns')
      .select('*')
      .eq('profile_username', profileUsername)
      .order('created_at', { ascending: false });

    setCampaigns((data as ArtistCampaign[]) || []);
    if (!options?.silent) setLoading(false);
  }, [profileUsername]);

  useEffect(() => {
    if (!open) return;

    fetchCampaigns();

    const channel = supabase
      .channel(`artist-campaigns-${profileUsername}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'smm_artist_campaigns',
          filter: `profile_username=eq.${profileUsername}`,
        },
        () => {
          fetchCampaigns({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, profileUsername, fetchCampaigns]);

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
        days_total: schedulePattern === 'biweekly-tue-fri' ? 48 : 14,
        schedule_pattern: schedulePattern,
        platforms: selectedPlatforms,
      });

      if (error) throw error;

      toast.success(`Added ${artistName} — "${songTitle}"`);
      setArtistName('');
      setArtistHandle('');
      setSongTitle('');
      setMediaFiles([]);
      setSchedulePattern('daily');
      setSelectedPlatforms(['instagram']);
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add artist');
    } finally {
      setAdding(false);
    }
  };

  const handleSchedule = async (campaign: ArtistCampaign) => {
    if (campaign.media_urls.length === 0) {
      toast.error('Add at least one media file before scheduling');
      return;
    }
    setScheduling(campaign.id);
    try {
      const res = await supabase.functions.invoke('artist-campaign-scheduler', {
        body: { action: 'schedule', campaign_id: campaign.id },
      });
      if (res.error) throw res.error;
      toast.success(`Scheduled campaign for ${campaign.artist_name}`);
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
        body: { action: 'continue', campaign_id: campaign.id, extend_days: 14 },
      });
      if (res.error) throw res.error;
      toast.success(`Extended campaign for ${campaign.artist_name} by 14 days`);
      fetchCampaigns();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Continue failed');
    } finally {
      setScheduling(null);
    }
  };

  const handleAddMedia = async (campaign: ArtistCampaign, files: File[]) => {
    if (files.length === 0) return;
    setScheduling(campaign.id);
    try {
      const newUrls = await uploadMedia(files);
      if (newUrls.length === 0) throw new Error('No files uploaded');

      const updatedUrls = [...campaign.media_urls, ...newUrls];

      // Update DB
      const { error } = await supabase
        .from('smm_artist_campaigns')
        .update({ media_urls: updatedUrls })
        .eq('id', campaign.id);
      if (error) throw error;

      // Reschedule to incorporate new media — replaces existing posts within 7-14 day window
      if (campaign.status === 'active') {
        await supabase.functions.invoke('artist-campaign-scheduler', {
          body: { action: 'reschedule', campaign_id: campaign.id, media_urls: updatedUrls },
        });
      }

      // If campaign was paused due to missing media, reactivate
      if (campaign.status === 'paused') {
        await supabase.from('smm_artist_campaigns').update({ status: 'active' }).eq('id', campaign.id);
      }

      toast.success(`Added ${newUrls.length} media to ${campaign.artist_name}`);
      fetchCampaigns();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add media');
    } finally {
      setScheduling(null);
    }
  };

  const handleDeleteMedia = async (campaign: ArtistCampaign, mediaUrl: string) => {
    setScheduling(campaign.id);
    try {
      const updatedUrls = campaign.media_urls.filter(u => u !== mediaUrl);

      const { error } = await supabase
        .from('smm_artist_campaigns')
        .update({
          media_urls: updatedUrls,
          // If no media left, pause the campaign
          ...(updatedUrls.length === 0 ? { status: 'paused' } : {}),
        })
        .eq('id', campaign.id);
      if (error) throw error;

      // Remove scheduled posts tied to this media
      if (campaign.status === 'active') {
        await supabase.functions.invoke('artist-campaign-scheduler', {
          body: { action: 'remove-media', campaign_id: campaign.id, media_url: mediaUrl, remaining_urls: updatedUrls },
        });
      }

      toast.success(updatedUrls.length === 0
        ? `Removed last media — campaign paused until new media is added`
        : `Removed media from ${campaign.artist_name}`
      );
      fetchCampaigns();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove media');
    } finally {
      setScheduling(null);
    }
  };

  const handleEditField = async (campaign: ArtistCampaign, field: 'song_title' | 'artist_handle', value: string) => {
    const { error } = await supabase
      .from('smm_artist_campaigns')
      .update({ [field]: value })
      .eq('id', campaign.id);
    if (error) {
      toast.error('Update failed');
      return;
    }
    toast.success('Updated');
    fetchCampaigns();
  };

  const handleDelete = async (campaign: ArtistCampaign) => {
    // Also clean up scheduled posts
    if (campaign.status === 'active') {
      await supabase.functions.invoke('artist-campaign-scheduler', {
        body: { action: 'cleanup', campaign_id: campaign.id },
      });
    }
    const { error } = await supabase.from('smm_artist_campaigns').delete().eq('id', campaign.id);
    if (error) {
      toast.error('Delete failed');
      return;
    }
    toast.success(`Removed ${campaign.artist_name}`);
    fetchCampaigns();
    onRefresh();
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'paused');
  const expiredCampaigns = campaigns.filter(c => c.status === 'expired');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            Artist Campaign Manager
          </DialogTitle>
          <DialogDescription>
            Active campaigns auto-refresh while this manager is open so newly attached media appears without reopening.
          </DialogDescription>
        </DialogHeader>

        {/* Add New Artist */}
        <Card className="p-4 border-dashed border-2 border-primary/20 bg-primary/5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add New Artist
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Artist Name</Label>
              <Input placeholder="e.g. Lamb" value={artistName} onChange={e => setArtistName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Handle</Label>
              <Input placeholder="e.g. @lamb.wavv" value={artistHandle} onChange={e => setArtistHandle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Song Title</Label>
              <Input placeholder="e.g. Midnight Remix" value={songTitle} onChange={e => setSongTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Schedule Pattern</Label>
              <select
                value={schedulePattern}
                onChange={e => setSchedulePattern(e.target.value)}
                className="w-full h-8 text-sm rounded-md border border-border bg-background px-2 text-foreground"
              >
                <option value="daily">Daily (consecutive days)</option>
                <option value="biweekly-tue-fri">Every other Tuesday + Friday (~6 months)</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Platforms</Label>
              <div className="flex gap-2 mt-1">
                {['instagram', 'tiktok'].map(p => (
                  <label key={p} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(p)}
                      onChange={e => {
                        if (e.target.checked) setSelectedPlatforms(prev => [...prev, p]);
                        else setSelectedPlatforms(prev => prev.filter(x => x !== p));
                      }}
                      className="rounded"
                    />
                    {p === 'instagram' ? 'Instagram' : 'TikTok'}
                  </label>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Media Files (videos/images — up to 7)</Label>
              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  Choose Files
                  <input type="file" multiple accept="video/*,image/*" className="hidden" onChange={e => setMediaFiles(Array.from(e.target.files || []))} />
                </label>
                {mediaFiles.length > 0 && (
                  <span className="text-xs text-muted-foreground">{mediaFiles.length} file(s) selected</span>
                )}
              </div>
            </div>
          </div>
          <Button className="w-full mt-3 gap-1.5" size="sm" onClick={handleAddArtist} disabled={adding}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Artist & Create Campaign
          </Button>
        </Card>

        <Separator />

        {/* Active / Paused Campaigns */}
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Active Campaigns ({activeCampaigns.length}/5 slots)
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Each campaign runs on a 14-day cycle. Expand to manage media — deleting a video removes its scheduled posts; adding new media replaces older slots.
          </p>
          {loading && campaigns.length === 0 ? (
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
                  onAddMedia={handleAddMedia}
                  onDeleteMedia={handleDeleteMedia}
                  onEditField={handleEditField}
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
                    onAddMedia={handleAddMedia}
                    onDeleteMedia={handleDeleteMedia}
                    onEditField={handleEditField}
                    scheduling={scheduling === c.id}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Expired */}
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
                    onAddMedia={handleAddMedia}
                    onDeleteMedia={handleDeleteMedia}
                    onEditField={handleEditField}
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
  onAddMedia,
  onDeleteMedia,
  onEditField,
  scheduling,
}: {
  campaign: ArtistCampaign;
  onSchedule: (c: ArtistCampaign) => void;
  onContinue: (c: ArtistCampaign) => void;
  onDelete: (c: ArtistCampaign) => void;
  onAddMedia: (c: ArtistCampaign, files: File[]) => void;
  onDeleteMedia: (c: ArtistCampaign, url: string) => void;
  onEditField: (c: ArtistCampaign, field: 'song_title' | 'artist_handle', value: string) => void;
  scheduling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingSong, setEditingSong] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [songDraft, setSongDraft] = useState(campaign.song_title);
  const [handleDraft, setHandleDraft] = useState(campaign.artist_handle);

  const config = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const progress = campaign.days_total > 0 ? Math.round((campaign.days_completed / campaign.days_total) * 100) : 0;

  const isVideo = (url: string) => /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{campaign.artist_name}</span>
            <span className="text-xs text-muted-foreground">{campaign.artist_handle}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
              <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
              {config.label}
            </Badge>
          </div>
           <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              🎵 {campaign.song_title} · Day {campaign.days_completed}/{campaign.days_total}
              {campaign.schedule_pattern === 'biweekly-tue-fri' && <Badge variant="secondary" className="text-[9px] px-1 py-0">Bi-weekly Tue/Fri</Badge>}
              {(campaign.platforms || ['instagram']).map(p => (
                <Badge key={p} variant="outline" className="text-[9px] px-1 py-0">{p === 'instagram' ? 'IG' : p === 'tiktok' ? 'TT' : p}</Badge>
              ))}
            · {campaign.media_urls.length} media
          </div>
          <div className="w-full h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {campaign.status === 'pending' && (
            <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => onSchedule(campaign)} disabled={scheduling}>
              {scheduling ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              Schedule
            </Button>
          )}
          {(campaign.status === 'expired' || (campaign.status === 'active' && campaign.days_completed >= campaign.days_total)) && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onContinue(campaign)} disabled={scheduling}>
              {scheduling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
              Continue 14d
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(campaign)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-3 bg-muted/30">
          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Song Title</Label>
              {editingSong ? (
                <div className="flex gap-1 mt-0.5">
                  <Input className="h-7 text-xs flex-1" value={songDraft} onChange={e => setSongDraft(e.target.value)} />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { onEditField(campaign, 'song_title', songDraft); setEditingSong(false); }}>
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingSong(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs">{campaign.song_title}</span>
                  <button onClick={() => { setSongDraft(campaign.song_title); setEditingSong(true); }} className="text-muted-foreground hover:text-foreground">
                    <Edit2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Handle</Label>
              {editingHandle ? (
                <div className="flex gap-1 mt-0.5">
                  <Input className="h-7 text-xs flex-1" value={handleDraft} onChange={e => setHandleDraft(e.target.value)} />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { onEditField(campaign, 'artist_handle', handleDraft); setEditingHandle(false); }}>
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingHandle(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs">{campaign.artist_handle}</span>
                  <button onClick={() => { setHandleDraft(campaign.artist_handle); setEditingHandle(true); }} className="text-muted-foreground hover:text-foreground">
                    <Edit2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Media grid */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Campaign Media ({campaign.media_urls.length}/7)
              </Label>
              <label className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-background text-[10px] cursor-pointer hover:bg-muted transition-colors">
                <Plus className="h-3 w-3" /> Add Media
                <input
                  type="file"
                  multiple
                  accept="video/*,image/*"
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) onAddMedia(campaign, files);
                  }}
                />
              </label>
            </div>

            {campaign.media_urls.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border rounded-lg">
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">No media attached — campaign is paused</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Add videos/images to resume scheduling</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {campaign.media_urls.map((url, idx) => (
                  <div key={url} className="relative group rounded-md overflow-hidden border border-border bg-background aspect-square">
                    {isVideo(url) ? (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <Video className="h-5 w-5 text-muted-foreground" />
                        <span className="absolute bottom-0.5 left-1 text-[9px] font-mono text-muted-foreground">Day {idx + 1}</span>
                      </div>
                    ) : (
                      <img src={url} alt={`Day ${idx + 1}`} className="w-full h-full object-cover" />
                    )}
                    <span className="absolute top-0.5 left-1 text-[9px] font-mono bg-background/80 px-1 rounded">
                      {idx + 1}
                    </span>
                    <button
                      onClick={() => onDeleteMedia(campaign, url)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove this media — its scheduled posts will also be removed"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {/* Empty slots */}
                {Array.from({ length: Math.max(0, 7 - campaign.media_urls.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className="rounded-md border border-dashed border-border aspect-square flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Removing a video deletes all scheduled posts using it. The slot stays empty until you add a replacement.
            New media replaces older scheduled posts within the current 14-day window.
          </p>
        </div>
      )}
    </Card>
  );
}
