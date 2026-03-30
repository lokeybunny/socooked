import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toast } from 'sonner';
import {
  Home, LogOut, Phone, MapPin, Download, Save, X, Edit2,
  ChevronDown, ChevronUp, DollarSign, Loader2, Filter, FileText, Flame, Globe, Mail,
  RefreshCw, Trash2, Archive, RotateCcw
} from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
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
  vapi_call_id: string | null;
  vapi_recording_url: string | null;
  landing_page_id: string | null;
  email: string | null;
  property_condition: string | null;
  meta: Record<string, any> | null;
  drafted_at: string | null;
}

interface LandingPage {
  id: string;
  slug: string;
  client_name: string;
  vapi_credit_balance_cents: number;
  vapi_total_spent_cents: number;
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
  const [searchParams] = useSearchParams();
  const adminViewPageId = searchParams.get('admin_view');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [filterPage, setFilterPage] = useState<string>('all');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [editingLead, setEditingLead] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});
  const [activeSection, setActiveSection] = useState<'funnel' | 'hot' | 'phone' | 'drafts'>('funnel');
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null);
  const [fetchingLeadId, setFetchingLeadId] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminViewClientName, setAdminViewClientName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const admin = !!roleData;
    setIsAdmin(admin);

    // Determine which landing pages to load
    let clientPages: LandingPage[] = [];

    if (admin && adminViewPageId) {
      // Admin impersonation: scope to a single landing page
      const { data: pages } = await supabase
        .from('lw_landing_pages')
        .select('id, slug, client_name, vapi_credit_balance_cents, vapi_total_spent_cents')
        .eq('id', adminViewPageId);
      clientPages = (pages || []) as LandingPage[];
      setAdminViewClientName(clientPages[0]?.client_name || 'Unknown Client');
    } else {
      // Normal flow: Admins see ALL landing pages; clients only see their own
      let pagesQuery = supabase
        .from('lw_landing_pages')
        .select('id, slug, client_name, vapi_credit_balance_cents, vapi_total_spent_cents');
      if (!admin) {
        pagesQuery = pagesQuery.eq('client_user_id', user.id);
      }
      const { data: pages } = await pagesQuery;
      clientPages = (pages || []) as LandingPage[];
    }

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
  }, [user, adminViewPageId]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
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

  const sendLeadReport = async (lead: Lead) => {
    setSendingLeadId(lead.id);
    try {
      const { data, error } = await supabase.functions.invoke('lead-report-email', {
        body: { lead_id: lead.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Report sent to ${data.sent_to}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send report');
    } finally {
      setSendingLeadId(null);
    }
  };

  // ─── Fetch / Retry Vapi call data ───
  const fetchVapiData = async (lead: Lead) => {
    setFetchingLeadId(lead.id);
    try {
      // If the lead already has a call ID, sync data from Vapi API
      // Otherwise trigger a new call
      const action = lead.vapi_call_id ? 'sync_call' : 'trigger_call';
      const { data, error } = await supabase.functions.invoke('vapi-outbound', {
        body: { action, lead_id: lead.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (action === 'sync_call') {
        toast.success(`Call data synced — Status: ${data.call_status}, Duration: ${data.duration}s`);
      } else {
        toast.success(data?.credit_exhausted ? 'Credits exhausted' : 'AI call triggered — data will sync shortly');
      }
      setTimeout(() => loadData(), 2000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch call data');
    } finally {
      setFetchingLeadId(null);
    }
  };

  // ─── Soft-delete: move to drafts ───
  const moveToDrafts = async (leadId: string) => {
    const { error } = await supabase
      .from('lw_landing_leads')
      .update({ drafted_at: new Date().toISOString() } as any)
      .eq('id', leadId);
    if (error) {
      toast.error('Failed to move to drafts');
      return;
    }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, drafted_at: new Date().toISOString() } : l));
    toast.success('Lead moved to Drafts — will be permanently deleted in 72 hours');
  };

  // ─── Restore from drafts ───
  const restoreFromDrafts = async (leadId: string) => {
    const { error } = await supabase
      .from('lw_landing_leads')
      .update({ drafted_at: null } as any)
      .eq('id', leadId);
    if (error) {
      toast.error('Failed to restore lead');
      return;
    }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, drafted_at: null } : l));
    toast.success('Lead restored');
  };

  // ─── Permanently delete ───
  const permanentlyDelete = async (leadId: string) => {
    const { error } = await supabase
      .from('lw_landing_leads')
      .delete()
      .eq('id', leadId);
    if (error) {
      toast.error('Failed to delete lead');
      return;
    }
    setLeads(prev => prev.filter(l => l.id !== leadId));
    toast.success('Lead permanently deleted');
  };

  const isHotLead = (l: Lead) => {
    const src = (l.meta as any)?.source || '';
    return src === 'reapi_weekly_match' || src === 'seller_db_match';
  };

  // Separate drafted vs active leads
  const activeLeadsAll = leads.filter(l => !l.drafted_at);
  const draftedLeads = leads.filter(l => !!l.drafted_at);

  const funnelLeads = activeLeadsAll.filter(l => !isHotLead(l));
  const hotLeads = activeLeadsAll.filter(l => isHotLead(l));
  const activeLeads = activeSection === 'funnel' ? funnelLeads : activeSection === 'hot' ? hotLeads : [];

  const filteredLeads = activeLeads.filter(l => {
    if (filterPage !== 'all' && l.landing_page_id !== filterPage) return false;
    if (filterStage !== 'all' && l.status !== filterStage) return false;
    return true;
  });

  const stageCounts = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = activeLeads.filter(l => l.status === stage).length;
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
        {/* Section Tabs */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => { setActiveSection('funnel'); setFilterStage('all'); }}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-semibold transition-colors ${
              activeSection === 'funnel'
                ? 'bg-white/10 border-white/30 text-white'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20'
            }`}
          >
            <Globe className="h-4 w-4" />
            Lead Funnel Page
            <span className="ml-1 text-xs bg-white/10 px-2 py-0.5 rounded-full">{funnelLeads.length}</span>
          </button>
          <button
            onClick={() => { setActiveSection('hot'); setFilterStage('all'); }}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-semibold transition-colors ${
              activeSection === 'hot'
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-orange-300 hover:border-orange-500/20'
            }`}
          >
            <Flame className="h-4 w-4" />
            Hot Leads
            <span className="ml-1 text-xs bg-white/10 px-2 py-0.5 rounded-full">{hotLeads.length}</span>
          </button>
          <button
            onClick={() => setActiveSection('phone')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-semibold transition-colors ${
              activeSection === 'phone'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-emerald-300 hover:border-emerald-500/20'
            }`}
          >
            <Phone className="h-4 w-4" />
            Phone Spend
          </button>
          <button
            onClick={() => { setActiveSection('drafts'); setFilterStage('all'); }}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-semibold transition-colors ${
              activeSection === 'drafts'
                ? 'bg-red-500/20 border-red-500/40 text-red-300'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-red-300 hover:border-red-500/20'
            }`}
          >
            <Trash2 className="h-4 w-4" />
            Drafts
            {draftedLeads.length > 0 && (
              <span className="ml-1 text-xs bg-red-500/20 px-2 py-0.5 rounded-full">{draftedLeads.length}</span>
            )}
          </button>
        </div>

        {/* Phone Spend View */}
        {activeSection === 'phone' && (() => {
          const totalSpent = landingPages.reduce((s, p) => s + (p.vapi_total_spent_cents || 0), 0);
          const totalBalance = landingPages.reduce((s, p) => s + (p.vapi_credit_balance_cents || 0), 0);
          const totalCredit = totalSpent + totalBalance;
          const pctUsed = totalCredit > 0 ? Math.min(100, Math.round((totalSpent / totalCredit) * 100)) : 0;
          const isExhausted = totalBalance <= 0 && totalSpent > 0;

          return (
            <div className="space-y-6">
              {isExhausted && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="h-4 w-4 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-400">Phone Credits Exhausted</p>
                    <p className="text-xs text-red-300/70 mt-1">
                      Your AI callback credits have been used up. New leads will not receive automated calls.
                      Please contact Warren at <a href="mailto:warren@stu25.com" className="underline">warren@stu25.com</a> to add more credits.
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <p className="text-xs text-white/40">Total Spent</p>
                  <p className="text-xl font-bold text-white">${(totalSpent / 100).toFixed(2)}</p>
                </div>
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <p className="text-xs text-white/40">Remaining Credit</p>
                  <p className={`text-xl font-bold ${isExhausted ? 'text-red-400' : 'text-emerald-400'}`}>
                    ${(totalBalance / 100).toFixed(2)}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <p className="text-xs text-white/40">Total Credit</p>
                  <p className="text-xl font-bold text-white">${(totalCredit / 100).toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-white/5 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isExhausted ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${pctUsed}%` }}
                />
              </div>
              <p className="text-xs text-white/30 text-right">{pctUsed}% used</p>

              {/* Per-page breakdown */}
              {landingPages.length > 1 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-white/70">Breakdown by Landing Page</h3>
                  {landingPages.map(p => {
                    const spent = (p.vapi_total_spent_cents || 0);
                    const bal = (p.vapi_credit_balance_cents || 0);
                    const cred = spent + bal;
                    const pct = cred > 0 ? Math.min(100, Math.round((spent / cred) * 100)) : 0;
                    return (
                      <div key={p.id} className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">{p.client_name} <span className="text-white/30">/{p.slug}</span></span>
                          <span className="text-sm font-bold text-white">${(spent / 100).toFixed(2)} <span className="text-white/40 font-normal">/ ${(cred / 100).toFixed(2)}</span></span>
                        </div>
                        <div className="bg-white/5 rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full ${bal <= 0 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Drafts View */}
        {activeSection === 'drafts' && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">Leads moved to drafts will be permanently deleted after 72 hours.</p>
            {draftedLeads.length === 0 ? (
              <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
                <Archive className="h-8 w-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">No drafted leads. Leads you delete will appear here for 72 hours before permanent removal.</p>
              </div>
            ) : (
              draftedLeads.map(lead => {
                const hoursLeft = Math.max(0, 72 - differenceInHours(new Date(), new Date(lead.drafted_at!)));
                return (
                  <div key={lead.id} className="bg-white/5 rounded-xl border border-red-500/20 p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{lead.full_name}</p>
                      <div className="flex items-center gap-4 text-xs text-white/40 mt-1">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.property_address}</span>
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
                      </div>
                      <p className="text-xs text-red-400/70 mt-1">
                        {hoursLeft > 0 ? `Auto-deletes in ${hoursLeft}h` : 'Scheduled for deletion'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreFromDrafts(lead.id)}
                        className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white h-8 text-xs"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => permanentlyDelete(lead.id)}
                        className="border-red-500/30 text-red-400 hover:bg-red-500/20 h-8 text-xs"
                      >
                        <X className="h-3 w-3 mr-1" />Delete Now
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Section Description */}
        {activeSection !== 'phone' && activeSection !== 'drafts' && <>
        <p className="text-xs text-white/40 -mt-4">
          {activeSection === 'funnel'
            ? 'Leads submitted through your landing page funnel.'
            : 'Matched distressed property leads from the Realtor API — delivered weekly.'}
        </p>

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
              <p className="text-white/40">
                {activeSection === 'hot'
                  ? "No leads yet. They'll appear here automatically from our API database upon request throughout the week."
                  : "No leads yet. They'll appear here automatically as your landing page gets traffic."}
              </p>
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
                          {lead.email && (
                            <div>
                              <p className="text-xs text-white/40 mb-1">Email</p>
                              <p className="text-sm font-medium text-white/80">{lead.email}</p>
                            </div>
                          )}
                          {lead.property_condition && (
                            <div>
                              <p className="text-xs text-white/40 mb-1">Property Condition</p>
                              <p className="text-sm font-medium text-white/80">{lead.property_condition}</p>
                            </div>
                          )}
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

                        {/* REAPI / Meta Data */}
                        {lead.meta && Object.keys(lead.meta).length > 0 && (() => {
                          const m = lead.meta!;
                          const assessed = m.assessed_value ?? m.assessedValue;
                          const acreage = m.acreage ?? m.lotAcreage;
                          const distress = m.distress_flags || {};
                          const source = m.source;
                          const oppScore = m.opportunity_score;
                          const vapiSummary = m.vapi_summary;
                          const hasDistress = distress.tax_delinquent || distress.pre_foreclosure || distress.vacant;
                          const hasReapiFields = assessed || acreage || hasDistress || oppScore;

                          return (
                            <div className="space-y-3">
                              {hasReapiFields && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                  {assessed != null && (
                                    <div>
                                      <p className="text-xs text-white/40 mb-1">Assessed Value</p>
                                      <p className="text-sm font-medium text-white/80 flex items-center gap-1">
                                        <DollarSign className="h-3 w-3" />{Number(assessed).toLocaleString()}
                                      </p>
                                    </div>
                                  )}
                                  {acreage != null && (
                                    <div>
                                      <p className="text-xs text-white/40 mb-1">Acreage</p>
                                      <p className="text-sm font-medium text-white/80">{acreage} acres</p>
                                    </div>
                                  )}
                                  {oppScore != null && (
                                    <div>
                                      <p className="text-xs text-white/40 mb-1">Opportunity Score</p>
                                      <p className="text-sm font-medium text-amber-400">{oppScore}</p>
                                    </div>
                                  )}
                                  {source && (
                                    <div>
                                      <p className="text-xs text-white/40 mb-1">Source</p>
                                      <p className="text-sm font-medium text-white/80">{String(source).replace(/_/g, ' ')}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                              {hasDistress && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-white/40">Distress Flags:</span>
                                  {distress.tax_delinquent && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Tax Delinquent</span>}
                                  {distress.pre_foreclosure && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Pre-Foreclosure</span>}
                                  {distress.vacant && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">Vacant</span>}
                                </div>
                              )}
                              {vapiSummary && (
                                <div>
                                  <p className="text-xs text-white/40 mb-1">AI Call Summary</p>
                                  <div className="text-sm text-white/60 bg-white/5 rounded-lg border border-white/10 p-3">
                                    {vapiSummary}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
                      {/* Fetch / Retry AI Call */}
                      <button
                        onClick={() => fetchVapiData(lead)}
                        disabled={fetchingLeadId === lead.id}
                        className="inline-flex items-center gap-2 text-sm text-blue-400/80 hover:text-blue-300 font-medium transition-colors disabled:opacity-50"
                      >
                        {fetchingLeadId === lead.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {fetchingLeadId === lead.id ? 'Calling...' : 'Fetch / Retry AI Call'}
                      </button>
                      {lead.ai_notes && (
                        <button
                          onClick={() => downloadTranscript(lead)}
                          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white font-medium transition-colors"
                        >
                          <FileText className="h-4 w-4" />
                          Download AI Transcript
                        </button>
                      )}
                      {(() => {
                        const recUrl = lead.vapi_recording_url || (lead.meta as any)?.vapi_recording_url;
                        return recUrl ? (
                          <a
                            href={recUrl}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white font-medium transition-colors"
                          >
                            <Download className="h-4 w-4" />
                            Download Call Recording
                          </a>
                        ) : null;
                      })()}
                      <button
                        onClick={() => sendLeadReport(lead)}
                        disabled={sendingLeadId === lead.id}
                        className="inline-flex items-center gap-2 text-sm text-emerald-400/80 hover:text-emerald-300 font-medium transition-colors disabled:opacity-50"
                      >
                        {sendingLeadId === lead.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                        {sendingLeadId === lead.id ? 'Sending...' : 'Send Lead to Email'}
                      </button>
                      {/* Move to Drafts */}
                      <button
                        onClick={() => moveToDrafts(lead.id)}
                        className="inline-flex items-center gap-2 text-sm text-red-400/60 hover:text-red-400 font-medium transition-colors ml-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                        Move to Drafts
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>}
      </div>
    </div>
  );
}
