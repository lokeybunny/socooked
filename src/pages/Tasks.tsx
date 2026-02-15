import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Calendar, ChevronDown, ChevronRight, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const taskStatuses = ['todo', 'doing', 'blocked', 'done'] as const;
const priorities = ['low', 'medium', 'high', 'urgent'] as const;

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ title: '', project_id: '', status: 'todo', priority: 'medium', due_date: '' });

  const load = async () => {
    const [t, p, c] = await Promise.all([
      supabase.from('tasks').select('*, projects(title, customer_id)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, title, customer_id').order('title'),
      supabase.from('customers').select('id, full_name').order('full_name'),
    ]);
    setTasks(t.data || []);
    setProjects(p.data || []);
    setCustomers(c.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('tasks').insert([{
      title: form.title,
      project_id: form.project_id,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success('Task created');
    setDialogOpen(false);
    setForm({ title: '', project_id: '', status: 'todo', priority: 'medium', due_date: '' });
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('tasks').update({ status }).eq('id', id);
    load();
  };

  const toggleClient = (clientId: string) => {
    setCollapsedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  // Build customer map
  const customerMap = new Map(customers.map(c => [c.id, c.full_name]));

  // Group tasks by customer_id (via project)
  const tasksByClient = new Map<string, { name: string; tasks: any[] }>();
  const unassignedTasks: any[] = [];

  tasks.forEach(task => {
    const customerId = task.projects?.customer_id;
    if (customerId && customerMap.has(customerId)) {
      if (!tasksByClient.has(customerId)) {
        tasksByClient.set(customerId, { name: customerMap.get(customerId)!, tasks: [] });
      }
      tasksByClient.get(customerId)!.tasks.push(task);
    } else {
      unassignedTasks.push(task);
    }
  });

  // Sort client groups by name
  const sortedClientGroups = [...tasksByClient.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name)
  );

  // Add unassigned at the end if any
  if (unassignedTasks.length > 0) {
    sortedClientGroups.push(['unassigned', { name: 'No Client', tasks: unassignedTasks }]);
  }

  const StatusKanban = ({ clientTasks }: { clientTasks: any[] }) => {
    const grouped = taskStatuses.reduce((acc, s) => {
      acc[s] = clientTasks.filter(t => t.status === s);
      return acc;
    }, {} as Record<string, any[]>);

    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {taskStatuses.map(status => (
          <div key={status} className="min-w-[220px] flex-1">
            <div className="flex items-center gap-2 mb-2 px-1">
              <StatusBadge status={status} />
              <span className="text-xs text-muted-foreground">({grouped[status]?.length || 0})</span>
            </div>
            <div className="space-y-2">
              {(grouped[status] || []).map((task: any) => (
                <div key={task.id} className="glass-card p-3 hover:shadow-md transition-shadow cursor-pointer">
                  <p className="text-sm font-medium text-foreground mb-1">{task.title}</p>
                  <p className="text-xs text-muted-foreground mb-2">{task.projects?.title || '—'}</p>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={task.priority} className={`priority-${task.priority}`} />
                    {task.due_date && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />{new Date(task.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {(grouped[status] || []).length === 0 && (
                <div className="border-2 border-dashed border-border rounded-xl p-4 text-center text-xs text-muted-foreground">
                  No tasks
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
            <p className="text-muted-foreground text-sm mt-1">{tasks.length} tasks · {sortedClientGroups.length} clients</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
                <div className="space-y-2">
                  <Label>Project *</Label>
                  <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{priorities.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
                </div>
                <Button type="submit" className="w-full" disabled={!form.project_id}>Create Task</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Client-grouped kanban */}
        <div className="space-y-4">
          {sortedClientGroups.map(([clientId, { name, tasks: clientTasks }]) => {
            const isCollapsed = collapsedClients.has(clientId);
            return (
              <div key={clientId} className="glass-card rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleClient(clientId)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <User className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-foreground">{name}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{clientTasks.length} tasks</span>
                </button>
                {!isCollapsed && (
                  <div className="px-4 pb-4">
                    <StatusKanban clientTasks={clientTasks} />
                  </div>
                )}
              </div>
            );
          })}
          {sortedClientGroups.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              <p>No tasks yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
