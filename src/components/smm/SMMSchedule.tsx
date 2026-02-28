import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSMMContext, PLATFORM_META } from '@/lib/smm/context';
import { smmApi } from '@/lib/smm/store';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  CalendarPlus, Sparkles, RefreshCw, Image, Video, Type, Hash,
  Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Send,
  ThumbsUp, Repeat2, Eye, Play, Zap, Clock, CheckCircle2,
  AlertCircle, Loader2, RotateCcw, Pencil, Upload, Trash2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { uploadToStorage } from '@/lib/storage';
import VideoThumbnail from '@/components/ui/VideoThumbnail';
import type { SMMProfile } from '@/lib/smm/types';
import { format, parseISO, isToday, differenceInHours } from 'date-fns';

// ─── Types ───
interface ScheduleItem {
  id: string;
  date: string;
  time: string;
  type: 'image' | 'video' | 'text' | 'carousel';
  caption: string;
  hashtags: string[];
  media_prompt?: string;
  media_url?: string;
  carousel_urls?: string[];
  status: 'draft' | 'generating' | 'ready' | 'published' | 'failed' | 'planned';
}

interface ContentPlan {
  id: string;
  profile_username: string;
  platform: string;
  plan_name: string;
  status: string; // draft | live | completed
  brand_context: {
    niche?: string;
    voice?: string;
    audience?: string;
    keywords?: string[];
    hashtag_sets?: Record<string, string[]>;
  };
  schedule_items: ScheduleItem[];
  created_at: string;
  updated_at: string;
}

const SCHEDULE_PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'x', label: 'X' },
];

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; icon: React.ReactNode }> = {
    draft: { bg: 'bg-muted text-muted-foreground', icon: <Clock className="h-2.5 w-2.5" /> },
    generating: { bg: 'bg-yellow-500/10 text-yellow-600 animate-pulse', icon: <Loader2 className="h-2.5 w-2.5 animate-spin" /> },
    ready: { bg: 'bg-green-500/10 text-green-600', icon: <CheckCircle2 className="h-2.5 w-2.5" /> },
    published: { bg: 'bg-blue-500/10 text-blue-600', icon: <Zap className="h-2.5 w-2.5" /> },
    failed: { bg: 'bg-destructive/10 text-destructive', icon: <AlertCircle className="h-2.5 w-2.5" /> },
    planned: { bg: 'bg-muted text-muted-foreground', icon: <Clock className="h-2.5 w-2.5" /> },
  };
  const c = config[status] || config.draft;
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${c.bg}`}>
      {c.icon} {status}
    </Badge>
  );
}

// ─── Template Placeholder (shown when media not yet generated) ───
function MediaPlaceholder({ item }: { item: ScheduleItem }) {
  const hoursUntil = differenceInHours(parseISO(item.date), new Date());
  const isWithin48h = hoursUntil <= 48 && hoursUntil > 0;

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center gap-2 ${
      item.status === 'generating' ? 'bg-yellow-500/5 animate-pulse' :
      isWithin48h ? 'bg-primary/5 border border-dashed border-primary/20' :
      'bg-muted/30 border border-dashed border-border/50'
    }`}>
      {item.status === 'generating' ? (
        <>
          <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />
          <span className="text-[10px] text-yellow-600 font-medium">Generating…</span>
        </>
      ) : (
        <>
          {item.type === 'video' ? <Video className="h-5 w-5 text-muted-foreground" /> :
           item.type === 'carousel' ? <Image className="h-5 w-5 text-muted-foreground" /> :
           <Image className="h-5 w-5 text-muted-foreground" />}
          <span className="text-[10px] text-muted-foreground text-center px-2 max-w-[120px] truncate">
            {isWithin48h ? '⏰ Generating soon' : `📅 ${format(parseISO(item.date), 'MMM d')}`}
          </span>
          <span className="text-[9px] text-muted-foreground/60">Template</span>
        </>
      )}
    </div>
  );
}

