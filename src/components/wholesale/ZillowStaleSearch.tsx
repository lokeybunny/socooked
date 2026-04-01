import { useState, useRef, useEffect } from 'react';
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
import { Loader2, Clock, Search } from 'lucide-react';
import { toast } from 'sonner';

const HOME_TYPE_OPTIONS = [
  { value: 'SINGLE_FAMILY', label: 'Single Family' },
  { value: 'CONDO', label: 'Condo' },
  { value: 'TOWNHOUSE', label: 'Townhouse' },
  { value: 'MULTI_FAMILY', label: 'Multi-Family' },
];

interface ZillowStaleSearchProps {
  onSyncComplete?: () => void;
}

export default function ZillowStaleSearch({ onSyncComplete }: ZillowStaleSearchProps) {
  const [zipInput, setZipInput] = useState('');
  const [minDays, setMinDays] = useState(30);
  const [maxListings, setMaxListings] = useState(50);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [homeTypes, setHomeTypes] = useState<string[]>(['SINGLE_FAMILY']);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
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
            setStatusText(`Found ${pollData.totalFound} leads, stored ${pollData.stored}`);
            toast.success(`Found ${pollData.totalFound} warm wholesale leads!`);
            onSyncComplete?.();
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


  return (
    <div className="space-y-4">
      {/* Info sidebar */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-3 flex items-start gap-2">
          <Search className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Stale Zillow Leads</span> — Scraped leads are automatically synced into the seller pipeline below with full feature parity.
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
    </div>
  );
}
