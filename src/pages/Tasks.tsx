import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Calendar, ChevronDown, ChevronRight, User, Bot, Code, Share2, Headphones, Palette, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';

const BOT_AGENTS = [
  { id: 'receptionist', label: 'Receptionist Bot', icon: Headphones, description: 'Emails, follow-ups, texts & updates' },
  { id: 'web-designer', label: 'Web Designer Bot', icon: Palette, description: 'V0.DEV API — Website generation via CLAWD Main' },
  { id: 'social_media', label: 'Social Media Bot', icon: Share2, description: 'Content generation & posting' },
] as const;

const botStatuses = ['queued', 'in_progress', 'done', 'failed'] as const;
const botPriorities = ['low', 'medium', 'high'] as const;

// Legacy task stuff
const taskStatuses = ['todo', 'doing', 'blocked', 'done'] as const;
const priorities = ['low', 'medium', 'high', 'urgent'] as const;

export default function Tasks() {
  const categoryGate = useCategoryGate();
  // Bot tasks
  const [botTasks, setBotTasks] = useState<any[]>([]);
  const [botDialogOpen, setBotDialogOpen] = useState(false);
  const [botForm, setBotForm] = useState({ title: '', description: '', bot_agent: 'receptionist', priority: 'medium', due_date: '' });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'bot' | 'manual'; title: string } | null>(null);

  // Legacy tasks
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ title: '', project_id: '', status: 'todo', priority: 'medium', due_date: '' });

  const loadBotTasks = async () => {
    const { data } = await supabase.from('bot_tasks').select('*').order('created_at', { ascending: false });
    setBotTasks(data || []);
  };

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

  useEffect(() => { load(); loadBotTasks(); }, []);

  // Bot task CRUD
  const handleCreateBotTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('bot_tasks').insert({
      title: botForm.title,
      description: botForm.description || null,
      bot_agent: botForm.bot_agent,
      priority: botForm.priority,
      due_date: botForm.due_date || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Bot task queued');
    setBotDialogOpen(false);
    setBotForm({ title: '', description: '', bot_agent: 'receptionist', priority: 'medium', due_date: '' });
    loadBotTasks();
  };

  const updateBotStatus = async (id: string, status: string) => {
    await supabase.from('bot_tasks').update({ status }).eq('id', id);
    loadBotTasks();
  };

  const handleDeleteTask = async () => {
    if (!deleteTarget) return;
    const table = deleteTarget.type === 'bot' ? 'bot_tasks' : 'tasks';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Task deleted');
    setDeleteTarget(null);
    if (deleteTarget.type === 'bot') loadBotTasks(); else load();
  };

  // Legacy task CRUD
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

  const sortedClientGroups = [...tasksByClient.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name)
  );
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
                <div key={task.id} className="glass-card p-3 hover:shadow-md transition-shadow cursor-pointer relative group/card">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: task.id, type: 'manual', title: task.title }); }}
                    className="absolute top-2 right-2 h-5 w-5 rounded-full bg-destructive/10 text-destructive flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-destructive/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <p className="text-sm font-medium text-foreground mb-1 pr-6">{task.title}</p>
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

  // Bot task kanban for a specific agent
  const BotKanban = ({ agent }: { agent: string }) => {
    const agentTasks = botTasks.filter(t => t.bot_agent === agent);
    const grouped = botStatuses.reduce((acc, s) => {
      acc[s] = agentTasks.filter(t => t.status === s);
      return acc;
    }, {} as Record<string, any[]>);

    const statusLabels: Record<string, string> = {
      queued: 'Queued',
      in_progress: 'In Progress',
      done: 'Done',
      failed: 'Failed',
    };

    return (
      <div className="space-y-4">
        <div className="flex gap-4 overflow-x-auto pb-2">
          {botStatuses.map(status => (
            <div key={status} className="min-w-[220px] flex-1">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className={cn(
                  "text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                  status === 'queued' && 'bg-muted text-muted-foreground',
                  status === 'in_progress' && 'bg-primary/10 text-primary',
                  status === 'done' && 'bg-green-500/10 text-green-600',
                  status === 'failed' && 'bg-destructive/10 text-destructive',
                )}>{statusLabels[status]}</span>
                <span className="text-xs text-muted-foreground">({grouped[status]?.length || 0})</span>
              </div>
              <div className="space-y-2">
                {(grouped[status] || []).map((task: any) => (
                  <div key={task.id} className="glass-card p-3 hover:shadow-md transition-shadow space-y-2 relative group/card">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: task.id, type: 'bot', title: task.title }); }}
                      className="absolute top-2 right-2 h-5 w-5 rounded-full bg-destructive/10 text-destructive flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-destructive/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <p className="text-sm font-medium text-foreground pr-6">{task.title}</p>
                    {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase",
                        task.priority === 'high' && 'bg-destructive/10 text-destructive',
                        task.priority === 'medium' && 'bg-primary/10 text-primary',
                        task.priority === 'low' && 'bg-muted text-muted-foreground',
                      )}>{task.priority}</span>
                      {task.due_date && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />{new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {status !== 'done' && status !== 'failed' && (
                      <div className="flex gap-1 pt-1">
                        {status === 'queued' && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => updateBotStatus(task.id, 'in_progress')}>Start</Button>
                        )}
                        {status === 'in_progress' && (
                          <>
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => updateBotStatus(task.id, 'done')}>Complete</Button>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] text-destructive" onClick={() => updateBotStatus(task.id, 'failed')}>Failed</Button>
                          </>
                        )}
                      </div>
                    )}
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
      </div>
    );
  };

  return (
    <AppLayout>
      <CategoryGate title="Tasks" {...categoryGate} pageKey="tasks" totalCount={botTasks.length + tasks.length} countLabel="tasks" categoryCounts={SERVICE_CATEGORIES.reduce((acc, cat) => { acc[cat.id] = tasks.filter(t => (t.category || 'other') === cat.id).length + botTasks.filter(t => (t.meta?.category || 'other') === cat.id).length; return acc; }, {} as Record<string, number>)}>
        <div className="space-y-6">
          <p className="text-muted-foreground text-sm">
            {botTasks.length} bot tasks · {tasks.length} manual tasks
          </p>

        <Tabs defaultValue="receptionist" className="w-full">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList>
              {BOT_AGENTS.map(bot => {
                const Icon = bot.icon;
                const count = botTasks.filter(t => t.bot_agent === bot.id).length;
                return (
                  <TabsTrigger key={bot.id} value={bot.id} className="gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{bot.label}</span>
                    {count > 0 && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{count}</span>}
                  </TabsTrigger>
                );
              })}
              <TabsTrigger value="manual" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Manual Tasks</span>
              </TabsTrigger>
            </TabsList>

            <Dialog open={botDialogOpen} onOpenChange={setBotDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />Queue Task</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Queue Bot Task</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateBotTask} className="space-y-4">
                  <div className="space-y-2"><Label>Title *</Label><Input value={botForm.title} onChange={e => setBotForm({ ...botForm, title: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Description</Label><Input value={botForm.description} onChange={e => setBotForm({ ...botForm, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Assign to Bot</Label>
                      <Select value={botForm.bot_agent} onValueChange={v => setBotForm({ ...botForm, bot_agent: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BOT_AGENTS.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={botForm.priority} onValueChange={v => setBotForm({ ...botForm, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {botPriorities.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2"><Label>Deadline</Label><Input type="datetime-local" value={botForm.due_date} onChange={e => setBotForm({ ...botForm, due_date: e.target.value })} /></div>
                  <Button type="submit" className="w-full">Queue Task</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {BOT_AGENTS.map(bot => (
            <TabsContent key={bot.id} value={bot.id}>
              <div className="glass-card rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <bot.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{bot.label}</h3>
                    <p className="text-xs text-muted-foreground">{bot.description}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {botTasks.filter(t => t.bot_agent === bot.id && t.status === 'queued').length} queued
                    </span>
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Ready — awaiting API connection" />
                  </div>
                </div>
              </div>
              <BotKanban agent={bot.id} />
            </TabsContent>
          ))}

          <TabsContent value="manual">
            <div className="flex items-center justify-end mb-4">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-2" />New Task</Button>
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
          </TabsContent>
        </Tabs>
        </div>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Task</AlertDialogTitle>
              <AlertDialogDescription>
                Delete "{deleteTarget?.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CategoryGate>
    </AppLayout>
  );
}
