import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Phone, Globe, MapPin, User, Clock, Send, CheckCircle2,
  Search, Filter, ExternalLink, Copy, FileSignature, Bell,
  ChevronRight, Building2, CalendarClock, CalendarDays,
  Plus, Upload, ChevronLeft, Pencil, Trash2,
} from 'lucide-react';
import { formatDistanceToNow, isPast, format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth, isSameDay } from 'date-fns';

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

type Prospect = {
  id: string;
  business_name: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  pipeline_stage: string;
  agreement_doc_id: string | null;
  notes: string | null;
  next_followup_at: string | null;
  last_contacted_at: string | null;
  meta: any;
  created_at: string;
  updated_at: string;
};

export default function VideographyHub() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', role: '', email: '', phone: '' });
  const [notesText, setNotesText] = useState('');
  const [addMode, setAddMode] = useState<'closed' | 'manual' | 'csv'>('closed');
  const [manualForm, setManualForm] = useState({ business_name: '', phone: '', address: '', website: '' });
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [pocEditId, setPocEditId] = useState<string | null>(null);
  const [pocName, setPocName] = useState('');
  const [viewTab, setViewTab] = useState<'pipeline' | 'calendar'>('pipeline');

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date());
  const [calEvents, setCalEvents] = useState<any[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [eventForm, setEventForm] = useState({ title: '', date: '', start: '', end: '' });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('videography_prospects')
      .select('*')
      .order('pipeline_stage', { ascending: true })
      .order('next_followup_at', { ascending: true });
    if (data) setProspects(data as Prospect[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Blocked time slots (PST) ───
  const BLOCKED_SLOTS = [
    { label: '🔒 Blocked', startH: 8, startM: 0, endH: 10, endM: 0 },
    { label: '🔒 Blocked', startH: 14, startM: 30, endH: 15, endM: 30 },
  ];

  // Calendar data
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
    const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(calMonth) });
    const blockedEvents = days.flatMap(day =>
      BLOCKED_SLOTS.map((slot, si) => {
        const st = new Date(day);
        st.setHours(slot.startH, slot.startM, 0, 0);
        // Offset from local to PST if needed — store as-is since calendar displays local
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

  const updateProspect = async (id: string, updates: Partial<Prospect>) => {
    const { error } = await supabase.from('videography_prospects').update(updates).eq('id', id);
    if (error) { toast.error('Update failed'); return; }
    toast.success('Updated');
    load();
  };

  const markContacted = async (p: Prospect) => {
    await updateProspect(p.id, {
      pipeline_stage: p.pipeline_stage === 'new' ? 'contacted' : p.pipeline_stage,
      last_contacted_at: new Date().toISOString(),
      next_followup_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  };

  const advanceStage = async (p: Prospect) => {
    const order = STAGES.map(s => s.key);
    const idx = order.indexOf(p.pipeline_stage);
    if (idx < order.length - 2) { // don't advance past 'active'
      await updateProspect(p.id, { pipeline_stage: order[idx + 1] });
    }
  };

  const saveContact = async () => {
    if (!selected) return;
    await updateProspect(selected.id, {
      contact_name: contactForm.name || null,
      contact_role: contactForm.role || null,
      contact_email: contactForm.email || null,
      contact_phone: contactForm.phone || null,
      pipeline_stage: selected.pipeline_stage === 'new' ? 'contacted' : selected.pipeline_stage,
      next_followup_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    setEditOpen(false);
  };

  const saveNotes = async () => {
    if (!selected) return;
    await updateProspect(selected.id, { notes: notesText });
  };

  const copyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone.replace(/\D/g, ''));
    toast.success('Phone copied');
  };

  const sendAgreement = async (p: Prospect) => {
    if (!p.contact_email && !p.contact_name) {
      toast.error('Set a contact first before sending agreement');
      return;
    }
    // Create a customer record + trigger agreement flow
    const { data: cust, error: custErr } = await supabase.from('customers').insert({
      full_name: p.contact_name || p.business_name,
      email: p.contact_email,
      phone: p.contact_phone || p.phone,
      company: p.business_name,
      source: 'videography-outreach',
      category: 'videography',
      status: 'lead',
      meta: { videography_prospect_id: p.id },
    }).select('id').single();

    if (custErr || !cust) { toast.error('Failed to create contact record'); return; }

    // Invoke the wholesale-agreement edge function for videography
    const { error: fnErr } = await supabase.functions.invoke('wholesale-agreement', {
      body: {
        action: 'draft',
        customer_id: cust.id,
        agreement_type: 'videography_service',
        seller_name: p.contact_name || p.business_name,
        seller_email: p.contact_email,
        property_address: p.address,
        meta: { business_name: p.business_name, prospect_id: p.id },
      },
    });

    if (fnErr) {
      toast.error('Agreement generation failed — will be available soon');
    } else {
      toast.success('Agreement drafted — check Documents');
    }

    await updateProspect(p.id, {
      pipeline_stage: 'agreement_sent',
      agreement_doc_id: cust.id,
    });
  };

  const addManual = async () => {
    if (!manualForm.business_name.trim()) { toast.error('Business name is required'); return; }
    const { error } = await supabase.from('videography_prospects').insert({
      business_name: manualForm.business_name.trim(),
      phone: manualForm.phone.trim() || null,
      address: manualForm.address.trim() || null,
      website: manualForm.website.trim() || null,
      pipeline_stage: 'new',
    });
    if (error) { toast.error('Failed to add'); return; }
    toast.success('Prospect added');
    setManualForm({ business_name: '', phone: '', address: '', website: '' });
    setAddMode('closed');
    load();
  };

  const importCsv = async () => {
    const lines = csvText.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) { toast.error('Paste CSV content first'); return; }

    // Detect header row
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('business') || firstLine.includes('name') || firstLine.includes('phone') || firstLine.includes('address');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    // Parse CSV respecting quoted fields
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      result.push(current.trim());
      return result;
    };

    // Detect column indices from header
    let nameIdx = 0, phoneIdx = 1, addressIdx = 2, websiteIdx = 3;
    if (hasHeader) {
      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
      const find = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));
      const ni = find(['business', 'name', 'company']);
      const pi = find(['phone', 'tel', 'number']);
      const ai = find(['address', 'location', 'street']);
      const wi = find(['website', 'url', 'site']);
      if (ni >= 0) nameIdx = ni;
      if (pi >= 0) phoneIdx = pi;
      if (ai >= 0) addressIdx = ai;
      if (wi >= 0) websiteIdx = wi;
    }

    const rows = dataLines.map(line => {
      const cols = parseCsvLine(line);
      return {
        business_name: cols[nameIdx] || '',
        phone: cols[phoneIdx] || null,
        address: cols[addressIdx] || null,
        website: cols[websiteIdx] || null,
        pipeline_stage: 'new' as const,
      };
    }).filter(r => r.business_name.trim());

    if (rows.length === 0) { toast.error('No valid rows found'); return; }

    setImporting(true);
    const { error } = await supabase.from('videography_prospects').insert(rows);
    setImporting(false);

    if (error) { toast.error('Import failed: ' + error.message); return; }
    toast.success(`Imported ${rows.length} prospects`);
    setCsvText('');
    setAddMode('closed');
    load();
  };

  const filtered = prospects.filter(p => {
    if (stageFilter !== 'all' && p.pipeline_stage !== stageFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return p.business_name.toLowerCase().includes(s) ||
        (p.address || '').toLowerCase().includes(s) ||
        (p.contact_name || '').toLowerCase().includes(s);
    }
    return true;
  });

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s.key] = prospects.filter(p => p.pipeline_stage === s.key).length;
    return acc;
  }, {} as Record<string, number>);

  const overdueCount = prospects.filter(p =>
    p.next_followup_at && isPast(new Date(p.next_followup_at)) && !['dead', 'active'].includes(p.pipeline_stage)
  ).length;

  const openDetail = (p: Prospect) => {
    setSelected(p);
    setContactForm({
      name: p.contact_name || '',
      role: p.contact_role || '',
      email: p.contact_email || '',
      phone: p.contact_phone || '',
    });
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
            <Building2 className="h-6 w-6 text-primary" />
            Videography Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Video funnel leads & bookings across Las Vegas
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
          <Button size="sm" variant="outline" onClick={() => setAddMode('manual')}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAddMode('csv')}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
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
            {calEvents.filter(e => new Date(e.start_time) >= new Date()).length === 0 && (
              <p className="text-xs text-muted-foreground">No upcoming videography bookings this month.</p>
            )}
            {calEvents
              .filter(e => new Date(e.start_time) >= new Date())
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
          All ({prospects.length})
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
          placeholder="Search businesses..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Prospect Cards */}
      <div className="grid gap-3">
        {filtered.map(p => {
          const stage = STAGES.find(s => s.key === p.pipeline_stage) || STAGES[0];
          const isOverdue = p.next_followup_at && isPast(new Date(p.next_followup_at)) && !['dead', 'active'].includes(p.pipeline_stage);

          return (
            <Card key={p.id} className={`cursor-pointer hover:border-primary/50 transition-colors ${isOverdue ? 'border-destructive/50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Left: Business info */}
                  <div className="flex-1 min-w-0 space-y-1" onClick={() => openDetail(p)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{p.business_name}</span>
                      <Badge className={`text-[10px] ${stage.color}`}>{stage.label}</Badge>
                      {isOverdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {p.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </span>
                      )}
                      {p.address && (
                        <span className="flex items-center gap-1 truncate max-w-[250px]">
                          <MapPin className="h-3 w-3" /> {p.address}
                        </span>
                      )}
                      {p.contact_name && (
                        <span className="flex items-center gap-1 text-primary">
                          <User className="h-3 w-3" /> {p.contact_name} {p.contact_role ? `(${p.contact_role})` : ''}
                        </span>
                      )}
                    </div>
                    {p.next_followup_at && (
                      <div className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                        <CalendarClock className="h-3 w-3" />
                        Follow up {formatDistanceToNow(new Date(p.next_followup_at), { addSuffix: true })}
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {p.phone && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyPhone(p.phone!)}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <a href={`tel:${p.phone}`}>
                            <Phone className="h-3 w-3 mr-1" /> Call
                          </a>
                        </Button>
                      </>
                    )}
                    {p.website && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                        <a href={p.website} target="_blank" rel="noopener noreferrer">
                          <Globe className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markContacted(p)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Contacted
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPocEditId(pocEditId === p.id ? null : p.id); setPocName(p.contact_name || ''); }}>
                      <User className="h-3 w-3 mr-1" /> POC
                    </Button>
                    {['contacted', 'callback', 'meeting_set'].includes(p.pipeline_stage) && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => advanceStage(p)}>
                        <ChevronRight className="h-3 w-3" /> Next
                      </Button>
                    )}
                  </div>
                  {pocEditId === p.id && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={pocName}
                        onChange={e => setPocName(e.target.value)}
                        placeholder="Point of contact name"
                        className="h-7 text-xs flex-1"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && pocName.trim()) {
                            updateProspect(p.id, { contact_name: pocName.trim() });
                            setPocEditId(null);
                          }
                        }}
                        autoFocus
                      />
                      <Button size="sm" className="h-7 text-xs" onClick={() => {
                        if (pocName.trim()) {
                          updateProspect(p.id, { contact_name: pocName.trim() });
                          setPocEditId(null);
                        }
                      }}>Save</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No prospects found
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

      {/* Detail / Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selected?.business_name}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-5">
              {/* Business Info */}
              <div className="space-y-2 text-sm">
                {selected.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${selected.phone}`} className="text-primary hover:underline">{selected.phone}</a>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => copyPhone(selected.phone!)}>Copy</Button>
                  </div>
                )}
                {selected.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{selected.address}</span>
                  </div>
                )}
                {selected.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{selected.website}</a>
                  </div>
                )}
              </div>

              {/* Pipeline Stage */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Pipeline Stage</label>
                <Select
                  value={selected.pipeline_stage}
                  onValueChange={v => {
                    updateProspect(selected.id, { pipeline_stage: v });
                    setSelected({ ...selected, pipeline_stage: v });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Point of Contact */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Point of Contact
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Name" className="h-8 text-xs" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
                  <Input placeholder="Role/Title" className="h-8 text-xs" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))} />
                  <Input placeholder="Email" className="h-8 text-xs" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                  <Input placeholder="Direct Phone" className="h-8 text-xs" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={saveContact}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Save Contact
                </Button>
              </div>

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
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => sendAgreement(selected)}>
                  <FileSignature className="h-3 w-3 mr-1" /> Send Agreement
                </Button>
                <Button
                  size="sm" variant="outline" className="h-8 text-xs"
                  onClick={() => updateProspect(selected.id, { pipeline_stage: 'dead' })}
                >
                  Not Interested
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add / Import Modal */}
      <Dialog open={addMode !== 'closed'} onOpenChange={open => { if (!open) setAddMode('closed'); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{addMode === 'csv' ? 'Import CSV' : 'Add Prospect'}</DialogTitle>
          </DialogHeader>

          {addMode === 'manual' && (
            <div className="space-y-3">
              <Input placeholder="Business Name *" value={manualForm.business_name} onChange={e => setManualForm(f => ({ ...f, business_name: e.target.value }))} />
              <Input placeholder="Phone" value={manualForm.phone} onChange={e => setManualForm(f => ({ ...f, phone: e.target.value }))} />
              <Input placeholder="Address" value={manualForm.address} onChange={e => setManualForm(f => ({ ...f, address: e.target.value }))} />
              <Input placeholder="Website" value={manualForm.website} onChange={e => setManualForm(f => ({ ...f, website: e.target.value }))} />
              <Button className="w-full" onClick={addManual}>
                <Plus className="h-4 w-4 mr-1" /> Add Prospect
              </Button>
            </div>
          )}

          {addMode === 'csv' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Paste CSV content below. Expected columns: <span className="font-medium">Business Name, Phone, Address, Website</span>.
                Header row is auto-detected.
              </p>
              <Textarea
                className="min-h-[200px] font-mono text-xs"
                placeholder={'Business Name,Phone,Address,Website\nAcme Mortuary,(702) 555-1234,"123 Main St, Las Vegas, NV",https://acme.com'}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
              />
              <Button className="w-full" onClick={importCsv} disabled={importing}>
                {importing ? 'Importing…' : `Import ${csvText.trim().split('\n').filter(l => l.trim()).length > 1 ? csvText.trim().split('\n').filter(l => l.trim()).length - 1 : 0} rows`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
