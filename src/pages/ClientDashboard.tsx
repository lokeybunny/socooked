import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toast } from 'sonner';
import {
  Home, LogOut, Phone, MapPin, Download, Save, X, Edit2,
  ChevronDown, ChevronUp, DollarSign, Loader2, Filter, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Lead {
  id: string;
  full_name: string;
  phone: string;
  property_address: string;
  status: string;
  created_at: string;
  lead_score: number | null;
  ai_notes: string | null;
  motivation: string | null;
  timeline: string | null;
  asking_price: number | null;
  vapi_call_status: string | null;
  vapi_recording_url: string | null;
  landing_page_id: string | null;
  email: string | null;
  property_condition: string | null;
  meta: Record<string, any> | null;
}

interface LandingPage {
  id: string;
  slug: string;
  client_name: string;
}

const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'under_contract', 'closed'] as const;
const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  under_contract: 'Under Contract',
  closed: 'Closed',
};

export default function ClientDashboard() {
  const { user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [filterPage, setFilterPage] = useState<string>('all');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [editingLead, setEditingLead] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});

  const loadData = useCallback(async () => {
    if (!user) return;

    const { data: pages } = await supabase
      .from('lw_landing_pages')
      .select('id, slug, client_name')
      .eq('client_user_id', user.id);

    const clientPages = (pages || []) as LandingPage[];
    setLandingPages(clientPages);

    if (clientPages.length === 0) {
      setLeads([]);
      setLoading(false);
      return;
    }

    const pageIds = clientPages.map(p => p.id);
    const { data: leadsData } = await supabase
      .from('lw_landing_leads')
      .select('*')
      .in('landing_page_id', pageIds)
      .order('created_at', { ascending: false });

    setLeads((leadsData || []) as Lead[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/client-login');
      return;
    }
    loadData();
  }, [user, authLoading, navigate, loadData]);

  useEffect(() => {
    if (landingPages.length === 0) return;
    const pageIds = landingPages.map(p => p.id);

    const channel = supabase
      .channel('client-leads')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'lw_landing_leads',
      }, (payload) => {
        const newRecord = payload.new as Lead;
        if (newRecord?.landing_page_id && pageIds.includes(newRecord.landing_page_id)) {
          loadData();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [landingPages, loadData]);

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    const { error } = await supabase
      .from('lw_landing_leads')
      .update({ status: newStatus })
      .eq('id', leadId);
    if (error) {
      toast.error('Failed to update status');
      return;
    }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    toast.success(`Moved to ${STAGE_LABELS[newStatus]}`);
  };

  const startEditing = (lead: Lead) => {
    setEditingLead(lead.id);
    setEditForm({
      full_name: lead.full_name,
      phone: lead.phone,
      property_address: lead.property_address,
      motivation: lead.motivation || '',
      timeline: lead.timeline || '',
      asking_price: lead.asking_price,
    });
  };

  const saveEdit = async (leadId: string) => {
    const { error } = await supabase
      .from('lw_landing_leads')
      .update({
        full_name: editForm.full_name,
        phone: editForm.phone,
        property_address: editForm.property_address,
        motivation: editForm.motivation || null,
        timeline: editForm.timeline || null,
        asking_price: editForm.asking_price,
      })
      .eq('id', leadId);
    if (error) {
      toast.error('Failed to save changes');
      return;
    }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...editForm } : l));
    setEditingLead(null);
    toast.success('Lead updated');
  };

  const downloadTranscript = (lead: Lead) => {
    const content = [
      `Lead: ${lead.full_name}`,
      `Phone: ${lead.phone}`,
      `Property: ${lead.property_address}`,
      `Status: ${STAGE_LABELS[lead.status] || lead.status}`,
      `Date: ${format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}`,
      '',
      '--- AI Conversation Notes ---',
      '',
      lead.ai_notes || '(No AI notes recorded)',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${lead.full_name.replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLeads = leads.filter(l => {
    if (filterPage !== 'all' && l.landing_page_id !== filterPage) return false;
    if (filterStage !== 'all' && l.status !== filterStage) return false;
    return true;
  });

  const stageCounts = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = leads.filter(l => l.status === stage).length;
    return acc;
  }, {} as Record<string, number>);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-white/5 border-b border-white/10 px-6 py-4 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 text-white flex items-center justify-center">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Wholesale Dashboard</h1>
              <p className="text-xs text-white/40">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4 mr-2" />Sign Out
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Pipeline Overview */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4">CRM Pipeline</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PIPELINE_STAGES.map(stage => (
              <div
                key={stage}
                className={`bg-white/5 rounded-xl border p-4 cursor-pointer transition-colors ${
                  filterStage === stage ? 'border-white/30 bg-white/10' : 'border-white/10 hover:border-white/20'
                }`}
                onClick={() => setFilterStage(filterStage === stage ? 'all' : stage)}
              >
                <StatusBadge status={stage} />
                <p className="text-2xl font-bold text-white mt-2">{stageCounts[stage] || 0}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-white/40" />
            <span className="text-sm text-white/60">Filter:</span>
          </div>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-[180px] bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-white/10 text-white">
              <SelectItem value="all">All Stages</SelectItem>
              {PIPELINE_STAGES.map(s => (
                <SelectItem key={s} value={s}>{STAGE_LABELS[s]} ({stageCounts[s] || 0})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {landingPages.length > 1 && (
            <Select value={filterPage} onValueChange={setFilterPage}>
              <SelectTrigger className="w-[200px] bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="All Landing Pages" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-white/10 text-white">
                <SelectItem value="all">All Landing Pages</SelectItem>
                {landingPages.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.client_name} ({p.slug})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-sm text-white/40 ml-auto">
            {filteredLeads.length} leads
          </p>
        </div>

        {/* Leads List */}
        <div className="space-y-3">
          {filteredLeads.length === 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
              <p className="text-white/40">No leads yet. They'll appear here automatically as your landing page gets traffic.</p>
            </div>
          )}
          {filteredLeads.map(lead => {
            const isExpanded = expandedLead === lead.id;
            const isEditing = editingLead === lead.id;
            const pageName = landingPages.find(p => p.id === lead.landing_page_id)?.slug || '—';
            return (
              <div key={lead.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/[0.08] transition-colors"
                  onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white truncate">{lead.full_name}</span>
                      <StatusBadge status={lead.status} />
                      {lead.lead_score != null && lead.lead_score > 0 && (
                        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          Score: {lead.lead_score}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/40">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.property_address}</span>
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
                      <span>via /{pageName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/30">{format(new Date(lead.created_at), 'MMM d, h:mm a')}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/10 p-4 bg-white/[0.03] space-y-4">
                    {/* Move pipeline stage */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/40 mr-1">Move to:</span>
                      {PIPELINE_STAGES.map(stage => (
                        <button
                          key={stage}
                          onClick={() => updateLeadStatus(lead.id, stage)}
                          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                            lead.status === stage
                              ? 'bg-white/15 border-white/30 text-white'
                              : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {STAGE_LABELS[stage]}
                        </button>
                      ))}
                    </div>

                    {/* Editable fields */}
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-white/40">Name</label>
                            <Input value={editForm.full_name || ''} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} className="bg-white/5 border-white/10 text-white h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-white/40">Phone</label>
                            <Input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="bg-white/5 border-white/10 text-white h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-white/40">Address</label>
                            <Input value={editForm.property_address || ''} onChange={e => setEditForm(f => ({ ...f, property_address: e.target.value }))} className="bg-white/5 border-white/10 text-white h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-white/40">Motivation</label>
                            <Input value={editForm.motivation || ''} onChange={e => setEditForm(f => ({ ...f, motivation: e.target.value }))} className="bg-white/5 border-white/10 text-white h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-white/40">Timeline</label>
                            <Input value={editForm.timeline || ''} onChange={e => setEditForm(f => ({ ...f, timeline: e.target.value }))} className="bg-white/5 border-white/10 text-white h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-white/40">Asking Price</label>
                            <Input type="number" value={editForm.asking_price ?? ''} onChange={e => setEditForm(f => ({ ...f, asking_price: e.target.value ? Number(e.target.value) : null }))} className="bg-white/5 border-white/10 text-white h-8 text-sm" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(lead.id)} className="bg-white text-black hover:bg-white/90 h-7 text-xs">
                            <Save className="h-3 w-3 mr-1" />Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingLead(null)} className="text-white/40 hover:text-white h-7 text-xs">
                            <X className="h-3 w-3 mr-1" />Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {lead.motivation && (
                            <div>
                              <p className="text-xs text-white/40 mb-1">Motivation</p>
                              <p className="text-sm font-medium text-white/80">{lead.motivation}</p>
                            </div>
                          )}
                          {lead.timeline && (
                            <div>
                              <p className="text-xs text-white/40 mb-1">Timeline</p>
                              <p className="text-sm font-medium text-white/80">{lead.timeline}</p>
                            </div>
                          )}
                          {lead.asking_price != null && (
                            <div>
                              <p className="text-xs text-white/40 mb-1">Asking Price</p>
                              <p className="text-sm font-medium text-white/80 flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />{Number(lead.asking_price).toLocaleString()}
                              </p>
                            </div>
                          )}
                          {lead.vapi_call_status && (
                            <div>
                              <p className="text-xs text-white/40 mb-1">AI Call Status</p>
                              <StatusBadge status={lead.vapi_call_status} />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => startEditing(lead)}
                          className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors"
                        >
                          <Edit2 className="h-3 w-3" />Edit Lead
                        </button>
                      </>
                    )}

                    {lead.ai_notes && (
                      <div>
                        <p className="text-xs text-white/40 mb-1">AI Notes</p>
                        <div className="text-sm text-white/60 bg-white/5 rounded-lg border border-white/10 p-3 whitespace-pre-wrap">
                          {lead.ai_notes}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-4 flex-wrap">
                      {lead.ai_notes && (
                        <button
                          onClick={() => downloadTranscript(lead)}
                          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white font-medium transition-colors"
                        >
                          <FileText className="h-4 w-4" />
                          Download AI Transcript
                        </button>
                      )}
                      {lead.vapi_recording_url && (
                        <a
                          href={lead.vapi_recording_url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white font-medium transition-colors"
                        >
                          <Download className="h-4 w-4" />
                          Download Call Recording
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
