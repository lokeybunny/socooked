import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSMMContext, PLATFORM_META } from '@/lib/smm/context';
import { smmApi } from '@/lib/smm/store';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
  ChevronLeft, ChevronRight, ImagePlus, X, Rocket, TrendingUp,
  Save, FolderOpen,
} from 'lucide-react';
import { uploadToStorage } from '@/lib/storage';
import VideoThumbnail from '@/components/ui/VideoThumbnail';
import type { SMMProfile } from '@/lib/smm/types';
import { format, parseISO, isToday, differenceInHours } from 'date-fns';

// ─── Types ───
export interface BoostService {
  service_id: string;
  service_name: string;
  quantity: number;
  rate?: string;
}

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
  favorited?: boolean;
  boost_services?: BoostService[];
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
    reference_images?: string[];
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

// ─── Favorite Style Checkmark ───
function FavoriteCheckmark({ 
  itemId, favorited, onToggle 
}: { 
  itemId: string; favorited: boolean; onToggle: (id: string) => void 
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(itemId); }}
      className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${
        favorited
          ? 'bg-green-500 text-white shadow-lg shadow-green-500/40 scale-110'
          : 'bg-black/40 text-white/60 hover:bg-black/60 hover:text-white hover:scale-105'
      }`}
      title={favorited ? 'Style favorited — AI will copy this style' : 'Mark as favorite style'}
    >
      <CheckCircle2 className={`h-4 w-4 ${favorited ? 'fill-white' : ''}`} />
    </button>
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
// ─── Boost Service Picker ───
function BoostServicePicker({
  selectedServices, onServicesChange, platform, profileUsername, onApplyToAll,
}: {
  selectedServices: BoostService[];
  onServicesChange: (services: BoostService[]) => void;
  platform?: string;
  profileUsername?: string;
  onApplyToAll?: (services: BoostService[]) => void;
}) {
  const [allServices, setAllServices] = useState<any[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [presets, setPresets] = useState<{ id: string; preset_name: string; services: BoostService[] }[]>([]);
  const [presetName, setPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [showPresetInput, setShowPresetInput] = useState(false);

  const fetchServices = async () => {
    if (loaded) return;
    setLoadingServices(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/darkside-smm?action=services`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAllServices(json.data);
      } else if (Array.isArray(json.data)) {
        setAllServices(json.data);
      }
    } catch (e) {
      console.error('Failed to fetch Darkside services:', e);
    }
    setLoadingServices(false);
    setLoaded(true);
  };

  const fetchPresets = async () => {
    const { data } = await supabase
      .from('smm_boost_presets')
      .select('id, preset_name, services')
      .eq('profile_username', profileUsername || 'STU25')
      .order('created_at', { ascending: false });
    if (data) setPresets(data as any);
  };

  useEffect(() => { fetchPresets(); }, [profileUsername]);

  const handleSavePreset = async () => {
    if (!presetName.trim() || selectedServices.length === 0) return;
    setSavingPreset(true);
    const { error } = await supabase.from('smm_boost_presets').insert({
      profile_username: profileUsername || 'STU25',
      preset_name: presetName.trim(),
      services: selectedServices as any,
    } as any);
    if (error) {
      toast.error('Failed to save preset');
    } else {
      toast.success(`Preset "${presetName.trim()}" saved!`);
      setPresetName('');
      setShowPresetInput(false);
      fetchPresets();
    }
    setSavingPreset(false);
  };

  const handleLoadPreset = (preset: typeof presets[0]) => {
    onServicesChange(preset.services);
    setExpanded(true);
    fetchServices();
    toast.success(`Loaded preset "${preset.preset_name}"`);
  };

  const handleDeletePreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('smm_boost_presets').delete().eq('id', id);
    toast('Preset deleted');
    fetchPresets();
  };

  // Filter services by platform keyword
  const filteredServices = useMemo(() => {
    let filtered = allServices;
    if (platform) {
      const pf = platform.toLowerCase();
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(pf) ||
        s.category?.toLowerCase().includes(pf)
      );
      if (filtered.length === 0) filtered = allServices;
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q)
      );
    }
    return filtered.slice(0, 30);
  }, [allServices, platform, search]);

  const toggleService = (svc: any) => {
    const existing = selectedServices.find(s => s.service_id === String(svc.service));
    if (existing) {
      onServicesChange(selectedServices.filter(s => s.service_id !== String(svc.service)));
    } else {
      onServicesChange([...selectedServices, {
        service_id: String(svc.service),
        service_name: svc.name || `Service #${svc.service}`,
        quantity: Number(svc.min) || 100,
        rate: svc.rate,
      }]);
    }
  };

  const updateQuantity = (serviceId: string, quantity: number) => {
    onServicesChange(selectedServices.map(s =>
      s.service_id === serviceId ? { ...s, quantity } : s
    ));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs">
          <Rocket className="h-3.5 w-3.5 text-primary" />
          Auto-Boost Services
        </Label>
        <Switch checked={expanded} onCheckedChange={(v) => { setExpanded(v); if (v) fetchServices(); }} />
      </div>

      {/* Presets bar */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map(p => (
            <Badge
              key={p.id}
              variant="outline"
              className="text-[10px] gap-1 cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => handleLoadPreset(p)}
            >
              <FolderOpen className="h-2.5 w-2.5" />
              {p.preset_name} ({(p.services as BoostService[]).length})
              <button
                onClick={(e) => handleDeletePreset(p.id, e)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {selectedServices.length > 0 && !expanded && (
        <div className="flex flex-wrap gap-1">
          {selectedServices.map(s => (
            <Badge key={s.service_id} variant="secondary" className="text-[10px] gap-1">
              <TrendingUp className="h-2.5 w-2.5" />
              {s.service_name.substring(0, 30)} × {s.quantity}
              <button onClick={() => onServicesChange(selectedServices.filter(x => x.service_id !== s.service_id))} className="ml-1 hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {expanded && (
        <div className="border border-border/50 rounded-lg p-2 space-y-2 max-h-[60vh] overflow-y-auto bg-muted/20">
          <Input
            placeholder="Search services…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-7 text-xs"
          />

          {loadingServices ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground ml-2">Loading services…</span>
            </div>
          ) : filteredServices.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No services found</p>
          ) : (
            filteredServices.map(svc => {
              const isSelected = selectedServices.some(s => s.service_id === String(svc.service));
              const selected = selectedServices.find(s => s.service_id === String(svc.service));
              return (
                <div
                  key={svc.service}
                  className={`flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => toggleService(svc)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-[11px]">{svc.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      ${svc.rate}/1k · Min: {svc.min} · Max: {svc.max}
                    </p>
                  </div>
                  {isSelected && selected && (
                    <Input
                      type="number"
                      value={selected.quantity}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); updateQuantity(String(svc.service), Number(e.target.value)); }}
                      min={Number(svc.min) || 1}
                      max={Number(svc.max) || 100000}
                      className="w-20 h-6 text-[10px]"
                    />
                  )}
                  <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground/30'}`} />
                </div>
              );
            })
          )}
        </div>
      )}

      {selectedServices.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20">
            <span className="text-xs font-medium text-muted-foreground">
              {selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} selected
            </span>
            <span className="text-sm font-semibold text-primary">
              Est. ${selectedServices.reduce((sum, s) => sum + (s.quantity / 1000) * Number(s.rate || 0), 0).toFixed(2)}
            </span>
          </div>

          <div className="flex gap-1.5">
            {/* Save as preset */}
            {showPresetInput ? (
              <div className="flex gap-1 flex-1">
                <Input
                  placeholder="Preset name…"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  className="h-7 text-xs flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                />
                <Button size="sm" variant="secondary" className="h-7 text-xs gap-1 px-2" onClick={handleSavePreset} disabled={savingPreset || !presetName.trim()}>
                  {savingPreset ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setShowPresetInput(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1" onClick={() => setShowPresetInput(true)}>
                <Save className="h-3 w-3" /> Save as Preset
              </Button>
            )}

            {/* Apply to all posts */}
            {onApplyToAll && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 flex-1"
                onClick={() => {
                  onApplyToAll(selectedServices);
                  toast.success(`Applied boost to all posts`);
                }}
              >
                <Zap className="h-3 w-3" /> Apply to All Posts
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleItemModal({
  item, open, onOpenChange, onSave, planIsLive, plan, onApplyBoostToAll,
}: {
  item: ScheduleItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated: ScheduleItem) => void;
  planIsLive?: boolean;
  plan?: ContentPlan | null;
  onApplyBoostToAll?: (services: BoostService[]) => void;
}) {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<ScheduleItem['type']>('image');
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [pushingSingle, setPushingSingle] = useState(false);
  const [boostServices, setBoostServices] = useState<BoostService[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setCaption(item.caption || '');
      setHashtags((item.hashtags || []).join(', '));
      setDate(item.date || '');
      setTime(item.time || '');
      setType(item.type);
      setMediaUrl(item.media_url);
      setBoostServices(item.boost_services || []);
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
    onSave({ ...item, caption, hashtags: parsed, date, time, type, media_url: mediaUrl, boost_services: boostServices });
    onOpenChange(false);
  };

  const handlePushSingleLive = async () => {
    if (!item || !plan) return;
    // First save changes
    const parsed = hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean);
    const updated = { ...item, caption, hashtags: parsed, date, time, type, media_url: mediaUrl };
    onSave(updated);

    setPushingSingle(true);
    try {
      const apiPlatform = plan.platform === 'twitter' ? 'x' : plan.platform;
      const scheduledDate = time ? `${date}T${time}:00` : `${date}T12:00:00`;
      const hashtagStr = parsed.map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
      const title = caption
        ? `${caption}${hashtagStr ? '\n\n' + hashtagStr : ''}`
        : hashtagStr || type;

      // Determine post type
      const isActualVideo = mediaUrl && (
        mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov') ||
        mediaUrl.endsWith('.webm') || mediaUrl.includes('higgsfield')
      );
      let postType: 'text' | 'video' | 'photos' | 'document' = 'text';
      if (type === 'video' && isActualVideo) postType = 'video';
      else if (type === 'video' || type === 'image' || type === 'carousel') postType = 'photos';

      // Skip if no media for non-text types
      if (postType !== 'text' && !mediaUrl) {
        toast.error('No media attached — upload or generate media first.');
        setPushingSingle(false);
        return;
      }

      await smmApi.createPost({
        user: plan.profile_username,
        type: postType,
        platforms: [apiPlatform as any],
        title,
        media_url: mediaUrl,
        scheduled_date: scheduledDate,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      toast.success('✅ Post re-pushed live! The updated version will replace the existing one on schedule.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Failed to push: ${e.message}`);
    }
    setPushingSingle(false);
  };

  // Only use <video> tag if the URL is actually a video file, not a fallback image
  const isActualVideo = mediaUrl && /\.(mp4|mov|webm|m3u8)/i.test(mediaUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

          {/* Boost Services Picker */}
          <BoostServicePicker
            selectedServices={boostServices}
            onServicesChange={setBoostServices}
            platform={plan?.platform}
            profileUsername={plan?.profile_username}
            onApplyToAll={onApplyBoostToAll}
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {planIsLive && (
            <Button
              onClick={handlePushSingleLive}
              disabled={uploading || pushingSingle}
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            >
              {pushingSingle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Re-push Live
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} className="gap-1.5" disabled={uploading}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Platform Feed Renderers ───

function InstagramFeedPreview({ items, onItemClick, onToggleFavorite, profileUsername }: { items: ScheduleItem[]; onItemClick?: (item: ScheduleItem) => void; onToggleFavorite: (id: string) => void; profileUsername: string }) {
  return (
    <div className="space-y-0">
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold">{profileUsername.charAt(0).toUpperCase()}</div>
        <span className="text-sm font-semibold text-foreground">{profileUsername}</span>
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
              {item.media_url && <FavoriteCheckmark itemId={item.id} favorited={!!item.favorited} onToggle={onToggleFavorite} />}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs">
                <Pencil className="h-4 w-4" />
              </div>
            </div>
            <div className="px-1 py-1.5 space-y-0.5">
              <p className="text-[10px] leading-tight line-clamp-2"><span className="font-semibold">{profileUsername}</span> {item.caption}</p>
              <p className="text-[9px] text-muted-foreground">{format(parseISO(item.date), 'MMM d')} · {item.type}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FacebookFeedPreview({ items, onItemClick, onToggleFavorite, profileUsername }: { items: ScheduleItem[]; onItemClick?: (item: ScheduleItem) => void; onToggleFavorite: (id: string) => void; profileUsername: string }) {
  return (
    <div className="space-y-3 p-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-border/50 bg-card overflow-hidden cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onItemClick?.(item)}>
          <div className="flex items-center gap-2 p-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">{profileUsername.charAt(0).toUpperCase()}</div>
            <div>
              <p className="text-xs font-semibold">{profileUsername}</p>
              <p className="text-[10px] text-muted-foreground">{format(parseISO(item.date), 'MMM d')} · 🌐</p>
            </div>
            <MoreHorizontal className="h-4 w-4 text-muted-foreground ml-auto" />
          </div>
          <p className="px-3 pb-2 text-xs">{item.caption}</p>
          <div className="relative">
            {item.media_url ? (
              <img src={item.media_url} alt="" className="w-full max-h-52 object-cover" />
            ) : item.type !== 'text' ? (
              <div className="w-full h-36"><MediaPlaceholder item={item} /></div>
            ) : null}
            {item.media_url && <FavoriteCheckmark itemId={item.id} favorited={!!item.favorited} onToggle={onToggleFavorite} />}
          </div>
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

function TikTokVideoCard({ item, onItemClick, onToggleFavorite, profileUsername }: { item: ScheduleItem; onItemClick?: (item: ScheduleItem) => void; onToggleFavorite: (id: string) => void; profileUsername: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [userClicked, setUserClicked] = useState(false);

  const isVideo = item.type === 'video' && item.media_url && /\.(mp4|mov|webm|m3u8)/i.test(item.media_url);

  const handleMouseEnter = () => {
    if (isVideo && videoRef.current && !paused) {
      videoRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (isVideo && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.muted = true;
      setPlaying(false);
      setPaused(false);
      setUserClicked(false);
    }
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isVideo || !videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.muted = false;
      setUserClicked(true);
      videoRef.current.play().then(() => { setPlaying(true); setPaused(false); }).catch(() => {});
    } else {
      videoRef.current.pause();
      setPlaying(false);
      setPaused(true);
    }
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[400px]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {item.media_url ? (
        isVideo ? (
          <div className="w-full h-full relative cursor-pointer" onClick={handleVideoClick}>
            <video
              ref={videoRef}
              src={item.media_url}
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            />
            {(!playing || paused) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Play className="h-10 w-10 text-white/80 drop-shadow-lg" fill="white" />
              </div>
            )}
          </div>
        ) : (
          <img src={item.media_url} alt="" className="w-full h-full object-cover" />
        )
      ) : (
        <div className="w-full h-full"><MediaPlaceholder item={item} /></div>
      )}
      {item.media_url && <FavoriteCheckmark itemId={item.id} favorited={!!item.favorited} onToggle={onToggleFavorite} />}
      <button
        onClick={(e) => { e.stopPropagation(); onItemClick?.(item); }}
        className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-all"
        title="Edit post"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <p className="text-white text-xs font-semibold mb-1">@{profileUsername}</p>
        <p className="text-white/90 text-[11px] line-clamp-2">{item.caption}</p>
        {item.hashtags?.length > 0 && (
          <p className="text-white/70 text-[10px] mt-1">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-white/60">{format(parseISO(item.date), 'MMM d')}</span>
          <StatusBadge status={item.status} />
        </div>
      </div>
      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 text-white/80 pointer-events-none">
        <Heart className="h-5 w-5" /><MessageCircle className="h-5 w-5" /><Bookmark className="h-5 w-5" /><Share2 className="h-5 w-5" />
      </div>
    </div>
  );
}

function TikTokFeedPreview({ items, onItemClick, onToggleFavorite, profileUsername }: { items: ScheduleItem[]; onItemClick?: (item: ScheduleItem) => void; onToggleFavorite: (id: string) => void; profileUsername: string }) {
  return (
    <div className="space-y-3 p-3">
      {items.map((item) => (
        <TikTokVideoCard key={item.id} item={item} onItemClick={onItemClick} onToggleFavorite={onToggleFavorite} profileUsername={profileUsername} />
      ))}
    </div>
  );
}

function XFeedPreview({ items, onItemClick, onToggleFavorite, profileUsername }: { items: ScheduleItem[]; onItemClick?: (item: ScheduleItem) => void; onToggleFavorite: (id: string) => void; profileUsername: string }) {
  return (
    <div className="divide-y divide-border/30">
      {items.map((item) => (
        <div key={item.id} className="p-3 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => onItemClick?.(item)}>
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold shrink-0">{profileUsername.charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold">{profileUsername}</span>
                <span className="text-xs text-muted-foreground">@{profileUsername} · {format(parseISO(item.date), 'MMM d')}</span>
              </div>
              <p className="text-sm">{item.caption}</p>
              {item.hashtags?.length > 0 && (
                <p className="text-xs text-sky-500">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
              )}
              {(item.type === 'image' || item.type === 'video') && (
                <div className="relative">
                  {item.media_url ? (
                    item.type === 'video' && /\.(mp4|mov|webm|m3u8)/i.test(item.media_url) ? (
                      <VideoThumbnail src={item.media_url} title={item.caption} className="w-full rounded-xl max-h-48 mt-2 border border-border/30" videoClassName="w-full rounded-xl max-h-48 object-cover" controls={false} />
                    ) : (
                      <img src={item.media_url} alt="" className="w-full rounded-xl max-h-48 object-cover mt-2 border border-border/30" />
                    )
                  ) : (
                    <div className="w-full h-32 rounded-xl mt-2 overflow-hidden"><MediaPlaceholder item={item} /></div>
                  )}
                  {item.media_url && <FavoriteCheckmark itemId={item.id} favorited={!!item.favorited} onToggle={onToggleFavorite} />}
                </div>
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

// ─── Custom Brand Images Dialog ───
function CustomBrandDialog({
  open,
  onOpenChange,
  profileId,
  currentPlan,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string;
  currentPlan: ContentPlan | null;
  onUpdated: () => void;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Load existing reference images from brand_context
  useEffect(() => {
    if (open && currentPlan?.brand_context?.reference_images) {
      setImages((currentPlan.brand_context as any).reference_images || []);
    } else if (open) {
      setImages([]);
    }
  }, [open, currentPlan]);

  const handleFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) { toast.error('Only image files are allowed'); return; }
    setUploading(true);
    const newUrls: string[] = [];
    for (const file of imageFiles) {
      try {
        const url = await uploadToStorage(file, {
          category: 'smm-brand',
          customerName: profileId,
          source: 'custom-brand',
          fileName: file.name,
        });
        newUrls.push(url);
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.message}`);
      }
    }
    if (newUrls.length > 0) {
      setImages(prev => [...prev, ...newUrls]);
      toast.success(`${newUrls.length} image(s) uploaded`);
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const handleRemoveImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!currentPlan) {
      // Save as standalone brand context if no plan exists yet
      // Store in content_assets as brand reference images
      for (const url of images) {
        await supabase.from('content_assets').insert({
          title: `Brand Reference — ${profileId}`,
          type: 'image',
          url,
          source: 'custom-brand',
          folder: `Brand References/${profileId}`,
          status: 'published',
          tags: ['brand-reference', profileId],
        });
      }
      toast.success('Brand images saved to content library');
      onOpenChange(false);
      return;
    }

    // Update brand_context with reference_images
    const updatedContext = {
      ...(currentPlan.brand_context || {}),
      reference_images: images,
    };
    const { error } = await supabase
      .from('smm_content_plans')
      .update({ brand_context: updatedContext as any, updated_at: new Date().toISOString() } as any)
      .eq('id', currentPlan.id);
    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      toast.success(`${images.length} brand reference image(s) saved — Banana2 will use these for content generation.`);
      onUpdated();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4" /> Custom Brand Images
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Upload images of your brand (products, locations, team, etc.). These will be used as reference images
          with Banana2 AI to generate branded content with different angles, locations, and advertisements for your niche.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
            dragging ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/30'
          }`}
          onClick={() => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'image/*';
            inp.multiple = true;
            inp.onchange = (e) => {
              const files = (e.target as HTMLInputElement).files;
              if (files) handleFiles(files);
            };
            inp.click();
          }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Uploading…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Drag & drop images here, or click to browse</span>
            </div>
          )}
        </div>

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {images.map((url, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-border/50">
                <AspectRatio ratio={1}>
                  <img src={url} alt={`Brand ${idx + 1}`} className="w-full h-full object-cover" />
                </AspectRatio>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveImage(idx); }}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="gap-1.5" disabled={uploading}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Save {images.length} Image{images.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cortex Chat Panel (synced with Telegram via smm_conversations table) ───
const NYSONBLACK_CUSTOMER_ID = '42be9e81-3b78-4d28-9a25-3b01ba466948';
const CORTEX_ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,audio/mpeg,audio/mp3,audio/wav';

interface PendingMedia {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  contentAssetId?: string;
}

function CortexChat({ profileId, platform, onPlanCreated }: { profileId: string; platform: string; onPlanCreated: () => void }) {
  const [messages, setMessages] = useState<{ id?: string; role: string; text: string; source?: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          if (prev.some(m => m.id === row.id)) return prev;
          return [...prev, { id: row.id, role: row.role, text: row.message, source: row.source }];
        });
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

  // ─── File upload handler ───
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);

    const uploaded: PendingMedia[] = [];
    for (const file of files) {
      const assetType: 'image' | 'video' | 'audio' = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
      try {
        const url = await uploadToStorage(file, {
          category: 'ai-generated',
          customerName: 'NysonBlack',
          source: 'cortex-strategist',
          fileName: file.name,
        });
        // Save to content_assets under AI Generated for NysonBlack
        const { data: caData } = await supabase.from('content_assets').insert({
          title: file.name,
          type: assetType,
          url,
          status: 'ready',
          category: 'ai-generated',
          source: 'cortex-strategist',
          customer_id: NYSONBLACK_CUSTOMER_ID,
          tags: ['smm', profileId],
        }).select('id').single();

        uploaded.push({
          id: crypto.randomUUID(),
          name: file.name,
          url,
          type: assetType,
          contentAssetId: caData?.id,
        });
      } catch (err: any) {
        toast.error(`Upload failed: ${file.name} — ${err.message}`);
      }
    }

    if (uploaded.length > 0) {
      setPendingMedia(prev => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded & saved to content library`);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [profileId]);

  const removePending = (id: string) => setPendingMedia(prev => prev.filter(f => f.id !== id));

  const send = async (text?: string) => {
    const msg = text || input.trim();
    const hasMedia = pendingMedia.length > 0;

    if (!msg && !hasMedia) return;
    if (loading) return;

    // Build prompt — auto-schedule if only files attached
    let prompt = msg || '';
    if (hasMedia && !msg) {
      prompt = `I've uploaded ${pendingMedia.length} media file${pendingMedia.length > 1 ? 's' : ''}. Schedule them across the next ${Math.max(pendingMedia.length, 7)} days as drafts for review on ${platform}. Space them evenly and organize by type.`;
    }

    // Append media context to the prompt
    const mediaContext = hasMedia
      ? `\n\n[ATTACHED_MEDIA: ${pendingMedia.map(f => `${f.type}:${f.url}`).join(', ')}]`
      : '';

    const displayText = msg || `📎 ${pendingMedia.length} file${pendingMedia.length > 1 ? 's' : ''} uploaded — auto-scheduling`;
    setInput('');
    const filesToSend = [...pendingMedia];
    setPendingMedia([]);

    // 1. Save user message to shared table
    const { data: inserted } = await supabase.from('smm_conversations').insert({
      profile_username: profileId,
      platform,
      source: 'web',
      role: 'user',
      message: displayText,
    }).select('id').single();

    const userMsg = { id: inserted?.id, role: 'user', text: displayText, source: 'web' };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'cortex' ? 'assistant' : m.role,
        text: m.text,
      }));
      history.push({ role: 'user', text: prompt + mediaContext });

      const { data, error } = await supabase.functions.invoke('smm-scheduler', {
        body: {
          prompt: prompt + mediaContext,
          profile: profileId,
          history,
          attached_media: filesToSend.map(f => ({
            url: f.url,
            type: f.type,
            name: f.name,
            content_asset_id: f.contentAssetId,
          })),
        },
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

  const mediaIcon = (type: string) => {
    if (type === 'video') return <Video className="h-3 w-3" />;
    return <Image className="h-3 w-3" />;
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
            <p className="text-xs text-muted-foreground">👋 Tell Cortex about your brand, or attach media files to auto-schedule.</p>
            <p className="text-[10px] text-muted-foreground">📎 Upload images, videos, or audio — bulk uploads supported</p>
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

      {/* Pending media strip */}
      {pendingMedia.length > 0 && (
        <div className="px-2 py-1.5 border-t border-border/30 flex flex-wrap gap-1.5">
          {pendingMedia.map(f => (
            <Badge key={f.id} variant="outline" className="text-[10px] gap-1 py-0.5 pr-1">
              {mediaIcon(f.type)}
              <span className="max-w-[80px] truncate">{f.name}</span>
              <button onClick={() => removePending(f.id)} className="hover:text-destructive ml-0.5">
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input row with file attach */}
      <div className="p-2 border-t border-border/50 flex gap-2 items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept={CORTEX_ACCEPTED}
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-30 transition-colors"
          title="Attach files (images, videos, audio)"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={pendingMedia.length > 0 ? 'Add instructions or hit enter to auto-schedule…' : 'Tell Cortex about your brand…'}
          className="text-xs h-8"
          disabled={loading}
        />
        <Button size="sm" onClick={() => send()} disabled={loading || (!input.trim() && pendingMedia.length === 0)} className="h-8 px-3">
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

  // Derive available schedule platforms from the profile's connected accounts
  const currentProfile = profiles.find(p => p.username === profileId || p.id === profileId);
  const availablePlatforms = useMemo(() => {
    if (!currentProfile) return SCHEDULE_PLATFORMS;
    const connectedSet = new Set<string>(
      currentProfile.connected_platforms
        .filter(cp => cp.connected)
        .map(cp => cp.platform === 'twitter' ? 'x' : cp.platform)
    );
    // Also include platforms that already have content plans
    plans.forEach(p => connectedSet.add(p.platform as string));
    // Filter SCHEDULE_PLATFORMS to only connected ones
    const filtered = SCHEDULE_PLATFORMS.filter(p => connectedSet.has(p.value));
    return filtered.length > 0 ? filtered : SCHEDULE_PLATFORMS;
  }, [currentProfile, plans]);

  // Auto-select first available platform if current one isn't available
  useEffect(() => {
    if (availablePlatforms.length > 0 && !availablePlatforms.find(p => p.value === activePlatform)) {
      setActivePlatform(availablePlatforms[0].value);
    }
  }, [availablePlatforms, activePlatform]);
  const [pushingLive, setPushingLive] = useState(false);

   const [resetting, setResetting] = useState(false);
   const [recycling, setRecycling] = useState(false);
   const [cloning, setCloning] = useState(false);
   const [retryItems, setRetryItems] = useState<any[]>([]);
   const [recycleConfirmOpen, setRecycleConfirmOpen] = useState(false);
   const [recyclePushLiveOpen, setRecyclePushLiveOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  const handleItemClick = (item: ScheduleItem) => {
    setEditingItem(item);
    setEditModalOpen(true);
  };

  const handleToggleFavorite = async (itemId: string) => {
    if (!currentPlan) return;
    const newItems = items.map(i => i.id === itemId ? { ...i, favorited: !i.favorited } : i);
    const { error } = await supabase
      .from('smm_content_plans')
      .update({ schedule_items: newItems as any, updated_at: new Date().toISOString() } as any)
      .eq('id', currentPlan.id);
    if (error) {
      toast.error('Failed to update favorite');
    } else {
      const wasFavorited = items.find(i => i.id === itemId)?.favorited;
      toast.success(wasFavorited ? 'Style unfavorited' : '✅ Style favorited — AI will match this when regenerating');
      await fetchPlans();
    }
  };

  const handlePurgeGenerating = async () => {
    if (!currentPlan) return;
    setPurging(true);
    try {
      const newItems = items.map(i =>
        i.status === 'generating' ? { ...i, status: 'failed' as const, hf_request_id: undefined } : i
      );
      const { error } = await supabase
        .from('smm_content_plans')
        .update({ schedule_items: newItems as any, updated_at: new Date().toISOString() } as any)
        .eq('id', currentPlan.id);
      if (error) throw error;
      toast.success('All generating tasks purged.');
      await fetchPlans();
    } catch (e: any) {
      toast.error(`Purge failed: ${e.message}`);
    }
    setPurging(false);
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

  const currentPlan = plans.find(p => p.platform === activePlatform || p.platform.split('|').includes(activePlatform));
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
      // Check if items already have generated content — if so, force regenerate
      const hasExistingContent = items.some(i => i.media_url && i.status === 'ready');
      const body: any = { plan_id: planId };
      if (dates) body.force_dates = dates;
      if (hasExistingContent) body.force_regenerate = true;

      // Pass favorited items' style info so AI copies their style
      const favoritedItems = items.filter(i => i.favorited && i.media_url);
      if (favoritedItems.length > 0) {
        body.style_references = favoritedItems.map(i => ({
          id: i.id,
          media_url: i.media_url,
          media_prompt: i.media_prompt,
          caption: i.caption,
          type: i.type,
        }));
        toast.info(`Using ${favoritedItems.length} favorited style(s) as reference for generation.`);
      }
      
      if (hasExistingContent && favoritedItems.length === 0) {
        toast.info('Regenerating content — old content stays visible until new content is ready.');
      }
      
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
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
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
          end_time: (() => { const e = new Date(new Date(startTime).getTime() + 30 * 60000); return `${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}-${String(e.getDate()).padStart(2,'0')}T${String(e.getHours()).padStart(2,'0')}:${String(e.getMinutes()).padStart(2,'0')}:00`; })(),
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
      const failedItems: any[] = [];

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
          // Check actual media URL to detect fallback (video items that fell back to images)
          const isActualVideo = item.media_url && (
            item.media_url.endsWith('.mp4') || item.media_url.endsWith('.mov') ||
            item.media_url.endsWith('.webm') || item.media_url.includes('higgsfield')
          );
          let postType: 'text' | 'video' | 'photos' | 'document' = 'text';
          if (item.type === 'video' && isActualVideo) postType = 'video';
          else if (item.type === 'video' || item.type === 'image' || item.type === 'carousel') postType = 'photos';

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
          failedItems.push(item);
          failed++;
        }
      }

      // Store failed items for retry
      if (failedItems.length > 0) {
        setRetryItems(failedItems);
      }

      // 4. Fire auto-boost for items that have boost_services configured
      let boosted = 0;
      const boostableItems = items.filter(i => i.boost_services && i.boost_services.length > 0);
      for (const item of boostableItems) {
        try {
          // Construct the likely post URL (platform-specific placeholder — real URL comes after publish)
          // For now, use the media_url or a placeholder link that will be updated
          const postLink = item.media_url || '';
          if (!postLink) continue;

          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/darkside-smm?action=auto-boost`,
            {
              method: 'POST',
              headers: {
                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                schedule_item_id: item.id,
                plan_id: currentPlan.id,
                link: postLink,
                platform: apiPlatform,
                profile_username: currentPlan.profile_username,
                services: item.boost_services,
              }),
            }
          );
          const result = await res.json();
          if (result.success && result.data?.placed > 0) {
            boosted += result.data.placed;
          }
        } catch (boostErr) {
          console.warn(`[push-live] Boost failed for item ${item.id}:`, boostErr);
        }
      }

      const summary = [];
      summary.push(`${calendarEvents.length} calendar events added`);
      if (scheduled > 0) summary.push(`${scheduled} post(s) scheduled to ${currentPlan.platform}`);
      if (boosted > 0) summary.push(`🚀 ${boosted} boost order(s) placed`);
      if (failed > 0) summary.push(`${failed} failed (use Retry button)`);

      toast.success(`🟢 Schedule is LIVE! ${summary.join(', ')}.`);
      await fetchPlans();

    } catch (e: any) {
      toast.error(`Failed to push live: ${e.message}`);
    }
    setPushingLive(false);
  };

  const handleRevertToDraft = async () => {
    if (!currentPlan) return;
    setPushingLive(true);
    try {
      // 1. Set plan back to draft
      const { error } = await supabase
        .from('smm_content_plans')
        .update({ status: 'draft' } as any)
        .eq('id', currentPlan.id);
      if (error) throw error;

      // 2. Remove calendar events created by push live
      const itemIds = items.map(i => i.id);
      if (itemIds.length > 0) {
        await supabase
          .from('calendar_events')
          .delete()
          .eq('source', 'smm')
          .in('source_id', itemIds);
      }

      // 3. Cancel scheduled posts in Upload-Post API queue
      let cancelled = 0;
      try {
        const allPosts = await smmApi.getPosts();
        const scheduledPosts = allPosts.filter(
          p => p.status === 'scheduled' && p.platforms.includes(
            (currentPlan.platform === 'twitter' ? 'x' : currentPlan.platform) as any
          )
        );
        for (const post of scheduledPosts) {
          try {
            await smmApi.cancelPost(post.job_id);
            cancelled++;
          } catch (cancelErr) {
            console.warn(`[revert] Could not cancel post ${post.job_id}:`, cancelErr);
          }
        }
      } catch (fetchErr) {
        console.warn('[revert] Could not fetch posts to cancel:', fetchErr);
      }

      // 4. Clear retry items
      setRetryItems([]);

      const msg = cancelled > 0
        ? `Reverted to draft — ${cancelled} queued post(s) cancelled, calendar events removed.`
        : 'Reverted to draft — calendar events removed.';
      toast.success(msg);
      await fetchPlans();
    } catch (e: any) {
      toast.error(`Failed to revert: ${e.message}`);
    }
    setPushingLive(false);
  };
  const handleRetryFailed = async () => {
    if (!currentPlan || retryItems.length === 0) return;
    setPushingLive(true);
    const apiPlatform = currentPlan.platform === 'twitter' ? 'x' : currentPlan.platform;
    let scheduled = 0;
    const stillFailed: any[] = [];

    for (const item of retryItems) {
      try {
        const scheduledDate = item.time
          ? `${item.date}T${item.time}:00`
          : `${item.date}T12:00:00`;

        const hashtagStr = (item.hashtags || []).map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ');
        const title = item.caption
          ? `${item.caption}${hashtagStr ? '\n\n' + hashtagStr : ''}`
          : hashtagStr || item.type;

        const isActualVideo = item.media_url && (
          item.media_url.endsWith('.mp4') || item.media_url.endsWith('.mov') ||
          item.media_url.endsWith('.webm') || item.media_url.includes('higgsfield')
        );
        let postType: 'text' | 'video' | 'photos' | 'document' = 'text';
        if (item.type === 'video' && isActualVideo) postType = 'video';
        else if (item.type === 'video' || item.type === 'image' || item.type === 'carousel') postType = 'photos';

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
      } catch (err: any) {
        console.error(`[retry] Failed item ${item.id}:`, err);
        stillFailed.push(item);
      }
    }

    setRetryItems(stillFailed);
    if (scheduled > 0) toast.success(`✅ Retried: ${scheduled} post(s) scheduled successfully.`);
    if (stillFailed.length > 0) toast.error(`${stillFailed.length} still failed — check media URLs.`);
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

  // ─── Enforce min 2 hashtags on existing items ───
  const enforceHashtagsOnExisting = async () => {
    if (!currentPlan) return;
    const platform = currentPlan.platform;
    const fallbacks: Record<string, string[]> = {
      tiktok: ['#FYP', '#ForYouPage', '#Viral', '#Music', '#Trending', '#MusicVibes'],
      instagram: ['#Explore', '#InstaMusic', '#Vibes', '#MusicLovers', '#Share'],
      facebook: ['#Music', '#Share', '#NewMusic', '#Vibes', '#Listen'],
      x: ['#Music', '#NowPlaying', '#NewMusic', '#Vibes'],
    };
    const pool = fallbacks[platform] || fallbacks.instagram;
    let updated = false;
    const newItems = items.map(item => {
      const tags = (item.hashtags || []).map((h: string) => h.startsWith('#') ? h : `#${h}`).filter((h: string) => h.length > 1);
      if (tags.length >= 2) return item;
      updated = true;
      while (tags.length < 2) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (!tags.includes(pick)) tags.push(pick);
      }
      return { ...item, hashtags: tags };
    });
    if (updated) {
      await supabase
        .from('smm_content_plans')
        .update({ schedule_items: newItems as any, updated_at: new Date().toISOString() } as any)
        .eq('id', currentPlan.id);
      await fetchPlans();
    }
  };

  // ─── Recycle: clone current week across 52 weeks with AI-varied captions ───
  const handleRecycle = async (pushLive: boolean = false) => {
    if (!currentPlan || items.length === 0) {
      toast.error('No content plan to recycle');
      return;
    }
    setRecycleConfirmOpen(false);
    setRecyclePushLiveOpen(false);
    setRecycling(true);
    try {
      // Step 1: Enforce hashtags on existing items first
      await enforceHashtagsOnExisting();

      const apiPlatform = currentPlan.platform === 'twitter' ? 'x' : currentPlan.platform;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const baseItems = items.map(item => {
        const baseDate = parseISO(item.date);
        return { ...item, _baseDate: baseDate };
      });

      let totalScheduled = 0;
      let totalCalEvents = 0;

      // Process in batches of ~5 weeks to avoid overwhelming the AI
      const BATCH_SIZE = 5;
      for (let batchStart = 1; batchStart <= 51; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, 51);

        // Generate AI caption variations for this batch of weeks
        const weekVariations: Map<number, any[]> = new Map();
        for (let week = batchStart; week <= batchEnd; week++) {
          try {
            const { data: varData } = await supabase.functions.invoke('recycle-captions', {
              body: {
                items: baseItems.map(item => ({
                  id: item.id,
                  caption: item.caption,
                  hashtags: item.hashtags,
                  type: item.type,
                })),
                week_number: week,
                total_weeks: 52,
                platform: apiPlatform,
                brand_context: currentPlan.brand_context,
              },
            });
            if (varData?.variations) {
              weekVariations.set(week, varData.variations);
            }
          } catch (aiErr) {
            console.warn(`[recycle] AI caption gen failed for week ${week}:`, aiErr);
          }
        }

        // Schedule posts for each week in this batch
        for (let week = batchStart; week <= batchEnd; week++) {
          const offsetMs = week * 7 * 24 * 60 * 60 * 1000;
          const calendarEvents: any[] = [];
          const variations = weekVariations.get(week) || [];

          for (const item of baseItems) {
            const newDate = new Date(item._baseDate.getTime() + offsetMs);
            const newDateStr = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;
            const scheduledDate = item.time
              ? `${newDateStr}T${item.time}:00`
              : `${newDateStr}T12:00:00`;

            // Find AI-varied caption for this item
            const variation = variations.find((v: any) => v.id === item.id);
            const caption = variation?.caption || item.caption;
            const hashtags = variation?.hashtags || item.hashtags || [];

            // Ensure min 2 hashtags
            const hashtagStr = hashtags
              .map((h: string) => h.startsWith('#') ? h : `#${h}`)
              .filter((h: string) => h.length > 1)
              .join(' ');

            if (pushLive && (item.type === 'text' || item.media_url)) {
              try {
                const title = caption
                  ? `${caption}${hashtagStr ? '\n\n' + hashtagStr : ''}`
                  : hashtagStr || item.type;

                const isActualVideo = item.media_url && (
                  item.media_url.endsWith('.mp4') || item.media_url.endsWith('.mov') ||
                  item.media_url.endsWith('.webm') || item.media_url.includes('higgsfield')
                );
                let postType: 'text' | 'video' | 'photos' | 'document' = 'text';
                if (item.type === 'video' && isActualVideo) postType = 'video';
                else if (item.type === 'video' || item.type === 'image' || item.type === 'carousel') postType = 'photos';

                await smmApi.createPost({
                  user: currentPlan.profile_username,
                  type: postType,
                  platforms: [apiPlatform as any],
                  title,
                  media_url: item.media_url,
                  scheduled_date: scheduledDate,
                  timezone: tz,
                });
                totalScheduled++;
              } catch (err) {
                console.warn(`[recycle] Week ${week}, item ${item.id} failed:`, err);
              }
            }

            calendarEvents.push({
              title: `♻️ [${currentPlan.platform.toUpperCase()}] ${(caption || item.type).substring(0, 50)}`,
              description: `Recycled from "${currentPlan.plan_name}" (Week ${week + 1}/52)\n\n${caption || ''}`,
              start_time: scheduledDate,
              end_time: (() => { const e = new Date(new Date(scheduledDate).getTime() + 30 * 60000); return `${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}-${String(e.getDate()).padStart(2,'0')}T${String(e.getHours()).padStart(2,'0')}:${String(e.getMinutes()).padStart(2,'0')}:00`; })(),
              source: 'smm',
              source_id: `recycle-w${week}-${item.id}`,
              category: 'smm',
              color: currentPlan.platform === 'instagram' ? '#E1306C' :
                     currentPlan.platform === 'facebook' ? '#1877F2' :
                     currentPlan.platform === 'tiktok' ? '#010101' :
                     currentPlan.platform === 'x' ? '#1DA1F2' : '#3b82f6',
            });
          }

          if (calendarEvents.length > 0) {
            const { error: calErr } = await supabase
              .from('calendar_events')
              .insert(calendarEvents);
            if (!calErr) totalCalEvents += calendarEvents.length;
          }
        }

        toast.info(`♻️ Weeks ${batchStart}-${batchEnd} scheduled…`, { duration: 2000 });
      }

      if (pushLive) {
        toast.success(`♻️ Recycled & Pushed Live! ${totalScheduled} posts scheduled + ${totalCalEvents} calendar events across 51 weeks.`);
        // Auto-reset plan status to draft after full push
        await supabase.from('smm_content_plans').update({ status: 'draft', schedule_items: [] } as any).eq('id', currentPlan.id);
        await loadPlans();
        toast.info('✅ Plan auto-reset — all 52 weeks are now live on the calendar.');
      } else {
        toast.success(`♻️ Recycled! ${totalCalEvents} calendar events created across 51 weeks. Posts saved but not pushed live.`);
      }
    } catch (e: any) {
      toast.error(`Recycle failed: ${e.message}`);
    }
    setRecycling(false);
  };

  // ─── Clone to another platform ───
  const handleCloneToPlatform = async (targetPlatform: string) => {
    if (!currentPlan || items.length === 0) return;
    setCloning(true);
    try {
      // Check if target already has a plan
      const existing = plans.find(p => p.platform === targetPlatform);
      if (existing) {
        // Update existing plan with cloned items
        const clonedItems = items.map(i => ({
          ...i,
          id: i.id.replace(/-(ig|tt|fb|x)-/, `-${targetPlatform.substring(0, 2)}-`),
        }));
        const { error } = await supabase
          .from('smm_content_plans')
          .update({
            schedule_items: clonedItems as any,
            brand_context: currentPlan.brand_context as any,
            plan_name: currentPlan.plan_name,
            status: 'draft',
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert new plan
        const clonedItems = items.map(i => ({
          ...i,
          id: i.id.replace(/-(ig|tt|fb|x)-/, `-${targetPlatform.substring(0, 2)}-`),
        }));
        const { error } = await supabase
          .from('smm_content_plans')
          .insert({
            profile_username: profileId,
            platform: targetPlatform,
            plan_name: currentPlan.plan_name,
            status: 'draft',
            brand_context: currentPlan.brand_context as any,
            schedule_items: clonedItems as any,
          } as any);
        if (error) throw error;
      }
      toast.success(`✅ Cloned ${items.length} posts to ${targetPlatform}`);
      await fetchPlans();
    } catch (e: any) {
      toast.error(`Clone failed: ${e.message}`);
    }
    setCloning(false);
  };

  // Available platforms to clone TO (exclude current)
  const cloneTargets = availablePlatforms.filter(p => p.value !== activePlatform && !plans.find(pl => pl.platform === p.value));

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

          {/* Recycle Button — clone week across 52 weeks */}
          {currentPlan && items.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10" disabled={recycling}>
                  {recycling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat2 className="h-3.5 w-3.5" />}
                  Recycle 52w
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>♻️ Recycle Content for 52 Weeks?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will take your current {items.length} post(s) and schedule them to repeat every week for a full year (52 weeks). 
                    That's {items.length * 51} additional posts — each week gets <strong>AI-generated fresh captions</strong> so your feed never looks repetitive.
                    All posts will be enforced with at least 2 relevant hashtags. Calendar events will also be created.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRecycle} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    Yes, Recycle ♻️
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Clone to Platform Button */}
          {currentPlan && items.length > 0 && (
            <Select onValueChange={handleCloneToPlatform} disabled={cloning}>
              <SelectTrigger className="h-8 w-auto gap-1.5 text-xs border-blue-500/30 text-blue-600 hover:bg-blue-500/10 px-2.5">
                {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                Clone to…
              </SelectTrigger>
              <SelectContent>
                {availablePlatforms.filter(p => p.value !== activePlatform).map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Custom Brand Images Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
            onClick={() => setCustomDialogOpen(true)}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Custom
          </Button>

          {currentPlan && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-purple-500/30 text-purple-600 hover:bg-purple-500/10"
              disabled={generating || items.some(i => i.status === 'generating')}
              onClick={() => currentPlan && triggerMediaGen(currentPlan.id, getFullWeekDates())}
            >
              {generating || items.some(i => i.status === 'generating') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" />}
              {generating || items.some(i => i.status === 'generating') ? 'Generating…' : 'Generate AI'}
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
                    {items.some(i => i.boost_services && i.boost_services.length > 0) && (
                      <span className="block mt-1 text-primary font-medium">
                        🚀 {items.filter(i => i.boost_services && i.boost_services.length > 0).length} post(s) have auto-boost services configured — orders will be placed automatically.
                      </span>
                    )}
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
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-yellow-500/30 text-yellow-600 hover:bg-yellow-500/10"
              disabled={pushingLive}
              onClick={handleRevertToDraft}
            >
              {pushingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Revert to Draft
            </Button>
          )}

          {retryItems.length > 0 && isLive && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-orange-500/30 text-orange-600 hover:bg-orange-500/10"
              disabled={pushingLive}
              onClick={handleRetryFailed}
            >
              {pushingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Retry {retryItems.length} Failed
            </Button>
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
          {availablePlatforms.map(p => (
            <TabsTrigger key={p.value} value={p.value} className="gap-1.5 text-xs">
              <PlatformIcon platform={p.value} />
              {p.label}
              {plans.find(pl => pl.platform === p.value || pl.platform.split('|').includes(p.value)) && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {availablePlatforms.map(p => (
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
                  {p.value === 'instagram' && <InstagramFeedPreview items={items} onItemClick={handleItemClick} onToggleFavorite={handleToggleFavorite} profileUsername={profileId || 'Brand'} />}
                  {p.value === 'facebook' && <FacebookFeedPreview items={items} onItemClick={handleItemClick} onToggleFavorite={handleToggleFavorite} profileUsername={profileId || 'Brand'} />}
                  {p.value === 'tiktok' && <TikTokFeedPreview items={items} onItemClick={handleItemClick} onToggleFavorite={handleToggleFavorite} profileUsername={profileId || 'Brand'} />}
                  {p.value === 'x' && <XFeedPreview items={items} onItemClick={handleItemClick} onToggleFavorite={handleToggleFavorite} profileUsername={profileId || 'Brand'} />}
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
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeline</h4>
                      {items.some(i => i.status === 'generating') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10 gap-1"
                          onClick={handlePurgeGenerating}
                          disabled={purging}
                        >
                          {purging ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          Purge
                        </Button>
                      )}
                    </div>
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
        planIsLive={isLive}
        plan={currentPlan || null}
        onApplyBoostToAll={async (services) => {
          if (!currentPlan) return;
          const newItems = items.map(i => ({ ...i, boost_services: services }));
          const { error } = await supabase
            .from('smm_content_plans')
            .update({ schedule_items: newItems as any, updated_at: new Date().toISOString() } as any)
            .eq('id', currentPlan.id);
          if (error) toast.error('Failed to apply: ' + error.message);
          else { toast.success(`Applied boost services to all ${newItems.length} posts`); await fetchPlans(); }
        }}
      />

      <CustomBrandDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        profileId={profileId || 'STU25'}
        currentPlan={currentPlan || null}
        onUpdated={fetchPlans}
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
