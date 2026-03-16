import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Search, Phone, Mail, User, StickyNote, Bot, Plus, Pencil, Trash2, ArrowRight, ArrowLeft, UserCheck, Maximize2, GripVertical, UserPlus, Building2, Globe, Linkedin, ExternalLink, Instagram, Layers, Undo2, CalendarClock } from 'lucide-react';
import { CustomerWebPreviews } from '@/components/CustomerWebPreviews';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, useDroppable, pointerWithin } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { format } from 'date-fns';

const DISPLAY_CATEGORIES = SERVICE_CATEGORIES.filter(c => c.id !== 'potential');
const emptyForm = { full_name: '', email: '', phone: '', address: '', company: '', source: '', notes: '', tags: '', category: '', instagram_handle: '', portal_niche: '', ai_website: '' };
const sources = ['x', 'twitter', 'reddit', 'craigslist', 'web', 'email', 'sms', 'linkedin', 'other'];
const PAGE_SIZE = 10;

const STATUS_LABELS: Record<string, string> = { lead: 'Lead', prospect: 'Prospect', active: 'Client', monthly: 'Monthly Client', inactive: 'Dismissed' };

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

function DraggableContactCard({ contact, onClick, onDelete, isProspect, isPaid }: { contact: any; onClick: () => void; onDelete: (id: string) => void; isProspect?: boolean; isPaid?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: contact.id, data: { status: contact.status } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full text-left glass-card p-4 space-y-3 hover:ring-2 transition-all rounded-xl relative",
        isProspect ? 'hover:ring-primary/40 border-l-2 border-l-primary' : 'hover:ring-primary/30',
        isDragging && 'opacity-40 shadow-lg'
      )}
    >
      <button {...attributes} {...listeners} className="absolute top-3 left-3 p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onClick(); }} title="View details">
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center gap-2 px-6">
        <span className={cn("font-semibold truncate", isProspect && !(contact.meta && typeof contact.meta === 'object' && (contact.meta as any).ai_website) ? 'text-red-500' : 'text-foreground')}>{contact.full_name}</span>
        {(() => {
          const meta = contact.meta && typeof contact.meta === 'object' ? contact.meta : {};
          return (meta as Record<string, unknown>).callback_at ? (
            <span title={`Follow-up: ${format(new Date((meta as Record<string, unknown>).callback_at as string), 'MMM d, h:mm a')}`} className="shrink-0">
              <CalendarClock className="h-3.5 w-3.5 text-blue-500" />
            </span>
          ) : null;
        })()}
        {contact.source && (
          <span className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase shrink-0">{contact.source}</span>
        )}
      </div>
      {/* Category badge */}
      {contact.category && (
        <div className="pl-6">
          <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{getCategoryLabel(contact.category)}</span>
        </div>
      )}
      {contact.email && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
          <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.email}</span>
        </div>
      )}
      {contact.phone && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
          <Phone className="h-3.5 w-3.5 shrink-0" /><span>{contact.phone}</span>
        </div>
      )}
      {contact.company && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
          <User className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.company}</span>
        </div>
      )}
      <div className="flex items-center justify-between pl-6">
        <span className="text-[10px] text-muted-foreground">{new Date(contact.created_at).toLocaleDateString()}</span>
        <button className="p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={(e) => { e.stopPropagation(); onDelete(contact.id); }} title="Delete lead">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export default function Leads() {
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [allProspects, setAllProspects] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [allMonthly, setAllMonthly] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [leadsPage, setLeadsPage] = useState(1);
  const [prospectsPage, setProspectsPage] = useState(1);
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
    setLeadsPage(1); setProspectsPage(1); setClientsPage(1); setMonthlyPage(1);
    const [leadRes, prospectRes, clientRes, monthlyRes] = await Promise.all([
      buildQuery('lead'),
      buildQuery('prospect'),
      buildQuery('active'),
      buildQuery('monthly'),
    ]);
    setAllLeads(leadRes.data || []);
    setAllProspects(prospectRes.data || []);
    setAllClients(clientRes.data || []);
    setAllMonthly(monthlyRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    setLeads(allLeads);
    setProspects(allProspects);
    setClients(allClients);
    setMonthly(allMonthly);
  }, [allLeads, allProspects, allClients, allMonthly]);

  useEffect(() => { loadAll(); }, [search, filterSource, filterCategory]);

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
    toast.success('Lead updated');
    setEditing(false); setSelected(null); setForm(emptyForm); loadAll();
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
    const contact = [...leads, ...prospects, ...clients].find(c => c.id === id);
    await supabase.from('customers').update({ status: 'prospect' }).eq('id', id);
    if (contact) await logStatusMove(contact.full_name, id, contact.status, 'prospect', contact.category);
    toast.success('Promoted to prospect'); setSelected(null); loadAll();
  };
  const demote = async (id: string) => {
    const contact = [...leads, ...prospects, ...clients].find(c => c.id === id);
    await supabase.from('customers').update({ status: 'lead' }).eq('id', id);
    if (contact) await logStatusMove(contact.full_name, id, contact.status, 'lead', contact.category);
    toast.success('Moved back to lead'); setSelected(null); loadAll();
  };
  const dismiss = async (id: string) => {
    const contact = [...leads, ...prospects, ...clients].find(c => c.id === id);
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

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const draggedId = active.id as string;
    const allContacts = [...leads, ...prospects, ...clients, ...monthly];
    const draggedContact = allContacts.find(c => c.id === draggedId);
    if (!draggedContact) return;

    let targetStatus: string | null = null;
    const overId = over.id as string;
    if (overId === 'leads-column') targetStatus = 'lead';
    else if (overId === 'prospects-column') targetStatus = 'prospect';
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
    setClients(targetStatus === 'active' ? addToList(removeFromList(clients)) : removeFromList(clients));
    setMonthly(targetStatus === 'monthly' ? addToList(removeFromList(monthly)) : removeFromList(monthly));

    const labels: Record<string, string> = { lead: 'Moved to leads', prospect: 'Promoted to prospect', active: 'Converted to client', monthly: 'Moved to monthly client' };
    toast.success(labels[targetStatus] || `Status: ${targetStatus}`);

    const { error } = await supabase.from('customers').update({ status: targetStatus }).eq('id', draggedId);
    if (error) { toast.error('Failed to update status'); loadAll(); }
    else { await logStatusMove(draggedContact.full_name, draggedId, draggedContact.status, targetStatus, draggedContact.category); }
  };

  const activeContact = activeId ? [...leads, ...prospects, ...clients, ...monthly].find(c => c.id === activeId) : null;

  const leadsPageCount = Math.ceil(leads.length / PAGE_SIZE);
  const prospectsPageCount = Math.ceil(prospects.length / PAGE_SIZE);
  const clientsPageCount = Math.ceil(clients.length / PAGE_SIZE);
  const monthlyPageCount = Math.ceil(monthly.length / PAGE_SIZE);
  const pagedLeads = leads.slice((leadsPage - 1) * PAGE_SIZE, leadsPage * PAGE_SIZE);
  const pagedProspects = prospects.slice((prospectsPage - 1) * PAGE_SIZE, prospectsPage * PAGE_SIZE);
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

  const LeadForm = ({ onSubmit, submitLabel }: { onSubmit: (e: React.FormEvent) => void; submitLabel: string }) => (
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
          <p className="text-muted-foreground text-sm">{leads.length} leads · {prospects.length} prospects · {clients.length} clients · {monthly.length} monthly · Drag to move</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={undoLastAction} disabled={!lastAction}>
              <Undo2 className="h-4 w-4 mr-2" />{lastAction ? `Undo (${lastAction.name})` : 'Undo'}
            </Button>
            <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); if (!o) setForm(emptyForm); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Lead</Button></DialogTrigger>
              <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
                <LeadForm onSubmit={handleCreate} submitLabel="Create Lead" />
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
        </div>

        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid gap-6 lg:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Leads</h2>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{leads.length}</span>
              </div>
              <DroppableColumn id="leads-column">
                {pagedLeads.map(lead => (
                  <DraggableContactCard key={lead.id} contact={lead} onClick={() => { setSelected(lead); setEditing(false); }} onDelete={handleDelete} />
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

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-primary uppercase tracking-wider">Prospects (pending websites)</h2>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{prospects.length}</span>
              </div>
              <DroppableColumn id="prospects-column">
                {pagedProspects.map(prospect => (
                  <DraggableContactCard key={prospect.id} contact={prospect} onClick={() => { setSelected(prospect); setEditing(false); }} onDelete={handleDelete} isProspect />
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

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-primary uppercase tracking-wider">New Client</h2>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{clients.length}</span>
              </div>
              <DroppableColumn id="clients-column">
                {pagedClients.map(client => (
                  <DraggableContactCard key={client.id} contact={client} onClick={() => { setSelected(client); setEditing(false); }} onDelete={handleDelete} isProspect />
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

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-emerald-500 uppercase tracking-wider">Monthly Client</h2>
                <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">{monthly.length}</span>
              </div>
              <DroppableColumn id="monthly-column">
                {pagedMonthly.map(m => (
                  <DraggableContactCard key={m.id} contact={m} onClick={() => { setSelected(m); setEditing(false); }} onDelete={handleDelete} />
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
                <LeadForm onSubmit={handleUpdate} submitLabel="Save Changes" />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.source && <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded uppercase">{selected.source}</span>}
                    <span className={`text-xs px-2 py-1 rounded font-medium ${selected.status === 'active' ? 'bg-primary/20 text-primary' : selected.status === 'prospect' ? 'bg-primary/10 text-primary' : selected.status === 'monthly' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>{selected.status === 'active' ? 'client' : selected.status === 'monthly' ? 'monthly client' : selected.status}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">{getCategoryLabel(selected.category)}</span>
                  </div>

                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div className="space-y-1 min-w-0"><Label className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label><p className="text-foreground break-all">{selected.email || '—'}</p></div>
                     <div className="space-y-1 min-w-0"><Label className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label><p className="text-foreground">{selected.phone || '—'}</p></div>
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
      </div>
    </AppLayout>
  );
}
