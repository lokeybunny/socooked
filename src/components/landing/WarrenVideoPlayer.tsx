import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, X, MessageCircle, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import robotThumb from '@/assets/landing/robot-thumbnail.jpg';

const YOUTUBE_VIDEO_ID = 'Tem6Bl-1Hpo';
const VIDEO_DURATION_SECONDS = 600;

export default function WarrenVideoPlayer() {
  const [theaterMode, setTheaterMode] = useState(false);
  const [remaining, setRemaining] = useState(VIDEO_DURATION_SECONDS);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const openTheater = useCallback(() => {
    setTheaterMode(true);
    setRemaining(VIDEO_DURATION_SECONDS);
    setFinished(false);
  }, []);

  const closeTheater = useCallback(() => {
    setTheaterMode(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (!theaterMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTheater();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [theaterMode, closeTheater]);

  // Countdown timer
  useEffect(() => {
    if (!theaterMode) return;
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [theaterMode]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Thumbnail */}
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
                    src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&modestbranding=1&rel=0&showinfo=0&controls=1&iv_load_policy=3&fs=1&playsinline=1&vq=hd1080`}
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 'none' }}
                    allow="autoplay; fullscreen; encrypted-media; accelerometer; gyroscope"
                    allowFullScreen
                    title="Warren Guru"
                  />
                  <div className="absolute top-0 right-0 w-28 h-14 z-10" />
                </div>

                {/* Countdown / CTA below video */}
                <div className="mt-4 flex justify-center">
                  <AnimatePresence mode="wait">
                    {!finished ? (
                      <motion.p
                        key="countdown"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-white/30 text-lg sm:text-xl font-mono tracking-widest font-light"
                      >
                        {formatTime(remaining)} remaining
                      </motion.p>
                    ) : (
                      <motion.div
                        key="cta"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="flex flex-col sm:flex-row items-center gap-3"
                      >
                        <a
                          href="https://discord.gg/warrenguru"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-2 px-6 py-2.5 text-xs tracking-[0.25em] uppercase font-medium border border-white/20 rounded-lg text-white/70 hover:text-white hover:border-white/50 hover:bg-white/[0.05] transition-all duration-300"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Join The Discord
                        </a>
                        <a
                          href="tel:+17027016192"
                          className="group flex items-center gap-2 px-6 py-2.5 text-xs tracking-[0.25em] uppercase font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-all duration-300"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Call NOW
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
