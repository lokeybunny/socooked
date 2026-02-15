import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Plus, Receipt, DollarSign } from 'lucide-react';
import { toast } from 'sonner';



export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: '', amount: '', currency: 'USD' });

  const load = async () => {
    const [{ data: inv }, { data: cust }] = await Promise.all([
      supabase.from('invoices').select('*, customers(full_name, email)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name'),
    ]);
    setInvoices(inv || []);
    setCustomers(cust || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('invoices').insert([{
      customer_id: form.customer_id,
      amount: parseFloat(form.amount) || 0,
      currency: form.currency,
      status: 'draft',
      provider: 'manual',
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success('Invoice created');
    setDialogOpen(false);
    setForm({ customer_id: '', amount: '', currency: 'USD' });
    load();
  };

  const markAs = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === 'sent') updates.sent_at = new Date().toISOString();
    if (status === 'paid') updates.paid_at = new Date().toISOString();
    await supabase.from('invoices').update(updates).eq('id', id);
    toast.success(`Invoice marked as ${status}`);
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <p className="text-muted-foreground text-sm mt-1">{invoices.length} invoices</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Invoice</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount *</Label>
                    <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required placeholder="400.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={!form.customer_id || !form.amount}>Create Invoice</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {invoices.map(inv => (
            <div key={inv.id} className="glass-card p-5 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Receipt className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{inv.customers?.full_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />{Number(inv.amount).toFixed(2)} {inv.currency}
                </p>
              </div>
              <StatusBadge status={inv.status} />
              <div className="flex gap-1">
                {inv.status === 'draft' && <Button size="sm" variant="outline" onClick={() => markAs(inv.id, 'sent')}>Send</Button>}
                {inv.status === 'sent' && <Button size="sm" variant="outline" onClick={() => markAs(inv.id, 'paid')}>Mark Paid</Button>}
                {(inv.status === 'draft' || inv.status === 'sent') && <Button size="sm" variant="ghost" onClick={() => markAs(inv.id, 'void')}>Void</Button>}
              </div>
            </div>
          ))}
          {invoices.length === 0 && !loading && (
            <div className="text-center py-16 text-muted-foreground">No invoices yet.</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
