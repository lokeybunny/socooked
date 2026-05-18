import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useStudioProjects } from '@/lib/studio/hooks';
import { Image as ImageIcon, Upload, Trash2, Loader2, Globe, Folder, Copy } from 'lucide-react';

interface Ref {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string | null;
  image_url: string;
  storage_path: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  projectId: string | null;
}

export function StudioReferences({ projectId }: Props) {
  const { toast } = useToast();
  const { projects } = useStudioProjects();
  const [refs, setRefs] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'global' | 'project'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload dialog state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(projectId);
  const [refName, setRefName] = useState('');
  const [refNotes, setRefNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchRefs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('studio_references')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      toast({ title: 'Failed to load references', description: error.message, variant: 'destructive' });
    } else {
      setRefs((data as unknown as Ref[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchRefs(); }, [fetchRefs]);

  const handleFilePicked = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Only images allowed', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Max 10MB', variant: 'destructive' });
      return;
    }
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setRefName(file.name.replace(/\.[^.]+$/, ''));
    setScope(projectId ? 'project' : 'global');
    setScopeProjectId(projectId);
  };

  const onPickClick = () => fileInputRef.current?.click();

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFilePicked(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFilePicked(f);
  };

  const cancelUpload = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setRefName('');
    setRefNotes('');
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const ext = pendingFile.name.split('.').pop() || 'png';
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('studio-references')
        .upload(path, pendingFile, { contentType: pendingFile.type, upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('studio-references').getPublicUrl(path);

      const { error: insErr } = await supabase.from('studio_references').insert({
        user_id: userId,
        project_id: scope === 'project' ? scopeProjectId : null,
        name: refName.trim() || null,
        notes: refNotes.trim() || null,
        image_url: pub.publicUrl,
        storage_path: path,
      });
      if (insErr) throw insErr;

      toast({ title: 'Reference saved', description: scope === 'project' ? 'Stored on this project' : 'Stored globally' });
      cancelUpload();
      fetchRefs();
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (ref: Ref) => {
    if (!confirm(`Delete reference "${ref.name || 'untitled'}"?`)) return;
    try {
      if (ref.storage_path) {
        await supabase.storage.from('studio-references').remove([ref.storage_path]);
      }
      const { error } = await supabase.from('studio_references').delete().eq('id', ref.id);
      if (error) throw error;
      setRefs(prev => prev.filter(r => r.id !== ref.id));
      toast({ title: 'Deleted' });
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: 'URL copied' });
  };

  const visible = refs.filter(r => {
    if (filter === 'global') return r.project_id === null;
    if (filter === 'project') return projectId ? r.project_id === projectId : false;
    // 'all' — when a project is selected, show global + that project's refs only
    if (projectId) return r.project_id === null || r.project_id === projectId;
    return true;
  });

  const projectNameMap = new Map(projects.map(p => [p.id, p.name]));

  return (
    <div className="space-y-4">
      {/* Header / actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-violet-400" /> References
          </h2>
          <p className="text-xs text-muted-foreground">
            Upload reference images. Global refs show in every project; project-scoped refs only show for that project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[160px] bg-card/50 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{projectId ? 'Global + This Project' : 'All References'}</SelectItem>
              <SelectItem value="global">Global only</SelectItem>
              <SelectItem value="project" disabled={!projectId}>This project only</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={onPickClick} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Upload className="w-4 h-4" /> Upload Reference
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />
        </div>
      </div>

      {/* Drop zone / grid */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-2xl border border-dashed border-white/10 bg-card/30 p-4 min-h-[300px]"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ImageIcon className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No references yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Drop an image here or click "Upload Reference"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {visible.map(ref => (
              <div key={ref.id} className="group relative rounded-xl overflow-hidden border border-white/10 bg-zinc-900 aspect-square">
                <img src={ref.image_url} alt={ref.name || 'reference'} loading="lazy" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => copyUrl(ref.image_url)}
                      className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white"
                      aria-label="Copy URL"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(ref)}
                      className="p-1.5 rounded-md bg-black/60 hover:bg-red-600/80 text-white"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-white text-xs">
                    <div className="font-medium truncate">{ref.name || 'Untitled'}</div>
                    <div className="flex items-center gap-1 text-[10px] text-white/70 mt-0.5">
                      {ref.project_id ? (
                        <><Folder className="w-3 h-3" /> {projectNameMap.get(ref.project_id) || 'Project'}</>
                      ) : (
                        <><Globe className="w-3 h-3" /> Global</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="absolute top-1.5 left-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full backdrop-blur-sm ${ref.project_id ? 'bg-violet-500/30 text-violet-100' : 'bg-emerald-500/30 text-emerald-100'}`}>
                    {ref.project_id ? 'Project' : 'Global'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload-scope dialog */}
      <Dialog open={!!pendingFile} onOpenChange={(o) => { if (!o) cancelUpload(); }}>
        <DialogContent className="bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle>Save Reference</DialogTitle>
            <DialogDescription>
              Should this reference be available across all projects, or only inside a specific project?
            </DialogDescription>
          </DialogHeader>

          {pendingPreview && (
            <div className="rounded-xl overflow-hidden border border-white/10 bg-zinc-900 max-h-[240px] flex items-center justify-center">
              <img src={pendingPreview} alt="preview" className="max-h-[240px] object-contain" />
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name (optional)</Label>
              <Input value={refName} onChange={e => setRefName(e.target.value)} placeholder="e.g. Hero shot, lighting ref…" className="bg-background/50 mt-1" />
            </div>

            <div>
              <Label className="text-xs">Scope</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setScope('global')}
                  className={`p-3 rounded-lg border text-left transition-colors ${scope === 'global' ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 hover:border-white/20'}`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Globe className="w-4 h-4 text-emerald-400" /> Global
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">Shows in every project</div>
                </button>
                <button
                  type="button"
                  onClick={() => setScope('project')}
                  className={`p-3 rounded-lg border text-left transition-colors ${scope === 'project' ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 hover:border-white/20'}`}
                  disabled={projects.length === 0}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Folder className="w-4 h-4 text-violet-400" /> Project only
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">{projects.length === 0 ? 'Create a project first' : 'Shows only inside that project'}</div>
                </button>
              </div>
            </div>

            {scope === 'project' && (
              <div>
                <Label className="text-xs">Project</Label>
                <Select value={scopeProjectId ?? ''} onValueChange={(v) => setScopeProjectId(v)}>
                  <SelectTrigger className="bg-background/50 mt-1">
                    <SelectValue placeholder="Pick a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={refNotes} onChange={e => setRefNotes(e.target.value)} placeholder="What is this used for?" className="bg-background/50 mt-1 min-h-[60px]" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={cancelUpload} disabled={uploading}>Cancel</Button>
            <Button
              onClick={confirmUpload}
              disabled={uploading || (scope === 'project' && !scopeProjectId)}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Save Reference
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
