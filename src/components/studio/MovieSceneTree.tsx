import {
  ChevronDown, ChevronRight, Sparkles, RefreshCw, Loader2, Film, Image as ImageIcon, Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  MasterScene, SubScene, STATUS_STYLE, ClipDuration,
} from '@/lib/studio/movieMode';
import { SmartImage } from './SmartImage';
import { SaveAssetButton } from './SaveAssetButton';

interface Props {
  scenes: MasterScene[];
  posterRefUrl?: string;
  onUpdate: (next: MasterScene[]) => void;
  seedanceModel: 'seedance-2' | 'seedance-2-fast';
  aspect: string;
  onEnlarge?: (url: string) => void;
  lockContinuity?: boolean;
}

const DUR_OPTIONS: ClipDuration[] = [5, 10, 15];

export function MovieSceneTree({ scenes, onUpdate, seedanceModel, aspect, onEnlarge, lockContinuity = true }: Props) {
  const { toast } = useToast();

  const updateSub = (masterNum: number, subId: string, patch: Partial<SubScene>) => {
    onUpdate(
      scenes.map((m) =>
        m.number !== masterNum
          ? m
          : { ...m, subs: m.subs.map((s) => (s.id === subId ? { ...s, ...patch } : s)) }
      )
    );
  };

  const toggleExpand = (masterNum: number) => {
    onUpdate(scenes.map((m) => (m.number === masterNum ? { ...m, expanded: !m.expanded } : m)));
  };

  // Snapshot the last *approved* (or rendered) earlier sub-scene for continuity lock.
  const buildAnchor = (master: MasterScene, sub: SubScene): string => {
    if (!lockContinuity) return '';
    const prior = [...master.subs]
      .filter((s) => s.index < sub.index && (s.status === 'approved' || s.videoUrl || s.imageUrl))
      .sort((a, b) => b.index - a.index)[0];
    if (!prior) return '';
    const letter = String.fromCharCode(65 + prior.index);
    return [
      '',
      'CONTINUITY LOCK — preserve EXACTLY from the prior approved beat:',
      `• Anchor beat: ${master.number}${letter} — "${prior.beatLabel}"`,
      `• Wardrobe & characters: identical (same outfits, same hair, same props in hand)`,
      `• Lens, color palette, lighting direction, intensity & colour temperature: identical`,
      `• Character blocking / spatial positions: maintain from prior beat`,
      `• Environment, set dressing, weather: identical`,
      `• Prior beat action: ${prior.prompt}`,
      'Only the new ACTION and framing advance — everything else stays locked.',
      '',
    ].join('\n');
  };

  // Generate a UNIQUE sub-storyboard panel for this beat (NOT the same as master image)
  const generateStoryboard = async (master: MasterScene, sub: SubScene) => {
    updateSub(master.number, sub.id, { status: 'generating_image', error: undefined });
    try {
      const letter = String.fromCharCode(65 + sub.index);
      const anchor = buildAnchor(master, sub);
      const posterPrompt =
`A single high-resolution JPEG scan of a REAL Hollywood pre-production storyboard panel page — ONE shot, ONE moment, drawn for sub-beat ${letter} of master scene "${master.title}". This is panel ${sub.index + 1} of ${master.subs.length} that together complete scene #${master.number} from A to Z. NOT AI art, NOT moodboard, NOT concept art, NOT magazine layout.
${anchor}
PAGE HEADER (typewriter monospace):
SCENE ${String(master.number).padStart(2, '0')}${letter}    |    BEAT: ${sub.beatLabel}    |    DURATION: ${sub.durationSec}s    |    PANEL ${sub.index + 1} / ${master.subs.length}

BODY: a single large horizontal SHOT row with:
- LEFT (35%): printed metadata table — SHOT #, BEAT LABEL, ACTION DESCRIPTION (cinematic prose specific to THIS beat only), CAMERA NOTES, CONTINUITY NOTES referencing prior beat.
- RIGHT (65%): a single large rough professional GRAPHITE PENCIL storyboard sketch frame depicting THIS specific beat's unique action — not the master, not the other sub-beats. Hand-drawn grayscale linework, motion arrows, framing crosshairs.

BEAT-SPECIFIC ACTION TO RENDER (this panel must show ONLY this moment):
${sub.prompt}

PAGE STYLE: off-white aged paper, faint ruled lines, graphite smudges, typewriter labels, handwritten pencil margins. GRAYSCALE GRAPHITE ONLY — never color, never painted, never photographic. Maintain wardrobe / character / environment continuity from the master scene, but show a DIFFERENT moment than the other panels.

STRICTLY AVOID: gold borders, glossy magazine design, color film stills, polished AI renders, comic-book panels, anime, Pinterest collage, marketing posters.`;

      const { data, error } = await supabase.functions.invoke('story-composer/image', {
        body: { prompt: posterPrompt, provider: 'lovable', size: '1536x1024', quality: 'high' },
      });
      if (error) throw error;
      const imageData = data as { imageUrl?: string; error?: string };
      if (imageData.error || !imageData.imageUrl) throw new Error(imageData.error || 'No storyboard image returned');
      const imageUrl = imageData.imageUrl;
      updateSub(master.number, sub.id, { imageUrl, status: 'image_ready' });
    } catch (e) {
      updateSub(master.number, sub.id, { status: 'failed', error: (e as Error).message });
      toast({ title: 'Sub-storyboard failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const generateClip = async (master: MasterScene, sub: SubScene) => {
    updateSub(master.number, sub.id, { status: 'generating_video', error: undefined });
    try {
      const prevSub = master.subs[sub.index - 1];
      // Use this sub's OWN storyboard panel first, then continuity chain
      const refImage = sub.imageUrl || prevSub?.lastFrameUrl || master.masterImageUrl;

      const priorNotes = master.subs
        .slice(0, sub.index)
        .filter((s) => s.videoUrl || s.imageUrl)
        .map((s, i) => `Continuation #${i + 1}: ${s.prompt}`)
        .join(' | ');

      const anchor = buildAnchor(master, sub);
      const fullPrompt = [
        anchor,
        `Cinematic sub-scene ${master.number}${String.fromCharCode(65 + sub.index)} — ${master.title}.`,
        sub.prompt,
        priorNotes ? `Prior beats: ${priorNotes}.` : '',
        'Maintain wardrobe, character, lens, color palette, and lighting continuity.',
      ].filter(Boolean).join(' ');

      const { data, error } = await supabase.functions.invoke('story-composer/seedance', {
        body: {
          prompt: fullPrompt,
          model: seedanceModel,
          aspect,
          image_url: refImage,
          duration: sub.durationSec,
        },
      });
      if (error) throw new Error(error.message);
      const d = data as { videoUrl?: string; lastFrameUrl?: string; error?: string };
      if (!d?.videoUrl) throw new Error(d?.error || 'No clip returned');
      updateSub(master.number, sub.id, {
        videoUrl: d.videoUrl,
        lastFrameUrl: d.lastFrameUrl,
        status: 'approved',
        approved: true,
      });
    } catch (e) {
      updateSub(master.number, sub.id, { status: 'failed', error: (e as Error).message });
      toast({
        title: `Sub-scene ${master.number}${String.fromCharCode(65 + sub.index)} failed`,
        description: (e as Error).message,
        variant: 'destructive',
      });
    }
  };

  if (!scenes.length) return null;

  return (
    <div className="space-y-2 mt-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80 px-1 flex items-center gap-1.5">
        <Film className="w-3 h-3" /> Movie Mode · Sub-storyboard sequencing
      </div>
      {scenes.map((m) => (
        <div
          key={m.number}
          className="rounded-lg border border-emerald-400/20 bg-black/50 overflow-hidden"
        >
          <button
            type="button"
            onClick={() => toggleExpand(m.number)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-500/5 transition"
          >
            {m.expanded ? <ChevronDown className="w-4 h-4 text-emerald-300" /> : <ChevronRight className="w-4 h-4 text-emerald-300/70" />}
            <span className="text-xs font-mono text-emerald-300/80">#{String(m.number).padStart(2, '0')}</span>
            <span className="text-sm text-white/90 font-medium flex-1 text-left truncate">{m.title}</span>
            <span className="text-[10px] text-emerald-200/60 font-mono">
              {m.subs.filter((s) => s.videoUrl).length}/{m.subs.length} clips
            </span>
          </button>

          {m.expanded && (
            <div className="border-t border-emerald-400/15 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-black/30">
              {m.subs.map((sub) => (
                <SubSceneCard
                  key={sub.id}
                  sub={sub}
                  masterImageUrl={m.masterImageUrl}
                  onDuration={(d) => updateSub(m.number, sub.id, { durationSec: d })}
                  onGenerateStoryboard={() => generateStoryboard(m, sub)}
                  onGenerateClip={() => generateClip(m, sub)}
                  onEnlarge={onEnlarge}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SubSceneCard({
  sub, masterImageUrl, onDuration, onGenerateStoryboard, onGenerateClip, onEnlarge,
}: {
  sub: SubScene;
  masterImageUrl?: string;
  onDuration: (d: ClipDuration) => void;
  onGenerateStoryboard: () => void;
  onGenerateClip: () => void;
  onEnlarge?: (url: string) => void;
}) {
  const style = STATUS_STYLE[sub.status];
  const busyImg = sub.status === 'generating_image';
  const busyVid = sub.status === 'generating_video';
  const busy = busyImg || busyVid;
  const previewImg = sub.imageUrl || masterImageUrl;
  const enlargeTarget = sub.imageUrl || masterImageUrl;

  return (
    <div className="rounded-md border border-white/10 bg-zinc-950/80 overflow-hidden flex flex-col group">
      <div className="relative aspect-video bg-black">
        {sub.videoUrl ? (
          <video src={sub.videoUrl} controls className="absolute inset-0 w-full h-full object-cover" />
        ) : previewImg ? (
          <SmartImage
            src={previewImg}
            alt={sub.beatLabel}
            className="absolute inset-0 w-full h-full object-cover opacity-90 cursor-zoom-in"
            onDoubleClick={enlargeTarget && onEnlarge ? () => onEnlarge(enlargeTarget) : undefined}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30">
            {busy ? <Loader2 className="w-5 h-5 animate-spin text-emerald-400" /> : 'No frame — generate storyboard'}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          </div>
        )}
        <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${style.bg} ${style.text}`}>
          {style.label}
        </div>
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          {enlargeTarget && onEnlarge && (
            <button
              type="button"
              onClick={() => onEnlarge(enlargeTarget)}
              className="p-1 rounded bg-black/60 hover:bg-black/80 text-white/80"
              title="Enlarge"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
          <SaveAssetButton
            url={sub.videoUrl || sub.imageUrl || undefined}
            name={`Movie Mode — Scene ${sub.masterNumber} ${sub.beatLabel}`}
            notes={sub.prompt}
            withDelete
          />
        </div>
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-emerald-200">
          {sub.beatLabel} · {sub.durationSec}s
        </div>
      </div>

      <div className="p-2 space-y-1.5">
        {/* Duration toggle */}
        <div className="flex gap-1">
          {DUR_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDuration(d)}
              disabled={busy}
              className={`flex-1 h-6 rounded text-[10px] font-semibold transition ${
                sub.durationSec === d
                  ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-200'
                  : 'bg-black/40 border border-white/10 text-white/50 hover:border-emerald-400/40'
              }`}
            >
              {d}s
            </button>
          ))}
        </div>

        {sub.error && <div className="text-[10px] text-red-300 line-clamp-2">{sub.error}</div>}

        {/* TWO generate buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            onClick={onGenerateStoryboard}
            disabled={busy}
            variant="outline"
            className="h-7 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 border-amber-400/30 text-amber-200"
            title="Generate this beat's unique storyboard panel"
          >
            {busyImg ? <Loader2 className="w-3 h-3 animate-spin" />
              : <><ImageIcon className="w-3 h-3 mr-1" /> {sub.imageUrl ? 'Redo SB' : 'Storyboard'}</>}
          </Button>
          <Button
            size="sm"
            onClick={onGenerateClip}
            disabled={busy}
            className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white"
            title="Generate Seedance clip from this storyboard"
          >
            {busyVid ? <Loader2 className="w-3 h-3 animate-spin" />
              : sub.videoUrl ? <><RefreshCw className="w-3 h-3 mr-1" /> Redo Clip</>
              : <><Sparkles className="w-3 h-3 mr-1" /> Clip {sub.durationSec}s</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
