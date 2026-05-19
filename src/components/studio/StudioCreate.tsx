import { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CreatePrefill } from '@/pages/AIGen';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { submitJob } from '@/lib/studio/hooks';
import { JobStatusPanel } from './JobStatusPanel';
import {
  STYLE_PRESETS, RESOLUTIONS, ASPECT_RATIOS, DURATIONS, FPS_OPTIONS,
  CAMERA_MOVES, LIGHTING_STYLES, SHOT_TYPES, TASK_LABELS,
  type TaskType, type GenerationSettings,
} from '@/lib/studio/types';
import {
  Type, Image, Layers, Mic, UserCircle, Upload, Sparkles, Loader2,
  Wand2, Dice5, ChevronRight, Info,
} from 'lucide-react';
import { DirectorCameraStyles } from './DirectorCameraStyles';
import { DIRECTOR_STYLES, buildInjectedPrompt } from '@/lib/studio/directorStyles';
import { ReferenceLibraryPicker } from './ReferenceLibraryPicker';

const TASK_ICONS: Record<TaskType, React.ReactNode> = {
  t2v: <Type className="w-3.5 h-3.5" />,
  i2v: <Image className="w-3.5 h-3.5" />,
  ti2v: <Layers className="w-3.5 h-3.5" />,
  s2v: <Mic className="w-3.5 h-3.5" />,
  animate: <UserCircle className="w-3.5 h-3.5" />,
};

const PROPERTY_TRUTH_LOCK_PROMPT = `\n\n[PROPERTY TRUTH LOCK]\nYou are generating a real estate video from a real client property reference image. The home must be treated as an existing physical property, not a creative concept. Do not redesign or reinterpret the property.\n\nSTRICT PROPERTY ACCURACY RULES:\n1. Do not invent new rooms.\n2. Do not move the camera into a room that is not clearly visible in the reference image.\n3. Do not replace the actual room with a generated room.\n4. Do not change the layout of the home.\n5. Do not change wall placement, door placement, window placement, ceiling height, flooring, fixtures, cabinetry, furniture, or décor.\n6. Do not add new architectural features unless the user explicitly requests them.\n7. Do not remove important architectural details from the reference image.\n8. Do not change the style of the home.\n9. Do not turn the property into a different house.\n10. Do not create fake angles that reveal areas not present in the reference image.\n11. Do not generate imaginary hallways, extra doors, extra windows, extra staircases, extra rooms, or fake outdoor areas.\n12. Do not alter the client's actual staging, furniture, lighting fixtures, countertops, cabinets, appliances, pool area, backyard, landscaping, or exterior design.\n13. Do not change the size, shape, or material of visible surfaces.\n14. Do not replace the real estate photography with an AI-designed fantasy version.\n15. Do not "beautify" the property by changing its structure. Only enhance lighting, cinematic tone, realism, motion, and depth.\n\nCAMERA MOVEMENT RULES:\nAllowed: push-in, pull-back, pan left/right, tilt up/down, slow dolly, slight orbit within the visible room, smooth robotic arm style movement, depth-of-field focus pulls, cinematic parallax using only visible property geometry.\nNot allowed: traveling into a fake room, turning around to reveal a room not provided, creating a new reverse angle that invents missing architecture, passing through walls, moving through doors unless the next room is clearly shown in a provided reference, expanding the home beyond the uploaded reference.\n\nREFERENCE IMAGE PRIORITY: If the creative prompt conflicts with the reference image, the reference image wins. Restrict movement to visible areas only and preserve the exact property. Only transition Room A → Room B when both reference images are provided.\n\nSTYLE ALLOWED: cinematic lighting, camera smoothness, lens depth, motion blur, color grade, luxury commercial tone, presenter movement, natural reflections, realistic shadows, smooth transitions. Do NOT improve by changing the actual home.\n\nNEGATIVE: no fake rooms, no invented architecture, no changed layout, no extra windows, no extra doors, no new furniture, no new staging, no changed floors, no changed cabinets, no changed ceiling beams, no changed lighting fixtures, no fake backyard, no fake pool, no fake mountain view, no imaginary hallway, no unrealistic expansion, no alternate house, no redesigned interior, no AI-generated replacement room, no fantasy real estate design, no structural changes.\n\nFINAL: Generate the video as if a real cinematographer filmed the exact property shown in the uploaded reference image. Preserve the home exactly. Only animate the camera, presenter, lighting, and cinematic movement while keeping the real property locked.`;

interface StudioCreateProps {
  projectId?: string | null;
  subprojectId?: string | null;
  prefill?: CreatePrefill | null;
  onPrefillConsumed?: () => void;
}

