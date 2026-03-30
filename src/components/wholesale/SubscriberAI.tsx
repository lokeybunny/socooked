import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Bot, Users, Loader2, Play, Eye, Mail, MapPin, DollarSign,
  Home, Zap, RefreshCw, ChevronDown, ChevronUp, CheckCircle, Settings2
} from 'lucide-react';
import AutomateSearchEditor from './AutomateSearchEditor';

interface AutomateBuyer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  deal_type: string;
  target_states: string[];
  target_counties: string[];
  budget_min: number | null;
  budget_max: number | null;
  acreage_min: number | null;
  acreage_max: number | null;
  property_type_interest: string[];
  pipeline_stage: string | null;
  meta: Record<string, any>;
  updated_at: string;
}

interface CapRow {
  landing_page_id: string;
  week_start: string;
  leads_delivered: number;
  cap: number;
}

interface MatchedLead {
  id: string;
  full_name: string;
  phone: string;
  property_address: string;
  status: string;
  lead_score: number | null;
  created_at: string;
  meta: Record<string, any> | null;
}

const WEEKLY_CAP = 50;

export default function SubscriberAI() {
  const [buyers, setBuyers] = useState<AutomateBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [buyerLeads, setBuyerLeads] = useState<Record<string, MatchedLead[]>>({});
  const [buyerPages, setBuyerPages] = useState<Record<string, { page_id: string; slug: string; email: string | null }>>({});
  const [capData, setCapData] = useState<Record<string, CapRow>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [detailLead, setDetailLead] = useState<MatchedLead | null>(null);
  const [searchEditorBuyer, setSearchEditorBuyer] = useState<AutomateBuyer | null>(null);

  const getWeekStart = () => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((dayOfWeek + 6) % 7));
    return monday.toISOString().split('T')[0];
  };

  const load = useCallback(async () => {
    setLoading(true);

    // 1. Get all subscribed + active buyers
    const { data: buyerData } = await supabase
      .from('lw_buyers')
      .select('*')
      .in('pipeline_stage', ['warm', 'active'])
      .order('updated_at', { ascending: false });

    const allBuyers = (buyerData || []) as AutomateBuyer[];
    setBuyers(allBuyers);

    // 2. Get landing pages to map buyers to clients
    const { data: pages } = await supabase
      .from('lw_landing_pages')
      .select('id, slug, email, client_user_id, meta')
      .eq('is_active', true);

    // Map buyer → landing page via meta.buyer_id or email match
    const pageMap: Record<string, { page_id: string; slug: string; email: string | null }> = {};
    for (const buyer of allBuyers) {
      // Try to find a landing page linked to this buyer via email
      const matchedPage = (pages || []).find(p =>
        (p.email && buyer.email && p.email.toLowerCase() === buyer.email.toLowerCase()) ||
        (p.meta as any)?.buyer_id === buyer.id
      );
      if (matchedPage) {
        pageMap[buyer.id] = { page_id: matchedPage.id, slug: matchedPage.slug, email: matchedPage.email };
      }
    }
    setBuyerPages(pageMap);

    // 3. Get weekly cap data
    const weekStart = getWeekStart();
    const pageIds = Object.values(pageMap).map(p => p.page_id);
    if (pageIds.length > 0) {
      const { data: caps } = await supabase
        .from('lw_client_lead_caps')
        .select('*')
        .eq('week_start', weekStart)
        .in('landing_page_id', pageIds);

      const capMap: Record<string, CapRow> = {};
      for (const cap of (caps || [])) {
        // Map back to buyer via pageMap
        for (const [buyerId, pageInfo] of Object.entries(pageMap)) {
          if (pageInfo.page_id === cap.landing_page_id) {
            capMap[buyerId] = cap as CapRow;
          }
        }
      }
      setCapData(capMap);
    }

    // 4. Load recent leads for each buyer's landing page (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const leadsMap: Record<string, MatchedLead[]> = {};
    for (const [buyerId, pageInfo] of Object.entries(pageMap)) {
      const { data: leads } = await supabase
        .from('lw_landing_leads')
        .select('id, full_name, phone, property_address, status, lead_score, created_at, meta')
        .eq('landing_page_id', pageInfo.page_id)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50);
      leadsMap[buyerId] = (leads || []) as MatchedLead[];
    }
    setBuyerLeads(leadsMap);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerMatch = async (buyer: AutomateBuyer) => {
    const pageInfo = buyerPages[buyer.id];
    if (!pageInfo) {
      toast.error('No landing page linked to this buyer. Assign one via email match first.');
      return;
    }

    setRunningId(buyer.id);
    try {
      const { data, error } = await supabase.functions.invoke('weekly-lead-matcher', {
        body: { buyer_id: buyer.id, page_id: pageInfo.page_id },
      });
      if (error) throw error;
      toast.success(`Lead matching complete for ${buyer.full_name}`);
      load();
    } catch (err: any) {
      toast.error('Match failed: ' + (err.message || 'Unknown error'));
    } finally {
      setRunningId(null);
    }
  };

  const getInterests = (buyer: AutomateBuyer) => {
    const interests = (buyer.meta as any)?.interests || {};
    return interests;
  };

  const isSubscriber = (buyer: AutomateBuyer) => buyer.pipeline_stage === 'warm';
  const isActive = (buyer: AutomateBuyer) => buyer.pipeline_stage === 'active';

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Automate
          </h3>
          <p className="text-sm text-muted-foreground">
            Pull leads from the seller API for subscribed &amp; active buyers — subscribers get auto-emails, active leads stay for manual push
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {buyers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No buyers in Subscribed or Active pipeline yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Move a buyer to "Subscribed" or "Active" in the Buyers tab to start automating lead pulls.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {buyers.map((buyer) => {
            const pageInfo = buyerPages[buyer.id];
            const cap = capData[buyer.id];
            const leads = buyerLeads[buyer.id] || [];
            const delivered = cap?.leads_delivered || 0;
            const remaining = WEEKLY_CAP - delivered;
            const interests = getInterests(buyer);
            const isExpanded = expandedId === buyer.id;
            const isRunning = runningId === buyer.id;

            return (
              <Card key={buyer.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{buyer.full_name}</p>
                          {buyer.entity_name && (
                            <span className="text-xs text-muted-foreground">({buyer.entity_name})</span>
                          )}
                          {isSubscriber(buyer) ? (
                            <Badge className="bg-orange-500/10 text-orange-500 text-[10px]">Subscribed — Auto Email</Badge>
                          ) : (
                            <Badge className="bg-sky-500/10 text-sky-500 text-[10px]">Active — Manual Push</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          {buyer.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{buyer.email}</span>}
                          {buyer.target_states.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {buyer.target_states.join(', ')}
                            </span>
                          )}
                          {(buyer.budget_min || buyer.budget_max) && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {buyer.budget_min ? `$${(buyer.budget_min / 1000).toFixed(0)}k` : '$0'}
                              {' – '}
                              {buyer.budget_max ? `$${(buyer.budget_max / 1000).toFixed(0)}k` : 'No max'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        disabled={!pageInfo}
                        onClick={() => setSearchEditorBuyer(buyer)}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Edit & Run
                      </Button>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-4 flex-wrap text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Weekly Cap:</span>
                      <span className={`font-bold ${remaining <= 0 ? 'text-destructive' : remaining <= 10 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                        {delivered}/{WEEKLY_CAP}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">This Week:</span>
                      <span className="font-medium text-foreground">{leads.length} leads</span>
                    </div>
                    {!pageInfo && (
                      <Badge variant="destructive" className="text-[10px]">No Landing Page Linked</Badge>
                    )}
                    {pageInfo && (
                      <Badge variant="outline" className="text-[10px]">Page: /{pageInfo.slug}</Badge>
                    )}
                  </div>

                  {/* Search Preferences Summary */}
                  <div className="flex flex-wrap gap-1.5">
                    {(interests.property_types || buyer.property_type_interest || []).map((pt: string) => (
                      <Badge key={pt} variant="secondary" className="text-[10px]">
                        {pt === 'sfr' ? '🏠 SFR' : pt === 'land' ? '🏞️ Land' : pt === 'multi_family' ? '🏘️ MFR' : pt}
                      </Badge>
                    ))}
                    {(interests.motivation_flags || []).map((mf: string) => (
                      <Badge key={mf} variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">
                        {mf === 'distressed' ? '🔥 Distressed' : mf === 'pre_foreclosure' ? '⚠️ Pre-Foreclosure' : mf === 'tax_delinquent' ? '💰 Tax Delinquent' : mf === 'vacant' ? '🏚️ Vacant' : mf}
                      </Badge>
                    ))}
                    {buyer.target_counties.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {buyer.target_counties.length} {buyer.target_counties.length === 1 ? 'county' : 'counties'}
                      </Badge>
                    )}
                  </div>

                  {/* Expandable Leads Section */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : buyer.id)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition w-full"
                  >
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    <span className="font-medium">{leads.length} matched lead{leads.length !== 1 ? 's' : ''} this week</span>
                  </button>

                  {isExpanded && leads.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">Property</TableHead>
                            <TableHead className="text-xs">Score</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leads.map((lead) => (
                            <TableRow key={lead.id}>
                              <TableCell className="text-xs font-medium">{lead.full_name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{lead.property_address}</TableCell>
                              <TableCell>
                                {lead.lead_score != null ? (
                                  <span className={`text-xs font-mono font-semibold ${lead.lead_score >= 70 ? 'text-emerald-500' : lead.lead_score >= 40 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                                    {lead.lead_score}
                                  </span>
                                ) : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px]">{lead.status}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(lead.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setDetailLead(lead)}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {isExpanded && leads.length === 0 && (
                    <div className="text-center py-6 text-muted-foreground text-xs border border-border rounded-lg">
                      <Zap className="h-5 w-5 mx-auto mb-1 opacity-40" />
                      No leads matched this week yet. Click "Run Now" to trigger matching.
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lead Detail Modal */}
      <Dialog open={!!detailLead} onOpenChange={(o) => { if (!o) setDetailLead(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              Lead Detail
            </DialogTitle>
          </DialogHeader>
          {detailLead && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{detailLead.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p>{detailLead.phone || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Property Address</p>
                  <p>{detailLead.property_address}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="secondary">{detailLead.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lead Score</p>
                  <p className="font-mono font-semibold">{detailLead.lead_score ?? '—'}</p>
                </div>
              </div>
              {detailLead.meta && (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Property Data</p>
                  {(detailLead.meta as any).assessed_value && (
                    <p className="text-xs">Assessed Value: <span className="font-medium">${Number((detailLead.meta as any).assessed_value).toLocaleString()}</span></p>
                  )}
                  {(detailLead.meta as any).acreage && (
                    <p className="text-xs">Acreage: <span className="font-medium">{(detailLead.meta as any).acreage} acres</span></p>
                  )}
                  {(detailLead.meta as any).opportunity_score && (
                    <p className="text-xs">Opportunity Score: <span className="font-medium">{(detailLead.meta as any).opportunity_score}</span></p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                Auto-emailed to subscriber & pushed to Hot Leads
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Search Editor Modal */}
      {searchEditorBuyer && (
        <AutomateSearchEditor
          open={!!searchEditorBuyer}
          onOpenChange={(o) => { if (!o) setSearchEditorBuyer(null); }}
          buyer={searchEditorBuyer}
          pageId={buyerPages[searchEditorBuyer.id]?.page_id || ''}
          onComplete={load}
        />
      )}
    </div>
  );
}
