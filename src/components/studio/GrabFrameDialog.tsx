import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Download, SkipForward, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  jobId?: string;
}

export function GrabFrameDialog({ open, onOpenChange, videoUrl, jobId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadingBlob, setLoadingBlob] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  // Fetch the video as a blob so canvas isn't tainted by CORS.
  useEffect(() => {
    if (!open || !videoUrl) return;
    let cancelled = false;
    setLoadingBlob(true);
    setReady(false);
    setBlobUrl(null);

    (async () => {
      const tryFetch = async (u: string) => {
        const res = await fetch(u, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      };
      try {
        let blob: Blob;
        try {
          blob = await tryFetch(videoUrl);
        } catch {
          // Fallback: route through our CORS-safe proxy so canvas isn't tainted.
          const proxied = `${SUPABASE_URL}/functions/v1/studio-video-proxy?url=${encodeURIComponent(videoUrl)}`;
          blob = await tryFetch(proxied);
        }
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setBlobUrl(url);
      } catch (e) {
        if (!cancelled) {
          toast({ title: 'Could not load video', description: (e as Error).message, variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoadingBlob(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [open, videoUrl]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      setDuration(0);
      setCurrentTime(0);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setBlobUrl(null);
    }
  }, [open]);

  const handleLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setReady(true);
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(0, t), duration);
    setCurrentTime(v.currentTime);
  };

  const jumpToLast = () => {
    if (duration > 0) seek(Math.max(0, duration - 0.05));
  };

  const downloadFrame = async () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    setDownloading(true);
    try {
      // Wait one tick to ensure frame for currentTime is painted
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      c.width = v.videoWidth || 1080;
      c.height = v.videoHeight || 1920;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas unsupported');
      ctx.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((blob) => {
        if (!blob) {
          toast({ title: 'Download failed', description: 'Could not export frame.', variant: 'destructive' });
          setDownloading(false);
          return;
        }
        const a = document.createElement('a');
        const dl = URL.createObjectURL(blob);
        a.href = dl;
        a.download = `frame-${jobId || 'video'}-${v.currentTime.toFixed(2)}s.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(dl);
        toast({ title: 'Frame downloaded' });
        setDownloading(false);
      }, 'image/png');
    } catch (e) {
      toast({
        title: 'Download failed',
        description: (e as Error).message,
        variant: 'destructive',
      });
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-zinc-950 border-white/10">
        <DialogHeader>
          <DialogTitle>Grab frame</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center relative">
          {loadingBlob && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-black/50 rounded-lg z-10">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading video…
            </div>
          )}
          {blobUrl ? (
            <video
              ref={videoRef}
              src={blobUrl}
              preload="auto"
              onLoadedMetadata={handleLoaded}
              onSeeked={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
              onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
              className="max-h-[55vh] w-auto rounded-lg bg-black"
            />
          ) : !loadingBlob ? (
            <div className="aspect-video w-full bg-black rounded-lg flex items-center justify-center text-muted-foreground">
              No video
            </div>
          ) : (
            <div className="aspect-video w-full bg-black rounded-lg" />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="space-y-3 px-1">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{currentTime.toFixed(1)}s</span>
            <Slider
              value={[currentTime]}
              min={0}
              max={duration || 1}
              step={0.01}
              onValueChange={([v]) => seek(v)}
              disabled={!ready}
              className="flex-1"
            />
            <span>{duration.toFixed(1)}s</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Drag the slider or use ← → keys to scrub. Tip: jump to the last frame for a perfect end-of-clip still.
          </p>
        </div>

        <div className="flex justify-between items-center gap-2 pt-1">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={jumpToLast} disabled={!ready}>
            <SkipForward className="w-3.5 h-3.5" /> Last frame
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90"
            onClick={downloadFrame}
            disabled={!ready || downloading}
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download frame
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
