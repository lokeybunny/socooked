import { useEffect, useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Clock,
  Video, Handshake, CheckSquare, Receipt, GripVertical, List, Edit2,
  DollarSign, User, FileText,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  addWeeks, subWeeks, isSameDay, isSameMonth, startOfDay, endOfDay, parseISO, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import CortexTerminal from '@/components/terminal/CortexTerminal';
import AIGenerationTerminal from '@/components/terminal/AIGenerationTerminal';

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time?: string | null;
  all_day: boolean;
  color: string;
  location?: string | null;
  reminder_minutes?: number | null;
  source: string;
  source_id?: string | null;
  customer_id?: string | null;
  category?: string | null;
  created_by?: string | null;
  // Extra invoice fields for detail view
  _invoiceData?: any;
}

const EVENT_COLORS = [
  { label: 'Blue', value: 'hsl(var(--chart-1))' },
  { label: 'Green', value: 'hsl(var(--success))' },
  { label: 'Orange', value: 'hsl(var(--warning))' },
  { label: 'Purple', value: 'hsl(var(--chart-4))' },
  { label: 'Red', value: 'hsl(var(--destructive))' },
  { label: 'Cyan', value: 'hsl(var(--info))' },
];

const SOURCE_ICONS: Record<string, any> = {
  meeting: Video,
  deal: Handshake,
  task: CheckSquare,
  invoice: Receipt,
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [customers, setCustomers] = useState<{ id: string; full_name: string }[]>([]);
  const [dragEvent, setDragEvent] = useState<CalendarEvent | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any | null>(null);

  // Form state
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const [form, setForm] = useState({
    title: '', description: '', start_date: '', start_time: '09:00',
    end_date: '', end_time: '10:00', all_day: false,
    color: EVENT_COLORS[0].value, location: '', reminder_minutes: 15, customer_id: '',
  });

  const resetForm = () => setForm({
    title: '', description: '', start_date: '', start_time: '09:00',
    end_date: '', end_time: '10:00', all_day: false,
    color: EVENT_COLORS[0].value, location: '', reminder_minutes: 15, customer_id: '',
  });

  // Load calendar events + CRM auto-synced items
  const loadEvents = useCallback(async () => {
    setLoading(true);
    const allEvents: CalendarEvent[] = [];

    // 1. Manual/Google calendar events
    const { data: manual } = await supabase.from('calendar_events').select('*').order('start_time');
    if (manual) allEvents.push(...manual.map(e => ({ ...e, color: e.color || EVENT_COLORS[0].value })));

    // 2. Meetings as events
    const { data: meetings } = await supabase.from('meetings').select('id, title, scheduled_at, status, customer_id, category');
    if (meetings) {
      for (const m of meetings) {
        if (!m.scheduled_at) continue;
        allEvents.push({
          id: `meeting-${m.id}`, title: `📹 ${m.title}`, start_time: m.scheduled_at,
          end_time: null, all_day: false, color: 'hsl(var(--info))',
          source: 'meeting', source_id: m.id, customer_id: m.customer_id, category: m.category,
        });
      }
    }

    // 3. Deals expected close dates
    const { data: deals } = await supabase.from('deals').select('id, title, expected_close_date, customer_id, category');
    if (deals) {
      for (const d of deals) {
        if (!d.expected_close_date) continue;
        allEvents.push({
          id: `deal-${d.id}`, title: `🤝 ${d.title}`, start_time: `${d.expected_close_date}T09:00:00`,
          end_time: null, all_day: true, color: 'hsl(var(--warning))',
          source: 'deal', source_id: d.id, customer_id: d.customer_id, category: d.category,
        });
      }
    }

    // 4. Tasks due dates
    const { data: tasks } = await supabase.from('tasks').select('id, title, due_date, category');
    if (tasks) {
      for (const t of tasks) {
        if (!t.due_date) continue;
        allEvents.push({
          id: `task-${t.id}`, title: `✅ ${t.title}`, start_time: `${t.due_date}T09:00:00`,
          end_time: null, all_day: true, color: 'hsl(var(--success))',
          source: 'task', source_id: t.id, category: t.category,
        });
      }
    }

    // 5. Invoice due dates (exclude voided)
    const { data: invoices } = await supabase.from('invoices').select('*, customers(full_name, email)').not('status', 'eq', 'voided').order('created_at');
    if (invoices) {
      for (const inv of invoices) {
        if (!inv.due_date) continue;
        const isPaid = inv.status === 'paid';
        allEvents.push({
          id: `invoice-${inv.id}`, title: `💰 Invoice ${inv.invoice_number || ''} - $${inv.amount}`,
          start_time: `${inv.due_date}T09:00:00`, end_time: null, all_day: true,
          color: isPaid ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
          source: 'invoice', source_id: inv.id, customer_id: inv.customer_id,
          _invoiceData: inv,
        });
      }
    }

    setEvents(allEvents);
    setLoading(false);
  }, []);

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name').order('full_name');
    setCustomers(data || []);
  };

  useEffect(() => { loadEvents(); loadCustomers(); }, [loadEvents]);

  // Navigation
  const goNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };
  const goPrev = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(subWeeks(currentDate, -1));
    else setCurrentDate(addDays(currentDate, -1));
  };
  const goToday = () => setCurrentDate(new Date());

  // Event CRUD
  const openCreate = (date?: Date) => {
    resetForm();
    if (date) {
      setForm(f => ({
        ...f,
        start_date: format(date, 'yyyy-MM-dd'),
        end_date: format(date, 'yyyy-MM-dd'),
      }));
    }
    setEditEvent(null);
    setDialogOpen(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    if (ev.source !== 'manual' && ev.source !== 'google-calendar') {
      // For CRM-synced events, show detail view instead of edit
      if (ev.source === 'invoice' && ev._invoiceData) {
        setInvoiceDetail(ev._invoiceData);
      } else {
        setDetailEvent(ev);
      }
      return;
    }
    const start = parseISO(ev.start_time);
    const end = ev.end_time ? parseISO(ev.end_time) : start;
    setForm({
      title: ev.title, description: ev.description || '',
      start_date: format(start, 'yyyy-MM-dd'), start_time: format(start, 'HH:mm'),
      end_date: format(end, 'yyyy-MM-dd'), end_time: format(end, 'HH:mm'),
      all_day: ev.all_day, color: ev.color || EVENT_COLORS[0].value,
      location: ev.location || '', reminder_minutes: ev.reminder_minutes || 15,
      customer_id: ev.customer_id || '',
    });
    setEditEvent(ev);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.start_date) { toast.error('Title and date are required'); return; }
    const startStr = form.all_day ? `${form.start_date}T00:00:00` : `${form.start_date}T${form.start_time}:00`;
    const endStr = form.all_day
      ? (form.end_date ? `${form.end_date}T23:59:59` : null)
      : (form.end_date ? `${form.end_date}T${form.end_time}:00` : null);

    const payload = {
      title: form.title, description: form.description || null,
      start_time: startStr, end_time: endStr, all_day: form.all_day,
      color: form.color, location: form.location || null,
      reminder_minutes: form.reminder_minutes, source: 'manual',
      customer_id: form.customer_id || null, created_by: user?.id || null,
    };

    if (editEvent) {
      const { error } = await supabase.from('calendar_events').update(payload).eq('id', editEvent.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Event updated');
    } else {
      const { error } = await supabase.from('calendar_events').insert([payload]);
      if (error) { toast.error(error.message); return; }
      toast.success('Event created');
    }
    setDialogOpen(false);
    loadEvents();
  };

  const handleDelete = async (id: string) => {
    let error: any = null;

    if (id.startsWith('meeting-')) {
      const realId = id.replace('meeting-', '');
      ({ error } = await supabase.from('meetings').delete().eq('id', realId));
    } else if (id.startsWith('deal-')) {
      const realId = id.replace('deal-', '');
      ({ error } = await supabase.from('deals').delete().eq('id', realId));
    } else if (id.startsWith('task-')) {
      const realId = id.replace('task-', '');
      ({ error } = await supabase.from('tasks').delete().eq('id', realId));
    } else if (id.startsWith('invoice-')) {
      // Void the invoice instead of hard-deleting
      const realId = id.replace('invoice-', '');
      ({ error } = await supabase.from('invoices').update({ status: 'voided' }).eq('id', realId));
    } else {
      ({ error } = await supabase.from('calendar_events').delete().eq('id', id));
    }

    if (error) { toast.error(error.message); return; }

    // Log deletion to activity_log for notifications
    const ev = events.find(e => e.id === id);
    if (ev) {
      const entityType = ev.source === 'manual' || ev.source === 'google-calendar' ? 'calendar_event' : ev.source;
      const entityId = ev.source_id || ev.id;
      await supabase.from('activity_log').insert([{
        entity_type: entityType,
        entity_id: entityId,
        action: 'deleted',
        meta: { name: ev.title },
      }]);
    }

    toast.success('Removed from calendar');
    loadEvents();
  };

  // Drag-and-drop: move an event to a new date
  const handleDrop = async (ev: CalendarEvent, newDate: Date) => {
    const newDateStr = format(newDate, 'yyyy-MM-dd');
    const oldStart = parseISO(ev.start_time);
    const timeStr = format(oldStart, 'HH:mm:ss');

    let error: any = null;

    if (ev.source === 'manual' || ev.source === 'google-calendar' || ev.source === 'booking') {
      const newStartTime = `${newDateStr}T${timeStr}`;
      let newEndTime: string | null = null;
      if (ev.end_time) {
        const oldEnd = parseISO(ev.end_time);
        const diff = oldEnd.getTime() - oldStart.getTime();
        newEndTime = new Date(parseISO(newStartTime).getTime() + diff).toISOString();
      }
      ({ error } = await supabase.from('calendar_events').update({ start_time: newStartTime, end_time: newEndTime }).eq('id', ev.id));
    } else if (ev.id.startsWith('meeting-')) {
      ({ error } = await supabase.from('meetings').update({ scheduled_at: `${newDateStr}T${timeStr}` }).eq('id', ev.source_id!));
    } else if (ev.id.startsWith('deal-')) {
      ({ error } = await supabase.from('deals').update({ expected_close_date: newDateStr }).eq('id', ev.source_id!));
    } else if (ev.id.startsWith('task-')) {
      ({ error } = await supabase.from('tasks').update({ due_date: newDateStr }).eq('id', ev.source_id!));
    } else if (ev.id.startsWith('invoice-')) {
      ({ error } = await supabase.from('invoices').update({ due_date: newDateStr }).eq('id', ev.source_id!));
    }

    if (error) { toast.error(error.message); return; }

    // Log to activity_log so Telegram + system notifications fire
    const entityType = ev.source === 'manual' || ev.source === 'google-calendar' || ev.source === 'booking'
      ? 'calendar_event' : ev.source;
    const entityId = ev.source_id || ev.id;
    await supabase.from('activity_log').insert([{
      entity_type: entityType,
      entity_id: entityId,
      action: 'rescheduled',
      meta: { name: ev.title, moved_to: format(newDate, 'yyyy-MM-dd') },
    }]);

    toast.success(`Moved to ${format(newDate, 'MMM d')}`);
    loadEvents();
  };

  const getEventsForDay = useCallback((date: Date) => {
    return events.filter(ev => {
      const start = parseISO(ev.start_time);
      return isSameDay(start, date);
    });
  }, [events]);

  // Navigation title
  const headerTitle = useMemo(() => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy');
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const we = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'EEEE, MMMM d, yyyy');
  }, [view, currentDate]);

  // Month grid days
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
    const days: Date[] = [];
    let day = start;
    while (day <= end) { days.push(day); day = addDays(day, 1); }
    return days;
  }, [currentDate]);

  // Week days
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  // Agenda events (next 30 days)
  const agendaEvents = useMemo(() => {
    const now = startOfDay(new Date());
    const end = addDays(now, 30);
    return events
      .filter(ev => {
        const s = parseISO(ev.start_time);
        return s >= now && s <= end;
      })
      .sort((a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime());
  }, [events]);

  const EventPill = ({ ev, compact = false }: { ev: CalendarEvent; compact?: boolean }) => {
    const SourceIcon = SOURCE_ICONS[ev.source];
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          setDragEvent(ev);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (ev.source === 'invoice' && ev._invoiceData) {
            setInvoiceDetail(ev._invoiceData);
          } else {
            setDetailEvent(ev);
          }
        }}
        className={cn(
          "text-left w-full rounded px-1.5 py-0.5 text-[11px] font-medium truncate transition-opacity hover:opacity-80 cursor-grab active:cursor-grabbing group",
          compact ? "leading-tight" : "leading-normal"
        )}
        style={{ backgroundColor: ev.color, color: '#fff' }}
        title="Drag to move · Click to edit · Double-click for details"
      >
        <span className="flex items-center gap-1">
          {SourceIcon && <SourceIcon className="h-3 w-3 shrink-0" />}
          {!ev.all_day && <span className="opacity-75">{format(parseISO(ev.start_time), 'h:mma').toLowerCase()}</span>}
          <span className="truncate">{ev.title}</span>
        </span>
      </div>
    );
  };

  // ─── MONTH VIEW ──────────────────────────────────────
  const MonthView = () => (
    <div className="grid grid-cols-7 border border-border rounded-lg overflow-hidden" style={{ gridAutoRows: 'auto' }}>
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
        <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1.5 bg-muted/50 border-b border-border">{d}</div>
      ))}
      {monthDays.map((day, i) => {
        const dayEvents = getEventsForDay(day);
        const isToday = isSameDay(day, new Date());
        const isCurrentMonth = isSameMonth(day, currentDate);
        return (
          <div
            key={i}
            onClick={() => openCreate(day)}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/10'); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove('bg-primary/10'); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('bg-primary/10');
              if (dragEvent) { handleDrop(dragEvent, day); setDragEvent(null); }
            }}
            className={cn(
              "p-1 border-b border-r border-border cursor-pointer hover:bg-muted/30 transition-colors",
              !isCurrentMonth && "bg-muted/20"
            )}
            style={{ minHeight: '72px' }}
          >
            <div className={cn(
              "text-[11px] font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full",
              isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground/50"
            )}>
              {format(day, 'd')}
            </div>
            <div className="space-y-px">
              {dayEvents.map(ev => <EventPill key={ev.id} ev={ev} compact />)}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─── WEEK VIEW ───────────────────────────────────────
  const WeekView = () => (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/50">
        <div className="border-r border-border" />
        {weekDays.map((d, i) => (
          <div key={i} className={cn(
            "text-center py-2 border-r border-border last:border-r-0",
            isSameDay(d, new Date()) && "bg-primary/10"
          )}>
            <div className="text-[10px] text-muted-foreground uppercase">{format(d, 'EEE')}</div>
            <div className={cn(
              "text-sm font-medium w-7 h-7 mx-auto flex items-center justify-center rounded-full",
              isSameDay(d, new Date()) ? "bg-primary text-primary-foreground" : "text-foreground"
            )}>{format(d, 'd')}</div>
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="max-h-[600px] overflow-y-auto">
        {HOURS.map(hour => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] min-h-[48px]">
            <div className="text-[10px] text-muted-foreground text-right pr-2 pt-1 border-r border-border">
              {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
            </div>
            {weekDays.map((d, i) => {
              const dayEvents = getEventsForDay(d).filter(ev => {
                if (ev.all_day) return hour === 0;
                const h = parseISO(ev.start_time).getHours();
                return h === hour;
              });
              return (
                <div
                  key={i}
                  onClick={() => {
                    const clickDate = setMinutes(setHours(d, hour), 0);
                    openCreate(clickDate);
                  }}
                  className="border-r border-b border-border last:border-r-0 p-0.5 cursor-pointer hover:bg-muted/20"
                >
                  {dayEvents.map(ev => <EventPill key={ev.id} ev={ev} />)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  // ─── DAY VIEW ────────────────────────────────────────
  const DayView = () => {
    const dayEvents = getEventsForDay(currentDate);
    const allDayEvents = dayEvents.filter(e => e.all_day);
    const timedEvents = dayEvents.filter(e => !e.all_day);

    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="p-3 bg-muted/50 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{format(currentDate, 'EEEE, MMMM d')}</h3>
          {allDayEvents.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {allDayEvents.map(ev => <EventPill key={ev.id} ev={ev} />)}
            </div>
          )}
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {HOURS.map(hour => {
            const hourEvents = timedEvents.filter(ev => parseISO(ev.start_time).getHours() === hour);
            return (
              <div
                key={hour}
                onClick={() => openCreate(setMinutes(setHours(currentDate, hour), 0))}
                className="flex min-h-[48px] border-b border-border cursor-pointer hover:bg-muted/20"
              >
                <div className="w-16 text-[10px] text-muted-foreground text-right pr-2 pt-1 border-r border-border shrink-0">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
                <div className="flex-1 p-0.5 space-y-0.5">
                  {hourEvents.map(ev => <EventPill key={ev.id} ev={ev} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── AGENDA VIEW ─────────────────────────────────────
  const AgendaView = () => {
    const grouped = useMemo(() => {
      const map: Record<string, CalendarEvent[]> = {};
      for (const ev of agendaEvents) {
        const key = format(parseISO(ev.start_time), 'yyyy-MM-dd');
        if (!map[key]) map[key] = [];
        map[key].push(ev);
      }
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    }, [agendaEvents]);

    return (
      <div className="space-y-3">
        {grouped.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">No upcoming events in the next 30 days.</div>
        ) : grouped.map(([dateStr, evts]) => (
          <div key={dateStr} className="glass-card overflow-hidden">
            <div className="px-4 py-2 bg-muted/50 border-b border-border">
              <h4 className="text-sm font-semibold text-foreground">
                {format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')}
                {isSameDay(parseISO(dateStr), new Date()) && <span className="ml-2 text-xs text-primary">(Today)</span>}
              </h4>
            </div>
            <div className="divide-y divide-border">
              {evts.map(ev => {
                const SourceIcon = SOURCE_ICONS[ev.source];
                return (
                  <div key={ev.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{ev.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {ev.all_day ? 'All day' : format(parseISO(ev.start_time), 'h:mm a')}
                        {ev.location && ` · ${ev.location}`}
                      </p>
                    </div>
                    {SourceIcon && <SourceIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <div className="flex items-center gap-1">
                      {(ev.source === 'manual') && (
                        <button onClick={() => openEdit(ev)} className="text-muted-foreground hover:text-primary">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(ev.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Calendar</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View switcher */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
            <Button onClick={() => openCreate()} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New Event
            </Button>
          </div>
        </div>

        {/* Nav bar */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-sm font-medium text-foreground min-w-[200px] text-center">{headerTitle}</h2>
          <Button variant="ghost" size="icon" onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
        </div>

        {/* Calendar body */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading calendar...</div>
        ) : (
          <>
            {view === 'month' && <MonthView />}
            {view === 'week' && <WeekView />}
            {view === 'day' && <DayView />}
            {view === 'agenda' && <AgendaView />}
          </>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editEvent ? 'Edit Event' : 'New Event'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Event title" />
              </div>

              <div className="flex items-center gap-3">
                <Label>All day</Label>
                <Switch checked={form.all_day} onCheckedChange={v => setForm({ ...form, all_day: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Start date</Label>
                  <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                {!form.all_day && (
                  <div className="space-y-1">
                    <Label className="text-xs">Start time</Label>
                    <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">End date</Label>
                  <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
                {!form.all_day && (
                  <div className="space-y-1">
                    <Label className="text-xs">End time</Label>
                    <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>

              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Optional" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-1.5">
                    {EVENT_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setForm({ ...form, color: c.value })}
                        className={cn("w-6 h-6 rounded-full border-2 transition-transform", form.color === c.value ? "border-foreground scale-110" : "border-transparent")}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Reminder</Label>
                  <Select value={String(form.reminder_minutes)} onValueChange={v => setForm({ ...form, reminder_minutes: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">None</SelectItem>
                      <SelectItem value="5">5 min</SelectItem>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="1440">1 day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Customer (optional)</Label>
                <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1">{editEvent ? 'Update' : 'Create'}</Button>
                {editEvent && (
                  <Button variant="destructive" size="icon" onClick={() => { handleDelete(editEvent.id); setDialogOpen(false); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
      </Dialog>

        {/* Detail View Dialog */}
        <Dialog open={!!detailEvent} onOpenChange={(open) => { if (!open) setDetailEvent(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {detailEvent && (
                  <>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: detailEvent.color }} />
                    {detailEvent.title}
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            {detailEvent && (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    {detailEvent.all_day
                      ? format(parseISO(detailEvent.start_time), 'MMMM d, yyyy') + ' · All day'
                      : format(parseISO(detailEvent.start_time), 'MMMM d, yyyy · h:mm a') +
                        (detailEvent.end_time ? ` – ${format(parseISO(detailEvent.end_time), 'h:mm a')}` : '')}
                  </span>
                </div>
                {detailEvent.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">📍</span>
                    <span>{detailEvent.location}</span>
                  </div>
                )}
                {detailEvent.description && (
                  <div className="bg-muted/50 rounded-md p-3 text-foreground whitespace-pre-wrap">{detailEvent.description}</div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span className="capitalize">Source: {detailEvent.source}</span>
                  {detailEvent.category && <span>· {detailEvent.category}</span>}
                </div>
                <div className="flex gap-2 pt-2">
                  {(detailEvent.source === 'manual' || detailEvent.source === 'google-calendar') && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setDetailEvent(null); openEdit(detailEvent); }}>
                      <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => { handleDelete(detailEvent.id); setDetailEvent(null); }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Invoice Detail Modal */}
        <Dialog open={!!invoiceDetail} onOpenChange={(open) => { if (!open) setInvoiceDetail(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Invoice {invoiceDetail?.invoice_number || ''}
              </DialogTitle>
            </DialogHeader>
            {invoiceDetail && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-foreground">${Number(invoiceDetail.amount).toFixed(2)} {invoiceDetail.currency}</p>
                    <Badge variant={invoiceDetail.status === 'paid' ? 'default' : 'destructive'} className="capitalize mt-1">
                      {invoiceDetail.status}
                    </Badge>
                  </div>
                  {invoiceDetail.due_date && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Due Date</p>
                      <p className="text-sm font-medium">{format(parseISO(invoiceDetail.due_date), 'MMM d, yyyy')}</p>
                    </div>
                  )}
                </div>

                {invoiceDetail.customers && (
                  <div className="glass-card p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <User className="h-3 w-3" /> Customer
                    </p>
                    <p className="text-sm font-medium">{invoiceDetail.customers.full_name}</p>
                    {invoiceDetail.customers.email && (
                      <p className="text-xs text-muted-foreground">{invoiceDetail.customers.email}</p>
                    )}
                  </div>
                )}

                {/* Line Items */}
                {invoiceDetail.line_items && Array.isArray(invoiceDetail.line_items) && invoiceDetail.line_items.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Line Items</p>
                    <div className="glass-card divide-y divide-border">
                      {invoiceDetail.line_items.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2.5">
                          <div>
                            <p className="text-sm">{item.description || item.name || 'Item'}</p>
                            {item.quantity && <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>}
                          </div>
                          <p className="text-sm font-medium">${Number(item.amount || item.total || 0).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="text-sm font-medium">${Number(invoiceDetail.subtotal || 0).toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Tax Rate</p>
                    <p className="text-sm font-medium">{Number(invoiceDetail.tax_rate || 0)}%</p>
                  </div>
                  {invoiceDetail.sent_at && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Sent</p>
                      <p className="text-sm">{format(parseISO(invoiceDetail.sent_at), 'MMM d, yyyy')}</p>
                    </div>
                  )}
                  {invoiceDetail.paid_at && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Paid</p>
                      <p className="text-sm">{format(parseISO(invoiceDetail.paid_at), 'MMM d, yyyy')}</p>
                    </div>
                  )}
                </div>

                {invoiceDetail.notes && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm text-foreground">{invoiceDetail.notes}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button size="sm" variant="destructive" className="w-full" onClick={() => {
                    handleDelete(`invoice-${invoiceDetail.id}`);
                    setInvoiceDetail(null);
                  }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Void Invoice
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <CortexTerminal
          module="calendar"
          label="Calendar Terminal"
          hint="create events, reschedule, query schedule"
          placeholder="schedule a meeting next Friday at 10am, show this week's events…"
        />

        <AIGenerationTerminal />
    </div>
  </AppLayout>
  );
}
