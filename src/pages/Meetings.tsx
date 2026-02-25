import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Video, Copy, Trash2, ExternalLink, Search, ChevronLeft, ChevronRight, FileVideo, FileAudio, RefreshCw, CheckCircle2, Clock, VideoOff } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import CortexTerminal from '@/components/terminal/CortexTerminal';

const PER_PAGE = 25;

export default function Meetings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [category, setCategory] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    const [meetingsRes, customersRes, recordingsRes] = await Promise.all([
      supabase.from('meetings').select('*, customers(full_name)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name').order('full_name'),
      supabase.from('content_assets').select('id, title, url, type, customer_id, category, folder').in('type', ['Video', 'Audio', 'video', 'audio']).eq('source', 'Meeting'),
    ]);
    setMeetings(meetingsRes.data || []);
    setCustomers(customersRes.data || []);
    setRecordings(recordingsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return meetings;
    const q = search.toLowerCase();
    return meetings.filter(m =>
      m.title?.toLowerCase().includes(q) ||
      m.room_code?.toLowerCase().includes(q) ||
      m.customers?.full_name?.toLowerCase().includes(q)
    );
  }, [meetings, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [search]);

  const getRecordingsForMeeting = (m: any) => {
    // Filter matching recordings and prioritize ones with Drive URLs
    return recordings
      .filter(r =>
        (r.folder === m.id) ||
        (r.title?.toLowerCase().includes((m.title || '').toLowerCase()) && r.customer_id === m.customer_id)
      )
      .sort((a, b) => (b.url ? 1 : 0) - (a.url ? 1 : 0));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast.error('Please select a client'); return; }
    const { data, error } = await supabase.from('meetings').insert([{
      host_id: user?.id || null,
      title: title || 'Meeting',
      scheduled_at: scheduledAt || null,
      category: category || null,
      customer_id: customerId,
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

  const downloadRecording = async (rec: any) => {
    if (!rec.url) { toast.error('No file URL available'); return; }
    try {
      // Fetch the file as blob to force a real download
      const response = await fetch(rec.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = rec.title || 'recording';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(rec.url, '_blank');
    }
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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setLoading(true); load(); }} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Fetch Rec
            </Button>
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
                  <Label>Client <span className="text-destructive">*</span></Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client (required)" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Label>Schedule For (optional)</Label>
                  <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                </div>
                <Button type="submit" className="w-full">Create Meeting</Button>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search meetings by title, room code, or client..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Video className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{search ? 'No meetings match your search.' : 'No meetings yet. Create your first meeting!'}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {paginated.map(m => {
                const meetingRecordings = getRecordingsForMeeting(m);
                const videoRec = meetingRecordings.find(r => r.type?.toLowerCase() === 'video');
                const audioRec = meetingRecordings.find(r => r.type?.toLowerCase() === 'audio');

                return (
                  <div key={m.id} className={`glass-card p-4 space-y-2 ${m.status === 'ended' ? 'opacity-80' : ''}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${
                          m.status === 'ended' 
                            ? meetingRecordings.length > 0 
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                              : 'bg-muted text-muted-foreground'
                            : m.status === 'cancelled'
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : 'bg-primary/15 text-primary'
                        }`}>
                          {m.status === 'ended' ? (
                            meetingRecordings.length > 0 ? <CheckCircle2 className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />
                          ) : m.status === 'cancelled' ? (
                            <VideoOff className="h-4 w-4" />
                          ) : m.status === 'waiting' ? (
                            <Clock className="h-4 w-4" />
                          ) : (
                            <Video className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Room: {m.room_code}
                            {m.customers?.full_name && ` · ${m.customers.full_name}`}
                            {m.scheduled_at && ` · ${format(new Date(m.scheduled_at), 'MMM d, yyyy h:mm a')}`}
                            {m.status === 'ended' && meetingRecordings.length > 0 && ` · ${meetingRecordings.length} recording${meetingRecordings.length > 1 ? 's' : ''}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={m.status} />
                        {videoRec?.url && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 dark:text-emerald-400" title="Download MP4" onClick={() => downloadRecording(videoRec)}>
                            <FileVideo className="h-4 w-4" />
                          </Button>
                        )}
                        {audioRec?.url && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 dark:text-blue-400" title="Download MP3" onClick={() => downloadRecording(audioRec)}>
                            <FileAudio className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(m.room_code)} title="Copy link">
                          <Copy className="h-4 w-4" />
                        </Button>
                        {m.status !== 'ended' && m.status !== 'cancelled' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startMeeting(m.room_code)} title="Join meeting">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <button onClick={() => handleDelete(m.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-foreground px-2">{page} / {totalPages}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <CortexTerminal
          module="meetings"
          label="Meetings Terminal"
          hint="create, manage & control meetings"
          placeholder="create a meeting with John tomorrow at 2pm, delete meeting XYZ…"
        />
      </div>
    </AppLayout>
  );
}
