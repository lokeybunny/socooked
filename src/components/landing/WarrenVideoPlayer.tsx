import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const YOUTUBE_VIDEO_ID = 'Tem6Bl-1Hpo';

export default function WarrenVideoPlayer() {
  const [theaterMode, setTheaterMode] = useState(false);

  const openTheater = useCallback(() => setTheaterMode(true), []);
  const closeTheater = useCallback(() => setTheaterMode(false), []);

  useEffect(() => {
    if (!theaterMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTheater();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [theaterMode, closeTheater]);

  return (
    <>
      {/* Thumbnail */}
      <div className="w-full max-w-xs sm:max-w-sm md:max-w-lg mt-6 sm:mt-8">
        <div
          className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden border border-border/30 shadow-lg group cursor-pointer"
          style={{ aspectRatio: '16/9' }}
          onClick={openTheater}
        >
          <img
            src={`https://img.youtube.com/vi/${YOUTUBE_VIDEO_ID}/hqdefault.jpg`}
            alt="Warren Guru preview"
            className="w-full h-full object-cover grayscale contrast-125"
          />
          <button className="absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity duration-300">
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
              <div className="relative w-full max-w-5xl">
                <button
                  onClick={closeTheater}
                  className="absolute -top-10 right-0 text-white/40 hover:text-white transition-colors duration-300 z-10"
                >
                  <X className="h-5 w-5" />
                </button>

                <div
                  className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl"
                  style={{ aspectRatio: '16/9' }}
                >
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&modestbranding=1&rel=0&showinfo=0&controls=1&color=white`}
                    className="w-full h-full"
                    style={{ border: 'none' }}
                    allow="autoplay; fullscreen; encrypted-media"
                    allowFullScreen
                    title="Warren Guru"
                  />
                </div>
                <a
                  href="https://discord.gg/warrenguru"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 px-8 py-2.5 text-[10px] sm:text-xs tracking-[0.3em] uppercase font-light border border-white/20 rounded-lg text-white/60 hover:text-white hover:border-white/50 transition-all duration-300 inline-block text-center"
                >
                  Download
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
