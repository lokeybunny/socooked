import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Search, Phone, Mail, User, StickyNote, Bot, Plus, Pencil, Trash2, ArrowRight, ArrowLeft, UserCheck, Maximize2, GripVertical, UserPlus, Building2, Globe, Linkedin, ExternalLink, Instagram, Layers, Undo2, CalendarClock, ChevronUp, Play, Square, Send, Gift, FileEdit, Paperclip, X, MessageSquare, Clock } from 'lucide-react';
import { CustomerWebPreviews } from '@/components/CustomerWebPreviews';
import { upsertAiPreview } from '@/lib/upsertAiPreview';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, useDroppable, pointerWithin } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';

const DISPLAY_CATEGORIES = SERVICE_CATEGORIES.filter(c => c.id !== 'potential');
const emptyForm = { full_name: '', email: '', phone: '', address: '', company: '', source: '', notes: '', tags: '', category: '', instagram_handle: '', portal_niche: '', ai_website: '' };
const sources = ['x', 'twitter', 'reddit', 'craigslist', 'web', 'email', 'sms', 'linkedin', 'other'];
const PAGE_SIZE = 10;

const STATUS_LABELS: Record<string, string> = { lead: 'Lead', prospect: 'Prospect', prospect_emailed: 'Prospect (AI Site Completed)', active: 'Client', monthly: 'Monthly Client', inactive: 'Dismissed' };

const getCategoryLabel = (cat: string | null) => {
  const found = DISPLAY_CATEGORIES.find(c => c.id === cat);
  return found ? found.label : cat || '—';
};

async function logStatusMove(contactName: string, contactId: string, fromStatus: string, toStatus: string, category?: string) {
  const from = STATUS_LABELS[fromStatus] || fromStatus;
  const to = STATUS_LABELS[toStatus] || toStatus;
  await supabase.from('activity_log').insert({
    entity_type: 'customer',
    entity_id: contactId,
    action: 'moved',
    meta: {
      name: contactName,
      message: `*${contactName}* moved from *${from}* → *${to}*`,
      from_status: fromStatus,
      to_status: toStatus,
      category: category || 'other',
    },
  });
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("space-y-3 min-h-[12rem] rounded-xl transition-colors p-1 -m-1", isOver && "bg-primary/5 ring-2 ring-primary/20 ring-dashed")}>
      {children}
    </div>
  );
}

