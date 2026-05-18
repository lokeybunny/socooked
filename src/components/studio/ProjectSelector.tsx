import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FolderOpen, Plus, ChevronDown, Trash2, Loader2, Folder } from 'lucide-react';
import { useStudioProjects, createStudioProject, deleteStudioProject } from '@/lib/studio/hooks';
import { PROJECT_KINDS } from '@/lib/studio/types';
import { useToast } from '@/hooks/use-toast';

interface Props {
  value: string | null; // null = All projects
  onChange: (id: string | null) => void;
}

export function ProjectSelector({ value, onChange }: Props) {
  const { projects, loading } = useStudioProjects();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('Realty');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const current = projects.find(p => p.id === value);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const p = await createStudioProject({ name: name.trim(), kind, description: desc.trim() || null });
      onChange(p.id);
      toast({ title: 'Project created', description: p.name });
      setOpen(false);
      setName(''); setDesc(''); setKind('Realty');
    } catch (e) {
      toast({ title: 'Create failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? Videos in it will be unassigned.`)) return;
    try {
      await deleteStudioProject(id);
      if (value === id) onChange(null);
      toast({ title: 'Project deleted' });
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 bg-card/50 max-w-[260px]">
            {current ? <Folder className="w-4 h-4 text-violet-400 shrink-0" /> : <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />}
            <span className="truncate">{current ? current.name : 'All Projects'}</span>
            {current?.kind && <span className="text-[10px] text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/40 shrink-0">{current.kind}</span>}
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[280px] max-h-[400px] overflow-y-auto">
          <DropdownMenuItem onClick={() => onChange(null)} className="gap-2 cursor-pointer">
            <FolderOpen className="w-4 h-4" /> All Projects
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {loading ? (
            <div className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No projects yet</div>
          ) : (
            projects.map(p => (
              <DropdownMenuItem key={p.id} onSelect={(e) => { e.preventDefault(); onChange(p.id); }} className="gap-2 cursor-pointer group">
                <Folder className="w-4 h-4 text-violet-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">{p.name}</div>
                  {p.kind && <div className="text-[10px] text-muted-foreground">{p.kind}</div>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
                  aria-label="Delete project"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }} className="gap-2 cursor-pointer text-violet-400">
            <Plus className="w-4 h-4" /> New Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Organize your generations into projects (e.g. a property listing, a TikTok series, an ad campaign).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Project Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 123 Main St Listing" className="bg-background/50 mt-1" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="mt-1 bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Notes about this project..." className="bg-background/50 mt-1 min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={busy} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
