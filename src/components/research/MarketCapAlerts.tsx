import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, RefreshCw, Shield, ShieldAlert, ShieldCheck, TrendingUp, ExternalLink, Copy, Zap, Pencil, Search, X, Check, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const GAINERS_CHANNEL_ID = -1003862520317;

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
  is_kol: boolean;
  audit_status: string;
  audit_data: any;
  verdict: string | null;
  created_at: string;
  telegram_channel_id?: number | null;
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

function getMilestoneColor(milestone: string): string {
  if (milestone.startsWith('TP#')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40';
  return MILESTONE_COLORS[milestone] || MILESTONE_COLORS['30k'];
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ token_name: string; token_symbol: string; milestone: string }>({ token_name: '', token_symbol: '', milestone: '' });
  const [trendingKeywords, setTrendingKeywords] = useState<Set<string>>(new Set());

  // Load cashtags & trending topic nouns from X feed
  const loadTrending = useCallback(async () => {
    const { data } = await supabase
      .from('x_feed_tweets')
      .select('tweet_text')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data?.length) {
      const cashtags = new Set<string>();
      const topicWords = new Set<string>();

      // Common English words to never match
      const STOPWORDS = new Set([
        'the','and','for','this','that','with','from','have','will','been','token','just',
        'like','more','than','what','when','your','about','some','they','their','there',
        'would','could','should','which','where','were','into','also','over','after',
        'before','other','many','much','most','only','very','such','each','every',
        'being','those','these','then','them','does','done','doing','made','make',
        'been','back','come','going','know','think','want','take','good','time',
        'people','first','last','long','great','little','right','look','still',
        'world','life','work','high','point','market','crypto','solana','price',
        'trading','trade','coin','coins','pump','meme','memecoin','million','billion',
        'breaking','news','alert','update','thread','check','follow','retweet','here',
        'live','today','now','new','next','best','top','big','all','out','get','got',
        'can','not','are','was','has','had','but','its','our','you','who','how','why',
        'one','two','three','four','five','per','via','any','own','way','day','may',
        'let','say','see','use','try','put','run','old','end','set','too','did','ago',
      ]);

      for (const row of data) {
        const text = row.tweet_text || '';
        // 1) Extract explicit $CASHTAGS
        const tags = text.match(/\$([A-Za-z]{2,12})/g);
        if (tags) tags.forEach(t => cashtags.add(t.replace('$', '').toLowerCase()));

        // 2) Extract capitalized proper nouns / trending topics (ALLCAPS words 4+ chars)
        const caps = text.match(/\b[A-Z]{4,12}\b/g);
        if (caps) caps.forEach(w => {
          const low = w.toLowerCase();
          if (!STOPWORDS.has(low)) topicWords.add(low);
        });
      }

      // Merge cashtags + topic words
      const merged = new Set([...cashtags, ...topicWords]);
      setTrendingKeywords(merged);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('market_cap_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200) as { data: MarketCapAlert[] | null };
    setAlerts(data || []);
    setLoading(false);
  }, []);

  // Check if a ticker is "niche/trending" — only matches explicit cashtags or ALLCAPS topic words from X feed
  const isNicheTicker = useCallback((alert: MarketCapAlert): boolean => {
    if (trendingKeywords.size === 0) return false;
    const symbol = (alert.token_symbol || '').toLowerCase().replace(/[^a-z]/g, '');
    const name = (alert.token_name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!symbol && !name) return false;
    // Direct match: ticker symbol appears as a cashtag or trending topic
    if (symbol && trendingKeywords.has(symbol)) return true;
    if (name && name.length >= 4 && trendingKeywords.has(name)) return true;
    return false;
  }, [trendingKeywords]);

  useEffect(() => {
    loadAlerts();
    loadTrending();

    // Realtime subscription for instant updates
    const channel = supabase
      .channel('market_cap_alerts_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_cap_alerts' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newAlert = payload.new as MarketCapAlert;
          setAlerts(prev => [newAlert, ...prev].slice(0, 200));
          // Show persistent toast for GAINERS (take profit) alerts
          const tpNum = newAlert.milestone?.match(/^TP#(\d+)/);
          if (tpNum && parseInt(tpNum[1], 10) >= 7) {
            const sym = newAlert.token_symbol ? `$${newAlert.token_symbol}` : shortenCA(newAlert.ca_address);
            const pumpUrl = `https://pump.fun/${newAlert.ca_address}`;
            toast(`💰 GAINER: ${sym} hit ${newAlert.milestone}`, {
              description: `CA: ${shortenCA(newAlert.ca_address)} — Take Profit detected!`,
              duration: 60000,
              action: { label: '🔗 pump.fun', onClick: () => window.open(pumpUrl, '_blank') },
              style: { borderColor: 'rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.08)' },
            });
          }
        } else if (payload.eventType === 'UPDATE') {
          setAlerts(prev => prev.map(a => a.id === (payload.new as any).id ? payload.new as MarketCapAlert : a));
        }
      })
      .subscribe();

    // 10-second polling for near-realtime GAINERS monitoring
    const pollInterval = window.setInterval(() => { loadAlerts(); }, 10_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [loadAlerts, loadTrending]);

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

  const topGainers = useMemo(() => {
    return alerts.filter(a => (a as any).is_top_gainer === true);
  }, [alerts]);

  const filtered = useMemo(() => {
    if (filter === 'all') return alerts;
    if (filter === 'j7tracker') return alerts.filter(a => a.is_j7tracker);
    if (filter === 'kol') return alerts.filter(a => a.is_kol);
    if (filter === '50k+') return alerts.filter(a => a.milestone_value >= 50000);
    if (filter === 'audited') return alerts.filter(a => a.audit_status === 'completed');
    if (filter === 'gainers') {
      const gainerAlerts = alerts.filter(a => {
        const tpMatch = a.milestone.match(/^TP#(\d+)/);
        if (tpMatch) return parseInt(tpMatch[1], 10) >= 5;
        return (a as any).telegram_channel_id === GAINERS_CHANNEL_ID;
      });
      // Deduplicate by CA: keep only the highest TP per CA address
      const caMap = new Map<string, typeof gainerAlerts[0]>();
      gainerAlerts.forEach(a => {
        const existing = caMap.get(a.ca_address);
        if (!existing) { caMap.set(a.ca_address, a); return; }
        const curTP = parseInt(a.milestone.match(/^TP#(\d+)/)?.[1] || '0', 10);
        const exTP = parseInt(existing.milestone.match(/^TP#(\d+)/)?.[1] || '0', 10);
        if (curTP > exTP) caMap.set(a.ca_address, a);
      });
      return Array.from(caMap.values());
    }
    if (filter === 'top-gainers') {
      const caMap = new Map<string, typeof topGainers[0]>();
      topGainers.forEach(a => {
        const existing = caMap.get(a.ca_address);
        if (!existing) { caMap.set(a.ca_address, a); return; }
        const curTP = parseInt(a.milestone.match(/^TP#(\d+)/)?.[1] || '0', 10);
        const exTP = parseInt(existing.milestone.match(/^TP#(\d+)/)?.[1] || '0', 10);
        if (curTP > exTP) caMap.set(a.ca_address, a);
      });
      return Array.from(caMap.values());
    }
    return alerts;
  }, [alerts, filter, topGainers]);

  const copyCA = (ca: string) => {
    navigator.clipboard.writeText(ca);
    toast.success('CA copied');
  };

  const startEdit = (alert: MarketCapAlert, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(alert.id);
    setEditForm({ token_name: alert.token_name || '', token_symbol: alert.token_symbol || '', milestone: alert.milestone });
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const saveEdit = async (alert: MarketCapAlert, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from('market_cap_alerts').update({
      token_name: editForm.token_name || null,
      token_symbol: editForm.token_symbol || null,
      milestone: editForm.milestone,
    }).eq('id', alert.id);
    if (error) { toast.error('Save failed'); return; }
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, ...editForm } : a));
    setEditingId(null);
    toast.success('Alert updated');
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
          { id: 'kol', label: '👑 KOL', count: alerts.filter(a => a.is_kol).length },
          { id: 'j7tracker', label: '📖 LORE', count: alerts.filter(a => a.is_j7tracker).length },
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
        {/* GAINERS toggle */}
        <button
          onClick={() => setFilter(filter === 'gainers' ? 'all' : 'gainers')}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-bold transition-colors border flex items-center gap-1",
            filter === 'gainers'
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
          )}
        >
          <DollarSign className="h-3 w-3" />
          GAINERS
          <span className="ml-0.5 opacity-60">{new Set(alerts.filter(a => { const m = a.milestone.match(/^TP#(\d+)/); if (m) return parseInt(m[1], 10) >= 5; return (a as any).telegram_channel_id === GAINERS_CHANNEL_ID; }).map(a => a.ca_address)).size}</span>
        </button>
        {/* TOP GAINERS toggle */}
        <button
          onClick={() => setFilter(filter === 'top-gainers' ? 'all' : 'top-gainers')}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-bold transition-colors border flex items-center gap-1",
            filter === 'top-gainers'
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
              : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
          )}
        >
          <Zap className="h-3 w-3" />
          TOP GAINERS
          <span className="ml-0.5 opacity-60">{new Set(topGainers.map(a => a.ca_address)).size}</span>
        </button>
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
              const milestoneColor = getMilestoneColor(alert.milestone);
              const auditChecks = alert.audit_data?.checks || {};

              const isGainer = alert.milestone.startsWith('TP#');

              return (
                  <div
                    key={alert.id}
                    className={cn(
                      "rounded-lg border transition-all overflow-visible",
                      isGainer ? "border-emerald-500/50 bg-emerald-500/5" :
                      alert.is_kol ? "border-yellow-500/50 bg-yellow-500/5" :
                      alert.is_j7tracker ? "border-violet-500/40 bg-violet-500/5" : "border-border bg-card",
                      isExpanded && "ring-1 ring-primary/20"
                    )}
                  >
                  {/* Main row */}
                  {editingId === alert.id ? (
                    <div className="p-3 space-y-2" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Input
                          value={editForm.token_symbol}
                          onChange={e => setEditForm(f => ({ ...f, token_symbol: e.target.value }))}
                          placeholder="Symbol"
                          className="h-7 text-xs w-24"
                        />
                        <Input
                          value={editForm.token_name}
                          onChange={e => setEditForm(f => ({ ...f, token_name: e.target.value }))}
                          placeholder="Token Name"
                          className="h-7 text-xs flex-1"
                        />
                        <select
                          value={editForm.milestone}
                          onChange={e => setEditForm(f => ({ ...f, milestone: e.target.value }))}
                          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {Object.keys(MILESTONE_COLORS).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <button onClick={(e) => saveEdit(alert, e)} className="h-7 w-7 rounded-md flex items-center justify-center bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={cancelEdit} className="h-7 w-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">{alert.ca_address}</div>
                    </div>
                  ) : (
                    <div
                      className="p-3 cursor-pointer hover:bg-muted/20 transition-colors overflow-visible"
                      onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                    >
                        <div className="flex items-start gap-2">
                        {/* Milestone badge — yellow for KOL */}
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[11px] font-bold border shrink-0",
                          alert.is_kol ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" : milestoneColor
                        )}>
                          {alert.milestone}
                        </span>

                        {/* Token info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-x-1.5 gap-y-1 flex-wrap">
                            {alert.token_symbol && (
                              <span className={cn("text-sm font-bold", (() => {
                                const tpMatch = alert.milestone.match(/^TP#(\d+)/);
                                if (tpMatch && parseInt(tpMatch[1], 10) >= 5) return `text-lime-400 drop-shadow-[0_0_8px_rgba(163,230,53,0.7)]${parseInt(tpMatch[1], 10) >= 8 ? ' animate-pulse' : ''}`;
                                if (isNicheTicker(alert)) return "text-green-400 drop-shadow-[0_0_6px_rgba(74,222,128,0.5)]";
                                return "text-orange-400";
                              })())}>${alert.token_symbol}</span>
                            )}
                            {alert.token_name && (
                              <span className="text-xs text-muted-foreground truncate">{alert.token_name}</span>
                            )}
                            {alert.is_kol && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                                KOL
                              </span>
                            )}
                            {alert.is_j7tracker && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/20 text-violet-400 border border-violet-500/30">
                                📖 LORE
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
                            {isGainer && (() => {
                              // Count how many TPs this CA has
                              const tpCount = alerts.filter(a => a.ca_address === alert.ca_address && a.milestone.startsWith('TP#')).length;
                              return tpCount > 1 ? (
                                <span className="px-1.5 py-1 rounded text-[10px] font-bold leading-none bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-0.5 whitespace-nowrap shrink-0">
                                  <DollarSign className="h-2.5 w-2.5" />
                                  {tpCount} TPs
                                </span>
                              ) : null;
                            })()}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
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

                        {/* Action icons */}
                        <div className="shrink-0 flex items-center gap-1.5 ml-auto whitespace-nowrap">
                          {/* Analyze (full audit) - always available */}
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerAudit(alert); }}
                            disabled={auditing === alert.id}
                            title="Run full Moralis audit"
                            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                          >
                            {auditing === alert.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                          </button>

                          {/* Edit */}
                          <button
                            onClick={(e) => startEdit(alert, e)}
                            title="Edit alert"
                            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          {/* Launch via FLT */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const tokenMetadata = {
                                image: alert.audit_data?.image || null,
                                name: alert.audit_data?.name || alert.token_name || null,
                                symbol: alert.audit_data?.symbol || alert.token_symbol || null,
                                description: alert.audit_data?.description || null,
                                twitter: alert.audit_data?.twitter || alert.audit_data?.twitterX || null,
                                website: alert.audit_data?.website || null,
                                telegram: alert.audit_data?.telegram || null,
                              };
                              const encodedMetadata = encodeURIComponent(JSON.stringify(tokenMetadata));
                              const fltUrl = `flt://tokens/upsert?token_metadata=${encodedMetadata}`;
                              window.open(fltUrl, '_blank');
                            }}
                            title="Launch in FLT"
                            className="flex items-center justify-center h-7 w-7 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                          </button>

                          {/* Verdict badge */}
                          {alert.audit_status === 'completed' && verdictCfg && (
                            <span className={cn("flex items-center text-xs font-bold", verdictCfg.color)} title={verdictCfg.label}>
                              <VerdictIcon className="h-4 w-4" />
                            </span>
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
                  )}

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
                      {/* LORE engagement data */}
                      {alert.audit_data?.lore_check && (
                        <div className="mt-2 p-2 rounded border border-violet-500/20 bg-violet-500/5">
                          <p className="text-[10px] font-medium text-violet-400 mb-1">📖 LORE Check</p>
                          <p className="text-[10px] text-muted-foreground">{alert.audit_data.lore_check.engagement_summary}</p>
                          {alert.audit_data.lore_check.twitter_handle && (
                            <a
                              href={`https://x.com/${alert.audit_data.lore_check.twitter_handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-violet-400 hover:underline mt-1 inline-block"
                              onClick={e => e.stopPropagation()}
                            >
                              @{alert.audit_data.lore_check.twitter_handle}
                            </a>
                          )}
                          {alert.audit_data.lore_check.top_tweet && (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              <span className="font-mono">💬 {alert.audit_data.lore_check.top_tweet.replies}</span>
                              <span className="mx-1">·</span>
                              <span className="font-mono">👁 {alert.audit_data.lore_check.top_tweet.views?.toLocaleString()}</span>
                              <span className="mx-1">·</span>
                              <span className="font-mono">🔄 {alert.audit_data.lore_check.top_tweet.retweets}</span>
                              <span className="mx-1">·</span>
                              <span className="font-mono">❤️ {alert.audit_data.lore_check.top_tweet.likes}</span>
                            </div>
                          )}
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