// ─── Carousel Slide Editor (swipeable single-image view with per-slide edit) ───
function CarouselSlideEditor({
  carouselUrls, onUrlsChange, onRegenerate, onFileUpload, fileInputRef, uploading, regenerating,
}: {
  carouselUrls: string[];
  onUrlsChange: (urls: string[]) => void;
  onRegenerate: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  regenerating: boolean;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideFileRef] = useState(() => ({ current: null as HTMLInputElement | null }));

  const total = carouselUrls.length;
  const prev = () => setActiveSlide(i => Math.max(0, i - 1));
  const next = () => setActiveSlide(i => Math.min(total - 1, i + 1));

  const handleSlideReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) { toast.error('Please upload an image'); return; }
    try {
      const url = await uploadToStorage(file, {
        category: 'smm', customerName: 'schedule', source: 'smm-carousel', fileName: file.name,
      });
      const updated = [...carouselUrls];
      updated[activeSlide] = url;
      onUrlsChange(updated);
      toast.success(`Slide ${activeSlide + 1} replaced`);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    }
    if (slideFileRef.current) slideFileRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      {/* Large single-image view with arrows */}
      <div className="relative rounded-lg overflow-hidden border border-border/50 bg-muted/20">
        <AspectRatio ratio={1}>
          <img
            src={carouselUrls[activeSlide]}
            alt={`Slide ${activeSlide + 1}`}
            className="w-full h-full object-cover transition-all duration-200"
          />
        </AspectRatio>

        {/* Slide counter */}
        <div className="absolute top-2 right-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full font-medium">
          {activeSlide + 1} / {total}
        </div>

        {/* Left arrow */}
        {activeSlide > 0 && (
          <button onClick={prev} className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {/* Right arrow */}
        {activeSlide < total - 1 && (
          <button onClick={next} className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5">
        {carouselUrls.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setActiveSlide(idx)}
            className={`h-1.5 rounded-full transition-all ${
              idx === activeSlide ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>

      {/* Per-slide actions */}
      <div className="flex gap-2">
        <input
          ref={el => { slideFileRef.current = el; }}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSlideReplace}
        />
        <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-1" onClick={() => slideFileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Replace Slide {activeSlide + 1}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-1" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {regenerating ? 'Generating…' : 'Re-gen All'}
        </Button>
      </div>
    </div>
  );
}

// ─── Schedule Item Edit Modal ───
function ScheduleItemModal({
  item, open, onOpenChange, onSave,
}: {
  item: ScheduleItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated: ScheduleItem) => void;
}) {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<ScheduleItem['type']>('image');
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setCaption(item.caption || '');
      setHashtags((item.hashtags || []).join(', '));
      setDate(item.date || '');
      setTime(item.time || '');
      setType(item.type);
      setMediaUrl(item.media_url);
    }
  }, [item]);

  if (!item) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      toast.error('Please upload an image or video file');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToStorage(file, {
        category: 'smm',
        customerName: 'schedule',
        source: 'smm-schedule',
        fileName: file.name,
      });
      setMediaUrl(url);
      if (isVideo && type !== 'video') setType('video');
      if (isImage && type === 'video') setType('image');
      toast.success('Media uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveMedia = () => {
    setMediaUrl(undefined);
    toast('Media removed');
  };

  const handleRegenerate = async () => {
    if (!item.media_prompt && !caption) {
      toast.error('No prompt available for regeneration');
      return;
    }

    // For videos, warn user it takes time
    if (type === 'video') {
      toast.info('Video generation takes 1-3 minutes. You can close this modal — the thumbnail will update automatically.', { duration: 6000 });
    }

    setRegenerating(true);
    const originalMediaUrl = mediaUrl;

    try {
      const prompt = item.media_prompt || `Create a visually striking social media ${type} post: ${caption}`;
      
      // Fire the edge function — it may take minutes for video, so we don't await the full result
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2min client timeout

      const invokePromise = supabase.functions.invoke('smm-media-gen', {
        body: { 
          force_dates: [date],
          single_item: { id: item.id, type, prompt },
        },
      });

      // For images, we can usually wait for the result (fast)
      if (type !== 'video') {
        const { data, error } = await invokePromise;
        clearTimeout(timeout);
        if (error) throw error;

        // Check result
        if (data?.generated > 0) {
          // Fetch updated URL from the plan
          const { data: plans } = await supabase
            .from('smm_content_plans')
            .select('schedule_items')
            .limit(1);
          if (plans?.[0]) {
            const updatedItem = (plans[0].schedule_items as any[]).find((i: any) => i.id === item.id);
            if (updatedItem?.media_url) {
              setMediaUrl(updatedItem.media_url);
              toast.success('Media regenerated!');
            } else {
              toast.error('Generation completed but no media was produced. Try again.');
            }
          }
        } else {
          toast.error(data?.message || 'Regeneration failed — try again');
        }
        setRegenerating(false);
        return;
      }

      // For videos: don't block, use realtime subscription to detect change
      toast.success('Video generation submitted. The preview will update when ready.');
      
      // Subscribe to plan updates via polling (realtime may not be enabled on this table)
      let attempts = 0;
      const maxAttempts = 40; // ~2 min at 3s intervals
      const poll = setInterval(async () => {
        attempts++;
        try {
          const { data: plans } = await supabase
            .from('smm_content_plans')
            .select('schedule_items')
            .limit(1);
          if (plans?.[0]) {
            const updatedItem = (plans[0].schedule_items as any[]).find((i: any) => i.id === item.id);
            if (updatedItem?.media_url && updatedItem.media_url !== originalMediaUrl && updatedItem.status === 'ready') {
              setMediaUrl(updatedItem.media_url);
              clearInterval(poll);
              setRegenerating(false);
              toast.success('Video regenerated!');
              return;
            }
            if (updatedItem?.status === 'failed') {
              clearInterval(poll);
              setRegenerating(false);
              toast.error('Video generation failed — try again or use a different prompt');
              return;
            }
          }
        } catch {}
        if (attempts >= maxAttempts) {
          clearInterval(poll);
          setRegenerating(false);
          toast('Video generation is still in progress — refresh the page to check later', { duration: 5000 });
        }
      }, 3000);

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast('Generation is still running in the background — check back in a minute', { duration: 5000 });
      } else {
        toast.error(err.message || 'Regeneration failed');
      }
      setRegenerating(false);
    }
  };

  const handleSave = () => {
    const parsed = hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean);
    onSave({ ...item, caption, hashtags: parsed, date, time, type, media_url: mediaUrl });
    onOpenChange(false);
  };

  // Only use <video> tag if the URL is actually a video file, not a fallback image
  const isActualVideo = mediaUrl && /\.(mp4|mov|webm|m3u8)/i.test(mediaUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Edit Schedule Item
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Media Preview + Upload */}
          <div className="space-y-2">
            <Label>Media {type === 'carousel' && item.carousel_urls?.length ? `(${item.carousel_urls.length} slides)` : ''}</Label>
            {/* Carousel slides preview — swipeable single-image view */}
            {type === 'carousel' && item.carousel_urls && item.carousel_urls.length > 1 ? (
              <CarouselSlideEditor
                carouselUrls={item.carousel_urls}
                onUrlsChange={(urls) => {
                  // Update the item's carousel_urls in local state (saved on Save)
                  item.carousel_urls = urls;
                  setMediaUrl(urls[0]); // keep main media_url in sync
                }}
                onRegenerate={handleRegenerate}
                onFileUpload={handleFileUpload}
                fileInputRef={fileInputRef}
                uploading={uploading}
                regenerating={regenerating}
              />
            ) : (
              <>
                <div className="w-full rounded-lg overflow-hidden border border-border/50 relative group">
                  {mediaUrl ? (
                    isActualVideo ? (
                      <VideoThumbnail src={mediaUrl} title={caption} className="w-full max-h-64" videoClassName="w-full max-h-64 object-contain bg-black" controls={true} />
                    ) : (
                      <img src={mediaUrl} alt="" className="w-full max-h-64 object-cover" />
                    )
                  ) : (
                    <div className="w-full h-48"><MediaPlaceholder item={item} /></div>
                  )}
                  {/* Overlay actions — only for non-video (images/text) */}
                  {!isActualVideo && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <Button size="sm" variant="secondary" className="gap-1.5 text-xs pointer-events-auto" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {mediaUrl ? 'Replace' : 'Upload'}
                      </Button>
                      {mediaUrl && (
                        <Button size="sm" variant="destructive" className="gap-1.5 text-xs pointer-events-auto" onClick={handleRemoveMedia}>
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" className="gap-1.5 text-xs pointer-events-auto" onClick={handleRegenerate} disabled={regenerating}>
                        {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {regenerating ? 'Generating…' : 'Re-generate'}
                      </Button>
                    </div>
                  )}
                </div>
                {/* Actions below video for video type */}
                {isActualVideo && (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Replace
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-1" onClick={handleRegenerate} disabled={regenerating}>
                      {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {regenerating ? 'Generating…' : 'Re-generate'}
                    </Button>
                    <Button size="sm" variant="destructive" className="gap-1.5 text-xs" onClick={handleRemoveMedia}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </>
            )}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
            {uploading && <p className="text-xs text-muted-foreground animate-pulse">Uploading…</p>}
            {regenerating && <p className="text-xs text-muted-foreground animate-pulse">🎨 AI is generating new {type === 'carousel' ? 'carousel slides' : type === 'video' ? 'video' : 'image'}… {type === 'video' ? 'This takes 1-3 minutes.' : ''}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-caption">Caption</Label>
            <Textarea id="edit-caption" rows={4} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write your caption…" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-hashtags">Hashtags <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
            <Input id="edit-hashtags" value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="branding, design, creative" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input id="edit-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-time">Time</Label>
              <Input id="edit-time" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={v => setType(v as ScheduleItem['type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="carousel">Carousel</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge status={item.status} />
            {item.media_prompt && <span className="truncate max-w-xs">Prompt: {item.media_prompt}</span>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="gap-1.5" disabled={uploading}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Platform Feed Renderers ───

function InstagramFeedPreview({ items, onItemClick }: { items: ScheduleItem[]; onItemClick?: (item: ScheduleItem) => void }) {
  return (
    <div className="space-y-0">
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold">S</div>
        <span className="text-sm font-semibold text-foreground">STU25</span>
        <span className="ml-auto text-xs text-muted-foreground">Click any thumbnail to preview & edit</span>
      </div>
      <div className="grid grid-cols-3 gap-1 p-1">
        {items.map((item) => (
          <div key={item.id} className="group cursor-pointer" onClick={() => onItemClick?.(item)}>
            <div className="relative">
              <AspectRatio ratio={1}>
                {item.media_url ? (
                  item.type === 'video' && /\.(mp4|mov|webm|m3u8)/i.test(item.media_url) ? (
                    <VideoThumbnail src={item.media_url} title={item.caption} className="w-full h-full" videoClassName="w-full h-full object-cover" controls={false} />
                  ) : (
                    <img src={item.media_url} alt={item.caption} className="w-full h-full object-cover" />
                  )
                ) : (
                  <MediaPlaceholder item={item} />
                )}
              </AspectRatio>
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs">
                <Pencil className="h-4 w-4" />
              </div>
            </div>
            <div className="px-1 py-1.5 space-y-0.5">
              <p className="text-[10px] leading-tight line-clamp-2"><span className="font-semibold">STU25</span> {item.caption}</p>
              <p className="text-[9px] text-muted-foreground">{format(parseISO(item.date), 'MMM d')} · {item.type}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="divide-y divide-border/30 mt-2">
        {items.slice(0, 3).map((item) => (
          <div key={`feed-${item.id}`} className="p-3 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => onItemClick?.(item)}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-yellow-500" />
              <span className="text-xs font-semibold">STU25</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{format(parseISO(item.date), 'MMM d, h:mm a')}</span>
            </div>
            {item.media_url ? (
              item.type === 'video' && /\.(mp4|mov|webm|m3u8)/i.test(item.media_url) ? (
                <VideoThumbnail src={item.media_url} title={item.caption} className="w-full rounded-md max-h-64 overflow-hidden" videoClassName="w-full max-h-64 object-cover" />
              ) : (
                <img src={item.media_url} alt="" className="w-full rounded-md max-h-64 object-cover" />
              )
            ) : (
              <div className="w-full h-40 rounded-md overflow-hidden"><MediaPlaceholder item={item} /></div>
            )}
            <div className="flex items-center gap-4 text-muted-foreground">
              <Heart className="h-4 w-4" /><MessageCircle className="h-4 w-4" /><Send className="h-4 w-4" />
              <Bookmark className="h-4 w-4 ml-auto" />
            </div>
            <p className="text-xs"><span className="font-semibold">STU25</span> {item.caption}</p>
            {item.hashtags?.length > 0 && (
              <p className="text-xs text-pink-500">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
            )}
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FacebookFeedPreview({ items, onItemClick }: { items: ScheduleItem[]; onItemClick?: (item: ScheduleItem) => void }) {
  return (
    <div className="space-y-3 p-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-border/50 bg-card overflow-hidden cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onItemClick?.(item)}>
          <div className="flex items-center gap-2 p-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">S</div>
            <div>
              <p className="text-xs font-semibold">STU25</p>
              <p className="text-[10px] text-muted-foreground">{format(parseISO(item.date), 'MMM d')} · 🌐</p>
            </div>
            <MoreHorizontal className="h-4 w-4 text-muted-foreground ml-auto" />
          </div>
          <p className="px-3 pb-2 text-xs">{item.caption}</p>
          {item.media_url ? (
            <img src={item.media_url} alt="" className="w-full max-h-52 object-cover" />
          ) : item.type !== 'text' ? (
            <div className="w-full h-36"><MediaPlaceholder item={item} /></div>
          ) : null}
          <div className="flex items-center justify-around p-2 border-t border-border/30 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> Like</span>
            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Comment</span>
            <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Share</span>
          </div>
          <div className="px-3 pb-2"><StatusBadge status={item.status} /></div>
        </div>
      ))}
    </div>
  );
}

function TikTokFeedPreview({ items, onItemClick }: { items: ScheduleItem[]; onItemClick?: (item: ScheduleItem) => void }) {
  return (
    <div className="space-y-3 p-3">
      {items.map((item) => (
        <div key={item.id} className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[400px] cursor-pointer" onClick={() => onItemClick?.(item)}>
          {item.media_url ? (
            <img src={item.media_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full"><MediaPlaceholder item={item} /></div>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-white text-xs font-semibold mb-1">@STU25</p>
            <p className="text-white/90 text-[11px] line-clamp-2">{item.caption}</p>
            {item.hashtags?.length > 0 && (
              <p className="text-white/70 text-[10px] mt-1">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-white/60">{format(parseISO(item.date), 'MMM d')}</span>
              <StatusBadge status={item.status} />
            </div>
          </div>
          <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 text-white/80">
            <Heart className="h-5 w-5" /><MessageCircle className="h-5 w-5" /><Bookmark className="h-5 w-5" /><Share2 className="h-5 w-5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function XFeedPreview({ items, onItemClick }: { items: ScheduleItem[]; onItemClick?: (item: ScheduleItem) => void }) {
  return (
    <div className="divide-y divide-border/30">
      {items.map((item) => (
        <div key={item.id} className="p-3 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => onItemClick?.(item)}>
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold shrink-0">S</div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold">STU25</span>
                <span className="text-xs text-muted-foreground">@STU25 · {format(parseISO(item.date), 'MMM d')}</span>
              </div>
              <p className="text-sm">{item.caption}</p>
              {item.hashtags?.length > 0 && (
                <p className="text-xs text-sky-500">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
              )}
              {(item.type === 'image' || item.type === 'video') && (
                item.media_url ? (
                  <img src={item.media_url} alt="" className="w-full rounded-xl max-h-48 object-cover mt-2 border border-border/30" />
                ) : (
                  <div className="w-full h-32 rounded-xl mt-2 overflow-hidden"><MediaPlaceholder item={item} /></div>
                )
              )}
              <div className="flex items-center justify-between text-muted-foreground pt-1 max-w-xs">
                <MessageCircle className="h-3.5 w-3.5" /><Repeat2 className="h-3.5 w-3.5" />
                <Heart className="h-3.5 w-3.5" /><Eye className="h-3.5 w-3.5" /><Share2 className="h-3.5 w-3.5" />
              </div>
              <StatusBadge status={item.status} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptySchedule({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <CalendarPlus className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No Content Plan Yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Tell Cortex about your brand and goals — it'll ask the right questions before building your schedule.
        </p>
      </div>
      <Button onClick={onGenerate} className="gap-2">
        <Sparkles className="h-4 w-4" />
        Start Planning with Cortex
      </Button>
    </div>
  );
}

// ─── Cortex Chat Panel (synced with Telegram via smm_conversations table) ───
function CortexChat({ profileId, platform, onPlanCreated }: { profileId: string; platform: string; onPlanCreated: () => void }) {
  const [messages, setMessages] = useState<{ id?: string; role: string; text: string; source?: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing conversation from shared table
  useEffect(() => {
    const loadConversation = async () => {
      const { data } = await supabase
        .from('smm_conversations')
        .select('id, role, message, source, created_at')
        .eq('profile_username', profileId)
        .eq('platform', platform)
        .order('created_at', { ascending: true })
        .limit(50);
      if (data) {
        setMessages(data.map(m => ({ id: m.id, role: m.role, text: m.message, source: m.source })));
      }
      setInitialLoaded(true);
    };
    loadConversation();
  }, [profileId, platform]);

  // Subscribe to realtime updates (Telegram messages appear instantly)
  useEffect(() => {
    const channel = supabase
      .channel(`smm-conv-${profileId}-${platform}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'smm_conversations',
        filter: `profile_username=eq.${profileId}`,
      }, (payload: any) => {
        const row = payload.new;
        if (row.platform !== platform) return;
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === row.id)) return prev;
          return [...prev, { id: row.id, role: row.role, text: row.message, source: row.source }];
        });
        // If a content plan was created from Telegram, refresh plans
        if (row.role === 'cortex' && row.meta?.type === 'content_plan') {
          onPlanCreated();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, platform, onPlanCreated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    // 1. Save user message to shared table
    const { data: inserted } = await supabase.from('smm_conversations').insert({
      profile_username: profileId,
      platform,
      source: 'web',
      role: 'user',
      message: msg,
    }).select('id').single();

    const userMsg = { id: inserted?.id, role: 'user', text: msg, source: 'web' };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build history from all messages
      const history = messages.map(m => ({
        role: m.role === 'cortex' ? 'assistant' : m.role,
        text: m.text,
      }));
      history.push({ role: 'user', text: msg });

      const { data, error } = await supabase.functions.invoke('smm-scheduler', {
        body: { prompt: msg, profile: profileId, history },
      });

      if (error) throw error;

      let responseText = '';
      if (data?.type === 'clarify') {
        responseText = data.message;
      } else if (data?.type === 'content_plan') {
        responseText = `✅ ${data.message}`;
        onPlanCreated();
      } else if (data?.type === 'message') {
        responseText = data.message;
      } else {
        responseText = data?.message || 'Done.';
      }

      // 2. Save cortex response to shared table
      const { data: cortexInserted } = await supabase.from('smm_conversations').insert({
        profile_username: profileId,
        platform,
        source: 'web',
        role: 'cortex',
        message: responseText,
        meta: { type: data?.type || 'message' },
      }).select('id').single();

      setMessages(prev => [...prev, { id: cortexInserted?.id, role: 'cortex', text: responseText, source: 'web' }]);
    } catch (e: any) {
      const errorText = `❌ Error: ${e.message}`;
      setMessages(prev => [...prev, { role: 'cortex', text: errorText, source: 'web' }]);
    }
    setLoading(false);
  };

  return (
    <Card className="flex flex-col h-[400px]">
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Cortex — SMM Strategist</span>
        <Badge variant="outline" className="text-[9px] ml-auto">{platform}</Badge>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {!initialLoaded ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-xs text-muted-foreground">👋 Tell Cortex about your brand and what you want to schedule.</p>
            <p className="text-[10px] text-muted-foreground">💬 Conversations sync in real-time with Telegram</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {[
                'Create a week of Instagram content for my restaurant',
                'Plan 7 days of TikTok videos for a fitness brand',
                'Schedule a content plan for my tech startup on X',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => send(suggestion)}
                  className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            }`}>
              {msg.source === 'telegram' && (
                <span className="text-[9px] opacity-60 block mb-0.5">via Telegram</span>
              )}
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-border/50 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Tell Cortex about your brand…"
          className="text-xs h-8"
          disabled={loading}
        />
        <Button size="sm" onClick={() => send()} disabled={loading || !input.trim()} className="h-8 px-3">
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

// ─── Main Component ───
export default function SMMSchedule({ profiles }: { profiles: SMMProfile[] }) {
  const { profileId } = useSMMContext();
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlatform, setActivePlatform] = useState('instagram');
  const [pushingLive, setPushingLive] = useState(false);

  const [resetting, setResetting] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const handleItemClick = (item: ScheduleItem) => {
    setEditingItem(item);
    setEditModalOpen(true);
  };

  const fetchPlans = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const { data } = await supabase
      .from('smm_content_plans')
      .select('*')
      .eq('profile_username', profileId)
      .order('created_at', { ascending: false });
    setPlans((data as any[]) || []);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel('smm-content-plans')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'smm_content_plans', filter: `profile_username=eq.${profileId}` },
        () => { fetchPlans(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, fetchPlans]);

  const currentPlan = plans.find(p => p.platform === activePlatform);
  const items = (currentPlan?.schedule_items || []) as ScheduleItem[];
  const isDraft = currentPlan?.status === 'draft';
  const isLive = currentPlan?.status === 'live';

  const handleSaveItem = async (updated: ScheduleItem) => {
    if (!currentPlan) return;
    const newItems = items.map(i => i.id === updated.id ? updated : i);
    const { error } = await supabase
      .from('smm_content_plans')
      .update({ schedule_items: newItems as any, updated_at: new Date().toISOString() } as any)
      .eq('id', currentPlan.id);
    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      toast.success('Schedule item updated.');
      await fetchPlans();
    }
  };

  const [generating, setGenerating] = useState(false);

  const triggerMediaGen = async (planId: string, dates?: string[]) => {
    setGenerating(true);
    try {
      const body: any = { plan_id: planId };
      if (dates) body.force_dates = dates;
      const { data, error } = await supabase.functions.invoke('smm-media-gen', { body });
      if (error) throw error;
      toast.success(`🎨 ${data?.message || 'Media generation triggered'}`);
      await fetchPlans();
    } catch (e: any) {
      toast.error(`Media gen failed: ${e.message}`);
    }
    setGenerating(false);
  };

  const getFullWeekDates = (): string[] => {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  const handlePushLive = async () => {
    if (!currentPlan) return;
    setPushingLive(true);
    try {
      // 1. Mark the plan as live
      const { error } = await supabase
        .from('smm_content_plans')
        .update({ status: 'live' } as any)
        .eq('id', currentPlan.id);
      if (error) throw error;

      // 2. Create calendar events for each schedule item
      const calendarEvents = items.map(item => {
        const startTime = item.time
          ? `${item.date}T${item.time}:00`
          : `${item.date}T12:00:00`;
        return {
          title: `📱 [${currentPlan.platform.toUpperCase()}] ${item.caption?.substring(0, 60) || item.type}`,
          description: `${item.caption || ''}\n\nType: ${item.type}\nHashtags: ${(item.hashtags || []).join(' ')}\nPlan: ${currentPlan.plan_name}`,
          start_time: startTime,
          end_time: new Date(new Date(startTime).getTime() + 30 * 60000).toISOString(),
          source: 'smm',
          source_id: item.id,
          category: 'smm',
          color: currentPlan.platform === 'instagram' ? '#E1306C' :
                 currentPlan.platform === 'facebook' ? '#1877F2' :
                 currentPlan.platform === 'tiktok' ? '#010101' :
                 currentPlan.platform === 'x' ? '#1DA1F2' : '#3b82f6',
        };
      });

      if (calendarEvents.length > 0) {
        const { error: calError } = await supabase
          .from('calendar_events')
          .insert(calendarEvents);
        if (calError) console.error('Calendar insert error:', calError);
      }

      // 3. Schedule each post to the social media platform via Upload-Post API
      const apiPlatform = currentPlan.platform === 'twitter' ? 'x' : currentPlan.platform;
      let scheduled = 0;
      let failed = 0;

      for (const item of items) {
        // Skip items that aren't ready (no media for image/video types)
        if (item.type !== 'text' && !item.media_url) {
          console.warn(`[push-live] Skipping item ${item.id} — no media_url`);
          failed++;
          continue;
        }

        try {
          const scheduledDate = item.time
            ? `${item.date}T${item.time}:00`
            : `${item.date}T12:00:00`;

          // Build post title from caption + hashtags
          const hashtagStr = (item.hashtags || []).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
          const title = item.caption
            ? `${item.caption}${hashtagStr ? '\n\n' + hashtagStr : ''}`
            : hashtagStr || item.type;

          // Determine the post type for Upload-Post API
          let postType: 'text' | 'video' | 'photos' | 'document' = 'text';
          if (item.type === 'video') postType = 'video';
          else if (item.type === 'image' || item.type === 'carousel') postType = 'photos';

          await smmApi.createPost({
            user: currentPlan.profile_username,
            type: postType,
            platforms: [apiPlatform as any],
            title,
            media_url: item.media_url,
            scheduled_date: scheduledDate,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });

          scheduled++;
        } catch (postErr: any) {
          console.error(`[push-live] Failed to schedule item ${item.id}:`, postErr);
          failed++;
        }
      }

      const summary = [];
      summary.push(`${calendarEvents.length} calendar events added`);
      if (scheduled > 0) summary.push(`${scheduled} post(s) scheduled to ${currentPlan.platform}`);
      if (failed > 0) summary.push(`${failed} failed`);

      toast.success(`🟢 Schedule is LIVE! ${summary.join(', ')}.`);
      await fetchPlans();

    } catch (e: any) {
      toast.error(`Failed to push live: ${e.message}`);
    }
    setPushingLive(false);
  };

  const handleReset = async () => {
    if (!profileId) return;
    setResetting(true);
    try {
      const platformsToReset = ['instagram', 'facebook', 'tiktok', 'x'];
      const { error } = await supabase
        .from('smm_content_plans')
        .delete()
        .eq('profile_username', profileId)
        .in('platform', platformsToReset);
      if (error) throw error;
      toast.success('Content schedule reset — all platform plans cleared.');
      await fetchPlans();
    } catch (e: any) {
      toast.error(`Failed to reset: ${e.message}`);
    }
    setResetting(false);
  };

  const todayItems = items.filter(i => { try { return isToday(parseISO(i.date)); } catch { return false; } });
  const upcomingItems = items.filter(i => { try { return !isToday(parseISO(i.date)); } catch { return true; } });

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const meta = PLATFORM_META[platform === 'x' ? 'twitter' : platform];
    if (!meta?.icon) return null;
    const Icon = meta.icon;
    return <Icon className="h-4 w-4" />;
  };

  const readyCount = items.filter(i => i.status === 'ready').length;
  const draftCount = items.filter(i => i.status === 'draft').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Content Schedule</h2>
          <p className="text-xs text-muted-foreground">
            {currentPlan ? (
              <>
                {currentPlan.plan_name}
                {isDraft && <span className="ml-2 text-yellow-600">● Draft — review & push live</span>}
                {isLive && <span className="ml-2 text-green-600">● Live</span>}
              </>
            ) : 'Chat with Cortex to build your content strategy'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPlans} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          {/* Reset Button */}
          {plans.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" disabled={resetting}>
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Content Schedule?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all content plans for Instagram, Facebook, TikTok, and X. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, Reset All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* ─── GENERATE AI BUTTON (draft or live) ─── */}
          {currentPlan && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-purple-500/30 text-purple-600 hover:bg-purple-500/10"
              disabled={generating}
              onClick={() => currentPlan && triggerMediaGen(currentPlan.id, getFullWeekDates())}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" />}
              Generate AI
            </Button>
          )}

          {/* ─── PUSH LIVE BUTTON ─── */}
          {currentPlan && isDraft && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  disabled={pushingLive}
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 font-bold"
                >
                  {pushingLive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  PUSH LIVE
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Push Schedule Live?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will push the {currentPlan.platform} content schedule live and add {items.length} post{items.length !== 1 ? 's' : ''} to your calendar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePushLive} className="bg-green-600 hover:bg-green-700 text-white">
                    Yes, Push Live
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {isLive && (
            <Badge className="bg-green-600 text-white text-[10px] gap-1">
              <CheckCircle2 className="h-3 w-3" /> LIVE
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activePlatform} onValueChange={setActivePlatform}>
        <TabsList className="w-full justify-start">
          {SCHEDULE_PLATFORMS.map(p => (
            <TabsTrigger key={p.value} value={p.value} className="gap-1.5 text-xs">
              <PlatformIcon platform={p.value} />
              {p.label}
              {plans.find(pl => pl.platform === p.value) && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {SCHEDULE_PLATFORMS.map(p => (
          <TabsContent key={p.value} value={p.value}>
            {loading ? (
              <div className="space-y-3 p-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <EmptySchedule onGenerate={() => {}} />
                <CortexChat profileId={profileId || 'STU25'} platform={p.value} onPlanCreated={fetchPlans} />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Platform Preview */}
                <div className="lg:col-span-2 rounded-xl border border-border/50 bg-card overflow-hidden max-h-[700px] overflow-y-auto">
                  {p.value === 'instagram' && <InstagramFeedPreview items={items} onItemClick={handleItemClick} />}
                  {p.value === 'facebook' && <FacebookFeedPreview items={items} onItemClick={handleItemClick} />}
                  {p.value === 'tiktok' && <TikTokFeedPreview items={items} onItemClick={handleItemClick} />}
                  {p.value === 'x' && <XFeedPreview items={items} onItemClick={handleItemClick} />}
                </div>

                {/* Sidebar */}
                <div className="space-y-3">
                  {/* Cortex Chat */}
                  <CortexChat profileId={profileId || 'STU25'} platform={p.value} onPlanCreated={fetchPlans} />

                  {/* Brand Context */}
                  {currentPlan?.brand_context?.niche && (
                    <Card className="p-3 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brand Context</h4>
                      <div className="space-y-1 text-xs">
                        {currentPlan.brand_context.niche && <p><span className="font-medium">Niche:</span> {currentPlan.brand_context.niche}</p>}
                        {currentPlan.brand_context.voice && <p><span className="font-medium">Voice:</span> {currentPlan.brand_context.voice}</p>}
                        {currentPlan.brand_context.audience && <p><span className="font-medium">Audience:</span> {currentPlan.brand_context.audience}</p>}
                        {currentPlan.brand_context.keywords && currentPlan.brand_context.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {currentPlan.brand_context.keywords.map((k: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  {/* Timeline */}
                  <Card className="p-3 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeline</h4>
                    {todayItems.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-primary mb-1">Today</p>
                        {todayItems.map(item => <TimelineItem key={item.id} item={item} />)}
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">Upcoming</p>
                      {upcomingItems.map(item => <TimelineItem key={item.id} item={item} />)}
                    </div>
                  </Card>

                  {/* Stats */}
                  <Card className="p-3 space-y-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stats</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{items.length}</p>
                        <p className="text-muted-foreground">Total</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{draftCount}</p>
                        <p className="text-muted-foreground">Templates</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{readyCount}</p>
                        <p className="text-muted-foreground">Ready</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{items.filter(i => i.type === 'video').length}</p>
                        <p className="text-muted-foreground">Videos</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ScheduleItemModal
        item={editingItem}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSave={handleSaveItem}
      />
    </div>
  );
}

function TimelineItem({ item }: { item: ScheduleItem }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-l-2 border-border pl-2 ml-1">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate">{item.caption?.substring(0, 50)}…</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {format(parseISO(item.date), 'MMM d')} {item.time || ''}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0">{item.type}</Badge>
          <StatusBadge status={item.status} />
        </div>
      </div>
    </div>
  );
}
