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
import { Search, MapPin, Download, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Info, TreePine, Home, ExternalLink, Copy, ClipboardPaste, ChevronDown, ChevronUp, Phone } from 'lucide-react';
import { toast } from 'sonner';

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
  const names: string[] = [];

  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const nameLineRegex = /(?:^|\n)\s*(?:name\s*[:\-]\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gm;

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

  const nameMatches = [...raw.matchAll(nameLineRegex)];
  nameMatches.forEach(m => {
    const name = m[1].trim();
    if (isHumanName(name) && !names.includes(name)) names.push(name);
  });

  return { phones, emails, names, bestName: pickBestName(names) };
}

export default function SellerManager() {
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [dealTypeFilter, setDealTypeFilter] = useState('all');
  const [sortField, setSortField] = useState('motivation_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  // Fetch form
  const [fetchCounty, setFetchCounty] = useState('');
  const [fetchState, setFetchState] = useState('');
  const [fetchDealType, setFetchDealType] = useState('land');
  const [fetchSize, setFetchSize] = useState('50');
  const [detailSeller, setDetailSeller] = useState<any>(null);

  useEffect(() => { loadSellers(); }, []);

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
      const { data, error } = await supabase.functions.invoke('land-reapi-search', {
        body: {
          county: fetchCounty.trim(),
          state: fetchState.trim().toUpperCase(),
          deal_type: fetchDealType,
          size: Number(fetchSize) || 50,
        },
      });
      if (error) throw error;
      toast.success(`Fetched ${data?.records_fetched || 0} properties, ${data?.records_new || 0} new`);
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
    list.sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [sellers, stateFilter, stageFilter, dealTypeFilter, search, sortField, sortAsc]);

  useEffect(() => { setPage(1); }, [stateFilter, stageFilter, dealTypeFilter, search, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
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
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">County *</Label>
              <Input
                placeholder="e.g. Maricopa"
                value={fetchCounty}
                onChange={e => setFetchCounty(e.target.value)}
                className="w-[160px] h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">State *</Label>
              <Input
                placeholder="e.g. AZ"
                value={fetchState}
                onChange={e => setFetchState(e.target.value)}
                className="w-[80px] h-9"
              />
            </div>
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
              <Input
                type="number"
                value={fetchSize}
                onChange={e => setFetchSize(e.target.value)}
                className="w-[80px] h-9"
              />
            </div>
            <Button onClick={fetchProperties} disabled={fetching} className="h-9">
              {fetching ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Fetching…</> : <><Download className="h-3.5 w-3.5 mr-1" /> Fetch Properties</>}
            </Button>
          </div>
        </CardContent>
      </Card>

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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {detailSeller?.owner_name || 'Unknown Owner'}
            </DialogTitle>
          </DialogHeader>
          {detailSeller && <SellerDetailContent seller={detailSeller} onSkipTraced={() => { setDetailSeller(null); loadSellers(); }} />}
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

function SellerDetailContent({ seller: s, onSkipTraced }: { seller: any; onSkipTraced?: () => void }) {
  const [tracing, setTracing] = useState(false);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [parsing, setParsing] = useState(false);

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

      const updateData: any = {
        skip_traced_at: new Date().toISOString(),
        status: parsed.phones.length > 0 ? 'skip_traced' : s.status,
        meta: {
          ...s.meta,
          clipboard_trace: {
            phones: parsed.phones,
            emails: parsed.emails,
            names: parsed.names,
            bestName: parsed.bestName,
            traced_at: new Date().toISOString(),
          },
        },
      };

      if (parsed.phones.length > 0) updateData.owner_phone = parsed.phones[0];
      if (parsed.emails.length > 0) updateData.owner_email = parsed.emails[0];
      // Update owner_name if we found a best human name and current name looks like a business
      if (parsed.bestName && !isHumanName(s.owner_name || '')) {
        updateData.owner_name = parsed.bestName;
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
      {/* Top action bar — Trace Clipboard */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setClipboardOpen(true)}>
          <ClipboardPaste className="h-3.5 w-3.5" />
          Trace Clipboard
        </Button>
      </div>

      {/* Owner Info */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Owner Information</h4>
        {(() => {
          const isTraced = !!s.skip_traced_at;
          const traceResult = s.meta?.skip_trace_result;
          const rawTracedName = traceResult?.name || traceResult?.fullName
            || (traceResult?.firstName && traceResult?.lastName ? `${traceResult.firstName} ${traceResult.lastName}` : null);
          const tracedName = rawTracedName && isHumanName(rawTracedName) ? rawTracedName : null;
          // Only show the single best name from clipboard trace
          const clipBestName = s.meta?.clipboard_trace?.bestName as string | undefined;
          const bestClipName = clipBestName && isHumanName(clipBestName) ? clipBestName : null;
          // Pick the one best traced name to show
          const displayTracedName = tracedName || bestClipName;
          return (
            <div className="divide-y divide-border">
              <DetailRow label="Name" value={s.owner_name} />
              {displayTracedName && displayTracedName !== s.owner_name && (
                <DetailRow label="Traced Name" value={displayTracedName} copyable gold />
              )}
              <PhoneRow seller={s} />
              <DetailRow label="Email" value={s.owner_email} copyable gold={isTraced && !!s.owner_email} />
              <DetailRow label="Mailing Address" value={s.owner_mailing_address} copyable gold={isTraced && !!s.owner_mailing_address} />
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

      {/* Notes */}
      {s.notes && (
        <>
          <Separator />
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Notes</h4>
            <p className="text-sm whitespace-pre-wrap">{s.notes}</p>
          </div>
        </>
      )}

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
