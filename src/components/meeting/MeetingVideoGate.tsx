import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Player from '@vimeo/player';
import { Button } from '@/components/ui/button';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';

const VIMEO_VIDEO_ID = '1165489263';

// For now all categories map to the same video; swap per-category later
const CATEGORY_VIDEOS: Record<string, string> = Object.fromEntries(
  SERVICE_CATEGORIES.map(c => [c.id, VIMEO_VIDEO_ID])
);

interface MeetingVideoGateProps {
  category: string | null;
  onComplete: () => void;
}

export default function MeetingVideoGate({ category, onComplete }: MeetingVideoGateProps) {
  const videoId = (category && CATEGORY_VIDEOS[category]) || VIMEO_VIDEO_ID;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<Player | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [watchComplete, setWatchComplete] = useState(false);

  useEffect(() => {
    if (!iframeRef.current) return;

    const player = new Player(iframeRef.current);
    playerRef.current = player;

    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    player.on('timeupdate', (data: { seconds: number; duration: number }) => {
      setProgress(data.seconds);
      setDuration(data.duration);
    });
    player.on('ended', () => {
      setWatchComplete(true);
    });

    player.setVolume(1);
    player.play();

    return () => {
      player.off('play');
      player.off('pause');
      player.off('timeupdate');
      player.off('ended');
    };
  }, [videoId]);

  // Also mark complete if watched >= 95%
  useEffect(() => {
    if (duration > 0 && progress >= duration * 0.95) {
      setWatchComplete(true);
    }
  }, [progress, duration]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    isPlaying ? playerRef.current.pause() : playerRef.current.play();
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const categoryLabel = SERVICE_CATEGORIES.find(c => c.id === category)?.label || 'General';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-6 text-center animate-fade-in">
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Required Viewing</h1>
          <p className="text-sm text-muted-foreground">
            Please watch the <span className="font-medium text-foreground">{categoryLabel}</span> briefing video before joining the meeting.
          </p>
        </div>

        <div className="relative w-full rounded-xl overflow-hidden shadow-2xl group" style={{ aspectRatio: '16/9' }}>
          <iframe
            ref={iframeRef}
            src={`https://player.vimeo.com/video/${videoId}?background=1&autopause=0&loop=0`}
            className="w-full h-full"
            style={{ border: 'none' }}
            allow="autoplay; fullscreen"
            title="Meeting Briefing Video"
          />

          {/* Custom controls */}
          <div
            className="absolute inset-0 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            onClick={(e) => { if (e.target === e.currentTarget) togglePlay(); }}
          >
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

            <div className="bg-gradient-to-t from-black/70 to-transparent pt-12 pb-3 px-4">
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
              </div>
            </div>
          </div>
        </div>

        {watchComplete ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-center gap-2 text-emerald-500">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Video complete</span>
            </div>
            <Button className="w-full max-w-xs mx-auto" onClick={onComplete}>
              Continue to Meeting
            </Button>
          </motion.div>
        ) : (
          <p className="text-xs text-muted-foreground">
            You must watch the full video before joining the call.
          </p>
        )}
      </div>
    </div>
  );
}
