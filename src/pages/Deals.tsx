import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, DollarSign, Trash2, Calendar, Percent, User } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { format } from 'date-fns';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const stages = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;

function DealCard({ deal, onDoubleClick }: { deal: any; onDoubleClick: (d: any) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={`glass-card p-4 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
      onDoubleClick={() => onDoubleClick(deal)}>
      <p className="text-sm font-medium text-foreground mb-1">{deal.title}</p>
      <p className="text-xs text-muted-foreground mb-2">{deal.customers?.full_name || 'Unknown'}</p>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-foreground">
          <DollarSign className="h-3 w-3" />{Number(deal.deal_value).toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">{deal.probability}%</span>
      </div>
    </div>
  );
}

function StageColumn({ stage, deals, onDoubleClick }: { stage: string; deals: any[]; onDoubleClick: (d: any) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={`min-w-[280px] flex-1 transition-colors rounded-xl ${isOver ? 'bg-accent/30' : ''}`}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <StatusBadge status={stage} />
          <span className="text-xs text-muted-foreground">({deals.length})</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          ${deals.reduce((s: number, d: any) => s + Number(d.deal_value || 0), 0).toLocaleString()}
        </span>
      </div>
      <div className="space-y-2 min-h-[80px]">
        {deals.map((deal: any) => (
          <DealCard key={deal.id} deal={deal} onDoubleClick={onDoubleClick} />
        ))}
        {deals.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center text-xs text-muted-foreground">
            No deals
          </div>
        )}
      </div>
    </div>
  );
}

export default function Deals() {
  const categoryGate = useCategoryGate();
  const [deals, setDeals] = useState<any[]>([]);
  const [allDeals, setAllDeals] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState({ title: '', customer_id: '', stage: 'new', deal_value: '0', probability: '10' });

  const loadAll = async () => {
    const { data } = await supabase.from('deals').select('*, customers(full_name)').order('created_at', { ascending: false });
    setAllDeals(data || []);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name').order('full_name');
    setCustomers(data || []);
  };

  useEffect(() => { loadAll(); loadCustomers(); }, []);

  useEffect(() => {
    if (categoryGate.selectedCategory) {
      setDeals(allDeals.filter(d => (d.category || 'other') === categoryGate.selectedCategory));
    } else {
      setDeals(allDeals);
    }
  }, [categoryGate.selectedCategory, allDeals]);

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allDeals.filter(d => (d.category || 'other') === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('deals').insert([{
      title: form.title,
      customer_id: form.customer_id,
      stage: form.stage,
      deal_value: parseFloat(form.deal_value) || 0,
      probability: parseInt(form.probability) || 10,
      category: categoryGate.selectedCategory,
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal created');
    setDialogOpen(false);
    setForm({ title: '', customer_id: '', stage: 'new', deal_value: '0', probability: '10' });
    loadAll();
  };

  const handleDelete = async (dealId: string) => {
    const { error } = await supabase.from('deals').delete().eq('id', dealId);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal deleted');
    setDeleteTarget(null);
    setSelectedDeal(null);
    loadAll();
  };

  const grouped = stages.reduce((acc, stage) => {
    acc[stage] = deals.filter(d => d.stage === stage);
    return acc;
  }, {} as Record<string, any[]>);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeDeal, setActiveDeal] = useState<any>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals.find(d => d.id === event.active.id);
    setActiveDeal(deal || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = active.id as string;
    const newStage = over.id as string;
    const deal = deals.find(d => d.id === dealId);
    if (!deal || deal.stage === newStage) return;
    const oldStage = deal.stage;

    // Optimistic update
    setAllDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d));
    const { error } = await supabase.from('deals').update({ stage: newStage }).eq('id', dealId);
    if (error) {
      toast.error(error.message);
      loadAll();
    } else {
      toast.success(`Moved to ${newStage}`);
      // Log stage transition for Telegram notification
      await supabase.from('activity_log').insert({
        entity_type: 'deal',
        entity_id: dealId,
        action: 'updated',
        meta: {
          title: deal.title,
          customer_name: (deal as any).customers?.full_name || '',
          from_stage: oldStage,
          to_stage: newStage,
        },
      });
    }
  };

  return (
    <AppLayout>
      <CategoryGate title="Deals Pipeline" {...categoryGate} pageKey="deals" totalCount={allDeals.length} countLabel="deals" categoryCounts={categoryCounts}>
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

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {stages.map(stage => (
                <StageColumn key={stage} stage={stage} deals={grouped[stage] || []} onDoubleClick={setSelectedDeal} />
              ))}
            </div>
            <DragOverlay>
              {activeDeal && (
                <div className="glass-card p-4 shadow-lg opacity-90 w-[280px]">
                  <p className="text-sm font-medium text-foreground mb-1">{activeDeal.title}</p>
                  <p className="text-xs text-muted-foreground mb-2">{activeDeal.customers?.full_name || 'Unknown'}</p>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                      <DollarSign className="h-3 w-3" />{Number(activeDeal.deal_value).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">{activeDeal.probability}%</span>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Deal Detail Modal */}
        <Dialog open={!!selectedDeal} onOpenChange={(open) => { if (!open) setSelectedDeal(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{selectedDeal?.title}</DialogTitle></DialogHeader>
            {selectedDeal && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedDeal.customers?.full_name || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>${Number(selectedDeal.deal_value).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedDeal.probability}% probability</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(selectedDeal.created_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Stage:</span>
                  <StatusBadge status={selectedDeal.stage} />
                </div>
                {selectedDeal.expected_close_date && (
                  <p className="text-sm text-muted-foreground">Expected close: {format(new Date(selectedDeal.expected_close_date), 'MMM d, yyyy')}</p>
                )}
                <div className="pt-2 border-t border-border">
                  <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(selectedDeal)}>
                    <Trash2 className="h-4 w-4 mr-2" />Delete Deal
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteTarget && handleDelete(deleteTarget.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CategoryGate>
    </AppLayout>
  );
}
