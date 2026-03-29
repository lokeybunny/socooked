/**
 * Score Explanation Panel
 * 
 * Visual breakdown of a seller's distress score, buyer match score,
 * and opportunity score. Shows which factors contributed and their weights.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { calculateDistressScore, calculateBuyerMatchScore, calculateOpportunityScore, DEFAULT_DISTRESS_WEIGHTS, extractCraigslistSubdomain, isBuyerInCraigslistRegion, getCraigslistCity, type DistressWeights } from '@/lib/wholesale/distressScoring';
import { Flame, Snowflake, Sun, Target, TrendingUp, CheckCircle, XCircle, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import BuyerDetail from './BuyerDetail';

const BUYERS_PER_PAGE = 5;

interface ScoreExplanationProps {
  seller: any;
  buyers?: any[];
  weights?: DistressWeights;
  buyerDemandCounties?: string[];
}

export default function ScoreExplanation({ seller, buyers = [], weights, buyerDemandCounties = [] }: ScoreExplanationProps) {
  const w = weights || DEFAULT_DISTRESS_WEIGHTS;
  const result = useMemo(() => calculateDistressScore(seller, w, buyerDemandCounties), [seller, w, buyerDemandCounties]);

  /**
   * Craigslist-aware buyer filtering:
   * If the seller's source is linked to a Craigslist URL (via meta.source_url or address pattern),
   * only show buyers from the same Craigslist metro region.
   */
  const sellerClSubdomain = useMemo(() => {
    // Check seller meta for source_url or the source field
    const sourceUrl = seller.meta?.source_url || seller.meta?.craigslist_url || null;
    return extractCraigslistSubdomain(sourceUrl);
  }, [seller]);

  const clCity = useMemo(() => sellerClSubdomain ? getCraigslistCity(sellerClSubdomain) : null, [sellerClSubdomain]);

  const buyerMatches = useMemo(() => {
    let pool = buyers;

    // If seller is from Craigslist, filter buyers to same region
    if (sellerClSubdomain) {
      const regionBuyers = pool.filter(b => isBuyerInCraigslistRegion(sellerClSubdomain, b));
      // Only apply filter if it yields results; otherwise fall back to all
      if (regionBuyers.length > 0) pool = regionBuyers;
    }

    return pool
      .map(b => ({ ...b, matchScore: calculateBuyerMatchScore(seller, b) }))
      .filter(b => b.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);
  }, [seller, buyers, sellerClSubdomain]);

  const bestBuyerMatch = buyerMatches.length > 0 ? buyerMatches[0].matchScore : 0;
  const opportunityScore = calculateOpportunityScore(result.score, bestBuyerMatch);

  const [buyerPage, setBuyerPage] = useState(0);
  const totalPages = Math.ceil(buyerMatches.length / BUYERS_PER_PAGE);
  const pagedBuyers = buyerMatches.slice(buyerPage * BUYERS_PER_PAGE, (buyerPage + 1) * BUYERS_PER_PAGE);

  const [selectedBuyer, setSelectedBuyer] = useState<any>(null);

  const TempIcon = result.temperature === 'Hot' ? Flame :
    result.temperature === 'Warm' ? Sun : Snowflake;

  const tempColor = result.temperature === 'Hot' ? 'text-destructive' :
    result.temperature === 'Warm' ? 'text-yellow-500' : 'text-blue-400';

  const gradeColor = result.grade === 'A' ? 'bg-green-500' :
    result.grade === 'B' ? 'bg-yellow-500' :
    result.grade === 'C' ? 'bg-orange-500' : 'bg-muted';

  return (
    <div className="space-y-4">
      {/* Score Overview */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold">{result.score}</div>
          <div className="text-[10px] text-muted-foreground">Distress Score</div>
        </div>
        <div className={`h-8 w-8 rounded-full ${gradeColor} flex items-center justify-center text-white font-bold text-sm`}>
          {result.grade}
        </div>
        <div className="flex items-center gap-1.5">
          <TempIcon className={`h-5 w-5 ${tempColor}`} />
          <span className={`text-sm font-semibold ${tempColor}`}>{result.temperature}</span>
        </div>
        <div className="ml-auto text-center">
          <div className="text-2xl font-bold text-primary">{opportunityScore}</div>
          <div className="text-[10px] text-muted-foreground">Opportunity</div>
        </div>
      </div>

      <Progress value={result.score} className="h-2" />

      {/* Score Breakdown */}
      <div>
        <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Score Breakdown</h5>
        <div className="space-y-1">
          {result.breakdown.map(item => (
            <div key={item.factor} className={`flex items-center justify-between py-1 px-2 rounded text-xs ${item.active ? 'bg-primary/5' : 'opacity-40'}`}>
              <div className="flex items-center gap-2">
                {item.active ? (
                  <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className={item.active ? 'font-medium' : ''}>{item.factor}</span>
              </div>
              <Badge variant={item.active ? 'default' : 'outline'} className="text-[10px] px-1.5">
                +{item.points}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Top Reasons */}
      {result.reasons.length > 0 && (
        <>
          <Separator />
          <div>
            <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Top Distress Reasons</h5>
            <div className="flex flex-wrap gap-1">
              {result.reasons.slice(0, 6).map(reason => (
                <Badge key={reason} variant="destructive" className="text-[10px]">{reason}</Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Buyer Matches */}
      {buyerMatches.length > 0 && (
        <>
          <Separator />
          <div>
            <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              Matched Buyers ({buyerMatches.length})
            </h5>
            <div className="space-y-2">
              {pagedBuyers.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBuyer(b)}
                  className="w-full flex items-center justify-between py-1.5 px-2 rounded border text-xs hover:bg-accent transition-colors cursor-pointer text-left"
                >
                  <div>
                    <span className="font-medium text-primary">{b.full_name}</span>
                    <span className="text-muted-foreground ml-2">
                      {(b.target_counties || []).slice(0, 2).join(', ')}
                      {b.budget_max ? ` · ≤$${Number(b.budget_max).toLocaleString()}` : ''}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                    {b.matchScore}
                  </Badge>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] text-muted-foreground">
                  Page {buyerPage + 1} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" disabled={buyerPage === 0} onClick={() => setBuyerPage(p => p - 1)}>
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" disabled={buyerPage >= totalPages - 1} onClick={() => setBuyerPage(p => p + 1)}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Buyer Detail Modal */}
      <BuyerDetail
        buyer={selectedBuyer}
        open={!!selectedBuyer}
        onOpenChange={(open) => { if (!open) setSelectedBuyer(null); }}
        onUpdate={() => {}}
      />
    </div>
  );
}