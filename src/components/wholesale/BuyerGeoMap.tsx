import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Users, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

type Buyer = {
  id: string;
  full_name: string;
  entity_name: string | null;
  buyer_type: string | null;
  target_states: string[];
  target_counties: string[];
  budget_min: number | null;
  budget_max: number | null;
  deal_type: string;
  status: string;
  pipeline_stage: string | null;
  meta: any;
};

type GeoEntry = {
  state: string;
  county: string;
  buyers: Buyer[];
  totalBudget: number;
  avgBudget: number;
  hedgeFundCount: number;
};

export default function BuyerGeoMap() {
  const [, setSearchParams] = useSearchParams();
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedState, setExpandedState] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('lw_buyers')
        .select('id, full_name, entity_name, buyer_type, target_states, target_counties, budget_min, budget_max, deal_type, status, pipeline_stage, meta')
        .in('pipeline_stage', ['active', 'warm'])
        .order('created_at', { ascending: false });
      setBuyers(data || []);
      setLoading(false);
    })();
  }, []);

  const geoData = useMemo(() => {
    const stateMap = new Map<string, Map<string, Buyer[]>>();

    buyers.forEach(b => {
      const states = b.target_states || [];
      const counties = b.target_counties || [];

      states.forEach(state => {
        if (!stateMap.has(state)) stateMap.set(state, new Map());
        const countyMap = stateMap.get(state)!;

        if (counties.length === 0) {
          if (!countyMap.has('_statewide')) countyMap.set('_statewide', []);
          countyMap.get('_statewide')!.push(b);
        } else {
          counties.forEach(county => {
            if (!countyMap.has(county)) countyMap.set(county, []);
            countyMap.get(county)!.push(b);
          });
        }
      });
    });

    // Build sorted entries per state
    const stateEntries: { state: string; totalBuyers: number; hedgeFundCount: number; avgBudget: number; counties: GeoEntry[] }[] = [];

    stateMap.forEach((countyMap, state) => {
      const counties: GeoEntry[] = [];
      let stateBuyers = new Set<string>();

      countyMap.forEach((cBuyers, county) => {
        cBuyers.forEach(b => stateBuyers.add(b.id));
        const budgets = cBuyers.map(b => b.budget_max || b.budget_min || 0).filter(v => v > 0);
        counties.push({
          state,
          county,
          buyers: cBuyers,
          totalBudget: budgets.reduce((a, b) => a + b, 0),
          avgBudget: budgets.length ? budgets.reduce((a, b) => a + b, 0) / budgets.length : 0,
          hedgeFundCount: cBuyers.filter(b => b.buyer_type === 'hedge_fund').length,
        });
      });

      counties.sort((a, b) => b.buyers.length - a.buyers.length);

      const allStateBuyers = buyers.filter(b => b.target_states?.includes(state));
      const hfCount = allStateBuyers.filter(b => b.buyer_type === 'hedge_fund').length;
      const budgets = allStateBuyers.map(b => b.budget_max || b.budget_min || 0).filter(v => v > 0);

      stateEntries.push({
        state,
        totalBuyers: stateBuyers.size,
        hedgeFundCount: hfCount,
        avgBudget: budgets.length ? budgets.reduce((a, b) => a + b, 0) / budgets.length : 0,
        counties,
      });
    });

    stateEntries.sort((a, b) => b.totalBuyers - a.totalBuyers);
    return stateEntries;
  }, [buyers]);

  const maxBuyers = geoData.length ? geoData[0].totalBuyers : 1;

  const goToBuyer = (buyerId: string) => {
    setSearchParams({ tab: 'buyers', open_id: buyerId });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">Loading buyer geo data...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Buyer Demand Geo Map
            <Badge variant="outline" className="ml-auto">{buyers.length} active buyers</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            See where active buyers want to purchase — use this to target seller acquisition in high-demand zones.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {geoData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No active buyers with target locations found.</p>
          ) : (
            geoData.map(entry => {
              const isExpanded = expandedState === entry.state;
              const barWidth = Math.max(8, (entry.totalBuyers / maxBuyers) * 100);

              return (
                <div key={entry.state} className="border border-border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setExpandedState(isExpanded ? null : entry.state)}
                  >
                    <span className="text-lg font-bold text-foreground w-10 shrink-0">{entry.state}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="h-5 rounded-full bg-primary/80 transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {entry.totalBuyers} buyer{entry.totalBuyers !== 1 ? 's' : ''}
                        </span>
                        {entry.hedgeFundCount > 0 && (
                          <span className="text-amber-500 font-semibold">🏦 {entry.hedgeFundCount} Hedge Fund{entry.hedgeFundCount !== 1 ? 's' : ''}</span>
                        )}
                        {entry.avgBudget > 0 && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Avg ${Math.round(entry.avgBudget).toLocaleString()}
                          </span>
                        )}
                        <span>{entry.counties.length} zone{entry.counties.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/30 p-3 space-y-2">
                      {entry.counties.map(geo => (
                        <div key={geo.county} className="flex items-center gap-3 p-2 rounded-md bg-background border border-border">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground">
                              {geo.county === '_statewide' ? 'Statewide (no county specified)' : geo.county}
                            </span>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span>{geo.buyers.length} buyer{geo.buyers.length !== 1 ? 's' : ''}</span>
                              {geo.avgBudget > 0 && <span>Avg ${Math.round(geo.avgBudget).toLocaleString()}</span>}
                              {geo.hedgeFundCount > 0 && <span className="text-amber-500 font-semibold">🏦 {geo.hedgeFundCount}</span>}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {geo.buyers.slice(0, 3).map(b => (
                              <span
                                key={b.id}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                  b.buyer_type === 'hedge_fund'
                                    ? 'bg-amber-500/15 text-amber-500 font-semibold'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {b.full_name.split(' ')[0]}
                              </span>
                            ))}
                            {geo.buyers.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{geo.buyers.length - 3}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}