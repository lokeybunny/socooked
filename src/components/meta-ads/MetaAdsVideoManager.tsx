import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Upload, Play, Download, Trash2, Video, Search, X, FileVideo, Clock, HardDrive, Tag, Pencil, Check,
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
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchVideos = async () => {
    const { data } = await supabase
      .from('meta_ad_videos')
      .select('*')
      .order('created_at', { ascending: false });
    setVideos((data as AdVideo[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchVideos(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Please sign in first'); return; }

    setUploading(true);
    for (const file of Array.from(files)) {
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

      const { error: dbErr } = await supabase.from('meta_ad_videos').insert({
        owner_id: user.id,
        title: file.name.replace(/\.[^.]+$/, ''),
        file_url: urlData.publicUrl,
        storage_path: path,
        file_size: file.size,
        tags: [],
      } as any);

      if (dbErr) { toast.error(`Save failed: ${dbErr.message}`); continue; }
      toast.success(`Uploaded ${file.name}`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    fetchVideos();
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

  const filtered = videos.filter(v =>
    v.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
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
            <Input
              placeholder="Search videos…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 w-48 text-sm"
            />
          </div>
          <Button
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Uploading…' : 'Upload Video'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <Card key={i} className="border-border/50 animate-pulse">
              <CardContent className="p-0">
                <div className="aspect-video bg-muted rounded-t-lg" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <Video className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {search ? 'No videos match your search' : 'No ad videos yet'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Upload your first video ad to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(v => (
            <Card key={v.id} className="border-border/50 group hover:border-primary/30 transition-colors overflow-hidden">
              <CardContent className="p-0">
                {/* Thumbnail / preview */}
                <div
                  className="aspect-video bg-muted relative cursor-pointer"
                  onClick={() => setSelectedVideo(v)}
                >
                  <video
                    src={v.file_url}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
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

                {/* Info */}
                <div className="p-3 space-y-1.5">
                  {editingId === v.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleRename(v.id)}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleRename(v.id)}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-foreground truncate">{v.title}</p>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><HardDrive className="h-3 w-3" />{formatBytes(v.file_size)}</span>
                    <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 pt-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedVideo(v)}>
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(v.id); setEditTitle(v.title); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <a href={v.file_url} download={v.title} target="_blank" rel="noopener noreferrer">
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <Download className="h-3 w-3" />
                      </Button>
                    </a>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(v)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
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
              <video
                src={selectedVideo.file_url}
                controls
                autoPlay
                className="w-full rounded-lg bg-black aspect-video"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatBytes(selectedVideo.file_size)}</span>
                  <span>{new Date(selectedVideo.created_at).toLocaleString()}</span>
                </div>
                <a href={selectedVideo.file_url} download={selectedVideo.title} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
