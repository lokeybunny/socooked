import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Calendar, ChevronsUpDown, Check } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { ProjectDetailHub } from '@/components/projects/ProjectDetailHub';
import { cn } from '@/lib/utils';

const projectStatuses = ['planned', 'active', 'blocked', 'completed', 'archived'] as const;

export default function Projects() {
  const categoryGate = useCategoryGate();
  const [projects, setProjects] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailProject, setDetailProject] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadAll = async () => {
    const { data } = await supabase.from('projects').select('*, customers(full_name, email, phone, company)').order('created_at', { ascending: false });
    setAllProjects(data || []);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name, email, category');
    setCustomers(data || []);
  };

  useEffect(() => { loadAll(); loadCustomers(); }, []);

  const validIds = SERVICE_CATEGORIES.map(c => c.id);
  const normCat = (c: string | null) => (c && validIds.includes(c) ? c : 'other');

  useEffect(() => {
    if (categoryGate.selectedCategory) {
      setProjects(allProjects.filter(p => normCat(p.category) === categoryGate.selectedCategory));
    } else {
      setProjects(allProjects);
    }
  }, [categoryGate.selectedCategory, allProjects]);

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allProjects.filter(p => normCat(p.category) === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

  const catLabelMap: Record<string, string> = {
    'digital-services': 'Digital Services',
    'brick-and-mortar': 'Brick & Mortar',
    'digital-ecommerce': 'Digital E-Commerce',
    'food-and-beverage': 'Food & Beverage',
    'mobile-services': 'Mobile Services',
  };

  const handleCreateFromCustomer = async () => {
    if (!selectedCustomerId) { toast.error('Please select a customer'); return; }
    setCreating(true);
    const cust = customers.find(c => c.id === selectedCustomerId);
    if (!cust) { toast.error('Customer not found'); setCreating(false); return; }

    const category = normCat(cust.category);
    const title = `${cust.full_name} — ${catLabelMap[category] || 'Other'}`;

    // Check if active project already exists
    const { data: existing } = await supabase.from('projects')
      .select('id')
      .eq('customer_id', cust.id)
      .eq('category', category)
      .not('status', 'in', '("completed","archived")')
      .limit(1);

    if (existing && existing.length > 0) {
      toast.error('An active project already exists for this customer and category');
      setCreating(false);
      return;
    }

    const { error } = await supabase.from('projects').insert([{
      title,
      customer_id: cust.id,
      category,
      status: 'active',
      priority: 'medium',
      description: `Project for ${cust.full_name}.`,
    }]);

    if (error) { toast.error(error.message); setCreating(false); return; }
    toast.success('Project created');
    setDialogOpen(false);
    setSelectedCustomerId('');
    setCreating(false);
    loadAll();
  };

  

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('projects').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Project deleted');
    setDeleteId(null);
    setDetailProject(null);
    loadAll();
  };

  return (
    <AppLayout>
      <CategoryGate title="Projects" {...categoryGate} pageKey="projects" totalCount={allProjects.length} countLabel="projects" categoryCounts={categoryCounts}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">{projects.length} projects</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Project</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px]">
                <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Select a customer to auto-create a project based on their category.</p>
                  <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {selectedCustomerId
                          ? customers.find(c => c.id === selectedCustomerId)?.full_name || 'Select customer'
                          : 'Select customer...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search customers..." />
                        <CommandList>
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup>
                            {customers.map(c => (
                              <CommandItem key={c.id} value={`${c.full_name} ${c.email || ''}`} onSelect={() => { setSelectedCustomerId(c.id); setCustomerPickerOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", selectedCustomerId === c.id ? "opacity-100" : "opacity-0")} />
                                <div>
                                  <p className="text-sm">{c.full_name}</p>
                                  {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedCustomerId && (() => {
                    const cust = customers.find(c => c.id === selectedCustomerId);
                    if (!cust) return null;
                    const cat = normCat(cust.category);
                    return (
                      <div className="glass-card p-3 text-sm space-y-1">
                        <p className="font-medium text-foreground">{cust.full_name} — {catLabelMap[cat] || 'Other'}</p>
                        <p className="text-xs text-muted-foreground">Category: {catLabelMap[cat] || 'Other'}</p>
                        <p className="text-xs text-muted-foreground">Status: Active · Priority: Medium</p>
                      </div>
                    );
                  })()}
                  <Button onClick={handleCreateFromCustomer} disabled={!selectedCustomerId || creating} className="w-full">
                    {creating ? 'Creating...' : 'Create Project'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map(p => (
              <div
                key={p.id}
                className="glass-card p-5 hover:shadow-md transition-shadow cursor-pointer space-y-3"
                onDoubleClick={() => setDetailProject(p)}
              >
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

      <ProjectDetailHub
        project={detailProject}
        open={!!detailProject}
        onClose={() => setDetailProject(null)}
        onDelete={(id) => setDeleteId(id)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this project. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
