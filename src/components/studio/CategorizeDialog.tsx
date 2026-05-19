import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FolderOpen } from 'lucide-react';
import { useStudioProjects, useStudioSubprojects } from '@/lib/studio/hooks';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { GenerationJob } from '@/lib/studio/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: GenerationJob;
}

const NONE = '__none__';

export function CategorizeDialog({ open, onOpenChange, job }: Props) {
  const { projects, loading: pLoading } = useStudioProjects();
  const [projectId, setProjectId] = useState<string | null>(job.project_id ?? null);
  const [subprojectId, setSubprojectId] = useState<string | null>(job.subproject_id ?? null);
  const { subprojects, loading: sLoading } = useStudioSubprojects(projectId);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setProjectId(job.project_id ?? null);
      setSubprojectId(job.subproject_id ?? null);
    }
  }, [open, job.project_id, job.subproject_id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('generation_jobs')
        .update({ project_id: projectId, subproject_id: subprojectId })
        .eq('id', job.id);
      if (error) throw error;
      toast({ title: 'Categorized', description: 'Video moved successfully.' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderOpen className="w-4 h-4 text-violet-400" /> Categorize Video</DialogTitle>
          <DialogDescription>Push this generation into a project and optional subcategory.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Project</Label>
            <Select
              value={projectId ?? NONE}
              onValueChange={(v) => { const next = v === NONE ? null : v; setProjectId(next); setSubprojectId(null); }}
            >
              <SelectTrigger className="mt-1 bg-background/50">
                <SelectValue placeholder={pLoading ? 'Loading…' : 'Unassigned'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.kind ? ` — ${p.kind}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {projectId && (
            <div>
              <Label className="text-xs">Subcategory (optional)</Label>
              <Select
                value={subprojectId ?? NONE}
                onValueChange={(v) => setSubprojectId(v === NONE ? null : v)}
              >
                <SelectTrigger className="mt-1 bg-background/50">
                  <SelectValue placeholder={sLoading ? 'Loading…' : 'None'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {subprojects.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-violet-600 hover:bg-violet-700">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
