import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';

interface VideoPosterProps {
  src: string;
  className?: string;
  alt?: string;
}

const cache = new Map<string, string>();

function extractFirstFrame(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    try {
      if (new URL(videoUrl, window.location.href).origin !== window.location.origin) {
        video.crossOrigin = 'anonymous';
      }
    } catch {}
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;
    const onSeeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = video.videoWidth || 320;
        c.height = video.videoHeight || 320;
        c.getContext('2d')?.drawImage(video, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', 0.7);
        resolve(url);
      } catch (e) {
        reject(e);
      }
    };
    video.addEventListener('loadeddata', () => {
      try {
        video.currentTime = 0.1;
      } catch {
        onSeeked();
      }
    });
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', () => reject(new Error('video load failed')));
  });
}

export default function VideoPoster({ src, className = '', alt = '' }: VideoPosterProps) {
  const [thumb, setThumb] = useState<string | null>(() => cache.get(src) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache.has(src)) {
      setThumb(cache.get(src)!);
      return;
    }
    let cancelled = false;
    extractFirstFrame(src)
      .then(url => {
        if (cancelled) return;
        cache.set(src, url);
        setThumb(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [src]);

  if (thumb) return <img src={thumb} alt={alt} className={className} />;
  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <Play className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return <div className={`bg-muted animate-pulse ${className}`} />;
}
