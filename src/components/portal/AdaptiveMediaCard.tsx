import { useState, useRef, useCallback } from 'react';
import { Download } from 'lucide-react';

interface AdaptiveMediaCardProps {
  id: string;
  url: string;
  title: string;
  type: 'video' | 'image';
  onImageClick?: (url: string) => void;
}

/**
 * Renders media in its native aspect ratio.
 * - Videos: uses onLoadedMetadata to detect dimensions, streams with preload="metadata"
 * - Images: uses onLoad to detect natural dimensions
 * Both render at native aspect ratio (landscape, portrait, or square).
 */
export default function AdaptiveMediaCard({ id, url, title, type, onImageClick }: AdaptiveMediaCardProps) {
  const [aspect, setAspect] = useState<'landscape' | 'portrait' | 'square' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const classify = useCallback((w: number, h: number) => {
    const ratio = w / h;
    if (ratio > 1.15) setAspect('landscape');
    else if (ratio < 0.85) setAspect('portrait');
    else setAspect('square');
  }, []);

  const handleVideoMeta = useCallback(() => {
    const v = videoRef.current;
    if (v && v.videoWidth && v.videoHeight) {
      classify(v.videoWidth, v.videoHeight);
    }
  }, [classify]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      classify(img.naturalWidth, img.naturalHeight);
    }
  }, [classify]);

  // Aspect ratio class — show native proportions
  const aspectClass =
    aspect === 'portrait' ? 'aspect-[9/16]' :
    aspect === 'landscape' ? 'aspect-video' :
    'aspect-square';

  if (type === 'video') {
    return (
      <div className={`relative rounded-xl overflow-hidden border border-border bg-black transition-all ${aspect ? aspectClass : 'aspect-video'}`}>
        <video
          ref={videoRef}
          src={url}
          className="w-full h-full object-contain"
          controls
          preload="metadata"
          playsInline
          onLoadedMetadata={handleVideoMeta}
          controlsList="nodownload"
        />
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors opacity-0 hover:opacity-100 focus:opacity-100 z-10"
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
