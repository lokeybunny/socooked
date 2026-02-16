import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Phone, MessageSquareText, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';

const emptyForm = {
  type: 'call' as 'sms' | 'call',
  direction: 'outbound',
  subject: '',
  body: '',
  phone_number: '',
  status: 'sent',
  customer_id: '',
  duration_seconds: '',
};

export default function PhonePage() {
  const { user } = useAuth();
  const [comms, setComms] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState('calls');

  const load = async () => {
    const [c, cust] = await Promise.all([
      supabase.from('communications').select('*').in('type', ['sms', 'call']).order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name, phone'),
    ]);
    setComms(c.data || []);
    setCustomers(cust.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      type: form.type,
      direction: form.direction,
      subject: form.subject || null,
      body: form.body || null,
      phone_number: form.phone_number || null,
      status: form.status,
      customer_id: form.customer_id || null,
      user_id: user?.id || null,
      duration_seconds: form.type === 'call' && form.duration_seconds ? parseInt(form.duration_seconds) : null,
    };
    const { error } = await supabase.from('communications').insert([payload]);
    if (error) { toast.error(error.message); return; }
    toast.success(`${form.type === 'sms' ? 'SMS' : 'Call'} logged`);
    setForm(emptyForm);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('communications').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted');
    load();
  };

  const filtered = (tab: string) => {
    if (tab === 'calls') return comms.filter(c => c.type === 'call');
    if (tab === 'sms') return comms.filter(c => c.type === 'sms');
    return comms;
  };

  const getIcon = (type: string) => {
    if (type === 'sms') return <MessageSquareText className="h-4 w-4 text-blue-500" />;
    return <Phone className="h-4 w-4 text-emerald-500" />;
  };

  const renderList = (items: any[]) => (
    items.length === 0 ? (
      <p className="text-sm text-muted-foreground py-8 text-center">Nothing here yet.</p>
    ) : (
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="glass-card p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {getIcon(item.type)}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.phone_number || item.subject || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{item.body || '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
                  {item.duration_seconds ? ` · ${Math.floor(item.duration_seconds / 60)}m ${item.duration_seconds % 60}s` : ''}
                  {' · '}{item.direction}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={item.status} />
              <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Phone</h1>
            <p className="text-muted-foreground mt-1">Calls and text messages.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(emptyForm)}><Plus className="h-4 w-4 mr-1" /> Log</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Call or SMS</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as 'sms' | 'call' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Direction</Label>
                    <Select value={form.direction} onValueChange={v => setForm({ ...form, direction: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="outbound">Outbound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Phone Number</Label><Input value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} placeholder="+1 555-0123" /></div>
                {form.type === 'call' && (
                  <div className="space-y-2"><Label>Duration (seconds)</Label><Input type="number" value={form.duration_seconds} onChange={e => setForm({ ...form, duration_seconds: e.target.value })} placeholder="120" /></div>
                )}
                <div className="space-y-2"><Label>Notes</Label><textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Call notes or message content..." className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" /></div>
                <Button type="submit" className="w-full">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="calls" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Calls</TabsTrigger>
            <TabsTrigger value="sms" className="gap-1.5"><MessageSquareText className="h-3.5 w-3.5" /> SMS</TabsTrigger>
          </TabsList>
          {['calls', 'sms'].map(tab => (
            <TabsContent key={tab} value={tab}>
              {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : renderList(filtered(tab))}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
