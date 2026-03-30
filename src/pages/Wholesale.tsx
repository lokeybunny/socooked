import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Phone, CheckCircle, SkipForward, MapPin, Users, Building2, DollarSign, TrendingUp, Plus, Search, ArrowUpDown, BarChart3, Heart, ChevronLeft, ChevronRight, FileSignature, Home, Globe, UserCheck, Bot } from 'lucide-react';
import BuyerDiscovery from '@/components/wholesale/BuyerDiscovery';
import BuyerSources from '@/components/wholesale/BuyerSources';
import BuyerSettings from '@/components/wholesale/BuyerSettings';
import LandingPageManager from '@/components/wholesale/LandingPageManager';
import SellerManager from '@/components/wholesale/SellerManager';
import DistressDashboard from '@/components/wholesale/DistressDashboard';
import BuyerSellerMatches from '@/components/wholesale/BuyerSellerMatches';
import LeadsManager from '@/components/wholesale/LeadsManager';
import VapiSpendDashboard from '@/components/wholesale/VapiSpendDashboard';
import SubscriberAI from '@/components/wholesale/SubscriberAI';
import { toast } from 'sonner';

type DealType = 'all' | 'land' | 'home' | 'multi_home';

export default function Wholesale() {
  const [dealTypeFilter, setDealTypeFilter] = useState<DealType>('all');
  const [activeTab, setActiveTab] = useState('intelligence');
  
  const [deals, setDeals] = useState<any[]>([]);
  const [demandSignals, setDemandSignals] = useState<any[]>([]);
  const [stats, setStats] = useState({ buyers: 0, sellers: 0, sellersUnderContract: 0, dealsMonth: 0, apiSpend: 0, avgMatch: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [dealTypeFilter]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadDeals(), loadDemandSignals(), loadStats()]);
    setLoading(false);
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

    const [buyersRes, sellersRes, sellersUCRes, dealsRes, runsRes, matchRes] = await Promise.all([
      supabase.from('lw_buyers').select('id', { count: 'exact', head: true }).eq('pipeline_stage', 'active'),
      supabase.from('lw_sellers').select('id', { count: 'exact', head: true }),
      supabase.from('lw_sellers').select('id', { count: 'exact', head: true }).eq('status', 'under_contract'),
      supabase.from('lw_deals').select('id', { count: 'exact', head: true }).gte('created_at', monthStart).neq('stage', 'matched'),
      supabase.from('lw_ingestion_runs').select('credits_used').gte('created_at', monthStart),
      supabase.from('lw_deals').select('match_score'),
    ]);

    const apiSpend = (runsRes.data || []).reduce((sum: number, r: any) => sum + (r.credits_used || 0), 0);
    const scores = (matchRes.data || []).map((d: any) => d.match_score);
    const avgMatch = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

    setStats({
      buyers: buyersRes.count || 0,
      sellers: sellersRes.count || 0,
      sellersUnderContract: sellersUCRes.count || 0,
      dealsMonth: dealsRes.count || 0,
      apiSpend,
      avgMatch,
    });
  };


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
              <SelectItem value="multi_home"><span className="flex items-center gap-1.5"><span className="relative flex items-center w-5 h-4"><Home className="h-3.5 w-3.5 text-purple-500 absolute left-0" /><Home className="h-3.5 w-3.5 text-purple-400 absolute left-1.5" /></span> Multi-Home</span></SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard icon={Users} label="Active Buyers" value={stats.buyers} />
        <StatCard icon={MapPin} label="Seller Leads" value={stats.sellers} />
        <StatCard icon={FileSignature} label="Sellers Under Contract" value={stats.sellersUnderContract} />
        <StatCard icon={Building2} label="Deals (Month)" value={stats.dealsMonth} />
        <StatCard icon={DollarSign} label="API Spend" value={`$${stats.apiSpend.toFixed(2)}`} />
        <StatCard icon={TrendingUp} label="Avg Match" value={stats.avgMatch} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="intelligence" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start flex-wrap">
          <TabsTrigger value="intelligence" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Intelligence
          </TabsTrigger>
          <TabsTrigger value="subscriber-ai" className="gap-1.5">
            <Bot className="h-3.5 w-3.5 text-primary" />
            Subscriber AI
          </TabsTrigger>
          <TabsTrigger value="pipeline">Deal Pipeline</TabsTrigger>
          <TabsTrigger value="demand" className="gap-1.5">
            <Heart className="h-3.5 w-3.5 text-pink-500" />
            Matches
          </TabsTrigger>
          <TabsTrigger value="buyers" className="gap-1.5 bg-green-500/10 text-green-600 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-500">
            <Users className="h-3.5 w-3.5" />
            Buyers
          </TabsTrigger>
          <TabsTrigger value="sellers" className="gap-1.5 bg-red-500/10 text-red-600 data-[state=active]:bg-red-500/20 data-[state=active]:text-red-500">
            <MapPin className="h-3.5 w-3.5" />
            Sellers
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1.5 bg-amber-500/10 text-amber-600 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-500">
            <UserCheck className="h-3.5 w-3.5" />
            Leads
          </TabsTrigger>
          {activeTab === 'buyers' && (
            <TabsTrigger value="sources" className="bg-sky-300/20 text-sky-600 data-[state=active]:bg-sky-400/25 data-[state=active]:text-sky-500">Discovery</TabsTrigger>
          )}
          <TabsTrigger value="landing" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Landing Pages
          </TabsTrigger>
          <TabsTrigger value="vapi-spend" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            Vapi Spend
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Tab 1: Call List */}
        {/* Tab 0: Intelligence Dashboard */}
        <TabsContent value="intelligence" className="mt-4">
          <DistressDashboard />
        </TabsContent>

        {/* Subscriber AI */}
        <TabsContent value="subscriber-ai" className="mt-4">
          <SubscriberAI />
        </TabsContent>

        {/* Tab 2: Deal Pipeline */}
        <TabsContent value="pipeline" className="mt-4">
          <DealPipeline deals={deals} stageColors={stageColors} />
        </TabsContent>

        <TabsContent value="demand" className="mt-4">
          <BuyerSellerMatches />
        </TabsContent>
        {/* Tab 4: Buyers */}
        <TabsContent value="buyers" className="mt-4">
          <BuyerDiscovery />
        </TabsContent>
        {/* Tab 5: Sellers */}
        <TabsContent value="sellers" className="mt-4">
          <SellerManager />
        </TabsContent>
        {/* Tab 6: Discovery Sources */}
        <TabsContent value="sources" className="mt-4">
          <BuyerSources />
        </TabsContent>
        {/* Landing Pages */}
        <TabsContent value="landing" className="mt-4">
          <LandingPageManager />
        </TabsContent>
        {/* Leads */}
        <TabsContent value="leads" className="mt-4">
          <LeadsManager />
        </TabsContent>
        {/* Vapi Spend */}
        <TabsContent value="vapi-spend" className="mt-4">
          <VapiSpendDashboard />
        </TabsContent>
        {/* Settings */}
        <TabsContent value="settings" className="mt-4">
          <BuyerSettings />
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

