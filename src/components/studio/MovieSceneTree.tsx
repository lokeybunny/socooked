import {
  ChevronDown, ChevronRight, Sparkles, RefreshCw, Loader2, Film,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  MasterScene, SubScene, STATUS_STYLE, ClipDuration,
} from '@/lib/studio/movieMode';
import { SmartImage } from './SmartImage';

interface Props {
  scenes: MasterScene[];
  posterRefUrl?: string;
  onUpdate: (next: MasterScene[]) => void;
  seedanceModel: 'seedance-2' | 'seedance-2-fast';
  aspect: string;
}

const DUR_OPTIONS: ClipDuration[] = [5, 10, 15];

export function MovieSceneTree({ scenes, onUpdate, seedanceModel, aspect }: Props) {
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

  // Auto-expand all on mount for visibility
  const generateClip = async (master: MasterScene, sub: SubScene) => {
    updateSub(master.number, sub.id, { status: 'generating_video', error: undefined });
    try {
      // Continuity: prior sub's tail frame > master storyboard image > nothing
      const prevSub = master.subs[sub.index - 1];
      const refImage = prevSub?.lastFrameUrl || master.masterImageUrl;

      // Stack notes: prepend continuity breadcrumbs from earlier approved/generated subs
      const priorNotes = master.subs
        .slice(0, sub.index)
        .filter((s) => s.videoUrl || s.imageUrl)
        .map((s, i) => `Continuation #${i + 1}: ${s.prompt}`)
        .join(' | ');

      const fullPrompt = [
        `Cinematic storyboard sub-scene — ${master.title}.`,
        sub.prompt,
        priorNotes ? `Prior beats in this scene: ${priorNotes}.` : '',
        'Maintain wardrobe, character, lens, color palette, and lighting continuity with the master storyboard panel.',
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
        imageUrl: refImage,
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
            <div className="border-t border-emerald-400/15 p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 bg-black/30">
              {m.subs.map((sub) => (
                <SubSceneCard
                  key={sub.id}
                  sub={sub}
                  masterImageUrl={m.masterImageUrl}
                  onDuration={(d) => updateSub(m.number, sub.id, { durationSec: d })}
                  onGenerate={() => generateClip(m, sub)}
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
  sub, masterImageUrl, onDuration, onGenerate,
}: {
  sub: SubScene;
  masterImageUrl?: string;
  onDuration: (d: ClipDuration) => void;
  onGenerate: () => void;
}) {
  const style = STATUS_STYLE[sub.status];
  const busy = sub.status === 'generating_image' || sub.status === 'generating_video';
  const previewImg = sub.imageUrl || masterImageUrl;

  return (
    <div className="rounded-md border border-white/10 bg-zinc-950/80 overflow-hidden flex flex-col group">
      <div className="relative aspect-video bg-black">
        {sub.videoUrl ? (
          <video src={sub.videoUrl} controls className="absolute inset-0 w-full h-full object-cover" />
        ) : previewImg ? (
          <SmartImage src={previewImg} alt={sub.beatLabel} className="absolute inset-0 w-full h-full object-cover opacity-80" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30">
            {busy ? <Loader2 className="w-5 h-5 animate-spin text-emerald-400" /> : 'No frame'}
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

        <Button
          size="sm"
          onClick={onGenerate}
          disabled={busy}
          className="w-full h-7 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" />
            : sub.videoUrl ? <><RefreshCw className="w-3 h-3" /> Regenerate</>
            : <><Sparkles className="w-3 h-3" /> Generate</>}
        </Button>
      </div>
    </div>
  );
}
