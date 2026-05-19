import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  getOrCreateActiveBatch, useBatch, removeBatchItem, runBatch, clearBatch, renameBatch,
  type StudioBatch,
} from '@/lib/studio/batches';
import { useStudioProjects, useStudioSubprojects } from '@/lib/studio/hooks';
import { TASK_LABELS } from '@/lib/studio/types';
import { Layers, X, Play, Trash2, Pencil, Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon } from 'lucide-react';

interface Props {
  projectId: string | null;
  subprojectId: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  running: 'bg-violet-500/20 text-violet-300',
  completed: 'bg-green-500/20 text-green-400',
  partial: 'bg-amber-500/20 text-amber-400',
  failed: 'bg-red-500/20 text-red-400',
};

export function BatchDrawer({ projectId, subprojectId }: Props) {
  const [open, setOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState<StudioBatch | null>(null);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const { toast } = useToast();
  const { projects } = useStudioProjects();
  const { subprojects } = useStudioSubprojects(projectId);

  const projectName = useMemo(() => projects.find(p => p.id === projectId)?.name ?? null, [projects, projectId]);
  const subprojectName = useMemo(() => subprojects.find(s => s.id === subprojectId)?.name ?? null, [subprojects, subprojectId]);

  const { batch, items, refetch } = useBatch(activeBatch?.id ?? null);

  // Resolve active batch for current scope whenever drawer opens or scope changes
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setResolving(true);
      try {
        const b = await getOrCreateActiveBatch({
          projectId, subprojectId, projectName, subprojectName,
        });
        if (alive) setActiveBatch(b);
      } catch (e) {
        toast({ title: 'Could not load batch', description: (e as Error).message, variant: 'destructive' });
      } finally {
        if (alive) setResolving(false);
      }
    })();
    return () => { alive = false; };
  }, [open, projectId, subprojectId, projectName, subprojectName, toast]);

  // Reset when scope changes while open
  useEffect(() => { setActiveBatch(null); }, [projectId, subprojectId]);

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
      // After running, create a fresh draft for further additions
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

  const handleSaveName = async () => {
    if (!batch || !nameDraft.trim()) { setEditingName(false); return; }
    await renameBatch(batch.id, nameDraft.trim());
    setEditingName(false);
    refetch();
  };

  return (
    <>
      {/* Floating toggle pinned to the right viewport edge */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/3 z-40 flex flex-col items-center gap-1 rounded-l-xl border border-r-0 border-violet-500/40 bg-violet-600/20 backdrop-blur-md px-2 py-3 text-violet-200 hover:bg-violet-600/30 transition-colors shadow-lg"
        aria-label="Open batch queue"
      >
        <Layers className="w-4 h-4" />
        <span className="text-[10px] font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180">BATCH</span>
        {items.length > 0 && (
          <Badge className="bg-violet-500 text-white text-[10px] px-1.5 py-0 h-4">{items.length}</Badge>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="p-5 border-b border-border/50">
            <SheetTitle className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" /> Batch Queue
            </SheetTitle>
            <SheetDescription className="text-xs">
              Queue generations here, then submit them all at once. One active draft batch per project + subproject.
            </SheetDescription>
            {batch && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-2">
                  {editingName ? (
                    <>
                      <Input
                        value={nameDraft}
                        onChange={e => setNameDraft(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                        autoFocus
                        className="h-8 text-sm"
                      />
                      <Button size="sm" variant="ghost" className="h-8" onClick={handleSaveName}>Save</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium truncate flex-1">{batch.name}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setNameDraft(batch.name); setEditingName(true); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <Badge className={STATUS_BADGE[batch.status] || ''}>{batch.status}</Badge>
                  <Badge variant="outline">{queuedCount} queued</Badge>
                  {submittedCount > 0 && <Badge variant="outline" className="text-green-400 border-green-500/40">{submittedCount} submitted</Badge>}
                  {failedCount > 0 && <Badge variant="outline" className="text-red-400 border-red-500/40">{failedCount} failed</Badge>}
                </div>
                {(projectName || subprojectName) && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    Scope: {projectName || 'No project'}{subprojectName ? ` › ${subprojectName}` : ''}
                  </p>
                )}
              </div>
            )}
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {resolving && !batch ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Layers className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  No items queued.<br />
                  Use <span className="text-foreground font-medium">Add to Batch</span> from the Create tab.
                </div>
              ) : (
                items.map((it, idx) => (
                  <Card key={it.id} className="p-3 bg-card/60 border-border/40">
                    <div className="flex items-start gap-2">
                      <div className="w-10 h-10 rounded bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                        {it.input_image_url ? (
                          <img src={it.input_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] text-muted-foreground">#{idx + 1}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                            {TASK_LABELS[it.task_type] || it.task_type}
                          </Badge>
                          {it.status === 'submitted' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                          {it.status === 'failed' && <AlertTriangle className="w-3 h-3 text-red-400" />}
                        </div>
                        <p className="text-[11px] line-clamp-2 leading-snug">{it.prompt}</p>
                        {it.error_message && (
                          <p className="text-[10px] text-red-400/80 mt-1 line-clamp-2">{it.error_message}</p>
                        )}
                      </div>
                      {it.status === 'queued' && (
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-400" onClick={() => handleRemove(it.id)}>
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border/50 space-y-2">
            <Button
              onClick={handleRun}
              disabled={running || queuedCount === 0 || !batch}
              className="w-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Submitting...' : `Run Batch (${queuedCount})`}
            </Button>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full gap-1 text-muted-foreground hover:text-red-400" onClick={handleClear}>
                <Trash2 className="w-3 h-3" /> Clear queued items
              </Button>
            )}
            <p className="text-[10px] text-muted-foreground text-center">
              Items that fail to submit stay saved in the batch — successful ones still group together in Library.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