const PIPELINE_PAGE_SIZE = 25;

function DealPipeline({ deals, stageColors }: { deals: any[]; stageColors: Record<string, string> }) {
  const [page, setPage] = useState(1);

  // Only show deals that have both a buyer and a seller linked
  const authorizedDeals = deals.filter(d => d.buyer_id && d.seller_id && d.stage !== 'matched');
  const totalPages = Math.max(1, Math.ceil(authorizedDeals.length / PIPELINE_PAGE_SIZE));
  const paginated = authorizedDeals.slice((page - 1) * PIPELINE_PAGE_SIZE, page * PIPELINE_PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Deal Pipeline
          <Badge variant="outline" className="ml-auto">{authorizedDeals.length} deals</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {authorizedDeals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No deals in the pipeline yet</p>
            <p className="text-xs mt-1">Move a seller to "Under Contract", then use the <span className="font-semibold text-foreground">Connect Deal</span> button in their detail popup to link a buyer and create a deal.</p>
          </div>
        ) : (
          <>
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
                {paginated.map((deal) => (
                  <TableRow key={deal.id}>
                    <TableCell className="font-medium">{deal.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {deal.deal_type === 'land' ? '🏞️' : deal.deal_type === 'multi_home' ? <span className="relative inline-flex items-center w-5 h-4 mr-1"><Home className="h-3.5 w-3.5 text-purple-500 absolute left-0" /><Home className="h-3.5 w-3.5 text-purple-400 absolute left-1.5" /></span> : '🏠'} {deal.deal_type === 'multi_home' ? 'multi-home' : deal.deal_type}
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
                <div className="flex gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
