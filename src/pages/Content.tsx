import { useEffect, useState, useRef, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Image, Video, Globe, File, Search, Upload, FolderOpen, ExternalLink, Loader2, ChevronDown, ChevronRight, Smartphone, MessageSquare, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';

const contentTypes = ['article', 'image', 'video', 'landing_page', 'doc', 'post'] as const;
const contentStatuses = ['draft', 'scheduled', 'published', 'archived'] as const;

const typeIcons: Record<string, any> = {
  article: FileText, image: Image, video: Video, landing_page: Globe, doc: File, post: FileText,
};

const SOURCE_LABELS: Record<string, { label: string; icon: any }> = {
  dashboard: { label: 'Dashboard', icon: Monitor },
  'google-drive': { label: 'Google Drive', icon: FolderOpen },
  instagram: { label: 'Instagram', icon: MessageSquare },
  sms: { label: 'SMS', icon: Smartphone },
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
  const [allContent, setAllContent] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'article' as string, status: 'draft' as string, url: '', folder: '', customer_id: '' });

  // Drive upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [uploadCustomerId, setUploadCustomerId] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Drive files browser
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [showDrive, setShowDrive] = useState(false);

  // Collapse state for grouped view
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());

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

  // Group: Category → Customer → Files
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, any[]>> = {};
    for (const item of content) {
      const cat = CATEGORY_LABELS[item.category || 'other'] || 'Other';
      const custName = item.customers?.full_name || 'Unassigned';
      if (!map[cat]) map[cat] = {};
      if (!map[cat][custName]) map[cat][custName] = [];
      map[cat][custName].push(item);
    }
    // Sort categories and customers alphabetically
    const sorted: { category: string; customers: { name: string; files: any[] }[] }[] = [];
    for (const cat of Object.keys(map).sort()) {
      const custs = Object.keys(map[cat]).sort().map(name => ({ name, files: map[cat][name] }));
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

  const handleUploadToDrive = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error('Select a file'); return; }
    if (!uploadCustomerId) { toast.error('Select a customer'); return; }

    const customer = customers.find(c => c.id === uploadCustomerId);
    if (!customer) { toast.error('Customer not found'); return; }

    const category = CATEGORY_LABELS[customer.category || 'other'] || 'Other';
    setUploading(true);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // 1. Ensure folder structure exists
      const folderRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/google-drive?action=ensure-folder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({ category, customer_name: customer.full_name }),
        }
      );
      const folderData = await folderRes.json();
      if (!folderRes.ok) throw new Error(folderData.error || 'Failed to create folder');

      // 2. Upload file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_id', folderData.folder_id);

      const uploadRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/google-drive?action=upload`,
        {
          method: 'POST',
          headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: formData,
        }
      );
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Failed to upload');

      // 3. Auto-detect content type from MIME
      const mime = file.type || '';
      let detectedType = 'doc';
      if (mime.startsWith('image/')) detectedType = 'image';
      else if (mime.startsWith('video/')) detectedType = 'video';
      else if (mime.startsWith('audio/')) detectedType = 'video';
      else if (
        mime === 'application/pdf' || mime.includes('word') || mime.includes('document') ||
        mime.includes('spreadsheet') || mime.includes('presentation') ||
        mime === 'text/plain' || mime === 'text/csv'
      ) detectedType = 'doc';

      // 4. Create content_assets record
      await supabase.from('content_assets').insert([{
        title: file.name,
        type: detectedType,
        status: 'published',
        url: uploadData.webViewLink || null,
        folder: `${category}/${customer.full_name}`,
        category: customer.category || 'other',
        source: 'google-drive',
        customer_id: customer.id,
      }]);

      toast.success(`Uploaded "${file.name}" to Google Drive`);
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

  const browseDriveFiles = async () => {
    setDriveLoading(true);
    setShowDrive(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/google-drive?action=folders`,
        { headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` } }
      );
      const data = await res.json();
      setDriveFiles(data.folders || []);
    } catch {
      toast.error('Failed to load Drive folders');
    } finally {
      setDriveLoading(false);
    }
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
              <Button variant="outline" size="sm" onClick={browseDriveFiles} className="gap-1.5">
                <FolderOpen className="h-4 w-4" /> Browse Drive
              </Button>

              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5"><Upload className="h-4 w-4" /> Upload to Drive</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Upload to Google Drive</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Files are organized into <strong>Category → Customer Name</strong> folders on Drive and in the CRM.
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
                    <Button onClick={handleUploadToDrive} disabled={uploading} className="w-full gap-2">
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

          {/* Drive folders browser */}
          {showDrive && (
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" /> Google Drive Folders
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setShowDrive(false)}>Close</Button>
              </div>
              {driveLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
              ) : driveFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No folders yet. Upload a file to auto-create the folder structure.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {driveFiles.map(f => (
                    <a key={f.id} href={f.webViewLink} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-sm">
                      <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate text-foreground">{f.name}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Grouped view: Category → Customer → Files */}
          {grouped.length > 0 ? (
            <div className="space-y-4">
              {grouped.map(group => {
                const catCollapsed = collapsedCategories.has(group.category);
                const totalFiles = group.customers.reduce((s, c) => s + c.files.length, 0);
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
                          return (
                            <div key={custKey}>
                              <button
                                onClick={() => toggleCustomer(custKey)}
                                className="w-full flex items-center gap-3 pl-10 pr-4 py-3 hover:bg-muted/30 transition-colors text-left border-b border-border/50"
                              >
                                {custCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                <span className="text-sm font-medium text-foreground">{cust.name}</span>
                                <span className="text-xs text-muted-foreground ml-auto">{cust.files.length}</span>
                              </button>
                              {!custCollapsed && (
                                <div className="divide-y divide-border/30">
                                  {cust.files.map(c => {
                                    const Icon = typeIcons[c.type] || File;
                                    return (
                                      <div key={c.id} className="flex items-center gap-3 pl-16 pr-4 py-2.5 hover:bg-muted/20 transition-colors">
                                        <div className="p-1.5 rounded bg-muted"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-foreground truncate">{c.title}</p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-muted-foreground capitalize">{c.type.replace('_', ' ')}</span>
                                            <SourceBadge source={c.source || 'dashboard'} />
                                          </div>
                                        </div>
                                        <StatusBadge status={c.status} />
                                        {c.url && (
                                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                          </a>
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
        </div>
      </CategoryGate>
    </AppLayout>
  );
}
