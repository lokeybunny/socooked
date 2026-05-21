import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useStudioProjects, useStudioSubprojects } from '@/lib/studio/hooks';
import { Clapperboard, Upload, Trash2, Loader2, Globe, Folder, Copy, Download, Pencil } from 'lucide-react';
import { lightboxProps } from './ImageLightbox';

interface SB {
  id: string;
  user_id: string;
  project_id: string | null;
  subproject_id: string | null;
  name: string | null;
  image_url: string;
  storage_path: string | null;
  notes: string | null;
  first_frame_url: string | null;
  first_frame_path: string | null;
  created_at: string;
}

interface Props {
  projectId: string | null;
  subprojectId: string | null;
}

export function StudioStoryboards({ projectId, subprojectId }: Props) {
  const { toast } = useToast();
  const { projects } = useStudioProjects();
  const { subprojects } = useStudioSubprojects(projectId);
  const [rows, setRows] = useState<SB[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'global' | 'project' | 'subproject'>(
    subprojectId ? 'subproject' : projectId ? 'project' : 'all'
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [scope, setScope] = useState<'global' | 'project' | 'subproject'>('global');
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(projectId);
  const [scopeSubprojectId, setScopeSubprojectId] = useState<string | null>(subprojectId);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  // Edit dialog
  const [editing, setEditing] = useState<SB | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editFirstFrameUrl, setEditFirstFrameUrl] = useState<string | null>(null);
  const [editFirstFramePath, setEditFirstFramePath] = useState<string | null>(null);
  const [uploadingFF, setUploadingFF] = useState(false);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);

  const openEdit = (r: SB) => {
    setEditing(r);
    setEditName(r.name || '');
    setEditNotes(r.notes || '');
    setEditFirstFrameUrl(r.first_frame_url || null);
    setEditFirstFramePath(r.first_frame_path || null);
  };

  const uploadFirstFrame = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Images only', variant: 'destructive' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'Max 20MB', variant: 'destructive' });
      return;
    }
    setUploadingFF(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not authenticated');
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/first-frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('studio-storyboards')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      // remove old first frame from storage if present
      if (editFirstFramePath) {
        await supabase.storage.from('studio-storyboards').remove([editFirstFramePath]).catch(() => {});
      }
      const { data: pub } = supabase.storage.from('studio-storyboards').getPublicUrl(path);
      setEditFirstFrameUrl(pub.publicUrl);
      setEditFirstFramePath(path);
      toast({ title: 'First frame uploaded' });
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setUploadingFF(false);
    }
  };

  const removeFirstFrame = async () => {
    if (editFirstFramePath) {
      await supabase.storage.from('studio-storyboards').remove([editFirstFramePath]).catch(() => {});
    }
    setEditFirstFrameUrl(null);
    setEditFirstFramePath(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('studio_storyboards' as any)
        .update({
          name: editName.trim() || null,
          notes: editNotes.trim() || null,
          first_frame_url: editFirstFrameUrl,
          first_frame_path: editFirstFramePath,
        })
        .eq('id', editing.id);
      if (error) throw error;
      setRows(prev => prev.map(x => x.id === editing.id ? {
        ...x,
        name: editName.trim() || null,
        notes: editNotes.trim() || null,
        first_frame_url: editFirstFrameUrl,
        first_frame_path: editFirstFramePath,
      } : x));
      toast({ title: 'Storyboard updated' });
      setEditing(null);
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('studio_storyboards' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Failed to load storyboards', description: error.message, variant: 'destructive' });
    else setRows(((data as unknown) as SB[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleFiles = (files: File[]) => {
    const valid = files.filter(f => {
      if (!f.type.startsWith('image/')) { toast({ title: `Skipped ${f.name}`, description: 'Images only', variant: 'destructive' }); return false; }
      if (f.size > 10 * 1024 * 1024) { toast({ title: `Skipped ${f.name}`, description: 'Max 10MB', variant: 'destructive' }); return false; }
      return true;
    });
    if (!valid.length) return;
    setPendingFiles(valid);
    setPendingPreviews(valid.map(f => URL.createObjectURL(f)));
    setName(valid.length === 1 ? valid[0].name.replace(/\.[^.]+$/, '') : '');
    setScope(subprojectId ? 'subproject' : projectId ? 'project' : 'global');
    setScopeProjectId(projectId);
    setScopeSubprojectId(subprojectId);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files || []));
  };

  const cancel = () => {
    pendingPreviews.forEach(u => URL.revokeObjectURL(u));
    setPendingFiles([]); setPendingPreviews([]); setName(''); setNotes('');
  };

  const confirmUpload = async () => {
    if (!pendingFiles.length) return;
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        const ext = file.name.split('.').pop() || 'png';
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('studio-storyboards')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('studio-storyboards').getPublicUrl(path);
        const finalName = pendingFiles.length > 1
          ? `${name.trim() || 'Frame'} ${i + 1}`
          : (name.trim() || file.name.replace(/\.[^.]+$/, ''));
        const { error: insErr } = await supabase.from('studio_storyboards' as any).insert({
          user_id: userId,
          project_id: scope === 'global' ? null : scopeProjectId,
          subproject_id: scope === 'subproject' ? scopeSubprojectId : null,
          name: finalName,
          notes: notes.trim() || null,
          image_url: pub.publicUrl,
          storage_path: path,
          sort_order: i,
        });
        if (insErr) throw insErr;
      }
      toast({ title: `Saved ${pendingFiles.length} storyboard frame${pendingFiles.length === 1 ? '' : 's'}` });
      cancel();
      fetchRows();
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (r: SB) => {
    if (!confirm(`Delete storyboard "${r.name || 'untitled'}"?`)) return;
    try {
      if (r.storage_path) await supabase.storage.from('studio-storyboards').remove([r.storage_path]);
      const { error } = await supabase.from('studio_storyboards' as any).delete().eq('id', r.id);
      if (error) throw error;
      setRows(prev => prev.filter(x => x.id !== r.id));
      toast({ title: 'Deleted' });
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const copyUrl = async (url: string) => { await navigator.clipboard.writeText(url); toast({ title: 'URL copied' }); };

  const downloadOne = async (r: SB) => {
    try {
      const res = await fetch(r.image_url, { mode: 'cors' });
      const blob = await res.blob();
      const ext = (r.storage_path?.split('.').pop() || 'png').split('?')[0];
      const safe = (r.name || 'storyboard').replace(/[^\w.-]+/g, '_');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${safe}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Download failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const visible = rows.filter(r => {
    if (filter === 'global') return r.project_id === null;
    if (filter === 'project') return projectId ? r.project_id === projectId : false;
    if (filter === 'subproject') return subprojectId ? r.subproject_id === subprojectId : false;
    if (projectId) return r.project_id === null || r.project_id === projectId;
    return true;
  });

  const projectNameMap = new Map(projects.map(p => [p.id, p.name]));
  const subNameMap = new Map(subprojects.map(s => [s.id, s.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-[#00ff88]" /> Storyboards
          </h2>
          <p className="text-xs text-muted-foreground">
            Upload your own storyboard frames. Insert them into Seedance 2 (fast or regular) just like assets and references.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[180px] bg-card/50 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{projectId ? 'Global + This Project' : 'All Storyboards'}</SelectItem>
              <SelectItem value="global">Global only</SelectItem>
              <SelectItem value="project" disabled={!projectId}>This project only</SelectItem>
              <SelectItem value="subproject" disabled={!subprojectId}>This subproject only</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => fileInputRef.current?.click()} className="gap-2 bg-[#00ff88] text-black hover:bg-[#00ff88]/90">
            <Upload className="w-4 h-4" /> Upload Storyboard
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInputChange} />
        </div>
      </div>

      <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
        className="rounded-2xl border border-dashed border-white/10 bg-card/30 p-4 min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clapperboard className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No storyboards yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Drop frames here or click "Upload Storyboard". Select multiple to upload as a sequence.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {visible.map(r => (
              <div key={r.id}
                onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); import('./ImageLightbox').then(m => m.openImageLightbox(r.image_url, r.name || 'storyboard')); }}
                title="Double-click to view fullscreen"
                className="group relative rounded-xl overflow-hidden border border-white/10 bg-zinc-900 aspect-square cursor-zoom-in">
                <img src={r.image_url} alt={r.name || 'storyboard'} loading="lazy" draggable={false} className="w-full h-full object-cover pointer-events-none select-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-md bg-black/60 hover:bg-[#00ff88]/80 hover:text-black text-white" title="Edit name & prompt notes"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => copyUrl(r.image_url)} className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white" title="Copy URL"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => downloadOne(r)} className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white" title="Download"><Download className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(r)} className="p-1.5 rounded-md bg-black/60 hover:bg-red-600/80 text-white" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="text-white text-xs">
                    <div className="font-medium truncate">{r.name || 'Untitled'}</div>
                    {r.notes && (
                      <div className="text-[10px] text-white/70 mt-0.5 line-clamp-2" title={r.notes}>{r.notes}</div>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-white/70 mt-0.5">
                      {r.subproject_id ? <><Folder className="w-3 h-3" /> {subNameMap.get(r.subproject_id) || 'Subproject'}</>
                        : r.project_id ? <><Folder className="w-3 h-3" /> {projectNameMap.get(r.project_id) || 'Project'}</>
                        : <><Globe className="w-3 h-3" /> Global</>}
                    </div>
                  </div>
                  <div className="text-white text-xs">
                    <div className="font-medium truncate">{r.name || 'Untitled'}</div>
                    <div className="flex items-center gap-1 text-[10px] text-white/70 mt-0.5">
                      {r.subproject_id ? <><Folder className="w-3 h-3" /> {subNameMap.get(r.subproject_id) || 'Subproject'}</>
                        : r.project_id ? <><Folder className="w-3 h-3" /> {projectNameMap.get(r.project_id) || 'Project'}</>
                        : <><Globe className="w-3 h-3" /> Global</>}
                    </div>
                  </div>
                </div>
                <div className="absolute top-1.5 left-1.5 flex gap-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full backdrop-blur-sm ${r.subproject_id ? 'bg-violet-500/30 text-violet-100' : r.project_id ? 'bg-violet-500/30 text-violet-100' : 'bg-emerald-500/30 text-emerald-100'}`}>
                    {r.subproject_id ? 'Sub' : r.project_id ? 'Project' : 'Global'}
                  </span>
                  {r.first_frame_url && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#00ff88]/30 text-[#00ff88] backdrop-blur-sm" title="Has first-frame image for Seedance Frame A">FF</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={pendingFiles.length > 0} onOpenChange={(o) => { if (!o) cancel(); }}>
        <DialogContent className="bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle>Save Storyboard {pendingFiles.length > 1 ? `(${pendingFiles.length} frames)` : ''}</DialogTitle>
            <DialogDescription>Choose where to store these frames. Subproject storyboards stay scoped to that subproject.</DialogDescription>
          </DialogHeader>

          {pendingPreviews.length > 0 && (
            <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
              {pendingPreviews.map((u, i) => (
                <img key={i} src={u} alt={`frame ${i+1}`} className="rounded-md w-full h-20 object-cover border border-white/10" />
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name {pendingFiles.length > 1 ? '(prefix)' : '(optional)'}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Opening sequence" className="bg-background/50 mt-1" />
            </div>

            <div>
              <Label className="text-xs">Scope</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <button type="button" onClick={() => setScope('global')}
                  className={`p-3 rounded-lg border text-left ${scope === 'global' ? 'border-[#00ff88] bg-[#00ff88]/10' : 'border-white/10 hover:border-white/20'}`}>
                  <div className="flex items-center gap-2 text-sm font-medium"><Globe className="w-4 h-4 text-emerald-400" /> Global</div>
                  <div className="text-[11px] text-muted-foreground mt-1">All projects</div>
                </button>
                <button type="button" onClick={() => setScope('project')} disabled={projects.length === 0}
                  className={`p-3 rounded-lg border text-left ${scope === 'project' ? 'border-[#00ff88] bg-[#00ff88]/10' : 'border-white/10 hover:border-white/20'}`}>
                  <div className="flex items-center gap-2 text-sm font-medium"><Folder className="w-4 h-4 text-violet-400" /> Project</div>
                  <div className="text-[11px] text-muted-foreground mt-1">One project</div>
                </button>
                <button type="button" onClick={() => setScope('subproject')} disabled={!scopeProjectId}
                  className={`p-3 rounded-lg border text-left ${scope === 'subproject' ? 'border-[#00ff88] bg-[#00ff88]/10' : 'border-white/10 hover:border-white/20'}`}>
                  <div className="flex items-center gap-2 text-sm font-medium"><Folder className="w-4 h-4 text-fuchsia-400" /> Subproject</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{scopeProjectId ? 'Inside chosen project' : 'Pick a project first'}</div>
                </button>
              </div>
            </div>

            {(scope === 'project' || scope === 'subproject') && (
              <div>
                <Label className="text-xs">Project</Label>
                <Select value={scopeProjectId ?? ''} onValueChange={(v) => { setScopeProjectId(v); setScopeSubprojectId(null); }}>
                  <SelectTrigger className="bg-background/50 mt-1"><SelectValue placeholder="Pick a project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scope === 'subproject' && scopeProjectId && (
              <div>
                <Label className="text-xs">Subproject</Label>
                <Select value={scopeSubprojectId ?? ''} onValueChange={setScopeSubprojectId}>
                  <SelectTrigger className="bg-background/50 mt-1"><SelectValue placeholder="Pick a subproject" /></SelectTrigger>
                  <SelectContent>
                    {subprojects.filter(s => s.project_id === scopeProjectId).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Scene description, beats, timing…" className="bg-background/50 mt-1 min-h-[60px]" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={cancel} disabled={uploading}>Cancel</Button>
            <Button onClick={confirmUpload}
              disabled={uploading || ((scope === 'project' || scope === 'subproject') && !scopeProjectId) || (scope === 'subproject' && !scopeSubprojectId)}
              className="gap-2 bg-[#00ff88] text-black hover:bg-[#00ff88]/90">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle>Edit Storyboard</DialogTitle>
            <DialogDescription>
              Rename the frame and add prompt notes. Notes are treated as prompt context for this storyboard when inserted into a generation.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="rounded-xl overflow-hidden border border-white/10 bg-zinc-900 max-h-[240px] flex items-center justify-center">
              <img src={editing.image_url} alt={editing.name || 'storyboard'} className="max-h-[240px] object-contain" />
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Frame name" className="bg-background/50 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Prompt Notes</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Describe what should happen in this shot — camera move, action, mood, dialogue cues. This text is appended to the prompt when this storyboard is inserted into a Seedance generation."
                className="bg-background/50 mt-1 min-h-[140px]"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Tip: anything you write here will be auto-attached to the prompt as a scene note when you insert this storyboard into Create.
              </p>
            </div>

            <div>
              <Label className="text-xs">First Frame (for Seedance Frame A)</Label>
              <p className="text-[10px] text-muted-foreground mb-2">Optional JPEG/PNG. When this storyboard is inserted in Create, you can load this image into Frame A of Seedance 2.</p>
              {editFirstFrameUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-white/10 bg-zinc-900">
                  <img src={editFirstFrameUrl} alt="first frame" className="w-full max-h-[200px] object-contain" />
                  <div className="absolute top-2 right-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => firstFrameInputRef.current?.click()} disabled={uploadingFF}>
                      {uploadingFF ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Replace'}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={removeFirstFrame} disabled={uploadingFF}>Remove</Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => firstFrameInputRef.current?.click()}
                  disabled={uploadingFF}
                  className="w-full border-2 border-dashed border-white/10 hover:border-[#00ff88]/40 rounded-xl p-6 flex flex-col items-center justify-center transition-colors"
                >
                  {uploadingFF ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-6 h-6 text-muted-foreground/50 mb-1" />}
                  <p className="text-xs text-muted-foreground mt-1">Click to upload first frame</p>
                  <p className="text-[10px] text-muted-foreground/60">JPG / PNG / WebP · 20MB</p>
                </button>
              )}
              <input
                ref={firstFrameInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFirstFrame(f); e.target.value = ''; }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="gap-2 bg-[#00ff88] text-black hover:bg-[#00ff88]/90">
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
