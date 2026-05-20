import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mic, Square, Sparkles, Image as ImageIcon, Download, Loader2, Wand2,
  Film, Camera, Sun, Aperture, Zap, RefreshCw, Maximize2, Clapperboard, Send,
  LayoutGrid, Rows3, Expand, X, ChevronLeft, ChevronRight, Settings2, Eye, Save,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SmartImage } from './SmartImage';
import { SaveAssetButton } from './SaveAssetButton';
import { MovieModePanel } from './MovieModePanel';
import { MovieSceneTree } from './MovieSceneTree';
import { MoviePlayer } from './MoviePlayer';
import {
  DEFAULT_MOVIE_CONFIG, MovieModeConfig, MasterScene, expandStoryboardToMovie,
} from '@/lib/studio/movieMode';
import { SavedStoryboardsMenu } from './SavedStoryboardsMenu';
import { saveStoryboard, type SavedStoryboard } from '@/lib/studio/savedStoryboards';

const DIRECTORS = [
  'Cloverfield','Goodfellas','The Matrix','Inception','HUMBLE.',
  'Mad Max Fury Road','Barry Lyndon','Moonlight','Evil Dead','1917',
] as const;

const ASPECTS = ['16:9','9:16','1:1','2.39:1','4:3'];
const CINEMATIC_STYLES = ['cinematic','documentary','luxury commercial','music video','horror','sci-fi','noir','epic','dreamy','hyper-real'];
const CAMERAS = ['ARRI Alexa LF','RED Komodo','Sony Venice','IMAX 65mm','iPhone Pro','16mm film','Super 35','Vintage anamorphic'];
const LENSES = ['Anamorphic 40mm','Cinema 35mm','Wide 24mm','Telephoto 85mm','Macro 50mm','Fisheye 14mm','Probe lens'];
const MOTION = ['static','slow dolly in','dolly out','crane up','crane down','orbit','tracking shot','handheld','Steadicam glide','whip pan'];
const LIGHTING = ['golden hour','blue hour','neon','natural overcast','tungsten warm','high-key','low-key noir','volumetric god rays','practical lamps','candlelight'];
const IMAGE_PROVIDERS = [
  { id: 'lovable', label: 'Lovable AI (Nano Banana)' },
  { id: 'atlascloud', label: 'GPT-image-2 (AtlasCloud)' },
] as const;

interface Structured {
  scene_description: string;
  camera_movement: string;
  lens_style: string;
  lighting: string;
  emotional_tone: string;
  environment: string;
  cinematic_references: string;
  master_prompt: string;
}

interface Shot {
  number: number;
  title: string;
  shot_type: string;
  camera_move: string;
  lens: string;
  lighting: string;
  description: string;
  seedance_prompt: string;
  image_url?: string;
  image_loading?: boolean;
  image_error?: string;
}

