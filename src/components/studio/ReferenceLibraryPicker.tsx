import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Globe, Folder, Check, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { lightboxProps } from './ImageLightbox';

interface Ref {
  id: string;
  project_id: string | null;
  name: string | null;
  image_url: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
  /** Max number of additional URLs the caller can accept */
  maxSelect: number;
  onConfirm: (urls: string[]) => void;
}

export function ReferenceLibraryPicker({ open, onOpenChange, projectId, maxSelect, onConfirm }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [scope, setScope] = useState<'all' | 'global' | 'project'>('all');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('studio_references')
        .select('id, project_id, name, image_url')
        .order('created_at', { ascending: false });
      if (error) {
        toast({ title: 'Failed to load references', description: error.message, variant: 'destructive' });
      } else {
        setRefs((data as Ref[]) || []);
      }
      setLoading(false);
    })();
  }, [open, toast]);

  const visible = refs.filter(r => {
    if (scope === 'global' && r.project_id !== null) return false;
    if (scope === 'project') {
      if (!projectId) return false;
      if (r.project_id !== projectId) return false;
    }
    if (scope === 'all' && projectId && r.project_id !== null && r.project_id !== projectId) return false;
    if (search.trim() && !(r.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggle = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < maxSelect) next.add(id);
      else toast({ title: `Limit reached`, description: `You can add up to ${maxSelect} more.`, variant: 'destructive' });
      return next;
    });
  };

  const confirm = () => {
    const urls = refs.filter(r => picked.has(r.id)).map(r => r.image_url);
    onConfirm(urls);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-white/10 max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[#00ff88]" /> Insert From References Library
          </DialogTitle>
          <DialogDescription>Pick saved CRM references to use as reference images.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…" className="bg-background/50 h-9" />
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="w-[180px] bg-background/50 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{projectId ? 'Global + This Project' : 'All'}</SelectItem>
              <SelectItem value="global">Global only</SelectItem>
              <SelectItem value="project" disabled={!projectId}>This project only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border border-white/10 bg-card/30 p-3 min-h-[280px] max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              No references found. Upload some in the References tab.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {visible.map(r => {
                const isPicked = picked.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    className={`relative rounded-lg overflow-hidden border-2 aspect-square transition-all ${isPicked ? 'border-[#00ff88] ring-2 ring-[#00ff88]/40' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <img src={r.image_url} alt={r.name || 'reference'} loading="lazy" className="w-full h-full object-cover" />
                    {isPicked && (
                      <div className="absolute inset-0 bg-[#00ff88]/20 flex items-center justify-center">
                        <div className="bg-[#00ff88] text-black rounded-full p-1.5">
                          <Check className="w-4 h-4" />
                        </div>
                      </div>
                    )}
                    <div className="absolute top-1 left-1">
                      {r.project_id ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/40 text-violet-100 backdrop-blur-sm flex items-center gap-1"><Folder className="w-2.5 h-2.5" /> Project</span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/40 text-emerald-100 backdrop-blur-sm flex items-center gap-1"><Globe className="w-2.5 h-2.5" /> Global</span>
                      )}
                    </div>
                    {r.name && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 text-[10px] text-white truncate text-left">
                        {r.name}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">{picked.size} selected · max {maxSelect}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={confirm} disabled={picked.size === 0} className="bg-[#00ff88] text-black hover:bg-[#00ff88]/90">
              Insert {picked.size > 0 ? `(${picked.size})` : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
