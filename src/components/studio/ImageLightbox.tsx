import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const EVENT = 'studio:lightbox';

export function openImageLightbox(url: string, alt?: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { url, alt } }));
}

/** Returns props to spread onto any <img> to enable double-click preview. */
export function lightboxProps(url: string | undefined | null, alt?: string) {
  if (!url) return {};
  return {
    onDoubleClick: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openImageLightbox(url, alt);
    },
    title: 'Double-click to enlarge',
    style: { cursor: 'zoom-in' as const },
  };
}

export function ImageLightbox() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState<string>('');

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (!detail.url) return;
      setUrl(detail.url);
      setAlt(detail.alt || '');
      setOpen(true);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[95vw] sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[1200px] p-2 bg-zinc-950 border-white/10">
        {url && (
          <div className="w-full max-h-[85vh] flex items-center justify-center">
            <img src={url} alt={alt} className="max-w-full max-h-[85vh] object-contain rounded-md" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
