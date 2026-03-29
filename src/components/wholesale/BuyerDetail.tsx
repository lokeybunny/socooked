import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { User, MapPin, DollarSign, Target, Clock, Link, FileText, Handshake, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface BuyerDetailProps {
  buyer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export default function BuyerDetail({ buyer, open, onOpenChange, onUpdate }: BuyerDetailProps) {
  const [activity, setActivity] = useState<any[]>([]);
  const [matchedSellers, setMatchedSellers] = useState<any[]>([]);
  const [findingSeller, setFindingSeller] = useState(false);

  useEffect(() => {
    if (open && buyer) {
      loadActivity();
      loadSellerMatches();
    }
  }, [open, buyer]);

  const loadActivity = async () => {
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .eq('entity_type', 'lw_buyer')
      .eq('entity_id', buyer.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setActivity(data || []);
  };

  const loadSellerMatches = async () => {
    const states = buyer.target_states || [];
    const counties = buyer.target_counties || [];
    if (!states.length && !counties.length) return;

    let query = supabase.from('lw_sellers').select('*').eq('deal_type', buyer.deal_type || 'land').limit(10);
    if (states.length) query = query.in('state', states);
    const { data } = await query;

    const scored = (data || []).map((seller: any) => {
      let score = 0;
      if (states.includes(seller.state)) score += 30;
      if (counties.some((c: string) => c.toLowerCase() === (seller.county || '').toLowerCase())) score += 30;
      if (buyer.budget_max && seller.asking_price && seller.asking_price <= buyer.budget_max) score += 20;
      if (buyer.acreage_min && seller.acreage && seller.acreage >= buyer.acreage_min) score += 10;
      if (buyer.acreage_max && seller.acreage && seller.acreage <= buyer.acreage_max) score += 10;
      return { ...seller, match_score: score };
    }).filter((s: any) => s.match_score > 0).sort((a: any, b: any) => b.match_score - a.match_score);

    setMatchedSellers(scored);
  };

  const findSeller = async () => {
    setFindingSeller(true);
    try {
      const states = buyer.target_states || [];
      const counties = buyer.target_counties || [];
      const dealType = buyer.deal_type || 'land';
      const meta = buyer.meta || {};
      const interests = meta.interests || {};

      if (!states.length && !counties.length) {
        toast.error('Buyer has no target states or counties set');
        setFindingSeller(false);
        return;
      }

      // Build distress filters from buyer preferences
      const distressFilters: Record<string, any> = {};

      // Property type mapping from buyer interests
      const propTypes = interests.property_types || buyer.property_type_interest || [];
      if (propTypes.includes('sfr')) distressFilters.property_type = 'SFR';
      else if (propTypes.includes('multi_family') || dealType === 'multi_home') distressFilters.property_type = 'MFR';
      else if (propTypes.includes('land') || dealType === 'land') distressFilters.property_type = 'LAND';

      // Acreage
      if (buyer.acreage_min) distressFilters.acreage_min = buyer.acreage_min;
      if (buyer.acreage_max) distressFilters.acreage_max = buyer.acreage_max;

      // Value/budget range
      if (buyer.budget_min) distressFilters.value_min = buyer.budget_min;
      if (buyer.budget_max) distressFilters.value_max = buyer.budget_max;

      // Motivation flags from interests
      const motFlags = interests.motivation_flags || [];
      if (motFlags.includes('distressed')) distressFilters.absentee_owner = true;
      if (motFlags.includes('pre_foreclosure')) distressFilters.pre_foreclosure = true;
      if (motFlags.includes('tax_delinquent')) distressFilters.tax_delinquent_year = '2023';
      if (motFlags.includes('absentee_owner')) distressFilters.absentee_owner = true;
      if (motFlags.includes('vacant')) distressFilters.vacant = true;
      if (motFlags.includes('free_clear')) distressFilters.free_and_clear = true;

      // Building specs from interests
      const beds = interests.bedrooms;
      if (beds && beds !== 'any') distressFilters.bedrooms_min = parseInt(beds);
      const baths = interests.bathrooms;
      if (baths && baths !== 'any') distressFilters.bathrooms_min = parseInt(baths);
      if (interests.sqft_min) distressFilters.sqft_min = interests.sqft_min;
      if (interests.sqft_max) distressFilters.sqft_max = interests.sqft_max;

      // City filter
      if (buyer.city) distressFilters.city = buyer.city;

      // Search each target county
      const targetCounty = counties[0];
      const targetState = states[0];

      toast.loading(`Searching REAPI for sellers matching ${buyer.full_name}...`, { id: 'find-seller' });

      const res = await supabase.functions.invoke('land-reapi-search', {
        body: {
          county: targetCounty,
          state: targetState,
          deal_type: dealType,
          size: 50,
          distress_filters: distressFilters,
          buyer_id: buyer.id,
        },
      });

      if (res.error) throw res.error;

      const result = res.data;
      if (result.skipped) {
        toast.error(result.reason || 'Search skipped', { id: 'find-seller' });
        return;
      }

      const newCount = result.records_new || result.records || 0;
      const totalCount = result.records_fetched || result.records || 0;

      toast.success(`Found ${totalCount} properties, ${newCount} new sellers imported!`, { id: 'find-seller' });

      // Reload seller matches
      await loadSellerMatches();
      onUpdate();
    } catch (err: any) {
      toast.error('Search failed: ' + (err.message || 'Unknown error'), { id: 'find-seller' });
    } finally {
      setFindingSeller(false);
    }
  };

  if (!buyer) return null;

  const scoreColor = (buyer.buyer_score || 0) >= 70 ? 'text-green-500' :
    (buyer.buyer_score || 0) >= 40 ? 'text-yellow-500' : 'text-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {buyer.full_name}
            <Badge variant="outline" className="ml-2">{buyer.buyer_type?.replace(/_/g, ' ') || 'unknown'}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Score + Intent Summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Buyer Score</p>
                <p className={`text-2xl font-bold font-mono ${scoreColor}`}>{buyer.buyer_score || buyer.activity_score || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Confidence</p>
                <p className="text-2xl font-bold font-mono text-foreground">{buyer.confidence_score || 0}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Intent</p>
                <Badge className={`text-sm ${
                  buyer.intent_level === 'high' ? 'bg-red-500/10 text-red-500' :
                  buyer.intent_level === 'medium' ? 'bg-yellow-500/10 text-yellow-500' :
                  'bg-muted text-muted-foreground'
                }`}>{buyer.intent_level || 'low'}</Badge>
              </CardContent>
            </Card>
          </div>

          {buyer.intent_summary && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Why flagged</p>
                <p className="text-sm">{buyer.intent_summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Contact</h4>
              <div className="space-y-1 text-sm">
                {buyer.email && <p>📧 <a href={`mailto:${buyer.email}`} className="text-primary hover:underline">{buyer.email}</a></p>}
                {buyer.phone && <p>📱 <a href={`tel:${buyer.phone}`} className="text-primary hover:underline">{buyer.phone}</a></p>}
                {buyer.entity_name && <p>🏢 {buyer.entity_name}</p>}
                {buyer.city && <p>📍 {buyer.city}</p>}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Preferences</h4>
              <div className="space-y-1 text-sm">
                <p><MapPin className="h-3 w-3 inline mr-1" /> States: {(buyer.target_states || []).join(', ') || '—'}</p>
                <p><Target className="h-3 w-3 inline mr-1" /> Counties: {(buyer.target_counties || []).join(', ') || '—'}</p>
                <p><DollarSign className="h-3 w-3 inline mr-1" /> Budget: {buyer.budget_min || buyer.budget_max ? `$${(buyer.budget_min || 0).toLocaleString()}–$${(buyer.budget_max || 0).toLocaleString()}` : '—'}</p>
                <p>📐 Acreage: {buyer.acreage_min || buyer.acreage_max ? `${buyer.acreage_min || 0}–${buyer.acreage_max || '∞'} ac` : '—'}</p>
              </div>
            </div>
          </div>

          {/* Tags */}
          {(buyer.tags || []).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {buyer.tags.map((t: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Source Info */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Source</h4>
            <div className="text-sm space-y-1">
              <p>Platform: <Badge variant="outline" className="text-[10px]">{buyer.source_platform || buyer.source || 'manual'}</Badge></p>
              {buyer.source_url && (
                <p><Link className="h-3 w-3 inline mr-1" />
                  <a href={buyer.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">{buyer.source_url}</a>
                </p>
              )}
              {buyer.last_seen_signal && (
                <p><Clock className="h-3 w-3 inline mr-1" /> Last signal: {new Date(buyer.last_seen_signal).toLocaleString()}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {buyer.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Notes</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{buyer.notes}</p>
            </div>
          )}

          <Separator />

          {/* Find Seller Button */}
          <Button
            onClick={findSeller}
            disabled={findingSeller}
            className="w-full gap-2"
            variant="default"
          >
            {findingSeller ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {findingSeller ? 'Searching REAPI...' : 'Find Seller'}
          </Button>

          {/* Seller Match Suggestions */}
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
              <Handshake className="h-4 w-4" /> Seller Matches ({matchedSellers.length})
            </h4>
            {matchedSellers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No matching seller leads found. Use "Find Seller" to search REAPI.</p>
            ) : (
              <div className="space-y-2">
                {matchedSellers.slice(0, 5).map(s => (
                  <Card key={s.id}>
                    <CardContent className="p-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{s.address_full || s.county || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{s.county}, {s.state} · {s.acreage || '?'} ac · ${(s.asking_price || s.market_value || 0).toLocaleString()}</p>
                      </div>
                      <Badge className="bg-primary/10 text-primary text-xs">{s.match_score}% match</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Activity Timeline */}
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
              <FileText className="h-4 w-4" /> Activity ({activity.length})
            </h4>
            {activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity logged yet</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleDateString()}</span>
                    <Badge variant="outline" className="text-[10px]">{a.action}</Badge>
                    <span className="text-muted-foreground">{(a.meta as any)?.platform || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
