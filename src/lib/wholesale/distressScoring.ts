/**
 * Distress Property Intelligence — Scoring Engine
 * 
 * Calculates a 0–100 distress score for each seller/property record
 * using configurable weighted factors. Also determines:
 * - Motivation grade (A/B/C/D)
 * - Lead temperature (Hot/Warm/Cold)
 * - Top distress reasons for display
 * 
 * Default weights are designed for land wholesaling but are
 * admin-editable via the lw_buyer_config table (key: 'distress_weights').
 */

import { CRAIGSLIST_CITIES, type CityEntry } from '@/lib/craigslistCities';

/**
 * Extract the Craigslist subdomain from a URL.
 * e.g. "https://sfbay.craigslist.org/rew/d/..." → "sfbay"
 */
export function extractCraigslistSubdomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/https?:\/\/([a-z0-9-]+)\.craigslist\.org/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Look up the CityEntry for a given Craigslist subdomain.
 */
export function getCraigslistCity(subdomain: string): CityEntry | undefined {
  return CRAIGSLIST_CITIES.find(c => c.subdomain === subdomain);
}

const CRAIGSLIST_METRO_COORDINATES: Partial<Record<string, { lat: number; lng: number }>> = {
  bakersfield: { lat: 35.3733, lng: -119.0187 },
  chico: { lat: 39.7285, lng: -121.8375 },
  fresno: { lat: 36.7378, lng: -119.7871 },
  inlandempire: { lat: 34.1083, lng: -117.2898 },
  lasvegas: { lat: 36.1699, lng: -115.1398 },
  losangeles: { lat: 34.0522, lng: -118.2437 },
  modesto: { lat: 37.6391, lng: -120.9969 },
  monterey: { lat: 36.6002, lng: -121.8947 },
  orangecounty: { lat: 33.7175, lng: -117.8311 },
  phoenix: { lat: 33.4484, lng: -112.074 },
  redding: { lat: 40.5865, lng: -122.3917 },
  reno: { lat: 39.5296, lng: -119.8138 },
  sacramento: { lat: 38.5816, lng: -121.4944 },
  sandiego: { lat: 32.7157, lng: -117.1611 },
  santabarbara: { lat: 34.4208, lng: -119.6982 },
  sfbay: { lat: 37.7749, lng: -122.4194 },
  slo: { lat: 35.2828, lng: -120.6596 },
  stockton: { lat: 37.9577, lng: -121.2908 },
  tucson: { lat: 32.2226, lng: -110.9747 },
  ventura: { lat: 34.2746, lng: -119.229 },
  visalia: { lat: 36.3302, lng: -119.2921 },
};

