import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadToStorage } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Film, Search, Check, Loader2, X, Upload } from 'lucide-react';

interface VideoAsset {
  id: string;
  title: string;
  url: string;
  type: string;
  created_at: string;
}

interface SelectedVideo {
  id: string;
  title: string;
  url: string;
}

const SLOT_COUNT = 3;

export default function MVPVideoPicker() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slots, setSlots] = useState<(SelectedVideo | null)[]>([null, null, null]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load current saved slots
  useEffect(() => {
    if (!open) return;
    const loadSaved = async () => {
      const { data } = await supabase
        .from('site_configs')
        .select('content')
        .eq('site_id', 'stu25')
        .eq('section', 'mv-landing-videos')
        .maybeSingle();
      if (data?.content) {
        const content = data.content as Record<string, unknown>;
        const saved = (content.videos as SelectedVideo[] | undefined) || [];
        const filled: (SelectedVideo | null)[] = [null, null, null];
        saved.forEach((v, i) => { if (i < SLOT_COUNT) filled[i] = v; });
        setSlots(filled);
      }
    };
    loadSaved();
  }, [open]);

  // Search TG videos
  useEffect(() => {
    if (!open) return;
    const fetchVideos = async () => {
      setLoading(true);
      let q = supabase
        .from('content_assets')
        .select('id, title, url, type, created_at')
        .eq('type', 'video')
        .eq('source', 'telegram')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(30);
      if (search) q = q.ilike('title', `%${search}%`);
      const { data } = await q;
      setVideos(data || []);
      setLoading(false);
    };
    fetchVideos();
  }, [open, search]);

  const selectForSlot = (slotIndex: number, video: VideoAsset) => {
    setSlots(prev => {
      const next = [...prev];
      next[slotIndex] = { id: video.id, title: video.title, url: video.url! };
      return next;
    });
  };

  const clearSlot = (slotIndex: number) => {
    setSlots(prev => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast.error('Please select a video file'); return; }
    setUploading(true);
    try {
      const url = await uploadToStorage(file, { category: 'mv-landing', customerName: 'stu25', source: 'dashboard', fileName: file.name });
      const title = file.name.replace(/\.[^.]+$/, '');
      const { data, error } = await supabase.from('content_assets').insert([{ title, type: 'video', url, source: 'telegram', status: 'published' }]).select('id, title, url, type, created_at').single();
      if (error) throw error;
      if (data) {
        setVideos(prev => [data, ...prev]);
        selectForSlot(activeSlot, data);
        toast.success('Video uploaded & selected');
      }
    } catch (err: any) { toast.error(err.message || 'Upload failed'); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { videos: slots.filter(Boolean).map(s => ({ id: s!.id, title: s!.title, url: s!.url })) } as Record<string, unknown>;

    const { data: existing } = await supabase
      .from('site_configs')
      .select('id')
      .eq('site_id', 'stu25')
      .eq('section', 'mv-landing-videos')
      .maybeSingle();

    if (existing) {
      await supabase.from('site_configs').update({ content: payload as any }).eq('id', existing.id);
    } else {
      await supabase.from('site_configs').insert([{ site_id: 'stu25', section: 'mv-landing-videos', content: payload as any }]);
    }

    toast.success('MV landing videos updated');
    setSaving(false);
    setOpen(false);
  };

  // Which slot are we currently filling?
  const nextEmptySlot = slots.findIndex(s => s === null);
  const [activeSlot, setActiveSlot] = useState(0);

  const selectedIds = new Set(slots.filter(Boolean).map(s => s!.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Film className="h-3.5 w-3.5" /> MVP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            MV Landing Page Videos
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select 3 videos from your Telegram library to display on the MV client landing page.
          </p>
        </DialogHeader>

        {/* Current Slots */}
        <div className="grid grid-cols-3 gap-3 py-3">
          {slots.map((slot, i) => (
            <button
              key={i}
              onClick={() => setActiveSlot(i)}
              className={`relative aspect-video rounded-lg border-2 transition-all overflow-hidden ${
                activeSlot === i
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border'
              } ${slot ? 'bg-muted' : 'bg-muted/30 border-dashed'}`}
            >
              {slot ? (
                <>
                  <video src={slot.url} className="w-full h-full object-cover" muted preload="metadata" />
                  <div className="absolute inset-0 bg-black/40 flex items-end p-1.5">
                    <p className="text-[10px] text-white truncate">{slot.title}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); clearSlot(i); }}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/50 text-white hover:bg-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Film className="h-5 w-5 mb-1" />
                  <span className="text-[10px]">Slot {i + 1}</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Search + Upload */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search TG videos..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleUpload} />
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="gap-1.5 shrink-0">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </Button>
        </div>

        {/* Video list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-1">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No TG videos found.</p>
          ) : (
            videos.map(v => {
              const isSelected = selectedIds.has(v.id);
              return (
                <button
                  key={v.id}
                  disabled={isSelected}
                  onClick={() => selectForSlot(activeSlot, v)}
                  className={`w-full flex items-center gap-3 rounded-lg p-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-primary/10 opacity-60 cursor-not-allowed'
                      : 'hover:bg-muted/60'
                  }`}
                >
                  <div className="w-20 aspect-video rounded-md overflow-hidden bg-muted shrink-0">
                    <video src={v.url} className="w-full h-full object-cover" muted preload="metadata" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{v.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Videos
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
