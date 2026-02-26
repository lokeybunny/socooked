import { useEffect, useState, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Image, Video, Globe, File, Search, Upload, FolderOpen, ExternalLink, Loader2, ChevronDown, ChevronRight, Smartphone, MessageSquare, Monitor, Users, Trash2, Download, Play, Music, Share2, Link2, Copy, Sparkles, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES, type CategoryInfo } from '@/components/CategoryGate';
import { uploadToStorage, detectContentType, downloadFromUrl } from '@/lib/storage';

const contentTypes = ['article', 'image', 'video', 'audio', 'landing_page', 'doc', 'post'] as const;
const contentStatuses = ['draft', 'scheduled', 'published', 'archived'] as const;

const typeIcons: Record<string, any> = {
  article: FileText, image: Image, video: Video, audio: Music, landing_page: Globe, doc: File, post: FileText,
};

const SOURCE_LABELS: Record<string, { label: string; icon: any }> = {
  dashboard: { label: 'From Dashboard', icon: Monitor },
  instagram: { label: 'From Client Instagram', icon: MessageSquare },
  sms: { label: 'From Client Text Messages', icon: Smartphone },
  'client-direct': { label: 'From Client Directly', icon: File },
  'ai-generated': { label: 'AI Generated', icon: Sparkles },
  'higgsfield': { label: 'AI Generated (Higgsfield)', icon: Sparkles },
  telegram: { label: 'From Telegram', icon: MessageSquare },
  other: { label: 'Other', icon: File },
};

const CATEGORY_LABELS: Record<string, string> = {
  'digital-services': 'Digital Services',
  'brick-and-mortar': 'Brick & Mortar',
  'digital-ecommerce': 'Digital E-Commerce',
  'food-and-beverage': 'Food & Beverage',
  'mobile-services': 'Mobile Services',
  'telegram': 'Telegram',
  'ai-generated': 'AI Generated',
  'other': 'Other',
};

const ALL_UPLOAD_CATEGORIES = Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label }));

const HIGGSFIELD_CATEGORY: CategoryInfo = {
  id: 'ai-generated',
  label: 'AI Generated',
  icon: Sparkles,
  description: 'AI-generated video & media from Higgsfield API',
};

const TELEGRAM_CATEGORY: CategoryInfo = {
  id: 'telegram',
  label: 'Telegram',
  icon: MessageSquare,
  description: 'Media received via Telegram bot',
};

