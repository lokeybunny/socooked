import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Image, Video, Globe, File, Search } from 'lucide-react';
import { toast } from 'sonner';

const contentTypes = ['article', 'image', 'video', 'landing_page', 'doc', 'post'] as const;
const contentStatuses = ['draft', 'scheduled', 'published', 'archived'] as const;

const typeIcons: Record<string, any> = {
  article: FileText, image: Image, video: Video, landing_page: Globe, doc: File, post: FileText,
};

export default function Content() {
  const [content, setContent] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'article' as string, status: 'draft' as string, url: '', folder: '' });

  const load = async () => {
    let q = supabase.from('content_assets').select('*').order('created_at', { ascending: false });
    if (filterType !== 'all') q = q.eq('type', filterType);
    if (search) q = q.ilike('title', `%${search}%`);
    const { data } = await q;
    setContent(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterType]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('content_assets').insert([{
      title: form.title,
      type: form.type,
      status: form.status,
      url: form.url || null,
      folder: form.folder || null,
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success('Content created');
    setDialogOpen(false);
    setForm({ title: '', type: 'article', status: 'draft', url: '', folder: '' });
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Content Library</h1>
            <p className="text-muted-foreground text-sm mt-1">{content.length} assets</p>
          </div>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>URL</Label><Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Folder</Label><Input value={form.folder} onChange={e => setForm({ ...form, folder: e.target.value })} /></div>
                </div>
                <Button type="submit" className="w-full">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {content.map(c => {
            const Icon = typeIcons[c.type] || File;
            return (
              <div key={c.id} className="glass-card p-5 hover:shadow-md transition-shadow cursor-pointer space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-1">{c.title}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{c.type.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={c.status} />
                  {c.folder && <span className="text-xs text-muted-foreground">📁 {c.folder}</span>}
                </div>
              </div>
            );
          })}
          {content.length === 0 && !loading && (
            <div className="col-span-full text-center py-16 text-muted-foreground">No content yet. Start creating!</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
