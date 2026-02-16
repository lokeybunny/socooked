import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate } from '@/components/CategoryGate';

const projectStatuses = ['planned', 'active', 'blocked', 'completed', 'archived'] as const;
const priorities = ['low', 'medium', 'high', 'urgent'] as const;

export default function Projects() {
  const categoryGate = useCategoryGate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', status: 'planned', priority: 'medium', due_date: '' });

  const load = async () => {
    const { data } = await supabase.from('projects').select('*, customers(full_name)').order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('projects').insert([{
      title: form.title,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success('Project created');
    setDialogOpen(false);
    setForm({ title: '', description: '', status: 'planned', priority: 'medium', due_date: '' });
    load();
  };

  return (
    <AppLayout>
      <CategoryGate title="Projects" {...categoryGate}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">{projects.length} projects</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Project</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Project</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{projectStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{priorities.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
                  <Button type="submit" className="w-full">Create Project</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map(p => (
              <div key={p.id} className="glass-card p-5 hover:shadow-md transition-shadow cursor-pointer space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-foreground line-clamp-1">{p.title}</h3>
                  <StatusBadge status={p.priority} className={`priority-${p.priority}`} />
                </div>
                {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                <div className="flex items-center justify-between">
                  <StatusBadge status={p.status} />
                  {p.due_date && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />{new Date(p.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {p.customers?.full_name && <p className="text-xs text-muted-foreground">Client: {p.customers.full_name}</p>}
              </div>
            ))}
            {projects.length === 0 && !loading && (
              <div className="col-span-full text-center py-16 text-muted-foreground">No projects yet. Create your first project!</div>
            )}
          </div>
        </div>
      </CategoryGate>
    </AppLayout>
  );
}
