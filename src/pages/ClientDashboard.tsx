import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toast } from 'sonner';
import {
  Home, LogOut, Phone, MapPin, Calendar, User, Download,
  ChevronDown, ChevronUp, DollarSign, Loader2, Filter
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
}

interface LandingPage {
  id: string;
  slug: string;
  client_name: string;
}

const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'under_contract', 'closed'] as const;

export default function ClientDashboard() {
  const { user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [filterPage, setFilterPage] = useState<string>('all');
  const [filterStage, setFilterStage] = useState<string>('all');

  const loadData = useCallback(async () => {
    if (!user) return;

    // Get landing pages for this client
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

  // Subscribe to realtime updates
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Wholesale Dashboard</h1>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />Sign Out
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Pipeline Overview */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">CRM Pipeline</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PIPELINE_STAGES.map(stage => (
              <div
                key={stage}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors ${
                  filterStage === stage ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setFilterStage(filterStage === stage ? 'all' : stage)}
              >
                <StatusBadge status={stage} />
                <p className="text-2xl font-bold text-slate-900 mt-2">{stageCounts[stage] || 0}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-600">Filter:</span>
          </div>
          {landingPages.length > 1 && (
            <Select value={filterPage} onValueChange={setFilterPage}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Landing Pages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Landing Pages</SelectItem>
                {landingPages.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.client_name} ({p.slug})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-sm text-slate-500 ml-auto">
            {filteredLeads.length} leads
          </p>
        </div>

        {/* Leads List */}
        <div className="space-y-3">
          {filteredLeads.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <p className="text-slate-500">No leads yet. They'll appear here automatically as your landing page gets traffic.</p>
            </div>
          )}
          {filteredLeads.map(lead => {
            const isExpanded = expandedLead === lead.id;
            const pageName = landingPages.find(p => p.id === lead.landing_page_id)?.slug || '—';
            return (
              <div key={lead.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-900 truncate">{lead.full_name}</span>
                      <StatusBadge status={lead.status} />
                      {lead.lead_score != null && lead.lead_score > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          Score: {lead.lead_score}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.property_address}</span>
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
                      <span>via /{pageName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{format(new Date(lead.created_at), 'MMM d, h:mm a')}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {lead.motivation && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Motivation</p>
                          <p className="text-sm font-medium text-slate-900">{lead.motivation}</p>
                        </div>
                      )}
                      {lead.timeline && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Timeline</p>
                          <p className="text-sm font-medium text-slate-900">{lead.timeline}</p>
                        </div>
                      )}
                      {lead.asking_price != null && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Asking Price</p>
                          <p className="text-sm font-medium text-slate-900 flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />{Number(lead.asking_price).toLocaleString()}
                          </p>
                        </div>
                      )}
                      {lead.vapi_call_status && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">AI Call Status</p>
                          <StatusBadge status={lead.vapi_call_status} />
                        </div>
                      )}
                    </div>

                    {lead.ai_notes && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">AI Notes</p>
                        <div className="text-sm text-slate-700 bg-white rounded-lg border border-slate-200 p-3 whitespace-pre-wrap">
                          {lead.ai_notes}
                        </div>
                      </div>
                    )}

                    {lead.vapi_recording_url && (
                      <div>
                        <a
                          href={lead.vapi_recording_url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          <Download className="h-4 w-4" />
                          Download Call Recording
                        </a>
                      </div>
                    )}
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
