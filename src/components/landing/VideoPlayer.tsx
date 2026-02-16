import { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import previewReel from '@/assets/preview-reel.mp4';

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const theaterVideoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);

  const openTheater = useCallback(() => {
    setTheaterMode(true);
  }, []);

  const closeTheater = useCallback(() => {
    setTheaterMode(false);
    setPlaying(false);
    const v = theaterVideoRef.current;
    if (v) v.pause();
  }, []);

  // Auto-play when theater opens
  useEffect(() => {
    if (theaterMode && theaterVideoRef.current) {
      theaterVideoRef.current.play();
      setPlaying(true);
    }
  }, [theaterMode]);

  // Escape to close
  useEffect(() => {
    if (!theaterMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTheater();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [theaterMode, closeTheater]);

  const togglePlay = useCallback(() => {
    const v = theaterVideoRef.current;
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
    const v = theaterVideoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const v = theaterVideoRef.current;
    if (!v) return;
    if (!document.fullscreenElement) {
      v.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  return (
    <>
      {/* Thumbnail */}
      <div className="w-full max-w-xs sm:max-w-sm md:max-w-lg mt-6 sm:mt-8">
        <div
          className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden border border-border/30 shadow-lg group cursor-pointer"
          style={{ aspectRatio: '16/9' }}
          onClick={openTheater}
        >
          <video
            ref={videoRef}
            src={previewReel}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover grayscale contrast-125"
          />
          <button
            className="absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity duration-300"
          >
            <div className="rounded-full bg-foreground/20 backdrop-blur-sm p-4 sm:p-5 transition-transform duration-300 hover:scale-110">
              <Play className="h-6 w-6 sm:h-8 sm:w-8 text-foreground/70 fill-foreground/70" />
            </div>
          </button>
        </div>
      </div>

      {/* Theater overlay */}
      <AnimatePresence>
        {theaterMode && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              onClick={closeTheater}
            />
            <motion.div
              className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8 md:p-12"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="relative w-full max-w-5xl group">
                {/* Close button */}
                <button
                  onClick={closeTheater}
                  className="absolute -top-10 right-0 text-white/40 hover:text-white transition-colors duration-300 z-10"
                >
                  <X className="h-5 w-5" />
                </button>

                {/* Video */}
                <div className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: '16/9' }}>
                  <video
                    ref={theaterVideoRef}
                    src={previewReel}
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover grayscale contrast-125"
                  />

                  {/* Controls bar */}
                  <div
                    className="absolute bottom-0 inset-x-0 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  >
                    <button onClick={togglePlay} className="text-white/70 hover:text-white transition-colors">
                      {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white/70" />}
                    </button>
                    <div className="flex items-center gap-4">
                      <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors">
                        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </button>
                      <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
                        {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
