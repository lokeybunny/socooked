import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Phone, MapPin, User, Clock, CheckCircle2,
  Search, Bell, ChevronRight, Building2, CalendarClock, CalendarDays,
  ChevronLeft, Pencil, Trash2, Mail, Video,
} from 'lucide-react';
import { formatDistanceToNow, isPast, format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

const STAGES = [
  { key: 'new', label: 'New', color: 'bg-muted text-muted-foreground' },
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-500/20 text-blue-400' },
  { key: 'callback', label: 'Call Back', color: 'bg-orange-500/20 text-orange-400' },
  { key: 'meeting_set', label: 'Meeting Set', color: 'bg-purple-500/20 text-purple-400' },
  { key: 'agreement_sent', label: 'Agreement Sent', color: 'bg-yellow-500/20 text-yellow-400' },
  { key: 'contracted', label: 'Contracted', color: 'bg-green-500/20 text-green-400' },
  { key: 'active', label: 'Active', color: 'bg-green-600/30 text-green-400 font-semibold' },
  { key: 'dead', label: 'Dead', color: 'bg-red-500/20 text-red-400' },
];

/* ─── Map CRM customer status → pipeline stage ─── */
const STATUS_TO_STAGE: Record<string, string> = {
  lead: 'new',
  prospect: 'contacted',
  contacted: 'contacted',
  callback: 'callback',
  ai_complete: 'meeting_set',
  agreement_sent: 'agreement_sent',
  scheduled: 'contracted',
  closed: 'active',
  dead: 'dead',
};

type Lead = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  notes: string | null;
  tags: string[];
  meta: any;
  created_at: string;
  updated_at: string;
  pipeline_stage: string;
  event_type: string | null;
  callback_at: string | null;
};

function mapCustomer(c: any): Lead {
  const meta = c.meta || {};
  const noteLines = (c.notes || '').split('\n');
  const eventLine = noteLines.find((l: string) => l.startsWith('Event:'));
  return {
    id: c.id,
    full_name: c.full_name,
    phone: c.phone,
    email: c.email,
    status: c.status,
    notes: c.notes,
    tags: c.tags || [],
    meta,
    created_at: c.created_at,
    updated_at: c.updated_at,
    pipeline_stage: STATUS_TO_STAGE[c.status] || 'new',
    event_type: eventLine ? eventLine.replace('Event:', '').trim() : null,
    callback_at: meta.callback_at || null,
  };
}

/* ─── Blocked time slots (PST) shown on calendar ─── */
const BLOCKED_SLOTS = [
  { label: '🔒 Blocked', startH: 8, startM: 0, endH: 10, endM: 0 },
  { label: '🔒 Blocked', startH: 14, startM: 30, endH: 15, endM: 30 },
];

