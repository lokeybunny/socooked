import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2, Film,
} from 'lucide-react';
import { MasterScene, SubScene } from '@/lib/studio/movieMode';

interface Clip {
  videoUrl: string;
  durationSec: number;
  masterNumber: number;
  beatLabel: string;
  subIndex: number;
  title: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scenes: MasterScene[];
}

function collectApprovedClips(scenes: MasterScene[]): Clip[] {
  const out: Clip[] = [];
  for (const m of scenes) {
    for (const s of m.subs as SubScene[]) {
      if (s.status === 'approved' && s.videoUrl) {
        out.push({
          videoUrl: s.videoUrl,
          durationSec: s.durationSec,
          masterNumber: m.number,
          beatLabel: s.beatLabel,
          subIndex: s.index,
          title: m.title,
        });
      }
    }
  }
  return out;
}

export function MoviePlayer({ open, onOpenChange, scenes }: Props) {
  const clips = useMemo(() => collectApprovedClips(scenes), [scenes]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [clipTime, setClipTime] = useState(0);
  const [clipDur, setClipDur] = useState(0);
  const [durations, setDurations] = useState<number[]>([]); // measured per clip

  // Reset when opened or clips change
  useEffect(() => {
    if (open) {
      setIdx(0);
      setPlaying(true);
      setClipTime(0);
      setDurations(clips.map((c) => c.durationSec));
    }
  }, [open, clips]);

  // Total runtime & offsets (use measured durations when available)
  const { total, offsets } = useMemo(() => {
    const off: number[] = [];
    let acc = 0;
    for (let i = 0; i < clips.length; i++) {
      off.push(acc);
      acc += durations[i] || clips[i].durationSec;
    }
    return { total: acc, offsets: off };
  }, [clips, durations]);

  const elapsed = (offsets[idx] || 0) + clipTime;

  const playClip = useCallback((i: number, autoplay = true) => {
    setIdx(i);
    setClipTime(0);
    setPlaying(autoplay);
    requestAnimationFrame(() => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = 0;
      if (autoplay) v.play().catch(() => setPlaying(false));
    });
  }, []);

  const handleEnded = () => {
    if (idx < clips.length - 1) playClip(idx + 1, true);
    else setPlaying(false);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const seekGlobal = (sec: number) => {
    // Find which clip this falls into
    let target = clips.length - 1;
    for (let i = 0; i < clips.length; i++) {
      const start = offsets[i];
      const end = start + (durations[i] || clips[i].durationSec);
      if (sec < end) { target = i; break; }
    }
    const localT = Math.max(0, sec - offsets[target]);
    if (target !== idx) {
      setIdx(target);
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (v) {
          v.currentTime = localT;
          if (playing) v.play().catch(() => {});
        }
      });
    } else {
      const v = videoRef.current;
      if (v) v.currentTime = localT;
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) s = 0;
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted, idx]);

  // Keyboard controls
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') seekGlobal(elapsed + 5);
      else if (e.code === 'ArrowLeft') seekGlobal(Math.max(0, elapsed - 5));
      else if (e.key === 'n' || e.key === 'N') playClip(Math.min(clips.length - 1, idx + 1));
      else if (e.key === 'p' || e.key === 'P') playClip(Math.max(0, idx - 1));
      else if (e.key === 'm' || e.key === 'M') setMuted((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, elapsed, idx, clips.length]);

  const goFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const current = clips[idx];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-[1400px] p-0 bg-black border-emerald-400/20 overflow-hidden">
        <div ref={containerRef} className="relative bg-black">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-4 py-2 bg-gradient-to-b from-black/80 to-transparent">
            <Film className="w-4 h-4 text-emerald-400" />
            <span className="text-xs uppercase tracking-[0.2em] text-emerald-300/90">Movie Mode · Preview</span>
            {current && (
              <span className="text-xs text-white/70 ml-2 truncate">
                Scene {current.masterNumber} · {current.beatLabel} — {current.title}
              </span>
            )}
            <span className="ml-auto text-[11px] font-mono text-white/60">
              Clip {clips.length ? idx + 1 : 0} / {clips.length}
            </span>
          </div>

          {/* Stage */}
          <div className="aspect-video w-full bg-black flex items-center justify-center">
            {clips.length === 0 ? (
              <div className="text-sm text-white/50 px-6 text-center">
                No approved clips yet. Approve sub-scenes in the storyboard to build your movie.
              </div>
            ) : (
              <video
                ref={videoRef}
                src={current?.videoUrl}
                autoPlay={playing}
                playsInline
                onTimeUpdate={(e) => setClipTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  setClipDur(d);
                  setDurations((prev) => {
                    const next = [...prev];
                    if (isFinite(d) && d > 0) next[idx] = d;
                    return next;
                  });
                }}
                onEnded={handleEnded}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                className="w-full h-full object-contain bg-black"
              />
            )}
          </div>

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3 bg-gradient-to-t from-black via-black/80 to-transparent space-y-2">
            {/* Global timeline */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-white/70 w-10 text-right">{fmt(elapsed)}</span>
              <div className="flex-1 relative">
                <Slider
                  value={[elapsed]}
                  min={0}
                  max={Math.max(total, 0.1)}
                  step={0.1}
                  onValueChange={(v) => seekGlobal(v[0])}
                  disabled={!clips.length}
                />
                {/* Chapter markers */}
                <div className="absolute inset-0 pointer-events-none">
                  {offsets.slice(1).map((o, i) => (
                    <div
                      key={i}
                      className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-emerald-400/70"
                      style={{ left: `${(o / Math.max(total, 0.1)) * 100}%` }}
                    />
                  ))}
                </div>
              </div>
              <span className="text-[10px] font-mono text-white/70 w-10">{fmt(total)}</span>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="ghost"
                onClick={() => playClip(Math.max(0, idx - 1))}
                disabled={!clips.length || idx === 0}
                className="h-8 w-8 p-0 text-white hover:bg-white/10"
                title="Previous clip (P)"
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={togglePlay}
                disabled={!clips.length}
                className="h-9 w-9 p-0 bg-emerald-500 hover:bg-emerald-400 text-black rounded-full"
                title="Play/Pause (Space)"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </Button>
              <Button
                size="sm" variant="ghost"
                onClick={() => playClip(Math.min(clips.length - 1, idx + 1))}
                disabled={!clips.length || idx >= clips.length - 1}
                className="h-8 w-8 p-0 text-white hover:bg-white/10"
                title="Next clip (N)"
              >
                <SkipForward className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-2 ml-2 w-36">
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setMuted((m) => !m)}
                  className="h-8 w-8 p-0 text-white hover:bg-white/10"
                  title="Mute (M)"
                >
                  {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Slider
                  value={[muted ? 0 : volume * 100]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => { setVolume(v[0] / 100); setMuted(v[0] === 0); }}
                />
              </div>

              <span className="text-[10px] font-mono text-white/60 ml-3">
                {fmt(clipTime)} / {fmt(clipDur || current?.durationSec || 0)}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm" variant="ghost"
                  onClick={goFullscreen}
                  className="h-8 w-8 p-0 text-white hover:bg-white/10"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Clip strip */}
            {clips.length > 0 && (
              <div className="flex gap-1 overflow-x-auto pt-1">
                {clips.map((c, i) => (
                  <button
                    key={`${c.masterNumber}-${c.subIndex}`}
                    onClick={() => playClip(i)}
                    className={`shrink-0 text-[9px] font-mono px-2 py-1 rounded border transition ${
                      i === idx
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                    title={`${c.title} — ${c.beatLabel}`}
                  >
                    {c.masterNumber}{String.fromCharCode(65 + c.subIndex)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
