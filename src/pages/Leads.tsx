import { useEffect, useState, ReactNode } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, MapPin, Phone, Mail, User, StickyNote, Bot, Plus, Pencil, Trash2, ArrowRight, ArrowLeft, UserCheck, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';

const emptyForm = { full_name: '', email: '', phone: '', address: '', company: '', source: '', notes: '' };
const sources = ['x', 'twitter', 'reddit', 'craigslist', 'web', 'email', 'sms', 'linkedin', 'other'];

const PAGE_SIZE = 10;

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [loading, setLoading] = useState(true);
  const [leadsPage, setLeadsPage] = useState(1);
  const [prospectsPage, setProspectsPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadLeads = async () => {
    let q = supabase
      .from('customers')
      .select('*')
      .eq('status', 'lead')
      .order('created_at', { ascending: false });

    if (filterSource !== 'all') q = q.eq('source', filterSource);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);

    const { data } = await q;
    setLeads(data || []);
    setLoading(false);
  };

  const loadProspects = async () => {
    let q = supabase
      .from('customers')
      .select('*')
      .eq('status', 'prospect')
      .order('updated_at', { ascending: false });

    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);

    const { data } = await q;
    setProspects(data || []);
  };

  const loadAll = () => { setLeadsPage(1); setProspectsPage(1); loadLeads(); loadProspects(); };

  useEffect(() => { loadAll(); }, [search, filterSource]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    const { error } = await supabase.from('customers').insert({
      full_name: form.full_name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      company: form.company || null,
      source: form.source || 'manual',
      notes: form.notes || null,
      status: 'lead',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Lead added');
    setForm(emptyForm);
    setAddOpen(false);
    loadAll();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !form.full_name.trim()) return;
    const { error } = await supabase.from('customers').update({
      full_name: form.full_name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      company: form.company || null,
      source: form.source || null,
      notes: form.notes || null,
    }).eq('id', selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead updated');
    setEditing(false);
    setSelected(null);
    setForm(emptyForm);
    loadAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('customers').delete().eq('id', id);
    toast.success('Lead deleted');
    setSelected(null);
    loadAll();
  };

  const promote = async (id: string) => {
    await supabase.from('customers').update({ status: 'prospect' }).eq('id', id);
    toast.success('Lead promoted to prospect');
    setSelected(null);
    loadAll();
  };

  const demote = async (id: string) => {
    await supabase.from('customers').update({ status: 'lead' }).eq('id', id);
    toast.success('Prospect moved back to lead');
    setSelected(null);
    loadAll();
  };

  const dismiss = async (id: string) => {
    await supabase.from('customers').update({ status: 'inactive' }).eq('id', id);
    toast.success('Dismissed');
    setSelected(null);
    loadAll();
  };

  const openEdit = (lead: any) => {
    setForm({
      full_name: lead.full_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      address: lead.address || '',
      company: lead.company || '',
      source: lead.source || '',
      notes: lead.notes || '',
    });
    setEditing(true);
  };

  const LeadForm = ({ onSubmit, submitLabel }: { onSubmit: (e: React.FormEvent) => void; submitLabel: string }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Full Name *</Label>
        <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
      </div>
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
      <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  );

  const ContactCard = ({ contact, onClick, isProspect }: { contact: any; onClick: () => void; isProspect?: boolean }) => (
    <div
      className={`w-full text-left glass-card p-4 space-y-3 hover:ring-2 transition-all rounded-xl relative ${isProspect ? 'hover:ring-primary/40 border-l-2 border-l-primary' : 'hover:ring-primary/30'}`}
    >
      <button
        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        title="View details"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center gap-2 pr-8">
        <span className="font-semibold text-foreground truncate">{contact.full_name}</span>
        {contact.source && (
          <span className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase shrink-0">
            {contact.source}
          </span>
        )}
      </div>
      {contact.email && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.email}</span>
        </div>
      )}
      {contact.phone && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone className="h-3.5 w-3.5 shrink-0" /><span>{contact.phone}</span>
        </div>
      )}
      {contact.company && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.company}</span>
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">{new Date(contact.created_at).toLocaleDateString()}</div>
    </div>
  );
  const leadsPageCount = Math.ceil(leads.length / PAGE_SIZE);
  const prospectsPageCount = Math.ceil(prospects.length / PAGE_SIZE);
  const pagedLeads = leads.slice((leadsPage - 1) * PAGE_SIZE, leadsPage * PAGE_SIZE);
  const pagedProspects = prospects.slice((prospectsPage - 1) * PAGE_SIZE, prospectsPage * PAGE_SIZE);

  const PaginationButtons = ({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) => {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-1 pt-2">
        {Array.from({ length: total }, (_, i) => i + 1).map(p => (
          <Button
            key={p}
            size="sm"
            variant={p === current ? 'default' : 'outline'}
            className="h-8 w-8 p-0 text-xs"
            onClick={() => onChange(p)}
          >
            {p}
          </Button>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Leads
            </h1>
         <p className="text-muted-foreground text-sm mt-1">
              {leads.length} leads · {prospects.length} prospects
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); if (!o) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Lead</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
              <LeadForm onSubmit={handleCreate} submitLabel="Create Lead" />
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
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
        </div>

        {/* Two-column layout: Leads + Prospects */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Leads Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Leads</h2>
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{leads.length}</span>
            </div>
            <div className="space-y-3">
              {pagedLeads.map(lead => (
                <ContactCard key={lead.id} contact={lead} onClick={() => { setSelected(lead); setEditing(false); }} />
              ))}
              {leads.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No leads yet</p>
                </div>
              )}
            </div>
            <PaginationButtons current={leadsPage} total={leadsPageCount} onChange={setLeadsPage} />
          </div>

          {/* Prospects Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wider">Prospects</h2>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{prospects.length}</span>
            </div>
            <div className="space-y-3">
              {pagedProspects.map(prospect => (
                <ContactCard key={prospect.id} contact={prospect} onClick={() => { setSelected(prospect); setEditing(false); }} isProspect />
              ))}
              {prospects.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                  <ArrowLeft className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Promote leads to see them here</p>
                </div>
              )}
            </div>
            <PaginationButtons current={prospectsPage} total={prospectsPageCount} onChange={setProspectsPage} />
          </div>
        </div>

        {/* Detail / Edit modal */}
        {selected && (
          <Dialog open onOpenChange={() => { setSelected(null); setEditing(false); setForm(emptyForm); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  {editing ? `Edit ${selected.status === 'prospect' ? 'Prospect' : 'Lead'}` : selected.full_name}
                </DialogTitle>
              </DialogHeader>

              {editing ? (
                <LeadForm onSubmit={handleUpdate} submitLabel="Save Changes" />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {selected.source && (
                      <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded uppercase">{selected.source}</span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded font-medium ${selected.status === 'prospect' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {selected.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Email</Label><p className="text-foreground">{selected.email || '—'}</p></div>
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Phone</Label><p className="text-foreground">{selected.phone || '—'}</p></div>
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Company</Label><p className="text-foreground">{selected.company || '—'}</p></div>
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Address</Label><p className="text-foreground">{selected.address || '—'}</p></div>
                  </div>

                  {selected.notes && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><StickyNote className="h-3 w-3" /> Notes</Label>
                      <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{selected.notes}</p>
                    </div>
                  )}

                  {selected.tags && selected.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map((t: string) => (
                        <span key={t} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-border">
                    {selected.status === 'lead' ? (
                      <Button onClick={() => promote(selected.id)} className="flex-1">
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />Promote
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => demote(selected.id)} className="flex-1">
                        <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to Lead
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => openEdit(selected)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                    <Button variant="outline" onClick={() => dismiss(selected.id)}>Dismiss</Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(selected.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AppLayout>
  );
}
