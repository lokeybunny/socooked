import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Heart, Users, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type MatchResult = {
  buyer: any;
  seller: any;
  score: number;
  reasons: string[];
};

function computeMatchScore(buyer: any, seller: any): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const bMeta: any = buyer.meta?.interests || {};

  // 1. State match (required gate — 0 if no match)
  const buyerStates: string[] = (buyer.target_states || []).map((s: string) => s.toUpperCase());
  const sellerState = (seller.state || '').toUpperCase();
  if (buyerStates.length && sellerState && !buyerStates.includes(sellerState)) {
    return { score: 0, reasons: ['❌ State mismatch'] };
  }
  if (buyerStates.includes(sellerState)) {
    score += 15;
    reasons.push('✅ State match');
  }

  // 2. County match
  const buyerCounties = (buyer.target_counties || []).map((c: string) => c.toLowerCase());
  const sellerCounty = (seller.county || '').toLowerCase();
  if (buyerCounties.length && sellerCounty && buyerCounties.includes(sellerCounty)) {
    score += 15;
    reasons.push('✅ County match');
  }

  // 3. Price compatibility (generous — include up to 25% over buyer budget)
  const buyerMax = buyer.budget_max || Infinity;
  const sellerPrice = seller.asking_price || seller.market_value || seller.assessed_value || 0;
  if (sellerPrice > 0 && buyerMax !== Infinity) {
    const overageRatio = sellerPrice / buyerMax;
    if (overageRatio <= 1) {
      score += 20;
      reasons.push('✅ Within budget');
    } else if (overageRatio <= 1.25) {
      score += 12;
      reasons.push('⚠️ Slightly over budget (workable)');
    } else if (overageRatio <= 1.5) {
      score += 5;
      reasons.push('⚠️ Over budget — may negotiate');
    } else {
      score -= 5;
      reasons.push('🔴 Significantly over budget');
    }
  } else {
    score += 5;
  }

  // 4. Acreage match
  const bAcMin = buyer.acreage_min || 0;
  const bAcMax = buyer.acreage_max || Infinity;
  const sAcreage = seller.acreage || 0;
  if (sAcreage > 0) {
    if (sAcreage >= bAcMin && sAcreage <= bAcMax) {
      score += 10;
      reasons.push('✅ Acreage match');
    } else if (sAcreage >= bAcMin * 0.7 && sAcreage <= (bAcMax === Infinity ? Infinity : bAcMax * 1.3)) {
      score += 5;
      reasons.push('⚠️ Acreage close');
    }
  }

  // 5. Property type match
  const buyerPropTypes: string[] = bMeta.property_types || [];
  const sellerPropType = (seller.property_type || '').toLowerCase();
  if (buyerPropTypes.length > 0) {
    const typeMap: Record<string, string[]> = {
      sfr: ['sfr', 'single'],
      land: ['vac', 'land', 'vacant'],
      multi_family: ['multi', 'duplex', 'triplex', 'quad'],
      mobile_home: ['mobile', 'manufactured'],
      townhouse: ['condo', 'townhouse', 'th'],
      commercial: ['commercial', 'com', 'retail', 'office'],
      apartment: ['apt', 'apartment'],
    };
    const matched = buyerPropTypes.some(bpt => {
      const keywords = typeMap[bpt] || [bpt];
      return keywords.some(kw => sellerPropType.includes(kw));
    });
    if (matched) {
      score += 10;
      reasons.push('✅ Property type match');
    }
  }

  // 6. Motivation flag bonuses
  const motFlags: string[] = bMeta.motivation_flags || [];
  if (motFlags.includes('distressed') && seller.motivation_score >= 50) { score += 8; reasons.push('🔥 Distressed match'); }
  if (motFlags.includes('pre_foreclosure') && seller.is_pre_foreclosure) { score += 5; reasons.push('⚠️ Pre-foreclosure'); }
  if (motFlags.includes('tax_delinquent') && seller.is_tax_delinquent) { score += 5; reasons.push('💰 Tax delinquent'); }
  if (motFlags.includes('absentee_owner') && seller.is_absentee_owner) { score += 5; reasons.push('📍 Absentee owner'); }
  if (motFlags.includes('probate') && (seller.probate_flag || seller.inherited_flag)) { score += 5; reasons.push('📜 Probate/Inherited'); }
  if (motFlags.includes('vacant') && seller.is_vacant) { score += 5; reasons.push('🏚️ Vacant'); }
  if (motFlags.includes('free_clear') && seller.free_and_clear) { score += 5; reasons.push('🆓 Free & clear'); }

  // 7. Bedrooms/bathrooms
  const minBed = bMeta.min_bedrooms;
  if (minBed && minBed !== 'any' && seller.bedrooms) {
    const reqBed = parseInt(minBed);
    if (seller.bedrooms >= reqBed) { score += 3; reasons.push('✅ Bedrooms match'); }
  }

  // Clamp to 1-100
  score = Math.max(1, Math.min(100, score));
  return { score, reasons };
}

