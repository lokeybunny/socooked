import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

const statuses = ['lead', 'prospect', 'active', 'inactive', 'churned'] as const;
const emptyForm = { full_name: '', email: '', phone: '', company: '', status: 'lead' as string, source: '' };

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadCustomers = async () => {
    let q = supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    const { data } = await q;
    setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { loadCustomers(); }, [search, filterStatus]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      const { error } = await supabase.from('customers').update(form).eq('id', editingId);
      if (error) { toast.error(error.message); return; }
      toast.success('Customer updated');
    } else {
      const { error } = await supabase.from('customers').insert([form]);
      if (error) { toast.error(error.message); return; }
      toast.success('Customer created');
    }
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(false);
    loadCustomers();
  };

  const openEdit = (c: any) => {
    setForm({ full_name: c.full_name, email: c.email || '', phone: c.phone || '', company: c.company || '', status: c.status, source: c.source || '' });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customers</h1>
            <p className="text-muted-foreground text-sm mt-1">{customers.length} total</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? 'Edit Customer' : 'New Customer'}</DialogTitle></DialogHeader>
              {/* Show meta info when editing */}
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
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">{editingId ? 'Save Changes' : 'Create Customer'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
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

        {/* Table */}
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

        {/* Meta detail panel for selected customer */}
        {editingId && (() => {
          const customer = customers.find(c => c.id === editingId);
          const meta = customer?.meta && typeof customer.meta === 'object' ? customer.meta : {};
          const metaKeys = Object.keys(meta);
          if (metaKeys.length === 0) return null;
          return null; // Meta is shown inside the dialog below
        })()}
      </div>
    </AppLayout>
  );
}
