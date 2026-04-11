import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { submitJob } from '@/lib/studio/hooks';
import {
  STYLE_PRESETS, RESOLUTIONS, ASPECT_RATIOS, DURATIONS, FPS_OPTIONS,
  CAMERA_MOVES, LIGHTING_STYLES, SHOT_TYPES, TASK_LABELS,
  type TaskType, type GenerationSettings,
} from '@/lib/studio/types';
import {
  Type, Image, Layers, Mic, UserCircle, Upload, Sparkles, Loader2,
  Wand2, Dice5, ChevronRight, Info,
} from 'lucide-react';

const TASK_ICONS: Record<TaskType, React.ReactNode> = {
  t2v: <Type className="w-3.5 h-3.5" />,
  i2v: <Image className="w-3.5 h-3.5" />,
  ti2v: <Layers className="w-3.5 h-3.5" />,
  s2v: <Mic className="w-3.5 h-3.5" />,
  animate: <UserCircle className="w-3.5 h-3.5" />,
};

export function StudioCreate() {
  const { toast } = useToast();
  const [taskType, setTaskType] = useState<TaskType>('t2v');
  const [prompt, setPrompt] = useState('');
  const [negPrompt, setNegPrompt] = useState('');
  const [settings, setSettings] = useState<GenerationSettings>({
    resolution: '1280x720',
    duration: 4,
    fps: 24,
    aspect_ratio: '16:9',
    guidance_scale: 7,
    motion_intensity: 50,
  });
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDirector, setShowDirector] = useState(false);

  // Prompt Director fields
  const [director, setDirector] = useState({ subject: '', action: '', scene: '', camera: '', lighting: '', tone: '' });

  const toggleStyle = (s: string) => {
    setSelectedStyles(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, [toast]);

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
    if ((taskType === 'i2v' || taskType === 'ti2v') && !imageFile) {
      toast({ title: 'Image required for this mode', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      let input_image_url: string | undefined;

      if (imageFile) {
        const ext = imageFile.name.split('.').pop() || 'png';
        const path = `inputs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('studio-outputs').upload(path, imageFile);
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const { data: urlData } = supabase.storage.from('studio-outputs').getPublicUrl(path);
        input_image_url = urlData.publicUrl;
      }

      const fullSettings = {
        ...settings,
        style_preset: selectedStyles.join(', ') || undefined,
      };

      await submitJob({
        task_type: taskType,
        prompt: prompt.trim(),
        negative_prompt: negPrompt.trim() || undefined,
        settings_json: fullSettings,
        input_image_url,
      });

      toast({ title: 'Job submitted!', description: 'Check the queue for progress.' });
      setPrompt('');
      setNegPrompt('');
      setImageFile(null);
      setImagePreview(null);
      setSelectedStyles([]);
    } catch (err) {
      toast({ title: 'Submit failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const needsImage = taskType === 'i2v' || taskType === 'ti2v';
  const isAdvanced = taskType === 's2v' || taskType === 'animate';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        {/* Task Type Tabs */}
        <Tabs value={taskType} onValueChange={v => setTaskType(v as TaskType)}>
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

        {/* Image Upload */}
        {needsImage && (
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardContent className="p-5">
              <Label className="text-sm font-medium mb-3 block">Input Image</Label>
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="rounded-lg max-h-[300px] object-contain mx-auto" />
                  <Button variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => { setImageFile(null); setImagePreview(null); }}>Remove</Button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-border/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500/50 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">Drop an image or click to upload</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG, WebP — max 20MB</p>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageUpload} />
                </label>
              )}
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
  );
}
