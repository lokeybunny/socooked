import { useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

interface VerticalVideoProps {
  src: string;
  label: string;
}

export function VerticalVideo({ src, label }: VerticalVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-border/40 shadow-2xl group">
      <video
        ref={ref}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        controls={playing}
        className="w-full h-full object-cover"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={(e) => {
          // Allow native controls to handle clicks once visible
          if (!playing) {
            e.preventDefault();
            toggle();
          }
        }}
      />
      <span className="absolute top-4 left-4 px-2.5 py-1 text-[10px] tracking-[0.25em] uppercase bg-black/70 backdrop-blur-sm text-white rounded-full pointer-events-none z-10">
        {label}
      </span>
      {/* Center play/pause overlay — 40% opacity */}
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center z-20 group/btn"
        >
          <span className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center transition-all duration-300 group-hover/btn:bg-white/60 group-hover/btn:scale-110 shadow-2xl">
            <Play className="h-9 w-9 sm:h-10 sm:w-10 text-white fill-white translate-x-0.5" />
          </span>
        </button>
      )}
      {playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Pause video"
          className="absolute top-4 right-4 z-20 h-10 w-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Pause className="h-4 w-4 text-white fill-white" />
        </button>
      )}
    </div>
  );
}
