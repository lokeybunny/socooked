import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Phone, CheckCircle, SkipForward, MapPin, Users, Building2, DollarSign, TrendingUp, Plus, Search, ArrowUpDown } from 'lucide-react';
import BuyerManager from '@/components/wholesale/BuyerManager';
import { toast } from 'sonner';

type DealType = 'all' | 'land' | 'home';

export default function Wholesale() {
  const [dealTypeFilter, setDealTypeFilter] = useState<DealType>('all');
  const [callQueue, setCallQueue] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [demandSignals, setDemandSignals] = useState<any[]>([]);
  const [stats, setStats] = useState({ buyers: 0, sellers: 0, dealsMonth: 0, apiSpend: 0, avgMatch: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [dealTypeFilter]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadCallQueue(), loadDeals(), loadDemandSignals(), loadStats()]);
    setLoading(false);
  };

  const loadCallQueue = async () => {
    const today = new Date().toISOString().split('T')[0];
    let query = supabase.from('lw_call_queue').select('*').eq('queue_date', today).order('call_priority', { ascending: true });
    const { data } = await query;
    setCallQueue(data || []);
  };

  const loadDeals = async () => {
    let query = supabase.from('lw_deals').select('*, lw_sellers(*), lw_buyers(*)').order('match_score', { ascending: false });
    if (dealTypeFilter !== 'all') query = query.eq('deal_type', dealTypeFilter);
    const { data } = await query;
    setDeals(data || []);
  };

  const loadDemandSignals = async () => {
    let query = supabase.from('lw_demand_signals').select('*').order('demand_rank', { ascending: true });
    if (dealTypeFilter !== 'all') query = query.eq('deal_type', dealTypeFilter);
    const { data } = await query;
    setDemandSignals(data || []);
  };

  const loadStats = async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [buyersRes, sellersRes, dealsRes, runsRes, matchRes] = await Promise.all([
      supabase.from('lw_buyers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('lw_sellers').select('id', { count: 'exact', head: true }),
      supabase.from('lw_deals').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      supabase.from('lw_ingestion_runs').select('credits_used').gte('created_at', monthStart),
      supabase.from('lw_deals').select('match_score'),
    ]);

    const apiSpend = (runsRes.data || []).reduce((sum: number, r: any) => sum + (r.credits_used || 0), 0);
    const scores = (matchRes.data || []).map((d: any) => d.match_score);
    const avgMatch = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

    setStats({
      buyers: buyersRes.count || 0,
      sellers: sellersRes.count || 0,
      dealsMonth: dealsRes.count || 0,
      apiSpend,
      avgMatch,
    });
  };

  const markCalled = async (id: string) => {
    await supabase.from('lw_call_queue').update({ status: 'called', called_at: new Date().toISOString() }).eq('id', id);
    toast.success('Marked as called');
    loadCallQueue();
  };

  const skipCall = async (id: string) => {
    await supabase.from('lw_call_queue').update({ status: 'skipped' }).eq('id', id);
    toast('Call skipped');
    loadCallQueue();
  };

  const pendingCalls = callQueue.filter(c => c.status === 'pending').length;

  const stageColors: Record<string, string> = {
    matched: 'bg-muted text-muted-foreground',
    contacted_seller: 'bg-blue-500/10 text-blue-500',
    offer_sent: 'bg-yellow-500/10 text-yellow-500',
    under_contract: 'bg-orange-500/10 text-orange-500',
    assigned: 'bg-purple-500/10 text-purple-500',
    closed: 'bg-green-500/10 text-green-500',
    dead: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Wholesale Deals</h1>
          <p className="text-sm text-muted-foreground">Buyer-first demand matching engine</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dealTypeFilter} onValueChange={(v) => setDealTypeFilter(v as DealType)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="land">🏞️ Land</SelectItem>
              <SelectItem value="home">🏠 Homes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Users} label="Active Buyers" value={stats.buyers} />
        <StatCard icon={MapPin} label="Seller Leads" value={stats.sellers} />
        <StatCard icon={Building2} label="Deals (Month)" value={stats.dealsMonth} />
        <StatCard icon={DollarSign} label="API Spend" value={`$${stats.apiSpend.toFixed(2)}`} />
        <StatCard icon={TrendingUp} label="Avg Match" value={stats.avgMatch} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="calls" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="calls" className="relative">
            Daily Call List
            {pendingCalls > 0 && (
              <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">{pendingCalls}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pipeline">Deal Pipeline</TabsTrigger>
          <TabsTrigger value="demand">Demand Map</TabsTrigger>
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
        </TabsList>

        {/* Tab 1: Call List */}
        <TabsContent value="calls" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Today's Call Queue
                <Badge variant="outline" className="ml-auto">{pendingCalls} remaining</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {callQueue.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No calls queued for today</p>
                  <p className="text-xs mt-1">Run the matching engine to generate your daily call list</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Motivation</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callQueue.map((call) => (
                      <TableRow key={call.id} className={call.status !== 'pending' ? 'opacity-50' : ''}>
                        <TableCell className="font-mono text-xs">{call.call_priority}</TableCell>
                        <TableCell className="font-medium">{call.owner_name || '—'}</TableCell>
                        <TableCell>
                          {call.owner_phone ? (
                            <a href={`tel:${call.owner_phone}`} className="text-primary hover:underline text-sm">
                              {call.owner_phone}
                            </a>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{call.property_address || '—'}</TableCell>
                        <TableCell>
                          <ScoreBadge value={call.motivation_score} />
                        </TableCell>
                        <TableCell>
                          <ScoreBadge value={call.match_score} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{call.reason}</TableCell>
                        <TableCell>
                          <Badge variant={call.status === 'pending' ? 'default' : 'secondary'} className="text-[10px]">
                            {call.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {call.status === 'pending' && (
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => markCalled(call.id)}>
                                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => skipCall(call.id)}>
                                <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Deal Pipeline */}
        <TabsContent value="pipeline" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Deal Pipeline
                <Badge variant="outline" className="ml-auto">{deals.length} deals</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No deals yet</p>
                  <p className="text-xs mt-1">Deals are created when buyers are matched with seller leads</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deal</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Match Score</TableHead>
                      <TableHead>Seller Ask</TableHead>
                      <TableHead>Our Offer</TableHead>
                      <TableHead>Buyer Price</TableHead>
                      <TableHead>Spread</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell className="font-medium">{deal.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {deal.deal_type === 'land' ? '🏞️' : '🏠'} {deal.deal_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${stageColors[deal.stage] || ''}`}>
                            {deal.stage.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell><ScoreBadge value={deal.match_score} /></TableCell>
                        <TableCell className="text-sm">{deal.seller_ask ? `$${Number(deal.seller_ask).toLocaleString()}` : '—'}</TableCell>
                        <TableCell className="text-sm">{deal.our_offer ? `$${Number(deal.our_offer).toLocaleString()}` : '—'}</TableCell>
                        <TableCell className="text-sm">{deal.buyer_price ? `$${Number(deal.buyer_price).toLocaleString()}` : '—'}</TableCell>
                        <TableCell className="font-mono text-sm font-semibold text-green-500">
                          {deal.spread ? `$${Number(deal.spread).toLocaleString()}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Demand Map */}
        <TabsContent value="demand" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Buyer Demand by County
                <Badge variant="outline" className="ml-auto">{demandSignals.length} counties</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {demandSignals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No demand signals yet</p>
                  <p className="text-xs mt-1">Demand is calculated from active buyer preferences</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>County</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Active Buyers</TableHead>
                      <TableHead>Avg Budget</TableHead>
                      <TableHead>Acreage Range</TableHead>
                      <TableHead>Last Refreshed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demandSignals.map((sig) => (
                      <TableRow key={sig.id}>
                        <TableCell className="font-mono text-sm font-bold">#{sig.demand_rank || '—'}</TableCell>
                        <TableCell className="font-medium">{sig.county}</TableCell>
                        <TableCell>{sig.state}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {sig.deal_type === 'land' ? '🏞️' : '🏠'} {sig.deal_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{sig.buyer_count}</TableCell>
                        <TableCell>{sig.avg_budget ? `$${Number(sig.avg_budget).toLocaleString()}` : '—'}</TableCell>
                        <TableCell className="text-sm">
                          {sig.avg_acreage_min != null ? `${sig.avg_acreage_min}–${sig.avg_acreage_max || '∞'} ac` : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {sig.last_refreshed_at ? new Date(sig.last_refreshed_at).toLocaleDateString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Tab 4: Buyers */}
        <TabsContent value="buyers" className="mt-4">
          <BuyerManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = value >= 70 ? 'text-green-500' : value >= 40 ? 'text-yellow-500' : 'text-muted-foreground';
  return <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>;
}
