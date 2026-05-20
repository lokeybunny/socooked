import { useState } from 'react';
import { Clapperboard, Copy, Check, Sparkles, Loader2, Wand2, Film, Layers, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Sub = { beat: string; prompt: string };
type Scene = { number: number; title: string; summary: string; subs: Sub[] };
type Result = { title: string; logline: string; scenes: Scene[] };

const SUB_OPTIONS = [2, 3, 4] as const;
const DUR_OPTIONS = [5, 10, 15] as const;
const SCENE_OPTIONS = [3, 4, 5, 6, 8] as const;

export function PromptStudio() {
  const [idea, setIdea] = useState('');
  const [style, setStyle] = useState('');
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [masterCount, setMasterCount] = useState<number>(6);
  const [subsPerScene, setSubsPerScene] = useState<number>(3);
  const [durationSec, setDurationSec] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const enhance = async () => {
    if (!idea.trim()) { toast.error('Type an idea first'); return; }
    setEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('studio-prompt-guide', {
        body: { intent: idea, images: [] },
      });
      if (error) throw error;
      if (data?.prompt) {
        setIdea(data.prompt);
        toast.success('Idea enhanced');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Enhance failed');
    } finally {
      setEnhancing(false);
    }
  };

  const generate = async () => {
    if (!idea.trim()) { toast.error('Type an idea first'); return; }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('studio-prompt-builder', {
        body: { idea, masterCount, subsPerScene, durationSec, aspect, style },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as Result);
      toast.success(`Generated ${data.scenes?.length || 0} scenes`);
    } catch (e: any) {
      toast.error(e?.message || 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  const copyAll = () => {
    if (!result) return;
    const all = [
      `# ${result.title}`,
      `Logline: ${result.logline}`,
      '',
      ...result.scenes.flatMap((s) => [
        `## Scene ${s.number} — ${s.title}`,
        s.summary,
        ...s.subs.map((sub) => `### Beat ${sub.beat}\n${sub.prompt}`),
        '',
      ]),
    ].join('\n');
    copyText(all, 'all');
  };

  const totalClips = masterCount * subsPerScene;
  const runtime = totalClips * durationSec;
  const mm = Math.floor(runtime / 60);
  const ss = runtime % 60;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.06] to-violet-500/[0.04] p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
            <Clapperboard className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-emerald-100">Prompt Studio</h2>
            <p className="text-sm text-emerald-200/70">
              Turn one idea into a full storyboard prompt set. Copy each prompt into ChatGPT, Seedance, or any image/video tool.
            </p>
          </div>
        </div>
      </div>

      {/* Idea */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
        <label className="text-[11px] uppercase tracking-[0.18em] text-white/60 font-semibold">Your idea</label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="A bald African American filmmaker rides a vintage motorcycle through a neon-soaked Tokyo alley at midnight, looking for his missing brother…"
          rows={5}
          className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/60 outline-none resize-y"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enhance}
            disabled={enhancing || !idea.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-violet-500/15 border border-violet-400/40 text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {enhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            Enhance idea
          </button>
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="Optional: style note (e.g. 'A24 anamorphic, 35mm grain')"
            className="flex-1 min-w-[200px] bg-black/60 border border-white/10 rounded-lg px-3 h-8 text-xs text-white placeholder:text-white/30 focus:border-emerald-400/60 outline-none"
          />
        </div>
      </div>

      {/* Movie config (always on) */}
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.04] p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clapperboard className="w-4 h-4 text-emerald-300" />
            <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-emerald-300">Movie Mode</span>
            <span className="text-[10px] text-emerald-200/60">always on</span>
          </div>
          <div className="text-[10px] text-emerald-200/90 font-mono flex items-center gap-3">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{mm}:{String(ss).padStart(2, '0')}</span>
            <span className="opacity-60">· {totalClips} prompts</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-emerald-400/15">
          <Selector label="Scenes" icon={<Film className="w-3 h-3" />} options={SCENE_OPTIONS} value={masterCount} onChange={setMasterCount} suffix="" />
          <Selector label="Sub-beats / scene" icon={<Layers className="w-3 h-3" />} options={SUB_OPTIONS} value={subsPerScene} onChange={setSubsPerScene} suffix="" />
          <Selector label="Clip length" icon={<Clock className="w-3 h-3" />} options={DUR_OPTIONS} value={durationSec} onChange={setDurationSec} suffix="s" />
          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-200/70 mb-1">Aspect</div>
            <div className="flex gap-1">
              {(['16:9', '9:16', '1:1'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspect(a)}
                  className={`flex-1 h-7 rounded text-[11px] font-semibold transition ${
                    aspect === a
                      ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-200'
                      : 'bg-black/40 border border-white/10 text-white/60 hover:border-emerald-400/40'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Generate */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={generate}
          disabled={busy || !idea.trim()}
          className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 shadow-[0_0_24px_rgba(16,185,129,0.3)]"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate {totalClips} storyboard prompts
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-lg font-bold text-emerald-100">{result.title}</h3>
              <p className="text-sm text-white/70 italic">{result.logline}</p>
            </div>
            <button
              type="button"
              onClick={copyAll}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25"
            >
              {copied === 'all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              Copy full script
            </button>
          </div>

          <div className="space-y-4">
            {result.scenes.map((scene) => (
              <div key={scene.number} className="rounded-lg border border-white/10 bg-black/60 overflow-hidden">
                <div className="px-4 py-2 bg-emerald-500/[0.06] border-b border-emerald-400/15">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">Scene {String(scene.number).padStart(2, '0')}</div>
                  <div className="text-sm font-semibold text-white">{scene.title}</div>
                  <div className="text-xs text-white/60 mt-0.5">{scene.summary}</div>
                </div>
                <div className="divide-y divide-white/5">
                  {scene.subs.map((sub, i) => {
                    const key = `${scene.number}-${i}`;
                    return (
                      <div key={key} className="p-4 flex gap-3">
                        <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center text-emerald-300 font-bold text-sm">
                          {sub.beat}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="text-[10px] uppercase tracking-wider text-white/40">
                              Scene {scene.number} · Beat {sub.beat} · {durationSec}s · {aspect}
                            </div>
                            <button
                              type="button"
                              onClick={() => copyText(sub.prompt, key)}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-semibold bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
                            >
                              {copied === key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              {copied === key ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{sub.prompt}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Selector<T extends number>({
  label, icon, options, value, onChange, suffix,
}: {
  label: string;
  icon: React.ReactNode;
  options: readonly T[];
  value: number;
  onChange: (n: number) => void;
  suffix: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-200/70 mb-1">
        {icon} {label}
      </div>
      <div className="flex gap-1 flex-wrap">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 min-w-[34px] h-7 rounded text-xs font-semibold transition ${
              value === n
                ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-200'
                : 'bg-black/40 border border-white/10 text-white/60 hover:border-emerald-400/40'
            }`}
          >
            {n}{suffix}
          </button>
        ))}
      </div>
    </div>
  );
}