export default function Content() {
  const categoryGate = useCategoryGate();
  const navigate = useNavigate();
  const [allContent, setAllContent] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'article' as string, status: 'draft' as string, url: '', folder: '', customer_id: '' });

  // Track IDs present on first load — anything new gets highlighted
  const initialIdsRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [uploadCustomerId, setUploadCustomerId] = useState('');
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload menu (customer list)
  const [showUploadMenu, setShowUploadMenu] = useState(false);

  // Collapse state for grouped view
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());
  const initialCollapseApplied = useRef(false);

  // Video preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  // Image preview state
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imagePreviewTitle, setImagePreviewTitle] = useState('');

  const playVideo = (fileUrl: string, title: string) => {
    if (!fileUrl) return;
    setPreviewTitle(title);
    setPreviewUrl(fileUrl);
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewTitle('');
  };

  const openImage = (fileUrl: string, title: string) => {
    if (!fileUrl) return;
    setImagePreviewTitle(title);
    setImagePreviewUrl(fileUrl);
  };

  const loadAll = async () => {
    let q = supabase.from('content_assets').select('*, customers(id, full_name, category)').order('created_at', { ascending: false });
    if (filterType !== 'all') q = q.eq('type', filterType);
    if (filterSource !== 'all') q = q.eq('source', filterSource);
    if (search) q = q.ilike('title', `%${search}%`);
    const { data } = await q;
    const items = data || [];

    // On first load, snapshot all existing IDs; on subsequent loads, mark new ones
    if (initialIdsRef.current === null) {
      initialIdsRef.current = new Set(items.map(i => i.id));
    } else {
      const fresh = items.filter(i => !initialIdsRef.current!.has(i.id)).map(i => i.id);
      if (fresh.length > 0) setNewIds(prev => new Set([...prev, ...fresh]));
    }

    setAllContent(items);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name, category');
    setCustomers(data || []);
  };

  useEffect(() => { loadAll(); loadCustomers(); }, [search, filterType, filterSource]);

  // Filter by selected category gate
  const content = useMemo(() => {
    if (categoryGate.selectedCategory) {
      return allContent.filter(c => (c.category || 'other') === categoryGate.selectedCategory);
    }
    return allContent;
  }, [categoryGate.selectedCategory, allContent]);

  // Group: Category → Customer → Source → Files
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Record<string, any[]>>> = {};
    for (const item of content) {
      const cat = CATEGORY_LABELS[item.category || 'other'] || 'Other';
      const custName = item.customers?.full_name || 'Unassigned';
      const src = SOURCE_LABELS[item.source || 'dashboard']?.label || 'Other';
      if (!map[cat]) map[cat] = {};
      if (!map[cat][custName]) map[cat][custName] = {};
      if (!map[cat][custName][src]) map[cat][custName][src] = [];
      map[cat][custName][src].push(item);
    }
    const sorted: { category: string; customers: { name: string; sources: { source: string; files: any[] }[] }[] }[] = [];
    for (const cat of Object.keys(map).sort()) {
      const custs = Object.keys(map[cat]).sort().map(name => ({
        name,
        sources: Object.keys(map[cat][name]).sort().map(src => ({ source: src, files: map[cat][name][src] })),
      }));
      sorted.push({ category: cat, customers: custs });
    }
    return sorted;
  }, [content]);

  // Auto-collapse everything on first load except groups with items from last 24h
  useEffect(() => {
    if (initialCollapseApplied.current || grouped.length === 0) return;
    initialCollapseApplied.current = true;
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const hasRecent = (files: any[]) => files.some(f => now - new Date(f.created_at).getTime() < DAY);

    const catCollapse = new Set<string>();
    const custCollapse = new Set<string>();
    const srcCollapse = new Set<string>();

    for (const group of grouped) {
      let catHasRecent = false;
      for (const cust of group.customers) {
        const custKey = `${group.category}::${cust.name}`;
        let custHasRecent = false;
        for (const srcGroup of cust.sources) {
          const srcKey = `${custKey}::${srcGroup.source}`;
          if (hasRecent(srcGroup.files)) {
            custHasRecent = true;
          } else {
            srcCollapse.add(srcKey);
          }
        }
        if (custHasRecent) catHasRecent = true; else custCollapse.add(custKey);
      }
      if (!catHasRecent) catCollapse.add(group.category);
    }

    setCollapsedCategories(catCollapse);
    setCollapsedCustomers(custCollapse);
    setCollapsedSources(srcCollapse);
  }, [grouped]);

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allContent.filter(c => (c.category || 'other') === cat.id).length;
    return acc;
  }, {} as Record<string, number>);
  // Add higgsfield count (by source)
  categoryCounts['ai-generated'] = allContent.filter(c => c.source === 'higgsfield' || c.source === 'ai-generated' || c.source === 'nano-banana' || c.category === 'ai-generated').length;
  // Add telegram count (by source or category)
  categoryCounts['telegram'] = allContent.filter(c => c.source === 'telegram' || c.category === 'telegram').length;

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const toggleCustomer = (key: string) => {
    setCollapsedCustomers(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSource = (key: string) => {
    setCollapsedSources(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('content_assets').insert([{
      title: form.title, type: form.type, status: form.status,
      url: form.url || null, folder: form.folder || null,
      category: categoryGate.selectedCategory,
      source: 'dashboard',
      customer_id: form.customer_id || null,
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success('Content created');
    setDialogOpen(false);
    setForm({ title: '', type: 'article', status: 'draft', url: '', folder: '', customer_id: '' });
    loadAll();
  };

  const handleDeleteContent = async (id: string) => {
    const { error } = await supabase.from('content_assets').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Content deleted');
    loadAll();
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error('Select a file'); return; }

    const customer = (uploadCustomerId && uploadCustomerId !== 'none') ? customers.find(c => c.id === uploadCustomerId) : null;
    const categoryId = uploadCategory || 'other';
    const categoryLabel = CATEGORY_LABELS[categoryId] || 'Other';
    setUploading(true);

    try {
      const publicUrl = await uploadToStorage(file, {
        category: categoryLabel,
        customerName: customer?.full_name || 'General',
        source: 'dashboard',
      });

      const detectedType = detectContentType(file.type || '');

      await supabase.from('content_assets').insert([{
        title: file.name,
        type: detectedType,
        status: 'published',
        url: publicUrl,
        folder: customer ? `${categoryLabel}/${customer.full_name}` : categoryLabel,
        category: categoryId,
        source: 'dashboard',
        customer_id: customer?.id || null,
      }]);

      toast.success(`Uploaded "${file.name}" to ${categoryLabel}`);
      setUploadOpen(false);
      setUploadCustomerId('');
      setUploadCategory('other');
      if (fileRef.current) fileRef.current.value = '';
      loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = (fileUrl: string, title: string) => {
    if (!fileUrl) { toast.error('No file URL available'); return; }
    downloadFromUrl(fileUrl, title);
  };

  const handleShare = async (assetId: string) => {
    // Generate a unique share token
    const token = crypto.randomUUID();
    const { error } = await supabase.from('content_assets').update({ share_token: token } as any).eq('id', assetId);
    if (error) { toast.error(error.message); return; }

    const shareUrl = `${window.location.origin}/shared/${token}`;
    await navigator.clipboard.writeText(shareUrl);
    toast.success('Share link copied to clipboard!');
    loadAll();
  };

  const handleRevokeShare = async (assetId: string) => {
    const { error } = await supabase.from('content_assets').update({ share_token: null } as any).eq('id', assetId);
    if (error) { toast.error(error.message); return; }
    toast.success('Share link revoked');
    loadAll();
  };

  const downloadFolder = async (sources: { source: string; files: any[] }[], folderName: string) => {
    const allFiles = sources.flatMap(s => s.files).filter(f => f.url);
    if (allFiles.length === 0) { toast.error('No files to download'); return; }

    const zip = new JSZip();
    let downloaded = 0;
    toast.info(`Zipping ${allFiles.length} file(s) from "${folderName}"...`);

    for (const srcGroup of sources) {
      const filesWithUrl = srcGroup.files.filter(f => f.url);
      for (const f of filesWithUrl) {
        try {
          const res = await fetch(f.url);
          if (!res.ok) continue;
          const blob = await res.blob();
          const folderPath = srcGroup.source || 'Files';
          zip.file(`${folderPath}/${f.title}`, blob);
          downloaded++;
        } catch { /* skip failed files */ }
      }
    }

    if (downloaded === 0) { toast.error('Could not download any files'); return; }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `${folderName}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Downloaded ${downloaded} file(s) as "${folderName}.zip"`);
  };

  const SourceBadge = ({ source }: { source: string }) => {
    const info = SOURCE_LABELS[source] || SOURCE_LABELS.other;
    const Icon = info.icon;
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        <Icon className="h-3 w-3" />
        {info.label}
      </span>
    );
  };

  return (
    <AppLayout>
       <CategoryGate title="Content Library" {...categoryGate} pageKey="content" totalCount={allContent.length} countLabel="assets" categoryCounts={categoryCounts} extraCategories={[HIGGSFIELD_CATEGORY, TELEGRAM_CATEGORY]}>
        {categoryGate.selectedCategory === 'ai-generated' ? (
          <HiggsFieldManager
            onPlay={playVideo}
            onDownload={downloadFile}
            onDelete={handleDeleteContent}
            onShare={handleShare}
            onRevokeShare={handleRevokeShare}
            onImagePreview={openImage}
            onRefresh={loadAll}
          />
        ) : categoryGate.selectedCategory === 'telegram' ? (
          <TelegramManager
            onPlay={playVideo}
            onDownload={downloadFile}
            onDelete={handleDeleteContent}
            onShare={handleShare}
            onRevokeShare={handleRevokeShare}
            onImagePreview={openImage}
            onRefresh={loadAll}
          />
        ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-muted-foreground text-sm">{content.length} assets</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowUploadMenu(!showUploadMenu)} className="gap-1.5">
                <Users className="h-4 w-4" /> Upload
              </Button>

              <Dialog open={uploadOpen} onOpenChange={(open) => {
                setUploadOpen(open);
                if (open && categoryGate.selectedCategory) {
                  setUploadCategory(categoryGate.selectedCategory);
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5"><Upload className="h-4 w-4" /> Upload File</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Upload File</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Upload a file into any content category. Optionally assign to a customer.
                    </p>
                    <div className="space-y-2">
                      <Label>Category *</Label>
                      <Select value={uploadCategory} onValueChange={setUploadCategory}>
                        <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                        <SelectContent>
                          {ALL_UPLOAD_CATEGORIES.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Customer <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Select value={uploadCustomerId} onValueChange={setUploadCustomerId}>
                        <SelectTrigger><SelectValue placeholder="No customer (general)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No customer (general)</SelectItem>
                          {customers.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.full_name} <span className="text-muted-foreground ml-1 text-xs">({CATEGORY_LABELS[c.category || 'other']})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>File *</Label>
                      <Input ref={fileRef} type="file" />
                    </div>
                    <Button onClick={handleUpload} disabled={uploading} className="w-full gap-2">
                      {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4" /> Upload</>}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Add Content</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New Content Asset</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{contentTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{contentStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Customer (optional)</Label>
                      <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                        <SelectContent>
                          {customers.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>URL</Label><Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Folder</Label><Input value={form.folder} onChange={e => setForm({ ...form, folder: e.target.value })} /></div>
                    </div>
                    <Button type="submit" className="w-full">Create</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search content..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {contentTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload menu: customer list */}
          {showUploadMenu && (
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" /> Upload for Customer
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setShowUploadMenu(false)}>Close</Button>
              </div>
              {customers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No customers found.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {customers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/content/upload/${c.id}`)}
                      className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left text-sm"
                    >
                      <Upload className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <span className="truncate text-foreground block">{c.full_name}</span>
                        <span className="text-[10px] text-muted-foreground">{CATEGORY_LABELS[c.category || 'other']}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Grouped view: Category → Customer → Source → Files */}
          {grouped.length > 0 ? (
            <div className="space-y-4">
              {grouped.map(group => {
                const catCollapsed = collapsedCategories.has(group.category);
                const totalFiles = group.customers.reduce((s, c) => s + c.sources.reduce((ss, src) => ss + src.files.length, 0), 0);
                return (
                  <div key={group.category} className="glass-card overflow-hidden">
                    <button
                      onClick={() => toggleCategory(group.category)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                    >
                      {catCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{group.category}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{totalFiles} file{totalFiles !== 1 ? 's' : ''}</span>
                    </button>
                    {!catCollapsed && (
                      <div className="border-t border-border">
                        {group.customers.map(cust => {
                          const custKey = `${group.category}::${cust.name}`;
                          const custCollapsed = collapsedCustomers.has(custKey);
                          const custFileCount = cust.sources.reduce((s, src) => s + src.files.length, 0);
                          return (
                            <div key={custKey}>
                              <div className="flex items-center gap-3 pl-10 pr-4 border-b border-border/50">
                                <button
                                  onClick={() => toggleCustomer(custKey)}
                                  className="flex-1 flex items-center gap-3 py-3 hover:bg-muted/30 transition-colors text-left"
                                >
                                  {custCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                  <span className="text-sm font-medium text-foreground">{cust.name}</span>
                                  <span className="text-xs text-muted-foreground ml-auto mr-2">{custFileCount}</span>
                                </button>
                                <button
                                  onClick={() => downloadFolder(cust.sources, cust.name)}
                                  className="text-muted-foreground hover:text-primary transition-colors p-1"
                                  title={`Download all files for ${cust.name}`}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {!custCollapsed && (
                                <div>
                                  {cust.sources.map(srcGroup => {
                                    const srcKey = `${custKey}::${srcGroup.source}`;
                                    const srcCollapsed = collapsedSources.has(srcKey);
                                    return (
                                      <div key={srcKey}>
                                        <button
                                          onClick={() => toggleSource(srcKey)}
                                          className="w-full flex items-center gap-3 pl-16 pr-4 py-2 hover:bg-muted/20 transition-colors text-left border-b border-border/30"
                                        >
                                          {srcCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                                          <FolderOpen className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-xs font-medium text-muted-foreground">{srcGroup.source}</span>
                                          <span className="text-[10px] text-muted-foreground ml-auto">{srcGroup.files.length}</span>
                                        </button>
                                        {!srcCollapsed && (
                                          <div className="divide-y divide-border/30">
                                            {srcGroup.files.map(c => {
                                              const Icon = typeIcons[c.type] || File;
                                              const isPlayable = (c.type === 'video' || c.type === 'audio') && c.url;
                                              return (
                                                <div key={c.id} className={`flex items-center gap-3 pl-24 pr-4 py-2.5 hover:bg-muted/20 transition-colors ${newIds.has(c.id) ? 'new-content-highlight' : ''}`}>
                                                  <div className="p-1.5 rounded bg-muted"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-foreground truncate">{c.title}</p>
                                                    <span className="text-[10px] text-muted-foreground capitalize">{c.type.replace('_', ' ')}</span>
                                                  </div>
                                                  <StatusBadge status={c.status} />
                                                  {c.type === 'image' && c.url && (
                                                    <button onClick={() => openImage(c.url, c.title)} className="text-muted-foreground hover:text-primary transition-colors" title="View image">
                                                      <Image className="h-3.5 w-3.5" />
                                                    </button>
                                                  )}
                                                  {isPlayable && (
                                                    <button onClick={() => playVideo(c.url, c.title)} className="text-muted-foreground hover:text-primary transition-colors" title="Play">
                                                      <Play className="h-3.5 w-3.5" />
                                                    </button>
                                                  )}
                                                  {c.url && (
                                                    <button onClick={() => downloadFile(c.url, c.title)} className="text-muted-foreground hover:text-primary transition-colors" title="Download">
                                                      <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                  )}
                                                  {c.url && (
                                                    c.share_token ? (
                                                      <button onClick={() => handleRevokeShare(c.id)} className="text-primary hover:text-destructive transition-colors" title="Revoke share link">
                                                        <Link2 className="h-3.5 w-3.5" />
                                                      </button>
                                                    ) : (
                                                      <button onClick={() => handleShare(c.id)} className="text-muted-foreground hover:text-primary transition-colors" title="Create share link">
                                                        <Share2 className="h-3.5 w-3.5" />
                                                      </button>
                                                    )
                                                  )}
                                                  {c.category !== 'ai-generated' && (
                                                    <button
                                                      onClick={async () => {
                                                        const { error } = await supabase.from('content_assets').update({ category: 'ai-generated' }).eq('id', c.id);
                                                        if (error) { toast.error('Failed to push'); return; }
                                                        toast.success('Pushed to AI Generated', { description: c.title });
                                                        setAllContent(prev => prev.map(x => x.id === c.id ? { ...x, category: 'ai-generated' } : x));
                                                      }}
                                                      className="flex items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors"
                                                      title="Push to AI Generated"
                                                    >
                                                      <ArrowUpRight className="h-3.5 w-3.5" />
                                                      <Sparkles className="h-2.5 w-2.5" />
                                                    </button>
                                                  )}
                                                  <button onClick={() => handleDeleteContent(c.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : !loading ? (
            <div className="text-center py-16 text-muted-foreground">No content yet. Start creating!</div>
          ) : null}


          {/* Customer Meetings Section */}
          <CustomerMeetingsSection 
            categoryId={categoryGate.selectedCategory} 
            onPlay={playVideo}
            onDownload={downloadFile}
            onDelete={handleDeleteContent}
            onImagePreview={openImage}
          />

        </div>
        )}

        {/* Video/Audio Preview Dialog (shared across all views) */}
        <Dialog open={!!previewTitle} onOpenChange={(open) => { if (!open) closePreview(); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle className="truncate">{previewTitle}</DialogTitle></DialogHeader>
            {previewUrl ? (
              <video src={previewUrl} controls autoPlay className="w-full rounded-lg max-h-[70vh]" />
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Image Preview Dialog (shared across all views) */}
        <Dialog open={!!imagePreviewUrl} onOpenChange={(open) => { if (!open) { setImagePreviewUrl(null); setImagePreviewTitle(''); } }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle className="truncate">{imagePreviewTitle}</DialogTitle></DialogHeader>
            {imagePreviewUrl && (
              <div className="space-y-4">
                <img src={imagePreviewUrl} alt={imagePreviewTitle} className="w-full rounded-lg max-h-[70vh] object-contain" />
                <Button onClick={() => downloadFile(imagePreviewUrl, imagePreviewTitle)} className="w-full gap-2">
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CategoryGate>
    </AppLayout>
  );
}

/* ─── Customer Meetings Sub-Section ──────────────────────── */
function CustomerMeetingsSection({ categoryId, onPlay, onDownload, onDelete, onImagePreview }: {
  categoryId: string | null;
  onPlay: (url: string, title: string) => void;
  onDownload: (url: string, title: string) => void;
  onDelete: (id: string) => void;
  onImagePreview: (url: string, title: string) => void;
}) {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const load = async () => {
      let q = supabase.from('content_assets')
        .select('*, customers(full_name)')
        .eq('source', 'Meeting')
        .order('created_at', { ascending: false })
        .limit(100);
      if (categoryId) q = q.eq('category', categoryId);
      const { data } = await q;
      setAssets(data || []);
      setLoading(false);
    };
    load();
  }, [categoryId]);

  // Group by date → customer
  const grouped = useMemo(() => {
    const byDate: Record<string, Record<string, any[]>> = {};
    for (const a of assets) {
      const dateKey = new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const custName = a.customers?.full_name || 'No Client';
      if (!byDate[dateKey]) byDate[dateKey] = {};
      if (!byDate[dateKey][custName]) byDate[dateKey][custName] = [];
      byDate[dateKey][custName].push(a);
    }
    return Object.entries(byDate).map(([date, custs]) => ({
      date,
      customers: Object.entries(custs).map(([name, files]) => ({ name, files })),
    }));
  }, [assets]);

  if (loading || assets.length === 0) return null;

  return (
    <>
      {/* Sticky bottom bar trigger */}
      {!expanded && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all text-sm font-medium"
          >
            <Video className="h-4 w-4" />
            Client Meetings
            <span className="ml-1 px-1.5 py-0.5 rounded bg-primary-foreground/20 text-[10px] font-bold">{assets.length}</span>
          </button>
        </div>
      )}

      {/* Expanded meetings panel */}
      {expanded && (
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Video className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Client Meetings</span>
              <span className="text-xs text-muted-foreground">{assets.length} recording{assets.length !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={() => setExpanded(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted">
              Collapse
            </button>
          </div>

          <div className="divide-y divide-border">
            {grouped.map(group => (
              <div key={group.date}>
                {/* Date header */}
                <div className="px-4 py-2 bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.date}</span>
                </div>

                {group.customers.map(cust => (
                  <div key={`${group.date}-${cust.name}`}>
                    {/* Customer sub-header */}
                    <div className="px-6 py-1.5 flex items-center gap-2">
                      <Users className="h-3 w-3 text-primary/70" />
                      <span className="text-xs font-medium text-foreground">{cust.name}</span>
                      <span className="text-[10px] text-muted-foreground">({cust.files.length})</span>
                    </div>

                    {/* Files */}
                    <div className="divide-y divide-border/20">
                      {cust.files.map(a => {
                        const Icon = a.type === 'video' ? Video : a.type === 'image' ? Image : a.type === 'audio' ? Music : File;
                        const ext = a.type === 'video' ? 'MP4' : a.type === 'audio' ? 'MP3' : a.type === 'image' ? 'IMG' : a.type?.toUpperCase();
                        const isPlayable = (a.type === 'video' || a.type === 'audio') && a.url;
                        return (
                          <div key={a.id} className="flex items-center gap-3 px-8 py-2 hover:bg-muted/20 transition-colors">
                            <div className="p-1 rounded bg-primary/10"><Icon className="h-3.5 w-3.5 text-primary" /></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{a.title}</p>
                            </div>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ext}</span>
                            {a.type === 'image' && a.url && (
                              <button onClick={() => onImagePreview(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="View image">
                                <Image className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {isPlayable && (
                              <button onClick={() => onPlay(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="Play">
                                <Play className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {a.url && (
                              <button onClick={() => onDownload(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="Download">
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button onClick={() => onDelete(a.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Higgsfield AI Full Manager ──────────────────────── */
function HiggsFieldManager({ onPlay, onDownload, onDelete, onShare, onRevokeShare, onImagePreview, onRefresh }: {
  onPlay: (url: string, title: string) => void;
  onDownload: (url: string, title: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
  onRevokeShare: (id: string) => void;
  onImagePreview: (url: string, title: string) => void;
  onRefresh?: () => void;
}) {
  const [assets, setAssets] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const initialIdsRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const loadAssets = async () => {
    const { data } = await supabase.from('content_assets')
      .select('*, customers(id, full_name)')
      .or('source.eq.higgsfield,source.eq.ai-generated,source.eq.nano-banana,category.eq.ai-generated')
      .order('created_at', { ascending: false });
    const items = data || [];
    if (initialIdsRef.current === null) {
      initialIdsRef.current = new Set(items.map(i => i.id));
    } else {
      const fresh = items.filter(i => !initialIdsRef.current!.has(i.id)).map(i => i.id);
      if (fresh.length > 0) setNewIds(prev => new Set([...prev, ...fresh]));
    }
    setAssets(items);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name, category');
    setCustomers(data || []);
  };

  useEffect(() => { loadAssets(); loadCustomers(); }, []);

  const handleDelete = async (id: string) => {
    onDelete(id);
    setTimeout(loadAssets, 500);
  };

  const handleAssignCustomer = async (assetId: string, customerId: string) => {
    const update = customerId === '__unassign__' ? { customer_id: null } : { customer_id: customerId };
    const { error } = await supabase.from('content_assets').update(update).eq('id', assetId);
    if (error) { toast.error(error.message); return; }
    toast.success(customerId === '__unassign__' ? 'Unassigned from customer' : 'Assigned to customer');
    loadAssets();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{assets.length} Higgsfield AI assets</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading…</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">No Higgsfield AI content yet.</p>
          <p className="text-sm text-muted-foreground/60">Assets will appear here automatically once the Higgsfield API is connected.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map(a => {
            const Icon = typeIcons[a.type] || File;
            const isPlayable = (a.type === 'video' || a.type === 'audio') && a.url;
            return (
              <div key={a.id} className={`glass-card flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors ${newIds.has(a.id) ? 'new-content-highlight' : ''}`}>
                <div className="p-1.5 rounded bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                  <span className="text-xs text-muted-foreground">
                    {a.customers?.full_name || 'No client'} · {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Assign to customer */}
                <Select
                  value={a.customer_id || ''}
                  onValueChange={(v) => handleAssignCustomer(a.id, v)}
                >
                  <SelectTrigger className="w-36 h-7 text-xs">
                    <SelectValue placeholder="Assign…" />
                  </SelectTrigger>
                  <SelectContent>
                    {a.customer_id && (
                      <SelectItem key="__unassign__" value="__unassign__" className="text-xs text-destructive">Unassign</SelectItem>
                    )}
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <StatusBadge status={a.status} />
                {a.type === 'image' && a.url && (
                  <button onClick={() => onImagePreview(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="View image">
                    <Image className="h-4 w-4" />
                  </button>
                )}
                {isPlayable && (
                  <button onClick={() => onPlay(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="Play">
                    <Play className="h-3.5 w-3.5" />
                  </button>
                )}
                {a.url && (
                  <button onClick={() => onDownload(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="Download">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
                {a.url && (
                  a.share_token ? (
                    <button onClick={() => onRevokeShare(a.id)} className="text-primary hover:text-destructive transition-colors" title="Revoke share link">
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button onClick={() => onShare(a.id)} className="text-muted-foreground hover:text-primary transition-colors" title="Create share link">
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
                {a.category !== 'ai-generated' && (
                  <button
                    onClick={async () => {
                      const { error } = await supabase.from('content_assets').update({ category: 'ai-generated' }).eq('id', a.id);
                      if (error) { toast.error('Failed to push'); return; }
                      toast.success('Pushed to AI Generated', { description: a.title });
                      setAssets(prev => prev.filter(x => x.id !== a.id));
                      onRefresh?.();
                    }}
                    className="flex items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors"
                    title="Push to AI Generated"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    <Sparkles className="h-2.5 w-2.5" />
                  </button>
                )}
                <button onClick={() => handleDelete(a.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Telegram Manager ──────────────────────── */
function TelegramManager({ onPlay, onDownload, onDelete, onShare, onRevokeShare, onImagePreview, onRefresh }: {
  onPlay: (url: string, title: string) => void;
  onDownload: (url: string, title: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
  onRevokeShare: (id: string) => void;
  onImagePreview: (url: string, title: string) => void;
  onRefresh?: () => void;
}) {
  const [assets, setAssets] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const initialIdsRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const loadAssets = async () => {
    const { data } = await supabase.from('content_assets')
      .select('*, customers(id, full_name)')
      .or('source.eq.telegram,category.eq.telegram')
      .order('created_at', { ascending: false });
    const items = data || [];
    if (initialIdsRef.current === null) {
      initialIdsRef.current = new Set(items.map(i => i.id));
    } else {
      const fresh = items.filter(i => !initialIdsRef.current!.has(i.id)).map(i => i.id);
      if (fresh.length > 0) setNewIds(prev => new Set([...prev, ...fresh]));
    }
    setAssets(items);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name, category');
    setCustomers(data || []);
  };

  useEffect(() => { loadAssets(); loadCustomers(); }, []);

  const handleDelete = async (id: string) => {
    onDelete(id);
    setTimeout(loadAssets, 500);
  };

  const handleAssignCustomer = async (assetId: string, customerId: string) => {
    if (customerId === '__unassign__') {
      const { error } = await supabase.from('content_assets').update({ customer_id: null, folder: null }).eq('id', assetId);
      if (error) { toast.error(error.message); return; }
      toast.success('Unassigned from customer');
    } else {
      const customer = customers.find(c => c.id === customerId);
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      const folder = customer ? `Telegram/${customer.full_name}/${dateStr}` : null;
      const { error } = await supabase.from('content_assets').update({ customer_id: customerId, folder }).eq('id', assetId);
      if (error) { toast.error(error.message); return; }
      toast.success(`Assigned to ${customer?.full_name} → folder created`);
    }
    loadAssets();
  };

  const brokenCount = useMemo(() => assets.filter(a => !a.url).length, [assets]);

  const handleCleanupBroken = async () => {
    const broken = assets.filter(a => !a.url);
    if (broken.length === 0) { toast.info('No broken entries found'); return; }
    const { error } = await supabase.from('content_assets').delete().in('id', broken.map(a => a.id));
    if (error) { toast.error(error.message); return; }
    toast.success(`Removed ${broken.length} broken entr${broken.length === 1 ? 'y' : 'ies'}`);
    loadAssets();
  };

  // Filter by search (customer name or file title)
  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter(a =>
      a.title?.toLowerCase().includes(q) ||
      a.customers?.full_name?.toLowerCase().includes(q)
    );
  }, [assets, search]);

  // Group by Customer → Date
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, any[]>> = {};
    for (const a of filtered) {
      const custName = a.customers?.full_name || 'Unassigned';
      const dateKey = new Date(a.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      if (!map[custName]) map[custName] = {};
      if (!map[custName][dateKey]) map[custName][dateKey] = [];
      map[custName][dateKey].push(a);
    }
    // Sort: assigned customers first (alphabetically), then Unassigned last
    const entries = Object.entries(map).sort(([a], [b]) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
    return entries.map(([custName, dates]) => ({
      customer: custName,
      totalFiles: Object.values(dates).reduce((s, arr) => s + arr.length, 0),
      dates: Object.entries(dates).map(([date, files]) => ({ date, files })),
    }));
  }, [filtered]);

  const toggleCustomer = (key: string) => {
    setCollapsedCustomers(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const toggleDate = (key: string) => {
    setCollapsedDates(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by customer name or file name..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {filtered.length} Telegram file{filtered.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
        {brokenCount > 0 && (
          <Button variant="destructive" size="sm" onClick={handleCleanupBroken}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Remove {brokenCount} broken entr{brokenCount === 1 ? 'y' : 'ies'}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <MessageSquare className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">{search ? 'No results found.' : 'No Telegram content yet.'}</p>
          <p className="text-sm text-muted-foreground/60">{search ? 'Try a different search term.' : 'Media sent through Telegram will appear here automatically.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ customer, totalFiles, dates }) => {
            const custCollapsed = collapsedCustomers.has(customer);
            return (
              <div key={customer} className="glass-card overflow-hidden">
                {/* Customer folder header */}
                <button
                  onClick={() => toggleCustomer(customer)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  {custCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{customer}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{totalFiles} file{totalFiles !== 1 ? 's' : ''}</span>
                </button>

                {!custCollapsed && (
                  <div className="border-t border-border">
                    {dates.map(({ date, files }) => {
                      const dateKey = `${customer}::${date}`;
                      const dateCollapsed = collapsedDates.has(dateKey);
                      return (
                        <div key={dateKey}>
                          {/* Date sub-folder */}
                          <button
                            onClick={() => toggleDate(dateKey)}
                            className="w-full flex items-center gap-3 pl-10 pr-4 py-2.5 hover:bg-muted/30 transition-colors text-left border-b border-border/50"
                          >
                            {dateCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">{date}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{files.length}</span>
                          </button>

                          {!dateCollapsed && (
                            <div className="divide-y divide-border/30">
                              {files.map(a => {
                                const Icon = typeIcons[a.type] || File;
                                const isPlayable = (a.type === 'video' || a.type === 'audio') && a.url;
                                return (
                                  <div key={a.id} className={`flex items-center gap-3 px-4 pl-16 py-3 hover:bg-muted/20 transition-colors ${newIds.has(a.id) ? 'new-content-highlight' : ''}`}>
                                    <div className="p-1.5 rounded bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div>
                                    <div className="flex-1 min-w-0">
                                      <button
                                        onClick={() => { navigator.clipboard.writeText(a.title); toast.success('Copied to clipboard', { description: a.title }); }}
                                        className="text-sm font-medium text-foreground truncate block max-w-full text-left hover:text-primary transition-colors cursor-copy"
                                        title="Click to copy filename"
                                      >{a.title}</button>
                                      <span className="text-xs text-muted-foreground">
                                        {a.folder || 'No folder'} · {new Date(a.created_at).toLocaleTimeString()}
                                      </span>
                                    </div>

                                    {/* Assign to customer */}
                                    <Select
                                      value={a.customer_id || ''}
                                      onValueChange={(v) => handleAssignCustomer(a.id, v)}
                                    >
                                      <SelectTrigger className="w-36 h-7 text-xs">
                                        <SelectValue placeholder="Assign…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {a.customer_id && (
                                          <SelectItem key="__unassign__" value="__unassign__" className="text-xs text-destructive">Unassign</SelectItem>
                                        )}
                                        {customers.map(c => (
                                          <SelectItem key={c.id} value={c.id} className="text-xs">{c.full_name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    <StatusBadge status={a.status} />
                                    {a.type === 'image' && a.url && (
                                      <button onClick={() => onImagePreview(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="View image">
                                        <Image className="h-4 w-4" />
                                      </button>
                                    )}
                                    {isPlayable && (
                                      <button onClick={() => onPlay(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="Play">
                                        <Play className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {a.url && (
                                      <button onClick={() => onDownload(a.url, a.title)} className="text-muted-foreground hover:text-primary transition-colors" title="Download">
                                        <Download className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {a.url && (
                                      a.share_token ? (
                                        <button onClick={() => onRevokeShare(a.id)} className="text-primary hover:text-destructive transition-colors" title="Revoke share link">
                                          <Link2 className="h-3.5 w-3.5" />
                                        </button>
                                      ) : (
                                        <button onClick={() => onShare(a.id)} className="text-muted-foreground hover:text-primary transition-colors" title="Create share link">
                                          <Share2 className="h-3.5 w-3.5" />
                                        </button>
                                      )
                                    )}
                                    {a.category !== 'ai-generated' && (
                                      <button
                                        onClick={async () => {
                                          const { error } = await supabase.from('content_assets').update({ category: 'ai-generated' }).eq('id', a.id);
                                          if (error) { toast.error('Failed to push'); return; }
                                          toast.success('Pushed to AI Generated', { description: a.title });
                                          setAssets(prev => prev.filter(x => x.id !== a.id));
                                          onRefresh?.();
                                        }}
                                        className="flex items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors"
                                        title="Push to AI Generated"
                                      >
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                        <Sparkles className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                    <button onClick={() => handleDelete(a.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
