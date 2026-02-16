import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate } from '@/components/CategoryGate';

const stages = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;

export default function Deals() {
  const categoryGate = useCategoryGate();
  const [deals, setDeals] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', customer_id: '', stage: 'new', deal_value: '0', probability: '10' });

  const loadDeals = async () => {
    const { data } = await supabase.from('deals').select('*, customers(full_name)').order('created_at', { ascending: false });
    setDeals(data || []);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name').order('full_name');
    setCustomers(data || []);
  };

  useEffect(() => { loadDeals(); loadCustomers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('deals').insert([{
      title: form.title,
      customer_id: form.customer_id,
      stage: form.stage,
      deal_value: parseFloat(form.deal_value) || 0,
      probability: parseInt(form.probability) || 10,
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal created');
    setDialogOpen(false);
    setForm({ title: '', customer_id: '', stage: 'new', deal_value: '0', probability: '10' });
    loadDeals();
  };

  const grouped = stages.reduce((acc, stage) => {
    acc[stage] = deals.filter(d => d.stage === stage);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <AppLayout>
      <CategoryGate title="Deals Pipeline" {...categoryGate}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">{deals.length} deals · ${deals.reduce((s, d) => s + Number(d.deal_value || 0), 0).toLocaleString()} total value</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Deal</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Deal</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
                  <div className="space-y-2">
                    <Label>Customer *</Label>
                    <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Value ($)</Label><Input type="number" value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Probability (%)</Label><Input type="number" min="0" max="100" value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Stage</Label>
                    <Select value={form.stage} onValueChange={v => setForm({ ...form, stage: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{stages.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={!form.customer_id}>Create Deal</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map(stage => (
              <div key={stage} className="min-w-[280px] flex-1">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={stage} />
                    <span className="text-xs text-muted-foreground">({grouped[stage]?.length || 0})</span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    ${(grouped[stage] || []).reduce((s: number, d: any) => s + Number(d.deal_value || 0), 0).toLocaleString()}
                  </span>
                </div>
                <div className="space-y-2">
                  {(grouped[stage] || []).map((deal: any) => (
                    <div key={deal.id} className="glass-card p-4 hover:shadow-md transition-shadow cursor-pointer">
                      <p className="text-sm font-medium text-foreground mb-1">{deal.title}</p>
                      <p className="text-xs text-muted-foreground mb-2">{deal.customers?.full_name || 'Unknown'}</p>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                          <DollarSign className="h-3 w-3" />{Number(deal.deal_value).toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground">{deal.probability}%</span>
                      </div>
                    </div>
                  ))}
                  {(grouped[stage] || []).length === 0 && (
                    <div className="border-2 border-dashed border-border rounded-xl p-6 text-center text-xs text-muted-foreground">
                      No deals
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CategoryGate>
    </AppLayout>
  );
}
