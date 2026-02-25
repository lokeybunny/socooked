import { useState, useEffect, useRef } from 'react';
import { Play } from 'lucide-react';

interface VideoThumbnailProps {
  src: string;
  title?: string;
  className?: string;
  videoClassName?: string;
  controls?: boolean;
  preload?: string;
  playsInline?: boolean;
}

function extractFirstFrame(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    try {
      if (new URL(videoUrl).origin !== window.location.origin) video.crossOrigin = 'anonymous';
    } catch {}
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => { video.currentTime = 0.5; };
    video.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext('2d')?.drawImage(video, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.8));
      } catch { reject(new Error('CORS')); }
    };
    video.onerror = () => reject(new Error('load failed'));
  });
}

export default function VideoThumbnail({
  src,
  title,
  className = '',
  videoClassName = 'w-full h-full object-cover',
  controls = true,
  playsInline = true,
}: VideoThumbnailProps) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setThumb(null);
    setPlaying(false);
    extractFirstFrame(src).then(setThumb).catch(() => setThumb(null));
  }, [src]);

  if (!playing && thumb) {
    return (
      <div className={`relative cursor-pointer ${className}`} onClick={() => setPlaying(true)}>
        <img src={thumb} alt={title || 'Video thumbnail'} className={videoClassName} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
          <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      className={`${videoClassName} ${className}`}
      controls={controls}
      autoPlay={playing}
      playsInline={playsInline}
      preload="metadata"
    />
  );
}