export default function VideographyHub() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [viewTab, setViewTab] = useState<'pipeline' | 'calendar'>('pipeline');

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date());
  const [calEvents, setCalEvents] = useState<any[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [eventForm, setEventForm] = useState({ title: '', date: '', start: '', end: '' });

  /* ─── Load video funnel leads from customers table ─── */
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('source', 'videography-landing')
      .order('created_at', { ascending: false });
    if (data) setLeads(data.map(mapCustomer));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ─── Calendar data ─── */
  const loadCalEvents = useCallback(async () => {
    setCalLoading(true);
    const monthStart = startOfMonth(calMonth);
    const monthEnd = endOfMonth(calMonth);
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('start_time', monthStart.toISOString())
      .lte('start_time', monthEnd.toISOString())
      .or('category.eq.videography,title.ilike.%videography%')
      .order('start_time', { ascending: true });

    // Generate synthetic blocked-slot events for every day in the month
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const blockedEvents = days.flatMap(day =>
      BLOCKED_SLOTS.map((slot, si) => {
        const st = new Date(day);
        st.setHours(slot.startH, slot.startM, 0, 0);
        const et = new Date(day);
        et.setHours(slot.endH, slot.endM, 0, 0);
        return {
          id: `blocked-${format(day, 'yyyy-MM-dd')}-${si}`,
          title: slot.label,
          start_time: st.toISOString(),
          end_time: et.toISOString(),
          category: 'blocked',
          color: '#6b7280',
          _isBlocked: true,
        };
      })
    );

    setCalEvents([...(data || []), ...blockedEvents]);
    setCalLoading(false);
  }, [calMonth]);

  useEffect(() => { if (viewTab === 'calendar') loadCalEvents(); }, [viewTab, loadCalEvents]);

  const calDays = useMemo(() => {
    const ms = startOfMonth(calMonth);
    const me = endOfMonth(calMonth);
    return eachDayOfInterval({ start: startOfWeek(ms), end: endOfWeek(me) });
  }, [calMonth]);

  const getEventsForDay = (day: Date) => calEvents.filter(e => isSameDay(new Date(e.start_time), day));

  const openEventEdit = (ev: any) => {
    setEditingEvent(ev);
    const st = new Date(ev.start_time);
    const et = ev.end_time ? new Date(ev.end_time) : new Date(st.getTime() + 3600000);
    setEventForm({
      title: ev.title || '',
      date: format(st, 'yyyy-MM-dd'),
      start: format(st, 'HH:mm'),
      end: format(et, 'HH:mm'),
    });
  };

  const saveEvent = async () => {
    if (!editingEvent) return;
    const startIso = new Date(`${eventForm.date}T${eventForm.start}:00`).toISOString();
    const endIso = new Date(`${eventForm.date}T${eventForm.end}:00`).toISOString();
    const { error } = await supabase.from('calendar_events').update({
      title: eventForm.title,
      start_time: startIso,
      end_time: endIso,
    }).eq('id', editingEvent.id);
    if (error) { toast.error('Update failed'); return; }
    toast.success('Booking updated');
    setEditingEvent(null);
    loadCalEvents();
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (error) { toast.error('Delete failed'); return; }
    toast.success('Booking removed');
    setEditingEvent(null);
    loadCalEvents();
  };

  /* ─── CRM updates (customers table) ─── */
  const updateLead = async (id: string, updates: Record<string, any>) => {
    const { error } = await supabase.from('customers').update(updates).eq('id', id);
    if (error) { toast.error('Update failed'); return; }
    toast.success('Updated');
    load();
  };

  const markContacted = async (p: Lead) => {
    const meta = { ...(p.meta || {}), last_contacted_at: new Date().toISOString(), callback_at: new Date(Date.now() + 7 * 86400000).toISOString() };
    await updateLead(p.id, { status: p.status === 'lead' ? 'contacted' : p.status, meta });
  };

  const advanceStage = async (p: Lead) => {
    const stageToStatus: Record<string, string> = {
      new: 'contacted',
      contacted: 'callback',
      callback: 'ai_complete',
      meeting_set: 'agreement_sent',
      agreement_sent: 'scheduled',
      contracted: 'closed',
    };
    const nextStatus = stageToStatus[p.pipeline_stage];
    if (nextStatus) await updateLead(p.id, { status: nextStatus });
  };

  const saveNotes = async () => {
    if (!selected) return;
    await updateLead(selected.id, { notes: notesText });
  };

  const copyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone.replace(/\D/g, ''));
    toast.success('Phone copied');
  };

  /* ─── Filtering ─── */
  const filtered = leads.filter(p => {
    if (stageFilter !== 'all' && p.pipeline_stage !== stageFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return p.full_name.toLowerCase().includes(s) ||
        (p.phone || '').toLowerCase().includes(s) ||
        (p.email || '').toLowerCase().includes(s);
    }
    return true;
  });

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s.key] = leads.filter(p => p.pipeline_stage === s.key).length;
    return acc;
  }, {} as Record<string, number>);

  const overdueCount = leads.filter(p =>
    p.callback_at && isPast(new Date(p.callback_at)) && !['dead', 'active'].includes(p.pipeline_stage)
  ).length;

  const openDetail = (p: Lead) => {
    setSelected(p);
    setNotesText(p.notes || '');
    setEditOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Video className="h-6 w-6 text-primary" />
            Video Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads from /video funnel — Las Vegas videography & streaming
          </p>
        </div>
        {overdueCount > 0 && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <Bell className="h-3 w-3" /> {overdueCount} overdue followups
          </Badge>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant={viewTab === 'pipeline' ? 'default' : 'outline'} onClick={() => setViewTab('pipeline')}>
            <Building2 className="h-3.5 w-3.5 mr-1" /> Pipeline
          </Button>
          <Button size="sm" variant={viewTab === 'calendar' ? 'default' : 'outline'} onClick={() => setViewTab('calendar')}>
            <CalendarDays className="h-3.5 w-3.5 mr-1" /> Calendar
          </Button>
        </div>
      </div>

      {viewTab === 'calendar' ? (
        /* ─── Calendar View ─── */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{format(calMonth, 'MMMM yyyy')}</h3>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCalMonth(subMonths(calMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setCalMonth(new Date())}>Today</Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCalMonth(addMonths(calMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="bg-muted p-2 text-center text-xs font-bold text-foreground">{d}</div>
            ))}
            {calDays.map(day => {
              const dayEvents = getEventsForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div key={day.toISOString()} className={`bg-card min-h-[90px] p-1.5 ${!isSameMonth(day, calMonth) ? 'opacity-30' : ''}`}>
                  <p className={`text-xs mb-1 ${isToday ? 'text-primary font-bold' : 'text-foreground font-bold'}`}>{format(day, 'd')}</p>
                  <div className="space-y-0.5">
                    {dayEvents.map(ev => {
                      const isBlocked = (ev as any)._isBlocked;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => !isBlocked && openEventEdit(ev)}
                          className={`w-full text-left text-[10px] font-semibold px-1.5 py-0.5 rounded truncate transition-colors ${
                            isBlocked
                              ? 'bg-muted text-muted-foreground cursor-default opacity-60'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
                          }`}
                        >
                          {format(new Date(ev.start_time), 'h:mm a')} {ev.title?.replace(/\[.*?\]\s*/g, '')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upcoming list */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Upcoming Bookings</h4>
            {calEvents.filter(e => new Date(e.start_time) >= new Date() && !(e as any)._isBlocked).length === 0 && (
              <p className="text-xs text-muted-foreground">No upcoming videography bookings this month.</p>
            )}
            {calEvents
              .filter(e => new Date(e.start_time) >= new Date() && !(e as any)._isBlocked)
              .map(ev => (
                <Card key={ev.id} className="cursor-pointer hover:border-primary/50" onClick={() => openEventEdit(ev)}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{ev.title?.replace(/\[.*?\]\s*/g, '')}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ev.start_time), 'MMM d, yyyy · h:mm a')}
                        {ev.end_time && ` – ${format(new Date(ev.end_time), 'h:mm a')}`}
                      </p>
                      {ev.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.description}</p>}
                    </div>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      ) : (
      /* ─── Pipeline View ─── */
      <>
      {/* Pipeline Summary */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm" variant={stageFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setStageFilter('all')}
        >
          All ({leads.length})
        </Button>
        {STAGES.map(s => (
          <Button
            key={s.key} size="sm"
            variant={stageFilter === s.key ? 'default' : 'outline'}
            onClick={() => setStageFilter(s.key)}
          >
            {s.label} ({stageCounts[s.key] || 0})
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Lead Cards */}
      <div className="grid gap-3">
        {filtered.map(p => {
          const stage = STAGES.find(s => s.key === p.pipeline_stage) || STAGES[0];
          const isOverdue = p.callback_at && isPast(new Date(p.callback_at)) && !['dead', 'active'].includes(p.pipeline_stage);

          return (
            <Card key={p.id} className={`cursor-pointer hover:border-primary/50 transition-colors ${isOverdue ? 'border-destructive/50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Left: Lead info */}
                  <div className="flex-1 min-w-0 space-y-1" onClick={() => openDetail(p)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{p.full_name}</span>
                      <Badge className={`text-[10px] ${stage.color}`}>{stage.label}</Badge>
                      {p.event_type && <Badge variant="outline" className="text-[10px]">{p.event_type}</Badge>}
                      {isOverdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {p.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </span>
                      )}
                      {p.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {p.email}
                        </span>
                      )}
                    </div>
                    {p.callback_at && (
                      <div className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                        <CalendarClock className="h-3 w-3" />
                        Follow up {formatDistanceToNow(new Date(p.callback_at), { addSuffix: true })}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      Submitted {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {p.phone && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyPhone(p.phone!)}>
                          Copy
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <a href={`tel:${p.phone}`}>
                            <Phone className="h-3 w-3 mr-1" /> Call
                          </a>
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markContacted(p)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Contacted
                    </Button>
                    {['contacted', 'callback', 'meeting_set'].includes(p.pipeline_stage) && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => advanceStage(p)}>
                        <ChevronRight className="h-3 w-3" /> Next
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No video funnel leads found
          </div>
        )}
      </div>
      </>
      )}

      {/* Event Edit Modal */}
      <Dialog open={!!editingEvent} onOpenChange={o => { if (!o) setEditingEvent(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Edit Booking
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))} />
            <Input type="date" value={eventForm.date} onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))} />
            <div className="flex gap-2">
              <Input type="time" value={eventForm.start} onChange={e => setEventForm(f => ({ ...f, start: e.target.value }))} className="flex-1" />
              <Input type="time" value={eventForm.end} onChange={e => setEventForm(f => ({ ...f, end: e.target.value }))} className="flex-1" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={saveEvent}>Save</Button>
              <Button variant="destructive" size="sm" onClick={() => editingEvent && deleteEvent(editingEvent.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              {selected?.full_name}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-5">
              {/* Lead Info */}
              <div className="space-y-2 text-sm">
                {selected.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${selected.phone}`} className="text-primary hover:underline">{selected.phone}</a>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => copyPhone(selected.phone!)}>Copy</Button>
                  </div>
                )}
                {selected.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{selected.email}</span>
                  </div>
                )}
                {selected.event_type && (
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <span>Event: {selected.event_type}</span>
                  </div>
                )}
              </div>

              {/* Pipeline Stage */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Pipeline Stage</label>
                <Select
                  value={selected.pipeline_stage}
                  onValueChange={v => {
                    const stageToStatus: Record<string, string> = {
                      new: 'lead', contacted: 'contacted', callback: 'callback',
                      meeting_set: 'ai_complete', agreement_sent: 'agreement_sent',
                      contracted: 'scheduled', active: 'closed', dead: 'dead',
                    };
                    updateLead(selected.id, { status: stageToStatus[v] || v });
                    setSelected({ ...selected, pipeline_stage: v });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Vapi AI info */}
              {selected.meta?.vapi_ai_notes && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">AI Call Notes</label>
                  <p className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap">{selected.meta.vapi_ai_notes}</p>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Textarea
                  className="text-xs min-h-[80px]"
                  placeholder="Call notes, next steps..."
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveNotes}>Save Notes</Button>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Button size="sm" className="h-8 text-xs" onClick={() => markContacted(selected)}>
                  <Phone className="h-3 w-3 mr-1" /> Mark Contacted
                </Button>
                <Button
                  size="sm" variant="outline" className="h-8 text-xs"
                  onClick={() => updateLead(selected.id, { status: 'dead' })}
                >
                  Not Interested
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
