import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';

export default function Boards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const categoryGate = useCategoryGate();
  const [boards, setBoards] = useState<any[]>([]);
  const [allBoards, setAllBoards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');

  const loadAll = async () => {
    const { data } = await supabase.from('boards').select('*, lists(count)').order('created_at');
    setAllBoards(data || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (categoryGate.selectedCategory) {
      setBoards(allBoards.filter(b => b.category === categoryGate.selectedCategory));
    } else {
      setBoards(allBoards);
    }
  }, [categoryGate.selectedCategory, allBoards]);

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allBoards.filter(b => b.category === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('boards').insert({
      name,
      owner_id: user?.id,
      visibility: 'team',
      category: categoryGate.selectedCategory,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Board created');
    setDialogOpen(false);
    setName('');
    loadAll();
  };

  return (
    <AppLayout>
      <CategoryGate title="Boards" {...categoryGate} totalCount={allBoards.length} countLabel="boards" categoryCounts={categoryCounts}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">{boards.length} boards</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Board</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Board</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Board name" required />
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
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{b.name}</h3>
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