export function StudioCreate({ projectId, subprojectId, prefill, onPrefillConsumed }: StudioCreateProps = {}) {
  const { toast } = useToast();
  const [taskType, setTaskType] = useState<TaskType>('t2v');
  const [prompt, setPrompt] = useState('');
  const [negPrompt, setNegPrompt] = useState('');
  const [settings, setSettings] = useState<GenerationSettings & { provider?: string; seedance_model?: string; seedance_resolution?: string; seedance_ratio?: string; generate_audio?: boolean }>({
    resolution: '720x1280',
    duration: 15,
    fps: 24,
    aspect_ratio: '9:16',
    guidance_scale: 7,
    motion_intensity: 50,
    seedance_model: 'bytedance/seedance-2.0-fast/text-to-video',
    seedance_resolution: '480p',
    seedance_ratio: '9:16',
    generate_audio: true,
  });
  const [useSeedance, setUseSeedance] = useState(true);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFileB, setImageFileB] = useState<File | null>(null);
  const [imagePreviewB, setImagePreviewB] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDirector, setShowDirector] = useState(false);
  const [noMusic, setNoMusic] = useState(true);
  const [propertyLock, setPropertyLock] = useState(true);
  // Reference-to-video assets (up to 9 images, 3 videos, 3 audios)
  const [refImages, setRefImages] = useState<File[]>([]);
  const [refImageUrls, setRefImageUrls] = useState<string[]>([]);
  const [refLibraryOpen, setRefLibraryOpen] = useState(false);
  const [refVideos, setRefVideos] = useState<File[]>([]);
  const [refAudios, setRefAudios] = useState<File[]>([]);
  const [returnLastFrame, setReturnLastFrame] = useState(false);
  const [directorStyleIds, setDirectorStyleIds] = useState<string[]>([]);
  const isRefToVideo = (settings.seedance_model || '').includes('reference-to-video');

  // Prompt Director fields
  const [director, setDirector] = useState({ subject: '', action: '', scene: '', camera: '', lighting: '', tone: '' });

  // Apply prefill (from "Modify Video" action elsewhere)
  useEffect(() => {
    if (!prefill) return;
    if (prefill.task_type) setTaskType(prefill.task_type);
    if (typeof prefill.prompt === 'string') setPrompt(prefill.prompt);
    if (typeof prefill.negative_prompt === 'string' || prefill.negative_prompt === null) {
      setNegPrompt(prefill.negative_prompt ?? '');
    }
    if (prefill.settings_json) setSettings(s => ({ ...s, ...prefill.settings_json }));
    if (prefill.input_image_url) setImagePreview(prefill.input_image_url);
    toast({ title: 'Loaded for editing', description: 'Tweak the prompt and resubmit.' });
    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);


  const toggleStyle = (s: string) => {
    setSelectedStyles(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const makeImageHandler = (slot: 'A' | 'B') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file', description: 'Only JPG, PNG, WebP supported', variant: 'destructive' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 20MB', variant: 'destructive' });
      return;
    }
    if (slot === 'A') {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImageFileB(file);
      setImagePreviewB(URL.createObjectURL(file));
    }
  };
  const handleImageUpload = makeImageHandler('A');
  const handleImageUploadB = makeImageHandler('B');

  // ---------- Drag-and-drop helpers ----------
  const preventDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  const acceptImageDrop = (slot: 'A' | 'B') => (e: React.DragEvent) => {
    preventDrag(e);
    const file = Array.from(e.dataTransfer.files || []).find(f => f.type.startsWith('image/'));
    if (!file) return;
    const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    (slot === 'A' ? handleImageUpload : handleImageUploadB)(fakeEvent);
  };

  const dropRefImages = (e: React.DragEvent) => {
    preventDrag(e);
    const files = Array.from(e.dataTransfer.files || []).filter(f => /image\/(jpeg|png|webp)/i.test(f.type));
    if (!files.length) return;
    const remaining = 9 - (refImages.length + refImageUrls.length);
    if (remaining <= 0) { toast({ title: 'Reference images full (9 max)', variant: 'destructive' }); return; }
    setRefImages(prev => [...prev, ...files.slice(0, remaining)]);
  };

  const dropRefVideos = (e: React.DragEvent) => {
    preventDrag(e);
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('video/') && f.size <= 50 * 1024 * 1024);
    if (!files.length) return;
    setRefVideos(prev => [...prev, ...files].slice(0, 3));
  };

  const dropRefAudios = (e: React.DragEvent) => {
    preventDrag(e);
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('audio/') && f.size <= 15 * 1024 * 1024);
    if (!files.length) return;
    setRefAudios(prev => [...prev, ...files].slice(0, 3));
  };

  // ---------- Reorder helpers (drag-to-reorder existing assets) ----------
  const REORDER_MIME = 'application/x-studio-reorder';
  const onReorderStart = (kind: 'img' | 'vid' | 'aud', index: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData(REORDER_MIME, `${kind}:${index}`);
    e.dataTransfer.effectAllowed = 'move';
  };
  const isReorderEvent = (e: React.DragEvent, kind: string) => {
    const types = Array.from(e.dataTransfer.types || []);
    return types.includes(REORDER_MIME);
  };
  const onReorderOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types || []).includes(REORDER_MIME)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    }
  };
  const reorderArray = <T,>(arr: T[], from: number, to: number): T[] => {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
    const next = arr.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };
  const onReorderDropImg = (toIndex: number) => (e: React.DragEvent) => {
    const data = e.dataTransfer.getData(REORDER_MIME);
    if (!data || !data.startsWith('img:')) return;
    e.preventDefault();
    e.stopPropagation();
    const from = parseInt(data.split(':')[1], 10);
    // combined list: urls first, then files
    const combined = [
      ...refImageUrls.map(v => ({ k: 'u' as const, v })),
      ...refImages.map(v => ({ k: 'f' as const, v })),
    ];
    const next = reorderArray(combined, from, toIndex);
    setRefImageUrls(next.filter(x => x.k === 'u').map(x => x.v as string));
    setRefImages(next.filter(x => x.k === 'f').map(x => x.v as File));
  };
  const onReorderDropVid = (toIndex: number) => (e: React.DragEvent) => {
    const data = e.dataTransfer.getData(REORDER_MIME);
    if (!data || !data.startsWith('vid:')) return;
    e.preventDefault(); e.stopPropagation();
    const from = parseInt(data.split(':')[1], 10);
    setRefVideos(prev => reorderArray(prev, from, toIndex));
  };
  const onReorderDropAud = (toIndex: number) => (e: React.DragEvent) => {
    const data = e.dataTransfer.getData(REORDER_MIME);
    if (!data || !data.startsWith('aud:')) return;
    e.preventDefault(); e.stopPropagation();
    const from = parseInt(data.split(':')[1], 10);
    setRefAudios(prev => reorderArray(prev, from, toIndex));
  };




  const applyDirector = () => {
    const parts = [
      director.subject,
      director.action,
      director.scene && `in ${director.scene}`,
      director.camera && `${director.camera}`,
      director.lighting && `${director.lighting} lighting`,
      director.tone && `${director.tone} mood`,
    ].filter(Boolean);
    if (parts.length) setPrompt(prev => (prev ? prev + '. ' : '') + parts.join(', '));
  };

  const randomInspiration = () => {
    const inspirations = [
      'A lone astronaut standing on an alien desert at golden hour, cinematic dolly-in shot',
      'Slow motion ocean waves crashing against black volcanic rocks, dramatic rim lighting',
      'Neon-lit cyberpunk city street at night with rain reflections, tracking shot',
      'A single red rose blooming in extreme close-up, time-lapse style, soft studio light',
      'Aerial drone shot over misty mountain peaks at sunrise, ethereal mood',
    ];
    setPrompt(inspirations[Math.floor(Math.random() * inspirations.length)]);
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast({ title: 'Prompt required', variant: 'destructive' });
      return;
    }
    if ((taskType === 'i2v' || taskType === 'ti2v') && !isRefToVideo && !imageFile && !imagePreview) {
      toast({ title: 'Image required for this mode', variant: 'destructive' });
      return;
    }
    if (isRefToVideo && refImages.length === 0 && refImageUrls.length === 0) {
      toast({ title: 'At least 1 reference image required', description: 'Upload or insert 1–9 reference images for reference-to-video.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Seedance / most providers cap inputs around ~2048px. Auto-shrink anything bigger.
      const MAX_DIM = 1920;
      const downscaleIfNeeded = (file: File): Promise<File> =>
        new Promise((resolve, reject) => {
          if (!file.type.startsWith('image/')) return resolve(file);
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new window.Image();
            img.onload = () => {
              const maxSide = Math.max(img.width, img.height);
              if (maxSide <= MAX_DIM) return resolve(file);
              const scale = MAX_DIM / maxSide;
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve(file);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob(
                (blob) => {
                  if (!blob) return resolve(file);
                  const newName = file.name.replace(/\.(png|webp|jpe?g|bmp|tiff?)$/i, '') + '_resized.jpg';
                  const shrunk = new File([blob], newName, { type: 'image/jpeg' });
                  toast({ title: 'Image auto-shrunk', description: `${img.width}×${img.height} → ${canvas.width}×${canvas.height} to fit API limits.` });
                  resolve(shrunk);
                },
                'image/jpeg',
                0.92
              );
            };
            img.onerror = () => resolve(file);
            img.src = e.target?.result as string;
          };
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(file);
        });

      const uploadOne = async (file: File) => {
        const safe = await downscaleIfNeeded(file);
        const ext = safe.name.split('.').pop() || 'png';
        const path = `inputs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('studio-outputs').upload(path, safe);
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        return supabase.storage.from('studio-outputs').getPublicUrl(path).data.publicUrl;
      };

      let input_image_url: string | undefined;
      let last_frame_image_url: string | undefined;
      if (imageFile) input_image_url = await uploadOne(imageFile);
      else if (imagePreview) input_image_url = imagePreview;
      if (imageFileB) last_frame_image_url = await uploadOne(imageFileB);
      else if (imagePreviewB) last_frame_image_url = imagePreviewB;

      const seedanceActive = useSeedance && (taskType === 'i2v' || taskType === 't2v');
      const currentModel = settings.seedance_model || 'bytedance/seedance-2.0-fast/text-to-video';
      const isRef = currentModel.includes('reference-to-video');
      const seedanceModel = seedanceActive && !isRef
        ? taskType === 't2v'
          ? currentModel.replace('image-to-video', 'text-to-video')
          : currentModel.replace('text-to-video', 'image-to-video')
        : currentModel;

      // Upload reference-to-video assets
      let reference_images_urls: string[] = [];
      let reference_videos_urls: string[] = [];
      let reference_audios_urls: string[] = [];
      const uploadAsset = async (file: File, kind: 'img' | 'vid' | 'aud') => {
        const ext = file.name.split('.').pop() || (kind === 'img' ? 'jpg' : kind === 'vid' ? 'mp4' : 'mp3');
        const path = `inputs/${kind}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('studio-outputs').upload(path, file);
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        return supabase.storage.from('studio-outputs').getPublicUrl(path).data.publicUrl;
      };
      if (seedanceActive && isRef) {
        // Library-picked URLs go FIRST so they're always image 1, 2, ... for prompting
        for (const u of refImageUrls) reference_images_urls.push(u);
        for (const f of refImages) reference_images_urls.push(await uploadOne(f));
        // Cap at API max (9)
        reference_images_urls = reference_images_urls.slice(0, 9);
        for (const f of refVideos) reference_videos_urls.push(await uploadAsset(f, 'vid'));
        for (const f of refAudios) reference_audios_urls.push(await uploadAsset(f, 'aud'));
      }

      const fullSettings = {
        ...settings,
        style_preset: selectedStyles.join(', ') || undefined,
        provider: seedanceActive ? 'seedance' : undefined,
        seedance_model: seedanceModel,
        last_frame_image_url: last_frame_image_url || undefined,
        reference_images_urls: reference_images_urls.length ? reference_images_urls : undefined,
        reference_videos_urls: reference_videos_urls.length ? reference_videos_urls : undefined,
        reference_audios_urls: reference_audios_urls.length ? reference_audios_urls : undefined,
        return_last_frame: isRef ? returnLastFrame : undefined,
        director_style_ids: directorStyleIds.length ? directorStyleIds : undefined,
        duration: seedanceActive
          ? Math.max(4, Math.min(15, Number(settings.duration) || 5))
          : settings.duration,
      };

      const basePrompt = prompt.trim();
      const chosenDirectorStyles = DIRECTOR_STYLES.filter(s => directorStyleIds.includes(s.id));
      let finalPrompt = chosenDirectorStyles.length
        ? buildInjectedPrompt(basePrompt, chosenDirectorStyles)
        : basePrompt;
      if (noMusic && !/no music in background/i.test(finalPrompt)) {
        finalPrompt = `${finalPrompt} No music in background. No ambient sound, no environmental noise, no atmospheric audio, no sound effects — completely silent audio track.`;
      }
      if (propertyLock && !/PROPERTY TRUTH LOCK/i.test(finalPrompt)) {
        finalPrompt = `${finalPrompt}${PROPERTY_TRUTH_LOCK_PROMPT}`;
      }

      await submitJob({
        task_type: taskType,
        prompt: finalPrompt,
        negative_prompt: negPrompt.trim() || undefined,
        settings_json: fullSettings,
        input_image_url,
        project_id: projectId ?? null,
        subproject_id: subprojectId ?? null,
      });

      toast({ title: 'Job submitted!', description: 'Check the queue for progress.' });
      setPrompt('');
      setNegPrompt('');
      setImageFile(null);
      setImagePreview(null);
      setImageFileB(null);
      setImagePreviewB(null);
      setRefImages([]);
      setRefImageUrls([]);
      setRefVideos([]);
      setRefAudios([]);
      setSelectedStyles([]);
      setDirectorStyleIds([]);
    } catch (err) {
      toast({ title: 'Submit failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const needsImage = (taskType === 'i2v' || taskType === 'ti2v') && !isRefToVideo;
  const isAdvanced = taskType === 's2v' || taskType === 'animate';

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        {/* Task Type Tabs */}
        <Tabs
          value={taskType}
          onValueChange={v => {
            const next = v as TaskType;
            setTaskType(next);
            if (next === 't2v') {
              setSettings(s => ({ ...s, seedance_model: (s.seedance_model || 'bytedance/seedance-2.0-fast/text-to-video').replace('image-to-video', 'text-to-video') }));
            } else if (next === 'i2v') {
              setSettings(s => ({ ...s, seedance_model: (s.seedance_model || 'bytedance/seedance-2.0-fast/image-to-video').replace('text-to-video', 'image-to-video') }));
            }
          }}
        >
          <TabsList className="bg-muted/50 border border-border/50 flex-wrap h-auto p-1">
            {(Object.keys(TASK_LABELS) as TaskType[]).map(t => (
              <TabsTrigger key={t} value={t} className="gap-1.5 text-xs data-[state=active]:bg-background">
                {TASK_ICONS[t]} {TASK_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isAdvanced && (
          <Card className="border-amber-500/30 bg-amber-950/20">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">Advanced Mode</p>
                <p className="text-xs text-amber-400/70">
                  {taskType === 's2v' ? 'Speech-to-video requires audio upload and a backend configured with audio processing.' : 'Character animation requires a backend with pose estimation capabilities.'}
                  {' '}Ensure your GPU worker supports this mode.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prompt */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Prompt</Label>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={randomInspiration}>
                  <Dice5 className="w-3 h-3" /> Inspire
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowDirector(!showDirector)}>
                  <Wand2 className="w-3 h-3" /> Director
                </Button>
              </div>
            </div>
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe your video in detail... e.g., 'A cinematic slow-motion shot of a hummingbird hovering near a tropical flower, golden hour lighting, shallow depth of field'"
              className="min-h-[100px] bg-background/50"
            />
            <div>
              <Label className="text-xs text-muted-foreground">Negative Prompt (optional)</Label>
              <Textarea
                value={negPrompt}
                onChange={e => setNegPrompt(e.target.value)}
                placeholder="What to avoid... e.g., 'blurry, low quality, distorted faces, text, watermark'"
                className="min-h-[60px] bg-background/50 mt-1"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
              <Checkbox checked={noMusic} onCheckedChange={(v) => setNoMusic(v === true)} />
              <span className="text-xs text-muted-foreground">
                No music & no ambient sound — appends <span className="text-foreground font-medium">"No music in background. No ambient sound, no environmental noise, no atmospheric audio, no sound effects — completely silent audio track."</span> to the prompt
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={propertyLock} onCheckedChange={(v) => setPropertyLock(v === true)} />
              <span className="text-xs text-muted-foreground">
                Lock Property Constraints — appends the <span className="text-foreground font-medium">Property Truth Lock</span> rules so the AI never invents or redesigns the real estate reference
              </span>
            </label>
          </CardContent>
        </Card>


        {/* Director Panel */}
        {showDirector && (
          <Card className="border-violet-500/30 bg-violet-950/20 backdrop-blur">
            <CardContent className="p-5 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2"><Wand2 className="w-4 h-4 text-violet-400" /> Prompt Director</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Subject</Label><Input value={director.subject} onChange={e => setDirector(d => ({ ...d, subject: e.target.value }))} placeholder="A lone wolf" className="bg-background/50 mt-1" /></div>
                <div><Label className="text-xs">Action</Label><Input value={director.action} onChange={e => setDirector(d => ({ ...d, action: e.target.value }))} placeholder="running through snow" className="bg-background/50 mt-1" /></div>
                <div>
                  <Label className="text-xs">Camera</Label>
                  <Select value={director.camera} onValueChange={v => setDirector(d => ({ ...d, camera: v }))}>
                    <SelectTrigger className="bg-background/50 mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{CAMERA_MOVES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Lighting</Label>
                  <Select value={director.lighting} onValueChange={v => setDirector(d => ({ ...d, lighting: v }))}>
                    <SelectTrigger className="bg-background/50 mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{LIGHTING_STYLES.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Scene</Label><Input value={director.scene} onChange={e => setDirector(d => ({ ...d, scene: e.target.value }))} placeholder="a frozen tundra" className="bg-background/50 mt-1" /></div>
                <div><Label className="text-xs">Tone / Mood</Label><Input value={director.tone} onChange={e => setDirector(d => ({ ...d, tone: e.target.value }))} placeholder="epic, dramatic" className="bg-background/50 mt-1" /></div>
              </div>
              <Button variant="outline" size="sm" className="gap-1" onClick={applyDirector}>
                <ChevronRight className="w-3 h-3" /> Apply to Prompt
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Image Upload — supports up to 2 frames (A = first frame, B = optional end frame) */}
        {needsImage && (
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Input Images</Label>
                <p className="text-xs text-muted-foreground">A = first frame · B = end frame (optional)</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { slot: 'A' as const, label: 'Frame A (start)', preview: imagePreview, onChange: handleImageUpload, clear: () => { setImageFile(null); setImagePreview(null); } },
                  { slot: 'B' as const, label: 'Frame B (end, optional)', preview: imagePreviewB, onChange: handleImageUploadB, clear: () => { setImageFileB(null); setImagePreviewB(null); } },
                ]).map(({ slot, label, preview, onChange, clear }) => (
                  <div key={slot} className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    {preview ? (
                      <div
                        className="relative"
                        onDragOver={preventDrag}
                        onDrop={acceptImageDrop(slot)}
                      >
                        <img src={preview} alt={`Frame ${slot}`} className="rounded-lg max-h-[220px] w-full object-contain bg-background/50" />
                        <Button variant="destructive" size="sm" className="absolute top-2 right-2" onClick={clear}>Remove</Button>
                        <div className="absolute inset-0 rounded-lg ring-2 ring-transparent hover:ring-violet-500/40 transition pointer-events-none" />
                      </div>
                    ) : (
                      <label
                        className="border-2 border-dashed border-border/50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500/50 transition-colors min-h-[180px]"
                        onDragOver={preventDrag}
                        onDrop={acceptImageDrop(slot)}
                      >
                        <Upload className="w-7 h-7 text-muted-foreground/50 mb-2" />
                        <p className="text-xs text-muted-foreground">Drop or click to upload Frame {slot}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">JPG / PNG / WebP · 20MB</p>
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onChange} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              {imagePreviewB && !imagePreview && (
                <p className="text-xs text-amber-400">Frame A is required when using an end frame.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Seedance / Atlas Cloud */}
        {(taskType === 'i2v' || taskType === 't2v') && (
          <Card className={`border ${useSeedance ? 'border-[#00ff88]/50 bg-[#00ff88]/5' : 'border-border/50 bg-card/50'} backdrop-blur`}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className={`w-4 h-4 ${useSeedance ? 'text-[#00ff88]' : 'text-muted-foreground'}`} />
                    <Label className="text-sm font-medium">Atlas Cloud · Seedance</Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ByteDance Seedance models with native synced audio. 4–15s clips.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={useSeedance ? 'default' : 'outline'}
                  className={useSeedance ? 'bg-[#00ff88] text-black hover:bg-[#00ff88]/90' : ''}
                  onClick={() => setUseSeedance(v => !v)}
                >
                  {useSeedance ? 'On' : 'Off'}
                </Button>
              </div>

              {useSeedance && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="col-span-2">
                    <Label className="text-xs">Model</Label>
                    <Select
                      value={settings.seedance_model}
                      onValueChange={v => setSettings(s => ({ ...s, seedance_model: v }))}
                    >
                      <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[
                          { v: 'bytedance/seedance-2.0-fast/image-to-video', l: 'Seedance 2.0 Fast · image→video (default)' },
                          { v: 'bytedance/seedance-2.0-fast/text-to-video', l: 'Seedance 2.0 Fast · text→video' },
                          { v: 'bytedance/seedance-2.0-pro/image-to-video', l: 'Seedance 2.0 Pro · image→video' },
                          { v: 'bytedance/seedance-2.0-pro/text-to-video', l: 'Seedance 2.0 Pro · text→video' },
                          { v: 'bytedance/seedance-2.0-fast/reference-to-video', l: 'Seedance 2.0 Fast · reference→video (multi image/video/audio)' },
                          { v: 'bytedance/seedance-2.0/reference-to-video', l: 'Seedance 2.0 · reference→video (multi image/video/audio)' },
                          { v: 'bytedance/seedance-1.0-lite/image-to-video', l: 'Seedance 1.0 Lite · image→video' },
                          { v: 'bytedance/seedance-1.0-lite/text-to-video', l: 'Seedance 1.0 Lite · text→video' },
                          { v: 'bytedance/seedance-1.0-pro/image-to-video', l: 'Seedance 1.0 Pro · image→video' },
                          { v: 'bytedance/seedance-1.0-pro/text-to-video', l: 'Seedance 1.0 Pro · text→video' },
                        ].map(m => (
                          <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Resolution</Label>
                    <Select
                      value={settings.seedance_resolution}
                      onValueChange={v => setSettings(s => ({ ...s, seedance_resolution: v }))}
                    >
                      <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['480p','720p','720p-SR','1080p','1080p-SR','1440p-SR'].map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Aspect</Label>
                    <Select
                      value={settings.seedance_ratio}
                      onValueChange={v => setSettings(s => ({ ...s, seedance_ratio: v }))}
                    >
                      <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['adaptive','16:9','9:16','1:1','4:3','3:4','21:9'].map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Duration (s)</Label>
                    <Select
                      value={String(settings.duration || 5)}
                      onValueChange={v => setSettings(s => ({ ...s, duration: Number(v) }))}
                    >
                      <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[4,5,6,7,8,9,10,11,12,13,14,15].map(d => (
                          <SelectItem key={d} value={String(d)}>{d}s</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.generate_audio !== false}
                        onChange={e => setSettings(s => ({ ...s, generate_audio: e.target.checked }))}
                        className="accent-[#00ff88]"
                      />
                      Generate synced audio
                    </label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reference-to-Video Assets */}
        {useSeedance && isRefToVideo && (
          <Card className="border-[#00ff88]/40 bg-[#00ff88]/5 backdrop-blur">
            <CardContent className="p-5 space-y-4">
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#00ff88]" /> Reference Assets
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Up to 9 images, 3 videos (≤15s total, ≤50MB each), 3 audios (wav/mp3, 2–15s, ≤15MB).
                  Reference items in your prompt as <span className="text-foreground">image 1</span>, <span className="text-foreground">video 1</span>, etc.
                </p>
              </div>

              {/* Reference Images */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-xs">Reference Images ({refImages.length + refImageUrls.length}/9) — required</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs gap-1 border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/10"
                      onClick={() => setRefLibraryOpen(true)}
                      disabled={refImages.length + refImageUrls.length >= 9}
                    >
                      <Image className="w-3 h-3" /> From Library
                    </Button>
                    {(refImages.length > 0 || refImageUrls.length > 0) && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setRefImages([]); setRefImageUrls([]); }}>Clear</Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 rounded-md transition-colors" onDragOver={preventDrag} onDrop={dropRefImages}>
                  {refImageUrls.map((url, i) => (
                    <div key={`u-${i}`} className="relative group cursor-move"
                      draggable
                      onDragStart={onReorderStart('img', i)}
                      onDragOver={onReorderOver}
                      onDrop={onReorderDropImg(i)}
                      title="Drag to reorder">
                      <img src={url} alt={`lib ref ${i+1}`} className="rounded-md w-full h-20 object-cover bg-background/50 pointer-events-none" />
                      <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">{i+1}</span>
                      <span className="absolute bottom-1 left-1 text-[9px] bg-[#00ff88]/80 text-black px-1 rounded font-medium">LIB</span>
                      <Button variant="destructive" size="sm" className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100" onClick={() => setRefImageUrls(prev => prev.filter((_, j) => j !== i))}>×</Button>
                    </div>
                  ))}
                  {refImages.map((f, i) => {
                    const combinedIdx = refImageUrls.length + i;
                    return (
                    <div key={`f-${i}`} className="relative group cursor-move"
                      draggable
                      onDragStart={onReorderStart('img', combinedIdx)}
                      onDragOver={onReorderOver}
                      onDrop={onReorderDropImg(combinedIdx)}
                      title="Drag to reorder">
                      <img src={URL.createObjectURL(f)} alt={`ref ${combinedIdx + 1}`} className="rounded-md w-full h-20 object-cover bg-background/50 pointer-events-none" />
                      <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">{combinedIdx + 1}</span>
                      <Button variant="destructive" size="sm" className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100" onClick={() => setRefImages(prev => prev.filter((_, j) => j !== i))}>×</Button>
                    </div>
                  );})}

                  {(refImages.length + refImageUrls.length) < 9 && (
                    <label className="border-2 border-dashed border-border/50 rounded-md h-20 flex flex-col items-center justify-center cursor-pointer hover:border-[#00ff88]/50 transition-colors">
                      <Upload className="w-4 h-4 text-muted-foreground/50" />
                      <p className="text-[10px] text-muted-foreground mt-1">Add</p>
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const remaining = 9 - (refImages.length + refImageUrls.length);
                        setRefImages(prev => [...prev, ...files.slice(0, remaining)]);
                        e.target.value = '';
                      }} />
                    </label>
                  )}
                </div>
              </div>


              {/* Reference Videos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Reference Videos ({refVideos.length}/3)</Label>
                  {refVideos.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setRefVideos([])}>Clear</Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2" onDragOver={preventDrag} onDrop={dropRefVideos}>
                  {refVideos.map((f, i) => (
                    <div key={i} className="relative bg-background/50 rounded-md p-2 text-[10px] truncate cursor-move"
                      draggable
                      onDragStart={onReorderStart('vid', i)}
                      onDragOver={onReorderOver}
                      onDrop={onReorderDropVid(i)}
                      title="Drag to reorder">
                      <span className="block truncate">{i+1}. {f.name}</span>
                      <Button variant="destructive" size="sm" className="absolute top-1 right-1 h-5 w-5 p-0" onClick={() => setRefVideos(prev => prev.filter((_, j) => j !== i))}>×</Button>
                    </div>
                  ))}
                  {refVideos.length < 3 && (
                    <label className="border-2 border-dashed border-border/50 rounded-md h-12 flex items-center justify-center cursor-pointer hover:border-[#00ff88]/50 text-[10px] text-muted-foreground">
                      + Add video
                      <input type="file" accept="video/mp4,video/quicktime" multiple className="hidden" onChange={(e) => {
                        const files = Array.from(e.target.files || []).filter(f => f.size <= 50 * 1024 * 1024);
                        setRefVideos(prev => [...prev, ...files].slice(0, 3));
                        e.target.value = '';
                      }} />
                    </label>
                  )}
                </div>
              </div>

              {/* Reference Audios */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Reference Audios ({refAudios.length}/3)</Label>
                  {refAudios.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setRefAudios([])}>Clear</Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2" onDragOver={preventDrag} onDrop={dropRefAudios}>
                  {refAudios.map((f, i) => (
                    <div key={i} className="relative bg-background/50 rounded-md p-2 text-[10px] truncate">
                      <span className="block truncate">{i+1}. {f.name}</span>
                      <Button variant="destructive" size="sm" className="absolute top-1 right-1 h-5 w-5 p-0" onClick={() => setRefAudios(prev => prev.filter((_, j) => j !== i))}>×</Button>
                    </div>
                  ))}
                  {refAudios.length < 3 && (
                    <label className="border-2 border-dashed border-border/50 rounded-md h-12 flex items-center justify-center cursor-pointer hover:border-[#00ff88]/50 text-[10px] text-muted-foreground">
                      + Add audio
                      <input type="file" accept="audio/wav,audio/mpeg,audio/mp3" multiple className="hidden" onChange={(e) => {
                        const files = Array.from(e.target.files || []).filter(f => f.size <= 15 * 1024 * 1024);
                        setRefAudios(prev => [...prev, ...files].slice(0, 3));
                        e.target.value = '';
                      }} />
                    </label>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <Checkbox checked={returnLastFrame} onCheckedChange={(v) => setReturnLastFrame(v === true)} />
                <span className="text-xs text-muted-foreground">Return last frame as a separate image</span>
              </label>
            </CardContent>
          </Card>
        )}


        {/* Style Presets */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardContent className="p-5">
            <Label className="text-sm font-medium mb-3 block">Style Presets</Label>
            <div className="flex flex-wrap gap-2">
              {STYLE_PRESETS.map(s => (
                <Badge
                  key={s}
                  variant={selectedStyles.includes(s) ? 'default' : 'outline'}
                  className={`cursor-pointer transition-colors ${selectedStyles.includes(s) ? 'bg-violet-600 hover:bg-violet-700 border-violet-600' : 'hover:border-violet-500/50'}`}
                  onClick={() => toggleStyle(s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Director Camera Styles — Movie Camera Language Engine (toggled by Director button) */}
        {showDirector && (
          <DirectorCameraStyles
            basePrompt={prompt}
            selectedIds={directorStyleIds}
            onSelectedChange={setDirectorStyleIds}
            onApplyFinalPrompt={(finalPrompt) => setPrompt(finalPrompt)}
          />
        )}

        {/* Generate Button */}
        <Button
          onClick={handleSubmit}
          disabled={submitting || !prompt.trim()}
          className="w-full h-12 text-base gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          {submitting ? 'Submitting...' : 'Generate Video'}
        </Button>
      </div>

      {/* Right Sidebar — Settings */}
      <div className="space-y-4">
        <JobStatusPanel />
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardContent className="p-4 space-y-4">
            <h4 className="text-sm font-semibold">Generation Settings</h4>

            <div>
              <Label className="text-xs">Resolution</Label>
              <Select value={settings.resolution} onValueChange={v => setSettings(s => ({ ...s, resolution: v }))}>
                <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>{RESOLUTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Aspect Ratio</Label>
              <Select value={settings.aspect_ratio} onValueChange={v => setSettings(s => ({ ...s, aspect_ratio: v }))}>
                <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>{ASPECT_RATIOS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Duration: {settings.duration}s</Label>
              <Select value={String(settings.duration)} onValueChange={v => setSettings(s => ({ ...s, duration: Number(v) }))}>
                <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>{DURATIONS.map(d => <SelectItem key={d} value={String(d)}>{d}s</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">FPS</Label>
              <Select value={String(settings.fps)} onValueChange={v => setSettings(s => ({ ...s, fps: Number(v) }))}>
                <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>{FPS_OPTIONS.map(f => <SelectItem key={f} value={String(f)}>{f} fps</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Seed (optional)</Label>
              <Input
                type="number"
                placeholder="Random"
                value={settings.seed ?? ''}
                onChange={e => setSettings(s => ({ ...s, seed: e.target.value ? Number(e.target.value) : undefined }))}
                className="mt-1 bg-background/50"
              />
            </div>

            <div>
              <Label className="text-xs">Guidance Scale: {settings.guidance_scale}</Label>
              <Slider
                value={[settings.guidance_scale || 7]}
                onValueChange={([v]) => setSettings(s => ({ ...s, guidance_scale: v }))}
                min={1} max={20} step={0.5}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-xs">Motion Intensity: {settings.motion_intensity}%</Label>
              <Slider
                value={[settings.motion_intensity || 50]}
                onValueChange={([v]) => setSettings(s => ({ ...s, motion_intensity: v }))}
                min={0} max={100} step={5}
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/30">
          <CardContent className="p-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Shot Type Helper</h4>
            <div className="flex flex-wrap gap-1">
              {SHOT_TYPES.map(s => (
                <Badge
                  key={s}
                  variant="outline"
                  className="text-[10px] cursor-pointer hover:border-violet-500/50"
                  onClick={() => setPrompt(prev => prev ? `${prev}, ${s}` : s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/30">
          <CardContent className="p-3 text-[10px] text-muted-foreground">
            <p>⚡ Higher resolution & duration = longer GPU time.</p>
            <p className="mt-1">💡 Wan2.2 works best with detailed, descriptive prompts.</p>
          </CardContent>
        </Card>
      </div>
    </div>

    <ReferenceLibraryPicker
      open={refLibraryOpen}
      onOpenChange={setRefLibraryOpen}
      projectId={projectId}
      maxSelect={Math.max(0, 9 - (refImages.length + refImageUrls.length))}
      onConfirm={(urls) => setRefImageUrls(prev => [...prev, ...urls].slice(0, 9 - refImages.length))}
    />
  </>
  );
}