export function StudioComposer() {
  const { toast } = useToast();

  // Settings
  const [label, setLabel] = useState('Untitled Scene');
  const [imageProvider, setImageProvider] = useState<'lovable' | 'atlascloud'>('atlascloud');
  const [aspect, setAspect] = useState('16:9');
  const [style, setStyle] = useState('cinematic');
  const [camera, setCamera] = useState('ARRI Alexa LF');
  const [lens, setLens] = useState('Anamorphic 40mm');
  const [motion, setMotion] = useState('slow dolly in');
  const [lighting, setLighting] = useState('golden hour');
  const [realism, setRealism] = useState([85]);
  const [creativity, setCreativity] = useState([70]);
  const [chaos, setChaos] = useState([20]);
  const [director, setDirector] = useState<string>('');
  const [seedanceModel, setSeedanceModel] = useState<'seedance-2' | 'seedance-2-fast'>('seedance-2-fast');
  const [shotCount, setShotCount] = useState<number>(6);
  const [regenningPanel, setRegenningPanel] = useState<number | null>(null);

  // Prompt + output
  const [prompt, setPrompt] = useState('');
  const [structured, setStructured] = useState<Structured | null>(null);
  const [master, setMaster] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterLoading, setPosterLoading] = useState(false);

  // Redesign state
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [immersion, setImmersion] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [selectedShot, setSelectedShot] = useState<number | null>(null);
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);
  const [lockContinuity, setLockContinuity] = useState(true);

  // Movie Mode
  const [movieConfig, setMovieConfig] = useState<MovieModeConfig>(DEFAULT_MOVIE_CONFIG);
  const [movieScenes, setMovieScenes] = useState<MasterScene[]>([]);
  const [moviePlayerOpen, setMoviePlayerOpen] = useState(false);
  const approvedClipCount = movieScenes.reduce(
    (n, m) => n + m.subs.filter((s) => s.videoUrl && s.status !== 'rejected').length,
    0,
  );

  // ── Saved storyboards (freeze / resume) ─────────────────────────────────
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);

  const handleSaveSession = () => {
    const name = (label || 'Untitled Scene').trim();
    saveStoryboard(name, {
      label, director, aspect, imageProvider, seedanceModel, shotCount,
      realism, creativity, chaos,
      prompt, structured, master,
      shots, posterUrl,
      movieConfig, movieScenes,
    });
    setSavedRefreshKey((k) => k + 1);
    toast({ title: 'Storyboard saved', description: `"${name}" frozen for later.` });
  };

  const handleLoadSession = (s: SavedStoryboard) => {
    const p = s.payload as Record<string, any>;
    if (typeof p.label === 'string') setLabel(p.label);
    if (typeof p.director === 'string') setDirector(p.director);
    if (typeof p.aspect === 'string') setAspect(p.aspect);
    if (p.imageProvider === 'lovable' || p.imageProvider === 'atlascloud') setImageProvider(p.imageProvider);
    if (p.seedanceModel === 'seedance-2' || p.seedanceModel === 'seedance-2-fast') setSeedanceModel(p.seedanceModel);
    if (typeof p.shotCount === 'number') setShotCount(p.shotCount);
    if (Array.isArray(p.realism)) setRealism(p.realism);
    if (Array.isArray(p.creativity)) setCreativity(p.creativity);
    if (Array.isArray(p.chaos)) setChaos(p.chaos);
    if (typeof p.prompt === 'string') setPrompt(p.prompt);
    if (p.structured) setStructured(p.structured);
    if (typeof p.master === 'string') setMaster(p.master);
    if (Array.isArray(p.shots)) setShots(p.shots);
    if (typeof p.posterUrl === 'string' || p.posterUrl === null) setPosterUrl(p.posterUrl);
    if (p.movieConfig) setMovieConfig(p.movieConfig);
    if (Array.isArray(p.movieScenes)) setMovieScenes(p.movieScenes);
  };


  // Re-expand whenever shots, sub-count, or poster change while Movie Mode is on
  useEffect(() => {
    if (!movieConfig.enabled) return;
    setMovieScenes((prev) =>
      expandStoryboardToMovie(
        shots.map((s) => ({ number: s.number, title: s.title, description: s.description, image_url: s.image_url })),
        movieConfig.subsPerScene,
        movieConfig.durationSec,
        posterUrl ?? undefined,
        prev,
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieConfig.enabled, movieConfig.subsPerScene, movieConfig.durationSec, shots, posterUrl]);

  // Loading states
  const [enhancing, setEnhancing] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [storyboarding, setStoryboarding] = useState(false);
  const [sendingTo, setSendingTo] = useState<number | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  // Voice
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const settingsExtra = useMemo(() => {
    return `Visual constraints: aspect ${aspect}, ${camera} on ${lens}, ${motion} camera, ${lighting} lighting, ` +
      `${style} grade, realism ${realism[0]}/100, creativity ${creativity[0]}/100, chaos ${chaos[0]}/100.`;
  }, [aspect, camera, lens, motion, lighting, style, realism, creativity, chaos]);

  const generateStillImage = async (imagePrompt: string, size: string) => {
    if (imageProvider !== 'atlascloud') {
      const { data, error } = await supabase.functions.invoke('story-composer/image', {
        body: { prompt: imagePrompt, provider: imageProvider, size, quality: 'high' },
      });
      if (error) throw error;
      const d = data as { imageUrl?: string; error?: string };
      if (d.error || !d.imageUrl) throw new Error(d.error || 'No image returned');
      return d.imageUrl;
    }

    const { data, error } = await supabase.functions.invoke('story-composer/image-start', {
      body: { prompt: imagePrompt, size, quality: 'high' },
    });
    if (error) throw error;
    const started = data as { jobId?: string; error?: string };
    if (started.error || !started.jobId) throw new Error(started.error || 'No image job id returned');

    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const { data: statusData, error: statusError } = await supabase.functions.invoke('story-composer/image-status', {
        body: { jobId: started.jobId },
      });
      if (statusError) continue;
      const status = statusData as { status?: string; imageUrl?: string; error?: string };
      if (status.status === 'completed' && status.imageUrl) return status.imageUrl;
      if (status.status === 'failed') throw new Error(status.error || 'Image generation failed');
    }

    throw new Error('Image still rendering after 6 minutes — try regenerating this panel');
  };

  // ---- voice ----
  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const r = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      r.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      r.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size < 500) {
          toast({ title: 'No audio captured', variant: 'destructive' });
          return;
        }
        await sendVoice(blob);
      };
      r.start();
      recRef.current = r;
      setRecording(true);
    } catch (e) {
      toast({ title: 'Mic blocked', description: (e as Error).message, variant: 'destructive' });
    }
  };
  const stopVoice = () => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };
  const sendVoice = async (blob: Blob) => {
    setVoiceBusy(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voice.webm');
      fd.append('current', prompt);
      if (director) fd.append('director', director);
      const { data, error } = await supabase.functions.invoke('story-composer/transcribe', { body: fd });
      if (error) throw error;
      const d = data as { transcript?: string; master?: string; structured?: Structured; error?: string };
      if (d.error) throw new Error(d.error);
      if (d.master) {
        setPrompt(d.master);
        setMaster(d.master);
      }
      if (d.structured) setStructured(d.structured);
      toast({ title: 'Voice captured', description: d.transcript?.slice(0, 100) });
    } catch (e) {
      toast({ title: 'Voice failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setVoiceBusy(false);
    }
  };

  // ---- actions ----
  const enhance = async () => {
    if (!prompt.trim()) return toast({ title: 'Add a prompt first', variant: 'destructive' });
    setEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('story-composer/enhance', {
        body: { prompt, director, style, extra: settingsExtra },
      });
      if (error) throw error;
      const d = data as { master: string; structured: Structured; error?: string };
      if (d.error) throw new Error(d.error);
      setStructured(d.structured);
      setMaster(d.master);
      setPrompt(d.master);
      toast({ title: 'Prompt enhanced' });
    } catch (e) {
      toast({ title: 'Enhance failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setEnhancing(false);
    }
  };

  const generateImage = async () => {
    const text = master || prompt;
    if (!text.trim()) return toast({ title: 'Add a prompt first', variant: 'destructive' });
    setGeneratingImage(true);
    try {
      const size = aspect === '9:16' ? '1024x1536' : aspect === '1:1' ? '1024x1024' : '1536x1024';
      const generatedUrl = await generateStillImage(text, size);
      setImageUrl(generatedUrl);
      toast({ title: 'Image generated' });
    } catch (e) {
      toast({ title: 'Image gen failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setGeneratingImage(false);
    }
  };

  // Continuity anchor: snapshot wardrobe / lens / lighting / framing from the
  // most recent *earlier* approved (= rendered) shot, so regen preserves it.
  const buildContinuityAnchor = (beforeNumber: number): string => {
    if (!lockContinuity) return '';
    const prior = [...shots]
      .filter((p) => p.number < beforeNumber && p.image_url)
      .sort((a, b) => b.number - a.number)[0];
    if (!prior) return '';
    return [
      '',
      'CONTINUITY LOCK — preserve EXACTLY from the previous approved beat:',
      `• Reference shot: #${String(prior.number).padStart(2, '0')} — "${prior.title}"`,
      `• Wardrobe & character: identical to that beat (same actors, same outfits, same hair, same props in hand)`,
      `• Lens: ${prior.lens || 'Cinema 35mm'} (do not change)`,
      `• Lighting: ${prior.lighting || 'natural'} (same direction, same intensity, same colour temperature)`,
      `• Camera language: ${prior.camera_move || 'Eye-Level'} continuity`,
      `• Character positions / blocking: maintain spatial relationships from the prior beat`,
      `• Environment / set dressing: identical location, identical props, identical weather`,
      'Only ACTION and framing should advance — everything else stays locked.',
      '',
    ].join('\n');
  };

  const buildPanelPrompt = (s: Shot) => {
    const shotTag = (s.shot_type || 'MS').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 6) || 'MS';
    const camTag = (s.camera_move || 'Eye-Level').replace(/\s+/g, ' ').slice(0, 28);
    const anchor = buildContinuityAnchor(s.number);
    return (
`A single page from a REAL Hollywood pre-production storyboard binder — high-resolution JPEG scan of an analog shot-planning sheet. Not AI art, not concept art, not a film still, not a moodboard. This is a professional director's storyboard document.
${anchor}
LAYOUT (one shot row, fills the page):
- LEFT COLUMN (about 35% width): a printed/handwritten technical metadata table with these labeled fields stacked vertically, monospace/typewriter typography:
    SHOT #${String(s.number).padStart(2, '0')}
    SHOT TYPE: ${shotTag}
    CAMERA: ${camTag}
    LENS: ${s.lens || 'Cinema 35mm'}
    LIGHTING: ${s.lighting || 'natural'}
    SCENE: ${s.title}
    ACTION: ${s.description}
    NOTES: handwritten cinematography annotations (focus, framing, emotion)
- RIGHT COLUMN (about 65% width): a rough but professional GRAPHITE PENCIL storyboard sketch frame inside a thin black rectangular border with rounded corners, depicting: ${s.description}. Hand-drawn grayscale linework, film-school previs quality, pencil pressure variation, light smudges, motion arrows / camera-push arrows where appropriate, framing crosshairs, focus indicators.

PAGE STYLE:
- Off-white aged paper texture, faint horizontal ruled lines, subtle graphite smudges, slight scan imperfection.
- Header strip across the top with project slug, page number, and date stamp (small, typewriter).
- Footer strip with tiny director's-notebook annotations.
- Overall feel: Christopher Nolan production board / Netflix previs packet / real studio shot-planning sheet.

STRICTLY AVOID: polished AI render, color photograph, comic book panel, anime, hyperreal concept art, social media card, Pinterest collage, glossy magazine layout, gold borders, marketing poster. The frame artwork must be grayscale graphite, not painted, not photographic.`);
  };

  const renderPanelImage = async (s: Shot) => {
    const size = aspect === '9:16' ? '1024x1536' : aspect === '1:1' ? '1024x1024' : '1536x1024';
    try {
      const generatedUrl = await generateStillImage(buildPanelPrompt(s), size);
      setShots((prev) => prev.map((p) => p.number === s.number ? { ...p, image_url: generatedUrl, image_loading: false, image_error: undefined } : p));
    } catch (e) {
      setShots((prev) => prev.map((p) => p.number === s.number ? { ...p, image_loading: false, image_error: (e as Error).message } : p));
    }
  };

  const regeneratePanel = async (n: number) => {
    setRegenningPanel(n);
    setShots((prev) => prev.map((p) => p.number === n ? { ...p, image_loading: true, image_error: undefined } : p));
    const cur = shots.find((s) => s.number === n);
    if (cur) await renderPanelImage(cur);
    setRegenningPanel(null);
  };

  const updateShotField = (n: number, field: keyof Shot, value: string) => {
    setShots((prev) => prev.map((p) => p.number === n ? { ...p, [field]: value } : p));
  };

  const buildStoryboard = async () => {
    const text = master || prompt;
    if (!text.trim()) return toast({ title: 'Add a prompt first', variant: 'destructive' });
    setStoryboarding(true);
    try {
      const { data, error } = await supabase.functions.invoke('story-composer/storyboard', {
        body: { prompt: text, shots: shotCount, director },
      });
      if (error) throw error;
      const d = data as { shots?: Shot[]; error?: string };
      if (d.error || !d.shots) throw new Error(d.error || 'No shots');
      const seeded = d.shots.map((s) => ({ ...s, image_loading: true }));
      setShots(seeded);
      toast({ title: `Storyboard built — ${seeded.length} shots`, description: 'Rendering panel images…' });
      await Promise.all(seeded.map(renderPanelImage));
    } catch (e) {
      toast({ title: 'Storyboard failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setStoryboarding(false);
    }
  };



  const sendShotToSeedance = async (shot: Shot) => {
    setSendingTo(shot.number);
    try {
      const anchor = buildContinuityAnchor(shot.number);
      const fullPrompt = anchor ? `${anchor}\n${shot.seedance_prompt}` : shot.seedance_prompt;
      const { data, error } = await supabase.functions.invoke('story-composer/seedance', {
        body: { prompt: fullPrompt, model: seedanceModel, aspect, image_url: imageUrl || undefined },
      });
      if (error) throw error;
      const d = data as { job?: { id?: string }; error?: string };
      if (d.error) throw new Error(d.error);
      toast({ title: `Shot ${shot.number} queued`, description: `Seedance job ${d.job?.id?.slice(0, 8) || ''} → check Queue tab` });
    } catch (e) {
      toast({ title: 'Seedance queue failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSendingTo(null);
    }
  };

  const sendAllToSeedance = async () => {
    for (const s of shots) await sendShotToSeedance(s);
  };

  const generatePoster = async () => {
    if (!shots.length) return toast({ title: 'Generate a storyboard first', variant: 'destructive' });
    setPosterLoading(true);
    setPosterUrl(null);
    try {
      const title = (label || 'Untitled Scene').toUpperCase();
      const shotLines = shots.map((s) => {
        const shotTag = (s.shot_type || 'MS').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 6) || 'MS';
        return `ROW ${String(s.number).padStart(2, '0')} | ${shotTag} | ${s.camera_move || 'Eye-Level'} | "${s.title}" — ACTION: ${s.description} | NOTES: ${s.lens || 'Cinema 35mm'}, ${s.lighting || 'natural'}`;
      }).join('\n');
      const posterPrompt =
`A single high-resolution JPEG scan of a REAL Hollywood pre-production storyboard document — a multi-row shot breakdown sheet pulled from a director's binder. NOT AI art, NOT a moodboard, NOT a pitch-deck poster, NOT concept art, NOT a magazine layout, NOT a social card. This is an authentic analog storyboard page.

PAGE HEADER (small, typewriter / monospace, across the top):
PROJECT: ${title}    |    DIRECTOR: ${director || 'N/A'}    |    PAGE 1 of 1    |    DATE: pre-production

BODY: a vertical stack of ${shots.length} horizontal SHOT ROWS, each row separated by a thin ruled line. Each row contains:
- LEFT (about 35%): printed metadata table with labeled fields — SHOT #, SHOT TYPE (WS/MS/CU/ECU/OTS/POV/LOW/HIGH/DUTCH/TRACK/HANDHELD/CRANE/STEADICAM), CAMERA ANGLE, SCENE TITLE, ACTION DESCRIPTION (cinematic prose), optional DIALOGUE block formatted like a screenplay (CHARACTER NAME centered, parenthetical direction, line of dialogue), and CINEMATIC NOTES with handwritten annotations.
- RIGHT (about 65%): a rough but professional GRAPHITE PENCIL storyboard sketch frame inside a thin black bordered rectangle, depicting that row's action. Hand-drawn grayscale linework, motion arrows, camera-push arrows, framing crosshairs, focus indicators, lens notes scribbled in the margin.

ROWS TO RENDER (use these exact metadata; sketch the action faithfully):
${shotLines}

PAGE STYLE:
- Off-white aged paper texture, faint horizontal ruled lines, graphite smudges, light scan imperfections, subtle aging.
- Typewriter / monospace printed text for labels; handwritten pencil for marginal notes.
- All sketch frames are GRAYSCALE GRAPHITE — never color, never painted, never photographic.
- Maintain character, wardrobe, and environment continuity across every row.
- Overall feel: Christopher Nolan production board, Netflix previs packet, real studio shot-planning binder page.

FOOTER: tiny line of director's notes and a small page number.

STRICTLY AVOID: gold borders, glossy magazine design, color cinematic film stills, polished AI renders, comic-book panels, anime, Pinterest collage, marketing poster aesthetic.`;
      const { data, error } = await supabase.functions.invoke('story-composer/image-start', {
        body: { prompt: posterPrompt, size: '1024x1536', quality: 'high' },
      });
      if (error) throw error;
      const startData = data as { jobId?: string; error?: string };
      if (startData.error || !startData.jobId) throw new Error(startData.error || 'No job id returned');

      // Poll status every 4s, up to 5 minutes
      const jobId = startData.jobId;
      let imageUrl: string | null = null;
      for (let i = 0; i < 75; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const { data: s, error: sErr } = await supabase.functions.invoke('story-composer/image-status', {
          body: { jobId },
        });
        if (sErr) continue;
        const sd = s as { status?: string; imageUrl?: string; error?: string };
        if (sd.status === 'completed' && sd.imageUrl) { imageUrl = sd.imageUrl; break; }
        if (sd.status === 'failed') throw new Error(sd.error || 'Poster generation failed');
      }
      if (!imageUrl) throw new Error('Poster still rendering after 5 minutes — try again');
      // Convert to blob URL so the <img> preview works even if the remote host
      // blocks hot-linking / cross-origin <img> loads (download link still uses original).
      try {
        const resp = await fetch(imageUrl);
        const blob = await resp.blob();
        setPosterUrl(URL.createObjectURL(blob));
      } catch {
        setPosterUrl(imageUrl);
      }
      toast({ title: 'Storyboard poster generated' });
    } catch (e) {
      toast({ title: 'Poster failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setPosterLoading(false);
    }
  };

  // ---- export ----
  const downloadFile = (name: string, content: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const exportTxt = () => downloadFile(`${label.replace(/\s+/g, '_')}.txt`,
    [`# ${label}`, master, '', structured && Object.entries(structured).map(([k, v]) => `## ${k}\n${v}`).join('\n\n'),
      shots.length && '\n## STORYBOARD', ...shots.map((s) => `### Shot ${s.number} — ${s.title}\n${s.seedance_prompt}`)].filter(Boolean).join('\n\n'));
  const exportJson = () => downloadFile(`${label.replace(/\s+/g, '_')}.json`,
    JSON.stringify({ label, settings: { aspect, style, camera, lens, motion, lighting, director, realism: realism[0], creativity: creativity[0], chaos: chaos[0] }, master, structured, shots }, null, 2),
    'application/json');

  // cleanup
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return (
    <div className="relative -mx-4 sm:-mx-6 md:-mx-8 -mt-2">
      {/* Starfield bg */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(250,204,21,0.04)_0%,_transparent_50%),radial-gradient(ellipse_at_top_left,_rgba(99,102,241,0.06)_0%,_transparent_40%)]" />
        <div className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.6), transparent), radial-gradient(1px 1px at 60% 70%, rgba(255,255,255,0.4), transparent), radial-gradient(1.5px 1.5px at 80% 20%, rgba(250,204,21,0.6), transparent), radial-gradient(1px 1px at 30% 80%, rgba(255,255,255,0.3), transparent), radial-gradient(1px 1px at 90% 50%, rgba(255,255,255,0.5), transparent)',
            backgroundSize: '400px 400px',
          }}
        />
      </div>

      <div className="relative px-4 sm:px-6 md:px-8 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-[0_0_24px_rgba(250,204,21,0.4)]">
              <Clapperboard className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Story Prompt Composer</h2>
              <p className="text-xs text-muted-foreground">AI-powered Hollywood directing operating system</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-48 h-9 bg-black/40 border-white/10" />
            <Button variant="outline" size="sm" onClick={exportTxt} disabled={!master} className="border-white/10 bg-black/40">
              <Download className="w-3.5 h-3.5 mr-1" /> .txt
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson} disabled={!master} className="border-white/10 bg-black/40">
              <Download className="w-3.5 h-3.5 mr-1" /> .json
            </Button>
          </div>
        </div>

        <div className="space-y-4 relative">
          {/* TOP — PROMPT BAR (collapsed in immersion) */}
          {!immersion && (
            <Panel title="PROMPT" icon={<Wand2 className="w-3.5 h-3.5" />} action={
              structured ? (
                <button
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="text-[10px] uppercase tracking-wider text-yellow-300/70 hover:text-yellow-300"
                >
                  {settingsOpen ? 'Hide breakdown' : 'Show breakdown'}
                </button>
              ) : undefined
            }>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the scene… e.g. 'luxury modern house at sunset with a realtor walking outside'"
                  className="min-h-[100px] bg-black/40 border-white/10 font-mono text-sm resize-none focus-visible:ring-yellow-400/50"
                />
                <div className="flex lg:flex-col flex-wrap gap-2 lg:w-44">
                  <Button onClick={enhance} disabled={enhancing} className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black hover:from-yellow-300 hover:to-amber-400 shadow-[0_0_18px_rgba(250,204,21,0.35)] flex-1 lg:w-full" size="sm">
                    {enhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Enhance
                  </Button>
                  {recording ? (
                    <Button onClick={stopVoice} size="sm" variant="destructive" className="animate-pulse flex-1 lg:w-full">
                      <Square className="w-3.5 h-3.5 fill-current" /> Stop
                    </Button>
                  ) : (
                    <Button onClick={startVoice} disabled={voiceBusy} size="sm" variant="outline" className="border-white/10 bg-black/40 flex-1 lg:w-full">
                      {voiceBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                      Voice
                    </Button>
                  )}
                  <Button onClick={generateImage} disabled={generatingImage} size="sm" variant="outline" className="border-white/10 bg-black/40 flex-1 lg:w-full">
                    {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    Hero Image
                  </Button>
                </div>
              </div>

              {/* Director presets — horizontal */}
              <div className="pt-3 border-t border-white/5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mr-1">
                    <Film className="w-3 h-3" /> Director
                  </Label>
                  {DIRECTORS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDirector(director === d ? '' : d)}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-all ${
                        director === d
                          ? 'bg-yellow-400 text-black border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.5)]'
                          : 'border-white/10 bg-black/40 text-muted-foreground hover:border-yellow-400/40 hover:text-yellow-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inline structured breakdown (collapsible) */}
              {structured && settingsOpen && (
                <div className="pt-3 border-t border-white/5">
                  <ScrollArea className="max-h-56 pr-2">
                    <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                      {Object.entries(structured).filter(([k]) => k !== 'master_prompt').map(([k, v]) => (
                        <div key={k}>
                          <dt className="uppercase tracking-wider text-yellow-300/80 mb-0.5 text-[10px]">{k.replace(/_/g, ' ')}</dt>
                          <dd className="text-muted-foreground leading-relaxed">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </ScrollArea>
                </div>
              )}
            </Panel>
          )}

          {/* STORYBOARD CINEMATIC WALL — FULL WIDTH */}
          <div className="w-full">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-950/90 to-black overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.05)]">
              {/* TOP TOOLBAR */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 bg-black/60 backdrop-blur-xl flex-wrap">
                <div className="flex items-center gap-2">
                  <Clapperboard className="w-4 h-4 text-yellow-300" />
                  <span className="text-[11px] font-semibold tracking-[0.2em] text-yellow-300/90">
                    {shots.length ? `STORYBOARD WALL · ${shots.length} SHOTS` : 'STORYBOARD WALL'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Select value={String(shotCount)} onValueChange={(v) => setShotCount(Number(v))}>
                    <SelectTrigger className="w-24 h-8 bg-black/60 border-white/10 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[4, 6, 8, 10, 12].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} shots</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={buildStoryboard}
                    disabled={storyboarding}
                    size="sm"
                    className="h-8 bg-gradient-to-r from-yellow-400 to-amber-500 text-black hover:from-yellow-300 hover:to-amber-400 font-semibold shadow-[0_0_18px_rgba(250,204,21,0.35)]"
                  >
                    {storyboarding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clapperboard className="w-3.5 h-3.5" />}
                    {shots.length ? 'Regenerate' : 'Generate'}
                  </Button>

                  {shots.length > 0 && (
                    <>
                      <div className="h-6 w-px bg-white/10 mx-1" />
                      <div className="flex bg-black/60 rounded-md border border-white/10 p-0.5">
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-yellow-400/20 text-yellow-300' : 'text-muted-foreground hover:text-yellow-300'}`}
                          title="Grid mode"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setViewMode('timeline')}
                          className={`p-1.5 rounded transition-all ${viewMode === 'timeline' ? 'bg-yellow-400/20 text-yellow-300' : 'text-muted-foreground hover:text-yellow-300'}`}
                          title="Timeline mode"
                        >
                          <Rows3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <Button onClick={generatePoster} disabled={posterLoading} size="sm" variant="outline" className="h-8 text-xs bg-black/40 text-yellow-300 border-yellow-400/30 hover:bg-yellow-400/10">
                        {posterLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                        Poster
                      </Button>
                      <Button onClick={sendAllToSeedance} disabled={sendingTo !== null} size="sm" className="h-8 text-xs bg-yellow-400 text-black hover:bg-yellow-300">
                        <Send className="w-3 h-3" /> Queue all
                      </Button>
                      <Button
                        onClick={() => setImmersion((v) => !v)}
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs bg-black/40 border-white/10 hover:border-yellow-400/40"
                        title="Director Immersion Mode"
                      >
                        <Expand className="w-3 h-3" /> {immersion ? 'Exit' : 'Immersion'}
                      </Button>
                      <Button
                        onClick={() => setLockContinuity((v) => !v)}
                        size="sm"
                        variant="outline"
                        className={`h-8 text-xs border ${lockContinuity
                          ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/25'
                          : 'bg-black/40 border-white/10 text-white/60 hover:border-emerald-400/40'}`}
                        title="Lock wardrobe, lens, lighting & character positions from the last approved beat"
                      >
                        {lockContinuity ? '🔒' : '🔓'} Continuity
                      </Button>
                      <SavedStoryboardsMenu onLoad={handleLoadSession} refreshKey={savedRefreshKey} />
                    </>
                  )}

                  {/* Settings drawer trigger (Batch-style) */}
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs bg-black/40 border-white/10 hover:border-yellow-400/40"
                        title="Cinematic settings"
                      >
                        <Settings2 className="w-3 h-3" /> Settings
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-full sm:max-w-md bg-zinc-950 border-l border-yellow-400/20 flex flex-col p-0">
                      <SheetHeader className="p-5 border-b border-white/10">
                        <SheetTitle className="flex items-center gap-2 text-yellow-300">
                          <Aperture className="w-4 h-4" /> Cinematic Settings
                        </SheetTitle>
                      </SheetHeader>
                      <ScrollArea className="flex-1 p-5">
                        <Tabs defaultValue="visual" className="w-full">
                          <TabsList className="grid grid-cols-2 bg-black/40 border border-white/5 w-full">
                            <TabsTrigger value="visual" className="text-xs data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">Visual</TabsTrigger>
                            <TabsTrigger value="engine" className="text-xs data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">Engine</TabsTrigger>
                          </TabsList>

                          <TabsContent value="visual" className="space-y-4 pt-4">
                            <SettingSelect label="Aspect Ratio" icon={<Maximize2 className="w-3 h-3" />} value={aspect} onChange={setAspect} options={ASPECTS} />
                            <SettingSelect label="Cinematic Style" icon={<Film className="w-3 h-3" />} value={style} onChange={setStyle} options={CINEMATIC_STYLES} />
                            <SettingSelect label="Camera" icon={<Camera className="w-3 h-3" />} value={camera} onChange={setCamera} options={CAMERAS} />
                            <SettingSelect label="Lens" icon={<Aperture className="w-3 h-3" />} value={lens} onChange={setLens} options={LENSES} />
                            <SettingSelect label="Motion" icon={<Zap className="w-3 h-3" />} value={motion} onChange={setMotion} options={MOTION} />
                            <SettingSelect label="Lighting" icon={<Sun className="w-3 h-3" />} value={lighting} onChange={setLighting} options={LIGHTING} />
                          </TabsContent>

                          <TabsContent value="engine" className="space-y-4 pt-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Image Model</Label>
                              <Select value={imageProvider} onValueChange={(v) => setImageProvider(v as any)}>
                                <SelectTrigger className="bg-black/40 border-white/10 h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>{IMAGE_PROVIDERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Seedance Model</Label>
                              <Select value={seedanceModel} onValueChange={(v) => setSeedanceModel(v as any)}>
                                <SelectTrigger className="bg-black/40 border-white/10 h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="seedance-2-fast">Seedance 2 Fast</SelectItem>
                                  <SelectItem value="seedance-2">Seedance 2 (Quality)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <SettingSlider label="Realism Strength" value={realism} onChange={setRealism} />
                            <SettingSlider label="Prompt Creativity" value={creativity} onChange={setCreativity} />
                            <SettingSlider label="Chaos Level" value={chaos} onChange={setChaos} />
                          </TabsContent>
                        </Tabs>
                      </ScrollArea>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>

              {/* MOVIE MODE PANEL */}
              <div className="px-4 pt-3">
                <MovieModePanel
                  config={movieConfig}
                  onChange={setMovieConfig}
                  masterCount={shots.length}
                />
              </div>

              {/* CINEMATIC CANVAS */}
              <div className="relative p-4 md:p-6 min-h-[60vh]">
                {/* Atmospheric layers */}
                <div className="absolute inset-0 pointer-events-none opacity-60"
                  style={{
                    backgroundImage: 'radial-gradient(ellipse at center, rgba(250,204,21,0.06) 0%, transparent 60%), radial-gradient(ellipse at top, rgba(99,102,241,0.04) 0%, transparent 50%)',
                  }}
                />
                <div className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
                  style={{
                    backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>")',
                  }}
                />

                <div className="relative">
                  {shots.length === 0 ? (
                    <div className="aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-black via-zinc-950 to-black border border-white/10 flex items-center justify-center">
                      <div className="text-center text-muted-foreground text-sm space-y-3 p-6">
                        {storyboarding ? (
                          <>
                            <Loader2 className="w-10 h-10 animate-spin mx-auto text-yellow-400" />
                            <p className="text-yellow-300/90">Building cinematic storyboard…</p>
                            <p className="text-[11px] opacity-60">Composing {shotCount} sequential shots with continuity</p>
                          </>
                        ) : (
                          <>
                            <Clapperboard className="w-14 h-14 mx-auto opacity-30" />
                            <p className="text-base">Your Hollywood storyboard wall</p>
                            <p className="text-[11px] opacity-60">{shotCount} cinematic shots will appear here</p>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {(posterLoading || posterUrl) && (
                    <div className="mt-6 rounded-2xl border border-yellow-400/30 bg-black/60 overflow-hidden shadow-[0_0_40px_rgba(250,204,21,0.15)]">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                        <span className="text-[11px] uppercase tracking-[0.2em] text-yellow-300/90">Storyboard Poster · gpt-image-2</span>
                        <div className="flex items-center gap-2">
                          {posterUrl && (
                            <SaveAssetButton url={posterUrl} name={`Poster — ${label}`} notes="Storyboard poster" withDelete />
                          )}
                          {posterUrl && (
                            <a href={posterUrl} target="_blank" rel="noreferrer" download className="text-[11px] text-yellow-300 hover:underline flex items-center gap-1">
                              <Download className="w-3 h-3" /> Open
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="aspect-[3/2] bg-black flex items-center justify-center">
                        {posterLoading ? (
                          <div className="text-center text-xs text-yellow-300/80 space-y-2">
                            <Loader2 className="w-7 h-7 animate-spin mx-auto" />
                            <p>Composing poster with gpt-image-2…</p>
                            <p className="text-[10px] opacity-60">This can take 30-60s</p>
                          </div>
                        ) : (
                          <SmartImage
                            src={posterUrl!}
                            alt="Storyboard poster"
                            className="w-full h-full object-contain cursor-zoom-in"
                            onDoubleClick={() => posterUrl && setFullscreenImg(posterUrl)}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* MOVIE MODE — sub-storyboards */}
                  {movieConfig.enabled && shots.length > 0 && (
                    <>
                      <div className="flex items-center justify-between mt-4 mb-1 px-1">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">
                          {approvedClipCount} clip{approvedClipCount === 1 ? '' : 's'} ready
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setMoviePlayerOpen(true)}
                          disabled={approvedClipCount === 0}
                          className="h-8 text-[11px] bg-emerald-500 hover:bg-emerald-400 text-black font-semibold"
                        >
                          ▶ Play Movie
                        </Button>
                      </div>
                      <MovieSceneTree
                        scenes={movieScenes}
                        posterRefUrl={posterUrl ?? undefined}
                        onUpdate={setMovieScenes}
                        seedanceModel={seedanceModel}
                        aspect={aspect}
                        onEnlarge={setFullscreenImg}
                        lockContinuity={lockContinuity}
                      />
                    </>
                  )}

                  {/* SAVE FOR LATER — bottom of canvas */}
                  {(shots.length > 0 || posterUrl) && (
                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl border border-yellow-400/20 bg-gradient-to-r from-black/60 via-zinc-950/60 to-black/60">
                      <div className="text-xs text-yellow-200/80 text-center sm:text-left">
                        <div className="font-semibold uppercase tracking-[0.18em] text-[10px] text-yellow-300/90">Freeze for later</div>
                        <div className="text-white/60 mt-0.5">
                          Saves the entire storyboard ({shots.length} shot{shots.length === 1 ? '' : 's'}
                          {posterUrl ? ' + poster' : ''}
                          {movieConfig.enabled ? ` + ${movieScenes.reduce((n, m) => n + m.subs.length, 0)} movie sub-scenes` : ''}
                          ) under project name <span className="text-yellow-300 font-mono">"{label || 'Untitled Scene'}"</span>.
                        </div>
                      </div>
                      <Button
                        onClick={handleSaveSession}
                        size="sm"
                        className="h-9 px-4 text-xs bg-yellow-400 hover:bg-yellow-300 text-black font-semibold"
                      >
                        <Save className="w-3.5 h-3.5 mr-1.5" /> Save Storyboard
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MoviePlayer open={moviePlayerOpen} onOpenChange={setMoviePlayerOpen} scenes={movieScenes} />

      {/* FULLSCREEN IMAGE VIEWER (any storyboard image — double-click to open) */}
      <Dialog open={fullscreenImg !== null} onOpenChange={(o) => !o && setFullscreenImg(null)}>
        <DialogContent className="max-w-[98vw] lg:max-w-[1800px] p-0 bg-black border-yellow-400/20 overflow-hidden">
          {fullscreenImg && (
            <div className="w-full h-[95vh] flex items-center justify-center bg-black">
              <SmartImage
                src={fullscreenImg}
                alt="Storyboard fullscreen"
                className="max-w-full max-h-full object-contain cursor-zoom-out"
                onClick={() => setFullscreenImg(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* FULLSCREEN SHOT VIEWER */}
      <Dialog open={selectedShot !== null} onOpenChange={(o) => !o && setSelectedShot(null)}>
        <DialogContent className="max-w-[95vw] lg:max-w-[1400px] p-0 bg-zinc-950 border-yellow-400/20 overflow-hidden">
          {(() => {
            const s = shots.find((x) => x.number === selectedShot);
            if (!s) return null;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] max-h-[90vh]">
                <div className="relative bg-black flex items-center justify-center min-h-[50vh]">
                  {s.image_url ? (
                    <SmartImage src={s.image_url} alt={s.title} className="max-w-full max-h-[90vh] object-contain" />
                  ) : s.image_loading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-yellow-400" />
                  ) : (
                    <div className="text-xs text-red-300/70 p-4">{s.image_error || 'No image yet'}</div>
                  )}
                  <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/80 border border-yellow-400/50 text-xs font-mono text-yellow-300">
                    SHOT #{String(s.number).padStart(2, '0')} / {shots.length}
                  </div>
                  <Badge className="absolute top-3 right-3 bg-black/80 border border-yellow-400/40 text-yellow-300 hover:bg-black/80">
                    {inferShotTag(s)}
                  </Badge>
                  <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
                    <button
                      onClick={() => {
                        const idx = shots.findIndex((x) => x.number === s.number);
                        if (idx > 0) setSelectedShot(shots[idx - 1].number);
                      }}
                      className="p-2 rounded-full bg-black/80 border border-white/10 text-white/80 hover:text-yellow-300 hover:border-yellow-400/40 disabled:opacity-30"
                      disabled={shots.findIndex((x) => x.number === s.number) === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const idx = shots.findIndex((x) => x.number === s.number);
                        if (idx < shots.length - 1) setSelectedShot(shots[idx + 1].number);
                      }}
                      className="p-2 rounded-full bg-black/80 border border-white/10 text-white/80 hover:text-yellow-300 hover:border-yellow-400/40 disabled:opacity-30"
                      disabled={shots.findIndex((x) => x.number === s.number) === shots.length - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="border-l border-white/10 bg-zinc-950 p-5 overflow-y-auto space-y-4">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-yellow-300/80">Title</Label>
                    <Input
                      value={s.title}
                      onChange={(e) => updateShotField(s.number, 'title', e.target.value)}
                      className="bg-black/40 border-white/10 text-sm font-semibold mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-yellow-300/80">Shot Type</Label>
                      <Input value={s.shot_type} onChange={(e) => updateShotField(s.number, 'shot_type', e.target.value)} className="bg-black/40 border-white/10 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-yellow-300/80">Camera Move</Label>
                      <Input value={s.camera_move} onChange={(e) => updateShotField(s.number, 'camera_move', e.target.value)} className="bg-black/40 border-white/10 text-xs mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-yellow-300/80">Lens</Label>
                      <div className="text-xs text-muted-foreground mt-1 px-2 py-1.5 rounded bg-black/40 border border-white/5">{s.lens || '—'}</div>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-yellow-300/80">Lighting</Label>
                      <div className="text-xs text-muted-foreground mt-1 px-2 py-1.5 rounded bg-black/40 border border-white/5">{s.lighting || '—'}</div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-yellow-300/80">Description</Label>
                    <Textarea
                      value={s.description}
                      onChange={(e) => updateShotField(s.number, 'description', e.target.value)}
                      className="bg-black/40 border-white/10 text-xs min-h-[100px] mt-1 resize-none"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-yellow-300/80">Seedance Prompt</Label>
                    <Textarea
                      value={s.seedance_prompt}
                      onChange={(e) => updateShotField(s.number, 'seedance_prompt', e.target.value)}
                      className="bg-black/40 border-white/10 text-[11px] min-h-[120px] mt-1 resize-none font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                    <Button
                      onClick={() => regeneratePanel(s.number)}
                      disabled={regenningPanel === s.number || s.image_loading}
                      size="sm"
                      variant="outline"
                      className="border-yellow-400/30 bg-black/40 text-yellow-300 hover:bg-yellow-400/10"
                    >
                      {regenningPanel === s.number ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Regenerate Panel
                    </Button>
                    <Button
                      onClick={() => sendShotToSeedance(s)}
                      disabled={sendingTo === s.number}
                      size="sm"
                      className="bg-yellow-400 text-black hover:bg-yellow-300 font-semibold"
                    >
                      {sendingTo === s.number ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send to Seedance
                    </Button>
                    {s.image_url && (
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Library</span>
                        <SaveAssetButton
                          url={s.image_url}
                          name={`${label} — #${String(s.number).padStart(2, '0')} ${s.title}`}
                          notes={s.description}
                          size="md"
                          withDelete
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────── SHOT CARD ──────────────
function inferShotTag(s: Shot): string {
  const t = `${s.shot_type} ${s.title} ${s.description}`.toLowerCase();
  if (/establish|wide|aerial|drone/.test(t)) return 'Establishing';
  if (/close[- ]?up|cu|macro|insert/.test(t)) return 'Close-Up';
  if (/track|dolly|steadi|follow/.test(t)) return 'Tracking';
  if (/hero|portrait|reveal/.test(t)) return 'Hero Shot';
  if (/action|chase|kinetic|fast/.test(t)) return 'Action Beat';
  if (/tension|suspense|slow|reveal/.test(t)) return 'Suspense';
  if (/emotion|tear|intimate/.test(t)) return 'Emotional Insert';
  return 'Cinematic';
}

function ShotCard({
  shot: s, aspect, compact = false, groupLabel, onOpen, onRegen, regenning,
  onTitle, onShotType, onCamMove, onDesc, onSeedance, sending,
}: {
  shot: Shot;
  aspect: string;
  compact?: boolean;
  groupLabel?: string;
  onOpen: () => void;
  onRegen: () => void;
  regenning: boolean;
  onTitle?: (v: string) => void;
  onShotType?: (v: string) => void;
  onCamMove?: (v: string) => void;
  onDesc?: (v: string) => void;
  onSeedance?: () => void;
  sending?: boolean;
}) {
  const aspectClass = aspect === '9:16' ? 'aspect-[9/16]' : aspect === '1:1' ? 'aspect-square' : aspect === '2.39:1' ? 'aspect-[2.39/1]' : aspect === '4:3' ? 'aspect-[4/3]' : 'aspect-video';
  const tag = inferShotTag(s);

  return (
    <div
      className={`group relative rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-950 to-black overflow-hidden flex flex-col transition-all duration-500 hover:border-yellow-400/60 hover:shadow-[0_0_40px_rgba(250,204,21,0.25),0_20px_60px_rgba(0,0,0,0.6)] hover:-translate-y-1 animate-fade-in ${compact ? 'w-[280px]' : ''}`}
    >
      <div
        className={`relative w-full bg-black/60 overflow-hidden cursor-zoom-in ${aspectClass}`}
        onClick={onOpen}
      >
        {s.image_url ? (
          <SmartImage
            src={s.image_url}
            alt={s.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
            loading="lazy"
          />
        ) : s.image_loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-yellow-400/5 to-transparent" />
            <Loader2 className="w-6 h-6 animate-spin text-yellow-300/80 relative" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-red-300/70 p-2 text-center">
            {s.image_error || 'No panel image'}
          </div>
        )}

        {/* gradient overlay for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

        {/* shot number badge */}
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/80 backdrop-blur border border-yellow-400/50 text-[11px] font-mono text-yellow-300 tracking-wider">
          #{String(s.number).padStart(2, '0')}
        </div>

        {/* AI tag */}
        <div className="absolute top-2 right-2 flex gap-1">
          <span className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur border border-white/20 text-[9px] uppercase tracking-wider text-yellow-300/90">
            {tag}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRegen(); }}
            disabled={regenning || s.image_loading}
            title="Regenerate"
            className="p-1.5 rounded-md bg-black/80 backdrop-blur border border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/20 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {regenning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            title="Open"
            className="p-1.5 rounded-md bg-black/80 backdrop-blur border border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/20 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Eye className="w-3 h-3" />
          </button>
          <SaveAssetButton
            url={s.image_url}
            name={`${groupLabel || 'Storyboard'} — #${String(s.number).padStart(2, '0')} ${s.title}`}
            notes={s.description}
            withDelete
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </div>

        {/* bottom title overlay (always visible) */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="text-[11px] uppercase tracking-[0.15em] text-yellow-300/90 font-semibold truncate">
            {s.title}
          </div>
          <div className="text-[10px] text-white/60 truncate">
            {s.shot_type} · {s.camera_move}
          </div>
        </div>
      </div>

      {/* Inline edit panel (full mode only) */}
      {!compact && onTitle && (
        <div className="p-3 space-y-2 bg-gradient-to-b from-black to-zinc-950/80 border-t border-white/5">
          <Input
            value={s.title}
            onChange={(e) => onTitle(e.target.value)}
            className="h-7 text-xs font-semibold uppercase tracking-wide text-yellow-300/90 bg-black/40 border-white/10"
            placeholder="Scene title"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              value={s.shot_type}
              onChange={(e) => onShotType?.(e.target.value)}
              className="h-6 text-[10px] bg-black/40 border-white/10"
              placeholder="Shot type"
            />
            <Input
              value={s.camera_move}
              onChange={(e) => onCamMove?.(e.target.value)}
              className="h-6 text-[10px] bg-black/40 border-white/10"
              placeholder="Camera move"
            />
          </div>
          <Textarea
            value={s.description}
            onChange={(e) => onDesc?.(e.target.value)}
            className="text-[11px] text-muted-foreground leading-snug bg-black/40 border-white/10 min-h-[50px] resize-none"
            placeholder="Scene description"
          />
          <Button
            size="sm"
            onClick={onSeedance}
            disabled={sending}
            className="h-7 text-[11px] bg-yellow-400/10 text-yellow-300 border border-yellow-400/30 hover:bg-yellow-400/20 w-full"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Send to Seedance
          </Button>
        </div>
      )}
    </div>
  );
}

function Panel({ title, icon, children, className = '', action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-950/80 to-black/90 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] text-yellow-300/90">
          {icon}{title}
        </div>
        {action}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function SettingSelect({ label, icon, value, onChange, options }: { label: string; icon?: React.ReactNode; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">{icon}{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-black/40 border-white/10 h-9 text-sm focus:ring-yellow-400/40"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function SettingSlider({ label, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
        <span className="text-xs font-mono text-yellow-300">{value[0]}</span>
      </div>
      <Slider value={value} onValueChange={onChange} min={0} max={100} step={1} className="[&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-400" />
    </div>
  );
}
