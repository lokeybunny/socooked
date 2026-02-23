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
import { Plus, FileText, Image, Video, Globe, File, Search, Upload, FolderOpen, ExternalLink, Loader2, ChevronDown, ChevronRight, Smartphone, MessageSquare, Monitor, Users, Trash2, Download, Play, Music } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';
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
  other: { label: 'Other', icon: File },
};

const CATEGORY_LABELS: Record<string, string> = {
  'digital-services': 'Digital Services',
  'brick-and-mortar': 'Brick & Mortar',
  'digital-ecommerce': 'Digital E-Commerce',
  'food-and-beverage': 'Food & Beverage',
  'mobile-services': 'Mobile Services',
  'other': 'Other',
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

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [uploadCustomerId, setUploadCustomerId] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload menu (customer list)
  const [showUploadMenu, setShowUploadMenu] = useState(false);

  // Collapse state for grouped view
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());

  // Video preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  const playVideo = (fileUrl: string, title: string) => {
    if (!fileUrl) return;
    setPreviewTitle(title);
    setPreviewUrl(fileUrl);
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewTitle('');
  };

  const loadAll = async () => {
    let q = supabase.from('content_assets').select('*, customers(id, full_name, category)').order('created_at', { ascending: false });
    if (filterType !== 'all') q = q.eq('type', filterType);
    if (filterSource !== 'all') q = q.eq('source', filterSource);
    if (search) q = q.ilike('title', `%${search}%`);
    const { data } = await q;
    setAllContent(data || []);
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

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allContent.filter(c => (c.category || 'other') === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

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
    if (!uploadCustomerId) { toast.error('Select a customer'); return; }

    const customer = customers.find(c => c.id === uploadCustomerId);
    if (!customer) { toast.error('Customer not found'); return; }

    const category = CATEGORY_LABELS[customer.category || 'other'] || 'Other';
    setUploading(true);

    try {
      const publicUrl = await uploadToStorage(file, {
        category,
        customerName: customer.full_name,
        source: 'dashboard',
      });

      const detectedType = detectContentType(file.type || '');

      await supabase.from('content_assets').insert([{
        title: file.name,
        type: detectedType,
        status: 'published',
        url: publicUrl,
        folder: `${category}/${customer.full_name}`,
        category: customer.category || 'other',
        source: 'dashboard',
        customer_id: customer.id,
      }]);

      toast.success(`Uploaded "${file.name}"`);
      setUploadOpen(false);
      setUploadCustomerId('');
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
      <CategoryGate title="Content Library" {...categoryGate} totalCount={allContent.length} countLabel="assets" categoryCounts={categoryCounts}>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-muted-foreground text-sm">{content.length} assets</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowUploadMenu(!showUploadMenu)} className="gap-1.5">
                <Users className="h-4 w-4" /> Upload
              </Button>

              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5"><Upload className="h-4 w-4" /> Upload File</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Upload File</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Files are organized into <strong>Category → Customer Name</strong> folders.
                    </p>
                    <div className="space-y-2">
                      <Label>Customer *</Label>
                      <Select value={uploadCustomerId} onValueChange={setUploadCustomerId}>
                        <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                        <SelectContent>
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
                                                <div key={c.id} className="flex items-center gap-3 pl-24 pr-4 py-2.5 hover:bg-muted/20 transition-colors">
                                                  <div className="p-1.5 rounded bg-muted"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-foreground truncate">{c.title}</p>
                                                    <span className="text-[10px] text-muted-foreground capitalize">{c.type.replace('_', ' ')}</span>
                                                  </div>
                                                  <StatusBadge status={c.status} />
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
          />

          {/* Video/Audio Preview Dialog */}
          <Dialog open={!!previewTitle} onOpenChange={(open) => { if (!open) closePreview(); }}>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle className="truncate">{previewTitle}</DialogTitle></DialogHeader>
              {previewUrl ? (
                <video src={previewUrl} controls autoPlay className="w-full rounded-lg max-h-[70vh]" />
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      </CategoryGate>
    </AppLayout>
  );
}

/* ─── Customer Meetings Sub-Section ──────────────────────── */
function CustomerMeetingsSection({ categoryId, onPlay, onDownload, onDelete }: {
  categoryId: string | null;
  onPlay: (url: string, title: string) => void;
  onDownload: (url: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const load = async () => {
      let q = supabase.from('content_assets')
        .select('*, customers(full_name)')
        .eq('source', 'Meeting')
        .order('created_at', { ascending: false })
        .limit(50);
      if (categoryId) q = q.eq('category', categoryId);
      const { data } = await q;
      setAssets(data || []);
      setLoading(false);
    };
    load();
  }, [categoryId]);

  if (loading || assets.length === 0) return null;

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
      >
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        <Video className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Customer Meetings</span>
        <span className="text-xs text-muted-foreground ml-auto">{assets.length} recording{assets.length !== 1 ? 's' : ''}</span>
      </button>
      {!collapsed && (
        <div className="border-t border-border divide-y divide-border/30">
          {assets.map(a => {
            const Icon = a.type === 'video' ? Video : Music;
            const isPlayable = (a.type === 'video' || a.type === 'audio') && a.url;
            return (
              <div key={a.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/20 transition-colors">
                <div className="p-1.5 rounded bg-primary/10"><Icon className="h-3.5 w-3.5 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {a.customers?.full_name || 'No client'} · {a.type} · {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
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
      )}
    </div>
  );
}
