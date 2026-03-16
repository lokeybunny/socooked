import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Trash2, Instagram, Layers, ArrowRight, CalendarClock, Globe, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { CustomerWebPreviews } from '@/components/CustomerWebPreviews';
import { upsertAiPreview } from '@/lib/upsertAiPreview';
import { useNavigate } from 'react-router-dom';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';
import CortexTerminal from '@/components/terminal/CortexTerminal';

const statuses = ['lead', 'prospect', 'active', 'inactive', 'churned'] as const;
const DISPLAY_CATEGORIES = SERVICE_CATEGORIES.filter(c => c.id !== 'potential');
const emptyForm = { full_name: '', email: '', phone: '', company: '', status: 'lead' as string, source: '', address: '', notes: '', tags: '', category: '', instagram_handle: '', portal_niche: '', ai_website: '' };

export default function Customers() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 25;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [callbackDate, setCallbackDate] = useState<Date | undefined>(undefined);
  const [callbackTime, setCallbackTime] = useState('10:00');

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('cards').update({ customer_id: null }).eq('customer_id', deleteId);
    await supabase.from('transcriptions').delete().eq('customer_id', deleteId);
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
    let q = supabase.from('customers').select('*', { count: 'exact' }).neq('category', 'potential').order('created_at', { ascending: false });
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);
    if (filterCategory !== 'all') q = q.eq('category', filterCategory);
    if (search) {
      q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    }
    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data, count } = await q;
    setCustomers(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [search, filterStatus, filterCategory, page]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [search, filterStatus, filterCategory]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || deepLinkHandled || loading) return;
    const customer = customers.find(c => c.id === openId);
    if (customer) {
      openEdit(customer);
      setDeepLinkHandled(true);
      setSearchParams({}, { replace: true });
    }
  }, [customers, loading, searchParams, deepLinkHandled]);

  const getCategoryLabel = (cat: string | null) => {
    const found = DISPLAY_CATEGORIES.find(c => c.id === cat);
    return found ? found.label : cat || '—';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const existingCustomer = editingId ? customers.find(c => c.id === editingId) : null;
    const existingMeta = existingCustomer?.meta && typeof existingCustomer.meta === 'object' ? existingCustomer.meta as Record<string, unknown> : {};
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
      category: form.category || 'other',
      instagram_handle: form.instagram_handle || null,
      meta: { ...existingMeta, portal_niche: form.portal_niche || null, mv_client: form.portal_niche === 'mv', ai_website: form.ai_website || null },
    };
    if (editingId) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editingId);
      if (error) { toast.error(error.message); return; }
      if (form.ai_website) {
        await upsertAiPreview(editingId, form.ai_website, form.full_name);
      }
      toast.success('Customer updated');
    } else {
      const { data: inserted, error } = await supabase.from('customers').insert([payload]).select('id').single();
      if (error) { toast.error(error.message); return; }
      if (form.ai_website && inserted) {
        await upsertAiPreview(inserted.id, form.ai_website, form.full_name);
      }
      toast.success('Customer created');
    }
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(false);
    loadAll();
  };

  const openEdit = (c: any) => {
    const meta = c.meta && typeof c.meta === 'object' ? c.meta : {};
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
      portal_niche: (meta.portal_niche as string) || (meta.mv_client ? 'mv' : ''),
      ai_website: (meta.ai_website as string) || '',
    });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setForm({ ...emptyForm, category: 'other' });
    setEditingId(null);
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customers</h1>
            <p className="text-muted-foreground text-sm">{totalCount} total</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
              <DialogHeader><DialogTitle>{editingId ? 'Edit Customer' : 'New Customer'}</DialogTitle></DialogHeader>
              {editingId && <CustomerWebPreviews customerId={editingId} />}
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
                  <Select value={form.category || 'other'} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DISPLAY_CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                      ))}
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editingId && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-medium">Portal Landing Page</Label>
                    </div>
                    <Select value={form.portal_niche} onValueChange={v => setForm({ ...form, portal_niche: v === 'none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="None (default uploader)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="mv">Music Video (MV)</SelectItem>
                        <SelectItem value="realtor">Realtor</SelectItem>
                        <SelectItem value="barber">Barber</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Choose which niche landing page this customer sees on their Custom-U portal</p>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">AI Generated Website</Label>
                  </div>
                  <Input value={form.ai_website} onChange={e => setForm({ ...form, ai_website: e.target.value })} placeholder="https://v0-example.vercel.app" />
                  {form.ai_website && (
                    <a href={form.ai_website.startsWith('http') ? form.ai_website : `https://${form.ai_website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />Open website
                    </a>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button type="submit" className="flex-1">{editingId ? 'Save Changes' : 'Create Customer'}</Button>
                  {editingId && (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        setCallbackDate(undefined);
                        setCallbackTime('10:00');
                        setCallbackOpen(true);
                      }}>
                        <CalendarClock className="h-4 w-4 mr-1" />Call Back
                      </Button>
                      <Button type="button" variant="outline" onClick={async () => {
                        await supabase.from('customers').update({ status: 'lead' }).eq('id', editingId);
                        toast.success('Transferred to Leads pipeline');
                        setDialogOpen(false); setEditingId(null); setForm(emptyForm);
                        loadAll();
                        navigate('/leads');
                      }}>
                        <ArrowRight className="h-4 w-4 mr-1" />To Leads
                      </Button>
                      <Button type="button" variant="destructive" size="icon" onClick={() => { setDialogOpen(false); setDeleteId(editingId); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
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
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {DISPLAY_CATEGORIES.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>)}
              <SelectItem value="other">Other</SelectItem>
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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Source</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openEdit(c)}>
                    <td className="py-3 px-4 font-medium text-foreground flex items-center gap-2">
                      {c.full_name}
                      {(() => {
                        const meta = c.meta && typeof c.meta === 'object' ? c.meta : {};
                        return (meta as Record<string, unknown>).callback_at ? (
                          <span title={`Follow-up: ${format(new Date((meta as Record<string, unknown>).callback_at as string), 'MMM d, h:mm a')}`}>
                            <CalendarClock className="h-3.5 w-3.5 text-blue-500" />
                          </span>
                        ) : null;
                      })()}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{c.email || '—'}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{c.company || '—'}</td>
                    <td className="py-3 px-4"><StatusBadge status={c.status} /></td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">{getCategoryLabel(c.category)}</span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{c.source || '—'}</td>
                  </tr>
                ))}
                {customers.length === 0 && !loading && (
                  <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No customers found. Add your first one!</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 w-7 p-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <Button
                    key={i}
                    variant={i === page ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </Button>
                )).slice(Math.max(0, page - 2), page + 3)}
                <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 w-7 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CortexTerminal
        module="customers"
        label="Customer Terminal"
        hint="create & manage customers via prompt"
        placeholder="e.g. Create a new customer named John Doe with email john@example.com…"
        edgeFunction="customer-scheduler"
      />

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

      {/* Callback Scheduler Dialog */}
      <Dialog open={callbackOpen} onOpenChange={setCallbackOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Schedule Call Back
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            When should <span className="font-semibold text-foreground">{customers.find(c => c.id === editingId)?.full_name}</span> appear in the Phone queue?
          </p>
          <div className="space-y-4">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={callbackDate}
                onSelect={setCallbackDate}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                className="p-3 pointer-events-auto"
              />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" value={callbackTime} onChange={e => setCallbackTime(e.target.value)} className="font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallbackOpen(false)}>Cancel</Button>
            <Button disabled={!callbackDate} onClick={async () => {
              if (!editingId || !callbackDate) return;
              const customer = customers.find(c => c.id === editingId);
              const existingMeta = customer?.meta && typeof customer.meta === 'object' ? customer.meta as Record<string, unknown> : {};
              const [hours, minutes] = callbackTime.split(':').map(Number);
              const dt = new Date(callbackDate);
              dt.setHours(hours, minutes, 0, 0);
              const updatedMeta = { ...existingMeta, callback_at: dt.toISOString() };
              await supabase.from('customers').update({ meta: updatedMeta } as any).eq('id', editingId);
              toast.success(`Call back scheduled for ${format(dt, 'MMM d, h:mm a')}`);
              setCallbackOpen(false);
              setDialogOpen(false);
              setEditingId(null);
              setForm(emptyForm);
              loadAll();
            }} className="gap-1.5">
              <CalendarClock className="h-4 w-4" />Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
