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
import { Plus, Mail, Send, FileEdit, Inbox, Phone, MessageSquareText, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';

type CommType = 'email' | 'sms' | 'call';

const emptyForm = {
  type: 'email' as CommType,
  direction: 'outbound',
  subject: '',
  body: '',
  to_address: '',
  from_address: '',
  phone_number: '',
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

  const load = async () => {
    const [c, cust] = await Promise.all([
      supabase.from('communications').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name, email, phone'),
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
      to_address: form.to_address || null,
      from_address: form.from_address || null,
      phone_number: form.phone_number || null,
      status: form.status,
      customer_id: form.customer_id || null,
      user_id: user?.id || null,
    };
    const { error } = await supabase.from('communications').insert([payload]);
    if (error) { toast.error(error.message); return; }
    toast.success(`${form.type === 'email' ? 'Email' : form.type === 'sms' ? 'SMS' : 'Call'} logged`);
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
    switch (tab) {
      case 'inbox': return comms.filter(c => c.type === 'email' && c.direction === 'inbound');
      case 'sent': return comms.filter(c => c.type === 'email' && c.direction === 'outbound' && c.status !== 'draft');
      case 'drafts': return comms.filter(c => c.type === 'email' && c.status === 'draft');
      case 'sms': return comms.filter(c => c.type === 'sms');
      case 'calls': return comms.filter(c => c.type === 'call');
      default: return comms;
    }
  };

  const getIcon = (type: string) => {
    if (type === 'sms') return <MessageSquareText className="h-4 w-4 text-blue-500" />;
    if (type === 'call') return <Phone className="h-4 w-4 text-emerald-500" />;
    return <Mail className="h-4 w-4 text-amber-500" />;
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
                  {item.subject || item.phone_number || item.to_address || 'No subject'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{item.body || '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
                  {item.duration_seconds ? ` · ${Math.floor(item.duration_seconds / 60)}m ${item.duration_seconds % 60}s` : ''}
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
            <h1 className="text-2xl font-bold text-foreground">Communications</h1>
            <p className="text-muted-foreground mt-1">Emails, calls, and text messages.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(emptyForm)}><Plus className="h-4 w-4 mr-1" /> Log Communication</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Communication</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as CommType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
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
                {form.type === 'email' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>From</Label><Input value={form.from_address} onChange={e => setForm({ ...form, from_address: e.target.value })} placeholder="you@example.com" /></div>
                      <div className="space-y-2"><Label>To</Label><Input value={form.to_address} onChange={e => setForm({ ...form, to_address: e.target.value })} placeholder="client@example.com" /></div>
                    </div>
                    <div className="space-y-2"><Label>Subject</Label><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
                  </>
                )}
                {(form.type === 'sms' || form.type === 'call') && (
                  <div className="space-y-2"><Label>Phone Number</Label><Input value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} placeholder="+1 555-0123" /></div>
                )}
                <div className="space-y-2"><Label>Body / Notes</Label><textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Message content or call notes..." className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" /></div>
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
            <TabsTrigger value="sms" className="gap-1.5"><MessageSquareText className="h-3.5 w-3.5" /> SMS</TabsTrigger>
            <TabsTrigger value="calls" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Calls</TabsTrigger>
          </TabsList>
          {['inbox', 'sent', 'drafts', 'sms', 'calls'].map(tab => (
            <TabsContent key={tab} value={tab}>
              {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : renderList(filtered(tab))}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