const CRAIGSLIST_RADIUS_MILES = 50;
const BUYER_LOCATION_RADIUS_MILES = 30;

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateMilesBetweenCoordinates(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeLocationText(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/\b(county|parish|metro|metropolitan|area|region|city)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function locationTextMatches(metroLabel: string, candidate: string | null | undefined): boolean {
  const metro = normalizeLocationText(metroLabel);
  const value = normalizeLocationText(candidate);

  if (!metro || !value) return false;
  if (metro === value) return true;
  if (metro.includes(value) || value.includes(metro)) return true;

  const metroTokens = new Set(metro.split(' ').filter(token => token.length > 2));
  const valueTokens = value.split(' ').filter(token => token.length > 2);
  const overlapCount = valueTokens.filter(token => metroTokens.has(token)).length;

  return overlapCount >= Math.min(2, valueTokens.length);
}

function hasSellerLocationContext(seller: any): boolean {
  return Boolean(
    seller?.city ||
    seller?.county ||
    seller?.state ||
    toFiniteNumber(seller?.latitude) !== null ||
    toFiniteNumber(seller?.longitude) !== null
  );
}

/**
 * Strict locality gate for matched buyers.
 * Buyers must align to the seller's property city/state area, using a 30 mile radius
 * when both sides can be anchored to Craigslist metro coordinates.
 */
export function isBuyerNearSellerLocation(
  seller: any,
  buyer: any,
  radiusMiles: number = BUYER_LOCATION_RADIUS_MILES
): boolean {
  if (!hasSellerLocationContext(seller)) return true;

  const sellerState = (seller.state || '').toUpperCase().trim();
  const sellerLat = toFiniteNumber(seller.latitude);
  const sellerLng = toFiniteNumber(seller.longitude);

  const buyerSubdomain = extractCraigslistSubdomain(buyer.source_url);
  const buyerCraigslistCity = buyerSubdomain ? getCraigslistCity(buyerSubdomain) : null;
  const buyerMetroCenter = buyerSubdomain ? CRAIGSLIST_METRO_COORDINATES[buyerSubdomain] : null;

  if (buyerCraigslistCity) {
    if (sellerState && buyerCraigslistCity.state.toUpperCase() !== sellerState) return false;

    if (sellerLat !== null && sellerLng !== null && buyerMetroCenter) {
      return calculateMilesBetweenCoordinates(
        sellerLat,
        sellerLng,
        buyerMetroCenter.lat,
        buyerMetroCenter.lng
      ) <= radiusMiles;
    }

    return (
      locationTextMatches(buyerCraigslistCity.label, seller.city) ||
      locationTextMatches(buyerCraigslistCity.label, seller.county)
    );
  }

  const buyerStates = (buyer.target_states || [])
    .map((state: string) => state.toUpperCase().trim())
    .filter(Boolean);

  if (buyerStates.length > 0 && sellerState && !buyerStates.includes(sellerState)) {
    return false;
  }

  if (locationTextMatches(seller.city, buyer.city) || locationTextMatches(seller.county, buyer.city)) {
    return true;
  }

  const buyerCounties: string[] = buyer.target_counties || [];
  return buyerCounties.some((county: string) => (
    locationTextMatches(seller.county, county) ||
    locationTextMatches(seller.city, county)
  ));
}

/**
 * Validate that the seller property location actually aligns with the Craigslist metro.
 * This acts as a strict location gate before any buyer matching is shown.
 */
export function isSellerInCraigslistRegion(
  sellerSubdomain: string,
  seller: any
): boolean {
  const clCity = getCraigslistCity(sellerSubdomain);
  if (!clCity) return false;

  const sellerState = (seller.state || '').toUpperCase().trim();
  if (sellerState && sellerState !== clCity.state.toUpperCase()) return false;

  const metroCenter = CRAIGSLIST_METRO_COORDINATES[sellerSubdomain];
  const sellerLatitude = toFiniteNumber(seller.latitude);
  const sellerLongitude = toFiniteNumber(seller.longitude);

  if (metroCenter && sellerLatitude !== null && sellerLongitude !== null) {
    return calculateMilesBetweenCoordinates(
      sellerLatitude,
      sellerLongitude,
      metroCenter.lat,
      metroCenter.lng
    ) <= CRAIGSLIST_RADIUS_MILES;
  }

  return (
    locationTextMatches(clCity.label, seller.city) ||
    locationTextMatches(clCity.label, seller.county)
  );
}

/**
 * Check if a buyer is in the same Craigslist metro as a seller.
 * Compares by subdomain extracted from buyer.source_url, or by city/state match
 * from the CL city lookup against buyer.city / buyer.target_states.
 */
export function isBuyerInCraigslistRegion(
  sellerSubdomain: string,
  buyer: any
): boolean {
  // Direct subdomain match on buyer's source_url
  const buyerSubdomain = extractCraigslistSubdomain(buyer.source_url);
  if (buyerSubdomain === sellerSubdomain) return true;

  // City/county-level match only — never match by state alone
  const clCity = getCraigslistCity(sellerSubdomain);
  if (clCity) {
    if (locationTextMatches(clCity.label, buyer.city)) return true;

    const buyerCounties: string[] = buyer.target_counties || [];
    if (buyerCounties.some((county: string) => locationTextMatches(clCity.label, county))) return true;
  }

  return false;
}

export interface DistressWeights {
  absentee_owner: number;
  vacant_flag: number;
  tax_delinquent: number;
  high_equity: number;       // equity_percent >= 40
  free_and_clear: number;
  pre_foreclosure: number;
  auction_status: number;
  out_of_state_owner: number;
  years_owned_10plus: number;
  lien_count_2plus: number;
  probate_flag: number;
  vacant_land: number;
  corporate_owned: number;
  trust_owned: number;
  inherited_flag: number;
  tax_lien: number;
  county_buyer_match: number;
}

export const DEFAULT_DISTRESS_WEIGHTS: DistressWeights = {
  absentee_owner: 10,
  vacant_flag: 15,
  tax_delinquent: 20,
  high_equity: 15,
  free_and_clear: 10,
  pre_foreclosure: 25,
  auction_status: 20,
  out_of_state_owner: 8,
  years_owned_10plus: 10,
  lien_count_2plus: 10,
  probate_flag: 15,
  vacant_land: 10,
  corporate_owned: 5,
  trust_owned: 5,
  inherited_flag: 12,
  tax_lien: 8,
  county_buyer_match: 12,
};

export interface DistressScoreResult {
  score: number;            // 0–100 (capped)
  rawScore: number;         // uncapped sum
  grade: 'A' | 'B' | 'C' | 'D';
  temperature: 'Hot' | 'Warm' | 'Cold';
  reasons: string[];        // top contributing factors
  breakdown: { factor: string; points: number; active: boolean }[];
}

export function calculateDistressScore(
  seller: any,
  weights: DistressWeights = DEFAULT_DISTRESS_WEIGHTS,
  buyerCounties: string[] = []
): DistressScoreResult {
  const breakdown: { factor: string; points: number; active: boolean }[] = [];

  const check = (key: keyof DistressWeights, label: string, active: boolean) => {
    breakdown.push({ factor: label, points: weights[key], active });
  };

  check('absentee_owner', 'Absentee Owner', !!seller.is_absentee_owner);
  check('vacant_flag', 'Vacant Property', !!seller.is_vacant);
  check('tax_delinquent', 'Tax Delinquent', !!seller.is_tax_delinquent);
  check('high_equity', 'High Equity (≥40%)', (seller.equity_percent ?? 0) >= 40);
  check('free_and_clear', 'Free & Clear', !!seller.free_and_clear);
  check('pre_foreclosure', 'Pre-Foreclosure', !!seller.is_pre_foreclosure);
  check('auction_status', 'Auction', seller.auction_status === 'active' || seller.auction_status === 'scheduled');
  check('out_of_state_owner', 'Out-of-State Owner', !!seller.is_out_of_state);
  check('years_owned_10plus', 'Long Ownership (10+ yrs)', (seller.years_owned ?? 0) >= 10);
  check('lien_count_2plus', 'Multiple Liens (2+)', (seller.lien_count ?? 0) >= 2);
  check('probate_flag', 'Probate/Estate', !!seller.probate_flag);
  check('vacant_land', 'Vacant Land', seller.property_type === 'VAC' || seller.deal_type === 'land');
  check('corporate_owned', 'Corporate Owned', !!seller.is_corporate_owned);
  check('trust_owned', 'Trust Owned', !!seller.trust_owned);
  check('inherited_flag', 'Inherited Property', !!seller.inherited_flag);
  check('tax_lien', 'Tax Lien', !!seller.has_tax_lien);

  // Buyer county match
  const countyMatch = buyerCounties.length > 0 &&
    buyerCounties.some(c => c.toLowerCase() === (seller.county || '').toLowerCase());
  check('county_buyer_match', 'County Matches Buyer Demand', countyMatch);

  const rawScore = breakdown
    .filter(b => b.active)
    .reduce((sum, b) => sum + b.points, 0);

  const score = Math.min(100, rawScore);

  const reasons = breakdown
    .filter(b => b.active)
    .sort((a, b) => b.points - a.points)
    .map(b => b.factor);

  // Grade: A=70+, B=45-69, C=20-44, D=<20
  const grade: 'A' | 'B' | 'C' | 'D' =
    score >= 70 ? 'A' :
    score >= 45 ? 'B' :
    score >= 20 ? 'C' : 'D';

  // Temperature
  const temperature: 'Hot' | 'Warm' | 'Cold' =
    score >= 70 ? 'Hot' :
    score >= 45 ? 'Warm' : 'Cold';

  return { score, rawScore, grade, temperature, reasons, breakdown };
}

/**
 * Calculate buyer match score for a seller against a specific buyer.
 * Returns 0–100.
 */
export function calculateBuyerMatchScore(seller: any, buyer: any): number {
  if (hasSellerLocationContext(seller) && !isBuyerNearSellerLocation(seller, buyer)) {
    return 0;
  }

  let score = 0;
  const maxScore = 100;

  // State match: +25
  const buyerStates = buyer.target_states || [];
  if (buyerStates.length > 0 && buyerStates.includes(seller.state)) score += 25;

  // County match: +30
  const buyerCounties = buyer.target_counties || [];
  if (buyerCounties.length > 0 &&
    buyerCounties.some((c: string) => c.toLowerCase() === (seller.county || '').toLowerCase())) {
    score += 30;
  }

  // Craigslist region match: +15 bonus
  // If seller came from a CL link, buyers from the same CL metro get a boost
  const sellerClSub = extractCraigslistSubdomain(seller.meta?.source_url || seller.meta?.craigslist_url);
  if (sellerClSub && isSellerInCraigslistRegion(sellerClSub, seller)) {
    if (isBuyerInCraigslistRegion(sellerClSub, buyer)) score += 15;
  }

  // Budget compatibility: +20
  if (seller.market_value || seller.asking_price) {
    const price = seller.asking_price || seller.market_value;
    const inBudget = (!buyer.budget_min || price >= buyer.budget_min) &&
                     (!buyer.budget_max || price <= buyer.budget_max);
    if (inBudget) score += 20;
  }

  // Acreage compatibility: +15
  if (seller.acreage) {
    const inRange = (!buyer.acreage_min || seller.acreage >= buyer.acreage_min) &&
                    (!buyer.acreage_max || seller.acreage <= buyer.acreage_max);
    if (inRange) score += 15;
  }

  // Deal type compatibility: +10
  if (buyer.deal_type === seller.deal_type || buyer.deal_type === 'both') score += 10;

  return Math.min(maxScore, score);
}

/**
 * Calculate opportunity score as weighted combination.
 * opportunity_score = 0.5 * distress_score + 0.5 * buyer_match_score
 */
export function calculateOpportunityScore(distressScore: number, buyerMatchScore: number): number {
  return Math.round(distressScore * 0.5 + buyerMatchScore * 0.5);
}

/**
 * Smart view preset definitions for quick filtering.
 */
export interface SmartViewPreset {
  key: string;
  label: string;
  emoji: string;
  filters: Record<string, any>;
  description: string;
}

export const SMART_VIEW_PRESETS: SmartViewPreset[] = [
  {
    key: 'hot_distress',
    label: 'Hot Distress',
    emoji: '🔥',
    filters: { minMotivation: 70 },
    description: 'Distress score ≥ 70',
  },
  {
    key: 'vacant_land_distress',
    label: 'Vacant Land',
    emoji: '🏞️',
    filters: { dealType: 'land', isVacant: true, isAbsentee: true },
    description: 'Vacant + Absentee land',
  },
  {
    key: 'pre_foreclosure',
    label: 'Pre-Foreclosure',
    emoji: '⚠️',
    filters: { isPreForeclosure: true },
    description: 'Pre-foreclosure properties',
  },
  {
    key: 'tax_delinquent_absentee',
    label: 'Tax Del. + Absentee',
    emoji: '💰',
    filters: { isTaxDelinquent: true, isAbsentee: true },
    description: 'Tax delinquent + absentee',
  },
  {
    key: 'buyer_matched',
    label: 'Buyer Matched',
    emoji: '🤝',
    filters: { minBuyerMatch: 30 },
    description: 'Has matching buyer',
  },
  {
    key: 'ready_skip_trace',
    label: 'Ready for Trace',
    emoji: '📞',
    filters: { skipTraceStatus: 'not_ready', minMotivation: 45 },
    description: 'Warm+ leads not yet traced',
  },
  {
    key: 'new_imports',
    label: 'New Imports',
    emoji: '📥',
    filters: { stage: 'new' },
    description: 'New unreviewed records',
  },
  {
    key: 'long_held_absentee',
    label: 'Long-Held Absentee',
    emoji: '⏳',
    filters: { isAbsentee: true, minYearsOwned: 10, isOutOfState: true },
    description: '10+ yrs owned, OOS, absentee',
  },
];
