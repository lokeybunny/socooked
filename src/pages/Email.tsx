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
import { Plus, Mail, Send, FileEdit, Inbox, Trash2, Filter } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';

const emptyForm = {
  direction: 'outbound',
  subject: '',
  body: '',
  to_address: '',
  from_address: '',
  status: 'draft',
  customer_id: '',
};

export default function EmailPage() {
  const { user } = useAuth();
  const [comms, setComms] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState('inbox');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all');

  const load = async () => {
    const [c, cust] = await Promise.all([
      supabase.from('communications').select('*').eq('type', 'email').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name, email'),
    ]);
    setComms(c.data || []);
    setCustomers(cust.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      type: 'email',
      direction: form.direction,
      subject: form.subject || null,
      body: form.body || null,
      to_address: form.to_address || null,
      from_address: form.from_address || null,
      status: form.status,
      customer_id: form.customer_id || null,
      user_id: user?.id || null,
    };
    const { error } = await supabase.from('communications').insert([payload]);
    if (error) { toast.error(error.message); return; }
    toast.success('Email logged');
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
    let items: any[];
    switch (tab) {
      case 'inbox': items = comms.filter(c => c.direction === 'inbound'); break;
      case 'sent': items = comms.filter(c => c.direction === 'outbound' && c.status !== 'draft'); break;
      case 'drafts': items = comms.filter(c => c.status === 'draft'); break;
      default: items = comms;
    }
    if (selectedCustomerId !== 'all') {
      items = items.filter(c => c.customer_id === selectedCustomerId);
    }
    return items;
  };

  const renderList = (items: any[]) => (
    items.length === 0 ? (
      <p className="text-sm text-muted-foreground py-8 text-center">Nothing here yet.</p>
    ) : (
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="glass-card p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.subject || 'No subject'}</p>
                <p className="text-xs text-muted-foreground truncate">{item.direction === 'inbound' ? `From: ${item.from_address || '—'}` : `To: ${item.to_address || '—'}`}</p>
                <p className="text-xs text-muted-foreground mt-1">{format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</p>
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
            <h1 className="text-2xl font-bold text-foreground">Email</h1>
            <p className="text-muted-foreground mt-1">Manage your email communications.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(emptyForm)}><Plus className="h-4 w-4 mr-1" /> Compose</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Compose Email</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>From</Label><Input value={form.from_address} onChange={e => setForm({ ...form, from_address: e.target.value })} placeholder="you@example.com" /></div>
                  <div className="space-y-2"><Label>To</Label><Input value={form.to_address} onChange={e => setForm({ ...form, to_address: e.target.value })} placeholder="client@example.com" /></div>
                </div>
                <div className="space-y-2"><Label>Subject</Label><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
                <div className="space-y-2"><Label>Body</Label><textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Email content..." className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" /></div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="read">Read</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="inbox" className="gap-1.5"><Inbox className="h-3.5 w-3.5" /> Inbox</TabsTrigger>
            <TabsTrigger value="sent" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Sent</TabsTrigger>
            <TabsTrigger value="drafts" className="gap-1.5"><FileEdit className="h-3.5 w-3.5" /> Drafts</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 mt-4 sm:mt-0">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All customers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {['inbox', 'sent', 'drafts'].map(tab => (
            <TabsContent key={tab} value={tab}>
              {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : renderList(filtered(tab))}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
