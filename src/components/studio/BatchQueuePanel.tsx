import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  getOrCreateActiveBatch, useBatch, removeBatchItem, runBatch, clearBatch,
  type StudioBatch,
} from '@/lib/studio/batches';
import { useStudioProjects, useStudioSubprojects } from '@/lib/studio/hooks';
import { TASK_LABELS } from '@/lib/studio/types';
import { Layers, X, Play, Trash2, Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon } from 'lucide-react';

interface Props {
  projectId: string | null;
  subprojectId: string | null;
}

export function BatchQueuePanel({ projectId, subprojectId }: Props) {
  const [activeBatch, setActiveBatch] = useState<StudioBatch | null>(null);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const { toast } = useToast();
  const { projects } = useStudioProjects();
  const { subprojects } = useStudioSubprojects(projectId);

  const projectName = useMemo(() => projects.find(p => p.id === projectId)?.name ?? null, [projects, projectId]);
  const subprojectName = useMemo(() => subprojects.find(s => s.id === subprojectId)?.name ?? null, [subprojects, subprojectId]);

  const { batch, items, refetch } = useBatch(activeBatch?.id ?? null);

  useEffect(() => { setActiveBatch(null); }, [projectId, subprojectId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setResolving(true);
      try {
        const b = await getOrCreateActiveBatch({ projectId, subprojectId, projectName, subprojectName });
        if (alive) setActiveBatch(b);
      } catch {
        /* silent */
      } finally {
        if (alive) setResolving(false);
      }
    })();
    return () => { alive = false; };
  }, [projectId, subprojectId, projectName, subprojectName]);

  // Refresh every 4s so items added via "Add to Batch" appear without manual refresh
  useEffect(() => {
    if (!batch) return;
    const t = setInterval(refetch, 4000);
    return () => clearInterval(t);
  }, [batch, refetch]);

  const queuedCount = items.filter(i => i.status === 'queued').length;
  const submittedCount = items.filter(i => i.status === 'submitted').length;
  const failedCount = items.filter(i => i.status === 'failed').length;

  const handleRun = async () => {
    if (!batch || queuedCount === 0) return;
    setRunning(true);
    try {
      const res = await runBatch(batch.id, projectId, subprojectId);
      toast({
        title: 'Batch submitted',
        description: `${res.completed} queued for generation${res.failed ? ` · ${res.failed} failed to submit` : ''}.`,
      });
      setActiveBatch(null);
      const fresh = await getOrCreateActiveBatch({ projectId, subprojectId, projectName, subprojectName });
      setActiveBatch(fresh);
    } catch (e) {
      toast({ title: 'Run failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setRunning(false);
      refetch();
    }
  };

  const handleRemove = async (id: string) => {
    if (!batch) return;
    await removeBatchItem(id, batch.id);
    refetch();
  };

  const handleClear = async () => {
    if (!batch) return;
    if (!confirm('Remove all queued items from this batch?')) return;
    await clearBatch(batch.id);
    refetch();
  };

  return (
    <Card className="border-violet-500/30 bg-card/50 backdrop-blur">
      <CardContent className="p-3 space-y-2">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold">Batch Queue</span>
            {items.length > 0 && (
              <Badge className="bg-violet-500/20 text-violet-300 text-[10px] px-1.5 py-0 h-4">
                {items.length}
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">{expanded ? 'Hide' : 'Show'}</span>
        </button>

        {expanded && (
          <>
            {batch && (
              <div className="flex flex-wrap gap-1 text-[10px]">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{queuedCount} queued</Badge>
                {submittedCount > 0 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-green-400 border-green-500/40">{submittedCount} sent</Badge>}
                {failedCount > 0 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-red-400 border-red-500/40">{failedCount} failed</Badge>}
              </div>
            )}

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {resolving && !batch ? (
                <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-muted-foreground">
                  No items queued.<br />
                  Use <span className="text-foreground font-medium">Add to Batch</span> below.
                </div>
              ) : (
                items.map((it, idx) => (
                  <div key={it.id} className="flex items-start gap-2 p-2 rounded-md bg-background/40 border border-border/40">
                    <div className="w-8 h-8 rounded bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                      {it.input_image_url ? (
                        <img src={it.input_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-3 h-3 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[9px] text-muted-foreground">#{idx + 1}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                          {TASK_LABELS[it.task_type] || it.task_type}
                        </Badge>
                        {it.status === 'submitted' && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                        {it.status === 'failed' && <AlertTriangle className="w-2.5 h-2.5 text-red-400" />}
                      </div>
                      <p className="text-[10px] line-clamp-2 leading-snug text-muted-foreground">{it.prompt}</p>
                    </div>
                    {it.status === 'queued' && (
                      <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0 text-muted-foreground hover:text-red-400" onClick={() => handleRemove(it.id)}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>

            <Button
              onClick={handleRun}
              disabled={running || queuedCount === 0 || !batch}
              size="sm"
              className="w-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? 'Submitting...' : `Run Batch (${queuedCount})`}
            </Button>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full h-7 gap-1 text-[10px] text-muted-foreground hover:text-red-400" onClick={handleClear}>
                <Trash2 className="w-3 h-3" /> Clear queued
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
