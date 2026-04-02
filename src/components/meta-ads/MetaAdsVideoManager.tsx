import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Upload, Play, Download, Trash2, Video, Search, X, FileVideo, Clock, HardDrive, Pencil, Check, Plus, FolderOpen,
} from 'lucide-react';

interface AdVideo {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  storage_path: string;
  file_size: number;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  tags: string[];
  campaign: string;
  created_at: string;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MetaAdsVideoManager() {
  const [videos, setVideos] = useState<AdVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<AdVideo | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<string>('all');
  const [addingCampaign, setAddingCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [customPipelines, setCustomPipelines] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ad-video-pipelines') || '[]'); } catch { return []; }
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Merge DB-derived campaigns with locally-stored custom pipelines
  const campaigns = Array.from(new Set([
    ...videos.map(v => v.campaign),
    ...customPipelines,
  ])).sort();

  const fetchVideos = async () => {
    const { data } = await supabase
      .from('meta_ad_videos')
      .select('*')
      .order('created_at', { ascending: false });
    setVideos((data as AdVideo[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchVideos(); }, []);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Please sign in first'); return; }

    setUploading(true);
    for (const file of files) {
      if (!file.type.startsWith('video/')) {
        toast.error(`${file.name} is not a video file`);
        continue;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `ad-videos/${user.id}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('content-uploads')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (upErr) { toast.error(`Upload failed: ${upErr.message}`); continue; }

      const { data: urlData } = supabase.storage.from('content-uploads').getPublicUrl(path);

      const campaign = activeCampaign !== 'all' ? activeCampaign : 'General';

      const { error: dbErr } = await supabase.from('meta_ad_videos').insert({
        owner_id: user.id,
        title: file.name.replace(/\.[^.]+$/, ''),
        file_url: urlData.publicUrl,
        storage_path: path,
        file_size: file.size,
        tags: [],
        campaign,
      } as any);

      if (dbErr) { toast.error(`Save failed: ${dbErr.message}`); continue; }
      toast.success(`Uploaded ${file.name}`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    fetchVideos();
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(Array.from(e.target.files));
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(Array.from(e.dataTransfer.files));
  };

  const handleDelete = async (video: AdVideo) => {
    if (!confirm(`Delete "${video.title}"?`)) return;
    await supabase.storage.from('content-uploads').remove([video.storage_path]);
    await supabase.from('meta_ad_videos').delete().eq('id', video.id);
    toast.success('Video deleted');
    if (selectedVideo?.id === video.id) setSelectedVideo(null);
    fetchVideos();
  };

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) return;
    await supabase.from('meta_ad_videos').update({ title: editTitle.trim() } as any).eq('id', id);
    setEditingId(null);
    fetchVideos();
  };

  const handleChangeCampaign = async (videoId: string, campaign: string) => {
    await supabase.from('meta_ad_videos').update({ campaign } as any).eq('id', videoId);
    toast.success('Campaign updated');
    fetchVideos();
  };

  const handleAddCampaign = () => {
    const name = newCampaignName.trim();
    if (!name) return;
    setActiveCampaign(name);
    setNewCampaignName('');
    setAddingCampaign(false);
    toast.success(`Pipeline "${name}" created — upload videos to populate it`);
  };

  const filtered = videos.filter(v => {
    const matchesSearch = v.title.toLowerCase().includes(search.toLowerCase());
    const matchesCampaign = activeCampaign === 'all' || v.campaign === activeCampaign;
    return matchesSearch && matchesCampaign;
  });

  const campaignCounts = campaigns.reduce<Record<string, number>>((acc, c) => {
    acc[c] = videos.filter(v => v.campaign === c).length;
    return acc;
  }, {});

  return (
    <div
      className="space-y-4 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary rounded-xl flex flex-col items-center justify-center pointer-events-none">
          <Upload className="h-10 w-10 text-primary mb-2 animate-bounce" />
          <p className="text-sm font-medium text-primary">Drop video files here to upload</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileVideo className="h-5 w-5 text-primary" /> Ad Video Manager
          </h3>
          <p className="text-xs text-muted-foreground">{videos.length} video{videos.length !== 1 ? 's' : ''} stored</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search videos…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-48 text-sm" />
          </div>
          <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Uploading…' : 'Upload Video'}
          </Button>
          <input ref={fileRef} type="file" accept="video/*" multiple className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Campaign Pipeline Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveCampaign('all')}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeCampaign === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          All ({videos.length})
        </button>
        {campaigns.map(c => (
          <button
            key={c}
            onClick={() => setActiveCampaign(c)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeCampaign === c
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderOpen className="h-3 w-3" />
            {c} ({campaignCounts[c] || 0})
          </button>
        ))}
        {addingCampaign ? (
          <div className="flex items-center gap-1 shrink-0">
            <Input
              value={newCampaignName}
              onChange={e => setNewCampaignName(e.target.value)}
              placeholder="Campaign name…"
              className="h-7 w-36 text-xs"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddCampaign()}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleAddCampaign}><Check className="h-3 w-3" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAddingCampaign(false); setNewCampaignName(''); }}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <button
            onClick={() => setAddingCampaign(true)}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> New Pipeline
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <Card key={i} className="border-border/50 animate-pulse">
              <CardContent className="p-0">
                <div className="aspect-video bg-muted rounded-t-lg" />
                <div className="p-3 space-y-2"><div className="h-4 bg-muted rounded w-3/4" /><div className="h-3 bg-muted rounded w-1/2" /></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <Video className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {search || activeCampaign !== 'all' ? 'No videos match your filters' : 'No ad videos yet'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">Upload your first video ad to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(v => (
            <Card key={v.id} className="border-border/50 group hover:border-primary/30 transition-colors overflow-hidden">
              <CardContent className="p-0">
                <div className="aspect-video bg-muted relative cursor-pointer" onClick={() => setSelectedVideo(v)}>
                  <video src={v.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center">
                      <Play className="h-4 w-4 text-primary-foreground ml-0.5" />
                    </div>
                  </div>
                  {v.duration_seconds && (
                    <Badge className="absolute bottom-1.5 right-1.5 bg-black/70 text-white border-0 text-[10px] px-1.5">
                      {formatDuration(v.duration_seconds)}
                    </Badge>
                  )}
                </div>

                <div className="p-3 space-y-1.5">
                  {editingId === v.id ? (
                    <div className="flex items-center gap-1">
                      <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="h-7 text-xs" autoFocus onKeyDown={e => e.key === 'Enter' && handleRename(v.id)} />
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleRename(v.id)}><Check className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-foreground truncate">{v.title}</p>
                  )}

                  {/* Campaign badge + reassign */}
                  <Select value={v.campaign} onValueChange={(val) => handleChangeCampaign(v.id, val)}>
                    <SelectTrigger className="h-6 text-[10px] w-fit gap-1 border-border/50 px-2">
                      <FolderOpen className="h-2.5 w-2.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map(c => (
                        <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><HardDrive className="h-3 w-3" />{formatBytes(v.file_size)}</span>
                    <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedVideo(v)}><Play className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(v.id); setEditTitle(v.title); }}><Pencil className="h-3 w-3" /></Button>
                    <a href={v.file_url} download={v.title} target="_blank" rel="noopener noreferrer">
                      <Button size="icon" variant="ghost" className="h-7 w-7"><Download className="h-3 w-3" /></Button>
                    </a>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(v)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Video Player Modal */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-base">{selectedVideo?.title}</DialogTitle>
          </DialogHeader>
          {selectedVideo && (
            <div className="px-4 pb-4 space-y-3">
              <video src={selectedVideo.file_url} controls autoPlay className="w-full rounded-lg bg-black aspect-video" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]"><FolderOpen className="h-2.5 w-2.5 mr-1" />{selectedVideo.campaign}</Badge>
                  <span>{formatBytes(selectedVideo.file_size)}</span>
                  <span>{new Date(selectedVideo.created_at).toLocaleString()}</span>
                </div>
                <a href={selectedVideo.file_url} download={selectedVideo.title} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Download</Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
