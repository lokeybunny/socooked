import { useState, useCallback, useEffect } from 'react';
import { Play, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const VIMEO_VIDEO_ID = '1165489263';

export default function VideoPlayer() {
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
          <iframe
            src={`https://player.vimeo.com/video/${VIMEO_VIDEO_ID}?background=1&muted=1&loop=1&autopause=0`}
            className="w-full h-full object-cover grayscale contrast-125 pointer-events-none"
            style={{ border: 'none' }}
            allow="autoplay"
            title="STU25 Preview"
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
              <div className="relative w-full max-w-5xl group">
                <button
                  onClick={closeTheater}
                  className="absolute -top-10 right-0 text-white/40 hover:text-white transition-colors duration-300 z-10"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: '16/9' }}>
                  <iframe
                    src={`https://player.vimeo.com/video/${VIMEO_VIDEO_ID}?autoplay=1&loop=1&title=0&byline=0&portrait=0&muted=0`}
                    className="w-full h-full grayscale contrast-125"
                    style={{ border: 'none' }}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    title="STU25 Preview"
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
