import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  DIRECTOR_STYLES, DIRECTOR_CATEGORIES, DIRECTOR_FILTER_TAGS,
  buildInjectedPrompt, getThumbnail, recommendStyles,
  type DirectorStyle,
} from '@/lib/studio/directorStyles';
import {
  Film, Search, Sparkles, Copy, RefreshCw, Download, X, Wand2, Play, Loader2, Check,
} from 'lucide-react';

// ───────── YouTube looping iframe ─────────
function YouTubeLoop({ id, start, end }: { id: string; start: number; end: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=1&playsinline=1&modestbranding=1&rel=0&loop=1&playlist=${id}&start=${Math.floor(start)}&end=${Math.floor(end)}&enablejsapi=1`;
  // Poll currentTime via postMessage; seek back to start when crossing end.
  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const post = (func: string, args: any[] = []) => {
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    };
    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      try {
        const data = JSON.parse(e.data);
        const t = data?.info?.currentTime;
        if (typeof t === 'number' && t >= end - 0.2) {
          post('seekTo', [start, true]);
          post('playVideo');
        }
      } catch { /* noop */ }
    };
    window.addEventListener('message', onMessage);
    const poll = setInterval(() => {
      post('listening');
      post('getCurrentTime');
    }, 500);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
    };
  }, [start, end, id]);
  return (
    <iframe
      ref={ref}
      src={src}
      className="w-full aspect-video rounded-xl bg-black"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      title={`YouTube clip ${id}`}
    />
  );
}

// ───────── Single style card ─────────
function StyleCard({
  style, selected, onToggle, onPreview,
}: {
  style: DirectorStyle;
  selected: boolean;
  onToggle: () => void;
  onPreview: () => void;
}) {
  const thumb = getThumbnail(style);
  return (
    <div
      onClick={onToggle}
      className={`group relative cursor-pointer rounded-2xl overflow-hidden border bg-black/60 transition-all duration-300 hover:-translate-y-0.5 ${
        selected
          ? 'border-[#00ff88] shadow-[0_0_30px_-5px_rgba(0,255,136,0.55)]'
          : 'border-white/10 hover:border-white/30'
      }`}
    >
      <div className="relative aspect-video overflow-hidden bg-neutral-900">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={style.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-white/30 text-xs">
            <Film className="w-10 h-10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <Badge className="absolute top-2 left-2 bg-black/70 text-[10px] border border-white/10 text-white/80 backdrop-blur">
          {style.category}
        </Badge>
        {selected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#00ff88] text-black flex items-center justify-center shadow-lg">
            <Check className="w-3.5 h-3.5" />
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-2 right-2 h-7 px-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur"
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
        >
          <Play className="w-3 h-3 mr-1" /> Preview
        </Button>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white truncate">{style.title}</h4>
            <p className="text-[11px] text-[#00ff88]/80 truncate">{style.shotName}</p>
          </div>
        </div>
        <p className="text-[11px] text-white/55 line-clamp-2">{style.description}</p>
        <div className="flex flex-wrap gap-1 pt-1">
          {style.motion_behavior.slice(0, 2).map(m => (
            <span key={m} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/10">{m}</span>
          ))}
          {style.emotional_tone.slice(0, 2).map(m => (
            <span key={m} className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────── Reference modal ─────────
function ReferenceModal({ style, onClose }: { style: DirectorStyle | null; onClose: () => void }) {
  const open = !!style;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-neutral-950 border-white/10 text-white">
        {style && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Film className="w-4 h-4 text-[#00ff88]" />
                <span className="font-semibold">{style.title}</span>
                <span className="text-[#00ff88]/80 text-sm font-normal">· {style.shotName}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {style.youtube_id ? (
                <YouTubeLoop id={style.youtube_id} start={style.start_time} end={style.end_time} />
              ) : (
                <div className="aspect-video rounded-xl bg-black flex items-center justify-center text-white/40 text-sm">
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(style.title + ' ' + style.shotName)}`}
                    target="_blank" rel="noreferrer"
                    className="underline hover:text-[#00ff88]"
                  >
                    Search this shot on YouTube →
                  </a>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                  <div className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Camera movement</div>
                  <div className="text-white/90">{style.motion_language || style.motion_behavior.join(', ')}</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                  <div className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Lens feel</div>
                  <div className="text-white/90">{style.lens_language || '—'}</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                  <div className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Lighting</div>
                  <div className="text-white/90">{style.lighting_language || '—'}</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                  <div className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Emotional impact</div>
                  <div className="text-white/90">{style.emotional_tone.join(', ')}</div>
                </div>
              </div>
              <div className="rounded-lg bg-[#00ff88]/[0.06] border border-[#00ff88]/30 p-3">
                <div className="text-[#00ff88] uppercase tracking-wider text-[10px] mb-1">Prompt injection</div>
                <div className="text-white/90 text-xs leading-relaxed">{style.prompt_injection}</div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────── Main component ─────────
export interface DirectorCameraStylesProps {
  basePrompt: string;
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  onApplyFinalPrompt?: (finalPrompt: string) => void;
}

export function DirectorCameraStyles({
  basePrompt, selectedIds, onSelectedChange, onApplyFinalPrompt,
}: DirectorCameraStylesProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [tag, setTag] = useState<string>('All');
  const [preview, setPreview] = useState<DirectorStyle | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DIRECTOR_STYLES.filter(s => {
      if (category !== 'All' && s.category !== category) return false;
      if (tag !== 'All' && !s.tags.includes(tag)) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.shotName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.cinematic_keywords.some(k => k.toLowerCase().includes(q)) ||
        s.emotional_tone.some(k => k.toLowerCase().includes(q))
      );
    });
  }, [search, category, tag]);

  const selectedStyles = useMemo(
    () => DIRECTOR_STYLES.filter(s => selectedIds.includes(s.id)),
    [selectedIds],
  );

  const recommended = useMemo(
    () => (basePrompt.trim().length > 3 ? recommendStyles(basePrompt) : []).slice(0, 6),
    [basePrompt],
  );

  const finalPrompt = useMemo(
    () => buildInjectedPrompt(basePrompt, selectedStyles),
    [basePrompt, selectedStyles],
  );

  const toggle = (id: string) => {
    onSelectedChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  const copy = async (text: string, label = 'Prompt') => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const exportPayload = () => {
    const payload = {
      base_prompt: basePrompt,
      selected_styles: selectedStyles.map(s => ({ id: s.id, title: s.title, shot: s.shotName, injection: s.prompt_injection })),
      final_prompt: finalPrompt,
      camera_language: selectedStyles.map(s => s.shotName),
      lens_language:   selectedStyles.map(s => s.lens_language).filter(Boolean),
      motion_language: selectedStyles.map(s => s.motion_language).filter(Boolean),
      lighting_language: selectedStyles.map(s => s.lighting_language).filter(Boolean),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `director-prompt-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-white/10 bg-gradient-to-b from-neutral-950 to-black text-white">
      <CardContent className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center">
              <Film className="w-5 h-5 text-[#00ff88]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Director Camera Styles</h3>
              <p className="text-xs text-white/50">Pick iconic cinematic camera languages to inject into your Seedance prompt.</p>
            </div>
          </div>
          {selectedStyles.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-white/60 hover:text-white"
              onClick={() => onSelectedChange([])}
            >
              <X className="w-3 h-3 mr-1" /> Clear ({selectedStyles.length})
            </Button>
          )}
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search director, movie, shot, keyword..."
              className="pl-9 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30"
            />
          </div>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="text-xs bg-white/[0.04] border border-white/10 rounded-md px-2 py-2 text-white"
          >
            <option value="All">All Categories</option>
            {DIRECTOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={tag}
            onChange={e => setTag(e.target.value)}
            className="text-xs bg-white/[0.04] border border-white/10 rounded-md px-2 py-2 text-white"
          >
            <option value="All">All Filters</option>
            {DIRECTOR_FILTER_TAGS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>

        {/* Recommended */}
        {recommended.length > 0 && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wand2 className="w-3.5 h-3.5 text-violet-300" />
              <span className="text-xs font-medium text-violet-200">AI suggests for your prompt</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recommended.map(r => {
                const sel = selectedIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggle(r.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      sel
                        ? 'bg-[#00ff88] text-black border-[#00ff88]'
                        : 'bg-white/5 text-white/80 border-white/10 hover:border-[#00ff88]/50'
                    }`}
                  >
                    {sel && <Check className="w-3 h-3 inline mr-1" />}
                    {r.title} · {r.shotName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Style grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[640px] overflow-y-auto pr-1">
          {filtered.map(s => (
            <StyleCard
              key={s.id}
              style={s}
              selected={selectedIds.includes(s.id)}
              onToggle={() => toggle(s.id)}
              onPreview={() => setPreview(s)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-white/40 text-sm py-12">
              No styles match those filters.
            </div>
          )}
        </div>

        {/* Prompt output panel */}
        <div className="rounded-xl border border-white/10 bg-black/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00ff88]" />
            <h4 className="text-sm font-semibold">Seedance Prompt Output</h4>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs text-white/70 hover:text-white" onClick={() => copy(finalPrompt, 'Final prompt')}>
                <Copy className="w-3 h-3 mr-1" /> Copy
              </Button>
              {onApplyFinalPrompt && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-[#00ff88] hover:text-[#00ff88]" onClick={() => onApplyFinalPrompt(finalPrompt)}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Apply to Prompt
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs text-white/70 hover:text-white" onClick={exportPayload}>
                <Download className="w-3 h-3 mr-1" /> Export
              </Button>
            </div>
          </div>

          <PromptRow label="Base prompt" value={basePrompt || <em className="text-white/30">empty</em>} />
          <PromptRow
            label="Camera injection"
            value={selectedStyles.length ? selectedStyles.map(s => s.shotName).join(' + ') : <em className="text-white/30">none selected</em>}
          />
          <PromptRow
            label="Lens language"
            value={selectedStyles.map(s => s.lens_language).filter(Boolean).join(' · ') || <em className="text-white/30">—</em>}
          />
          <PromptRow
            label="Motion language"
            value={selectedStyles.map(s => s.motion_language).filter(Boolean).join(' · ') || <em className="text-white/30">—</em>}
          />
          <PromptRow
            label="Lighting language"
            value={selectedStyles.map(s => s.lighting_language).filter(Boolean).join(' · ') || <em className="text-white/30">—</em>}
          />

          <div className="rounded-lg bg-[#00ff88]/[0.07] border border-[#00ff88]/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#00ff88] mb-1">Final combined prompt</div>
            <div className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap">{finalPrompt}</div>
          </div>
          <p className="text-[10px] text-white/40">
            Selected styles are automatically appended when you submit a generation — no extra step needed.
          </p>
        </div>
      </CardContent>

      <ReferenceModal style={preview} onClose={() => setPreview(null)} />
    </Card>
  );
}

function PromptRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
      <div className="text-[10px] uppercase tracking-wider text-white/40 pt-0.5">{label}</div>
      <div className="text-xs text-white/85 leading-relaxed">{value}</div>
    </div>
  );
}
