import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, Phone, MessageSquare, Loader2, RefreshCw, XCircle, Wallet } from 'lucide-react';

interface TwilioData {
  balance: number;
  currency: string;
  accountSid: string;
  monthlyUsage: {
    calls: { cost: number; count: number; minutes: number };
    sms: { cost: number; count: number };
    totalCost: number;
  };
  period: { start: string; end: string };
}

export default function TwilioSpendDashboard() {
  const [data, setData] = useState<TwilioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke('twilio-balance');
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Twilio data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

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
          <p className="text-destructive font-medium">Failed to load Twilio data</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={loadData}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const balanceLow = data.balance < 10;

  return (
    <div className="space-y-4">
      {/* Balance Hero */}
      <Card className={balanceLow ? 'border-destructive/40' : 'border-primary/30'}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${balanceLow ? 'bg-destructive/15' : 'bg-primary/15'}`}>
                <Wallet className={`h-6 w-6 ${balanceLow ? 'text-destructive' : 'text-primary'}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Twilio Account Balance</p>
                <p className={`text-3xl font-bold ${balanceLow ? 'text-destructive' : 'text-primary'}`}>
                  ${data.balance.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.currency} · {data.accountSid.slice(0, 6)}...{data.accountSid.slice(-4)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {balanceLow && (
                <Badge variant="destructive" className="text-xs">Low Balance</Badge>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={loadData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Usage Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={DollarSign} label="Month Spend" value={`$${data.monthlyUsage.totalCost.toFixed(2)}`} accent />
        <SummaryCard icon={Phone} label="Calls" value={data.monthlyUsage.calls.count} />
        <SummaryCard icon={Phone} label="Call Cost" value={`$${data.monthlyUsage.calls.cost.toFixed(2)}`} />
        <SummaryCard icon={MessageSquare} label="SMS Sent" value={data.monthlyUsage.sms.count} />
        <SummaryCard icon={MessageSquare} label="SMS Cost" value={`$${data.monthlyUsage.sms.cost.toFixed(2)}`} />
      </div>

      {/* Period Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Monthly Usage Summary
            <Badge variant="outline" className="ml-auto text-xs">
              {data.period.start} → {data.period.end}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Phone className="h-4 w-4 text-primary" />
                Voice Calls
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-foreground">{data.monthlyUsage.calls.count}</p>
                  <p className="text-[10px] text-muted-foreground">Total Calls</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{data.monthlyUsage.calls.minutes}</p>
                  <p className="text-[10px] text-muted-foreground">Minutes</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">${data.monthlyUsage.calls.cost.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">Cost</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="h-4 w-4 text-primary" />
                SMS Messages
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-foreground">{data.monthlyUsage.sms.count}</p>
                  <p className="text-[10px] text-muted-foreground">Messages</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">${data.monthlyUsage.sms.cost.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">Cost</p>
                </div>
              </div>
            </div>
          </div>
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
