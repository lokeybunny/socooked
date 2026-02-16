import { useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import previewReel from '@/assets/preview-reel.mp4';

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  return (
    <div className="w-full max-w-xs sm:max-w-sm md:max-w-lg mt-6 sm:mt-8">
      <div
        ref={containerRef}
        className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden border border-border/30 shadow-lg group cursor-pointer"
        style={{ aspectRatio: '16/9' }}
      >
        <video
          ref={videoRef}
          src={previewReel}
          loop
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover grayscale contrast-125"
        />

        {/* Play/Pause overlay */}
        {!playing && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity duration-300"
          >
            <div className="rounded-full bg-foreground/20 backdrop-blur-sm p-4 sm:p-5 transition-transform duration-300 hover:scale-110">
              <Play className="h-6 w-6 sm:h-8 sm:w-8 text-foreground/70 fill-foreground/70" />
            </div>
          </button>
        )}

        {/* Controls bar — visible on hover when playing */}
        <div
          className={`absolute bottom-0 inset-x-0 flex items-center justify-between px-3 py-2 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
            playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'
          }`}
        >
          <button onClick={togglePlay} className="text-foreground/70 hover:text-foreground transition-colors">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-foreground/70" />}
          </button>
          <div className="flex items-center gap-3">
            <button onClick={toggleMute} className="text-foreground/70 hover:text-foreground transition-colors">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button onClick={toggleFullscreen} className="text-foreground/70 hover:text-foreground transition-colors">
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
