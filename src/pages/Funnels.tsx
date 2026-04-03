import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthLayoutGate } from '@/components/layout/AuthLayoutGate';
import { toast } from 'sonner';
import {
  Video, Globe, Home, Filter, Clock, Mail, Phone, Search,
  Bot, Play, ExternalLink, Send, Loader2,
  RefreshCw, Eye, MessageSquare, EyeOff, ChevronLeft, ChevronRight, Trash2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
import { cn } from '@/lib/utils';

type FunnelType = 'all' | 'videography' | 'webdesign' | 'realestate';

interface FunnelLead {
  id: string;
  funnel: 'videography' | 'webdesign' | 'realestate';
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  status: string;
  notes: string | null;
  company?: string | null;
  property_address?: string | null;
  event_type?: string | null;
  // Vapi AI
  vapi_call_status?: string | null;
  vapi_call_id?: string | null;
  ai_notes?: string | null;
  vapi_recording_url?: string | null;
  timeline?: string | null;
  property_condition?: string | null;
  motivation?: string | null;
  asking_price?: number | null;
  lead_score?: number | null;
  // draft
  drafted_at?: string | null;
  // source table
  _table: 'customers' | 'lw_landing_leads';
}

const PAGE_SIZE = 30;

const FUNNEL_CONFIG: Record<string, { label: string; icon: typeof Video; color: string; bgColor: string }> = {
  videography: { label: 'Videography', icon: Video, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  webdesign: { label: 'Web Design', icon: Globe, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  realestate: { label: 'Real Estate', icon: Home, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
};

/* ─── Email Modal ─── */
function EmailModal({ lead, open, onClose }: { lead: FunnelLead | null; open: boolean; onClose: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (lead && open) {
      const funnelLabel = FUNNEL_CONFIG[lead.funnel]?.label || lead.funnel;
      setSubject(`Re: Your ${funnelLabel} Inquiry — Warren Guru`);
      setBody(`Hi ${lead.full_name.split(' ')[0]},\n\nThank you for reaching out! `);
    }
  }, [lead, open]);

  const handleSend = async () => {
    if (!lead?.email) { toast.error('No email on file'); return; }
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body required'); return; }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('email-command', {
        body: { action: 'send', to: lead.email, subject, body, html: body.replace(/\n/g, '<br/>') },
      });
      if (error) throw error;
      toast.success(`Email sent to ${lead.email}`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    } finally { setSending(false); }
  };

  if (!lead) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Reply to {lead.full_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">To: {lead.email || 'No email'}</p>
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Message body..." value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSend} disabled={sending || !lead.email}>
              {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Detail Modal ─── */
function LeadDetailModal({ lead, open, onClose }: { lead: FunnelLead | null; open: boolean; onClose: () => void }) {
  if (!lead) return null;
  const cfg = FUNNEL_CONFIG[lead.funnel];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <cfg.icon className={cn("h-5 w-5", cfg.color)} />
            {lead.full_name}
            <Badge variant="outline" className={cn("text-xs ml-2", cfg.color)}>{cfg.label}</Badge>
            {lead.drafted_at && (
              <Badge variant="secondary" className="text-[10px] ml-1 text-yellow-600">Drafted</Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-muted-foreground text-xs">Email</p><p>{lead.email || '—'}</p></div>
          <div><p className="text-muted-foreground text-xs">Phone</p><p>{lead.phone || '—'}</p></div>
          <div><p className="text-muted-foreground text-xs">Submitted</p><p>{format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}</p></div>
          <div><p className="text-muted-foreground text-xs">Status</p><Badge variant="secondary">{lead.status}</Badge></div>
          {lead.property_address && (
            <div className="col-span-2"><p className="text-muted-foreground text-xs">Property Address</p><p>{lead.property_address}</p></div>
          )}
          {lead.company && (
            <div className="col-span-2"><p className="text-muted-foreground text-xs">Business Name</p><p>{lead.company}</p></div>
          )}
          {lead.notes && (
            <div className="col-span-2"><p className="text-muted-foreground text-xs">Notes</p><p className="whitespace-pre-wrap">{lead.notes}</p></div>
          )}
        </div>
        {/* Vapi AI Section */}
        {(lead.vapi_call_status || lead.ai_notes) && (
          <div className="mt-4 border-t pt-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Bot className="h-4 w-4 text-primary" /> AI Call Data
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground text-xs">Call Status</p>
                <Badge variant={lead.vapi_call_status === 'completed' ? 'default' : 'secondary'}>{lead.vapi_call_status || 'pending'}</Badge>
              </div>
              {lead.timeline && <div><p className="text-muted-foreground text-xs">Timeline</p><p>{lead.timeline}</p></div>}
              {lead.property_condition && <div><p className="text-muted-foreground text-xs">Condition</p><p>{lead.property_condition}</p></div>}
              {lead.motivation && <div><p className="text-muted-foreground text-xs">Motivation</p><p>{lead.motivation}</p></div>}
              {lead.asking_price && <div><p className="text-muted-foreground text-xs">Asking Price</p><p>${lead.asking_price.toLocaleString()}</p></div>}
              {lead.lead_score != null && lead.lead_score > 0 && <div><p className="text-muted-foreground text-xs">Lead Score</p><p className="font-bold">{lead.lead_score}/100</p></div>}
            </div>
            {lead.ai_notes && (
              <div className="mt-3"><p className="text-muted-foreground text-xs mb-1">AI Notes</p>
                <div className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">{lead.ai_notes}</div>
              </div>
            )}
            {lead.vapi_recording_url && (
              <div className="mt-3">
                <a href={lead.vapi_recording_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Play className="h-3 w-3" /> Listen to Recording <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Lead Card ─── */
function LeadCard({ lead, onEmail, onView, onDraft, onUndraft }: {
  lead: FunnelLead; onEmail: () => void; onView: () => void;
  onDraft: () => void; onUndraft: () => void;
}) {
  const cfg = FUNNEL_CONFIG[lead.funnel];
  const hasAI = !!(lead.vapi_call_status === 'completed' || lead.ai_notes);
  const isDrafted = !!lead.drafted_at;
  const draftHoursLeft = isDrafted ? Math.max(0, 72 - differenceInHours(new Date(), new Date(lead.drafted_at!))) : null;

  return (
    <div className={cn("border rounded-lg p-4 hover:border-primary/30 transition-colors bg-card", isDrafted && "opacity-60 border-dashed")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("p-1.5 rounded-md shrink-0", cfg.bgColor)}>
            <cfg.icon className={cn("h-3.5 w-3.5", cfg.color)} />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{lead.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{lead.email || lead.phone || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isDrafted && (
            <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-500/30">
              <EyeOff className="h-2.5 w-2.5 mr-0.5" /> {draftHoursLeft}h left
            </Badge>
          )}
          {hasAI && (
            <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
              <Bot className="h-2.5 w-2.5" /> AI
            </Badge>
          )}
          <Badge variant="outline" className={cn("text-[10px]", cfg.color)}>{cfg.label}</Badge>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
        <Badge variant="secondary" className="text-[10px]">{lead.status}</Badge>
      </div>
      {lead.notes && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{lead.notes}</p>}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onView}>
          <Eye className="h-3 w-3 mr-1" /> View
        </Button>
        {lead.email && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onEmail}>
            <Mail className="h-3 w-3 mr-1" /> Reply
          </Button>
        )}
        {lead.phone && lead.phone !== 'N/A' && (
          <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1">
            <Phone className="h-3 w-3" /> Call
          </a>
        )}
        {isDrafted ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-yellow-600 ml-auto" onClick={onUndraft}>
            <Eye className="h-3 w-3 mr-1" /> Undraft
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground ml-auto" onClick={onDraft}>
            <EyeOff className="h-3 w-3 mr-1" /> Draft
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function Funnels() {
  const [leads, setLeads] = useState<FunnelLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FunnelType>('all');
  const [search, setSearch] = useState('');
  const [showDrafted, setShowDrafted] = useState(false);
  const [page, setPage] = useState(1);
  const [emailLead, setEmailLead] = useState<FunnelLead | null>(null);
  const [viewLead, setViewLead] = useState<FunnelLead | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      // Videography + Web Design from customers (only funnel sources)
      const { data: custLeads } = await supabase
        .from('customers')
        .select('*')
        .in('source', ['videography-landing', 'webdesign-landing'])
        .order('created_at', { ascending: false })
        .limit(500);

      // Real Estate from lw_landing_leads (only manually submitted via funnel form)
      const { data: reLeads } = await supabase
        .from('lw_landing_leads')
        .select('*')
        .not('landing_page_id', 'is', null)
        .neq('full_name', 'Property Owner')
        .neq('phone', 'N/A')
        .order('created_at', { ascending: false })
        .limit(500);

      const combined: FunnelLead[] = [];

      (custLeads || []).forEach((c) => {
        const meta = (c.meta as Record<string, unknown>) || {};
        const funnel = c.source === 'videography-landing' ? 'videography' : 'webdesign';
        const tags = c.tags as string[] || [];
        combined.push({
          id: c.id, funnel: funnel as 'videography' | 'webdesign', _table: 'customers',
          full_name: c.full_name, email: c.email, phone: c.phone,
          created_at: c.created_at, status: c.status || 'new', notes: c.notes,
          company: c.company,
          event_type: tags.find(t => !['videography', 'webdesign', 'ai-website', 'general'].includes(t)) || null,
          vapi_call_status: (meta.vapi_call_status as string) || null,
          vapi_call_id: (meta.vapi_call_id as string) || null,
          drafted_at: (meta.funnel_drafted_at as string) || null,
        });
      });

      (reLeads || []).forEach((r) => {
        combined.push({
          id: r.id, funnel: 'realestate', _table: 'lw_landing_leads',
          full_name: r.full_name, email: r.email, phone: r.phone,
          created_at: r.created_at, status: r.status || 'new', notes: r.notes,
          property_address: r.property_address,
          vapi_call_status: r.vapi_call_status, vapi_call_id: r.vapi_call_id,
          ai_notes: r.ai_notes, vapi_recording_url: r.vapi_recording_url,
          timeline: r.timeline, property_condition: r.property_condition,
          motivation: r.motivation,
          asking_price: r.asking_price ? Number(r.asking_price) : null,
          lead_score: r.lead_score,
          drafted_at: r.drafted_at,
        });
      });

      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Auto-expire drafts older than 72 hours (remove from view only)
      const now = new Date();
      const visible = combined.filter((l) => {
        if (!l.drafted_at) return true;
        return differenceInHours(now, new Date(l.drafted_at)) < 72;
      });

      setLeads(visible);
    } catch (err) {
      console.error('Funnels fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, []);

  const handleDraft = async (lead: FunnelLead) => {
    const now = new Date().toISOString();
    if (lead._table === 'customers') {
      await supabase.from('customers').update({ meta: { funnel_drafted_at: now } } as any).eq('id', lead.id);
    } else {
      await supabase.from('lw_landing_leads').update({ drafted_at: now }).eq('id', lead.id);
    }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, drafted_at: now } : l));
    toast.success(`${lead.full_name} drafted — hidden for 72 hours`);
  };

  const handleUndraft = async (lead: FunnelLead) => {
    if (lead._table === 'customers') {
      await supabase.from('customers').update({ meta: {} } as any).eq('id', lead.id);
    } else {
      await supabase.from('lw_landing_leads').update({ drafted_at: null }).eq('id', lead.id);
    }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, drafted_at: null } : l));
    toast.success(`${lead.full_name} undrafted`);
  };

  const filtered = useMemo(() => {
    let result = leads;
    if (filter !== 'all') result = result.filter(l => l.funnel === filter);
    if (!showDrafted) result = result.filter(l => !l.drafted_at);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.full_name.toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.property_address || '').toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, filter, search, showDrafted]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(page, totalPages);
  const pagedLeads = filtered.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filter, search, showDrafted]);

  const counts = useMemo(() => ({
    all: leads.filter(l => !l.drafted_at).length,
    videography: leads.filter(l => l.funnel === 'videography' && !l.drafted_at).length,
    webdesign: leads.filter(l => l.funnel === 'webdesign' && !l.drafted_at).length,
    realestate: leads.filter(l => l.funnel === 'realestate' && !l.drafted_at).length,
  }), [leads]);

  const draftCount = leads.filter(l => !!l.drafted_at).length;

  return (
    <AuthLayoutGate>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Funnels</h1>
            <p className="text-sm text-muted-foreground">Leads from your landing pages only</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={showDrafted ? "default" : "outline"} size="sm" onClick={() => setShowDrafted(!showDrafted)}>
              <EyeOff className="h-3.5 w-3.5 mr-1" />
              Drafted {draftCount > 0 && `(${draftCount})`}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['all', 'videography', 'webdesign', 'realestate'] as const).map((key) => {
            const cfg = key === 'all'
              ? { label: 'All Leads', icon: Filter, color: 'text-foreground', bgColor: 'bg-muted' }
              : FUNNEL_CONFIG[key];
            return (
              <Card key={key} className={cn("cursor-pointer transition-all", filter === key && "ring-2 ring-primary")} onClick={() => setFilter(key)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn("p-2 rounded-md", cfg.bgColor)}>
                    <cfg.icon className={cn("h-4 w-4", cfg.color)} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{counts[key]}</p>
                    <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, phone, address..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Leads Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pagedLeads.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{showDrafted ? 'No drafted leads' : 'No leads found'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pagedLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onEmail={() => setEmailLead(lead)}
                onView={() => setViewLead(lead)}
                onDraft={() => handleDraft(lead)}
                onUndraft={() => handleUndraft(lead)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" disabled={safeCurrentPage <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {safeCurrentPage} of {totalPages} · {filtered.length} leads
            </span>
            <Button variant="outline" size="sm" disabled={safeCurrentPage >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <EmailModal lead={emailLead} open={!!emailLead} onClose={() => setEmailLead(null)} />
        <LeadDetailModal lead={viewLead} open={!!viewLead} onClose={() => setViewLead(null)} />
      </div>
    </AuthLayoutGate>
  );
}
