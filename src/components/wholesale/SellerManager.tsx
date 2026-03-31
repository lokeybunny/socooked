import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Search, MapPin, Download, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Info, TreePine, Home, Building2, ExternalLink, Copy, ClipboardPaste, ChevronDown, ChevronUp, Phone, ArrowLeft, ArrowRight, Pencil, Save, FileSpreadsheet, Flame, Snowflake, Sun, Target, X, Shield, Upload } from 'lucide-react';
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
  { key: 'funnel_lead', label: 'Funnel Leads' },
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
  funnel_lead: 'bg-orange-500/10 text-orange-500',
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [sellers, setSellers] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [connectDealOpen, setConnectDealOpen] = useState(false);
  const [connectBuyerId, setConnectBuyerId] = useState('');
  const [connectingDeal, setConnectingDeal] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [dealTypeFilter, setDealTypeFilter] = useState('all');
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [sortField, setSortField] = useState('motivation_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [distressFilters, setDistressFilters] = useState<DistressFilterState>(EMPTY_DISTRESS_FILTERS);
  const [csvOpen, setCsvOpen] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importBulkOpen, setImportBulkOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoOpenedRef = useRef(false);

  const isNewlyFetched = useCallback((createdAt: string) => {
    if (!lastFetchAt) return false;
    const fetchTime = new Date(lastFetchAt).getTime();
    const created = new Date(createdAt).getTime();
    return created >= fetchTime - 120000;
  }, [lastFetchAt]);

  // Fetch form
  const [fetchCounty, setFetchCounty] = useState('');
  const [fetchState, setFetchState] = useState('');
  const [fetchDealType, setFetchDealType] = useState('both');
  const [fetchSize, setFetchSize] = useState('50');
  const [detailSeller, setDetailSeller] = useState<any>(null);

  // Auto-open seller detail from URL param
  useEffect(() => {
    if (autoOpenedRef.current || loading || !sellers.length) return;
    const openId = searchParams.get('open_id');
    if (openId) {
      const found = sellers.find(s => s.id === openId);
      if (found) {
        setDetailSeller(found);
        autoOpenedRef.current = true;
        const next = new URLSearchParams(searchParams);
        next.delete('open_id');
        setSearchParams(next, { replace: true });
      }
    }
  }, [sellers, loading, searchParams]);

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
    // Advanced house filters (Zillow-style)
    bedrooms_min: '',
    bedrooms_max: '',
    bathrooms_min: '',
    bathrooms_max: '',
    sqft_min: '',
    sqft_max: '',
    lot_sqft_min: '',
    lot_sqft_max: '',
    year_built_min: '',
    year_built_max: '',
    stories_min: '',
    stories_max: '',
    has_pool: false,
    has_garage: false,
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
      bedrooms_min: '', bedrooms_max: '', bathrooms_min: '', bathrooms_max: '',
      sqft_min: '', sqft_max: '', lot_sqft_min: '', lot_sqft_max: '',
      year_built_min: '', year_built_max: '', stories_min: '', stories_max: '',
      has_pool: false, has_garage: false,
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
    const allSellers = data || [];

    // Auto-promote: sellers with a valid phone still in 'new' → 'skip_traced'
    const hasPhone = (s: any) => {
      const ph = s.owner_phone?.trim();
      if (ph && ph !== 'N/A' && ph.replace(/\D/g, '').length >= 7) return true;
      const metaPhones = s.meta?.all_phones;
      return Array.isArray(metaPhones) && metaPhones.length > 0;
    };
    const toPromote = allSellers.filter((s: any) => s.status === 'new' && hasPhone(s));
    if (toPromote.length > 0) {
      const ids = toPromote.map((s: any) => s.id);
      supabase.from('lw_sellers').update({ status: 'skip_traced' }).in('id', ids).then();
      allSellers.forEach((s: any) => { if (ids.includes(s.id)) s.status = 'skip_traced'; });
    }

    setSellers(allSellers);
    setLoading(false);
  };

  // ── IMPORT BULK: parse CSV, match addresses to existing sellers, update to skip_traced ──
  const handleBulkImport = async (file: File) => {
    setImportLoading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV must have a header row and at least one data row'); return; }

      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());

      // Flexible header detection — supports skip-trace exports and simple CSVs
      const findIdx = (patterns: RegExp[]) => {
        for (const pat of patterns) {
          const idx = headers.findIndex(h => pat.test(h));
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const addrIdx = findIdx([
        /^submitted property address$/, /^property address$/, /^address_full$/, /^address$/,
        /^full.?address$/, /^street.?address$/, /^street$/,
      ]);
      const phoneIdxes = headers.reduce<number[]>((acc, h, i) => {
        if (/owner phone\d?$|^phone\d?$|^owner_phone|^phone_number|^mobile|^cell|^telephone/.test(h)) acc.push(i);
        return acc;
      }, []);
      const nameIdx = findIdx([
        /^owner full name$/, /^submitted owner full name$/, /^owner_name$/, /^owner name$/,
        /^full.?name$/, /^name$/, /^contact.?name$/,
      ]);
      const emailIdx = findIdx([
        /^owner email1$/, /^owner email$/, /^email1?$/, /^owner_email$/, /^email.?address$/,
      ]);

      if (addrIdx === -1) { toast.error('CSV must have an address column (Address, Property Address, Submitted Property Address, etc.)'); return; }

      const parseCsvRow = (line: string): string[] => {
        const result: string[] = []; let current = ''; let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') inQuotes = !inQuotes;
          else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
          else current += ch;
        }
        result.push(current.trim());
        return result;
      };

      const csvRows = lines.slice(1).map(parseCsvRow);
      const csvAddresses = csvRows
        .map(row => {
          // Collect all phone numbers from matched phone columns
          const phones = phoneIdxes
            .map(i => (row[i] || '').replace(/^"|"$/g, '').trim())
            .filter(p => p.replace(/\D/g, '').length >= 7);
          return {
            address: (row[addrIdx] || '').replace(/^"|"$/g, '').trim(),
            phone: phones[0] || '',
            allPhones: phones,
            name: nameIdx >= 0 ? (row[nameIdx] || '').replace(/^"|"$/g, '').trim() : '',
            email: emailIdx >= 0 ? (row[emailIdx] || '').replace(/^"|"$/g, '').trim() : '',
          };
        })
        .filter(r => r.address.length > 3);

      if (!csvAddresses.length) { toast.error('No valid addresses found in CSV'); return; }

      const normalize = (a: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sellerMap = new Map<string, any>();
      for (const s of sellers) {
        if (s.address_full) sellerMap.set(normalize(s.address_full), s);
      }

      let matched = 0; let skipped = 0;

      for (const row of csvAddresses) {
        const seller = sellerMap.get(normalize(row.address));
        if (!seller || ['skip_traced','contacted','offer_sent','under_contract','closed'].includes(seller.status)) { skipped++; continue; }

        matched++;
        const updates: Record<string, any> = { status: 'skip_traced', skip_traced_at: new Date().toISOString(), skip_trace_status: 'completed' };
        // Merge all phones from CSV into meta.all_phones and set primary phone
        const existing: string[] = Array.isArray(seller.meta?.all_phones) ? seller.meta.all_phones : [];
        const newPhones = row.allPhones.filter((p: string) => !existing.includes(p));
        if (row.phone && row.phone.replace(/\D/g, '').length >= 7) {
          updates.owner_phone = row.phone;
        }
        if (newPhones.length > 0) {
          updates.meta = { ...(seller.meta || {}), all_phones: [...existing, ...newPhones] };
          updates.phones_found_count = existing.length + newPhones.length;
        }
        if (row.name && row.name.length > 2 && !seller.owner_name) updates.owner_name = row.name;
        if (row.email && row.email.includes('@') && !seller.owner_email) updates.owner_email = row.email;
        await supabase.from('lw_sellers').update(updates).eq('id', seller.id);
      }
      toast.success(`Import complete: ${matched} matched & updated, ${skipped} skipped`);
      setImportBulkOpen(false);
      await loadSellers();
    } catch (err: any) { toast.error(err.message || 'Import failed'); }
    finally { setImportLoading(false); if (importFileRef.current) importFileRef.current.value = ''; }
  };

  const fetchProperties = async () => {
    if (!fetchCounty.trim() || !fetchState.trim()) {
      toast.error('County and State are required');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setFetching(true);
    try {
      const types = fetchDealType === 'both' ? ['land', 'home', 'multi_home'] : [fetchDealType];
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
        // Advanced building specs
        if (fetchDistress.bedrooms_min) df.bedrooms_min = Number(fetchDistress.bedrooms_min);
        if (fetchDistress.bedrooms_max) df.bedrooms_max = Number(fetchDistress.bedrooms_max);
        if (fetchDistress.bathrooms_min) df.bathrooms_min = Number(fetchDistress.bathrooms_min);
        if (fetchDistress.bathrooms_max) df.bathrooms_max = Number(fetchDistress.bathrooms_max);
        if (fetchDistress.sqft_min) df.sqft_min = Number(fetchDistress.sqft_min);
        if (fetchDistress.sqft_max) df.sqft_max = Number(fetchDistress.sqft_max);
        if (fetchDistress.lot_sqft_min) df.lot_sqft_min = Number(fetchDistress.lot_sqft_min);
        if (fetchDistress.lot_sqft_max) df.lot_sqft_max = Number(fetchDistress.lot_sqft_max);
        if (fetchDistress.year_built_min) df.year_built_min = Number(fetchDistress.year_built_min);
        if (fetchDistress.year_built_max) df.year_built_max = Number(fetchDistress.year_built_max);
        if (fetchDistress.stories_min) df.stories_min = Number(fetchDistress.stories_min);
        if (fetchDistress.stories_max) df.stories_max = Number(fetchDistress.stories_max);
        if (fetchDistress.has_pool) df.has_pool = true;
        if (fetchDistress.has_garage) df.has_garage = true;
      }

      for (const dt of types) {
        if (controller.signal.aborted) break;
        const { data, error } = await supabase.functions.invoke('land-reapi-search', {
          body: {
            county: fetchCounty.trim(),
            state: fetchState.trim().toUpperCase(),
            deal_type: dt,
            size: Number(fetchSize) || 50,
            ...(distressMode ? { distress_filters: df } : {}),
          },
        });
        if (controller.signal.aborted) break;
        if (error) throw error;
        totalFetched += data?.records_fetched || 0;
        totalNew += data?.records_new || 0;
      }
      if (controller.signal.aborted) {
        toast.info('Search stopped');
      } else {
        toast.success(`Fetched ${totalFetched} properties, ${totalNew} new`);
      }
      // Mark fetch timestamp for green highlight (auto-clears after 5 min)
      const now = new Date().toISOString();
      setLastFetchAt(now);
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = setTimeout(() => setLastFetchAt(null), 5 * 60 * 1000);
      await loadSellers();
    } catch (err: any) {
      toast.error(err.message || 'Fetch failed');
    }
    abortRef.current = null;
    setFetching(false);
  };

  const stopFetch = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
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

    // Hide duplicates: deduplicate by normalized address_full OR owner_name
    if (hideDuplicates) {
      const seen = new Set<string>();
      list = list.filter(s => {
        const addrKey = (s.address_full || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const nameKey = (s.owner_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const key = addrKey + '|' + nameKey;
        if (key === '|') return true; // keep if both empty
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    list.sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [sellers, stateFilter, stageFilter, dealTypeFilter, search, sortField, sortAsc, distressFilters, hideDuplicates]);

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
              {selectedIds.size > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5 h-7 border-primary text-primary"
                  onClick={() => {
                    const selected = sellers.filter(s => selectedIds.has(s.id));
                    if (!selected.length) return;
                    const headers = ['Owner Name','Address','City','County','State','Zip','Acreage','Property Type','Status','Motivation Score'];
                    const csvRows = selected.map(s => [
                      s.owner_name || '', s.address_full || '', s.city || '', s.county || '',
                      s.state || '', s.zip || '', s.acreage || '', s.property_type || '',
                      s.status || '', s.motivation_score || 0,
                    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
                    const csv = [headers.join(','), ...csvRows].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `seller_export_${selected.length}_leads.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(`Exported ${selected.length} sellers to CSV`);
                  }}
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  EXPORT BULK ({selectedIds.size})
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5 h-7"
                onClick={() => setImportBulkOpen(true)}
              >
                <Upload className="h-3 w-3" />
                IMPORT BULK
              </Button>
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
                  <SelectItem value="both">🔄 All</SelectItem>
                  <SelectItem value="land">🏞️ Land</SelectItem>
                  <SelectItem value="home">🏠 Homes</SelectItem>
                  <SelectItem value="multi_home"><span className="flex items-center gap-1.5"><span className="relative flex items-center w-5 h-4"><Home className="h-3.5 w-3.5 text-purple-500 absolute left-0" /><Home className="h-3.5 w-3.5 text-purple-400 absolute left-1.5" /></span> Multi-Home</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Results</Label>
              <Input type="number" value={fetchSize} onChange={e => setFetchSize(e.target.value)} className="w-[80px] h-9" />
            </div>
            <Button onClick={fetchProperties} disabled={fetching} className="h-9">
              {fetching ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Fetching…</> : <><Download className="h-3.5 w-3.5 mr-1" /> {distressMode ? 'Distress Search' : 'Fetch Properties'}</>}
            </Button>
            {fetching && (
              <Button variant="destructive" onClick={stopFetch} className="h-9 gap-1.5">
                <X className="h-3.5 w-3.5" /> Stop
              </Button>
            )}
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => setCsvOpen(true)}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV Import
            </Button>
          </div>

          {/* Distress Search Expandable Filter Groups */}
          {distressMode && (
            <div className="border rounded-lg bg-muted/30 p-3 space-y-3 mt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Shield className="h-3 w-3" /> Distress Filters
              </p>

              {/* Ownership Signals */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Ownership</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.absentee_owner} onCheckedChange={v => setFetchDistress(p => ({...p, absentee_owner: !!v}))} />
                    Absentee Owner
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.out_of_state} onCheckedChange={v => setFetchDistress(p => ({...p, out_of_state: !!v}))} />
                    Out-of-State
                  </label>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Years Owned ≥</Label>
                    <Input type="number" placeholder="10" className="h-7 w-16 text-xs"
                      value={fetchDistress.years_owned_min} onChange={e => setFetchDistress(p => ({...p, years_owned_min: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* Financial Signals */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Financial</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={!!fetchDistress.tax_delinquent_year} onCheckedChange={v => setFetchDistress(p => ({...p, tax_delinquent_year: v ? String(new Date().getFullYear() - 1) : ''}))} />
                    Tax Delinquent
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.liens} onCheckedChange={v => setFetchDistress(p => ({...p, liens: !!v}))} />
                    Liens
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.free_and_clear} onCheckedChange={v => setFetchDistress(p => ({...p, free_and_clear: !!v}))} />
                    Free & Clear
                  </label>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Equity ≥</Label>
                    <Input type="number" placeholder="40%" className="h-7 w-16 text-xs"
                      value={fetchDistress.high_equity_percent} onChange={e => setFetchDistress(p => ({...p, high_equity_percent: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* Foreclosure / Legal */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Foreclosure & Legal</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.pre_foreclosure} onCheckedChange={v => setFetchDistress(p => ({...p, pre_foreclosure: !!v}))} />
                    Pre-Foreclosure
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.foreclosure} onCheckedChange={v => setFetchDistress(p => ({...p, foreclosure: !!v}))} />
                    Foreclosure
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.auction} onCheckedChange={v => setFetchDistress(p => ({...p, auction: !!v}))} />
                    Auction
                  </label>
                </div>
              </div>

              {/* Property */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Property</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-end">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.vacant} onCheckedChange={v => setFetchDistress(p => ({...p, vacant: !!v}))} />
                    Vacant
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.vacant_land} onCheckedChange={v => setFetchDistress(p => ({...p, vacant_land: !!v}))} />
                    Vacant Land
                  </label>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Type</Label>
                    <Select value={fetchDistress.property_type || 'any'} onValueChange={v => setFetchDistress(p => ({...p, property_type: v === 'any' ? '' : v}))}>
                      <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="LAND">Land</SelectItem>
                        <SelectItem value="SFR">SFR</SelectItem>
                        <SelectItem value="MFR">Multi-Family</SelectItem>
                        <SelectItem value="CONDO">Condo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Acres</Label>
                    <Input type="number" step="0.1" placeholder="Min" className="h-7 w-16 text-xs"
                      value={fetchDistress.acreage_min} onChange={e => setFetchDistress(p => ({...p, acreage_min: e.target.value}))} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="number" step="0.1" placeholder="Max" className="h-7 w-16 text-xs"
                      value={fetchDistress.acreage_max} onChange={e => setFetchDistress(p => ({...p, acreage_max: e.target.value}))} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Value $</Label>
                    <Input type="number" placeholder="Min" className="h-7 w-20 text-xs"
                      value={fetchDistress.value_min} onChange={e => setFetchDistress(p => ({...p, value_min: e.target.value}))} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="number" placeholder="Max" className="h-7 w-20 text-xs"
                      value={fetchDistress.value_max} onChange={e => setFetchDistress(p => ({...p, value_max: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* Building Specs (Zillow-style) */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Building Specs</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-end">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Beds</Label>
                    <Input type="number" placeholder="Min" className="h-7 w-14 text-xs"
                      value={fetchDistress.bedrooms_min} onChange={e => setFetchDistress(p => ({...p, bedrooms_min: e.target.value}))} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="number" placeholder="Max" className="h-7 w-14 text-xs"
                      value={fetchDistress.bedrooms_max} onChange={e => setFetchDistress(p => ({...p, bedrooms_max: e.target.value}))} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Baths</Label>
                    <Input type="number" placeholder="Min" className="h-7 w-14 text-xs"
                      value={fetchDistress.bathrooms_min} onChange={e => setFetchDistress(p => ({...p, bathrooms_min: e.target.value}))} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="number" placeholder="Max" className="h-7 w-14 text-xs"
                      value={fetchDistress.bathrooms_max} onChange={e => setFetchDistress(p => ({...p, bathrooms_max: e.target.value}))} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Sqft</Label>
                    <Input type="number" placeholder="Min" className="h-7 w-20 text-xs"
                      value={fetchDistress.sqft_min} onChange={e => setFetchDistress(p => ({...p, sqft_min: e.target.value}))} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="number" placeholder="Max" className="h-7 w-20 text-xs"
                      value={fetchDistress.sqft_max} onChange={e => setFetchDistress(p => ({...p, sqft_max: e.target.value}))} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Lot Sqft</Label>
                    <Input type="number" placeholder="Min" className="h-7 w-20 text-xs"
                      value={fetchDistress.lot_sqft_min} onChange={e => setFetchDistress(p => ({...p, lot_sqft_min: e.target.value}))} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="number" placeholder="Max" className="h-7 w-20 text-xs"
                      value={fetchDistress.lot_sqft_max} onChange={e => setFetchDistress(p => ({...p, lot_sqft_max: e.target.value}))} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Yr Built</Label>
                    <Input type="number" placeholder="Min" className="h-7 w-16 text-xs"
                      value={fetchDistress.year_built_min} onChange={e => setFetchDistress(p => ({...p, year_built_min: e.target.value}))} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="number" placeholder="Max" className="h-7 w-16 text-xs"
                      value={fetchDistress.year_built_max} onChange={e => setFetchDistress(p => ({...p, year_built_max: e.target.value}))} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs whitespace-nowrap">Stories</Label>
                    <Input type="number" placeholder="Min" className="h-7 w-14 text-xs"
                      value={fetchDistress.stories_min} onChange={e => setFetchDistress(p => ({...p, stories_min: e.target.value}))} />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="number" placeholder="Max" className="h-7 w-14 text-xs"
                      value={fetchDistress.stories_max} onChange={e => setFetchDistress(p => ({...p, stories_max: e.target.value}))} />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.has_pool} onCheckedChange={v => setFetchDistress(p => ({...p, has_pool: !!v}))} />
                    Pool
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={fetchDistress.has_garage} onCheckedChange={v => setFetchDistress(p => ({...p, has_garage: !!v}))} />
                    Garage
                  </label>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
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
                <SelectItem value="multi_home"><span className="flex items-center gap-1.5"><span className="relative flex items-center w-5 h-4"><Home className="h-3.5 w-3.5 text-purple-500 absolute left-0" /><Home className="h-3.5 w-3.5 text-purple-400 absolute left-1.5" /></span> Multi-Home</span></SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground whitespace-nowrap">
              <Checkbox checked={hideDuplicates} onCheckedChange={(v) => setHideDuplicates(!!v)} />
              Hide Duplicates
            </label>
          </div>

          {/* Distress Intelligence Presets & Advanced Filters */}
          <DistressFilters filters={distressFilters} onChange={setDistressFilters} onPreset={handlePreset} />
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
                    <TableHead className="w-8">
                      <Checkbox
                        checked={paginated.length > 0 && paginated.every(s => selectedIds.has(s.id))}
                        onCheckedChange={(checked) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            paginated.forEach(s => checked ? next.add(s.id) : next.delete(s.id));
                            return next;
                          });
                        }}
                      />
                    </TableHead>
                    <TableHead className="w-8">Type</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('owner_name')}>
                      Owner {sortField === 'owner_name' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>County/State</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('acreage')}>
                      Acres {sortField === 'acreage' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('motivation_score')}>
                      Distress {sortField === 'motivation_score' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('equity_percent')}>
                      Equity% {sortField === 'equity_percent' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('buyer_match_score')}>
                      Buyer Match {sortField === 'buyer_match_score' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(s => {
                    const tempIcon = (s.lead_temperature || ((s.motivation_score || 0) >= 70 ? 'Hot' : (s.motivation_score || 0) >= 45 ? 'Warm' : 'Cold'));
                    return (
                    <TableRow key={s.id} className={`${isNewlyFetched(s.created_at) ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500 animate-in fade-in duration-500' : ''} ${selectedIds.has(s.id) ? 'bg-primary/5' : ''}`}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedIds.has(s.id)}
                          onCheckedChange={(checked) => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              checked ? next.add(s.id) : next.delete(s.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {(s.deal_type || 'land') === 'land'
                          ? <TreePine className="h-4 w-4 text-emerald-500 mx-auto" />
                          : (s.deal_type || 'land') === 'multi_home'
                            ? <span className="relative mx-auto flex items-center justify-center w-5 h-4"><Home className="h-3.5 w-3.5 text-purple-500 absolute left-0" /><Home className="h-3.5 w-3.5 text-purple-400 absolute left-1.5" /></span>
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
                      <TableCell className="text-xs">
                        <span>{s.county || '—'}</span>
                        <span className="text-muted-foreground">, {s.state || '—'}</span>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{s.acreage ? Number(s.acreage).toFixed(2) : '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {tempIcon === 'Hot' && <Flame className="h-3 w-3 text-destructive" />}
                          {tempIcon === 'Warm' && <Sun className="h-3 w-3 text-yellow-500" />}
                          {tempIcon === 'Cold' && <Snowflake className="h-3 w-3 text-muted-foreground" />}
                          <span className={`font-mono text-sm font-semibold ${
                            (s.motivation_score || 0) >= 70 ? 'text-destructive' :
                            (s.motivation_score || 0) >= 45 ? 'text-yellow-500' : 'text-muted-foreground'
                          }`}>{s.motivation_score || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-0.5">
                          {s.is_absentee_owner && <Badge variant="outline" className="text-[8px] px-1 py-0">ABS</Badge>}
                          {s.is_vacant && <Badge variant="outline" className="text-[8px] px-1 py-0">VAC</Badge>}
                          {s.is_tax_delinquent && <Badge variant="destructive" className="text-[8px] px-1 py-0">TAX</Badge>}
                          {s.is_pre_foreclosure && <Badge variant="destructive" className="text-[8px] px-1 py-0">FC</Badge>}
                          {s.is_out_of_state && <Badge variant="outline" className="text-[8px] px-1 py-0">OOS</Badge>}
                          {s.has_tax_lien && <Badge variant="outline" className="text-[8px] px-1 py-0">LIEN</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {s.equity_percent ? `${Number(s.equity_percent).toFixed(0)}%` : '—'}
                      </TableCell>
                      <TableCell>
                        {(s.buyer_match_score || 0) > 0 ? (
                          <span className={`font-mono text-sm font-semibold ${
                            (s.buyer_match_score || 0) >= 50 ? 'text-primary' : 'text-muted-foreground'
                          }`}>{s.buyer_match_score}</span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[9px] px-1">{s.source || 'reapi'}</Badge>
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
                  );
                  })}
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
              {/* Connect Deal — only for under_contract sellers */}
              {detailSeller.status === 'under_contract' && (
                <Button
                  className="w-full gap-2"
                  variant="default"
                  onClick={() => { setConnectDealOpen(true); setConnectBuyerId(''); setBuyerSearch(''); }}
                >
                  <Heart className="h-4 w-4" />
                  Connect Deal
                </Button>
              )}
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

      {/* Connect Deal — Buyer Picker Dialog */}
      <Dialog open={connectDealOpen} onOpenChange={setConnectDealOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-pink-500" />
              Connect Buyer to Deal
            </DialogTitle>
            <DialogDescription>
              Select a buyer to connect with <span className="font-semibold">{detailSeller?.owner_name || 'this property'}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Search buyers..."
              value={buyerSearch}
              onChange={e => setBuyerSearch(e.target.value)}
            />
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {buyers
                .filter(b => !buyerSearch || b.full_name?.toLowerCase().includes(buyerSearch.toLowerCase()) || b.email?.toLowerCase().includes(buyerSearch.toLowerCase()))
                .map(b => (
                  <button
                    key={b.id}
                    onClick={() => setConnectBuyerId(b.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${connectBuyerId === b.id ? 'bg-primary/15 border border-primary/30' : 'hover:bg-accent'}`}
                  >
                    <p className="font-medium text-foreground">{b.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.target_states?.join(', ') || '—'} · Budget: {b.budget_max ? `$${Number(b.budget_max).toLocaleString()}` : '—'}
                    </p>
                  </button>
                ))}
              {buyers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No buyers found. Add buyers first.</p>
              )}
            </div>
            <Button
              className="w-full"
              disabled={!connectBuyerId || connectingDeal}
              onClick={async () => {
                if (!detailSeller || !connectBuyerId) return;
                setConnectingDeal(true);
                const buyer = buyers.find(b => b.id === connectBuyerId);
                const { error } = await supabase.from('lw_deals').insert({
                  title: `${detailSeller.owner_name || detailSeller.address_full || 'Deal'} ↔ ${buyer?.full_name || 'Buyer'}`,
                  seller_id: detailSeller.id,
                  buyer_id: connectBuyerId,
                  deal_type: detailSeller.deal_type || 'land',
                  stage: 'under_contract',
                  match_score: detailSeller.buyer_match_score || 0,
                  seller_ask: detailSeller.asking_price || detailSeller.market_value || null,
                  buyer_price: buyer?.budget_max || null,
                });
                setConnectingDeal(false);
                if (error) {
                  toast.error(error.message);
                } else {
                  toast.success('Deal connected! It will now appear in the pipeline.');
                  setConnectDealOpen(false);
                  setDetailSeller(null);
                }
              }}
            >
              {connectingDeal ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm & Create Deal'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Import */}
      <CsvImport open={csvOpen} onOpenChange={setCsvOpen} onImported={loadSellers} dealType={dealTypeFilter !== 'all' ? dealTypeFilter : 'land'} />

      {/* Bulk Import Skip Trace Dialog */}
      <Dialog open={importBulkOpen} onOpenChange={setImportBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Import Bulk Skip Trace</DialogTitle>
            <DialogDescription>
              Upload a CSV with an <strong>Address</strong> column. Matching leads will be updated to <strong>Skip Traced</strong> status. Optionally include Phone, Name, and Email columns to enrich records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <input
                ref={importFileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBulkImport(f);
                }}
              />
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Select a .csv file with skip trace results</p>
              <Button
                variant="outline"
                size="sm"
                disabled={importLoading}
                onClick={() => importFileRef.current?.click()}
              >
                {importLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Processing…</> : 'Choose CSV File'}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Required:</strong> Address (or Property Address, Street Address)</p>
              <p><strong>Optional:</strong> Phone, Name, Email — will enrich matched records</p>
              <p>Only leads in New, Req. Trace, or Funnel Lead stages will be updated.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
  const [pendingStageChange, setPendingStageChange] = useState<{ direction: 'next' | 'prev'; targetKey: string; targetLabel: string } | null>(null);
  const [lookupIframeUrl, setLookupIframeUrl] = useState<string | null>(null);

  // Agreement generator state
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementText, setAgreementText] = useState('');
  const [generatingAgreement, setGeneratingAgreement] = useState(false);
  const [agreementDuration, setAgreementDuration] = useState('30');
  const [agreementPrice, setAgreementPrice] = useState('');
  const [agreementCloseDate, setAgreementCloseDate] = useState('');
  const [agreementBuyerName, setAgreementBuyerName] = useState('');
  const [agreementCompanyName, setAgreementCompanyName] = useState('');
  const [draftingEmail, setDraftingEmail] = useState(false);
  const [sendingForSignature, setSendingForSignature] = useState(false);

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
        await supabase.from('lw_sellers').update({ status: 'req_trace' }).eq('id', s.id);
        toast.error('No phone data found — marked as "Req. Trace". Try a free lookup tool instead.', { duration: 5000 });
      }
      onSkipTraced?.();
    } catch (err: any) {
      toast.error(err.message || 'Skip trace failed');
    }
    setTracing(false);
  };

  const requestAdvancePipeline = () => {
    const idx = PIPELINE_ORDER.indexOf(s.status);
    if (idx < 0 || idx >= PIPELINE_ORDER.length - 1) return;
    const nextKey = PIPELINE_ORDER[idx + 1];
    const nextLabel = SELLER_STAGES.find(st => st.key === nextKey)?.label || nextKey;
    setPendingStageChange({ direction: 'next', targetKey: nextKey, targetLabel: nextLabel });
  };

  const requestRevertPipeline = () => {
    const idx = PIPELINE_ORDER.indexOf(s.status);
    if (idx <= 0) return;
    const prevKey = PIPELINE_ORDER[idx - 1];
    const prevLabel = SELLER_STAGES.find(st => st.key === prevKey)?.label || prevKey;
    setPendingStageChange({ direction: 'prev', targetKey: prevKey, targetLabel: prevLabel });
  };

  const confirmStageChange = async () => {
    if (!pendingStageChange) return;
    const { direction, targetKey, targetLabel } = pendingStageChange;
    await supabase.from('lw_sellers').update({ status: targetKey }).eq('id', s.id);
    toast.success(`${direction === 'next' ? 'Advanced' : 'Moved back'} to "${targetLabel}"`);
    setPendingStageChange(null);
    onSkipTraced?.();
  };

  const generateAgreement = async () => {
    setGeneratingAgreement(true);
    try {
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const m = (s.meta || {}) as Record<string, any>;
      const closingDateStr = agreementCloseDate
        ? new Date(agreementCloseDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : `within ${agreementDuration} days of the execution of this Agreement`;
      const price = agreementPrice || String(s.estimated_offer || s.asking_price || '0');
      const sellerName = s.owner_name || 'Property Owner';
      const sellerAddr = s.owner_mailing_address || s.address_full || 'On File';
      const propAddr = s.address_full || 'On File';
      const propCity = s.city || 'N/A';
      const propState = s.state || 'N/A';
      const propZip = s.zip || 'N/A';
      const propCounty = s.county || 'N/A';
      const propApn = s.apn || 'N/A';

      const prompt = `Generate a professional, ready-to-sign real estate wholesale purchase agreement. Output ONLY the final contract text — no commentary, no instructions, no preamble.

ABSOLUTE RULE: Do NOT use any placeholder brackets like [NAME], [ADDRESS], [DATE], [AMOUNT], [BUYER], [SELLER], [STATE], [BLANK], [TBD], or any similar bracket notation anywhere in the document. Every field must be filled in with the actual data provided below. If data is unavailable, write "N/A" as plain text — never in brackets.

CONTRACT DATA:
- Effective Date: ${today}
- Buyer Full Name: ${agreementBuyerName || 'Buyer'}
- Buyer Company: ${agreementCompanyName || 'N/A'}
- Buyer Designation in Contract: "${agreementBuyerName || 'Buyer'}${agreementCompanyName ? ', on behalf of ' + agreementCompanyName : ''}, and/or assigns"
- Seller Full Name: ${sellerName}
- Seller Mailing Address: ${sellerAddr}
- Property Address: ${propAddr}, ${propCity}, ${propState} ${propZip}
- County: ${propCounty}
- APN/Parcel Number: ${propApn}
- Property Type: ${s.property_type || 'Real Property'}
- Acreage: ${s.acreage ? Number(s.acreage).toFixed(2) + ' acres' : 'N/A'}
- Lot Size: ${s.lot_sqft ? Number(s.lot_sqft).toLocaleString() + ' sq ft' : 'N/A'}
- Bedrooms: ${s.bedrooms || 'N/A'}
- Bathrooms: ${s.bathrooms || 'N/A'}
- Purchase Price: $${Number(price).toLocaleString()}
- Earnest Money Deposit: $${Math.min(500, Math.max(100, Math.round(Number(price) * 0.01))).toLocaleString()}
- Due Diligence Period: ${agreementDuration} days
- Closing Date: ${closingDateStr}
- Governing State Law: ${propState}
- Transaction Type: ALL-CASH purchase — NO financing, NO mortgage contingency, NO appraisal contingency, NO inspection contingency.

REQUIRED CLAUSES:
1. Purchase price and payment terms — ALL CASH, exact dollar amount stated. No financing contingency.
2. Earnest money deposit amount — non-refundable after due diligence period ends.
3. Due diligence period of ${agreementDuration} days — Buyer may cancel for any reason with full refund of earnest money ONLY during this period.
4. EXPLICITLY STATE: This is a cash transaction. Buyer waives all inspection contingencies, appraisal contingencies, and financing contingencies. Property is purchased AS-IS, WHERE-IS with no warranties regarding condition.
5. ASSIGNMENT AND ASSIGNMENT FEE CLAUSE (CRITICAL — include verbatim):
   a. "This Agreement and all rights and obligations hereunder are freely assignable by Buyer to any third party, investor, or wholesaler at any time without the prior written consent of Seller."
   b. "Buyer shall have the right to collect an Assignment Fee from any assignee as compensation for assigning this contract. The Assignment Fee shall be paid to Buyer (or Buyer's designated entity) directly at closing through the title company or settlement agent, and shall appear on the closing/settlement statement as a separate line item."
   c. "Seller acknowledges and agrees that Buyer may assign this contract one or more times, and Seller's obligations under this Agreement shall remain unchanged regardless of any assignment. No assignment shall release the original Buyer from liability unless the assignee expressly assumes all obligations."
   d. "Upon assignment, the assignee shall assume all rights, obligations, and benefits of Buyer under this Agreement and shall be bound by all terms herein."
6. Closing date and location details — closing to occur at a title company in ${propCounty} County, ${propState}.
7. Title and clear deed requirements — Seller to provide marketable title via warranty deed or special warranty deed.
8. Default and remedies for both parties.
9. Governing law for the state of ${propState}.
10. Signature blocks for Seller (${sellerName}) and Buyer or Assignee, each with a printed name line and date line.
11. Entire agreement / merger clause.

Format with numbered sections and clear headings. Make this ready to print, sign, and execute immediately.`;

      const { data, error } = await supabase.functions.invoke('wholesale-agreement', {
        body: { prompt },
      });
      if (error) throw error;
      setAgreementText(data?.text || 'Agreement generation failed — please try again.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate agreement');
      setAgreementText('');
    }
    setGeneratingAgreement(false);
  };

  const handleDraftEmail = async () => {
    if (!agreementText.trim()) return;
    setDraftingEmail(true);
    try {
      const sellerName = s.owner_name || 'Property Owner';
      const sellerEmail = s.owner_email || '';
      const subject = `Wholesale Purchase Agreement — ${s.address_full || 'Property'}`;
      const bodyHtml = `<p>Dear ${sellerName},</p>
<p>Please find the purchase agreement for the property located at <strong>${s.address_full || 'the referenced address'}</strong>.</p>
<hr/>
<pre style="white-space:pre-wrap;font-family:inherit;">${agreementText}</pre>
<hr/>
<p>Please review and let us know if you have any questions.</p>
<p>Best regards</p>`;

      // Save as draft in communications table
      await supabase.from('communications').insert({
        type: 'email',
        direction: 'outbound',
        status: 'draft',
        subject,
        body: bodyHtml,
        to_address: sellerEmail || null,
        from_address: null,
        provider: 'wholesale-agreement',
        metadata: { seller_id: s.id, address: s.address_full, agreement_type: 'wholesale_purchase' },
      });

      // Sync seller as CRM customer if not already there
      const ownerName = s.owner_name || `Owner — ${s.address_full || 'Unknown'}`;
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .or(`email.eq.${sellerEmail || '___none___'},phone.eq.${s.owner_phone || '___none___'},full_name.eq.${ownerName}`)
        .limit(1);

      if (!existing?.length) {
        await supabase.from('customers').insert({
          full_name: ownerName,
          email: sellerEmail || null,
          phone: s.owner_phone || null,
          address: s.owner_mailing_address || s.address_full || null,
          source: 'wholesale',
          status: 'lead',
          category: 'wholesale',
          tags: ['wholesale', 'seller'],
          meta: { seller_id: s.id, property_address: s.address_full },
        });
        toast.success('Seller added to CRM as a client');
      }

      toast.success('Agreement saved as email draft — check Email → Drafts');
      setAgreementOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save draft');
    }
    setDraftingEmail(false);
  };

  const handleSendForSignature = async () => {
    if (!agreementText.trim()) return;
    setSendingForSignature(true);
    try {
      // Sync seller as CRM customer first
      const ownerName = s.owner_name || `Owner — ${s.address_full || 'Unknown'}`;
      const sellerEmail = s.owner_email || '';
      const sellerPhone = s.owner_phone || '';

      let customerId: string;
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .or(`email.eq.${sellerEmail || '___none___'},phone.eq.${sellerPhone || '___none___'},full_name.eq.${ownerName}`)
        .limit(1);

      if (existing?.length) {
        customerId = existing[0].id;
        // Ensure seller_id is in customer meta for auto-contract trigger
        await supabase.from('customers').update({
          meta: { seller_id: s.id, property_address: s.address_full },
        }).eq('id', customerId);
      } else {
        const { data: newCust, error: custErr } = await supabase.from('customers').insert({
          full_name: ownerName,
          email: sellerEmail || null,
          phone: sellerPhone || null,
          status: 'prospect',
          source: 'wholesale',
          category: 'other',
          meta: { seller_id: s.id, property_address: s.address_full },
        }).select('id').single();
        if (custErr) throw custErr;
        customerId = newCust.id;
      }

      // Upload agreement text to storage
      const fileName = `agreements/${crypto.randomUUID()}.txt`;
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(fileName, new Blob([agreementText], { type: 'text/plain' }));
      if (uploadErr) throw uploadErr;

      // Create document record — store agreement text in file_url for public access
      const { data: doc, error: docErr } = await supabase.from('documents').insert({
        title: `Cash Investor Purchase Agreement — ${s.address_full || 'Property'}`,
        type: 'contract',
        status: 'pending_signature',
        customer_id: customerId,
        storage_path: fileName,
        file_url: agreementText,
        category: 'other',
      }).select('id').single();
      if (docErr) throw docErr;

      const signUrl = `${window.location.origin}/sign/agreement/${doc.id}`;

      // Send email to seller with signing link via Gmail API
      if (sellerEmail) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #059669; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">Agreement Ready for Your Signature</h1>
            </div>
            <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 15px; color: #374151;">Hi ${ownerName},</p>
              <p style="font-size: 15px; color: #374151;">A Cash Investor purchase agreement for <strong>${s.address_full || 'your property'}</strong> is ready for your review and signature.</p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${signUrl}" style="background: #059669; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                  Review & Sign Agreement
                </a>
              </div>
              <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link: <br/><a href="${signUrl}" style="color: #059669;">${signUrl}</a></p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
              <p style="font-size: 12px; color: #9ca3af; text-align: center;">This is a legally binding document. Please review carefully before signing.</p>
            </div>
          </div>
        `;

        try {
          const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-api?action=send`;
          const res = await fetch(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: JSON.stringify({
              to: sellerEmail,
              subject: `Action Required: Sign Purchase Agreement — ${s.address_full || 'Property'}`,
              body: emailHtml,
            }),
          });
          if (!res.ok) throw new Error(await res.text());
          toast.success(`Agreement sent to ${sellerEmail} for signature!`, { duration: 6000 });
        } catch (emailErr: any) {
          // Fallback: copy link if email fails
          await navigator.clipboard.writeText(signUrl);
          toast.warning(`Email failed, signing link copied to clipboard instead. Error: ${emailErr.message}`, { duration: 6000 });
        }
      } else {
        // No email — fallback to clipboard
        await navigator.clipboard.writeText(signUrl);
        toast.success('No email on file. Signing link copied to clipboard — send manually.', { duration: 6000 });
      }

      setAgreementOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create signing link');
    }
    setSendingForSignature(false);
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

      const existingPhones: string[] = (s.meta as any)?.all_phones || [];
      const existingNames: string[] = (s.meta as any)?.all_names || [];
      const mergedPhones = [...new Set([...existingPhones, ...parsed.phones])];
      const mergedNames = [...new Set([...existingNames, ...cleanNames])];

      const updateData: any = {
        skip_traced_at: new Date().toISOString(),
        status: parsed.phones.length > 0 ? 'skip_traced' : s.status,
        meta: {
          ...s.meta,
          all_phones: mergedPhones,
          all_names: mergedNames,
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

  const m: any = s.meta || {};
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
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={requestRevertPipeline}
            disabled={PIPELINE_ORDER.indexOf(s.status) <= 0}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Last Stage
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={requestAdvancePipeline}
            disabled={PIPELINE_ORDER.indexOf(s.status) >= PIPELINE_ORDER.length - 1}
          >
            Next Stage
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Pipeline Stage Confirmation Dialog */}
      <AlertDialog open={!!pendingStageChange} onOpenChange={(open) => { if (!open) setPendingStageChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStageChange?.direction === 'next' ? 'Advance Pipeline Stage' : 'Revert Pipeline Stage'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Move this lead from <strong>{SELLER_STAGES.find(st => st.key === s.status)?.label || s.status}</strong> → <strong>{pendingStageChange?.targetLabel}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStageChange}>OK, Move</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              {/* Additional owner names from paste */}
              {(() => {
                const allNames: string[] = (s.meta as any)?.all_names || [];
                const shownNames = allNames.filter((n: string) => n !== s.owner_name && n !== displayTracedName);
                if (shownNames.length === 0) return null;
                return shownNames.map((n: string, i: number) => (
                  <DetailRow key={`an${i}`} label={i === 0 ? 'Also Known As' : ''} value={n} copyable gold />
                ));
              })()}
              <DetailRow label="Email" value={s.owner_email} copyable gold={isTraced && !!s.owner_email} />
              <DetailRow label="Mailing Address" value={s.owner_mailing_address} copyable gold={isTraced && !!s.owner_mailing_address} />
              {s.address_full && (
                <div className="pt-2 flex flex-wrap justify-center gap-3">
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
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(s.address_full || '');
                      toast.success('Address copied – paste it in Redfin search');
                      window.open('https://www.redfin.com/', '_blank', 'noopener');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer bg-transparent border-0 p-0"
                  >
                    🔴 Search on Redfin.com
                    <ExternalLink className="h-3 w-3" />
                   </button>
                </div>
              )}
              <div className="pt-2 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                  onClick={() => {
                    setAgreementText('');
                    setAgreementPrice(String(s.estimated_offer || s.asking_price || ''));
                    setAgreementCloseDate('');
                    setAgreementOpen(true);
                  }}
                >
                  📝 Submit Agreement
                </Button>
              </div>
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
          <DetailRow label="Property Use" value={m.propertyUse || m.landUse || null} />
          <DetailRow label="Zoning" value={s.zoning} />
          <DetailRow label="Acreage" value={s.acreage ? `${Number(s.acreage).toFixed(2)} acres` : null} />
          <DetailRow label="Lot Sqft" value={s.lot_sqft ? Number(s.lot_sqft).toLocaleString() : null} />
          <DetailRow label="Living Sqft" value={s.living_sqft ? Number(s.living_sqft).toLocaleString() : null} />
          <DetailRow label="Building Sqft" value={m.squareFeet ? Number(m.squareFeet).toLocaleString() : null} />
          <DetailRow label="Bedrooms" value={s.bedrooms} />
          <DetailRow label="Bathrooms" value={s.bathrooms} />
          <DetailRow label="Rooms" value={m.roomsCount || null} />
          <DetailRow label="Stories" value={m.stories || null} />
          <DetailRow label="Year Built" value={m.yearBuilt || null} />
          <DetailRow label="Deal Type" value={s.deal_type} />
          {m.latitude && m.longitude && (
            <DetailRow label="Coordinates" value={`${Number(m.latitude).toFixed(5)}, ${Number(m.longitude).toFixed(5)}`} copyable />
          )}
        </div>
      </div>

      <Separator />

      {/* Building Features */}
      {(m.garage || m.pool || m.basement || m.airConditioningAvailable || m.hoa || m.deck || m.patio) && (
        <>
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Building Features</h4>
            <div className="flex flex-wrap gap-1.5">
              {m.garage && <Badge variant="secondary" className="text-[10px]">🚗 Garage</Badge>}
              {m.pool && <Badge variant="secondary" className="text-[10px]">🏊 Pool</Badge>}
              {m.basement && <Badge variant="secondary" className="text-[10px]">🏠 Basement</Badge>}
              {m.airConditioningAvailable && <Badge variant="secondary" className="text-[10px]">❄️ A/C</Badge>}
              {m.hoa && <Badge variant="secondary" className="text-[10px]">🏘️ HOA</Badge>}
              {m.deck && <Badge variant="secondary" className="text-[10px]">🪵 Deck</Badge>}
              {m.patio && <Badge variant="secondary" className="text-[10px]">🌿 Patio</Badge>}
              {m.floodZone && <Badge variant="destructive" className="text-[10px]">🌊 Flood Zone</Badge>}
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Financial Info */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Financials</h4>
        <div className="divide-y divide-border">
          <DetailRow label="Estimated Value (AVM)" value={m.estimatedValue ? `$${Number(m.estimatedValue).toLocaleString()}` : null} />
          <DetailRow label="Market Value" value={s.market_value ? `$${Number(s.market_value).toLocaleString()}` : null} />
          <DetailRow label="Assessed Value" value={s.assessed_value ? `$${Number(s.assessed_value).toLocaleString()}` : null} />
          <DetailRow label="Assessed Land Value" value={m.assessedLandValue ? `$${Number(m.assessedLandValue).toLocaleString()}` : null} />
          <DetailRow label="Assessed Improvement" value={m.assessedImprovementValue ? `$${Number(m.assessedImprovementValue).toLocaleString()}` : null} />
          <DetailRow label="Asking Price" value={s.asking_price ? `$${Number(s.asking_price).toLocaleString()}` : null} />
          <DetailRow label="Estimated Offer" value={s.estimated_offer ? `$${Number(s.estimated_offer).toLocaleString()}` : null} />
          <DetailRow label="Price / Sqft" value={m.pricePerSquareFoot ? `$${Number(m.pricePerSquareFoot).toLocaleString()}` : null} />
          <DetailRow label="Estimated Equity" value={m.estimatedEquity ? `$${Number(m.estimatedEquity).toLocaleString()}` : null} />
          <DetailRow label="Equity %" value={s.equity_percent ? `${Number(s.equity_percent)}%` : null} />
          <DetailRow label="Suggested Rent" value={m.suggestedRent ? `$${Number(m.suggestedRent).toLocaleString()}/mo` : null} />
        </div>
      </div>

      <Separator />

      {/* Sale History */}
      {(m.lastSaleAmount || m.lastSaleDate || m.priorSaleAmount) && (
        <>
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sale History</h4>
            <div className="divide-y divide-border">
              <DetailRow label="Last Sale Amount" value={m.lastSaleAmount ? `$${Number(m.lastSaleAmount).toLocaleString()}` : null} />
              <DetailRow label="Last Sale Date" value={m.lastSaleDate || m.mlsLastSaleDate || null} />
              <DetailRow label="Document Type" value={m.documentType || null} />
              <DetailRow label="Prior Sale Amount" value={m.priorSaleAmount ? `$${Number(m.priorSaleAmount).toLocaleString()}` : null} />
              <DetailRow label="Prior Sale Date" value={m.priorSaleDate || null} />
              <DetailRow label="Prior Owner" value={m.priorOwner || null} />
              <DetailRow label="Arms Length" value={m.lastSaleArmsLength === true ? 'Yes' : m.lastSaleArmsLength === false ? 'No' : null} />
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Mortgage & Lending */}
      {(m.lenderName || m.openMortgageBalance !== undefined || m.lastMortgage1Amount) && (
        <>
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Mortgage & Lending</h4>
            <div className="divide-y divide-border">
              <DetailRow label="Lender" value={m.lenderName || null} />
              <DetailRow label="Open Mortgage Bal." value={m.openMortgageBalance != null && m.openMortgageBalance > 0 ? `$${Number(m.openMortgageBalance).toLocaleString()}` : m.openMortgageBalance === 0 ? '$0 (Free & Clear)' : null} />
              <DetailRow label="Last Mortgage Amount" value={m.lastMortgage1Amount ? `$${Number(m.lastMortgage1Amount).toLocaleString()}` : null} />
              <DetailRow label="Free & Clear" value={s.free_and_clear ? 'Yes ✅' : s.free_and_clear === false ? 'No' : null} />
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Owner Portfolio */}
      {(m.totalPropertiesOwned || m.totalPortfolioValue) && (
        <>
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Owner Portfolio</h4>
            <div className="divide-y divide-border">
              <DetailRow label="Properties Owned" value={m.totalPropertiesOwned || null} />
              <DetailRow label="Portfolio Value" value={m.totalPortfolioValue ? `$${Number(m.totalPortfolioValue).toLocaleString()}` : null} />
              <DetailRow label="Portfolio Equity" value={m.totalPortfolioEquity ? `$${Number(m.totalPortfolioEquity).toLocaleString()}` : null} />
              <DetailRow label="Investor Buyer" value={m.investorBuyer === true ? 'Yes' : m.investorBuyer === false ? 'No' : null} />
              <DetailRow label="Cash Buyer" value={m.cashBuyer === true ? 'Yes' : m.cashBuyer === false ? 'No' : null} />
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Listing Status */}
      {(m.mlsActive || m.forSale || m.listingAmount) && (
        <>
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Listing Status</h4>
            <div className="divide-y divide-border">
              <DetailRow label="For Sale" value={m.forSale === true ? 'Yes' : m.forSale === false ? 'No' : null} />
              <DetailRow label="MLS Active" value={m.mlsActive === true ? 'Yes' : m.mlsActive === false ? 'No' : null} />
              <DetailRow label="Listing Price" value={m.listingAmount ? `$${Number(m.listingAmount).toLocaleString()}` : null} />
              <DetailRow label="MLS Status" value={
                m.mlsPending ? 'Pending' : m.mlsSold ? 'Sold' : m.mlsCancelled ? 'Cancelled' : m.mlsFailed ? 'Failed' : null
              } />
            </div>
          </div>
          <Separator />
        </>
      )}

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
          <DetailRow label="Last REAPI Update" value={m.lastUpdateDate || null} />
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
            <Button size="sm" variant="outline" onClick={async () => {
              await supabase.from('lw_sellers').update({ status: 'req_trace' }).eq('id', s.id);
              toast.success('Moved to Req. Trace pipeline');
              onSkipTraced?.();
            }}>
              Re-trace
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
            <button
              onClick={() => {
                navigator.clipboard.writeText(s.address_full || s.property_address || '');
                toast.success('Address copied to clipboard');
                setLookupIframeUrl(`https://www.truepeoplesearch.com/results?name=${encodeURIComponent(s.owner_name || '')}&citystatezip=${encodeURIComponent([s.city, s.state].filter(Boolean).join(', '))}`);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
            >
              <span>📞</span>
              <span className="flex-1">TruePeopleSearch</span>
              <span className="text-[10px] text-muted-foreground">Phone · Address · Relatives</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(s.address_full || s.property_address || '');
                toast.success('Address copied to clipboard');
                setLookupIframeUrl('https://www.cyberbackgroundchecks.com/');
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
            >
              <span>🔍</span>
              <span className="flex-1">CyberBackgroundChecks</span>
              <span className="text-[10px] text-muted-foreground">Background · Address · Phone</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(s.address_full || s.property_address || '');
                toast.success('Address copied to clipboard');
                setLookupIframeUrl('https://www.fastpeoplesearch.com/');
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
            >
              <span>⚡</span>
              <span className="flex-1">FastPeopleSearch</span>
              <span className="text-[10px] text-muted-foreground">Phone · Address · Relatives</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* Agreement Generator Modal */}
      <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">📝 Wholesale Purchase Agreement</DialogTitle>
            <DialogDescription className="text-xs">
              Generate a wholesale contract for {s.address_full || 'this property'}. Includes assignability clause and contingency back-out period.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Your Name (Buyer)</Label>
                <Input
                  placeholder="e.g. Warren Smith"
                  value={agreementBuyerName}
                  onChange={e => setAgreementBuyerName(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Company Name</Label>
                <Input
                  placeholder="e.g. Smith Holdings LLC"
                  value={agreementCompanyName}
                  onChange={e => setAgreementCompanyName(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Agreed Purchase Price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 25000"
                  value={agreementPrice}
                  onChange={e => setAgreementPrice(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Closing Date</Label>
                <Input
                  type="date"
                  value={agreementCloseDate}
                  onChange={e => setAgreementCloseDate(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Back-Out / Contingency (days)</Label>
                <Input
                  type="number"
                  min="7"
                  max="120"
                  value={agreementDuration}
                  onChange={e => setAgreementDuration(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  onClick={generateAgreement}
                  disabled={generatingAgreement || !agreementPrice || !agreementBuyerName.trim()}
                  className="w-full"
                >
                  {generatingAgreement ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating…</> : 'Generate Agreement'}
                </Button>
              </div>
            </div>

            {agreementText && (
              <>
                <div className="rounded-md border border-border bg-muted/30 p-4 max-h-[50vh] overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground">{agreementText}</pre>
                </div>
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(agreementText);
                      toast.success('Agreement copied to clipboard');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDraftEmail}
                      disabled={draftingEmail}
                      className="gap-1.5"
                    >
                      {draftingEmail ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving…</> : '✉️ Draft Email'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSendForSignature}
                      disabled={sendingForSignature}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {sendingForSignature ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Creating…</> : '✍️ Send for Signature'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Lookup iframe popup */}
      <Dialog open={!!lookupIframeUrl} onOpenChange={(o) => { if (!o) setLookupIframeUrl(null); }}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 rounded-3xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
            <span className="text-xs text-muted-foreground truncate">{lookupIframeUrl}</span>
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setLookupIframeUrl(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <iframe
            src={lookupIframeUrl || ''}
            className="w-full flex-1 border-0"
            style={{ height: 'calc(85vh - 40px)' }}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            title="Lookup"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
