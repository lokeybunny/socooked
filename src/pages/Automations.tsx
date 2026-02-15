import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Zap, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const triggerTables = ['customers', 'deals', 'tasks', 'projects', 'content_assets'] as const;
const triggerEvents = ['INSERT', 'UPDATE', 'DELETE'] as const;

export default function Automations() {
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', trigger_event: 'INSERT', trigger_table: 'deals' });

  const load = async () => {
    const { data } = await supabase.from('automations').select('*').order('created_at', { ascending: false });
    setAutomations(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('automations').insert([form]);
    if (error) { toast.error(error.message); return; }
    toast.success('Automation created');
    setDialogOpen(false);
    setForm({ name: '', trigger_event: 'INSERT', trigger_table: 'deals' });
    load();
  };

  const toggleEnabled = async (id: string, currentValue: boolean) => {
    await supabase.from('automations').update({ is_enabled: !currentValue }).eq('id', id);
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Automations</h1>
            <p className="text-muted-foreground text-sm mt-1">{automations.length} automations</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Automation</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Automation</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Deal Won → Create Project" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>When (Event)</Label>
                    <Select value={form.trigger_event} onValueChange={v => setForm({ ...form, trigger_event: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{triggerEvents.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>On (Table)</Label>
                    <Select value={form.trigger_table} onValueChange={v => setForm({ ...form, trigger_table: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{triggerTables.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full">Create Automation</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {automations.map(a => (
            <div key={a.id} className="glass-card p-5 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <span className="font-mono">{a.trigger_event}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="capitalize">{a.trigger_table.replace('_', ' ')}</span>
                </p>
              </div>
              <Switch checked={a.is_enabled} onCheckedChange={() => toggleEnabled(a.id, a.is_enabled)} />
            </div>
          ))}
          {automations.length === 0 && !loading && (
            <div className="text-center py-16 text-muted-foreground">No automations yet. Create your first automation!</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
