import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, ExternalLink, Phone, FileSpreadsheet, Flag, AlertTriangle, Clock, TrendingDown, Search, Info } from 'lucide-react';
import { toast } from 'sonner';

const HOME_TYPE_OPTIONS = [
  { value: 'SINGLE_FAMILY', label: 'Single Family' },
  { value: 'CONDO', label: 'Condo' },
  { value: 'TOWNHOUSE', label: 'Townhouse' },
  { value: 'MULTI_FAMILY', label: 'Multi-Family' },
];

export default function ZillowStaleSearch() {
  const [zipInput, setZipInput] = useState('');
  const [minDays, setMinDays] = useState(30);
  const [maxListings, setMaxListings] = useState(50);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [homeTypes, setHomeTypes] = useState<string[]>(['SINGLE_FAMILY']);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleHomeType = (type: string) => {
    setHomeTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const parseZips = (): string[] => {
    return zipInput
      .split(/[,\n\s]+/)
      .map(z => z.trim())
      .filter(z => /^\d{5}$/.test(z));
  };

  const runScrape = async () => {
    const zips = parseZips();
    if (zips.length === 0) {
      toast.error('Enter at least one valid 5-digit ZIP code');
      return;
    }
    if (homeTypes.length === 0) {
      toast.error('Select at least one home type');
      return;
    }

    setRunning(true);
    setProgress(10);
    setStatusText('Starting Apify actor...');
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('zillow-stale-search', {
        body: {
          action: 'start',
          zipCodes: zips,
          minDaysOnMarket: minDays,
          maxListingsPerZip: maxListings,
          ...(minPrice ? { minPrice: Number(minPrice) } : {}),
          ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}),
          homeTypes,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const runId = data.runId;
      setProgress(20);
      setStatusText('Scraping Zillow... This may take 1-5 minutes.');

      // Poll for results
      let attempts = 0;
      const maxAttempts = 120; // 10 min max

      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(pollRef.current!);
          setRunning(false);
          setStatusText('Timeout — try again with fewer ZIPs');
          toast.error('Scrape timed out');
          return;
        }

        setProgress(Math.min(20 + Math.floor((attempts / maxAttempts) * 70), 90));

        try {
          const { data: pollData, error: pollErr } = await supabase.functions.invoke('zillow-stale-search', {
            body: { action: 'poll', runId },
          });

          if (pollErr) return; // retry

          if (pollData?.status === 'SUCCEEDED') {
            clearInterval(pollRef.current!);
            setProgress(100);
            setTotalFound(pollData.totalFound || 0);
            setStatusText(`Found ${pollData.totalFound} leads, stored ${pollData.stored}`);
            toast.success(`Found ${pollData.totalFound} warm wholesale leads!`);
            // Load results from DB
            await loadResults();
            setRunning(false);
          } else if (pollData?.status === 'FAILED' || pollData?.status === 'ABORTED' || pollData?.status === 'TIMED-OUT') {
            clearInterval(pollRef.current!);
            setRunning(false);
            setStatusText(`Run ${pollData.status}`);
            toast.error(`Apify run ${pollData.status}`);
          } else {
            setStatusText(`Status: ${pollData?.status || 'RUNNING'}...`);
          }
        } catch {
          // Silently retry
        }
      }, 5000);
    } catch (err: any) {
      setRunning(false);
      setStatusText('');
      toast.error(err.message || 'Failed to start scrape');
    }
  };

  const loadResults = async () => {
    const { data, error } = await supabase.functions.invoke('zillow-stale-search', {
      body: { action: 'list', page: 1, pageSize: 200, sortBy: 'days_on_zillow', sortAsc: false },
    });
    if (!error && data?.data) {
      setResults(data.data);
      setTotalFound(data.total || data.data.length);
    }
  };

  const exportCsv = () => {
    if (!results.length) return;
    const headers = ['Address', 'City', 'State', 'ZIP', 'Price', 'Days on Zillow', 'Price Drops', 'Total Drop %', 'Agent', 'Agent Phone', 'Brokerage', 'Beds', 'Baths', 'SqFt', 'Zestimate', 'Zillow URL', 'Flagged'];
    const rows = results.map(r => [
      r.address, r.city, r.state, r.zip, r.listed_price || '', r.days_on_zillow || '',
      r.price_drop_count || 0, r.total_price_drop_percent || '', r.agent_name || '',
      r.agent_phone || '', r.brokerage || '', r.bedrooms || '', r.bathrooms || '',
      r.sqft || '', r.zestimate || '', r.zillow_url || '', r.flagged ? 'YES' : '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zillow_stale_leads_${results.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${results.length} leads to CSV`);
  };

  const priceDrpSummary = (lead: any) => {
    const cnt = lead.price_drop_count || 0;
    const pct = lead.total_price_drop_percent;
    if (!cnt && !pct) return '—';
    const parts = [];
    if (cnt > 0) parts.push(`${cnt} cut${cnt > 1 ? 's' : ''}`);
    if (pct) parts.push(`-${pct}%`);
    return parts.join(' • ');
  };

  return (
    <div className="space-y-4">
      {/* Info sidebar */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Stale Zillow Leads</span> — These are warmer than fresh RealtorAPI data because sellers have been on market 30–180+ days and are far more motivated to accept cash wholesale offers.
          </p>
        </CardContent>
      </Card>

      {/* Input Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-4 w-4" />
            ZillowPulse — Stale Listing Finder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">ZIP Codes *</Label>
              <Textarea
                placeholder="Enter ZIP codes (comma or newline separated)&#10;e.g. 85001, 85003, 85004"
                value={zipInput}
                onChange={e => setZipInput(e.target.value)}
                className="min-h-[80px] text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground">{parseZips().length} valid ZIP{parseZips().length !== 1 ? 's' : ''} detected</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Min Days on Market: {minDays}</Label>
                <Slider
                  value={[minDays]}
                  onValueChange={([v]) => setMinDays(v)}
                  min={20}
                  max={180}
                  step={5}
                />
                <p className="text-[10px] text-muted-foreground">Higher = more motivated sellers</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Max Listings per ZIP</Label>
                <Input
                  type="number"
                  value={maxListings}
                  onChange={e => setMaxListings(Number(e.target.value))}
                  className="h-8 w-24 text-sm"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Home Types</Label>
              <div className="flex flex-wrap gap-3">
                {HOME_TYPE_OPTIONS.map(ht => (
                  <label key={ht.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={homeTypes.includes(ht.value)}
                      onCheckedChange={() => toggleHomeType(ht.value)}
                    />
                    {ht.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Min Price</Label>
                <Input type="number" placeholder="$" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="h-8 w-28 text-sm" />
              </div>
              <span className="text-muted-foreground mt-5">–</span>
              <div className="space-y-1">
                <Label className="text-xs">Max Price</Label>
                <Input type="number" placeholder="$" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="h-8 w-28 text-sm" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={runScrape} disabled={running} className="gap-2">
              {running ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
              ) : (
                <><Search className="h-4 w-4" /> Run Scrape Now</>
              )}
            </Button>

            {results.length > 0 && (
              <Button variant="outline" onClick={exportCsv} className="gap-1.5">
                <FileSpreadsheet className="h-4 w-4" /> Export CSV ({results.length})
              </Button>
            )}

            {!running && (
              <Button variant="ghost" size="sm" onClick={loadResults} className="text-xs gap-1.5">
                <Download className="h-3 w-3" /> Refresh Results
              </Button>
            )}
          </div>

          {running && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> {statusText}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-500" />
              Stale Leads
              <Badge variant="outline" className="ml-2">{totalFound} total</Badge>
              <Badge variant="secondary" className="text-amber-600">
                {results.filter(r => r.flagged).length} flagged
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Days on Zillow</TableHead>
                    <TableHead>Price Drops</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Brokerage</TableHead>
                    <TableHead>Beds/Baths/SqFt</TableHead>
                    <TableHead>Zestimate</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(lead => (
                    <TableRow key={lead.id} className={`bg-purple-400/10 ${lead.flagged ? 'bg-purple-400/20' : ''}`}>
                      <TableCell>
                        {lead.flagged && (
                          <Flag className="h-3.5 w-3.5 text-amber-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        <div>{lead.address}</div>
                        <div className="text-[10px] text-muted-foreground">{lead.city}, {lead.state} {lead.zip}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {lead.listed_price ? `$${Number(lead.listed_price).toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono text-sm font-semibold ${(lead.days_on_zillow || 0) > 45 ? 'text-destructive' : (lead.days_on_zillow || 0) > 30 ? 'text-amber-500' : 'text-foreground'}`}>
                          {lead.days_on_zillow || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {priceDrpSummary(lead) !== '—' ? (
                          <span className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            {priceDrpSummary(lead)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{lead.agent_name || '—'}</div>
                        {lead.agent_phone && (
                          <a href={`tel:${lead.agent_phone}`} className="text-primary flex items-center gap-1 hover:underline">
                            <Phone className="h-3 w-3" /> {lead.agent_phone}
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.brokerage || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {[lead.bedrooms && `${lead.bedrooms}bd`, lead.bathrooms && `${lead.bathrooms}ba`, lead.sqft && `${Number(lead.sqft).toLocaleString()}sf`].filter(Boolean).join(' / ') || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {lead.zestimate ? `$${Number(lead.zestimate).toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell>
                        {lead.zillow_url && (
                          <a href={lead.zillow_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-[10px] text-muted-foreground mt-4">For personal/business use only — respect Zillow ToS.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
