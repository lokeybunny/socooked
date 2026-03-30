import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Phone, Clock, BarChart3, Loader2, RefreshCw, CheckCircle, XCircle, Globe, Filter, Wallet } from 'lucide-react';

interface VapiCallRecord {
  id: string;
  type: string;
  status: string;
  customerNumber: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  cost: number;
  transportCost: number;
  modelCost: number;
  transcriptionCost: number;
  voiceCost: number;
  analysisCost: number;
  endedReason: string | null;
  landingPageName: string | null;
  landingPageSlug: string | null;
  leadName: string | null;
}

interface VapiSummary {
  totalCost: number;
  totalCalls: number;
  completedCalls: number;
  totalDurationMin: number;
  avgCostPerCall: number;
}

interface TwilioBalance {
  balance: number;
  currency: string;
}

interface PageBreakdown {
  name: string;
  slug: string;
  totalCost: number;
  callCount: number;
}

export default function VapiSpendDashboard() {
  const [summary, setSummary] = useState<VapiSummary | null>(null);
  const [calls, setCalls] = useState<VapiCallRecord[]>([]);
  const [pageBreakdown, setPageBreakdown] = useState<PageBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageFilter, setPageFilter] = useState<string>('all');
  const [twilioBalance, setTwilioBalance] = useState<TwilioBalance | null>(null);
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke('vapi-usage');
      if (res.error) throw res.error;
      setSummary(res.data.summary);
      setCalls(res.data.calls || []);
      setPageBreakdown(res.data.pageBreakdown || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load Vapi usage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredCalls = pageFilter === 'all'
    ? calls
    : pageFilter === '__unmatched__'
      ? calls.filter(c => !c.landingPageSlug)
      : calls.filter(c => c.landingPageSlug === pageFilter);

  const filteredSummary: VapiSummary = pageFilter === 'all' && summary
    ? summary
    : {
        totalCost: Math.round(filteredCalls.reduce((s, c) => s + c.cost, 0) * 100) / 100,
        totalCalls: filteredCalls.length,
        completedCalls: filteredCalls.filter(c =>
          c.status === 'ended' || c.endedReason === 'assistant-forward' || c.endedReason === 'customer-ended-call' || c.endedReason === 'assistant-ended-call'
        ).length,
        totalDurationMin: Math.round(filteredCalls.reduce((s, c) => s + c.durationSec, 0) / 60 * 10) / 10,
        avgCostPerCall: filteredCalls.length > 0
          ? Math.round(filteredCalls.reduce((s, c) => s + c.cost, 0) / filteredCalls.length * 100) / 100
          : 0,
      };

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  const formatCost = (val: number) => `$${val.toFixed(4)}`;

  const endedReasonLabel = (reason: string | null) => {
    if (!reason) return '—';
    return reason.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-destructive opacity-70" />
          <p className="text-destructive font-medium">Failed to load Vapi spend</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={loadData}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const uniquePages = pageBreakdown.filter(p => p.slug !== '__unmatched__');
  const hasUnmatched = pageBreakdown.some(p => p.slug === '__unmatched__');

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Landing Page:</span>
        </div>
        <Select value={pageFilter} onValueChange={setPageFilter}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="All Landing Pages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Landing Pages</SelectItem>
            {uniquePages.map(p => (
              <SelectItem key={p.slug} value={p.slug}>
                {p.name} ({p.callCount} calls · ${p.totalCost.toFixed(2)})
              </SelectItem>
            ))}
            {hasUnmatched && (
              <SelectItem value="__unmatched__">
                Unmatched ({pageBreakdown.find(p => p.slug === '__unmatched__')?.callCount || 0} calls)
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {pageFilter !== 'all' && (
          <Button size="sm" variant="ghost" onClick={() => setPageFilter('all')}>
            Clear filter
          </Button>
        )}
      </div>

      {/* Per-Page Breakdown Cards */}
      {pageFilter === 'all' && uniquePages.length > 1 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {uniquePages.map(p => (
            <Card
              key={p.slug}
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setPageFilter(p.slug)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium truncate">{p.name}</p>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-primary">${p.totalCost.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">{p.callCount} calls</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={DollarSign} label="Total Spend" value={`$${(filteredSummary.totalCost ?? 0).toFixed(2)}`} accent />
        <SummaryCard icon={Phone} label="Total Calls" value={filteredSummary.totalCalls ?? 0} />
        <SummaryCard icon={CheckCircle} label="Completed" value={filteredSummary.completedCalls ?? 0} />
        <SummaryCard icon={Clock} label="Total Minutes" value={`${(filteredSummary.totalDurationMin ?? 0).toFixed(1)}`} />
        <SummaryCard icon={BarChart3} label="Avg Cost / Call" value={`$${(filteredSummary.avgCostPerCall ?? 0).toFixed(2)}`} />
      </div>

      {/* Call Log Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Call Log
            <Badge variant="outline" className="ml-auto">{filteredCalls.length} calls</Badge>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={loadData}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCalls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No Vapi calls found{pageFilter !== 'all' ? ' for this landing page' : ''}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Landing Page</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Transport</TableHead>
                    <TableHead className="text-right">Model</TableHead>
                    <TableHead className="text-right">Voice</TableHead>
                    <TableHead className="text-right">Transcription</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalls.map(call => (
                    <TableRow key={call.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {call.startedAt ? new Date(call.startedAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        {call.landingPageName ? (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Globe className="h-2.5 w-2.5" />
                            {call.landingPageName}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {call.leadName || '—'}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {call.customerNumber || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDuration(call.durationSec)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {endedReasonLabel(call.endedReason)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatCost(call.transportCost)}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatCost(call.modelCost)}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatCost(call.voiceCost)}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatCost(call.transcriptionCost)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold font-mono">
                        {formatCost(call.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={accent ? 'border-primary/30' : ''}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${accent ? 'bg-primary/15' : 'bg-muted'}`}>
          <Icon className={`h-4 w-4 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={`text-lg font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
