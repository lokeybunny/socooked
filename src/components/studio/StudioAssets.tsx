import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStudioProjects, useStudioSubprojects } from '@/lib/studio/hooks';
import { Home, Upload, Trash2, Loader2, Folder, Copy, Download, Layers, Sparkles, FileArchive } from 'lucide-react';
import JSZip from 'jszip';
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
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);

  const [autoEmpty, setAutoEmpty] = useState(true);
  const [pairingBackfill, setPairingBackfill] = useState(false);
  const [pairProgress, setPairProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

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
        const origExt = (original.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
        const origContentType = original.type || 'image/jpeg';
        const baseName = original.name.replace(/\.[^.]+$/, '');
        let processedBlob: Blob | null = null;
        let processedExt = 'png';
        let processedContentType = 'image/png';
        let processedName = baseName;

        if (autoEmpty) {
          try {
            const dataUrl = await fileToDataUrl(original);
            const { data: emptied, error: fnErr } = await supabase.functions.invoke('empty-room', { body: { imageDataUrl: dataUrl } });
            if (fnErr) throw fnErr;
            if (emptied?.imageDataUrl) {
              processedBlob = dataUrlToBlob(emptied.imageDataUrl);
              processedContentType = processedBlob.type || 'image/png';
              processedExt = processedContentType.split('/')[1] || 'png';
              const roomType = (emptied?.roomType as string | undefined)?.trim();
              if (roomType) {
                const pretty = roomType.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                const existingSameRoom = [...assets, ...Array(i).fill(null)].filter((x: any) => x?.name?.startsWith(pretty)).length;
                processedName = existingSameRoom > 0 ? `${pretty} ${existingSameRoom + 1}` : pretty;
              } else {
                processedName = `${baseName}-empty`;
              }
            } else {
              throw new Error('AI did not return an image');
            }
          } catch (e) {
            console.error('empty-room failed', e);
            toast({ title: `Auto-empty failed for "${original.name}"`, description: (e as Error).message + ' — uploading original instead.', variant: 'destructive' });
          }
        }

        const pairId = processedBlob ? crypto.randomUUID() : null;
        const variants: Array<{ blob: Blob; ext: string; contentType: string; name: string; variant: 'original' | 'processed' | null; order: number }> = [];

        if (processedBlob) {
          // Save original first (before), then processed (after) — adjacent sort_order
          variants.push({ blob: original, ext: origExt, contentType: origContentType, name: `${baseName} (original)`, variant: 'original', order: baseOrder + i * 2 });
          variants.push({ blob: processedBlob, ext: processedExt, contentType: processedContentType, name: processedName, variant: 'processed', order: baseOrder + i * 2 + 1 });
        } else {
          variants.push({ blob: original, ext: origExt, contentType: origContentType, name: baseName, variant: null, order: baseOrder + i });
        }

        for (const v of variants) {
          const path = `${userId}/${Date.now()}-${i}-${v.variant ?? 'single'}-${Math.random().toString(36).slice(2, 8)}.${v.ext}`;
          const { error: upErr } = await supabase.storage.from('studio-assets').upload(path, v.blob, { contentType: v.contentType, upsert: false });
          if (upErr) { console.error(upErr); continue; }
          const { data: pub } = supabase.storage.from('studio-assets').getPublicUrl(path);
          await supabase.from('studio_assets').insert({
            user_id: userId,
            project_id: uploadProjectId,
            subproject_id: uploadSubprojectId,
            name: v.name,
            image_url: pub.publicUrl,
            storage_path: path,
            sort_order: v.order,
            pair_id: pairId,
            variant: v.variant,
          } as any);
        }
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

  const handleMassDelete = async () => {
    if (assets.length === 0) return;
    const scope = subprojectId
      ? `${projectNameMap.get(projectId || '') || 'Project'} › ${subprojectNameMap.get(subprojectId) || 'Subcategory'}`
      : projectId
        ? projectNameMap.get(projectId) || 'this project'
        : 'Unassigned';
    if (!confirm(`Delete ALL ${assets.length} asset(s) in "${scope}"?\n\nThis cannot be undone.`)) return;
    const second = prompt(`Type DELETE to confirm wiping ${assets.length} asset(s):`);
    if (second !== 'DELETE') { toast({ title: 'Cancelled' }); return; }

    setLoading(true);
    try {
      const paths = assets.map(a => a.storage_path).filter(Boolean) as string[];
      if (paths.length) {
        for (let i = 0; i < paths.length; i += 100) {
          await supabase.storage.from('studio-assets').remove(paths.slice(i, i + 100));
        }
      }
      const ids = assets.map(a => a.id);
      const { error } = await supabase.from('studio_assets').delete().in('id', ids);
      if (error) throw error;
      setAssets([]);
      toast({ title: `Deleted ${ids.length} asset${ids.length === 1 ? '' : 's'}` });
    } catch (e) {
      toast({ title: 'Mass delete failed', description: (e as Error).message, variant: 'destructive' });
      fetchAssets();
    } finally {
      setLoading(false);
    }
  };

  const handleBackfillPairs = async () => {
    const unpaired = assets.filter(a => !(a as any).pair_id && !(a as any).variant);
    if (unpaired.length === 0) {
      toast({ title: 'Nothing to pair', description: 'All assets are already part of an A/B pair.' });
      return;
    }
    if (!confirm(`Generate processed (B) versions for ${unpaired.length} unpaired asset${unpaired.length === 1 ? '' : 's'}? This may take a minute and use AI credits.`)) return;
    setPairingBackfill(true);
    setPairProgress({ done: 0, total: unpaired.length });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not authenticated');
      let done = 0;
      for (const a of unpaired) {
        try {
          const res = await fetch(a.image_url, { mode: 'cors' });
          const blob = await res.blob();
          const dataUrl = await fileToDataUrl(blob);
          const { data: emptied, error: fnErr } = await supabase.functions.invoke('empty-room', { body: { imageDataUrl: dataUrl } });
          if (fnErr) throw fnErr;
          if (!emptied?.imageDataUrl) throw new Error('AI did not return an image');
          const processedBlob = dataUrlToBlob(emptied.imageDataUrl);
          const processedContentType = processedBlob.type || 'image/png';
          const processedExt = processedContentType.split('/')[1] || 'png';
          const roomType = (emptied?.roomType as string | undefined)?.trim();
          const baseName = a.name || 'asset';
          const processedName = roomType
            ? roomType.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            : `${baseName}-empty`;

          const pairId = crypto.randomUUID();
          const path = `${userId}/${Date.now()}-pair-${Math.random().toString(36).slice(2, 8)}.${processedExt}`;
          const { error: upErr } = await supabase.storage.from('studio-assets').upload(path, processedBlob, { contentType: processedContentType, upsert: false });
          if (upErr) throw upErr;
          const { data: pub } = supabase.storage.from('studio-assets').getPublicUrl(path);

          // Mark original as 'original' with pair_id, then insert processed at sort_order+0.5 (we'll use original.sort_order * 2 + 1 instead)
          await supabase.from('studio_assets').update({ pair_id: pairId, variant: 'original' } as any).eq('id', a.id);
          await supabase.from('studio_assets').insert({
            user_id: userId,
            project_id: a.project_id,
            subproject_id: a.subproject_id,
            name: processedName,
            image_url: pub.publicUrl,
            storage_path: path,
            sort_order: a.sort_order, // same sort_order; secondary order by created_at keeps processed AFTER original
            pair_id: pairId,
            variant: 'processed',
          } as any);
        } catch (e) {
          console.error('pair backfill failed for', a.id, e);
        }
        done++;
        setPairProgress({ done, total: unpaired.length });
      }
      toast({ title: `Paired ${done} asset${done === 1 ? '' : 's'}` });
      fetchAssets();
    } catch (e) {
      toast({ title: 'Pair backfill failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setPairingBackfill(false);
      setPairProgress({ done: 0, total: 0 });
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
          <label className={`flex items-center gap-2 h-9 px-3 rounded-md border cursor-pointer text-xs select-none ${autoEmpty ? 'border-amber-500/60 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-card/50 text-muted-foreground hover:text-foreground'}`}>
            <Checkbox checked={autoEmpty} onCheckedChange={(v) => setAutoEmpty(!!v)} />
            <Sparkles className="w-3.5 h-3.5" />
            Auto-empty rooms (remove furniture & decor)
          </label>
          <Button onClick={onPickClick} disabled={uploading} className="gap-2 bg-amber-600 hover:bg-amber-700">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? `${autoEmpty ? 'Emptying ' : 'Uploading '}${progress.done}/${progress.total}` : 'Bulk Upload'}
          </Button>
          <Button
            onClick={handleBackfillPairs}
            disabled={uploading || pairingBackfill || loading || assets.length === 0}
            variant="outline"
            className="gap-2 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/20 hover:text-emerald-200"
          >
            {pairingBackfill ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {pairingBackfill ? `Pairing ${pairProgress.done}/${pairProgress.total}` : 'Generate A/B Pairs'}
          </Button>
          <Button
            onClick={handleMassDelete}
            disabled={uploading || loading || assets.length === 0}
            variant="outline"
            className="gap-2 border-red-500/40 text-red-300 hover:bg-red-600/20 hover:text-red-200"
          >
            <Trash2 className="w-4 h-4" />
            Delete All ({assets.length})
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
              <div key={a.id} className="group relative rounded-xl overflow-hidden border border-white/10 bg-zinc-900 aspect-square cursor-zoom-in" {...lightboxProps(a.image_url, a.name || 'asset')}>
                <img src={a.image_url} alt={a.name || 'asset'} loading="lazy" className="w-full h-full object-cover pointer-events-none" />
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
