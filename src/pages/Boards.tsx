import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, LayoutGrid, User } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';

export default function Boards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const categoryGate = useCategoryGate();
  const [boards, setBoards] = useState<any[]>([]);
  const [allBoards, setAllBoards] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('none');

  const loadAll = async () => {
    const [boardsRes, customersRes] = await Promise.all([
      supabase.from('boards').select('*, lists(count), customers(full_name)').order('created_at'),
      supabase.from('customers').select('id, full_name').order('full_name'),
    ]);
    setAllBoards(boardsRes.data || []);
    setCustomers(customersRes.data || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (categoryGate.selectedCategory) {
      setBoards(allBoards.filter(b => (b.category || 'other') === categoryGate.selectedCategory));
    } else {
      setBoards(allBoards);
    }
  }, [categoryGate.selectedCategory, allBoards]);

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allBoards.filter(b => (b.category || 'other') === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('boards').insert({
      name,
      owner_id: user?.id,
      visibility: 'team',
      category: categoryGate.selectedCategory,
      customer_id: selectedCustomerId === 'none' ? null : selectedCustomerId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Board created');
    setDialogOpen(false);
    setName('');
    setSelectedCustomerId('none');
    loadAll();
  };

  return (
    <AppLayout>
      <CategoryGate title="Boards" {...categoryGate} totalCount={allBoards.length} countLabel="boards" categoryCounts={categoryCounts}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">{boards.length} boards</p>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setName(''); setSelectedCustomerId('none'); } }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Board</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Board</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Board Name *</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Board name" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                      <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No client</SelectItem>
                        {customers.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">Create</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map(b => (
              <button
                key={b.id}
                onClick={() => navigate(`/boards/${b.id}`)}
                className="glass-card p-6 text-left hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <LayoutGrid className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{b.name}</h3>
                    {b.customers?.full_name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="h-3 w-3" />
                        {b.customers.full_name}
                      </p>
                    )}
                  </div>
                </div>
                {b.description && <p className="text-sm text-muted-foreground line-clamp-2">{b.description}</p>}
              </button>
            ))}
            {boards.length === 0 && !loading && (
              <div className="col-span-full text-center py-16 text-muted-foreground">No boards yet. Create your first board or let Clawd Bot create one!</div>
            )}
          </div>
        </div>
      </CategoryGate>
    </AppLayout>
  );
}
