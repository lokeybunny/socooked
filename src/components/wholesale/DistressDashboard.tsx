/**
 * Distress Intelligence Dashboard
 * 
 * Provides visual analytics widgets for the wholesale distress pipeline:
 * - Key metrics cards (total leads, hot leads, pre-foreclosure, etc.)
 * - Leads by county chart
 * - Leads by source breakdown
 * - Skip trace funnel
 * - Score distribution
 */
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Flame, AlertTriangle, MapPin, Phone, TrendingUp, Building2, TreePine, Users, Loader2 } from 'lucide-react';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6'];

export default function DistressDashboard() {
  const [sellers, setSellers] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [sellersRes, buyersRes] = await Promise.all([
      supabase.from('lw_sellers').select('id, motivation_score, status, county, state, deal_type, source, is_tax_delinquent, is_absentee_owner, is_vacant, is_pre_foreclosure, is_out_of_state, has_tax_lien, skip_traced_at, buyer_match_score, opportunity_score, created_at').limit(1000),
      supabase.from('lw_buyers').select('id, target_counties, status').limit(500),
    ]);
    setSellers(sellersRes.data || []);
    setBuyers(buyersRes.data || []);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const total = sellers.length;
    const hot = sellers.filter(s => (s.motivation_score || 0) >= 70).length;
    const warm = sellers.filter(s => (s.motivation_score || 0) >= 45 && (s.motivation_score || 0) < 70).length;
    const preForeclosure = sellers.filter(s => s.is_pre_foreclosure).length;
    const taxDelinquent = sellers.filter(s => s.is_tax_delinquent).length;
    const vacantLand = sellers.filter(s => s.deal_type === 'land' && s.is_vacant).length;
    const readyTrace = sellers.filter(s => !s.skip_traced_at && (s.motivation_score || 0) >= 45).length;
    const traced = sellers.filter(s => !!s.skip_traced_at).length;
    const buyerMatched = sellers.filter(s => (s.buyer_match_score || 0) > 0).length;
    const avgScore = total > 0 ? Math.round(sellers.reduce((sum, s) => sum + (s.motivation_score || 0), 0) / total) : 0;

    // Weekly hot leads
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const hotThisWeek = sellers.filter(s => (s.motivation_score || 0) >= 70 && new Date(s.created_at) >= weekAgo).length;

    return { total, hot, warm, preForeclosure, taxDelinquent, vacantLand, readyTrace, traced, buyerMatched, avgScore, hotThisWeek };
  }, [sellers]);

  // County breakdown (top 10)
  const countyData = useMemo(() => {
    const map: Record<string, number> = {};
    sellers.forEach(s => {
      const key = s.county ? `${s.county}, ${s.state}` : 'Unknown';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, count }));
  }, [sellers]);

  // Buyer demand overlap
  const demandOverlap = useMemo(() => {
    const buyerCounties = new Set<string>();
    buyers.forEach(b => (b.target_counties || []).forEach((c: string) => buyerCounties.add(c.toLowerCase())));
    const overlap = countyData.filter(cd => {
      const county = cd.name.split(',')[0]?.trim().toLowerCase();
      return buyerCounties.has(county);
    });
    return overlap.length;
  }, [countyData, buyers]);

  // Source breakdown
  const sourceData = useMemo(() => {
    const map: Record<string, number> = {};
    sellers.forEach(s => {
      const src = s.source || 'unknown';
      map[src] = (map[src] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [sellers]);

  // Skip trace funnel
  const traceFunnel = useMemo(() => {
    const notTraced = sellers.filter(s => !s.skip_traced_at).length;
    const traced = sellers.filter(s => !!s.skip_traced_at).length;
    const contacted = sellers.filter(s => s.status === 'contacted' || s.status === 'offer_sent' || s.status === 'under_contract' || s.status === 'closed').length;
    return [
      { stage: 'Total Leads', count: sellers.length },
      { stage: 'Skip Traced', count: traced },
      { stage: 'Contacted', count: contacted },
    ];
  }, [sellers]);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
        <p>Loading distress intelligence…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <MetricCard icon={MapPin} label="Total Leads" value={stats.total} />
        <MetricCard icon={Flame} label="Cold Leads" value={stats.hot} accent="cold" />
        <MetricCard icon={Flame} label="Hot This Week" value={stats.hotThisWeek} accent="warning" />
        <MetricCard icon={AlertTriangle} label="Pre-Foreclosure" value={stats.preForeclosure} accent="warning" />
        <MetricCard icon={TreePine} label="Vacant Land" value={stats.vacantLand} />
        <MetricCard icon={Phone} label="Ready for Trace" value={stats.readyTrace} accent="primary" />
        <MetricCard icon={Users} label="Buyer Matched" value={stats.buyerMatched} accent="primary" />
        <MetricCard icon={TrendingUp} label="Avg Score" value={stats.avgScore} />
        <MetricCard icon={Building2} label="Tax Delinquent" value={stats.taxDelinquent} accent="destructive" />
        <MetricCard icon={MapPin} label="Demand Overlap" value={`${demandOverlap}/${countyData.length}`} />
      </div>


    </div>
  );
}

function MetricCard({ icon: Icon, label, value, accent }: {
  icon: any; label: string; value: string | number; accent?: string;
}) {
  const accentClass = accent === 'destructive' ? 'text-destructive' :
    accent === 'warning' ? 'text-yellow-500' :
    accent === 'primary' ? 'text-primary' : 'text-foreground';

  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className={`text-lg font-bold leading-none ${accentClass}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
