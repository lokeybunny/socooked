import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useStudioJobs, cancelJob, retryJob } from '@/lib/studio/hooks';
import { TASK_LABELS, STATUS_COLORS, type GenerationJob } from '@/lib/studio/types';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, RotateCcw, XCircle, ChevronDown, ChevronUp, ListOrdered } from 'lucide-react';
import { useState } from 'react';

export function StudioQueue() {
  const { jobs, loading, refetch } = useStudioJobs();
  const { toast } = useToast();

  const activeJobs = jobs.filter(j => ['queued', 'provisioning', 'running'].includes(j.status));
  const recentDone = jobs.filter(j => ['completed', 'failed', 'cancelled'].includes(j.status)).slice(0, 20);

  const handleCancel = async (id: string) => {
    try {
      await cancelJob(id);
      toast({ title: 'Job cancelled' });
      refetch();
    } catch (err) {
      toast({ title: 'Cancel failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await retryJob(id);
      toast({ title: 'Job re-queued' });
      refetch();
    } catch (err) {
      toast({ title: 'Retry failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-violet-400" /> Active Jobs ({activeJobs.length})
        </h3>
        {activeJobs.length === 0 ? (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-8 text-center text-muted-foreground text-sm">No active jobs</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeJobs.map(job => (
              <QueueRow key={job.id} job={job} onCancel={handleCancel} onRetry={handleRetry} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold mb-3 text-muted-foreground text-sm">Recent Completed / Failed</h3>
        {recentDone.length === 0 ? (
          <p className="text-xs text-muted-foreground">No completed jobs yet</p>
        ) : (
          <div className="space-y-2">
            {recentDone.map(job => (
              <QueueRow key={job.id} job={job} onCancel={handleCancel} onRetry={handleRetry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRow({ job, onCancel, onRetry }: { job: GenerationJob; onCancel: (id: string) => void; onRetry: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COLORS[job.status]}`}>{job.status}</Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{job.prompt}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground">{TASK_LABELS[job.task_type]}</span>
              <span className="text-[10px] text-muted-foreground">•</span>
              <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
            </div>
          </div>
          {job.status === 'running' && (
            <div className="w-24 shrink-0">
              <Progress value={job.progress} className="h-1.5" />
              <p className="text-[10px] text-center text-muted-foreground mt-0.5">{job.progress}%</p>
            </div>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {(job.status === 'queued' || job.status === 'provisioning') && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-red-400 hover:text-red-300" onClick={() => onCancel(job.id)}>
                <XCircle className="w-3 h-3" /> Cancel
              </Button>
            )}
            {job.status === 'failed' && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => onRetry(job.id)}>
                <RotateCcw className="w-3 h-3" /> Retry
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/30 space-y-2 text-xs">
            <div><span className="text-muted-foreground">Job ID:</span> {job.id}</div>
            {job.worker_job_id && <div><span className="text-muted-foreground">Worker ID:</span> {job.worker_job_id}</div>}
            {job.error_message && (
              <div className="p-2 bg-red-950/30 border border-red-500/30 rounded text-red-300">{job.error_message}</div>
            )}
            {job.backend_logs && (
              <div>
                <span className="text-muted-foreground">Logs:</span>
                <pre className="mt-1 bg-muted/30 p-2 rounded overflow-auto max-h-[120px] text-[10px]">{job.backend_logs}</pre>
              </div>
            )}
            {job.settings_json && (
              <pre className="bg-muted/30 p-2 rounded overflow-auto max-h-[80px] text-[10px]">{JSON.stringify(job.settings_json, null, 2)}</pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
