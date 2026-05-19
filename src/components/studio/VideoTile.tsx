import { useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Film, Loader2, ChevronDown, Pencil, RotateCw, Crop } from 'lucide-react';
import { STATUS_COLORS, getJobPrompt, type GenerationJob } from '@/lib/studio/types';
import { GrabFrameDialog } from './GrabFrameDialog';
import { submitJob } from '@/lib/studio/hooks';
import { useToast } from '@/hooks/use-toast';

interface Props {
  job: GenerationJob;
  onOpen?: (job: GenerationJob) => void;
  onModify?: (job: GenerationJob) => void;
}

export function VideoTile({ job, onOpen, onModify }: Props) {
  const [grabOpen, setGrabOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const isReady = job.status === 'completed' && !!job.output_video_url;
  const prompt = getJobPrompt(job);

  const handleRecreate = async () => {
    setBusy(true);
    try {
      await submitJob({
        task_type: job.task_type,
        prompt,
        negative_prompt: job.negative_prompt ?? undefined,
        settings_json: { ...(job.settings_json ?? {}), seed: Math.floor(Math.random() * 1e9) },
        input_image_url: job.input_image_url ?? undefined,
        input_audio_url: job.input_audio_url ?? undefined,
        project_id: job.project_id ?? null,
        subproject_id: job.subproject_id ?? null,
      });
      toast({ title: 'Recreating video', description: 'New job queued with a fresh seed.' });
    } catch (e) {
      toast({ title: 'Recreate failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="group relative rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 hover:border-violet-500/40 transition-all cursor-pointer aspect-[9/16]"
        onClick={() => onOpen?.(job)}
      >
        {/* Thumbnail / video */}
        {job.output_thumbnail_url ? (
          <img src={job.output_thumbnail_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : isReady ? (
          <video
            src={job.output_video_url!}
            preload="metadata"
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
            <Film className="w-10 h-10 text-white/10" />
          </div>
        )}

        {/* Running overlay */}
        {job.status === 'running' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <span className="text-xs text-violet-300">{job.progress}%</span>
          </div>
        )}

        {/* Status badge (top-left) — only show if not completed */}
        {job.status !== 'completed' && (
          <Badge variant="outline" className={`absolute top-2 left-2 text-[10px] backdrop-blur ${STATUS_COLORS[job.status]}`}>
            {job.status}
          </Badge>
        )}

        {/* Hover gradient + Use menu */}
        {isReady && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" className="gap-1.5 rounded-full bg-white text-zinc-900 hover:bg-white/90 shadow-lg" disabled={busy}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Use <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="center"
                  className="bg-zinc-950 border-white/10 text-white min-w-[180px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuItem onClick={() => onModify?.(job)} className="gap-2 cursor-pointer">
                    <Pencil className="w-4 h-4" /> Modify Video
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRecreate} className="gap-2 cursor-pointer">
                    <RotateCw className="w-4 h-4" /> Recreate video
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setGrabOpen(true)} className="gap-2 cursor-pointer">
                    <Crop className="w-4 h-4" /> Grab a frame
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>

      <GrabFrameDialog
        open={grabOpen}
        onOpenChange={setGrabOpen}
        videoUrl={job.output_video_url}
        jobId={job.id}
      />
    </>
  );
}
