import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Video, Copy, Trash2, ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function Meetings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [category, setCategory] = useState('');
  const [customerId, setCustomerId] = useState('');

  const load = async () => {
    const [meetingsRes, customersRes] = await Promise.all([
      supabase.from('meetings').select('*, customers(full_name)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name').order('full_name'),
    ]);
    setMeetings(meetingsRes.data || []);
    setCustomers(customersRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from('meetings').insert([{
      host_id: user?.id || null,
      title: title || 'Meeting',
      scheduled_at: scheduledAt || null,
      category: category || null,
      customer_id: customerId || null,
    }]).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success('Meeting created');
    setTitle('');
    setScheduledAt('');
    setCategory('');
    setCustomerId('');
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('meetings').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Meeting deleted');
    load();
  };

  const copyLink = (roomCode: string) => {
    const url = `${window.location.origin}/meet/${roomCode}`;
    navigator.clipboard.writeText(url);
    toast.success('Meeting link copied to clipboard');
  };

  const startMeeting = (roomCode: string) => {
    navigate(`/meet/${roomCode}`);
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meetings</h1>
            <p className="text-muted-foreground mt-1">Create and manage video meetings.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New Meeting</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Meeting</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Team standup" />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Client (for recording uploads)</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Schedule For (optional)</Label>
                  <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                </div>
                <Button type="submit" className="w-full">Create Meeting</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : meetings.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Video className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No meetings yet. Create your first meeting!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {meetings.map(m => (
              <div key={m.id} className="glass-card p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-muted text-primary">
                    <Video className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Room: {m.room_code}
                      {m.customers?.full_name && ` · ${m.customers.full_name}`}
                      {m.scheduled_at && ` · ${format(new Date(m.scheduled_at), 'MMM d, yyyy h:mm a')}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={m.status} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(m.room_code)} title="Copy link">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startMeeting(m.room_code)} title="Join meeting">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <button onClick={() => handleDelete(m.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
