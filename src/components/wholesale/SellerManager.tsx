import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Search, MapPin, Download, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Info, TreePine, Home, ExternalLink, Copy, ClipboardPaste, ChevronDown, ChevronUp, Phone, ArrowRight, Pencil, Save, FileSpreadsheet, Flame, Snowflake, Sun, Target } from 'lucide-react';
import { toast } from 'sonner';
import DistressFilters, { EMPTY_DISTRESS_FILTERS, type DistressFilterState } from './DistressFilters';
import CsvImport from './CsvImport';
import ScoreExplanation from './ScoreExplanation';
import { calculateDistressScore, DEFAULT_DISTRESS_WEIGHTS } from '@/lib/wholesale/distressScoring';
import type { SmartViewPreset } from '@/lib/wholesale/distressScoring';

const PAGE_SIZE = 25;

const SELLER_STAGES = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'req_trace', label: 'Req. Trace' },
  { key: 'skip_traced', label: 'Skip Traced' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'offer_sent', label: 'Offer Sent' },
  { key: 'under_contract', label: 'Under Contract' },
  { key: 'closed', label: 'Closed' },
  { key: 'dead', label: 'Dead' },
];

const SELLER_STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-500',
  req_trace: 'bg-red-500/10 text-red-500',
  skip_traced: 'bg-cyan-500/10 text-cyan-500',
  contacted: 'bg-purple-500/10 text-purple-500',
  offer_sent: 'bg-amber-500/10 text-amber-500',
  under_contract: 'bg-emerald-500/10 text-emerald-500',
  closed: 'bg-muted text-muted-foreground',
  dead: 'bg-destructive/10 text-destructive',
};

// --- Clipboard copy helper ---
function CopyText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <button
      className="inline-flex items-center gap-1 hover:text-primary transition-colors group"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
      }}
      title="Copy to clipboard"
    >
      <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
    </button>
  );
}

// --- Business/junk name detection ---
const BUSINESS_KEYWORDS = /\b(llc|inc|corp|ltd|lp|trust|estate|holdings|properties|investments|ventures|realty|enterprise|company|co\b|group|associates|partners|management|capital|development|construction|services|solutions|fund|foundation|church|ministry|bank|credit union|revocable|irrevocable|living trust|family trust|land co|homeowners|hoa|auto|motors|electric|plumbing|roofing|landscaping|cleaning|consulting|logistics|supply|warehouse|dental|medical|legal|law|accounting|insurance|wholesale|retail)\b/i;
const BUSINESS_PATTERNS = /^(the\s+)?\d|&|,\s*(llc|inc)|^\w+\s+(of|and)\s+\w+$/i;
// Exhaustive junk word list — UI labels, locations, categories from TruePeopleSearch / DataToLeads
const JUNK_NAME_WORDS = /\b(age|phone|address|county|records|court|evictions|lookups|data|bankruptcies|square|feet|year|built|estimated|value|equity|sale|amount|date|property|class|residential|subdivision|lot|background|profile|frequently|asked|questions|disclaimers|information|people|francisco|skip|trace|sell|notice|important|includes|primary|reverse|public|current|possible|nationwide|connections|since|where|wireless|network|tandem|heights|hills|vegas|angeles|springs|beach|creek|valley|lake|city|north|south|east|west|san|los|las|york|chicago|miami|dallas|houston|phoenix|portland|seattle|denver|austin|tampa|orlando|atlanta|boston|detroit|mesa|chino|rowland|hacienda|neutral|peerless|verizon|sprint|mobile|cellular|landline|voip|carrier|lookup|search|results|view|details|report|summary|related|associated|known|also|numbers|addresses|emails|relatives|neighbors|history|recent|previous|full|more|show|hide|see|best|click|here|free|premium|sign|log|register|account|welcome|home|about|contact|privacy|policy|terms|conditions|copyright|rights|reserved|powered)\b/i;

