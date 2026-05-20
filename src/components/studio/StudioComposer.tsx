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
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
}

export function StudioComposer() {
  const { toast } = useToast();

  // Settings
  const [label, setLabel] = useState('Untitled Scene');
  const [imageProvider, setImageProvider] = useState<'lovable' | 'atlascloud'>('lovable');
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

  // Prompt + output
  const [prompt, setPrompt] = useState('');
  const [structured, setStructured] = useState<Structured | null>(null);
  const [master, setMaster] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);

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
      const { data, error } = await supabase.functions.invoke('story-composer/image', {
        body: { prompt: text, provider: imageProvider, size, quality: 'high' },
      });
      if (error) throw error;
      const d = data as { imageUrl?: string; error?: string };
      if (d.error || !d.imageUrl) throw new Error(d.error || 'No image returned');
      setImageUrl(d.imageUrl);
      toast({ title: 'Image generated' });
    } catch (e) {
      toast({ title: 'Image gen failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setGeneratingImage(false);
    }
  };

  const buildStoryboard = async () => {
    const text = master || prompt;
    if (!text.trim()) return toast({ title: 'Add a prompt first', variant: 'destructive' });
    setStoryboarding(true);
    try {
      const { data, error } = await supabase.functions.invoke('story-composer/storyboard', {
        body: { prompt: text, shots: 6, director },
      });
      if (error) throw error;
      const d = data as { shots?: Shot[]; error?: string };
      if (d.error || !d.shots) throw new Error(d.error || 'No shots');
      setShots(d.shots);
      toast({ title: `Storyboard built — ${d.shots.length} shots` });
    } catch (e) {
      toast({ title: 'Storyboard failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setStoryboarding(false);
    }
  };

  const sendShotToSeedance = async (shot: Shot) => {
    setSendingTo(shot.number);
    try {
      const { data, error } = await supabase.functions.invoke('story-composer/seedance', {
        body: { prompt: shot.seedance_prompt, model: seedanceModel, aspect, image_url: imageUrl || undefined },
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

        <div className="grid grid-cols-12 gap-4 relative">
          {/* Neon connectors */}
          <svg className="absolute inset-0 pointer-events-none hidden lg:block" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#facc15" stopOpacity="0" />
                <stop offset="50%" stopColor="#facc15" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M 33% 50% Q 41% 50% 50% 50%" stroke="url(#neon)" strokeWidth="1.5" fill="none" className="animate-pulse" />
            <path d="M 67% 50% Q 75% 50% 83% 50%" stroke="url(#neon)" strokeWidth="1.5" fill="none" className="animate-pulse" />
          </svg>

          {/* LEFT — PROMPT */}
          <div className="col-span-12 lg:col-span-4">
            <Panel title="PROMPT" icon={<Wand2 className="w-3.5 h-3.5" />}>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the scene… e.g. 'luxury modern house at sunset with a realtor walking outside'"
                className="min-h-[180px] bg-black/40 border-white/10 font-mono text-sm resize-none focus-visible:ring-yellow-400/50"
              />

              {director && (
                <Badge variant="outline" className="border-yellow-400/40 text-yellow-300 bg-yellow-400/10">
                  <Film className="w-3 h-3 mr-1" /> {director}
                </Badge>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={enhance} disabled={enhancing} className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black hover:from-yellow-300 hover:to-amber-400 shadow-[0_0_18px_rgba(250,204,21,0.35)]" size="sm">
                  {enhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Enhance
                </Button>
                {recording ? (
                  <Button onClick={stopVoice} size="sm" variant="destructive" className="animate-pulse">
                    <Square className="w-3.5 h-3.5 fill-current" /> Stop
                  </Button>
                ) : (
                  <Button onClick={startVoice} disabled={voiceBusy} size="sm" variant="outline" className="border-white/10 bg-black/40">
                    {voiceBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                    Voice
                  </Button>
                )}
                <Button onClick={generateImage} disabled={generatingImage} size="sm" variant="outline" className="border-white/10 bg-black/40">
                  {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  Generate Image
                </Button>
              </div>

              {/* Director presets */}
              <div className="pt-3 border-t border-white/5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block flex items-center gap-1.5">
                  <Film className="w-3 h-3" /> Director Mode
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {DIRECTORS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDirector(director === d ? '' : d)}
                      className={`text-xs px-2 py-1 rounded-md border transition-all ${
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
            </Panel>

            {/* Structured breakdown */}
            {structured && (
              <Panel title="STRUCTURED BREAKDOWN" icon={<Sparkles className="w-3.5 h-3.5" />} className="mt-4">
                <ScrollArea className="max-h-72 pr-2">
                  <dl className="space-y-2 text-xs">
                    {Object.entries(structured).filter(([k]) => k !== 'master_prompt').map(([k, v]) => (
                      <div key={k}>
                        <dt className="uppercase tracking-wider text-yellow-300/80 mb-0.5">{k.replace(/_/g, ' ')}</dt>
                        <dd className="text-muted-foreground leading-relaxed">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </ScrollArea>
              </Panel>
            )}
          </div>

          {/* CENTER — PREVIEW */}
          <div className="col-span-12 lg:col-span-4">
            <Panel title="PREVIEW" icon={<ImageIcon className="w-3.5 h-3.5" />}>
              <div className="aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-black via-zinc-950 to-black border border-white/10 relative group flex items-center justify-center">
                {imageUrl ? (
                  <>
                    <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 flex items-center justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={generateImage} disabled={generatingImage} className="border-white/20 bg-black/60">
                        <RefreshCw className="w-3.5 h-3.5" /> Regen
                      </Button>
                      <Button size="sm" variant="outline" asChild className="border-white/20 bg-black/60">
                        <a href={imageUrl} target="_blank" rel="noopener">
                          <Maximize2 className="w-3.5 h-3.5" /> Open
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" asChild className="border-white/20 bg-black/60">
                        <a href={imageUrl} download>
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground text-xs space-y-2 p-6">
                    {generatingImage ? (
                      <>
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-yellow-400" />
                        <p>Rendering cinematic frame…</p>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-10 h-10 mx-auto opacity-30" />
                        <p>Image preview will appear here</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <Button
                onClick={buildStoryboard}
                disabled={storyboarding}
                variant="outline"
                className="w-full border-yellow-400/30 bg-yellow-400/5 text-yellow-300 hover:bg-yellow-400/10 hover:text-yellow-200"
              >
                {storyboarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                Generate Storyboard
              </Button>
            </Panel>

            {/* Storyboard */}
            {shots.length > 0 && (
              <Panel
                title={`STORYBOARD — ${shots.length} SHOTS`}
                icon={<Clapperboard className="w-3.5 h-3.5" />}
                className="mt-4"
                action={
                  <Button onClick={sendAllToSeedance} disabled={sendingTo !== null} size="sm" className="h-7 text-xs bg-yellow-400 text-black hover:bg-yellow-300">
                    <Send className="w-3 h-3" /> Queue all
                  </Button>
                }
              >
                <ScrollArea className="max-h-[420px] pr-2">
                  <div className="space-y-2">
                    {shots.map((s) => (
                      <div key={s.number} className="p-3 rounded-lg border border-white/5 bg-black/40 space-y-2 hover:border-yellow-400/30 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono text-yellow-300/80">#{String(s.number).padStart(2, '0')}</span>
                            <span className="text-sm font-medium truncate">{s.title}</span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => sendShotToSeedance(s)}
                            disabled={sendingTo === s.number}
                            className="h-7 text-xs bg-yellow-400/10 text-yellow-300 border border-yellow-400/30 hover:bg-yellow-400/20"
                          >
                            {sendingTo === s.number ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Seedance
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          <Badge variant="outline" className="border-white/10 text-muted-foreground">{s.shot_type}</Badge>
                          <Badge variant="outline" className="border-white/10 text-muted-foreground">{s.camera_move}</Badge>
                          <Badge variant="outline" className="border-white/10 text-muted-foreground">{s.lens}</Badge>
                          <Badge variant="outline" className="border-white/10 text-muted-foreground">{s.lighting}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{s.seedance_prompt}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </Panel>
            )}
          </div>

          {/* RIGHT — SETTINGS */}
          <div className="col-span-12 lg:col-span-4">
            <Panel title="SETTINGS" icon={<Aperture className="w-3.5 h-3.5" />}>
              <Tabs defaultValue="visual" className="w-full">
                <TabsList className="grid grid-cols-2 bg-black/40 border border-white/5">
                  <TabsTrigger value="visual" className="text-xs data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">Visual</TabsTrigger>
                  <TabsTrigger value="engine" className="text-xs data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">Engine</TabsTrigger>
                </TabsList>

                <TabsContent value="visual" className="space-y-3 pt-3">
                  <SettingSelect label="Aspect Ratio" icon={<Maximize2 className="w-3 h-3" />} value={aspect} onChange={setAspect} options={ASPECTS} />
                  <SettingSelect label="Cinematic Style" icon={<Film className="w-3 h-3" />} value={style} onChange={setStyle} options={CINEMATIC_STYLES} />
                  <SettingSelect label="Camera Type" icon={<Camera className="w-3 h-3" />} value={camera} onChange={setCamera} options={CAMERAS} />
                  <SettingSelect label="Lens Type" icon={<Aperture className="w-3 h-3" />} value={lens} onChange={setLens} options={LENSES} />
                  <SettingSelect label="Motion Style" icon={<Zap className="w-3 h-3" />} value={motion} onChange={setMotion} options={MOTION} />
                  <SettingSelect label="Lighting Style" icon={<Sun className="w-3 h-3" />} value={lighting} onChange={setLighting} options={LIGHTING} />
                </TabsContent>

                <TabsContent value="engine" className="space-y-3 pt-3">
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
            </Panel>
          </div>
        </div>
      </div>
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
