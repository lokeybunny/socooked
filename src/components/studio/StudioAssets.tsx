import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStudioProjects, useStudioSubprojects } from '@/lib/studio/hooks';
import { Home, Upload, Trash2, Loader2, Folder, Copy, Download, Layers, Sparkles } from 'lucide-react';
import { lightboxProps } from './ImageLightbox';
import { Checkbox } from '@/components/ui/checkbox';

// Read a File as data URL
const fileToDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as string);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/png';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

interface Asset {
  id: string;
  user_id: string;
  project_id: string | null;
  subproject_id: string | null;
  name: string | null;
  image_url: string;
  storage_path: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

interface Props {
  projectId: string | null;
  subprojectId: string | null;
}

export function StudioAssets({ projectId, subprojectId }: Props) {
  const { toast } = useToast();
  const { projects } = useStudioProjects();
  const { subprojects } = useStudioSubprojects(projectId || '');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);

  const [autoEmpty, setAutoEmpty] = useState(false);

  // Upload destination overrides (default to current selections)
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(projectId);
  const [uploadSubprojectId, setUploadSubprojectId] = useState<string | null>(subprojectId);
  useEffect(() => { setUploadProjectId(projectId); }, [projectId]);
  useEffect(() => { setUploadSubprojectId(subprojectId); }, [subprojectId]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('studio_assets').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    if (projectId) q = q.eq('project_id', projectId);
    if (subprojectId) q = q.eq('subproject_id', subprojectId);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      toast({ title: 'Failed to load assets', description: error.message, variant: 'destructive' });
    } else {
      setAssets((data as unknown as Asset[]) || []);
    }
    setLoading(false);
  }, [projectId, subprojectId, toast]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const handleFiles = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/') && f.size <= 25 * 1024 * 1024);
    if (images.length === 0) {
      toast({ title: 'No valid images', description: 'Drop image files up to 25MB each', variant: 'destructive' });
      return;
    }
    if (images.length !== files.length) {
      toast({ title: `Skipped ${files.length - images.length} file(s)`, description: 'Only images ≤25MB are accepted' });
    }

    setUploading(true);
    setProgress({ done: 0, total: images.length });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const baseOrder = assets.length;
      let done = 0;
      for (let i = 0; i < images.length; i++) {
        const original = images[i];
        let file: Blob = original;
        let ext = (original.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
        let contentType = original.type;
        let nameBase = original.name.replace(/\.[^.]+$/, '');

        if (autoEmpty) {
          try {
            const dataUrl = await fileToDataUrl(original);
            const { data: emptied, error: fnErr } = await supabase.functions.invoke('empty-room', { body: { imageDataUrl: dataUrl } });
            if (fnErr) throw fnErr;
            if (emptied?.imageDataUrl) {
              file = dataUrlToBlob(emptied.imageDataUrl);
              contentType = file.type || 'image/png';
              ext = contentType.split('/')[1] || 'png';
              nameBase = `${nameBase}-empty`;
            } else {
              throw new Error('AI did not return an image');
            }
          } catch (e) {
            console.error('empty-room failed', e);
            toast({ title: `Auto-empty failed for "${original.name}"`, description: (e as Error).message + ' — uploading original instead.', variant: 'destructive' });
          }
        }

        const path = `${userId}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('studio-assets').upload(path, file, { contentType, upsert: false });
        if (upErr) { console.error(upErr); continue; }
        const { data: pub } = supabase.storage.from('studio-assets').getPublicUrl(path);
        await supabase.from('studio_assets').insert({
          user_id: userId,
          project_id: uploadProjectId,
          subproject_id: uploadSubprojectId,
          name: nameBase,
          image_url: pub.publicUrl,
          storage_path: path,
          sort_order: baseOrder + i,
        });
        done++;
        setProgress({ done, total: images.length });
      }
      toast({ title: `${done} asset${done === 1 ? '' : 's'} uploaded` });
      fetchAssets();
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setProgress({ done: 0, total: 0 });
    }
  };

  const onPickClick = () => fileInputRef.current?.click();
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) handleFiles(files);
    e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) handleFiles(files);
  };

  const handleDelete = async (a: Asset) => {
    if (!confirm(`Delete "${a.name || 'asset'}"?`)) return;
    try {
      if (a.storage_path) await supabase.storage.from('studio-assets').remove([a.storage_path]);
      const { error } = await supabase.from('studio_assets').delete().eq('id', a.id);
      if (error) throw error;
      setAssets(prev => prev.filter(x => x.id !== a.id));
      toast({ title: 'Deleted' });
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const copyUrl = async (url: string) => { await navigator.clipboard.writeText(url); toast({ title: 'URL copied' }); };

  const downloadAsset = async (a: Asset) => {
    try {
      const res = await fetch(a.image_url, { mode: 'cors' });
      const blob = await res.blob();
      const ext = (a.storage_path?.split('.').pop() || 'jpg').split('?')[0];
      const safe = (a.name || 'asset').replace(/[^\w.-]+/g, '_');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${safe}.${ext}`;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Download failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const projectNameMap = new Map(projects.map(p => [p.id, p.name]));
  const subprojectNameMap = new Map(subprojects.map(s => [s.id, s.name]));

  const scopeLabel = uploadSubprojectId
    ? `${projectNameMap.get(uploadProjectId || '') || 'Project'} › ${subprojectNameMap.get(uploadSubprojectId) || 'Subcategory'}`
    : uploadProjectId
      ? projectNameMap.get(uploadProjectId) || 'Project'
      : 'Unassigned';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Home className="w-5 h-5 text-amber-400" /> Assets
          </h2>
          <p className="text-xs text-muted-foreground">
            Bulk-upload home/location images for a project or subcategory. Used as seed material for Seedance 2 generations.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={uploadProjectId ?? '__none'} onValueChange={(v) => { setUploadProjectId(v === '__none' ? null : v); setUploadSubprojectId(null); }}>
            <SelectTrigger className="w-[180px] bg-card/50 h-9">
              <Folder className="w-3.5 h-3.5 mr-1" /><SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Unassigned</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {uploadProjectId && (
            <Select value={uploadSubprojectId ?? '__none'} onValueChange={(v) => setUploadSubprojectId(v === '__none' ? null : v)}>
              <SelectTrigger className="w-[180px] bg-card/50 h-9">
                <Layers className="w-3.5 h-3.5 mr-1" /><SelectValue placeholder="Subcategory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {subprojects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={onPickClick} disabled={uploading} className="gap-2 bg-amber-600 hover:bg-amber-700">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? `Uploading ${progress.done}/${progress.total}` : 'Bulk Upload'}
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInputChange} />
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Uploading to: <span className="text-foreground">{scopeLabel}</span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`rounded-2xl border border-dashed p-4 min-h-[300px] transition-colors ${dragActive ? 'border-amber-500/60 bg-amber-500/5' : 'border-white/10 bg-card/30'}`}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Home className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No assets yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Drop images here or click "Bulk Upload" — multi-select supported</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {assets.map((a, idx) => (
              <div key={a.id} className="group relative rounded-xl overflow-hidden border border-white/10 bg-zinc-900 aspect-square">
                <img src={a.image_url} alt={a.name || 'asset'} loading="lazy" className="w-full h-full object-cover" {...lightboxProps(a.image_url, a.name || 'asset')} />
                <div className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-sm">
                  #{idx + 1}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => copyUrl(a.image_url)} className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white" aria-label="Copy URL"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => downloadAsset(a)} className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white" aria-label="Download"><Download className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(a)} className="p-1.5 rounded-md bg-black/60 hover:bg-red-600/80 text-white" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="text-white text-xs">
                    <div className="font-medium truncate">{a.name || 'Untitled'}</div>
                    {a.subproject_id && (
                      <div className="flex items-center gap-1 text-[10px] text-white/70 mt-0.5">
                        <Layers className="w-3 h-3" /> {subprojectNameMap.get(a.subproject_id) || 'Subcategory'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
