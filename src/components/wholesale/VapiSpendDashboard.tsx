import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Phone, Clock, BarChart3, Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

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
}

interface VapiSummary {
  totalCost: number;
  totalCalls: number;
  completedCalls: number;
  totalDurationMin: number;
  avgCostPerCall: number;
}

export default function VapiSpendDashboard() {
  const [summary, setSummary] = useState<VapiSummary | null>(null);
  const [calls, setCalls] = useState<VapiCallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke('vapi-usage');
      if (res.error) throw res.error;
      setSummary(res.data.summary);
      setCalls(res.data.calls || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load Vapi usage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

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

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={DollarSign} label="Total Spend" value={`$${(summary?.totalCost ?? 0).toFixed(2)}`} accent />
        <SummaryCard icon={Phone} label="Total Calls" value={summary?.totalCalls ?? 0} />
        <SummaryCard icon={CheckCircle} label="Completed" value={summary?.completedCalls ?? 0} />
        <SummaryCard icon={Clock} label="Total Minutes" value={`${(summary?.totalDurationMin ?? 0).toFixed(1)}`} />
        <SummaryCard icon={BarChart3} label="Avg Cost / Call" value={`$${(summary?.avgCostPerCall ?? 0).toFixed(2)}`} />
      </div>

      {/* Call Log Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Call Log
            <Badge variant="outline" className="ml-auto">{calls.length} calls</Badge>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={loadData}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No Vapi calls found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
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
                  {calls.map(call => (
                    <TableRow key={call.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {call.startedAt ? new Date(call.startedAt).toLocaleString() : '—'}
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
