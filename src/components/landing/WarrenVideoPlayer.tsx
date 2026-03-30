import { useState, useCallback, useEffect } from 'react';
import { Play, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import robotThumb from '@/assets/landing/robot-thumbnail.jpg';

const YOUTUBE_VIDEO_ID = 'a-quzsaSpNU';

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
      {/* Thumbnail — uses original robot image */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-cyan-500/5 group cursor-pointer"
        style={{ aspectRatio: '16/9' }}
        onClick={openTheater}
      >
        <img
          src={robotThumb}
          alt="AI-powered wholesale automation demo"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/30 transition-colors">
          <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Play className="h-8 w-8 text-white ml-1" fill="white" />
          </div>
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
                  className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl bg-black"
                  style={{ aspectRatio: '16/9' }}
                >
                  <iframe
                    src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&modestbranding=1&rel=0&showinfo=0&controls=1&iv_load_policy=3&fs=1&playsinline=1`}
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 'none' }}
                    allow="autoplay; fullscreen; encrypted-media; accelerometer; gyroscope"
                    allowFullScreen
                    title="Warren Guru"
                  />
                  {/* Block YouTube logo click-through */}
                  <div className="absolute top-0 right-0 w-28 h-14 z-10" />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
