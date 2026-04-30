import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Upload, Loader2, Sparkles, Download, Trash2, Plus, RefreshCw,
  FolderOpen, ArrowLeft, Image as ImageIcon, FileArchive, Pencil,
} from 'lucide-react';
import JSZip from 'jszip';

const PRESET_CATEGORIES = [
  'Kitchen','Living Room','Bedroom','Bathroom','Garage','Front Exterior',
  'Backyard','Aerial Drone','Dining Room','Laundry Room','Hallway','Office',
  'Pool','Patio','ADU / Casita','Closet','Stairs','Entryway','Other',
];

interface Batch { id: string; batch_name: string; created_at: string; }
interface ListingImage {
  id: string; batch_id: string; file_url: string; storage_path: string | null;
  original_filename: string | null; detected_category: string | null;
  confidence: number | null; ai_description: string | null;
  manual_category: string | null; final_category: string | null;
}

export default function Zillow() {
  const [userId, setUserId] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('listing_image_batches').select('*').order('created_at', { ascending: false });
    setBatches((data as Batch[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (userId) loadBatches(); }, [userId, loadBatches]);

  const createBatch = async () => {
    if (!userId) return toast.error('Please sign in');
    const defaultName = `Batch ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const input = window.prompt('Label this batch (e.g. "123 Main St — Henderson"):', defaultName);
    if (input === null) return;
    const name = input.trim() || defaultName;
    const { data, error } = await (supabase as any)
      .from('listing_image_batches')
      .insert({ user_id: userId, batch_name: name })
      .select().single();
    if (error) return toast.error(error.message);
    setSelected(data.id);
    loadBatches();
  };

  const renameBatchInList = async (id: string, currentName: string) => {
    const input = window.prompt('Rename batch:', currentName);
    if (input === null) return;
    const name = input.trim();
    if (!name || name === currentName) return;
    const { error } = await (supabase as any)
      .from('listing_image_batches').update({ batch_name: name }).eq('id', id);
    if (error) return toast.error(error.message);
    setBatches(b => b.map(x => x.id === id ? { ...x, batch_name: name } : x));
    toast.success('Renamed');
  };

  const deleteBatch = async (id: string) => {
    if (!confirm('Delete this batch and all images?')) return;
    await (supabase as any).from('listing_image_batches').delete().eq('id', id);
    setBatches(b => b.filter(x => x.id !== id));
    toast.success('Deleted');
  };

  if (!userId) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">Please sign in to use Listing Image Sorter.</div>
      </AppLayout>
    );
  }

  if (selected) {
    return <AppLayout><BatchView batchId={selected} userId={userId} onBack={() => { setSelected(null); loadBatches(); }} /></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-primary" /> Listing Image Sorter
            </h1>
            <p className="text-sm text-muted-foreground">
              Drag-and-drop listing photos → AI auto-categorizes → download organized ZIP folders.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadBatches} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button onClick={createBatch} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Batch
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : batches.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="mb-4">No batches yet. Create one to start uploading.</p>
            <Button onClick={createBatch} className="gap-1.5"><Plus className="h-4 w-4" /> New Batch</Button>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {batches.map(b => (
              <Card key={b.id} className="cursor-pointer hover:border-primary/40 transition-colors group" onClick={() => setSelected(b.id)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{b.batch_name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString()}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteBatch(b.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-1.5 rounded hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function BatchView({ batchId, userId, onBack }: { batchId: string; userId: string; onBack: () => void }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');
  const [zipping, setZipping] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allCategories = useMemo(() => Array.from(new Set([...PRESET_CATEGORIES, ...customCats])), [customCats]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: imgs }, { data: cats }] = await Promise.all([
      (supabase as any).from('listing_image_batches').select('*').eq('id', batchId).single(),
      (supabase as any).from('listing_images').select('*').eq('batch_id', batchId).order('created_at'),
      (supabase as any).from('custom_categories').select('category_name').eq('user_id', userId),
    ]);
    setBatch(b as Batch);
    setImages((imgs as ListingImage[]) || []);
    setCustomCats((cats || []).map((c: any) => c.category_name));
    setLoading(false);
  }, [batchId, userId]);

  useEffect(() => { load(); }, [load]);

  const renameBatch = async (name: string) => {
    await (supabase as any).from('listing_image_batches').update({ batch_name: name }).eq('id', batchId);
    setBatch(b => b ? { ...b, batch_name: name } : b);
  };

  const handleFiles = async (files: File[]) => {
    const valid = files.filter(f => f.type.startsWith('image/'));
    if (valid.length === 0) return toast.error('No image files');
    setUploading(true);
    let ok = 0;
    for (const file of valid) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${userId}/${batchId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from('listing-images').upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('listing-images').getPublicUrl(path);
        const { error: insErr } = await (supabase as any).from('listing_images').insert({
          batch_id: batchId, user_id: userId, file_url: pub.publicUrl,
          storage_path: path, original_filename: file.name,
        });
        if (insErr) throw insErr;
        ok++;
      } catch (e: any) {
        console.error(e);
      }
    }
    setUploading(false);
    toast.success(`Uploaded ${ok} of ${valid.length}`);
    load();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragRef.current?.classList.remove('border-primary', 'bg-primary/5');
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const classifyOne = async (img: ListingImage): Promise<Partial<ListingImage>> => {
    const { data, error } = await supabase.functions.invoke('classify-listing-image', {
      body: { image_url: img.file_url, custom_categories: customCats },
    });
    if (error || (data as any)?.error) {
      return { detected_category: 'Other', confidence: 0.2, ai_description: '', final_category: img.manual_category || 'Other' };
    }
    const d = data as any;
    return {
      detected_category: d.category, confidence: d.confidence,
      ai_description: d.description, final_category: img.manual_category || d.category,
    };
  };

  const autoSort = async (subset?: ListingImage[]) => {
    const targets = subset || images.filter(i => !i.detected_category);
    if (targets.length === 0) return toast.info('Nothing to analyze');
    setAnalyzing(true);
    setProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const img = targets[i];
      const update = await classifyOne(img);
      await (supabase as any).from('listing_images').update(update).eq('id', img.id);
      setImages(prev => prev.map(p => p.id === img.id ? { ...p, ...update } as ListingImage : p));
      setProgress({ done: i + 1, total: targets.length });
      await new Promise(r => setTimeout(r, 300));
    }
    setAnalyzing(false);
    toast.success('Auto-sort complete');
  };

  const updateCategory = async (id: string, cat: string) => {
    const update = { manual_category: cat, final_category: cat };
    await (supabase as any).from('listing_images').update(update).eq('id', id);
    setImages(prev => prev.map(p => p.id === id ? { ...p, ...update } as ListingImage : p));
  };

  const deleteImage = async (img: ListingImage) => {
    if (img.storage_path) await supabase.storage.from('listing-images').remove([img.storage_path]);
    await (supabase as any).from('listing_images').delete().eq('id', img.id);
    setImages(prev => prev.filter(p => p.id !== img.id));
  };

  const addCustomCat = async () => {
    const v = newCat.trim();
    if (!v) return;
    const { error } = await (supabase as any).from('custom_categories').insert({ user_id: userId, category_name: v });
    if (error) return toast.error(error.message);
    setCustomCats(c => [...c, v]);
    setNewCat('');
  };

  const finalCatOf = (i: ListingImage) => i.final_category || i.manual_category || i.detected_category || 'Other';

  const grouped = useMemo(() => {
    const g: Record<string, ListingImage[]> = {};
    for (const i of images) {
      const k = finalCatOf(i);
      (g[k] ||= []).push(i);
    }
    return g;
  }, [images]);

  const downloadZip = async (categoryFilter?: string) => {
    const targets = categoryFilter ? images.filter(i => finalCatOf(i) === categoryFilter) : images;
    if (targets.length === 0) return toast.error('No images to zip');
    setZipping(true);
    try {
      const zip = new JSZip();
      let i = 0;
      for (const img of targets) {
        i++;
        try {
          const res = await fetch(img.file_url);
          const blob = await res.blob();
          const folder = (categoryFilter || finalCatOf(img)).replace(/[\\/]/g, '-');
          const ext = (img.original_filename?.split('.').pop() || 'jpg').toLowerCase();
          const base = (img.original_filename?.replace(/\.[^.]+$/, '') || `image-${String(i).padStart(3, '0')}`)
            .replace(/[^a-zA-Z0-9._-]/g, '_');
          zip.file(`${folder}/${base}.${ext}`, blob);
        } catch (e) { console.error('zip add failed', e); }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(batch?.batch_name || 'listing').replace(/[^a-zA-Z0-9._-]/g, '_')}${categoryFilter ? '-' + categoryFilter.replace(/[^a-zA-Z0-9]/g, '_') : ''}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('ZIP downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'ZIP failed');
    } finally {
      setZipping(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!batch) return <div className="p-6">Batch not found.</div>;

  const unanalyzed = images.filter(i => !i.detected_category).length;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> All batches
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <Input
            value={batch.batch_name}
            onChange={e => setBatch(b => b ? { ...b, batch_name: e.target.value } : b)}
            onBlur={e => renameBatch(e.target.value)}
            className="text-xl font-bold border-0 px-0 focus-visible:ring-0 bg-transparent h-auto"
          />
          <p className="text-xs text-muted-foreground">
            {images.length} images · {Object.keys(grouped).length} categories
            {analyzing && ` · Analyzing ${progress.done} of ${progress.total}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => autoSort()} disabled={analyzing || images.length === 0} className="gap-1.5">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Auto Sort {unanalyzed > 0 && `(${unanalyzed})`}
          </Button>
          <Button onClick={() => downloadZip()} disabled={zipping || images.length === 0} variant="secondary" className="gap-1.5">
            {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
            Download Organized ZIP
          </Button>
        </div>
      </div>

      {analyzing && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Analyzing {progress.done} of {progress.total} images
              </div>
              <span className="text-muted-foreground tabular-nums">
                {Math.round((progress.done / Math.max(1, progress.total)) * 100)}%
              </span>
            </div>
            <Progress value={(progress.done / Math.max(1, progress.total)) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {progress.total - progress.done} remaining · results appear live below as each image is classified
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upload zone */}
      <div
        ref={dragRef}
        onDragOver={e => { e.preventDefault(); dragRef.current?.classList.add('border-primary', 'bg-primary/5'); }}
        onDragLeave={() => dragRef.current?.classList.remove('border-primary', 'bg-primary/5')}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 transition-colors"
      >
        <input
          ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
          onChange={e => e.target.files && handleFiles(Array.from(e.target.files))}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Uploading…
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="font-medium">Drop images here or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP — multiple files supported</p>
          </>
        )}
      </div>

      {/* Custom categories */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs uppercase font-semibold text-muted-foreground mb-2">Custom categories</p>
          <div className="flex gap-2 flex-wrap mb-3">
            {customCats.length === 0 ? (
              <span className="text-xs text-muted-foreground">None yet — preset categories include Kitchen, Bedroom, Pool, Drone, etc.</span>
            ) : customCats.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}
          </div>
          <div className="flex gap-2">
            <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Add custom category…"
              onKeyDown={e => e.key === 'Enter' && addCustomCat()} className="max-w-xs" />
            <Button size="sm" variant="outline" onClick={addCustomCat} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Grouped */}
      {images.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Upload images to begin.
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cat, imgs]) => (
            <div key={cat}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold flex items-center gap-1.5"><FolderOpen className="h-4 w-4 text-primary" /> {cat}</h3>
                  <Badge variant="outline">{imgs.length}</Badge>
                </div>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => downloadZip(cat)} disabled={zipping}>
                  <Download className="h-3.5 w-3.5" /> Download folder
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {imgs.map(img => (
                  <Card key={img.id} className="overflow-hidden group">
                    <div className="aspect-square bg-muted relative">
                      <img src={img.file_url} alt={img.ai_description || ''} className="w-full h-full object-cover" loading="lazy" />
                      {img.confidence != null && (
                        <Badge className="absolute top-1.5 left-1.5 text-[10px]" variant={img.confidence > 0.7 ? 'default' : 'secondary'}>
                          {Math.round(img.confidence * 100)}%
                        </Badge>
                      )}
                      <button onClick={() => deleteImage(img)}
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 text-destructive-foreground rounded-md p-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="p-2 space-y-1.5">
                      <Select value={finalCatOf(img)} onValueChange={(v) => updateCategory(img.id, v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allCategories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {img.ai_description && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{img.ai_description}</p>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 w-full text-[10px] gap-1"
                        onClick={() => autoSort([img])} disabled={analyzing}>
                        <RefreshCw className="h-2.5 w-2.5" /> Re-analyze
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
