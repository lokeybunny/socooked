import { useState, useRef, useCallback, useEffect } from 'react';
import { Download, Play } from 'lucide-react';

interface AdaptiveMediaCardProps {
  id: string;
  url: string;
  title: string;
  type: 'video' | 'image';
  onImageClick?: (url: string) => void;
}

const isExternalUrl = (url: string) => {
  if (url.startsWith('data:')) return false;
  try { return new URL(url).origin !== window.location.origin; }
  catch { return false; }
};

function extractVideoFrame(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    if (isExternalUrl(videoUrl)) video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => { video.currentTime = 1; };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch { reject(new Error('CORS blocked canvas export')); }
    };
    video.onerror = () => reject(new Error('Video load failed'));
  });
}

export default function AdaptiveMediaCard({ id, url, title, type, onImageClick }: AdaptiveMediaCardProps) {
  const [aspect, setAspect] = useState<'landscape' | 'portrait' | 'square' | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const classify = useCallback((w: number, h: number) => {
    const ratio = w / h;
    if (ratio > 1.15) setAspect('landscape');
    else if (ratio < 0.85) setAspect('portrait');
    else setAspect('square');
  }, []);

  // Extract first frame thumbnail for videos
  useEffect(() => {
    if (type !== 'video') return;
    extractVideoFrame(url)
      .then(setThumbnail)
      .catch(() => setThumbnail(null));
  }, [url, type]);

  const handleVideoMeta = useCallback(() => {
    const v = videoRef.current;
    if (v && v.videoWidth && v.videoHeight) classify(v.videoWidth, v.videoHeight);
  }, [classify]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) classify(img.naturalWidth, img.naturalHeight);
  }, [classify]);

  const aspectClass =
    aspect === 'portrait' ? 'aspect-[9/16]' :
    aspect === 'landscape' ? 'aspect-video' :
    'aspect-square';

  if (type === 'video') {
    return (
      <div className={`relative rounded-xl overflow-hidden border border-border bg-black transition-all ${aspect ? aspectClass : 'aspect-video'}`}>
        {!playing && thumbnail ? (
          <>
            <img src={thumbnail} alt={title} className="w-full h-full object-contain" onLoad={e => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) classify(img.naturalWidth, img.naturalHeight);
            }} />
            <button
              onClick={() => setPlaying(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
                <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
              </div>
            </button>
          </>
        ) : (
          <video
            ref={videoRef}
            src={url}
            className="w-full h-full object-contain"
            controls
            autoPlay={playing}
            preload="metadata"
            playsInline
            onLoadedMetadata={handleVideoMeta}
            controlsList="nodownload"
          />
        )}
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
          title="Download full quality"
          onClick={e => e.stopPropagation()}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  return (
    <button
      onClick={() => onImageClick?.(url)}
      className={`group relative rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all hover:shadow-lg bg-black ${aspect ? aspectClass : 'aspect-square'}`}
    >
      <img
        src={url}
        alt={title}
        className="w-full h-full object-contain transition-transform group-hover:scale-[1.02]"
        loading="lazy"
        decoding="async"
        onLoad={handleImageLoad}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className="absolute bottom-1.5 left-2 right-2 text-[10px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {title}
      </p>
    </button>
  );
}
