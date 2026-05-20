import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Sparkles, Check, X, RefreshCw, Loader2, Send, Film,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  MasterScene, SubScene, STATUS_STYLE, deriveSubPrompt,
} from '@/lib/studio/movieMode';
import { SmartImage } from './SmartImage';

interface Props {
  scenes: MasterScene[];
  posterRefUrl?: string;
  onUpdate: (next: MasterScene[]) => void;
  seedanceModel: 'seedance-2' | 'seedance-2-fast';
  aspect: string;
}

export function MovieSceneTree({ scenes, posterRefUrl, onUpdate, seedanceModel, aspect }: Props) {
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

  const generateSubImage = async (master: MasterScene, sub: SubScene) => {
    updateSub(master.number, sub.id, { status: 'generating_image', error: undefined });
    try {
      // Use poster as master reference + previous sub's last frame for continuity
      const prevSub = master.subs[sub.index - 1];
      const continuityRef = prevSub?.lastFrameUrl || prevSub?.imageUrl;
      const prompt = `Cinematic storyboard frame — ${sub.prompt}. Match poster reference for wardrobe, character, lighting, and color palette. ${aspect} aspect ratio.`;

      const { data, error } = await supabase.functions.invoke('story-composer/image', {
        body: {
          prompt,
          provider: 'lovable',
          size: '1024x1024',
          quality: 'high',
          referenceImage: continuityRef || posterRefUrl,
        },
      });
      if (error) throw new Error(error.message);
      const d = data as { imageUrl?: string; error?: string };
      if (!d?.imageUrl) throw new Error(d?.error || 'No image returned');
      updateSub(master.number, sub.id, { imageUrl: d.imageUrl, status: 'image_ready' });
    } catch (e) {
      updateSub(master.number, sub.id, { status: 'failed', error: (e as Error).message });
      toast({ title: `Sub-scene ${master.number}${String.fromCharCode(65 + sub.index)} failed`, description: (e as Error).message, variant: 'destructive' });
    }
  };

  const generateSubClip = async (master: MasterScene, sub: SubScene) => {
    if (!sub.imageUrl) {
      toast({ title: 'Generate the sub-storyboard image first', variant: 'destructive' });
      return;
    }
    updateSub(master.number, sub.id, { status: 'generating_video', error: undefined });
    try {
      const { data, error } = await supabase.functions.invoke('story-composer/seedance', {
        body: {
          prompt: sub.prompt,
          model: seedanceModel,
          aspect,
          image_url: sub.imageUrl,
          duration: sub.durationSec,
        },
      });
      if (error) throw new Error(error.message);
      const d = data as { videoUrl?: string; lastFrameUrl?: string; error?: string };
      if (!d?.videoUrl) throw new Error(d?.error || 'No clip returned');
      updateSub(master.number, sub.id, {
        videoUrl: d.videoUrl,
        lastFrameUrl: d.lastFrameUrl,
        status: 'pending_review',
      });
    } catch (e) {
      updateSub(master.number, sub.id, { status: 'failed', error: (e as Error).message });
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
              {m.subs.filter((s) => s.status === 'approved').length}/{m.subs.length} approved
            </span>
          </button>

          {m.expanded && (
            <div className="border-t border-emerald-400/15 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-black/30">
              {m.subs.map((sub) => (
                <SubSceneCard
                  key={sub.id}
                  master={m}
                  sub={sub}
                  onPromptChange={(p) => updateSub(m.number, sub.id, { prompt: p })}
                  onResetPrompt={() => updateSub(m.number, sub.id, {
                    prompt: deriveSubPrompt(m.title, m.description, sub.index),
                  })}
                  onGenImage={() => generateSubImage(m, sub)}
                  onGenClip={() => generateSubClip(m, sub)}
                  onApprove={() => updateSub(m.number, sub.id, { status: 'approved', approved: true })}
                  onReject={() => updateSub(m.number, sub.id, { status: 'rejected', approved: false })}
                  onRegen={() => generateSubImage(m, sub)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface CardProps {
  master: MasterScene;
  sub: SubScene;
  onPromptChange: (p: string) => void;
  onResetPrompt: () => void;
  onGenImage: () => void;
  onGenClip: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRegen: () => void;
}

function SubSceneCard({
  sub, onPromptChange, onResetPrompt, onGenImage, onGenClip, onApprove, onReject, onRegen,
}: CardProps) {
  const style = STATUS_STYLE[sub.status];
  const [editing, setEditing] = useState(false);
  const busy = sub.status === 'generating_image' || sub.status === 'generating_video';

  return (
    <div className="rounded-md border border-white/10 bg-zinc-950/80 overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-black">
        {sub.videoUrl ? (
          <video src={sub.videoUrl} controls className="absolute inset-0 w-full h-full object-cover" />
        ) : sub.imageUrl ? (
          <SmartImage src={sub.imageUrl} alt={sub.beatLabel} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30">
            {busy ? <Loader2 className="w-5 h-5 animate-spin text-emerald-400" /> : 'No frame'}
          </div>
        )}
        <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${style.bg} ${style.text}`}>
          {style.label}
        </div>
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-emerald-200">
          {sub.beatLabel} · {sub.durationSec}s
        </div>
      </div>

      <div className="p-2 space-y-1.5 text-[11px]">
        {editing ? (
          <Textarea
            value={sub.prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onBlur={() => setEditing(false)}
            autoFocus
            className="text-[10px] h-16 bg-black/60 border-white/10"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-[10px] text-white/70 line-clamp-3 hover:text-white w-full"
            title="Click to edit prompt"
          >
            {sub.prompt}
          </button>
        )}

        {sub.error && <div className="text-[10px] text-red-300 line-clamp-2">{sub.error}</div>}

        <div className="flex gap-1">
          {!sub.imageUrl ? (
            <Button size="sm" onClick={onGenImage} disabled={busy} className="flex-1 h-7 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Frame
            </Button>
          ) : !sub.videoUrl ? (
            <>
              <Button size="sm" onClick={onGenClip} disabled={busy} className="flex-1 h-7 text-[10px] bg-purple-600 hover:bg-purple-500 text-white">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Clip
              </Button>
              <Button size="sm" variant="outline" onClick={onRegen} className="h-7 w-7 p-0 border-white/10">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </>
          ) : sub.status === 'pending_review' ? (
            <>
              <Button size="sm" onClick={onApprove} className="flex-1 h-7 text-[10px] bg-emerald-600 hover:bg-emerald-500">
                <Check className="w-3 h-3" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} className="h-7 w-7 p-0 border-red-400/30 text-red-300">
                <X className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={onRegen} className="h-7 w-7 p-0 border-white/10">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onResetPrompt} className="flex-1 h-7 text-[10px] border-white/10">
              <RefreshCw className="w-3 h-3" /> Reset prompt
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
