import { useEffect, useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Plus, Receipt, DollarSign, Hash, Calendar, Trash2, FileText, Send, Download, FileSpreadsheet, ChevronDown, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

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
    status: 'draft' as 'draft' | 'paid',
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

  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const validLines = lineItems.filter(li => li.description.trim());
    if (validLines.length === 0) { toast.error('Add at least one line item'); return; }

    // UI-level duplicate check: same customer + same amount in existing invoices
    const existingDupe = invoices.find(inv =>
      inv.customer_id === form.customer_id &&
      Number(inv.amount) === total &&
      ['draft', 'sent'].includes(inv.status)
    );
    if (existingDupe) {
      toast.error(`Duplicate detected: ${existingDupe.invoice_number || 'an invoice'} already exists for this customer with the same amount ($${total.toFixed(2)}).`);
      return;
    }

    setSubmitting(true);
    const isPaid = form.status === 'paid';
    const { error } = await supabase.from('invoices').insert([{
      customer_id: form.customer_id,
      amount: total,
      subtotal,
      tax_rate: parseFloat(form.tax_rate) || 0,
      currency: form.currency,
      due_date: form.due_date || null,
      notes: form.notes || null,
      line_items: validLines as unknown as any,
      status: isPaid ? 'paid' : 'draft',
      provider: 'manual',
      paid_at: isPaid ? new Date().toISOString() : null,
    }]);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Invoice created');
    setDialogOpen(false);
    setForm({ customer_id: '', currency: 'USD', due_date: '', notes: '', tax_rate: '0', status: 'draft' });
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

  const buildInvoiceHtml = (inv: any) => {
    const lineItems = Array.isArray(inv.line_items) ? inv.line_items as LineItem[] : [];
    const subtotalVal = Number(inv.subtotal || inv.amount);
    const taxRate = Number(inv.tax_rate || 0);
    const taxAmt = subtotalVal * taxRate / 100;
    const totalVal = Number(inv.amount);
    const customerName = inv.customers?.full_name || 'Customer';
    const invNum = inv.invoice_number || 'Invoice';
    const dueDateStr = inv.due_date ? format(new Date(inv.due_date), 'MMMM d, yyyy') : null;

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <h2 style="color:#1a1a1a;margin-bottom:4px;">${invNum}</h2>
        <p style="color:#666;margin-top:0;">Dear ${customerName},</p>
        <p>Please find your invoice details below:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Item</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">Qty</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">Price</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map(li => `
              <tr>
                <td style="padding:8px;border-bottom:1px solid #eee;">${li.description}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${li.quantity}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${Number(li.unit_price).toFixed(2)}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${(li.quantity * li.unit_price).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align:right;margin-top:8px;">
          <p style="margin:2px 0;color:#666;">Subtotal: <strong>$${subtotalVal.toFixed(2)}</strong></p>
          ${taxRate > 0 ? `<p style="margin:2px 0;color:#666;">Tax (${taxRate}%): <strong>$${taxAmt.toFixed(2)}</strong></p>` : ''}
          <p style="margin:8px 0 0;font-size:18px;font-weight:bold;color:#1a1a1a;">Total: $${totalVal.toFixed(2)} ${inv.currency}</p>
        </div>
        ${dueDateStr ? `<p style="margin-top:16px;color:#666;">Due Date: <strong>${dueDateStr}</strong></p>` : ''}
        ${inv.notes ? `<div style="margin-top:16px;padding:12px;background:#f9f9f9;border-radius:6px;"><p style="margin:0;color:#666;font-size:13px;">${inv.notes}</p></div>` : ''}
        <p style="margin-top:24px;color:#666;">Thank you for your business!</p>
      </div>
    `;
  };

  const sendInvoiceEmail = async (inv: any) => {
    const email = inv.customers?.email;
    if (!email) {
      toast.error('Customer has no email address');
      return;
    }

    const sending = toast.loading('Generating invoice PDF & sending...');
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `https://${projectId}.supabase.co/functions/v1/invoice-api?action=send-invoice`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoice_id: inv.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');

      toast.dismiss(sending);
      toast.success(`Invoice PDF emailed to ${email}`);
      setDetailInvoice(null);
      load();
    } catch (e: any) {
      toast.dismiss(sending);
      toast.error(e.message || 'Failed to send invoice email');
    }
  };

  const deleteInvoice = async (id: string) => {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Invoice deleted');
    setDetailInvoice(null);
    load();
  };

  const paidTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
  const outstandingTotal = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + Number(i.amount), 0);

  // Preview state
  const [previewInvoice, setPreviewInvoice] = useState<any>(null);
  const [previewHtml, setPreviewHtml] = useState('');

  const openPreview = (inv: any) => {
    setPreviewHtml(buildInvoiceHtml(inv));
    setPreviewInvoice(inv);
  };

  const confirmAndSend = async () => {
    if (!previewInvoice) return;
    setPreviewInvoice(null);
    await sendInvoiceEmail(previewInvoice);
  };

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRange, setExportRange] = useState('all');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  const monthOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i);
      options.push({
        label: format(d, 'MMMM yyyy'),
        value: format(d, 'yyyy-MM'),
      });
    }
    return options;
  }, []);

  const getExportData = useCallback(() => {
    let filtered = [...invoices];

    if (exportRange === 'month' && exportFrom) {
      const [y, m] = exportFrom.split('-').map(Number);
      const start = startOfMonth(new Date(y, m - 1));
      const end = endOfMonth(new Date(y, m - 1));
      filtered = filtered.filter(inv => {
        const d = parseISO(inv.created_at);
        return isWithinInterval(d, { start, end });
      });
    } else if (exportRange === 'range' && exportFrom && exportTo) {
      const [y1, m1] = exportFrom.split('-').map(Number);
      const [y2, m2] = exportTo.split('-').map(Number);
      const start = startOfMonth(new Date(y1, m1 - 1));
      const end = endOfMonth(new Date(y2, m2 - 1));
      filtered = filtered.filter(inv => {
        const d = parseISO(inv.created_at);
        return isWithinInterval(d, { start, end });
      });
    }

    return filtered.map(inv => ({
      'Invoice #': inv.invoice_number || '—',
      'Customer': inv.customers?.full_name || '—',
      'Email': inv.customers?.email || '—',
      'Status': inv.status,
      'Currency': inv.currency,
      'Subtotal': Number(inv.subtotal || 0).toFixed(2),
      'Tax Rate (%)': Number(inv.tax_rate || 0),
      'Total': Number(inv.amount).toFixed(2),
      'Due Date': inv.due_date ? format(new Date(inv.due_date), 'yyyy-MM-dd') : '',
      'Created': format(new Date(inv.created_at), 'yyyy-MM-dd'),
      'Sent': inv.sent_at ? format(new Date(inv.sent_at), 'yyyy-MM-dd') : '',
      'Paid': inv.paid_at ? format(new Date(inv.paid_at), 'yyyy-MM-dd') : '',
      'Notes': inv.notes || '',
    }));
  }, [invoices, exportRange, exportFrom, exportTo]);

  const exportCSV = useCallback(() => {
    const data = getExportData();
    if (data.length === 0) { toast.error('No invoices match the selected range'); return; }
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = String((row as any)[h]).replace(/"/g, '""');
        return `"${val}"`;
      }).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${exportRange === 'all' ? 'all' : exportFrom}${exportTo ? `-to-${exportTo}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} invoices as CSV`);
  }, [getExportData, exportRange, exportFrom, exportTo]);

  const exportExcel = useCallback(() => {
    const data = getExportData();
    if (data.length === 0) { toast.error('No invoices match the selected range'); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `invoices-${exportRange === 'all' ? 'all' : exportFrom}${exportTo ? `-to-${exportTo}` : ''}.xlsx`);
    toast.success(`Exported ${data.length} invoices as Excel`);
  }, [getExportData, exportRange, exportFrom, exportTo]);

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

                {/* Status */}
                <div className="space-y-2">
                  <Label>Invoice Status</Label>
                  <Select value={form.status} onValueChange={(v: 'draft' | 'paid') => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft — Send later</SelectItem>
                      <SelectItem value="paid">Already Paid</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.status === 'paid' && (
                    <p className="text-xs text-muted-foreground">This invoice will be recorded as paid immediately.</p>
                  )}
                </div>
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

        {/* Export Section */}
        <div className="glass-card p-5">
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Export Invoices</h2>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${exportOpen ? 'rotate-180' : ''}`} />
          </button>

          {exportOpen && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Date Range</Label>
                  <Select value={exportRange} onValueChange={v => { setExportRange(v); setExportFrom(''); setExportTo(''); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="month">Single Month</SelectItem>
                      <SelectItem value="range">Month Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(exportRange === 'month' || exportRange === 'range') && (
                  <div className="space-y-2">
                    <Label className="text-xs">{exportRange === 'range' ? 'From' : 'Month'}</Label>
                    <Select value={exportFrom} onValueChange={setExportFrom}>
                      <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                      <SelectContent>
                        {monthOptions.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {exportRange === 'range' && (
                  <div className="space-y-2">
                    <Label className="text-xs">To</Label>
                    <Select value={exportTo} onValueChange={setExportTo}>
                      <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                      <SelectContent>
                        {monthOptions.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{getExportData().length} invoice{getExportData().length !== 1 ? 's' : ''} match</span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportCSV} disabled={getExportData().length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={getExportData().length === 0}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Export Excel
                </Button>
              </div>
            </div>
          )}
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
                {inv.status === 'draft' && <Button size="sm" variant="outline" onClick={() => openPreview(inv)}><Eye className="h-3 w-3 mr-1" />Preview & Send</Button>}
                {inv.status === 'draft' && <Button size="sm" variant="outline" onClick={() => markAs(inv.id, 'paid')}>Mark Paid</Button>}
                {inv.status === 'sent' && <Button size="sm" variant="outline" onClick={() => markAs(inv.id, 'paid')}>Mark Paid</Button>}
                {(inv.status === 'draft' || inv.status === 'sent') && <Button size="sm" variant="ghost" onClick={() => markAs(inv.id, 'void')}>Void</Button>}
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteInvoice(inv.id)}><Trash2 className="h-3 w-3" /></Button>
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
                    {detailInvoice.status === 'draft' && <Button className="flex-1" onClick={() => { setDetailInvoice(null); openPreview(detailInvoice); }}><Eye className="h-4 w-4 mr-2" />Preview & Send</Button>}
                    {(detailInvoice.status === 'draft' || detailInvoice.status === 'sent') && <Button className="flex-1" variant="outline" onClick={() => markAs(detailInvoice.id, 'paid')}>Mark as Paid</Button>}
                    {(detailInvoice.status === 'draft' || detailInvoice.status === 'sent') && (
                      <Button variant="ghost" onClick={() => markAs(detailInvoice.id, 'void')}>Void</Button>
                    )}
                    <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteInvoice(detailInvoice.id)}>
                      <Trash2 className="h-4 w-4 mr-2" />Delete
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Invoice Email Preview */}
        <Dialog open={!!previewInvoice} onOpenChange={(open) => !open && setPreviewInvoice(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Email Preview — {previewInvoice?.invoice_number || 'Invoice'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <p><span className="font-medium text-foreground">To:</span> {previewInvoice?.customers?.email || 'No email'}</p>
                <p><span className="font-medium text-foreground">Subject:</span> Invoice {previewInvoice?.invoice_number || ''} from STU25</p>
              </div>
              <div className="border border-border rounded-lg p-4 bg-background">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewInvoice(null)}>Cancel</Button>
                <Button onClick={confirmAndSend} disabled={!previewInvoice?.customers?.email} className="gap-1.5">
                  <Send className="h-4 w-4" /> Send Invoice
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
