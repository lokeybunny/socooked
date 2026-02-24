import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, RefreshCw, AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreditInfo {
  name: string;
  balance: string | null;
  unit: string;
  status: 'ok' | 'low' | 'error' | 'unknown';
  details?: string;
}

export default function Credits() {
  const [credits, setCredits] = useState<CreditInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not authenticated'); setLoading(false); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-credits`,
        { headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
      );
      const json = await res.json();
      if (json.success) {
        setCredits(json.data);
      } else {
        setError(json.error || 'Failed to fetch credits');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCredits(); }, []);

  const statusIcon = (status: CreditInfo['status']) => {
    switch (status) {
      case 'ok': return <CheckCircle2 className="h-5 w-5 text-primary" />;
      case 'low': return <AlertTriangle className="h-5 w-5 text-warning" />;
      case 'error': return <XCircle className="h-5 w-5 text-destructive" />;
      default: return <HelpCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const statusBg = (status: CreditInfo['status']) => {
    switch (status) {
      case 'ok': return 'border-primary/20 bg-primary/5';
      case 'low': return 'border-warning/20 bg-warning/5';
      case 'error': return 'border-destructive/20 bg-destructive/5';
      default: return 'border-border bg-muted/30';
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">API Credits</h1>
          </div>
          <button
            onClick={fetchCredits}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Overview of all external API integrations and their remaining balances.
        </p>

        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        {loading && credits.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {credits.map((c) => (
              <div
                key={c.name}
                className={cn(
                  "rounded-xl border p-5 transition-colors",
                  statusBg(c.status)
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium text-foreground">{c.name}</h3>
                  {statusIcon(c.status)}
                </div>
                <div className="space-y-1">
                  {c.balance ? (
                    <p className="text-2xl font-bold text-foreground">{c.balance}</p>
                  ) : (
                    <p className="text-lg text-muted-foreground">—</p>
                  )}
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.unit}</p>
                </div>
                {c.details && (
                  <p className="mt-3 text-xs text-muted-foreground">{c.details}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
