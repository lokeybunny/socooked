import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Layers, Plus, ChevronDown, Trash2, Loader2, Tag } from 'lucide-react';
import { useStudioSubprojects, createStudioSubproject, deleteStudioSubproject } from '@/lib/studio/hooks';
import { useToast } from '@/hooks/use-toast';

interface Props {
  projectId: string;
  value: string | null;
  onChange: (id: string | null) => void;
}

const COLOR_SWATCHES = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#22d3ee', '#facc15'];

export function SubprojectSelector({ projectId, value, onChange }: Props) {
  const { subprojects, loading } = useStudioSubprojects(projectId);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0]);
  const [busy, setBusy] = useState(false);

  const current = subprojects.find(s => s.id === value);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const s = await createStudioSubproject({
        project_id: projectId,
        name: name.trim(),
        description: desc.trim() || null,
        color,
      });
      onChange(s.id);
      toast({ title: 'Subcategory created', description: s.name });
      setOpen(false);
      setName(''); setDesc(''); setColor(COLOR_SWATCHES[0]);
    } catch (e) {
      toast({ title: 'Create failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, subName: string) => {
    if (!confirm(`Delete subcategory "${subName}"? Videos in it will move back to the parent project.`)) return;
    try {
      await deleteStudioSubproject(id, projectId);
      if (value === id) onChange(null);
      toast({ title: 'Subcategory deleted' });
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 bg-card/50 max-w-[220px]">
            {current ? (
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: current.color || '#a78bfa' }} />
            ) : (
              <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <span className="truncate">{current ? current.name : 'All Subcategories'}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[240px] max-h-[400px] overflow-y-auto">
          <DropdownMenuItem onClick={() => onChange(null)} className="gap-2 cursor-pointer">
            <Layers className="w-4 h-4" /> All Subcategories
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {loading ? (
            <div className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
          ) : subprojects.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No subcategories yet</div>
          ) : (
            subprojects.map(s => (
              <DropdownMenuItem key={s.id} onSelect={(e) => { e.preventDefault(); onChange(s.id); }} className="gap-2 cursor-pointer group">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color || '#a78bfa' }} />
                <div className="flex-1 min-w-0 truncate text-sm">{s.name}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
                  aria-label="Delete subcategory"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }} className="gap-2 cursor-pointer text-violet-400">
            <Plus className="w-4 h-4" /> New Subcategory
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4 text-violet-400" /> New Subcategory</DialogTitle>
            <DialogDescription>Organize this project further (e.g. "Exteriors", "Interiors", "Drone shots", "Episode 1").</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Subcategory Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Exteriors" className="bg-background/50 mt-1" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {COLOR_SWATCHES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950' : 'opacity-70 hover:opacity-100'}`}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Notes..." className="bg-background/50 mt-1 min-h-[60px]" />
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
