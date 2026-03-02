import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, RefreshCw, Shield, ShieldAlert, ShieldCheck, TrendingUp, ExternalLink, Copy, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface MarketCapAlert {
  id: string;
  ca_address: string;
  token_name: string | null;
  token_symbol: string | null;
  milestone: string;
  milestone_value: number;
  raw_message: string | null;
  source_url: string | null;
  is_j7tracker: boolean;
  audit_status: string;
  audit_data: any;
  verdict: string | null;
  created_at: string;
}

const MILESTONE_COLORS: Record<string, string> = {
  '30k': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  '40k': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  '50k': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  '60k': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  '70k': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  '80k': 'bg-red-500/15 text-red-400 border-red-500/30',
  '90k': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  '100k+': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const VERDICT_CONFIG: Record<string, { icon: typeof ShieldCheck; color: string; label: string }> = {
  green: { icon: ShieldCheck, color: 'text-emerald-400', label: 'SAFE' },
  yellow: { icon: Shield, color: 'text-amber-400', label: 'CAUTION' },
  red: { icon: ShieldAlert, color: 'text-red-400', label: 'DANGER' },
};

function shortenCA(ca: string): string {
  if (ca.length <= 12) return ca;
  return `${ca.slice(0, 6)}...${ca.slice(-4)}`;
}

function cleanMessage(text: string): string {
  return text.replace(/\s*\|\s*Alphub/gi, '').replace(/Alphub/gi, '').trim();
}

export function MarketCapAlerts() {
  const [alerts, setAlerts] = useState<MarketCapAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('market_cap_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200) as { data: MarketCapAlert[] | null };
    setAlerts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAlerts();

    // Realtime subscription for instant updates
    const channel = supabase
      .channel('market_cap_alerts_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_cap_alerts' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setAlerts(prev => [payload.new as MarketCapAlert, ...prev].slice(0, 200));
        } else if (payload.eventType === 'UPDATE') {
          setAlerts(prev => prev.map(a => a.id === (payload.new as any).id ? payload.new as MarketCapAlert : a));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadAlerts]);

  const triggerAudit = async (alert: MarketCapAlert) => {
    setAuditing(alert.id);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moralis-audit`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ ca_address: alert.ca_address, alert_id: alert.id }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Audit failed (${res.status})`);
      const result = await res.json();
      // Update local state
      setAlerts(prev => prev.map(a => a.id === alert.id ? {
        ...a,
        audit_status: 'completed',
        audit_data: result,
        verdict: result.verdict,
        is_j7tracker: result.is_j7tracker,
        token_name: result.token_name || a.token_name,
        token_symbol: result.token_symbol || a.token_symbol,
      } : a));
      toast.success(`Audit complete: ${result.verdict?.toUpperCase()}`);
    } catch (err: any) {
      toast.error(err.message || 'Audit failed');
    } finally {
      setAuditing(null);
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return alerts;
    if (filter === 'j7tracker') return alerts.filter(a => a.is_j7tracker);
    if (filter === '50k+') return alerts.filter(a => a.milestone_value >= 50000);
    if (filter === 'audited') return alerts.filter(a => a.audit_status === 'completed');
    return alerts;
  }, [alerts, filter]);

  const copyCA = (ca: string) => {
    navigator.clipboard.writeText(ca);
    toast.success('CA copied');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Market Cap Alerts</h2>
            <p className="text-xs text-muted-foreground">{alerts.length} alerts tracked · Realtime from Telegram</p>
          </div>
        </div>
        <button onClick={loadAlerts} className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { id: 'all', label: 'All', count: alerts.length },
          { id: 'j7tracker', label: '🏅 j7tracker', count: alerts.filter(a => a.is_j7tracker).length },
          { id: '50k+', label: '50K+', count: alerts.filter(a => a.milestone_value >= 50000).length },
          { id: 'audited', label: '🛡 Audited', count: alerts.filter(a => a.audit_status === 'completed').length },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
              filter === f.id
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {f.label} <span className="ml-1 opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Alert list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <TrendingUp className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No market cap alerts yet</p>
          <p className="text-xs text-muted-foreground">Alerts from Telegram will appear here instantly.</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-340px)]">
          <div className="space-y-2 pb-8">
            {filtered.map(alert => {
              const isExpanded = expandedId === alert.id;
              const verdictCfg = alert.verdict ? VERDICT_CONFIG[alert.verdict] : null;
              const VerdictIcon = verdictCfg?.icon || Shield;
              const milestoneColor = MILESTONE_COLORS[alert.milestone] || MILESTONE_COLORS['30k'];
              const auditChecks = alert.audit_data?.checks || {};

              return (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-lg border transition-all",
                    alert.is_j7tracker ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card",
                    isExpanded && "ring-1 ring-primary/20"
                  )}
                >
                  {/* Main row */}
                  <div
                    className="p-3 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                  >
                    <div className="flex items-center gap-3 overflow-visible">
                      {/* Milestone badge */}
                      <span className={cn("px-2 py-0.5 rounded text-[11px] font-bold border shrink-0", milestoneColor)}>
                        {alert.milestone}
                      </span>

                      {/* Token info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {alert.token_symbol && (
                            <span className="text-sm font-bold text-foreground">${alert.token_symbol}</span>
                          )}
                          {alert.token_name && (
                            <span className="text-xs text-muted-foreground truncate">{alert.token_name}</span>
                          )}
                          {alert.is_j7tracker && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              j7tracker
                            </span>
                          )}
                          {alert.audit_data?.has_instagram && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-500/20 text-pink-400 border border-pink-500/30">
                              Instagram
                            </span>
                          )}
                          {alert.audit_data?.has_tiktok && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                              TikTok
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyCA(alert.ca_address); }}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono"
                          >
                            {shortenCA(alert.ca_address)}
                            <Copy className="h-2.5 w-2.5" />
                          </button>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>

                      {/* Verdict / Audit button */}
                      <div className="shrink-0 flex items-center gap-2 ml-2 whitespace-nowrap">
                        {alert.audit_status === 'completed' && verdictCfg ? (
                          <span className={cn("flex items-center gap-1 text-xs font-bold", verdictCfg.color)}>
                            <VerdictIcon className="h-4 w-4" />
                            {verdictCfg.label}
                          </span>
                        ) : alert.milestone_value >= 50000 ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerAudit(alert); }}
                            disabled={auditing === alert.id}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {auditing === alert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                            Audit
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Under 50K</span>
                        )}
                        {alert.source_url && (
                          <a
                            href={alert.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded audit detail */}
                  {isExpanded && alert.audit_status === 'completed' && Object.keys(auditChecks).length > 0 && (
                    <div className="px-3 pb-3 pt-0 border-t border-border/50 overflow-hidden">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 mt-2">
                        {Object.entries(auditChecks).map(([key, check]: [string, any]) => (
                          <div
                            key={key}
                            className={cn(
                              "px-2 py-1.5 rounded text-[11px] border overflow-hidden",
                              check.status === 'green' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                              check.status === 'yellow' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                              check.status === 'red' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                              'bg-muted/30 border-border text-muted-foreground'
                            )}
                          >
                            <div className="font-medium capitalize">{key.replace(/_/g, ' ')}</div>
                            <div className="opacity-80 text-[10px] break-words whitespace-normal">{check.detail}</div>
                          </div>
                        ))}
                      </div>
                      {alert.audit_data?.reason && (
                        <p className="mt-2 text-xs text-muted-foreground italic break-words whitespace-normal">{alert.audit_data.reason}</p>
                      )}
                      {alert.audit_data?.top_holders?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Top Holders</p>
                          {alert.audit_data.top_holders.map((h: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                              <span>#{i+1}</span>
                              <span className="truncate max-w-[180px]">{h.address}</span>
                              <span className="font-bold">{h.pct?.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raw message preview when expanded and no audit */}
                  {isExpanded && alert.audit_status !== 'completed' && alert.raw_message && (
                    <div className="px-3 pb-3 pt-0 border-t border-border/50 overflow-hidden">
                      <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-words overflow-wrap-anywhere" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{cleanMessage(alert.raw_message)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
