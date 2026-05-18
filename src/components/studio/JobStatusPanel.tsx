import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useStudioJobs, cancelJob, retryJob } from '@/lib/studio/hooks';
import { STATUS_COLORS, TASK_LABELS, getJobPrompt, type GenerationJob } from '@/lib/studio/types';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Activity, CheckCircle2, XCircle, Loader2, RotateCcw, X,
  ExternalLink, Clock,
} from 'lucide-react';

const ACTIVE = new Set(['queued', 'provisioning', 'running']);

export function JobStatusPanel() {
  const { jobs, refetch } = useStudioJobs();
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Poll fallback every 5s while any job is active (covers realtime gaps)
  useEffect(() => {
    const hasActive = jobs.some(j => ACTIVE.has(j.status));
    if (!hasActive) return;
    const iv = setInterval(refetch, 5000);
    return () => clearInterval(iv);
  }, [jobs, refetch]);

  const mine = userId ? jobs.filter(j => j.user_id === userId) : jobs;
  const active = mine.filter(j => ACTIVE.has(j.status));
  const recent = mine.filter(j => !ACTIVE.has(j.status)).slice(0, 3);
  const visible = [...active, ...recent].slice(0, 6);

  const handleCancel = async (id: string) => {
    setBusy(id);
    try {
      await cancelJob(id);
      toast({ title: 'Job cancelled' });
      refetch();
    } catch (e) {
      toast({ title: 'Cancel failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleRetry = async (id: string) => {
    setBusy(id);
    try {
      await retryJob(id);
      toast({ title: 'Job re-queued' });
      refetch();
    } catch (e) {
      toast({ title: 'Retry failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-400" />
            Job Status
          </h4>
          {active.length > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-violet-500/50 text-violet-300">
              <Loader2 className="w-3 h-3 animate-spin" /> {active.length} active
            </Badge>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <Clock className="w-5 h-5 mx-auto mb-2 opacity-50" />
            No jobs yet. Submit one to see progress here.
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map(job => (
              <JobRow
                key={job.id}
                job={job}
                busy={busy === job.id}
                onCancel={() => handleCancel(job.id)}
                onRetry={() => handleRetry(job.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobRow({
  job, busy, onCancel, onRetry,
}: {
  job: GenerationJob;
  busy: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const isActive = ACTIVE.has(job.status);
  const isDone = job.status === 'completed';
  const isFailed = job.status === 'failed' || job.status === 'cancelled';
  const prompt = getJobPrompt(job);

  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2 min-w-0">
        {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
        {isFailed && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        {isActive && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />}
        <span className="text-[11px] text-muted-foreground shrink-0">{TASK_LABELS[job.task_type]}</span>
        <Badge className={`${STATUS_COLORS[job.status]} text-[10px] px-1.5 py-0 h-4 ml-auto shrink-0`}>
          {job.status}
        </Badge>
      </div>

      <p className="text-xs line-clamp-2 leading-snug">{prompt}</p>

      {isActive && (
        <div className="space-y-1">
          <Progress value={job.progress || 0} className="h-1" />
          <p className="text-[10px] text-muted-foreground">{job.progress || 0}%</p>
        </div>
      )}

      {isFailed && job.error_message && (
        <p className="text-[10px] text-red-400/80 line-clamp-2">{job.error_message}</p>
      )}

      <div className="flex items-center gap-1.5 pt-0.5">
        {isDone && job.output_video_url && (
          <a
            href={job.output_video_url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-violet-300 hover:text-violet-200 flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> View video
          </a>
        )}
        {isActive && (
          <Button
            variant="ghost" size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-red-400"
            disabled={busy} onClick={onCancel}
          >
            <X className="w-3 h-3" /> Cancel
          </Button>
        )}
        {isFailed && (
          <Button
            variant="ghost" size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-violet-300"
            disabled={busy} onClick={onRetry}
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}
