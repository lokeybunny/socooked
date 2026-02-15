import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Plus, Receipt, DollarSign, Hash, Calendar, Trash2, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<any>(null);
  const [form, setForm] = useState({
    customer_id: '',
    currency: 'USD',
    due_date: '',
    notes: '',
    tax_rate: '0',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);

  const load = async () => {
    const [{ data: inv }, { data: cust }] = await Promise.all([
      supabase.from('invoices').select('*, customers(full_name, email)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name, email'),
    ]);
    setInvoices(inv || []);
    setCustomers(cust || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
  const taxAmount = subtotal * (parseFloat(form.tax_rate) || 0) / 100;
  const total = subtotal + taxAmount;

  const addLine = () => setLineItems([...lineItems, { description: '', quantity: 1, unit_price: 0 }]);
  const removeLine = (i: number) => setLineItems(lineItems.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    (updated[i] as any)[field] = value;
    setLineItems(updated);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lineItems.filter(li => li.description.trim());
    if (validLines.length === 0) { toast.error('Add at least one line item'); return; }

    const { error } = await supabase.from('invoices').insert([{
      customer_id: form.customer_id,
      amount: total,
      subtotal,
      tax_rate: parseFloat(form.tax_rate) || 0,
      currency: form.currency,
      due_date: form.due_date || null,
      notes: form.notes || null,
      line_items: validLines as unknown as any,
      status: 'draft',
      provider: 'manual',
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success('Invoice created');
    setDialogOpen(false);
    setForm({ customer_id: '', currency: 'USD', due_date: '', notes: '', tax_rate: '0' });
    setLineItems([{ description: '', quantity: 1, unit_price: 0 }]);
    load();
  };

  const markAs = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === 'sent') updates.sent_at = new Date().toISOString();
    if (status === 'paid') updates.paid_at = new Date().toISOString();
    await supabase.from('invoices').update(updates).eq('id', id);
    toast.success(`Invoice marked as ${status}`);
    setDetailInvoice(null);
    load();
  };

  const paidTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
  const outstandingTotal = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + Number(i.amount), 0);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <p className="text-muted-foreground text-sm mt-1">{invoices.length} invoices</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Invoice</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-5">
                {/* Customer & Currency */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer *</Label>
                    <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="AUD">AUD</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Due Date & Tax */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tax Rate (%)</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Line Items</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Add</Button>
                  </div>
                  <div className="space-y-2">
                    {lineItems.map((li, i) => (
                      <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end">
                        <Input placeholder="Description" value={li.description} onChange={e => updateLine(i, 'description', e.target.value)} />
                        <Input type="number" min="1" placeholder="Qty" value={li.quantity} onChange={e => updateLine(i, 'quantity', Number(e.target.value))} />
                        <Input type="number" step="0.01" min="0" placeholder="Price" value={li.unit_price} onChange={e => updateLine(i, 'unit_price', Number(e.target.value))} />
                        {lineItems.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-10 w-8" onClick={() => removeLine(i)}>
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="border-t border-border pt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">${subtotal.toFixed(2)}</span></div>
                  {parseFloat(form.tax_rate) > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Tax ({form.tax_rate}%)</span><span className="font-medium">${taxAmount.toFixed(2)}</span></div>
                  )}
                  <div className="flex justify-between text-base font-bold"><span>Total</span><span>${total.toFixed(2)}</span></div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes / Memo</Label>
                  <Textarea placeholder="Payment terms, thank you note, etc." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>

                <Button type="submit" className="w-full" disabled={!form.customer_id || lineItems.every(li => !li.description.trim())}>Create Invoice</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Invoiced</p>
            <p className="text-xl font-bold text-foreground">${invoices.reduce((s, i) => s + Number(i.amount), 0).toFixed(2)}</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Paid</p>
            <p className="text-xl font-bold text-primary">${paidTotal.toFixed(2)}</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
            <p className="text-xl font-bold text-destructive">${outstandingTotal.toFixed(2)}</p>
          </div>
        </div>

        {/* Invoice List */}
        <div className="space-y-3">
          {invoices.map(inv => (
            <div
              key={inv.id}
              className="glass-card p-5 flex items-center gap-4 cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all"
              onClick={() => setDetailInvoice(inv)}
            >
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{inv.invoice_number || '—'}</p>
                  <span className="text-xs text-muted-foreground">·</span>
                  <p className="text-sm text-foreground truncate">{inv.customers?.full_name}</p>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />{Number(inv.amount).toFixed(2)} {inv.currency}
                  </p>
                  {inv.due_date && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />Due {format(new Date(inv.due_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
              <StatusBadge status={inv.status} />
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                {inv.status === 'draft' && <Button size="sm" variant="outline" onClick={() => markAs(inv.id, 'sent')}><Send className="h-3 w-3 mr-1" />Send</Button>}
                {inv.status === 'sent' && <Button size="sm" variant="outline" onClick={() => markAs(inv.id, 'paid')}>Mark Paid</Button>}
                {(inv.status === 'draft' || inv.status === 'sent') && <Button size="sm" variant="ghost" onClick={() => markAs(inv.id, 'void')}>Void</Button>}
              </div>
            </div>
          ))}
          {invoices.length === 0 && !loading && (
            <div className="text-center py-16 text-muted-foreground">No invoices yet.</div>
          )}
        </div>

        {/* Detail Modal */}
        <Dialog open={!!detailInvoice} onOpenChange={open => !open && setDetailInvoice(null)}>
          <DialogContent className="max-w-lg">
            {detailInvoice && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    {detailInvoice.invoice_number || 'Invoice'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{detailInvoice.customers?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{detailInvoice.customers?.email}</p>
                    </div>
                    <StatusBadge status={detailInvoice.status} />
                  </div>

                  {/* Line Items Table */}
                  {Array.isArray(detailInvoice.line_items) && detailInvoice.line_items.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2 font-medium text-muted-foreground">Item</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">Qty</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">Price</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detailInvoice.line_items as LineItem[]).map((li, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="p-2">{li.description}</td>
                              <td className="p-2 text-right">{li.quantity}</td>
                              <td className="p-2 text-right">${Number(li.unit_price).toFixed(2)}</td>
                              <td className="p-2 text-right font-medium">${(li.quantity * li.unit_price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${Number(detailInvoice.subtotal || detailInvoice.amount).toFixed(2)}</span></div>
                    {Number(detailInvoice.tax_rate) > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Tax ({detailInvoice.tax_rate}%)</span><span>${(Number(detailInvoice.subtotal || 0) * Number(detailInvoice.tax_rate) / 100).toFixed(2)}</span></div>
                    )}
                    <div className="flex justify-between text-base font-bold border-t border-border pt-1">
                      <span>Total</span><span>${Number(detailInvoice.amount).toFixed(2)} {detailInvoice.currency}</span>
                    </div>
                  </div>

                  {detailInvoice.due_date && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />Due {format(new Date(detailInvoice.due_date), 'MMMM d, yyyy')}
                    </p>
                  )}

                  {detailInvoice.notes && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm">{detailInvoice.notes}</p>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Created: {format(new Date(detailInvoice.created_at), 'MMM d, yyyy h:mm a')}</p>
                    {detailInvoice.sent_at && <p>Sent: {format(new Date(detailInvoice.sent_at), 'MMM d, yyyy h:mm a')}</p>}
                    {detailInvoice.paid_at && <p>Paid: {format(new Date(detailInvoice.paid_at), 'MMM d, yyyy h:mm a')}</p>}
                  </div>

                  <div className="flex gap-2">
                    {detailInvoice.status === 'draft' && <Button className="flex-1" onClick={() => markAs(detailInvoice.id, 'sent')}><Send className="h-4 w-4 mr-2" />Send Invoice</Button>}
                    {detailInvoice.status === 'sent' && <Button className="flex-1" onClick={() => markAs(detailInvoice.id, 'paid')}>Mark as Paid</Button>}
                    {(detailInvoice.status === 'draft' || detailInvoice.status === 'sent') && (
                      <Button variant="ghost" onClick={() => markAs(detailInvoice.id, 'void')}>Void</Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
