import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Pause, X, Volume2, VolumeX, Maximize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Player from '@vimeo/player';

const VIMEO_VIDEO_ID = '1165489263';

export default function VideoPlayer() {
  const [theaterMode, setTheaterMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<Player | null>(null);

  const openTheater = useCallback(() => setTheaterMode(true), []);
  const closeTheater = useCallback(() => {
    setTheaterMode(false);
    setIsPlaying(false);
    setProgress(0);
    playerRef.current = null;
  }, []);

  // Init Vimeo Player SDK when theater opens
  useEffect(() => {
    if (!theaterMode || !iframeRef.current) return;

    const player = new Player(iframeRef.current);
    playerRef.current = player;

    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    player.on('timeupdate', (data: { seconds: number; duration: number }) => {
      setProgress(data.seconds);
      setDuration(data.duration);
    });

    // Start unmuted
    player.setVolume(1);
    player.play();

    return () => {
      player.off('play');
      player.off('pause');
      player.off('timeupdate');
    };
  }, [theaterMode]);

  useEffect(() => {
    if (!theaterMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTheater();
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [theaterMode, closeTheater]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
    } else {
      playerRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.setVolume(1);
      setIsMuted(false);
    } else {
      playerRef.current.setVolume(0);
      setIsMuted(true);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    playerRef.current.setCurrentTime(ratio * duration);
  };

  const handleFullscreen = () => {
    if (!iframeRef.current) return;
    if (iframeRef.current.requestFullscreen) {
      iframeRef.current.requestFullscreen();
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

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
                  {/* Vimeo in background mode — no branding, no controls */}
                  <iframe
                    ref={iframeRef}
                    src={`https://player.vimeo.com/video/${VIMEO_VIDEO_ID}?background=1&autopause=0&loop=0`}
                    className="w-full h-full"
                    style={{ border: 'none' }}
                    allow="autoplay; fullscreen"
                    title="STU25 Preview"
                  />

                  {/* Custom controls overlay */}
                  <div
                    className="absolute inset-0 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) togglePlay();
                    }}
                  >
                    {/* Center play/pause on click */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <AnimatePresence>
                        {!isPlaying && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="rounded-full bg-black/40 backdrop-blur-sm p-5"
                          >
                            <Play className="h-8 w-8 text-white fill-white" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Bottom bar */}
                    <div className="bg-gradient-to-t from-black/70 to-transparent pt-12 pb-3 px-4">
                      {/* Progress bar */}
                      <div
                        className="w-full h-1 bg-white/20 rounded-full cursor-pointer mb-3 group/bar"
                        onClick={handleSeek}
                      >
                        <div
                          className="h-full bg-white/80 rounded-full relative transition-all"
                          style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button onClick={togglePlay} className="text-white/80 hover:text-white transition-colors">
                            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white/80" />}
                          </button>
                          <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors">
                            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                          </button>
                          <span className="text-white/60 text-[10px] sm:text-xs font-mono tracking-wider">
                            {formatTime(progress)} / {formatTime(duration)}
                          </span>
                        </div>
                        <button onClick={handleFullscreen} className="text-white/80 hover:text-white transition-colors">
                          <Maximize className="h-4 w-4" />
                        </button>
                      </div>
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
