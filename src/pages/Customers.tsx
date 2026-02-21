import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Trash2, Instagram } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';

const statuses = ['lead', 'prospect', 'active', 'inactive', 'churned'] as const;
const emptyForm = { full_name: '', email: '', phone: '', company: '', status: 'lead' as string, source: '', address: '', notes: '', tags: '', category: '', instagram_handle: '' };

export default function Customers() {
  const categoryGate = useCategoryGate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    // Unlink/delete related records to avoid FK constraint errors
    await supabase.from('cards').update({ customer_id: null }).eq('customer_id', deleteId);
    await supabase.from('signatures').delete().eq('customer_id', deleteId);
    await supabase.from('documents').delete().eq('customer_id', deleteId);
    await supabase.from('invoices').delete().eq('customer_id', deleteId);
    await supabase.from('interactions').delete().eq('customer_id', deleteId);
    await supabase.from('conversation_threads').delete().eq('customer_id', deleteId);
    await supabase.from('bot_tasks').delete().eq('customer_id', deleteId);
    await supabase.from('communications').delete().eq('customer_id', deleteId);
    const { error } = await supabase.from('customers').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Customer deleted');
    setDeleteId(null);
    loadAll();
  };

  const loadAll = async () => {
    let q = supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    const { data } = await q;
    setAllCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [search, filterStatus]);

  // Deep-link: auto-open a customer from ?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || deepLinkHandled || loading) return;
    const customer = allCustomers.find(c => c.id === openId);
    if (customer) {
      const cat = normalizeCategory(customer.category);
      if (!categoryGate.selectedCategory) {
        categoryGate.onSelect(cat);
      }
      openEdit(customer);
      setDeepLinkHandled(true);
      setSearchParams({}, { replace: true });
    }
  }, [allCustomers, loading, searchParams, deepLinkHandled]);

  const validCategoryIds = SERVICE_CATEGORIES.map(c => c.id);
  const normalizeCategory = (cat: string | null | undefined) => {
    if (!cat) return 'other';
    return validCategoryIds.includes(cat) ? cat : 'other';
  };

  useEffect(() => {
    if (categoryGate.selectedCategory) {
      setCustomers(allCustomers.filter(c => normalizeCategory(c.category) === categoryGate.selectedCategory));
    } else {
      setCustomers(allCustomers);
    }
  }, [categoryGate.selectedCategory, allCustomers]);

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allCustomers.filter(c => normalizeCategory(c.category) === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      company: form.company || null,
      status: form.status,
      source: form.source || null,
      address: form.address || null,
      notes: form.notes || null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      category: form.category || categoryGate.selectedCategory || 'other',
      instagram_handle: form.instagram_handle || null,
    };
    if (editingId) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editingId);
      if (error) { toast.error(error.message); return; }
      toast.success('Customer updated');
    } else {
      const { error } = await supabase.from('customers').insert([payload]);
      if (error) { toast.error(error.message); return; }
      toast.success('Customer created');
    }
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(false);
    loadAll();
  };

  const openEdit = (c: any) => {
    setForm({
      full_name: c.full_name,
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || '',
      status: c.status,
      source: c.source || '',
      address: c.address || '',
      notes: c.notes || '',
      tags: Array.isArray(c.tags) ? c.tags.join(', ') : '',
      category: c.category || 'other',
      instagram_handle: c.instagram_handle || '',
    });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setForm({ ...emptyForm, category: categoryGate.selectedCategory || 'other' });
    setEditingId(null);
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <CategoryGate title="Customers" {...categoryGate} totalCount={allCustomers.length} countLabel="customers" categoryCounts={categoryCounts}>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-muted-foreground text-sm">{customers.length} total</p>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm); } }}>
              <DialogTrigger asChild>
                <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingId ? 'Edit Customer' : 'New Customer'}</DialogTitle></DialogHeader>
                {editingId && (() => {
                  const customer = customers.find(c => c.id === editingId);
                  const meta = customer?.meta && typeof customer.meta === 'object' ? customer.meta : {};
                  const metaKeys = Object.keys(meta);
                  if (metaKeys.length === 0) return null;
                  return (
                    <div className="space-y-2 pb-2 border-b border-border">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Extra Info (from Clawd Bot)</Label>
                      <div className="grid gap-2">
                        {metaKeys.map(k => (
                          <div key={k} className="flex gap-2 text-sm">
                            <span className="font-medium text-foreground min-w-[100px] capitalize">{k.replace(/_/g, ' ')}:</span>
                            <span className="text-muted-foreground break-all">{typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2"><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Company</Label><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Source</Label><Input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, City, State..." /></div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Instagram className="h-3.5 w-3.5" /> Instagram Handle</Label>
                    <Input value={form.instagram_handle} onChange={e => setForm({ ...form, instagram_handle: e.target.value })} placeholder="@username (optional)" />
                  </div>
                  <div className="space-y-2"><Label>Tags</Label><Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Comma-separated, e.g. VIP, Referral" /></div>
                  <div className="space-y-2"><Label>Notes</Label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" /></div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select value={form.category || categoryGate.selectedCategory || 'other'} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SERVICE_CATEGORIES.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">{editingId ? 'Save Changes' : 'Create Customer'}</Button>
                    {editingId && (
                      <Button type="button" variant="destructive" size="icon" onClick={() => { setDialogOpen(false); setDeleteId(editingId); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search customers..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Company</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Source</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden xl:table-cell">Extra Info</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => {
                    const meta = c.meta && typeof c.meta === 'object' ? c.meta : {};
                    const metaKeys = Object.keys(meta);
                    return (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openEdit(c)}>
                        <td className="py-3 px-4 font-medium text-foreground">{c.full_name}</td>
                        <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{c.email || '—'}</td>
                        <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{c.company || '—'}</td>
                        <td className="py-3 px-4"><StatusBadge status={c.status} /></td>
                        <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{c.source || '—'}</td>
                        <td className="py-3 px-4 hidden xl:table-cell">
                          {metaKeys.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {metaKeys.slice(0, 3).map(k => (
                                <span key={k} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{k}</span>
                              ))}
                              {metaKeys.length > 3 && <span className="text-xs text-muted-foreground">+{metaKeys.length - 3}</span>}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {customers.length === 0 && !loading && (
                    <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No customers found. Add your first one!</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Customer</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone. This will permanently delete the customer and all associated data.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CategoryGate>
    </AppLayout>
  );
}
