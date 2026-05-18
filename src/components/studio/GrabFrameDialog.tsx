import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Download, SkipForward, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  jobId?: string;
}

export function GrabFrameDialog({ open, onOpenChange, videoUrl, jobId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setReady(false);
      setDuration(0);
      setCurrentTime(0);
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
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas unsupported');
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `frame-${jobId || 'video'}-${v.currentTime.toFixed(2)}s.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast({ title: 'Frame downloaded' });
    } catch (e) {
      toast({
        title: 'Download failed',
        description: (e as Error).message + ' — video may be cross-origin protected.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-zinc-950 border-white/10">
        <DialogHeader>
          <DialogTitle>Grab frame</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              crossOrigin="anonymous"
              preload="auto"
              onLoadedMetadata={handleLoaded}
              onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
              className="max-h-[55vh] w-auto rounded-lg bg-black"
            />
          ) : (
            <div className="aspect-video w-full bg-black rounded-lg flex items-center justify-center text-muted-foreground">
              No video
            </div>
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