function DraggableContactCard({ contact, onClick, onDelete, onEmailClick, onSmsConfirm, isProspect, isPaid, isEmailed, recordingUrl, bookingStatus, onToggleBusy }: { contact: any; onClick: () => void; onDelete: (id: string) => void; onEmailClick?: (contact: any) => void; onSmsConfirm?: (contact: any) => void; isProspect?: boolean; isPaid?: boolean; isEmailed?: boolean; recordingUrl?: string; bookingStatus?: 'upcoming' | 'past'; onToggleBusy?: (contact: any) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: contact.id, data: { status: contact.status } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const [minimized, setMinimized] = useState(isPaid ? true : false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const isBusy = !!(contact.meta && typeof contact.meta === 'object' && (contact.meta as any).is_busy);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full text-left glass-card space-y-3 hover:ring-2 transition-all rounded-xl relative",
        bookingStatus === 'past' ? 'bg-red-500/15 hover:ring-red-500/40 border-l-2 border-l-red-500' :
        bookingStatus === 'upcoming' ? 'bg-yellow-500/10 hover:ring-yellow-500/40 border-l-2 border-l-yellow-500' :
        isBusy ? 'bg-yellow-500/10 hover:ring-yellow-500/40 border-l-2 border-l-yellow-500' :
        isEmailed ? 'bg-emerald-500/10 hover:ring-emerald-500/40 border-l-2 border-l-emerald-500' :
        isPaid ? 'hover:ring-emerald-500/40 border-l-2 border-l-emerald-500' : isProspect ? 'hover:ring-primary/40 border-l-2 border-l-primary' : 'hover:ring-primary/30',
        isDragging && 'opacity-40 shadow-lg',
        minimized ? 'p-2.5' : 'p-4'
      )}
    >
      <button {...attributes} {...listeners} className="absolute top-3 left-3 p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="absolute top-3 right-3 flex items-center gap-0.5">
        {isPaid && (
          <button className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }} title={minimized ? 'Expand' : 'Minimize'}>
            {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        )}
        <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onClick(); }} title="View details">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-6 flex-wrap min-w-0">
        <span className={cn("font-semibold truncate", isPaid ? 'text-emerald-500' : isProspect && !(contact.meta && typeof contact.meta === 'object' && (contact.meta as any).ai_website) ? 'text-red-500' : 'text-foreground')}>{contact.full_name}</span>
        {/* Email icon — light blue */}
        {contact.email && onEmailClick && (
          <button
            className="shrink-0 text-sky-400 hover:text-sky-300 transition-colors"
            title="Send website email"
            onClick={(e) => { e.stopPropagation(); onEmailClick(contact); }}
          >
            <Mail className="h-3.5 w-3.5" />
          </button>
        )}
        {/* SMS confirm icon — blue */}
        {contact.phone && onSmsConfirm && (
          <button
            className="shrink-0 text-blue-400 hover:text-blue-300 transition-colors"
            title="Confirm text sent"
            onClick={(e) => { e.stopPropagation(); onSmsConfirm(contact); }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        )}
        {(() => {
          const meta = contact.meta && typeof contact.meta === 'object' ? contact.meta : {};
          const clUrl = (meta as Record<string, unknown>).craigslist_url as string | undefined;
          if (!clUrl) return null;
          return (
            <a href={clUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open Craigslist post" className="shrink-0 text-purple-500 hover:text-purple-400 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          );
        })()}
        {(() => {
          const hasRecording = !!recordingUrl;
          const hasPhone = !!contact.phone;
          return (
            <button
              className={cn("shrink-0 transition-colors", hasRecording ? 'text-emerald-500 hover:text-emerald-400' : 'text-muted-foreground/40 hover:text-emerald-500')}
              title={playing ? 'Stop recording' : hasRecording ? 'Play call recording' : hasPhone ? 'Fetch & play recording' : 'No phone number'}
              onClick={async (e) => {
                e.stopPropagation();
                if (playing && audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current.currentTime = 0;
                  setPlaying(false);
                  return;
                }
                if (hasRecording) {
                  if (!audioRef.current) {
                    audioRef.current = new Audio(recordingUrl);
                    audioRef.current.onended = () => setPlaying(false);
                  }
                  audioRef.current.play().catch(() => {});
                  setPlaying(true);
                } else if (hasPhone) {
                  // On-demand fetch from RingCentral
                  toast.info(`Fetching recordings for ${contact.full_name}...`);
                  try {
                    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/ringcentral-recordings`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
                      body: JSON.stringify({ action: 'pull', customer_id: contact.id }),
                    });
                    const data = await res.json();
                    if (data.pulled > 0) {
                      toast.success(`Found ${data.pulled} recording(s) — refreshing...`);
                      // Small delay then parent will reload
                      setTimeout(() => window.dispatchEvent(new Event('leads-reload')), 500);
                    } else {
                      toast.info('No recordings found for this contact');
                    }
                  } catch (err) {
                    toast.error('Failed to fetch recordings');
                  }
                } else {
                  toast.info('No phone number on file');
                }
              }}
            >
              {playing ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            </button>
          );
        })()}
        {(() => {
          const meta = contact.meta && typeof contact.meta === 'object' ? contact.meta : {};
          const callbackAt = (meta as Record<string, unknown>).callback_at as string | undefined;
          if (!callbackAt) return null;
          const cbDate = new Date(callbackAt);
          const isPast = cbDate < new Date();
          return isProspect ? (
            <span className={cn(
              "shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1",
              isPast ? 'bg-destructive text-destructive-foreground animate-pulse' : 'bg-destructive/15 text-destructive'
            )}>
              <CalendarClock className="h-3 w-3" />
              {format(cbDate, 'MMM d, h:mm a')}
            </span>
          ) : (
            <span title={`Follow-up: ${format(cbDate, 'MMM d, h:mm a')}`} className="shrink-0">
              <CalendarClock className="h-3.5 w-3.5 text-blue-500" />
            </span>
          );
        })()}
        {contact.source && (
          <span className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase shrink-0">{contact.source}</span>
        )}
        {isPaid && minimized && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 shrink-0">Paid</span>
        )}
      </div>

      {!minimized && (
        <>
          {contact.category && (
            <div className="pl-6">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full", isPaid ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground')}>{getCategoryLabel(contact.category)}</span>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
              <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.email}</span>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <button
                className="hover:text-foreground transition-colors cursor-pointer font-mono"
                title="Click to copy"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(contact.phone).then(() => toast.success(`Copied ${contact.phone}`));
                }}
              >
                {contact.phone}
              </button>
            </div>
          )}
          {contact.company && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
              <User className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.company}</span>
            </div>
          )}
          <div className="flex items-center justify-between pl-6">
            <span className="text-[10px] text-muted-foreground">{new Date(contact.created_at).toLocaleDateString()}</span>
            <div className="flex items-center gap-0.5">
              <button className={cn("p-1 rounded-md transition-colors", isBusy ? 'text-yellow-500 hover:text-yellow-400' : 'text-muted-foreground/40 hover:text-yellow-500')} onClick={(e) => { e.stopPropagation(); onToggleBusy?.(contact); }} title={isBusy ? 'Unmark busy' : 'Mark as busy'}>
                <Clock className="h-3 w-3" />
              </button>
              <button className="p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={(e) => { e.stopPropagation(); onDelete(contact.id); }} title="Delete lead">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Leads() {
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [allProspects, setAllProspects] = useState<any[]>([]);
  const [allProspectEmailed, setAllProspectEmailed] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [allMonthly, setAllMonthly] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [prospectEmailed, setProspectEmailed] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [loading, setLoading] = useState(true);
  const [paidCustomerIds, setPaidCustomerIds] = useState<Set<string>>(new Set());
  const [recordingMap, setRecordingMap] = useState<Map<string, string>>(new Map());
  const [bookingStatusMap, setBookingStatusMap] = useState<Map<string, 'upcoming' | 'past'>>(new Map());
  const [websiteEmailedIds, setWebsiteEmailedIds] = useState<Set<string>>(new Set());
  const [leadsPage, setLeadsPage] = useState(1);
  const [prospectsPage, setProspectsPage] = useState(1);
  const [prospectEmailedPage, setProspectEmailedPage] = useState(1);
  const [clientsPage, setClientsPage] = useState(1);
  const [monthlyPage, setMonthlyPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ id: string; name: string; fromStatus: string; action: 'dismiss' | 'delete' | 'move' } | null>(null);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [callbackDate, setCallbackDate] = useState<Date | undefined>(undefined);
  const [callbackTime, setCallbackTime] = useState('10:00');
  const [callbackTarget, setCallbackTarget] = useState<any>(null);

  // ── Website Email Composer state ──
  const [emailComposeOpen, setEmailComposeOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<any>(null);
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', body: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [emailOfferA, setEmailOfferA] = useState(false);
  const [emailOfferB, setEmailOfferB] = useState(false);
  const [emailOfferC, setEmailOfferC] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ filename: string; mimeType: string; data: string; size: number }[]>([]);

  // ── SMS Confirm state ──
  const [smsConfirmOpen, setSmsConfirmOpen] = useState(false);
  const [smsConfirmTarget, setSmsConfirmTarget] = useState<any>(null);
  const [smsConfirming, setSmsConfirming] = useState(false);

  const openSmsConfirm = (contact: any) => {
    setSmsConfirmTarget(contact);
    setSmsConfirmOpen(true);
  };

  const handleSmsConfirmYes = async () => {
    if (!smsConfirmTarget?.id) return;
    setSmsConfirming(true);
    try {
      const prevStatus = smsConfirmTarget.status || 'prospect';
      const { error } = await supabase.from('customers').update({ status: 'prospect_emailed' }).eq('id', smsConfirmTarget.id);
      if (error) { toast.error('Failed to move customer'); return; }
      await logStatusMove(smsConfirmTarget.full_name, smsConfirmTarget.id, prevStatus, 'prospect_emailed', smsConfirmTarget.category);
      toast.success(`${smsConfirmTarget.full_name} moved to AI Site Completed`);
      setSmsConfirmOpen(false);
      setSmsConfirmTarget(null);
      loadAll();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSmsConfirming(false); }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const buildQuery = (status: string) => {
    let q = supabase.from('customers').select('*').eq('status', status).order('created_at', { ascending: false });
    if (filterSource !== 'all') q = q.eq('source', filterSource);
    if (filterCategory !== 'all') q = q.eq('category', filterCategory);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    return q;
  };

  const loadAll = async () => {
    setLeadsPage(1); setProspectsPage(1); setProspectEmailedPage(1); setClientsPage(1); setMonthlyPage(1);
    const [leadRes, prospectRes, prospectEmailedRes, clientRes, monthlyRes, paidRes, recRes, bookingsRes, websiteEmailRes] = await Promise.all([
      buildQuery('lead'),
      buildQuery('prospect'),
      buildQuery('prospect_emailed'),
      buildQuery('active'),
      buildQuery('monthly'),
      supabase.from('invoices').select('customer_id, status'),
      supabase.from('communications').select('customer_id, body, metadata').eq('type', 'recording').eq('provider', 'ringcentral').order('created_at', { ascending: false }),
      supabase.from('bookings').select('guest_email, guest_name, guest_phone, booking_date, start_time, status').neq('status', 'cancelled'),
      supabase.from('communications').select('customer_id, subject').eq('type', 'email').eq('direction', 'outbound').ilike('subject', '%Your Free Custom Website is Ready%'),
    ]);
    // Build set of customer IDs where ALL invoices are 'paid'
    const invoicesByCustomer = new Map<string, boolean>();
    (paidRes.data || []).forEach((inv: any) => {
      const cid = inv.customer_id;
      if (!invoicesByCustomer.has(cid)) invoicesByCustomer.set(cid, true);
      if (inv.status !== 'paid') invoicesByCustomer.set(cid, false);
    });
    const paidIds = new Set<string>();
    invoicesByCustomer.forEach((allPaid, cid) => { if (allPaid) paidIds.add(cid); });
    setPaidCustomerIds(paidIds);

    // Build map of customer_id → most recent recording URL
    const recMap = new Map<string, string>();
    (recRes.data || []).forEach((rec: any) => {
      if (rec.customer_id && !recMap.has(rec.customer_id)) {
        const url = (rec.metadata as any)?.recording_url || rec.body;
        if (url) recMap.set(rec.customer_id, url);
      }
    });
    setRecordingMap(recMap);

    // Build booking status map: match bookings to customers by email, name, or phone
    const allCustomers = [...(leadRes.data || []), ...(prospectRes.data || []), ...(prospectEmailedRes.data || []), ...(clientRes.data || []), ...(monthlyRes.data || [])];
    const emailToCustomerId = new Map<string, string>();
    const nameToCustomerId = new Map<string, string>();
    const phoneToCustomerId = new Map<string, string>();
    allCustomers.forEach((c: any) => {
      if (c.email) emailToCustomerId.set(c.email.toLowerCase(), c.id);
      if (c.full_name) nameToCustomerId.set(c.full_name.toLowerCase(), c.id);
      if (c.phone) {
        const digits = c.phone.replace(/\D/g, '');
        if (digits.length >= 7) phoneToCustomerId.set(digits.slice(-10), c.id);
      }
    });

    const now = new Date();
    const bMap = new Map<string, 'upcoming' | 'past'>();
    (bookingsRes.data || []).forEach((b: any) => {
      // Match booking to customer by email first, then name, then phone
      let customerId = (b.guest_email && emailToCustomerId.get(b.guest_email.toLowerCase()))
        || (b.guest_name && nameToCustomerId.get(b.guest_name.toLowerCase()));
      if (!customerId && b.guest_phone) {
        const digits = b.guest_phone.replace(/\D/g, '');
        if (digits.length >= 7) customerId = phoneToCustomerId.get(digits.slice(-10));
      }
      if (!customerId) return;

      const bookingDateTime = new Date(`${b.booking_date}T${b.start_time}`);
      const status: 'upcoming' | 'past' = bookingDateTime > now ? 'upcoming' : 'past';

      // Prefer 'upcoming' over 'past' if customer has multiple bookings
      const existing = bMap.get(customerId);
      if (!existing || (status === 'upcoming' && existing === 'past')) {
        bMap.set(customerId, status);
      }
    });
    setBookingStatusMap(bMap);

    // Build set of customer IDs that received the "Your Free Custom Website is Ready" email
    const weIds = new Set<string>();
    (websiteEmailRes.data || []).forEach((c: any) => {
      if (c.customer_id) weIds.add(c.customer_id);
    });
    setWebsiteEmailedIds(weIds);

    setAllLeads(leadRes.data || []);
    setAllProspects(prospectRes.data || []);
    setAllProspectEmailed(prospectEmailedRes.data || []);
    setAllClients(clientRes.data || []);
    setAllMonthly(monthlyRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    setLeads(allLeads);
    setProspects(allProspects);
    setProspectEmailed(allProspectEmailed);
    setClients(allClients);
    setMonthly(allMonthly);
  }, [allLeads, allProspects, allProspectEmailed, allClients, allMonthly]);

  useEffect(() => { loadAll(); }, [search, filterSource, filterCategory]);

  // Listen for reload events (e.g. after on-demand recording fetch)
  useEffect(() => {
    const handler = () => loadAll();
    window.addEventListener('leads-reload', handler);
    return () => window.removeEventListener('leads-reload', handler);
  }, [search, filterSource, filterCategory]);

  // Stage filter — hide columns not matching
  const showLeads = filterStage === 'all' || filterStage === 'lead';
  const showProspects = filterStage === 'all' || filterStage === 'prospect';
  const showProspectEmailed = filterStage === 'all' || filterStage === 'prospect_emailed';
  const showClients = filterStage === 'all' || filterStage === 'active';
  const showMonthly = filterStage === 'all' || filterStage === 'monthly';
  const visibleColumnCount = [showLeads, showProspects, showProspectEmailed, showClients, showMonthly].filter(Boolean).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    const { error } = await supabase.from('customers').insert({
      full_name: form.full_name.trim(), email: form.email || null, phone: form.phone || null,
      address: form.address || null, company: form.company || null, source: form.source || 'manual',
      notes: form.notes || null, status: 'lead', category: form.category || 'other',
      instagram_handle: form.instagram_handle || null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Lead added');
    setForm(emptyForm); setAddOpen(false); loadAll();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !form.full_name.trim()) return;
    const existingMeta = selected.meta && typeof selected.meta === 'object' ? selected.meta as Record<string, unknown> : {};
    const { error } = await supabase.from('customers').update({
      full_name: form.full_name.trim(), email: form.email || null, phone: form.phone || null,
      address: form.address || null, company: form.company || null, source: form.source || null,
      notes: form.notes || null, category: form.category || 'other',
      instagram_handle: form.instagram_handle || null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      meta: { ...existingMeta, portal_niche: form.portal_niche || null, mv_client: form.portal_niche === 'mv', ai_website: form.ai_website || null },
    }).eq('id', selected.id);
    if (error) { toast.error(error.message); return; }
    if (form.ai_website) {
      await upsertAiPreview(selected.id, form.ai_website, form.full_name.trim());
    }
    toast.success('Lead updated');
    setEditing(false); setSelected(null); setForm(emptyForm); loadAll();
  };

  const handleToggleBusy = async (contact: any) => {
    const existingMeta = contact.meta && typeof contact.meta === 'object' ? contact.meta as Record<string, unknown> : {};
    const newBusy = !existingMeta.is_busy;
    const { error } = await supabase.from('customers').update({
      meta: { ...existingMeta, is_busy: newBusy },
    }).eq('id', contact.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(newBusy ? 'Marked as busy' : 'Unmarked busy');
    loadAll();
  };

  const handleDelete = async (id: string) => {
    try {
      const detachCardsPromise = supabase.from('cards').update({ customer_id: null }).eq('customer_id', id);
      const detachCommunicationsPromise = supabase.from('communications').update({ customer_id: null }).eq('customer_id', id);

      const deletionResults = await Promise.allSettled([
        detachCardsPromise,
        detachCommunicationsPromise,
        supabase.from('transcriptions').delete().eq('customer_id', id),
        supabase.from('signatures').delete().eq('customer_id', id),
        supabase.from('documents').delete().eq('customer_id', id),
        supabase.from('invoices').delete().eq('customer_id', id),
        supabase.from('interactions').delete().eq('customer_id', id),
        supabase.from('bot_tasks').delete().eq('customer_id', id),
        supabase.from('api_previews').delete().eq('customer_id', id),
        supabase.from('content_assets').delete().eq('customer_id', id),
        supabase.from('research_findings').delete().eq('customer_id', id),
        supabase.from('site_configs').delete().eq('customer_id', id),
        supabase.from('calendar_events').delete().eq('customer_id', id),
      ]);

      for (const result of deletionResults) {
        if (result.status === 'rejected') throw result.reason;
        if (result.value.error) throw result.value.error;
      }

      await supabase.from('conversation_threads').delete().eq('customer_id', id);
      await supabase.from('deals').delete().eq('customer_id', id);
      await supabase.from('meetings').delete().eq('customer_id', id);

      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;

      toast.success('Lead deleted');
      setSelected(null);
      loadAll();
    } catch (err: any) {
      console.error('Delete cascade error:', err);
      toast.error(`Delete failed: ${err?.message || 'Please try again.'}`);
    }
  };

  const promote = async (id: string) => {
    const contact = [...leads, ...prospects, ...prospectEmailed, ...clients].find(c => c.id === id);
    await supabase.from('customers').update({ status: 'prospect' }).eq('id', id);
    if (contact) await logStatusMove(contact.full_name, id, contact.status, 'prospect', contact.category);
    toast.success('Promoted to prospect'); setSelected(null); loadAll();
  };
  const demote = async (id: string) => {
    const contact = [...leads, ...prospects, ...prospectEmailed, ...clients].find(c => c.id === id);
    await supabase.from('customers').update({ status: 'lead' }).eq('id', id);
    if (contact) await logStatusMove(contact.full_name, id, contact.status, 'lead', contact.category);
    toast.success('Moved back to lead'); setSelected(null); loadAll();
  };
  const dismiss = async (id: string) => {
    const contact = [...leads, ...prospects, ...prospectEmailed, ...clients].find(c => c.id === id);
    await supabase.from('customers').update({ status: 'inactive' }).eq('id', id);
    if (contact) {
      await logStatusMove(contact.full_name, id, contact.status, 'inactive', contact.category);
      setLastAction({ id, name: contact.full_name, fromStatus: contact.status, action: 'dismiss' });
    }
    toast.success('Dismissed'); setSelected(null); loadAll();
  };

  const undoLastAction = async () => {
    if (!lastAction) return;
    const { error } = await supabase.from('customers').update({ status: lastAction.fromStatus }).eq('id', lastAction.id);
    if (error) { toast.error(error.message); return; }
    await logStatusMove(lastAction.name, lastAction.id, 'inactive', lastAction.fromStatus);
    toast.success(`Restored ${lastAction.name} to ${STATUS_LABELS[lastAction.fromStatus] || lastAction.fromStatus}`);
    setLastAction(null);
    loadAll();
  };

  const openCallbackScheduler = (contact: any) => {
    setCallbackTarget(contact);
    setCallbackDate(undefined);
    setCallbackTime('10:00');
    setCallbackOpen(true);
  };

  const handleConfirmCallback = async () => {
    if (!callbackTarget || !callbackDate) return;
    const existingMeta = typeof callbackTarget.meta === 'object' ? callbackTarget.meta : {};
    const [hours, minutes] = callbackTime.split(':').map(Number);
    const dt = new Date(callbackDate);
    dt.setHours(hours, minutes, 0, 0);
    const updatedMeta = { ...existingMeta, callback_at: dt.toISOString() };
    await supabase.from('customers').update({ meta: updatedMeta } as any).eq('id', callbackTarget.id);
    toast.success(`Call back scheduled for ${format(dt, 'MMM d, h:mm a')}`);
    setCallbackOpen(false);
    setCallbackTarget(null);
    setSelected(null);
    loadAll();
  };

  const openEdit = (lead: any) => {
    const meta = lead.meta && typeof lead.meta === 'object' ? lead.meta : {};
    setForm({
      full_name: lead.full_name || '', email: lead.email || '', phone: lead.phone || '',
      address: lead.address || '', company: lead.company || '', source: lead.source || '',
      notes: lead.notes || '',
      tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
      category: lead.category || 'other',
      instagram_handle: lead.instagram_handle || '',
      portal_niche: (meta.portal_niche as string) || (meta.mv_client ? 'mv' : ''),
      ai_website: (meta.ai_website as string) || '',
    });
    setEditing(true);
  };

  // ── Website Email Composer helpers ──
  const OFFER_A_HTML = `
<br/><hr style="border:none;border-top:1px solid #ccc;margin:24px 0"/>
<h3 style="margin-bottom:8px;">Option A — Own It Outright</h3>
<p>Your website is fully built and ready to go — completely free of charge. The only cost is the domain registration and hosting transfer fee of <strong>$10.41/month billed biannually</strong> (2 years of hosting &amp; domain for $250). There are no payment splits, no revenue sharing — the site is 100% yours.</p>`;

  const OFFER_B_HTML = `
<br/><hr style="border:none;border-top:1px solid #ccc;margin:24px 0"/>
<h3 style="margin-bottom:8px;">Option B — Warren Covers Everything</h3>
<p>Warren / STU25 will pay the entire $250 domain &amp; hosting cost on your behalf and fully build the website at no charge to you. In return, a payment gateway will be set up on the site where <strong>30% of all credit-card payments</strong> coming through the website go to Warren and <strong>you keep 70%</strong>. This split exists because Warren is covering the full cost of the website creation, domain registration, and hosting so you have zero out-of-pocket expense.</p>`;

  const OFFER_C_HTML = `
<br/><hr style="border:none;border-top:1px solid #ccc;margin:24px 0"/>
<h3 style="margin-bottom:8px;">Option C — Unlimited Website Updates</h3>
<p>For just <strong>$250/month</strong>, get unlimited additions and changes to your website. Simply email us your requests, and we'll get it done within 24 hours.</p>
<ul style="margin:12px 0;padding-left:20px;">
<li>Unlimited additions &amp; changes to your website</li>
<li>Must be paid upfront after website is live</li>
<li>Works with the "Own It Outright" Deal (Option A) or the Partnership Deal (Option B)</li>
</ul>`;

  const loadOfferAttachment = async (): Promise<{ filename: string; mimeType: string; data: string; size: number } | null> => {
    try {
      const res = await fetch('/images/offer-options.png');
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ filename: 'Website-Offer-Options.png', mimeType: 'image/png', data: base64, size: blob.size });
        };
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const loadMaintenanceAttachment = async (): Promise<{ filename: string; mimeType: string; data: string; size: number } | null> => {
    try {
      const res = await fetch('/images/option-c-maintenance.png');
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ filename: 'Option-C-Maintenance.png', mimeType: 'image/png', data: base64, size: blob.size });
        };
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const openEmailComposer = (contact: any) => {
    const meta = contact.meta && typeof contact.meta === 'object' ? contact.meta as Record<string, any> : {};
    const aiWebsite = meta.ai_website ? String(meta.ai_website) : '';
    const websiteUrl = aiWebsite.startsWith('http') ? aiWebsite : aiWebsite ? `https://${aiWebsite}` : '';
    const firstName = contact.full_name?.split(' ')[0] || contact.full_name || 'there';

    const subject = `Your Free Custom Website is Ready — ${contact.full_name}`;
    const body = `<p>Hi ${firstName},</p>

<p>I hope this message finds you well! I wanted to reach out personally because I built a <strong>completely free custom website</strong> for your business.</p>

${websiteUrl ? `<p>🔗 <strong>Your website preview:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>` : '<p><em>(Website link will be added here)</em></p>'}

<p>This is a fully designed, mobile-responsive website tailored specifically to what you do. It's ready to go live — no cost, no obligation to look at it.</p>

<p>I'd love to walk you through it and discuss a couple of simple options for getting it live on your own domain. Would you have a few minutes this week for a quick call or video chat?</p>

<p>Looking forward to hearing from you!</p>

<p>Best regards,<br/>
<strong>Warren</strong><br/>
STU25 — Web &amp; Social Media Services<br/>
warren@stu25.com</p>`;

    setEmailTarget(contact);
    setEmailForm({ to: contact.email || '', subject, body });
    setEmailOfferA(false);
    setEmailOfferB(false);
    setEmailOfferC(false);
    setEmailAttachments([]);
    setEmailComposeOpen(true);
  };

  const handleEmailSend = async () => {
    if (!emailForm.to || !emailForm.subject) { toast.error('Email and subject required'); return; }
    setEmailSending(true);
    try {
      let finalBody = emailForm.body;
      const allAtt = [...emailAttachments];

      if (emailOfferA || emailOfferB) {
        if (emailOfferA) finalBody += OFFER_A_HTML;
        if (emailOfferB) finalBody += OFFER_B_HTML;
        const att = await loadOfferAttachment();
        if (att && !allAtt.some(a => a.filename === att.filename)) allAtt.push(att);
      }
      if (emailOfferC) {
        finalBody += OFFER_C_HTML;
        const att = await loadMaintenanceAttachment();
        if (att && !allAtt.some(a => a.filename === att.filename)) allAtt.push(att);
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/gmail-api?action=send`, {
        method: 'POST',
        headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailForm.to,
          subject: emailForm.subject,
          body: finalBody,
          attachments: allAtt.length > 0 ? allAtt.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');

      // Log to communications
      await supabase.from('communications').insert({
        type: 'email',
        direction: 'outbound',
        to_address: emailForm.to,
        subject: emailForm.subject,
        body: finalBody,
        status: 'sent',
        provider: 'leads-email-composer',
        customer_id: emailTarget?.id || null,
      });

      // Auto-move customer to prospect_emailed status
      if (emailTarget?.id) {
        const prevStatus = emailTarget.status || 'prospect';
        const targetId = emailTarget.id;
        const targetName = emailTarget.full_name;
        const targetCategory = emailTarget.category;
        const { error: moveError } = await supabase.from('customers').update({ status: 'prospect_emailed' }).eq('id', targetId);
        if (moveError) {
          console.error('Failed to move customer to prospect_emailed:', moveError);
          toast.error('Email sent but failed to move customer');
        } else {
          await logStatusMove(targetName, targetId, prevStatus, 'prospect_emailed', targetCategory);
        }
      }

      toast.success(`Email sent to ${emailTarget?.full_name || emailForm.to}! Moved to AI Site Completed.`);
      setEmailComposeOpen(false);
      setEmailTarget(null);
      loadAll();
    } catch (e: any) { toast.error(e.message || 'Failed to send email'); }
    finally { setEmailSending(false); }
  };

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const draggedId = active.id as string;
    const allContacts = [...leads, ...prospects, ...prospectEmailed, ...clients, ...monthly];
    const draggedContact = allContacts.find(c => c.id === draggedId);
    if (!draggedContact) return;

    let targetStatus: string | null = null;
    const overId = over.id as string;
    if (overId === 'leads-column') targetStatus = 'lead';
    else if (overId === 'prospects-column') targetStatus = 'prospect';
    else if (overId === 'prospect-emailed-column') targetStatus = 'prospect_emailed';
    else if (overId === 'clients-column') targetStatus = 'active';
    else if (overId === 'monthly-column') targetStatus = 'monthly';
    else {
      const overContact = allContacts.find(c => c.id === overId);
      if (overContact) targetStatus = overContact.status;
    }
    if (!targetStatus || targetStatus === draggedContact.status) return;

    const updatedContact = { ...draggedContact, status: targetStatus, updated_at: new Date().toISOString() };
    const removeFromList = (list: any[]) => list.filter(c => c.id !== draggedId);
    const addToList = (list: any[]) => [updatedContact, ...list];

    setLeads(targetStatus === 'lead' ? addToList(removeFromList(leads)) : removeFromList(leads));
    setProspects(targetStatus === 'prospect' ? addToList(removeFromList(prospects)) : removeFromList(prospects));
    setProspectEmailed(targetStatus === 'prospect_emailed' ? addToList(removeFromList(prospectEmailed)) : removeFromList(prospectEmailed));
    setClients(targetStatus === 'active' ? addToList(removeFromList(clients)) : removeFromList(clients));
    setMonthly(targetStatus === 'monthly' ? addToList(removeFromList(monthly)) : removeFromList(monthly));

    const labels: Record<string, string> = { lead: 'Moved to leads', prospect: 'Promoted to prospect', prospect_emailed: 'Moved to AI Site Completed', active: 'Converted to client', monthly: 'Moved to monthly client' };
    toast.success(labels[targetStatus] || `Status: ${targetStatus}`);

    const { error } = await supabase.from('customers').update({ status: targetStatus }).eq('id', draggedId);
    if (error) { toast.error('Failed to update status'); loadAll(); }
    else { await logStatusMove(draggedContact.full_name, draggedId, draggedContact.status, targetStatus, draggedContact.category); }
  };

  const activeContact = activeId ? [...leads, ...prospects, ...prospectEmailed, ...clients, ...monthly].find(c => c.id === activeId) : null;

  const leadsPageCount = Math.ceil(leads.length / PAGE_SIZE);
  const prospectsPageCount = Math.ceil(prospects.length / PAGE_SIZE);
  const prospectEmailedPageCount = Math.ceil(prospectEmailed.length / PAGE_SIZE);
  const clientsPageCount = Math.ceil(clients.length / PAGE_SIZE);
  const monthlyPageCount = Math.ceil(monthly.length / PAGE_SIZE);
  const pagedLeads = leads.slice((leadsPage - 1) * PAGE_SIZE, leadsPage * PAGE_SIZE);
  const pagedProspects = prospects.slice((prospectsPage - 1) * PAGE_SIZE, prospectsPage * PAGE_SIZE);
  const pagedProspectEmailed = prospectEmailed.slice((prospectEmailedPage - 1) * PAGE_SIZE, prospectEmailedPage * PAGE_SIZE);
  const pagedClients = clients.slice((clientsPage - 1) * PAGE_SIZE, clientsPage * PAGE_SIZE);
  const pagedMonthly = monthly.slice((monthlyPage - 1) * PAGE_SIZE, monthlyPage * PAGE_SIZE);

  const PaginationButtons = ({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) => {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-1 pt-2">
        {Array.from({ length: total }, (_, i) => i + 1).map(p => (
          <Button key={p} size="sm" variant={p === current ? 'default' : 'outline'} className="h-8 w-8 p-0 text-xs" onClick={() => onChange(p)}>{p}</Button>
        ))}
      </div>
    );
  };

  const renderLeadForm = (onSubmit: (e: React.FormEvent) => void, submitLabel: string) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Company</Label><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
        <div className="space-y-2"><Label>Source</Label>
          <Select value={form.source || 'manual'} onValueChange={v => setForm({ ...form, source: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Instagram className="h-3.5 w-3.5" /> Instagram Handle</Label>
        <Input value={form.instagram_handle} onChange={e => setForm({ ...form, instagram_handle: e.target.value })} placeholder="@username (optional)" />
      </div>
      <div className="space-y-2"><Label>Tags</Label><Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Comma-separated, e.g. VIP, Referral" /></div>
      <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={form.category || 'other'} onValueChange={v => setForm({ ...form, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DISPLAY_CATEGORIES.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>)}
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {editing && (
        <>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> AI Generated Website</Label>
            <Input value={form.ai_website} onChange={e => setForm({ ...form, ai_website: e.target.value })} placeholder="https://v0-example.vercel.app" />
            {form.ai_website && (
              <a href={form.ai_website.startsWith('http') ? form.ai_website : `https://${form.ai_website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Open website
              </a>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Portal Landing Page</Label>
            </div>
            <Select value={form.portal_niche} onValueChange={v => setForm({ ...form, portal_niche: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="None (default uploader)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="mv">Music Video (MV)</SelectItem>
                <SelectItem value="realtor">Realtor</SelectItem>
                <SelectItem value="barber">Barber</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in p-6">
        <h1 className="text-2xl font-bold text-foreground">Leads Pipeline</h1>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-muted-foreground text-sm">{leads.length} leads · {prospects.length} prospects · {prospectEmailed.length} emailed · {clients.length} clients · {monthly.length} monthly · Drag to move</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={undoLastAction} disabled={!lastAction}>
              <Undo2 className="h-4 w-4 mr-2" />{lastAction ? `Undo (${lastAction.name})` : 'Undo'}
            </Button>
            <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); if (!o) setForm(emptyForm); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Lead</Button></DialogTrigger>
              <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
                {renderLeadForm(handleCreate, "Create Lead")}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search leads..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Sources" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {DISPLAY_CATEGORIES.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>)}
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Stages" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="lead">Leads Only</SelectItem>
              <SelectItem value="prospect">Prospects Only</SelectItem>
              <SelectItem value="prospect_emailed">AI Site Completed Only</SelectItem>
              <SelectItem value="active">New Clients Only</SelectItem>
              <SelectItem value="monthly">Monthly Clients Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className={cn("grid gap-6", visibleColumnCount === 1 ? 'lg:grid-cols-1 max-w-xl' : visibleColumnCount === 2 ? 'lg:grid-cols-2' : visibleColumnCount === 3 ? 'lg:grid-cols-3' : visibleColumnCount === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5')}>
            {showLeads && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Leads</h2>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{leads.length}</span>
              </div>
              <DroppableColumn id="leads-column">
                {pagedLeads.map(lead => (
                  <DraggableContactCard key={lead.id} contact={lead} onClick={() => { setSelected(lead); setEditing(false); }} onDelete={handleDelete} onEmailClick={openEmailComposer} onSmsConfirm={openSmsConfirm} isPaid={paidCustomerIds.has(lead.id)} recordingUrl={recordingMap.get(lead.id)} bookingStatus={bookingStatusMap.get(lead.id)} />
                ))}
                {leads.length === 0 && !loading && (
                  <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No leads yet</p>
                  </div>
                )}
              </DroppableColumn>
              <PaginationButtons current={leadsPage} total={leadsPageCount} onChange={setLeadsPage} />
            </div>
            )}

            {showProspects && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-primary uppercase tracking-wider">Prospects (pending websites)</h2>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{prospects.length}</span>
              </div>
              <DroppableColumn id="prospects-column">
                {pagedProspects.map(prospect => (
                  <DraggableContactCard key={prospect.id} contact={prospect} onClick={() => { setSelected(prospect); setEditing(false); }} onDelete={handleDelete} onEmailClick={openEmailComposer} onSmsConfirm={openSmsConfirm} isProspect isPaid={paidCustomerIds.has(prospect.id)} recordingUrl={recordingMap.get(prospect.id)} bookingStatus={bookingStatusMap.get(prospect.id)} />
                ))}
                {prospects.length === 0 && !loading && (
                  <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                    <ArrowLeft className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Promote leads to see them here</p>
                  </div>
                )}
              </DroppableColumn>
              <PaginationButtons current={prospectsPage} total={prospectsPageCount} onChange={setProspectsPage} />
            </div>
            )}

            {showProspectEmailed && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">Prospects (AI Site Completed)</h2>
                <span className="text-xs bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-full">{prospectEmailed.length}</span>
              </div>
              <DroppableColumn id="prospect-emailed-column">
                {pagedProspectEmailed.map(pe => (
                  <DraggableContactCard key={pe.id} contact={pe} onClick={() => { setSelected(pe); setEditing(false); }} onDelete={handleDelete} onEmailClick={openEmailComposer} onSmsConfirm={openSmsConfirm} isProspect isEmailed={websiteEmailedIds.has(pe.id)} isPaid={paidCustomerIds.has(pe.id)} recordingUrl={recordingMap.get(pe.id)} bookingStatus={bookingStatusMap.get(pe.id)} />
                ))}
                {prospectEmailed.length === 0 && !loading && (
                  <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                    <Send className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Send website emails to see them here</p>
                  </div>
                )}
              </DroppableColumn>
              <PaginationButtons current={prospectEmailedPage} total={prospectEmailedPageCount} onChange={setProspectEmailedPage} />
            </div>
            )}

            {showClients && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-primary uppercase tracking-wider">New Client</h2>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{clients.length}</span>
              </div>
              <DroppableColumn id="clients-column">
                {pagedClients.map(client => (
                  <DraggableContactCard key={client.id} contact={client} onClick={() => { setSelected(client); setEditing(false); }} onDelete={handleDelete} onEmailClick={openEmailComposer} onSmsConfirm={openSmsConfirm} isProspect isPaid={paidCustomerIds.has(client.id)} recordingUrl={recordingMap.get(client.id)} bookingStatus={bookingStatusMap.get(client.id)} />
                ))}
                {clients.length === 0 && !loading && (
                  <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Drag prospects here to convert</p>
                  </div>
                )}
              </DroppableColumn>
              <PaginationButtons current={clientsPage} total={clientsPageCount} onChange={setClientsPage} />
            </div>
            )}

            {showMonthly && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-emerald-500 uppercase tracking-wider">Monthly Client</h2>
                <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">{monthly.length}</span>
              </div>
              <DroppableColumn id="monthly-column">
                {pagedMonthly.map(m => (
                  <DraggableContactCard key={m.id} contact={m} onClick={() => { setSelected(m); setEditing(false); }} onDelete={handleDelete} onEmailClick={openEmailComposer} onSmsConfirm={openSmsConfirm} isPaid={paidCustomerIds.has(m.id)} recordingUrl={recordingMap.get(m.id)} bookingStatus={bookingStatusMap.get(m.id)} />
                ))}
                {monthly.length === 0 && !loading && (
                  <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                    <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Drag clients here for monthly</p>
                  </div>
                )}
              </DroppableColumn>
              <PaginationButtons current={monthlyPage} total={monthlyPageCount} onChange={setMonthlyPage} />
            </div>
            )}
          </div>

          <DragOverlay>
            {activeContact && (
              <div className="glass-card p-4 rounded-xl shadow-2xl opacity-90 w-80 border-l-2 border-l-primary">
                <p className="font-semibold text-foreground">{activeContact.full_name}</p>
                {activeContact.email && <p className="text-xs text-muted-foreground mt-1">{activeContact.email}</p>}
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {selected && (
          <Dialog open onOpenChange={() => { setSelected(null); setEditing(false); setForm(emptyForm); }}>
            <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  {editing ? `Edit ${selected.status}` : selected.full_name}
                </DialogTitle>
              </DialogHeader>
              {editing ? (
                renderLeadForm(handleUpdate, "Save Changes")
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.source && <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded uppercase">{selected.source}</span>}
                    <span className={`text-xs px-2 py-1 rounded font-medium ${selected.status === 'active' ? 'bg-primary/20 text-primary' : selected.status === 'prospect' ? 'bg-primary/10 text-primary' : selected.status === 'monthly' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>{selected.status === 'active' ? 'client' : selected.status === 'monthly' ? 'monthly client' : selected.status}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">{getCategoryLabel(selected.category)}</span>
                  </div>

                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div className="space-y-1 min-w-0"><Label className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label><p className="text-foreground break-all">{selected.email || '—'}</p></div>
                     <div className="space-y-1 min-w-0"><Label className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>{selected.phone ? <button className="text-foreground hover:text-primary transition-colors cursor-pointer font-mono text-sm" onClick={() => navigator.clipboard.writeText(selected.phone).then(() => toast.success(`Copied ${selected.phone}`))}>{selected.phone}</button> : <p className="text-foreground">—</p>}</div>
                     <div className="space-y-1 min-w-0"><Label className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Company</Label><p className="text-foreground break-words">{selected.company || '—'}</p></div>
                     <div className="space-y-1 min-w-0"><Label className="text-xs text-muted-foreground">Address</Label><p className="text-foreground break-words">{selected.address || '—'}</p></div>
                   </div>

                  {selected.instagram_handle && (
                    <div className="flex items-center gap-2 text-sm">
                      <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground">{selected.instagram_handle}</span>
                    </div>
                  )}

                  {/* Meta / Extra Info */}
                  {(() => {
                    const meta = selected.meta && typeof selected.meta === 'object' ? selected.meta as Record<string, any> : {};
                    const metaKeys = Object.keys(meta).filter(k => meta[k] != null && meta[k] !== '' && meta[k] !== false);
                    if (metaKeys.length === 0) return null;
                    return (
                      <div className="space-y-2 border-t border-border pt-3">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Extra Info</Label>
                         <div className="grid gap-2">
                           {metaKeys.map(k => (
                             <div key={k} className="text-sm min-w-0">
                               <span className="font-medium text-foreground capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
                               <span className="text-muted-foreground break-all">{typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}</span>
                             </div>
                           ))}
                         </div>
                       </div>
                     );
                   })()}

                   {/* AI Generated Website */}
                   {(() => {
                     const meta = selected.meta && typeof selected.meta === 'object' ? selected.meta as Record<string, any> : {};
                     const aiSite = meta.ai_website;
                     if (!aiSite) return null;
                     const href = String(aiSite).startsWith('http') ? String(aiSite) : `https://${aiSite}`;
                     return (
                       <div className="space-y-1 border-t border-border pt-3">
                         <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Globe className="h-3 w-3" /> AI Generated Website</Label>
                         <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all flex items-center gap-1">
                           <ExternalLink className="h-3 w-3 shrink-0" />{String(aiSite)}
                         </a>
                       </div>
                     );
                   })()}

                   {/* LinkedIn / Website links */}
                   {(() => {
                     const meta = selected.meta && typeof selected.meta === 'object' ? selected.meta as Record<string, any> : {};
                     const linkedin = meta.linkedin_url || meta.linkedin || meta.linkedIn;
                     const website = meta.website || meta.website_url;
                     if (!linkedin && !website) return null;
                     return (
                       <div className="flex gap-2">
                         {linkedin && <Button variant="outline" size="sm" asChild><a href={String(linkedin)} target="_blank" rel="noopener noreferrer"><Linkedin className="h-3.5 w-3.5 mr-1" />LinkedIn</a></Button>}
                         {website && <Button variant="outline" size="sm" asChild><a href={String(website).startsWith('http') ? String(website) : `https://${website}`} target="_blank" rel="noopener noreferrer"><Globe className="h-3.5 w-3.5 mr-1" />Website</a></Button>}
                       </div>
                     );
                   })()}

                  {selected.notes && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><StickyNote className="h-3 w-3" /> Notes</Label>
                      <p className="text-sm text-foreground whitespace-pre-wrap break-all bg-muted/50 rounded-lg p-3">{selected.notes}</p>
                    </div>
                  )}
                  {selected.tags && selected.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map((t: string) => <span key={t} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{t}</span>)}
                    </div>
                  )}

                  <CustomerWebPreviews customerId={selected.id} />

                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a href={`/customers?open=${selected.id}`}><ExternalLink className="h-3.5 w-3.5 mr-1" />Open in Customers</a>
                  </Button>

                  <Button variant="outline" size="sm" className="w-full" onClick={() => openCallbackScheduler(selected)}>
                    <CalendarClock className="h-3.5 w-3.5 mr-1" />Schedule Call Back
                  </Button>

                   <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                     {selected.status === 'lead' && (
                       <Button onClick={() => promote(selected.id)} className="col-span-2"><ArrowRight className="h-3.5 w-3.5 mr-1" />Promote</Button>
                     )}
                     {selected.status === 'prospect' && (
                       <>
                         <Button variant="outline" onClick={() => demote(selected.id)} className="text-xs"><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to Lead</Button>
                         <Button onClick={async () => { await supabase.from('customers').update({ status: 'active' }).eq('id', selected.id); await logStatusMove(selected.full_name, selected.id, 'prospect', 'active', selected.category); toast.success('Converted to client'); setSelected(null); loadAll(); }} className="text-xs"><UserPlus className="h-3.5 w-3.5 mr-1" />Convert</Button>
                       </>
                     )}
                     {selected.status === 'active' && (
                       <>
                         <Button variant="outline" onClick={async () => { await supabase.from('customers').update({ status: 'prospect' }).eq('id', selected.id); await logStatusMove(selected.full_name, selected.id, 'active', 'prospect', selected.category); toast.success('Moved back to prospect'); setSelected(null); loadAll(); }} className="text-xs"><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to Prospect</Button>
                         <Button onClick={async () => { await supabase.from('customers').update({ status: 'monthly' }).eq('id', selected.id); await logStatusMove(selected.full_name, selected.id, 'active', 'monthly', selected.category); toast.success('Moved to monthly client'); setSelected(null); loadAll(); }} className="text-xs"><Layers className="h-3.5 w-3.5 mr-1" />Monthly Client</Button>
                       </>
                     )}
                     {selected.status === 'monthly' && (
                       <Button variant="outline" onClick={async () => { await supabase.from('customers').update({ status: 'active' }).eq('id', selected.id); await logStatusMove(selected.full_name, selected.id, 'monthly', 'active', selected.category); toast.success('Moved back to new client'); setSelected(null); loadAll(); }} className="col-span-2 text-xs"><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to New Client</Button>
                     )}
                     <Button variant="outline" size="sm" onClick={() => openEdit(selected)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                     <Button variant="outline" size="sm" onClick={() => dismiss(selected.id)}>Dismiss</Button>
                     <Button variant="destructive" size="sm" className="col-span-2" onClick={() => handleDelete(selected.id)}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
                   </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}

        {/* Callback Scheduler Dialog */}
        <Dialog open={callbackOpen} onOpenChange={setCallbackOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Schedule Call Back
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              When should <span className="font-semibold text-foreground">{callbackTarget?.full_name}</span> appear in the Phone queue?
            </p>
            <div className="space-y-4">
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={callbackDate}
                  onSelect={setCallbackDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="p-3 pointer-events-auto"
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={callbackTime} onChange={e => setCallbackTime(e.target.value)} className="font-mono" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCallbackOpen(false)}>Cancel</Button>
              <Button disabled={!callbackDate} onClick={handleConfirmCallback} className="gap-1.5">
                <CalendarClock className="h-4 w-4" />Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Website Email Composer Dialog ── */}
        <Dialog open={emailComposeOpen} onOpenChange={setEmailComposeOpen}>
          <DialogContent className="sm:max-w-[650px] max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-sky-400" />
                Send Website Email — {emailTarget?.full_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>To</Label>
                <Input value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} placeholder="recipient@email.com" />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Body (HTML)</Label>
                <textarea
                  value={emailForm.body}
                  onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                  className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              {/* AI Website Preview */}
              {(() => {
                const meta = emailTarget?.meta && typeof emailTarget.meta === 'object' ? emailTarget.meta as Record<string, any> : {};
                const aiSite = meta.ai_website;
                if (!aiSite) return (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    ⚠️ No AI website URL set for this contact. Add one via Edit first.
                  </div>
                );
                const href = String(aiSite).startsWith('http') ? String(aiSite) : `https://${aiSite}`;
                return (
                  <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Globe className="h-4 w-4 text-sky-400 shrink-0" />
                    <span>Website: <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{String(aiSite)}</a></span>
                  </div>
                );
              })()}

              {/* Offer Options */}
              <div className="space-y-2 border-t border-border pt-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Signature Options (attach to email)</Label>

                <div className="flex items-center gap-2 py-1">
                  <Checkbox id="email-offer-a" checked={emailOfferA} onCheckedChange={v => setEmailOfferA(!!v)} />
                  <label htmlFor="email-offer-a" className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Gift className="h-4 w-4 text-primary" /> Option A — Own It Outright ($10.41/mo)
                  </label>
                </div>

                <div className="flex items-center gap-2 py-1">
                  <Checkbox id="email-offer-b" checked={emailOfferB} onCheckedChange={v => setEmailOfferB(!!v)} />
                  <label htmlFor="email-offer-b" className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Gift className="h-4 w-4 text-primary" /> Option B — Warren Covers Everything (70/30 split)
                  </label>
                </div>

                <div className="flex items-center gap-2 py-1">
                  <Checkbox id="email-offer-c" checked={emailOfferC} onCheckedChange={v => setEmailOfferC(!!v)} />
                  <label htmlFor="email-offer-c" className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Gift className="h-4 w-4 text-primary" /> Option C — $250/mo Unlimited Updates
                  </label>
                </div>

                {(emailOfferA || emailOfferB) && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                    {emailOfferA && <p><strong>Option A:</strong> Client pays $10.41/mo (biannual) for domain & hosting — no revenue split, site is 100% theirs.</p>}
                    {emailOfferB && <p><strong>Option B:</strong> Warren covers the $250 — 70/30 split on website payments (client 70%, Warren 30%).</p>}
                    <p className="italic">The offer graphic will be auto-attached.</p>
                    <img src="/images/offer-options.png" alt="Website Offer Options" className="mt-2 rounded-md border border-border max-h-32 object-contain" />
                  </div>
                )}

                {emailOfferC && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                    <p><strong>Option C:</strong> $250/month for unlimited website additions & changes — requests completed within 24 hours.</p>
                    <p className="italic">The Option C graphic will be auto-attached.</p>
                    <img src="/images/option-c-maintenance.png" alt="Option C Maintenance" className="mt-2 rounded-md border border-border max-h-32 object-contain" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEmailComposeOpen(false)}>Cancel</Button>
                <Button onClick={handleEmailSend} disabled={emailSending || !emailForm.to} className="gap-1.5">
                  <Send className="h-4 w-4" /> {emailSending ? 'Sending...' : 'Send Email'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* SMS Confirm Dialog */}
        <Dialog open={smsConfirmOpen} onOpenChange={setSmsConfirmOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-400" />
                Confirm Text Message Sent
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Have you sent the text message to <strong>{smsConfirmTarget?.full_name}</strong> showing them their website?
              </p>
              {smsConfirmTarget?.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {smsConfirmTarget.phone}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setSmsConfirmOpen(false); setSmsConfirmTarget(null); }}>No, Cancel</Button>
                <Button onClick={handleSmsConfirmYes} disabled={smsConfirming} className="gap-1.5 bg-blue-500 hover:bg-blue-600 text-white">
                  <MessageSquare className="h-4 w-4" /> {smsConfirming ? 'Moving...' : 'Yes, Text Sent'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