export default function BuyerSellerMatches() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMatches = async () => {
    setLoading(true);
    const [{ data: buyers }, { data: sellers }] = await Promise.all([
      supabase.from('lw_buyers').select('*').eq('status', 'active'),
      supabase.from('lw_sellers').select('*').not('status', 'eq', 'dead'),
    ]);

    if (!buyers?.length || !sellers?.length) {
      setMatches([]);
      setLoading(false);
      return;
    }

    const results: MatchResult[] = [];
    for (const buyer of buyers) {
      for (const seller of sellers) {
        const { score, reasons } = computeMatchScore(buyer, seller);
        if (score >= 15) {
          results.push({ buyer, seller, score, reasons });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    setMatches(results.slice(0, 200));
    setLoading(false);
  };

  useEffect(() => { loadMatches(); }, []);

  const scoreColor = (s: number) =>
    s >= 70 ? 'text-green-500' : s >= 45 ? 'text-yellow-500' : 'text-muted-foreground';

  const scoreBg = (s: number) =>
    s >= 70 ? 'bg-green-500/10' : s >= 45 ? 'bg-yellow-500/10' : 'bg-muted';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Heart className="h-4 w-4 text-pink-500" />
          <Users className="h-4 w-4" />
          Buyer ↔ Seller Matches
          <Badge variant="outline" className="ml-auto">{matches.length} matches</Badge>
          <Button size="sm" variant="outline" onClick={loadMatches} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matches.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No matches yet</p>
            <p className="text-xs mt-1">Add buyers with interests and seller leads to see matches</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Score</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Seller Property</TableHead>
                  <TableHead>Seller Price</TableHead>
                  <TableHead>Buyer Budget</TableHead>
                  <TableHead>Match Reasons</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m, i) => (
                  <TableRow key={`${m.buyer.id}-${m.seller.id}-${i}`}>
                    <TableCell>
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-mono text-sm font-bold ${scoreBg(m.score)} ${scoreColor(m.score)}`}>
                        {m.score}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium text-sm">{m.buyer.full_name}</span>
                        {m.buyer.entity_name && <span className="text-xs text-muted-foreground block">{m.buyer.entity_name}</span>}
                        <span className="text-xs text-muted-foreground block">{(m.buyer.target_states || []).join(', ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm font-medium">{m.seller.address_full || '—'}</span>
                        <span className="text-xs text-muted-foreground block">
                          {m.seller.city}, {m.seller.state} {m.seller.zip}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {m.seller.acreage ? `${m.seller.acreage} ac` : ''} {m.seller.property_type || ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {(m.seller.asking_price || m.seller.market_value || m.seller.assessed_value)
                        ? `$${Number(m.seller.asking_price || m.seller.market_value || m.seller.assessed_value).toLocaleString()}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.buyer.budget_max
                        ? `$${Number(m.buyer.budget_min || 0).toLocaleString()}–$${Number(m.buyer.budget_max).toLocaleString()}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[250px]">
                        {m.reasons.map((r, ri) => (
                          <span key={ri} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{r}</span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
