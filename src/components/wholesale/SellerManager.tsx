import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Search, MapPin, Download, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Info, TreePine, Home } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const SELLER_STAGES = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'skip_traced', label: 'Skip Traced' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'offer_sent', label: 'Offer Sent' },
  { key: 'under_contract', label: 'Under Contract' },
  { key: 'closed', label: 'Closed' },
  { key: 'dead', label: 'Dead' },
];

const SELLER_STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-500',
  skip_traced: 'bg-cyan-500/10 text-cyan-500',
  contacted: 'bg-purple-500/10 text-purple-500',
  offer_sent: 'bg-amber-500/10 text-amber-500',
  under_contract: 'bg-emerald-500/10 text-emerald-500',
  closed: 'bg-muted text-muted-foreground',
  dead: 'bg-destructive/10 text-destructive',
};

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
            className="text-xs whitespace-nowrap"
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
            Fetch Seller Leads (REAPI)
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
                          ? <TreePine className="h-4 w-4 text-emerald-500 mx-auto" title="Land" />
                          : <Home className="h-4 w-4 text-blue-500 mx-auto" title="Home" />
                        }
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{s.owner_name || '—'}</span>
                          {s.owner_phone && <span className="text-xs text-muted-foreground block">{s.owner_phone}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{s.address_full || '—'}</TableCell>
                      <TableCell className="text-sm">{s.county || '—'}</TableCell>
                      <TableCell className="text-sm">{s.state || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{s.acreage ? Number(s.acreage).toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-center">
                        {(s.deal_type || 'land') === 'land'
                          ? <TreePine className="h-4 w-4 text-emerald-500 mx-auto" title="Land" />
                          : <Home className="h-4 w-4 text-blue-500 mx-auto" title="Home" />
                        }
                      </TableCell>
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
                        <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
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
          {detailSeller && <SellerDetailContent seller={detailSeller} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] break-words">{value}</span>
    </div>
  );
}

function SellerDetailContent({ seller: s }: { seller: any }) {
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
      {/* Owner Info */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Owner Information</h4>
        <div className="divide-y divide-border">
          <DetailRow label="Name" value={s.owner_name} />
          <DetailRow label="Phone" value={s.owner_phone} />
          <DetailRow label="Email" value={s.owner_email} />
          <DetailRow label="Mailing Address" value={s.owner_mailing_address} />
        </div>
      </div>

      <Separator />

      {/* Property Info */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Property Details</h4>
        <div className="divide-y divide-border">
          <DetailRow label="Address" value={s.address_full} />
          <DetailRow label="City" value={s.city} />
          <DetailRow label="County" value={s.county} />
          <DetailRow label="State" value={s.state} />
          <DetailRow label="ZIP" value={s.zip} />
          <DetailRow label="APN" value={s.apn} />
          <DetailRow label="FIPS" value={s.fips} />
          <DetailRow label="Property Type" value={s.property_type} />
          <DetailRow label="Zoning" value={s.zoning} />
          <DetailRow label="Acreage" value={s.acreage ? `${Number(s.acreage).toFixed(2)} acres` : null} />
          <DetailRow label="Lot Sqft" value={s.lot_sqft ? Number(s.lot_sqft).toLocaleString() : null} />
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
          <DetailRow label="Status" value={<Badge variant="outline" className="text-[10px]">{s.status}</Badge>} />
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
    </div>
  );
}
