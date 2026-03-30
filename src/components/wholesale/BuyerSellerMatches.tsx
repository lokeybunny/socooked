import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Heart, Users, RefreshCw, Phone, Mail, MapPin, Home, DollarSign, Calendar, Building2, Copy, ExternalLink, ChevronDown } from 'lucide-react';
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

/* ─── Detail helpers ─── */
const CopyBtn = ({ text }: { text: string }) => (
  <button
    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); toast.success('Copied'); }}
    className="ml-1 inline-flex text-muted-foreground hover:text-foreground"
  >
    <Copy className="h-3 w-3" />
  </button>
);

const Row = ({ icon: Icon, label, value, copyable }: { icon?: any; label: string; value: any; copyable?: boolean }) => {
  if (value == null || value === '' || value === 'N/A') return null;
  const display = String(value);
  return (
    <div className="flex items-start gap-2 text-sm py-1">
      {Icon && <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />}
      <span className="text-muted-foreground shrink-0 min-w-[100px]">{label}</span>
      <span className="font-medium break-all">{display}</span>
      {copyable && <CopyBtn text={display} />}
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1 pt-3">{title}</h4>
    {children}
  </div>
);

/* ─── Buyer Detail Popup ─── */
function BuyerDetailPopup({ buyer, open, onClose, onNavigate }: { buyer: any; open: boolean; onClose: () => void; onNavigate: (type: 'buyers' | 'sellers', id: string) => void }) {
  if (!buyer) return null;
  const meta: any = buyer.meta || {};
  const interests: any = meta.interests || {};
  const allPhones: string[] = meta.all_phones || [];
  const allEmails: string[] = meta.all_emails || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {buyer.full_name}
          </DialogTitle>
        </DialogHeader>

        <Section title="Contact">
          <Row icon={Phone} label="Phone" value={buyer.phone} copyable />
          {allPhones.filter((p: string) => p !== buyer.phone).map((p: string, i: number) => (
            <Row key={i} icon={Phone} label={`Phone ${i + 2}`} value={p} copyable />
          ))}
          <Row icon={Mail} label="Email" value={buyer.email} copyable />
          {allEmails.filter((e: string) => e !== buyer.email).map((e: string, i: number) => (
            <Row key={i} icon={Mail} label={`Email ${i + 2}`} value={e} copyable />
          ))}
          <Row icon={Building2} label="Entity" value={buyer.entity_name} />
          <Row icon={MapPin} label="City" value={buyer.city} />
        </Section>

        <Section title="Pipeline & Status">
          <Row label="Status" value={buyer.status} />
          <Row label="Pipeline Stage" value={buyer.pipeline_stage} />
          <Row label="Intent Level" value={buyer.intent_level} />
          <Row label="Buyer Type" value={buyer.buyer_type} />
          <Row label="Deal Type" value={buyer.deal_type} />
          <Row label="Source" value={buyer.source} />
          {buyer.source_url && <Row label="Source URL" value={buyer.source_url} />}
        </Section>

        <Section title="Buying Criteria">
          <Row icon={MapPin} label="Target States" value={(buyer.target_states || []).join(', ')} />
          <Row icon={MapPin} label="Target Counties" value={(buyer.target_counties || []).join(', ')} />
          <Row icon={DollarSign} label="Budget" value={buyer.budget_max ? `$${Number(buyer.budget_min || 0).toLocaleString()} – $${Number(buyer.budget_max).toLocaleString()}` : null} />
          <Row label="Acreage" value={buyer.acreage_min != null || buyer.acreage_max != null ? `${buyer.acreage_min ?? 0} – ${buyer.acreage_max ?? '∞'} ac` : null} />
          <Row label="Prop Types" value={(interests.property_types || buyer.property_type_interest || []).join(', ')} />
          <Row label="Zoning" value={(buyer.target_zoning || []).join(', ')} />
          {interests.min_bedrooms && <Row label="Min Beds" value={interests.min_bedrooms} />}
          {interests.motivation_flags?.length > 0 && <Row label="Motivation Flags" value={interests.motivation_flags.join(', ')} />}
        </Section>

        <Section title="Scores & Activity">
          <Row label="Buyer Score" value={buyer.buyer_score} />
          <Row label="Activity Score" value={buyer.activity_score} />
          <Row label="Confidence" value={buyer.confidence_score} />
          <Row label="Purchase Count" value={buyer.purchase_count} />
          <Row label="Last Purchase" value={buyer.last_purchase_date ? new Date(buyer.last_purchase_date).toLocaleDateString() : null} />
          <Row label="Last Signal" value={buyer.last_seen_signal ? new Date(buyer.last_seen_signal).toLocaleDateString() : null} />
        </Section>

        {(buyer.intent_summary || buyer.notes) && (
          <Section title="Notes">
            {buyer.intent_summary && <p className="text-sm text-muted-foreground">{buyer.intent_summary}</p>}
            {buyer.notes && <p className="text-sm">{buyer.notes}</p>}
          </Section>
        )}

        <Section title="Dates">
          <Row icon={Calendar} label="Created" value={new Date(buyer.created_at).toLocaleDateString()} />
          <Row icon={Calendar} label="Updated" value={new Date(buyer.updated_at).toLocaleDateString()} />
        </Section>

        <div className="pt-3 border-t">
          <Button className="w-full" onClick={() => { onClose(); onNavigate('buyers', buyer.id); }}>
            <Users className="h-4 w-4 mr-2" />
            Go to Buyer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Seller Detail Popup ─── */
function SellerDetailPopup({ seller, open, onClose, onNavigate }: { seller: any; open: boolean; onClose: () => void; onNavigate: (type: 'buyers' | 'sellers', id: string) => void }) {
  if (!seller) return null;
  const meta: any = seller.meta || {};
  const allPhones: string[] = meta.all_phones || [];
  const allEmails: string[] = meta.all_emails || [];

  const distressFlags: string[] = [];
  if (seller.is_tax_delinquent) distressFlags.push('Tax Delinquent');
  if (seller.is_pre_foreclosure) distressFlags.push('Pre-Foreclosure');
  if (seller.is_vacant) distressFlags.push('Vacant');
  if (seller.is_absentee_owner) distressFlags.push('Absentee Owner');
  if (seller.probate_flag) distressFlags.push('Probate');
  if (seller.inherited_flag) distressFlags.push('Inherited');
  if (seller.free_and_clear) distressFlags.push('Free & Clear');
  if (seller.has_tax_lien) distressFlags.push('Tax Lien');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            {seller.address_full || seller.owner_name || 'Seller Lead'}
          </DialogTitle>
        </DialogHeader>

        <Section title="Owner Contact">
          <Row label="Owner Name" value={seller.owner_name} copyable />
          <Row icon={Phone} label="Phone" value={seller.owner_phone} copyable />
          {allPhones.filter((p: string) => p !== seller.owner_phone).map((p: string, i: number) => (
            <Row key={i} icon={Phone} label={`Phone ${i + 2}`} value={p} copyable />
          ))}
          <Row icon={Mail} label="Email" value={seller.owner_email} copyable />
          {allEmails.filter((e: string) => e !== seller.owner_email).map((e: string, i: number) => (
            <Row key={i} icon={Mail} label={`Email ${i + 2}`} value={e} copyable />
          ))}
          <Row icon={MapPin} label="Mailing Address" value={seller.owner_mailing_address} copyable />
          <Row label="Owner Occupied" value={seller.owner_occupied != null ? (seller.owner_occupied ? 'Yes' : 'No') : null} />
        </Section>

        <Section title="Property Details">
          <Row icon={MapPin} label="Address" value={seller.address_full} copyable />
          <Row label="City / State / ZIP" value={[seller.city, seller.state, seller.zip].filter(Boolean).join(', ')} />
          <Row label="County" value={seller.county} />
          <Row label="APN" value={seller.apn} copyable />
          <Row label="Type" value={seller.property_type} />
          <Row label="Acreage" value={seller.acreage != null ? `${seller.acreage} ac` : null} />
          <Row label="Lot SqFt" value={seller.lot_sqft != null ? Number(seller.lot_sqft).toLocaleString() : null} />
          <Row label="Living SqFt" value={seller.living_sqft != null ? Number(seller.living_sqft).toLocaleString() : null} />
          <Row label="Beds" value={seller.bedrooms} />
          <Row label="Baths" value={seller.bathrooms} />
          <Row label="Zoning" value={seller.zoning} />
        </Section>

        <Section title="Financials">
          <Row icon={DollarSign} label="Asking Price" value={seller.asking_price != null ? `$${Number(seller.asking_price).toLocaleString()}` : null} />
          <Row label="Assessed Value" value={seller.assessed_value != null ? `$${Number(seller.assessed_value).toLocaleString()}` : null} />
          <Row label="Market Value" value={seller.market_value != null ? `$${Number(seller.market_value).toLocaleString()}` : null} />
          <Row label="Estimated Offer" value={seller.estimated_offer != null ? `$${Number(seller.estimated_offer).toLocaleString()}` : null} />
          <Row label="Equity" value={seller.equity_percent != null ? `${seller.equity_percent}%` : null} />
        </Section>

        <Section title="Distress & Scoring">
          <Row label="Motivation Score" value={seller.motivation_score} />
          <Row label="Opportunity Score" value={seller.opportunity_score} />
          <Row label="Distress Grade" value={seller.distress_grade} />
          <Row label="Lead Temp" value={seller.lead_temperature} />
          {distressFlags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {distressFlags.map((f) => (
                <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
              ))}
            </div>
          )}
        </Section>

        <Section title="Status & Pipeline">
          <Row label="Status" value={seller.status} />
          <Row label="Deal Type" value={seller.deal_type} />
          <Row label="Source" value={seller.source} />
          <Row label="Skip Trace" value={seller.skip_trace_status} />
          <Row label="Contacted" value={seller.contacted_at ? new Date(seller.contacted_at).toLocaleDateString() : null} />
        </Section>

        {(seller.notes || seller.condition_notes) && (
          <Section title="Notes">
            {seller.condition_notes && <p className="text-sm text-muted-foreground">{seller.condition_notes}</p>}
            {seller.notes && <p className="text-sm">{seller.notes}</p>}
          </Section>
        )}

        <Section title="Free Lookup Shortcuts">
          <div className="grid grid-cols-3 gap-2 pt-1">
            {seller.owner_name && (
              <a
                href={`https://www.truepeoplesearch.com/results?name=${encodeURIComponent(seller.owner_name)}&citystatezip=${encodeURIComponent([seller.city, seller.state].filter(Boolean).join(', '))}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs bg-muted hover:bg-accent rounded px-2 py-1.5"
              >
                <ExternalLink className="h-3 w-3" /> TruePeopleSearch
              </a>
            )}
            {seller.owner_phone && (
              <a
                href={`https://www.dataleads.com/reverse-phone/${seller.owner_phone.replace(/\D/g, '')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs bg-muted hover:bg-accent rounded px-2 py-1.5"
              >
                <ExternalLink className="h-3 w-3" /> DataToLeads
              </a>
            )}
            {seller.address_full && (
              <a
                href={`https://app.propstream.com/`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs bg-muted hover:bg-accent rounded px-2 py-1.5"
                onClick={() => { navigator.clipboard.writeText(seller.address_full); toast.success('Address copied for PropStream'); }}
              >
                <ExternalLink className="h-3 w-3" /> PropStream
              </a>
            )}
          </div>
        </Section>

        <Section title="Dates">
          <Row icon={Calendar} label="Created" value={new Date(seller.created_at).toLocaleDateString()} />
          <Row icon={Calendar} label="Updated" value={new Date(seller.updated_at).toLocaleDateString()} />
        </Section>

        <div className="pt-3 border-t">
          <Button className="w-full" onClick={() => { onClose(); onNavigate('sellers', seller.id); }}>
            <MapPin className="h-4 w-4 mr-2" />
            Go to Seller
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BuyerGroup = {
  buyer: any;
  sellers: { seller: any; score: number; reasons: string[] }[];
  topScore: number;
};

export default function BuyerSellerMatches() {
  const [, setSearchParams] = useSearchParams();
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set());
  const [detailBuyer, setDetailBuyer] = useState<any>(null);
  const [detailSeller, setDetailSeller] = useState<any>(null);

  const handleNavigate = (type: 'buyers' | 'sellers', id: string) => {
    setSearchParams({ tab: type, open_id: id }, { replace: true });
  };

  const toggleBuyer = (id: string) => {
    setExpandedBuyers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedBuyers(new Set(grouped.map(g => g.buyer.id)));
  };
  const collapseAll = () => setExpandedBuyers(new Set());

  const loadMatches = async () => {
    setLoading(true);
    setExpandedBuyers(new Set());
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
      const hasStates = (buyer.target_states || []).length > 0;
      const hasBudget = buyer.budget_min != null || buyer.budget_max != null;
      const hasPropTypes = (((buyer.meta as any)?.interests?.property_types) || buyer.property_type_interest || []).length > 0;
      if (!hasStates || !hasBudget || !hasPropTypes) continue;
      for (const seller of sellers) {
        const { score, reasons } = computeMatchScore(buyer, seller);
        if (score >= 15) results.push({ buyer, seller, score, reasons });
      }
    }

    results.sort((a, b) => b.score - a.score);
    setMatches(results.slice(0, 500));
    setLoading(false);
  };

  useEffect(() => { loadMatches(); }, []);

  // Group matches by buyer
  const grouped: BuyerGroup[] = useMemo(() => {
    const map = new Map<string, BuyerGroup>();
    for (const m of matches) {
      const id = m.buyer.id;
      if (!map.has(id)) {
        map.set(id, { buyer: m.buyer, sellers: [], topScore: 0 });
      }
      const g = map.get(id)!;
      g.sellers.push({ seller: m.seller, score: m.score, reasons: m.reasons });
      if (m.score > g.topScore) g.topScore = m.score;
    }
    return Array.from(map.values()).sort((a, b) => b.topScore - a.topScore);
  }, [matches]);

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
          <Badge variant="outline" className="ml-auto">{matches.length} matches · {grouped.length} buyers</Badge>
          <Button size="sm" variant="ghost" onClick={expandAll} className="text-xs">Expand All</Button>
          <Button size="sm" variant="ghost" onClick={collapseAll} className="text-xs">Collapse All</Button>
          <Button size="sm" variant="outline" onClick={loadMatches} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {grouped.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No matches yet</p>
            <p className="text-xs mt-1">Add buyers with interests and seller leads to see matches</p>
          </div>
        ) : (
          <div className="space-y-2">
            {grouped.map((g) => {
              const isOpen = expandedBuyers.has(g.buyer.id);
              return (
                <div key={g.buyer.id} className="border rounded-lg overflow-hidden">
                  {/* Buyer header row — always visible */}
                  <button
                    onClick={() => toggleBuyer(g.buyer.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-mono text-xs font-bold ${scoreBg(g.topScore)} ${scoreColor(g.topScore)}`}>
                      {g.topScore}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-primary">{g.buyer.full_name}</span>
                      {g.buyer.entity_name && <span className="text-xs text-muted-foreground ml-2">{g.buyer.entity_name}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{(g.buyer.target_states || []).join(', ')}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{g.sellers.length} match{g.sellers.length !== 1 ? 'es' : ''}</Badge>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailBuyer(g.buyer); }}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      View Buyer
                    </button>
                  </button>

                  {/* Seller rows — collapsible */}
                  {isOpen && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Score</TableHead>
                            <TableHead>Seller Property</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Buyer Budget</TableHead>
                            <TableHead>Match Reasons</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.sellers.sort((a, b) => b.score - a.score).slice(0, 25).map((s, si) => (
                            <TableRow key={`${s.seller.id}-${si}`}>
                              <TableCell>
                                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-mono text-xs font-bold ${scoreBg(s.score)} ${scoreColor(s.score)}`}>
                                  {s.score}
                                </span>
                              </TableCell>
                              <TableCell>
                                <button
                                  onClick={() => setDetailSeller(s.seller)}
                                  className="text-left hover:underline decoration-primary underline-offset-2"
                                >
                                  <span className="text-sm font-medium text-primary">{s.seller.address_full || '—'}</span>
                                  <span className="text-xs text-muted-foreground block">
                                    {s.seller.city}, {s.seller.state} {s.seller.zip}
                                  </span>
                                  <span className="text-xs text-muted-foreground block">
                                    {s.seller.acreage ? `${s.seller.acreage} ac` : ''} {s.seller.property_type || ''}
                                  </span>
                                </button>
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {(s.seller.asking_price || s.seller.market_value || s.seller.assessed_value)
                                  ? `$${Number(s.seller.asking_price || s.seller.market_value || s.seller.assessed_value).toLocaleString()}`
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {g.buyer.budget_max
                                  ? `$${Number(g.buyer.budget_min || 0).toLocaleString()}–$${Number(g.buyer.budget_max).toLocaleString()}`
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-[250px]">
                                  {s.reasons.map((r, ri) => (
                                    <span key={ri} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{r}</span>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {g.sellers.length > 25 && (
                        <p className="text-xs text-muted-foreground text-center py-2">Showing top 25 of {g.sellers.length} matches</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <BuyerDetailPopup buyer={detailBuyer} open={!!detailBuyer} onClose={() => setDetailBuyer(null)} onNavigate={handleNavigate} />
      <SellerDetailPopup seller={detailSeller} open={!!detailSeller} onClose={() => setDetailSeller(null)} onNavigate={handleNavigate} />
    </Card>
  );
}