function isHumanName(name: string): boolean {
  if (!name || name.length < 4) return false;
  if (BUSINESS_KEYWORDS.test(name)) return false;
  if (BUSINESS_PATTERNS.test(name)) return false;
  // Test each word individually against junk list
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  // Any single junk word disqualifies
  if (parts.some(p => JUNK_NAME_WORDS.test(p))) return false;
  if (parts.some(p => p.length > 3 && p === p.toUpperCase())) return false;
  if (parts.some(p => !/^[A-Za-z'-]+$/.test(p))) return false;
  // Single-char parts are only OK as middle initials
  if (parts[0].length < 2 || parts[parts.length - 1].length < 2) return false;
  return true;
}

// Pick the most likely real name: the one whose first or last name appears most often
function pickBestName(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];

  // Count how often each individual word appears across all names
  const wordCounts: Record<string, number> = {};
  names.forEach(n => {
    const parts = n.toLowerCase().split(/\s+/);
    parts.forEach(w => { wordCounts[w] = (wordCounts[w] || 0) + 1; });
  });

  // Score each name by the sum of its word frequencies
  let best = names[0];
  let bestScore = 0;
  names.forEach(n => {
    const parts = n.toLowerCase().split(/\s+/);
    const score = parts.reduce((sum, w) => sum + (wordCounts[w] || 0), 0);
    // Prefer longer names (first + middle + last > first + last) at equal score
    if (score > bestScore || (score === bestScore && n.split(/\s+/).length > best.split(/\s+/).length)) {
      best = n;
      bestScore = score;
    }
  });

  return best;
}

// --- Parse pasted skip trace data ---
function parseSkipTraceData(raw: string): { phones: string[]; emails: string[]; names: string[]; bestName: string | null } {
  const phones: string[] = [];
  const emails: string[] = [];
  const candidateNames: string[] = [];

  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const inlineNameRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;

  const phoneMatches = raw.match(phoneRegex);
  if (phoneMatches) {
    phoneMatches.forEach(p => {
      const cleaned = p.replace(/[^\d+]/g, '');
      if (!phones.includes(cleaned) && cleaned.length >= 10) phones.push(cleaned);
    });
  }

  const emailMatches = raw.match(emailRegex);
  if (emailMatches) {
    emailMatches.forEach(e => {
      if (!emails.includes(e.toLowerCase())) emails.push(e.toLowerCase());
    });
  }

  raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => {
      const matches = [...line.matchAll(inlineNameRegex)];
      matches.forEach(match => {
        const name = match[1].trim();
        if (isHumanName(name) && !candidateNames.includes(name)) candidateNames.push(name);
      });
    });

  const bestName = pickBestName(candidateNames);
  return { phones, emails, names: candidateNames, bestName };
}

export default function SellerManager() {
  const [sellers, setSellers] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [dealTypeFilter, setDealTypeFilter] = useState('all');
  const [sortField, setSortField] = useState('motivation_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [distressFilters, setDistressFilters] = useState<DistressFilterState>(EMPTY_DISTRESS_FILTERS);
  const [csvOpen, setCsvOpen] = useState(false);

  // Fetch form
  const [fetchCounty, setFetchCounty] = useState('');
  const [fetchState, setFetchState] = useState('');
  const [fetchDealType, setFetchDealType] = useState('both');
  const [fetchSize, setFetchSize] = useState('50');
  const [detailSeller, setDetailSeller] = useState<any>(null);

  // Distress search mode
  const [distressMode, setDistressMode] = useState(false);
  const [fetchCity, setFetchCity] = useState('');
  const [fetchZip, setFetchZip] = useState('');
  const [fetchDistress, setFetchDistress] = useState({
    absentee_owner: false,
    vacant: false,
    vacant_land: false,
    tax_delinquent_year: '',
    liens: false,
    high_equity_percent: '',
    free_and_clear: false,
    pre_foreclosure: false,
    foreclosure: false,
    auction: false,
    out_of_state: false,
    years_owned_min: '',
    property_type: '',
    acreage_min: '',
    acreage_max: '',
    value_min: '',
    value_max: '',
  });

  const DISTRESS_PRESETS = [
    { label: '💰 Tax Del. Absentee', apply: { absentee_owner: true, tax_delinquent_year: String(new Date().getFullYear() - 1) } },
    { label: '🏚️ Vacant Distress', apply: { vacant: true, absentee_owner: true } },
    { label: '🏞️ Vacant Land Distress', apply: { vacant_land: true, absentee_owner: true } },
    { label: '⚠️ Pre-Foreclosure', apply: { pre_foreclosure: true } },
    { label: '⏳ Long-Term OOS', apply: { out_of_state: true, years_owned_min: '10', absentee_owner: true } },
    { label: '🤝 Buyer-Matched', apply: { absentee_owner: true, vacant: true } },
  ];

  const applyDistressPreset = (preset: typeof DISTRESS_PRESETS[0]) => {
    setDistressMode(true);
    setFetchDistress(prev => ({ ...prev, ...Object.fromEntries(
      Object.entries(preset.apply).map(([k, v]) => [k, v])
    ) }));
    toast.success(`Preset applied: ${preset.label}`);
  };

  const clearDistressSearch = () => {
    setFetchDistress({
      absentee_owner: false, vacant: false, vacant_land: false, tax_delinquent_year: '',
      liens: false, high_equity_percent: '', free_and_clear: false, pre_foreclosure: false,
      foreclosure: false, auction: false, out_of_state: false, years_owned_min: '',
      property_type: '', acreage_min: '', acreage_max: '', value_min: '', value_max: '',
    });
  };

  useEffect(() => { loadSellers(); loadBuyers(); }, []);

  const loadBuyers = async () => {
    const { data } = await supabase.from('lw_buyers').select('*').eq('status', 'active').limit(200);
    setBuyers(data || []);
  };

  const loadSellers = async () => {
    setLoading(true);
    const { data } = await supabase.from('lw_sellers').select('*').order('created_at', { ascending: false }).limit(1000);
    setSellers(data || []);
    setLoading(false);
  };

  const fetchProperties = async () => {
    if (!fetchCounty.trim() || !fetchState.trim()) {
      toast.error('County and State are required');
      return;
    }
    setFetching(true);
    try {
      const types = fetchDealType === 'both' ? ['land', 'home'] : [fetchDealType];
      let totalFetched = 0;
      let totalNew = 0;

      // Build distress_filters payload
      const df: Record<string, any> = {};
      if (distressMode) {
        if (fetchDistress.absentee_owner) df.absentee_owner = true;
        if (fetchDistress.vacant) df.vacant = true;
        if (fetchDistress.vacant_land) df.vacant_land = true;
        if (fetchDistress.tax_delinquent_year) df.tax_delinquent_year = fetchDistress.tax_delinquent_year;
        if (fetchDistress.liens) df.liens = true;
        if (fetchDistress.high_equity_percent) df.high_equity_percent = Number(fetchDistress.high_equity_percent);
        if (fetchDistress.free_and_clear) df.free_and_clear = true;
        if (fetchDistress.pre_foreclosure) df.pre_foreclosure = true;
        if (fetchDistress.foreclosure) df.foreclosure = true;
        if (fetchDistress.auction) df.auction = true;
        if (fetchDistress.out_of_state) df.out_of_state = true;
        if (fetchDistress.years_owned_min) df.years_owned_min = Number(fetchDistress.years_owned_min);
        if (fetchDistress.property_type) df.property_type = fetchDistress.property_type;
        if (fetchDistress.acreage_min) df.acreage_min = Number(fetchDistress.acreage_min);
        if (fetchDistress.acreage_max) df.acreage_max = Number(fetchDistress.acreage_max);
        if (fetchDistress.value_min) df.value_min = Number(fetchDistress.value_min);
        if (fetchDistress.value_max) df.value_max = Number(fetchDistress.value_max);
        if (fetchCity.trim()) df.city = fetchCity.trim();
        if (fetchZip.trim()) df.zip = fetchZip.trim();
      }

      for (const dt of types) {
        const { data, error } = await supabase.functions.invoke('land-reapi-search', {
          body: {
            county: fetchCounty.trim(),
            state: fetchState.trim().toUpperCase(),
            deal_type: dt,
            size: Number(fetchSize) || 50,
            ...(distressMode ? { distress_filters: df } : {}),
          },
        });
        if (error) throw error;
        totalFetched += data?.records_fetched || 0;
        totalNew += data?.records_new || 0;
      }
      toast.success(`Fetched ${totalFetched} properties, ${totalNew} new`);
      await loadSellers();
    } catch (err: any) {
      toast.error(err.message || 'Fetch failed');
    }
    setFetching(false);
  };

  const availableStates = useMemo(() => {
    const states = new Set<string>();
    sellers.forEach(s => { if (s.state) states.add(s.state); });
    return Array.from(states).sort();
  }, [sellers]);

  // Pipeline stage counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sellers.length };
    sellers.forEach(s => {
      const stage = s.status || 'new';
      counts[stage] = (counts[stage] || 0) + 1;
    });
    return counts;
  }, [sellers]);

  const filtered = useMemo(() => {
    let list = [...sellers];
    if (stateFilter !== 'all') list = list.filter(s => s.state === stateFilter);
    if (stageFilter !== 'all') list = list.filter(s => s.status === stageFilter);
    if (dealTypeFilter !== 'all') list = list.filter(s => (s.deal_type || 'land') === dealTypeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.owner_name || '').toLowerCase().includes(q) ||
        (s.address_full || '').toLowerCase().includes(q) ||
        (s.county || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q) ||
        (s.apn || '').toLowerCase().includes(q)
      );
    }
    // Advanced distress filters
    const df = distressFilters;
    if (df.isAbsentee) list = list.filter(s => s.is_absentee_owner);
    if (df.isOutOfState) list = list.filter(s => s.is_out_of_state);
    if (df.isCorporate) list = list.filter(s => s.is_corporate_owned);
    if (df.isTrustOwned) list = list.filter(s => s.trust_owned);
    if (df.isTaxDelinquent) list = list.filter(s => s.is_tax_delinquent);
    if (df.hasTaxLien) list = list.filter(s => s.has_tax_lien);
    if (df.isFreeAndClear) list = list.filter(s => s.free_and_clear);
    if (df.isPreForeclosure) list = list.filter(s => s.is_pre_foreclosure);
    if (df.isProbate) list = list.filter(s => s.probate_flag);
    if (df.isInherited) list = list.filter(s => s.inherited_flag);
    if (df.isVacant) list = list.filter(s => s.is_vacant);
    if (df.minYearsOwned != null) list = list.filter(s => (s.years_owned || 0) >= df.minYearsOwned!);
    if (df.maxYearsOwned != null) list = list.filter(s => (s.years_owned || 0) <= df.maxYearsOwned!);
    if (df.minEquity != null) list = list.filter(s => (s.equity_percent || 0) >= df.minEquity!);
    if (df.minLienCount != null) list = list.filter(s => (s.lien_count || 0) >= df.minLienCount!);
    if (df.minAcreage != null) list = list.filter(s => (s.acreage || 0) >= df.minAcreage!);
    if (df.maxAcreage != null) list = list.filter(s => (s.acreage || 0) <= df.maxAcreage!);
    if (df.minMotivation != null) list = list.filter(s => (s.motivation_score || 0) >= df.minMotivation!);
    if (df.minBuyerMatch != null) list = list.filter(s => (s.buyer_match_score || 0) >= df.minBuyerMatch!);
    if (df.minOpportunity != null) list = list.filter(s => (s.opportunity_score || 0) >= df.minOpportunity!);
    if (df.leadTemperature) {
      list = list.filter(s => {
        const score = s.motivation_score || 0;
        if (df.leadTemperature === 'Hot') return score >= 70;
        if (df.leadTemperature === 'Warm') return score >= 45 && score < 70;
        return score < 45;
      });
    }
    if (df.skipTraceStatus) list = list.filter(s => (s.skip_trace_status || 'not_ready') === df.skipTraceStatus);
    if (df.stage) list = list.filter(s => s.status === df.stage);
    if (df.dealType) list = list.filter(s => (s.deal_type || 'land') === df.dealType);
    if (df.auctionStatus && df.auctionStatus !== 'none') list = list.filter(s => s.auction_status === df.auctionStatus);
    else if (df.auctionStatus === 'none') list = list.filter(s => !s.auction_status);

    list.sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [sellers, stateFilter, stageFilter, dealTypeFilter, search, sortField, sortAsc, distressFilters]);

  useEffect(() => { setPage(1); }, [stateFilter, stageFilter, dealTypeFilter, search, sortField, sortAsc, distressFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const handlePreset = (preset: SmartViewPreset) => {
    const f = { ...EMPTY_DISTRESS_FILTERS };
    const pf = preset.filters;
    if (pf.minMotivation) f.minMotivation = pf.minMotivation;
    if (pf.isVacant) f.isVacant = true;
    if (pf.isAbsentee) f.isAbsentee = true;
    if (pf.isPreForeclosure) f.isPreForeclosure = true;
    if (pf.isTaxDelinquent) f.isTaxDelinquent = true;
    if (pf.minBuyerMatch) f.minBuyerMatch = pf.minBuyerMatch;
    if (pf.skipTraceStatus) f.skipTraceStatus = pf.skipTraceStatus;
    if (pf.stage) f.stage = pf.stage;
    if (pf.isOutOfState) f.isOutOfState = true;
    if (pf.minYearsOwned) f.minYearsOwned = pf.minYearsOwned;
    if (pf.dealType) setDealTypeFilter(pf.dealType);
    setDistressFilters(f);
    setStageFilter('all');
    toast.success(`Applied: ${preset.label}`);
  };

  return (
    <div className="space-y-4">
      {/* Pipeline Stage Bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {SELLER_STAGES.map(s => (
          <Button
            key={s.key}
            size="sm"
            variant={stageFilter === s.key ? 'default' : 'outline'}
            className={`text-xs whitespace-nowrap ${s.key === 'req_trace' && stageFilter !== s.key ? 'border-red-500/50 text-red-500' : ''}`}
            onClick={() => setStageFilter(s.key)}
          >
            {s.label}
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
              {stageCounts[s.key] || 0}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Fetch Properties Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-4 w-4" />
            Fetch Seller Leads
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant={distressMode ? 'default' : 'outline'}
                className="text-xs gap-1.5 h-7"
                onClick={() => setDistressMode(!distressMode)}
              >
                <Target className="h-3 w-3" />
                {distressMode ? 'Distress Search ON' : 'Distress Search'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Distress Presets */}
          {distressMode && (
            <div className="flex flex-wrap gap-1.5">
              {DISTRESS_PRESETS.map((p, i) => (
                <Button key={i} size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => applyDistressPreset(p)}>
                  {p.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground" onClick={clearDistressSearch}>
                <X className="h-3 w-3" /> Clear
              </Button>
            </div>
          )}

          {/* Base location fields */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">County *</Label>
              <Input placeholder="e.g. Maricopa" value={fetchCounty} onChange={e => setFetchCounty(e.target.value)} className="w-[160px] h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">State *</Label>
              <Input placeholder="e.g. AZ" value={fetchState} onChange={e => setFetchState(e.target.value)} className="w-[80px] h-9" />
            </div>
            {distressMode && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">City</Label>
                  <Input placeholder="e.g. Phoenix" value={fetchCity} onChange={e => setFetchCity(e.target.value)} className="w-[130px] h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ZIP</Label>
                  <Input placeholder="e.g. 85001" value={fetchZip} onChange={e => setFetchZip(e.target.value)} className="w-[90px] h-9" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Deal Type</Label>
              <Select value={fetchDealType} onValueChange={setFetchDealType}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">🔄 Both</SelectItem>
                  <SelectItem value="land">🏞️ Land</SelectItem>
                  <SelectItem value="home">🏠 Homes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Results</Label>
              <Input type="number" value={fetchSize} onChange={e => setFetchSize(e.target.value)} className="w-[80px] h-9" />
            </div>
            <Button onClick={fetchProperties} disabled={fetching} className="h-9">
              {fetching ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Fetching…</> : <><Download className="h-3.5 w-3.5 mr-1" /> Fetch Properties</>}
            </Button>
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => setCsvOpen(true)}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Distress Intelligence Filters */}
      <DistressFilters filters={distressFilters} onChange={setDistressFilters} onPreset={handlePreset} />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search sellers…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            {availableStates.length > 0 && (
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-[100px] h-9"><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {availableStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={dealTypeFilter} onValueChange={setDealTypeFilter}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Deal Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="land"><span className="flex items-center gap-1.5"><TreePine className="h-3.5 w-3.5" /> Land</span></SelectItem>
                <SelectItem value="home"><span className="flex items-center gap-1.5"><Home className="h-3.5 w-3.5" /> Homes</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sellers Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Seller Leads
            <Badge variant="outline" className="ml-auto">{filtered.length} sellers</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
              <p>Loading sellers…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No seller leads yet</p>
              <p className="text-xs mt-1">Use the form above to fetch properties from REAPI</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">Type</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('owner_name')}>
                      Owner {sortField === 'owner_name' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('acreage')}>
                      Acres {sortField === 'acreage' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead>Bed/Bath</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('living_sqft')}>
                      Sqft {sortField === 'living_sqft' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('motivation_score')}>
                      Motivation {sortField === 'motivation_score' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('market_value')}>
                      Market Value {sortField === 'market_value' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="text-center">
                        {(s.deal_type || 'land') === 'land'
                          ? <TreePine className="h-4 w-4 text-emerald-500 mx-auto" />
                          : <Home className="h-4 w-4 text-blue-500 mx-auto" />
                        }
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{s.owner_name || '—'}</span>
                          {s.owner_phone && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              {s.owner_phone}
                              <CopyText text={s.owner_phone} />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{s.address_full || '—'}</TableCell>
                      <TableCell className="text-sm">{s.county || '—'}</TableCell>
                      <TableCell className="text-sm">{s.state || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{s.acreage ? Number(s.acreage).toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {s.bedrooms || s.bathrooms ? `${s.bedrooms ?? '—'}/${s.bathrooms ?? '—'}` : '—'}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{s.living_sqft ? Number(s.living_sqft).toLocaleString() : '—'}</TableCell>
                      <TableCell>
                        <span className={`font-mono text-sm font-semibold ${
                          (s.motivation_score || 0) >= 60 ? 'text-green-500' :
                          (s.motivation_score || 0) >= 30 ? 'text-yellow-500' : 'text-muted-foreground'
                        }`}>{s.motivation_score || 0}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.market_value ? `$${Number(s.market_value).toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {s.is_tax_delinquent && <Badge variant="destructive" className="text-[9px] px-1">Tax Del.</Badge>}
                          {s.is_absentee_owner && <Badge variant="outline" className="text-[9px] px-1">Absentee</Badge>}
                          {s.is_vacant && <Badge variant="outline" className="text-[9px] px-1">Vacant</Badge>}
                          {s.is_out_of_state && <Badge variant="outline" className="text-[9px] px-1">OOS</Badge>}
                          {s.is_pre_foreclosure && <Badge variant="destructive" className="text-[9px] px-1">Pre-FC</Badge>}
                          {s.has_tax_lien && <Badge variant="outline" className="text-[9px] px-1">Lien</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.status === 'req_trace' ? (
                          <Badge variant="destructive" className="text-[10px]">Req. Trace</Badge>
                        ) : (
                          <Badge variant="outline" className={`text-[10px] ${SELLER_STAGE_COLORS[s.status] || ''}`}>{s.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailSeller(s)}>
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button key={p} size="sm" variant={p === page ? 'default' : 'outline'} className="h-8 w-8 p-0 text-xs" onClick={() => setPage(p)}>
                        {p}
                      </Button>
                    )
                  )}
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seller Detail Modal */}
      <Dialog open={!!detailSeller} onOpenChange={(open) => !open && setDetailSeller(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {detailSeller?.owner_name || 'Unknown Owner'}
            </DialogTitle>
          </DialogHeader>
          {detailSeller && (
            <div className="space-y-4">
              {/* Score Explanation Panel */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Distress Intelligence
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScoreExplanation seller={detailSeller} buyers={buyers} />
                </CardContent>
              </Card>
              <Separator />
              <SellerDetailContent seller={detailSeller} onSkipTraced={() => { setDetailSeller(null); loadSellers(); }} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CSV Import */}
      <CsvImport open={csvOpen} onOpenChange={setCsvOpen} onImported={loadSellers} dealType={dealTypeFilter !== 'all' ? dealTypeFilter : 'land'} />
    </div>
  );
}

// --- Copyable detail row for addresses ---
function DetailRow({ label, value, copyable, gold }: { label: string; value: React.ReactNode; copyable?: boolean; gold?: boolean }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  const textValue = typeof value === 'string' ? value : null;
  return (
    <div className={`flex justify-between py-1.5 text-sm group ${gold ? 'bg-yellow-500/10 px-2 -mx-2 rounded' : ''}`}>
      <span className={gold ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-muted-foreground'}>{label}</span>
      <span className={`font-medium text-right max-w-[60%] break-words flex items-center gap-1 ${gold ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>
        {value}
        {copyable && textValue && <CopyText text={textValue} />}
      </span>
    </div>
  );
}

// --- Phone row with "more" expand for multiple numbers ---
function PhoneRow({ seller }: { seller: any }) {
  const [expanded, setExpanded] = useState(false);

  // Collect all phones: from meta.all_phones, meta.clipboard_trace.phones, and owner_phone
  const allPhones = useMemo(() => {
    const phones = new Set<string>();
    if (seller.owner_phone) phones.add(seller.owner_phone);
    const metaPhones = seller.meta?.all_phones as string[] | undefined;
    if (Array.isArray(metaPhones)) metaPhones.forEach((p: string) => phones.add(p));
    const clipPhones = seller.meta?.clipboard_trace?.phones as string[] | undefined;
    if (Array.isArray(clipPhones)) clipPhones.forEach((p: string) => phones.add(p));
    return Array.from(phones);
  }, [seller]);

  if (allPhones.length === 0) return null;

  const primary = allPhones[0];
  const extras = allPhones.slice(1);

  const copyAll = () => {
    navigator.clipboard.writeText(allPhones.join('\n'));
    toast.success(`Copied ${allPhones.length} phone number(s)`);
  };

  const isTraced = !!seller.skip_traced_at;

  return (
    <div className={`py-1.5 text-sm ${isTraced ? 'bg-yellow-500/10 px-2 -mx-2 rounded' : ''}`}>
      <div className="flex justify-between items-center group">
        <span className={isTraced ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-muted-foreground'}>Phone</span>
        <span className="font-medium flex items-center gap-1">
          <a href={`tel:${primary}`} className={`hover:underline ${isTraced ? 'text-yellow-600 dark:text-yellow-400' : 'text-primary'}`}>{primary}</a>
          <CopyText text={primary} />
          {extras.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              +{extras.length} more
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
          {allPhones.length > 1 && (
            <button
              onClick={copyAll}
              className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              title="Copy all phone numbers"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      {expanded && extras.length > 0 && (
        <div className="mt-1 ml-auto space-y-1 max-w-[60%]">
          {extras.map((phone, i) => (
            <div key={i} className="flex items-center gap-1 justify-end text-xs">
              <Phone className="h-3 w-3 text-yellow-500" />
              <a href={`tel:${phone}`} className="text-yellow-600 dark:text-yellow-400 hover:underline">{phone}</a>
              <CopyText text={phone} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PIPELINE_ORDER = ['new', 'req_trace', 'skip_traced', 'contacted', 'offer_sent', 'under_contract', 'closed', 'dead'];

function SellerDetailContent({ seller: s, onSkipTraced }: { seller: any; onSkipTraced?: () => void }) {
  const [tracing, setTracing] = useState(false);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [parsing, setParsing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(s.owner_name || '');
  const [editPhone, setEditPhone] = useState(s.owner_phone || '');
  const [editEmail, setEditEmail] = useState(s.owner_email || '');
  const [editMailing, setEditMailing] = useState(s.owner_mailing_address || '');
  const [editNotes, setEditNotes] = useState(s.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSkipTrace = async () => {
    setTracing(true);
    try {
      const { data, error } = await supabase.functions.invoke('land-reapi-skip-trace-single', {
        body: { seller_id: s.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.phone) {
        toast.success(`Found phone: ${data.phone}${data.email ? `, email: ${data.email}` : ''}`);
      } else {
        // No phone data returned — mark as req_trace
        await supabase.from('lw_sellers').update({ status: 'req_trace' }).eq('id', s.id);
        toast.error('No phone data found — marked as "Req. Trace". Try a free lookup tool instead.', { duration: 5000 });
      }
      onSkipTraced?.();
    } catch (err: any) {
      toast.error(err.message || 'Skip trace failed');
    }
    setTracing(false);
  };
  const handleAdvancePipeline = async () => {
    const idx = PIPELINE_ORDER.indexOf(s.status);
    if (idx < 0 || idx >= PIPELINE_ORDER.length - 1) return;
    const nextStatus = PIPELINE_ORDER[idx + 1];
    await supabase.from('lw_sellers').update({ status: nextStatus }).eq('id', s.id);
    toast.success(`Moved to "${SELLER_STAGES.find(st => st.key === nextStatus)?.label || nextStatus}"`);
    onSkipTraced?.();
  };

  const handleSaveEdits = async () => {
    setSaving(true);
    try {
      await supabase.from('lw_sellers').update({
        owner_name: editName || null,
        owner_phone: editPhone || null,
        owner_email: editEmail || null,
        owner_mailing_address: editMailing || null,
        notes: editNotes || null,
      }).eq('id', s.id);
      toast.success('Saved');
      setEditing(false);
      onSkipTraced?.();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleClipboardSubmit = async () => {
    if (!pasteData.trim()) {
      toast.error('Please paste some data first');
      return;
    }
    setParsing(true);
    try {
      const parsed = parseSkipTraceData(pasteData);

      if (parsed.phones.length === 0 && parsed.emails.length === 0) {
        toast.error('No phone numbers or emails found in pasted data', { duration: 5000 });
        setParsing(false);
        return;
      }

      // Sanitise: only store short validated name strings, never raw blobs
      const cleanNames = parsed.names.filter(n => n.length < 60 && isHumanName(n));
      const safeBestName = parsed.bestName && parsed.bestName.length < 60 && isHumanName(parsed.bestName)
        ? parsed.bestName
        : pickBestName(cleanNames);

      const updateData: any = {
        skip_traced_at: new Date().toISOString(),
        status: parsed.phones.length > 0 ? 'skip_traced' : s.status,
        meta: {
          ...s.meta,
          clipboard_trace: {
            phones: parsed.phones,
            emails: parsed.emails,
            names: cleanNames,
            bestName: safeBestName,
            traced_at: new Date().toISOString(),
          },
        },
      };

      if (parsed.phones.length > 0) updateData.owner_phone = parsed.phones[0];
      if (parsed.emails.length > 0) updateData.owner_email = parsed.emails[0];
      // Always update owner_name if we found a valid human name from clipboard
      if (safeBestName) {
        updateData.owner_name = safeBestName;
      }

      await supabase.from('lw_sellers').update(updateData).eq('id', s.id);

      toast.success(
        `Found ${parsed.phones.length} phone(s), ${parsed.emails.length} email(s)${parsed.names.length ? `, ${parsed.names.length} name(s)` : ''}`,
        { duration: 4000 }
      );
      setClipboardOpen(false);
      setPasteData('');
      onSkipTraced?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to process pasted data');
    }
    setParsing(false);
  };

  const flags = [
    s.is_tax_delinquent && 'Tax Delinquent',
    s.is_absentee_owner && 'Absentee Owner',
    s.is_vacant && 'Vacant',
    s.is_out_of_state && 'Out of State',
    s.is_pre_foreclosure && 'Pre-Foreclosure',
    s.has_tax_lien && 'Tax Lien',
    s.is_corporate_owned && 'Corporate Owned',
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Top action bar — Pipeline advance + Trace Clipboard + Edit */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setClipboardOpen(true)}>
          <ClipboardPaste className="h-3.5 w-3.5" />
          Trace Clipboard
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(!editing)}>
          <Pencil className="h-3.5 w-3.5" />
          {editing ? 'Cancel Edit' : 'Edit'}
        </Button>
        {editing && (
          <Button size="sm" className="gap-1.5" onClick={handleSaveEdits} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        )}
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleAdvancePipeline}
            disabled={PIPELINE_ORDER.indexOf(s.status) >= PIPELINE_ORDER.length - 1}
          >
            Next Stage
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Owner Info */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Owner Information</h4>
        {editing ? (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phone</label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Mailing Address</label>
              <Input value={editMailing} onChange={e => setEditMailing(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        ) : (() => {
          const isTraced = !!s.skip_traced_at;
          const traceResult = s.meta?.skip_trace_result;
          const rawTracedName = traceResult?.name || traceResult?.fullName
            || (traceResult?.firstName && traceResult?.lastName ? `${traceResult.firstName} ${traceResult.lastName}` : null);
          const clipTrace = s.meta?.clipboard_trace as { bestName?: string; names?: string[] } | undefined;
          const legacyRawNames = Array.isArray(clipTrace?.names) ? clipTrace.names.join('\n') : '';
          const clipBestName = clipTrace?.bestName || (legacyRawNames ? parseSkipTraceData(legacyRawNames).bestName : null);
          const displayTracedName = rawTracedName || clipBestName;
          const displayName = s.owner_name || displayTracedName;
          const nameIsGold = !!displayName && (isTraced || !!displayTracedName);
          return (
            <div className="divide-y divide-border">
              <DetailRow label="Name" value={displayName} copyable gold={nameIsGold} />
              {displayTracedName && s.owner_name && displayTracedName !== s.owner_name && (
                <DetailRow label="Traced Name" value={displayTracedName} copyable gold />
              )}
              <PhoneRow seller={s} />
              <DetailRow label="Email" value={s.owner_email} copyable gold={isTraced && !!s.owner_email} />
              <DetailRow label="Mailing Address" value={s.owner_mailing_address} copyable gold={isTraced && !!s.owner_mailing_address} />
              {s.address_full && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(s.address_full || '');
                      toast.success('Address copied – paste it in Realtor.com search');
                      window.open('https://www.realtor.com/', '_blank', 'noopener');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer bg-transparent border-0 p-0"
                  >
                    🏠 Search on Realtor.com
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <Separator />

      {/* Property Info */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Property Details</h4>
        <div className="divide-y divide-border">
          <DetailRow label="Address" value={s.address_full} copyable />
          <DetailRow label="City" value={s.city} />
          <DetailRow label="County" value={s.county} />
          <DetailRow label="State" value={s.state} />
          <DetailRow label="ZIP" value={s.zip} />
          <DetailRow label="APN" value={s.apn} copyable />
          <DetailRow label="FIPS" value={s.fips} />
          <DetailRow label="Property Type" value={s.property_type} />
          <DetailRow label="Zoning" value={s.zoning} />
          <DetailRow label="Acreage" value={s.acreage ? `${Number(s.acreage).toFixed(2)} acres` : null} />
          <DetailRow label="Lot Sqft" value={s.lot_sqft ? Number(s.lot_sqft).toLocaleString() : null} />
          <DetailRow label="Bedrooms" value={s.bedrooms} />
          <DetailRow label="Bathrooms" value={s.bathrooms} />
          <DetailRow label="Living Sqft" value={s.living_sqft ? Number(s.living_sqft).toLocaleString() : null} />
          <DetailRow label="Deal Type" value={s.deal_type} />
        </div>
      </div>

      <Separator />

      {/* Financial Info */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Financials</h4>
        <div className="divide-y divide-border">
          <DetailRow label="Market Value" value={s.market_value ? `$${Number(s.market_value).toLocaleString()}` : null} />
          <DetailRow label="Assessed Value" value={s.assessed_value ? `$${Number(s.assessed_value).toLocaleString()}` : null} />
          <DetailRow label="Asking Price" value={s.asking_price ? `$${Number(s.asking_price).toLocaleString()}` : null} />
          <DetailRow label="Estimated Offer" value={s.estimated_offer ? `$${Number(s.estimated_offer).toLocaleString()}` : null} />
        </div>
      </div>

      <Separator />

      {/* Motivation & Flags */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Motivation & Flags</h4>
        <div className="divide-y divide-border">
          <DetailRow label="Motivation Score" value={
            <span className={`font-mono font-semibold ${
              (s.motivation_score || 0) >= 60 ? 'text-green-500' :
              (s.motivation_score || 0) >= 30 ? 'text-yellow-500' : 'text-muted-foreground'
            }`}>{s.motivation_score || 0}</span>
          } />
          <DetailRow label="Years Owned" value={s.years_owned} />
          <DetailRow label="Tax Delinquent Year" value={s.tax_delinquent_year} />
          {flags.length > 0 && (
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-muted-foreground">Flags</span>
              <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                {flags.map(f => (
                  <Badge key={f as string} variant="outline" className="text-[10px]">{f}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Status & Dates */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Status & Timeline</h4>
        <div className="divide-y divide-border">
          <DetailRow label="Status" value={
            s.status === 'req_trace'
              ? <Badge variant="destructive" className="text-[10px]">Req. Trace</Badge>
              : <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
          } />
          <DetailRow label="Source" value={s.source} />
          <DetailRow label="Skip Traced" value={s.skip_traced_at ? new Date(s.skip_traced_at).toLocaleDateString() : null} />
          <DetailRow label="Contacted" value={s.contacted_at ? new Date(s.contacted_at).toLocaleDateString() : null} />
          <DetailRow label="Created" value={new Date(s.created_at).toLocaleDateString()} />
          <DetailRow label="Updated" value={new Date(s.updated_at).toLocaleDateString()} />
        </div>
      </div>

      {/* Notes — always visible, editable */}
      <Separator />
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Internal Notes</h4>
        {editing ? (
          <Textarea
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Add internal notes about this seller…"
            className="min-h-[80px] text-sm"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {s.notes || 'No notes yet — click Edit to add.'}
          </p>
        )}
      </div>

      {/* Tags */}
      {s.tags && s.tags.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Tags</h4>
            <div className="flex flex-wrap gap-1">
              {s.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
            </div>
          </div>
        </>
      )}

      {/* REAPI ID */}
      {s.reapi_property_id && (
        <>
          <Separator />
          <DetailRow label="REAPI Property ID" value={<span className="font-mono text-xs">{s.reapi_property_id}</span>} />
        </>
      )}

      {/* Skip Trace Section */}
      <Separator />
      <div className="pt-2 space-y-3">
        <p className="text-xs font-medium text-foreground">Skip Trace</p>
        {/* REAPI Skip Trace */}
        {s.skip_traced_at ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">REAPI traced {new Date(s.skip_traced_at).toLocaleDateString()}</span>
            <Button size="sm" variant="outline" onClick={handleSkipTrace} disabled={tracing}>
              {tracing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Re-tracing…</> : 'Re-trace'}
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={handleSkipTrace} disabled={tracing}>
            {tracing ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Skip Tracing…</> : <><Search className="h-3.5 w-3.5 mr-1.5" /> Skip Trace (REAPI)</>}
          </Button>
        )}

        {/* External free skip trace shortcuts */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Free lookup shortcuts</p>
          <div className="grid grid-cols-1 gap-1.5">
            <a
              href={`https://www.truepeoplesearch.com/results?name=${encodeURIComponent(s.owner_name || '')}&citystatezip=${encodeURIComponent([s.city, s.state].filter(Boolean).join(', '))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
            >
              <span>📞</span>
              <span className="flex-1">TruePeopleSearch</span>
              <span className="text-[10px] text-muted-foreground">Phone · Address · Relatives</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
            <a
              href="https://www.datatoleads.com/free-tools"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
            >
              <span>📬</span>
              <span className="flex-1">DataToLeads</span>
              <span className="text-[10px] text-muted-foreground">Reverse phone · Email · Address</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
            <a
              href="https://www.propstream.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
            >
              <span>🏠</span>
              <span className="flex-1">PropStream</span>
              <span className="text-[10px] text-muted-foreground">Owner phone · Email · Free trial</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          </div>
        </div>
      </div>

      {/* Trace Clipboard Modal */}
      <Dialog open={clipboardOpen} onOpenChange={setClipboardOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-4 w-4" />
              Trace Clipboard
            </DialogTitle>
            <DialogDescription className="text-xs">
              Paste skip trace data from TruePeopleSearch, DataToLeads, or any lookup tool. Select all → copy the results page, then paste here. We'll extract phone numbers, emails, and names automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Paste skip trace results here…"
              value={pasteData}
              onChange={e => setPasteData(e.target.value)}
              className="min-h-[200px] font-mono text-xs"
            />
            {pasteData.trim() && (() => {
              const preview = parseSkipTraceData(pasteData);
              return (
                <div className="rounded-md border border-border p-3 space-y-1 text-xs bg-muted/50">
                  <p className="font-semibold text-foreground">Preview — found:</p>
                  {preview.bestName && (
                    <p className="text-yellow-600 dark:text-yellow-400 font-semibold">⭐ Best Name: {preview.bestName}</p>
                  )}
                  <p>📞 Phones: {preview.phones.length > 0 ? preview.phones.join(', ') : <span className="text-muted-foreground">None</span>}</p>
                  <p>📧 Emails: {preview.emails.length > 0 ? preview.emails.join(', ') : <span className="text-muted-foreground">None</span>}</p>
                  <p>👤 All Names: {preview.names.length > 0 ? preview.names.join(', ') : <span className="text-muted-foreground">None</span>}</p>
                </div>
              );
            })()}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setClipboardOpen(false); setPasteData(''); }}>Cancel</Button>
              <Button size="sm" onClick={handleClipboardSubmit} disabled={parsing || !pasteData.trim()}>
                {parsing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Processing…</> : 'Submit & Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
