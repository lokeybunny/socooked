import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Search, ExternalLink, UserPlus, Copy, Trash2, RefreshCw, MapPin, Instagram, Star, ChevronLeft, Activity, Zap, CheckCircle2, Loader2, AlertCircle, Terminal, Brain, TrendingUp, Target, Play, Music, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/* ── X (Twitter) icon ── */
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface SourceCategory { id: string; label: string; icon: LucideIcon | (({ className }: { className?: string }) => JSX.Element); description: string }

const RESEARCH_SOURCES: SourceCategory[] = [
  { id: 'google-maps', label: 'Google Maps', icon: MapPin, description: 'Local businesses, reviews & map listings' },
  { id: 'x', label: 'X (Twitter)', icon: XIcon as any, description: 'Tweets, trends & social mentions' },
  { id: 'yelp', label: 'Yelp', icon: Star, description: 'Business reviews, ratings & listings' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, description: 'Profiles, posts & engagement data' },
  { id: 'other', label: 'Other', icon: Search, description: 'Web scrapes, APIs & misc sources' },
];

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(RESEARCH_SOURCES.map(s => [s.id, s.label]));

const FINDING_TYPES = ['lead', 'competitor', 'resource', 'trend', 'other'] as const;
const STATUSES = ['new', 'reviewed', 'converted', 'dismissed'] as const;

interface MatchedTweet {
  text: string;
  user: string;
  favorites: number;
  retweets: number;
  url: string;
  profile_pic: string;
  media_url: string;
  token_symbol?: string;
}

interface TweetSource {
  user: string;
  text: string;
  url: string;
  engagement: string;
  media_url?: string;
}

interface TikTokVideo {
  id: string;
  text: string;
  playCount: number;
  diggCount: number;
  shareCount: number;
  commentCount: number;
  createTimeISO: string;
  webVideoUrl: string;
  authorName: string;
  coverUrl: string;
  narrativeScore: number;
  hashtags: string[];
  tokenized?: boolean;
  tier?: string;
  matchedToken?: any;
}

interface TriggerTikTok {
  author: string;
  text: string;
  url: string;
  plays: string;
  shares: string;
  narrative_score: number;
}

interface Narrative {
  name: string;
  symbol: string;
  description: string;
  narrative_rating: number;
  rating_justification: string;
  tweet_sources: TweetSource[];
  trigger_tiktoks?: TriggerTikTok[];
  on_chain_evidence: string;
  competition: string;
  deploy_window: string;
  risk: string;
  website?: string;
  twitter_source_url?: string;
  tiktok_source_url?: string;
  source_platform?: string;
  image_gen_prompt?: string;
  tier?: string;
  // Legacy compat
  bundle_score?: number;
  suggested_tickers?: string[];
  why_bundle?: string;
}

export default function Research() {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [allFindings, setAllFindings] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryNewFlags, setCategoryNewFlags] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [generating, setGenerating] = useState(false);
  const [progressLog, setProgressLog] = useState<Array<{ step: number; label: string; status: string; detail: string; ts: string }>>([]);
  const [showLog, setShowLog] = useState(false);
  const [topNarratives, setTopNarratives] = useState<Narrative[]>([]);
  const [topTweets, setTopTweets] = useState<MatchedTweet[]>([]);
  const [cycleChainOfThought, setCycleChainOfThought] = useState('');
  const [cycleReasoning, setCycleReasoning] = useState('');
  const [evolvedQueries, setEvolvedQueries] = useState<string[]>([]);
  const [tiktokRadar, setTiktokRadar] = useState<TikTokVideo[]>([]);
  const [creditsDepleted, setCreditsDepleted] = useState(false);
  const [scrapeSources, setScrapeSources] = useState<('x' | 'tiktok')[]>(['x', 'tiktok']);
  const [loopInterval, setLoopInterval] = useState<number | null>(null); // minutes
  const [loopActive, setLoopActive] = useState(false);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopActiveRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // New finding form
  const [title, setTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [findingType, setFindingType] = useState<string>('lead');
  const [findingSource, setFindingSource] = useState<string>('other');
  const [creating, setCreating] = useState(false);

  const validSources = RESEARCH_SOURCES.map(s => s.id);
  const normSource = (c: string | null) => (c && validSources.includes(c) ? c : 'other');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('research_findings')
      .select('*, customers(full_name, email)')
      .order('created_at', { ascending: false });
    setAllFindings(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Check for new findings per category using localStorage timestamps
  useEffect(() => {
    const flags: Record<string, boolean> = {};
    RESEARCH_SOURCES.forEach(src => {
      const lastSeen = localStorage.getItem(`research_last_seen_${src.id}`);
      const catFindings = allFindings.filter(f => normSource(f.category) === src.id);
      const latest = catFindings[0]?.created_at;
      flags[src.id] = !!(latest && (!lastSeen || latest > lastSeen));
    });
    setCategoryNewFlags(flags);
  }, [allFindings]);

  // Realtime subscription for new research findings
  useEffect(() => {
    const channel = supabase
      .channel('research_new_findings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'research_findings' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Mark category as seen when selected
  useEffect(() => {
    if (selectedSource) {
      localStorage.setItem(`research_last_seen_${selectedSource}`, new Date().toISOString());
      setCategoryNewFlags(prev => ({ ...prev, [selectedSource]: false }));
    }
  }, [selectedSource]);

  useEffect(() => {
    if (selectedSource) {
      setFindings(allFindings.filter(f => normSource(f.category) === selectedSource));
    } else {
      setFindings(allFindings);
    }
  }, [selectedSource, allFindings]);

  const categoryCounts = RESEARCH_SOURCES.reduce((acc, src) => {
    acc[src.id] = allFindings.filter(f => normSource(f.category) === src.id).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = findings.filter(f => {
    if (filterType !== 'all' && f.finding_type !== filterType) return false;
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setCreating(true);
    const { error } = await supabase.from('research_findings').insert([{
      title: title.trim(),
      source_url: sourceUrl.trim() || null,
      summary: summary.trim() || null,
      finding_type: findingType,
      category: findingSource,
      created_by: 'manual',
    }]);
    if (error) { toast.error(error.message); setCreating(false); return; }
    toast.success('Finding added');
    setDialogOpen(false);
    setTitle(''); setSourceUrl(''); setSummary(''); setFindingType('lead'); setFindingSource('other');
    setCreating(false);
    load();
  };

  const handleConvertToClient = async (finding: any) => {
    setConverting(finding.id);
    try {
      const { data: cust, error: custErr } = await supabase.from('customers').insert([{
        full_name: finding.title,
        source: 'research',
        status: 'lead',
        notes: `From research (${SOURCE_LABELS[finding.category] || 'Other'}): ${finding.summary || ''}\n${finding.source_url || ''}`.trim(),
        category: null,
      }]).select().single();

      if (custErr) { toast.error(custErr.message); setConverting(null); return; }

      await supabase.from('research_findings')
        .update({ customer_id: cust.id, status: 'converted' })
        .eq('id', finding.id);

      toast.success(`Client "${finding.title}" created — added to Leads pipeline & Projects`);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Conversion failed');
    } finally {
      setConverting(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('research_findings').delete().eq('id', deleteId);
    toast.success('Finding deleted');
    setDeleteId(null);
    load();
  };

  const handlePurgeAll = async () => {
    setPurging(true);
    try {
      const ids = filtered.map((f: any) => f.id);
      if (!ids.length) { toast.info('Nothing to purge'); return; }
      const { error } = await supabase.from('research_findings').delete().in('id', ids);
      if (error) throw error;
      toast.success(`Purged ${ids.length} X findings`);
      setShowPurgeConfirm(false);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Purge failed');
    } finally {
      setPurging(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const sourceIcon = (cat: string, className?: string) => {
    const cls = className || 'h-3 w-3';
    switch (cat) {
      case 'google-maps': return <MapPin className={cls} />;
      case 'x': return <XIcon className={cls} />;
      case 'yelp': return <Star className={cls} />;
      case 'instagram': return <Instagram className={cls} />;
      default: return <Search className={cls} />;
    }
  };

  // Spacebot last cycle info
  const cortexFindings = allFindings.filter(f => f.created_by === 'cortex' || f.created_by === 'spacebot');
  const lastCortexPush = cortexFindings[0]?.created_at;
  const cortexCycleCount = cortexFindings.length;
  const isCortexRecent = lastCortexPush && (Date.now() - new Date(lastCortexPush).getTime()) < 20 * 60 * 1000;

  const handleGenerate = async () => {
    setGenerating(true);
    setProgressLog([]);
    setTopNarratives([]);
    setTopTweets([]);
    setTiktokRadar([]);
    setCycleChainOfThought('');
    setCycleReasoning('');
    setEvolvedQueries([]);
    setShowLog(true);
    setCreditsDepleted(false);

    const now = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setProgressLog([{ step: -1, label: 'Cortex activated', status: 'done', detail: '🚀 Researching live narratives now...', ts: now() }]);

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spacebot-research`;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sources: scrapeSources }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const msg of messages) {
          if (!msg.trim()) continue;

          const lines = msg.split('\n');
          let eventType = '';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr += line.slice(6);
            }
          }

          if (!eventType || !dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            const ts = now();

            if (eventType === 'progress') {
              setProgressLog(prev => {
                const existing = prev.findIndex(p => p.step === data.step && p.label === data.label);
                const entry = { step: data.step, label: data.label, status: data.status, detail: data.detail, ts };
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = entry;
                  return updated;
                }
                return [...prev, entry];
              });
            } else if (eventType === 'complete') {
              if (data.top_narratives?.length) setTopNarratives(data.top_narratives);
              if (data.top_tweets?.length) setTopTweets(data.top_tweets);
              if (data.tiktok_radar?.length) setTiktokRadar(data.tiktok_radar);
              if (data.chain_of_thought) setCycleChainOfThought(data.chain_of_thought);
              if (data.reasoning) setCycleReasoning(data.reasoning);
              if (data.evolved_queries?.length) setEvolvedQueries(data.evolved_queries);
              if (data.stats?.credits_depleted) setCreditsDepleted(true);
              toast.success(`Cortex cycle complete: ${data.stats?.tweets ?? 0} tweets, ${data.stats?.tokens ?? 0} tokens, ${data.stats?.matches ?? 0} clusters`);
              load();
            } else if (eventType === 'warning') {
              if (data.type === 'credits_depleted') setCreditsDepleted(true);
              setProgressLog(prev => [...prev, { step: 98, label: '⚠️ Warning', status: 'warning', detail: data.message || 'Unknown warning', ts }]);
            } else if (eventType === 'error') {
              toast.error(data.message || 'Generation failed');
              setProgressLog(prev => [...prev, { step: 99, label: 'Error', status: 'error', detail: data.message || 'Unknown error', ts }]);
            }
          } catch { /* skip bad JSON */ }
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Research generation failed');
      setProgressLog(prev => [...prev, { step: 99, label: 'Connection error', status: 'error', detail: err.message || 'Failed to connect', ts: now() }]);
    } finally {
      setGenerating(false);
    }
  };

  // Auto-loop: schedule next run after generate completes
  const startLoop = () => {
    if (!loopInterval) return;
    loopActiveRef.current = true;
    setLoopActive(true);
    handleGenerate();
  };

  const stopLoop = () => {
    loopActiveRef.current = false;
    setLoopActive(false);
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    toast.info('Auto-generate loop stopped');
  };

  // When generating finishes and loop is active, schedule next
  useEffect(() => {
    if (!generating && loopActiveRef.current && loopInterval) {
      const ms = loopInterval * 60 * 1000;
      setProgressLog(prev => [...prev, { step: -2, label: 'Loop', status: 'done', detail: `⏳ Next cycle in ${loopInterval}m...`, ts: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);
      loopTimerRef.current = setTimeout(() => {
        if (loopActiveRef.current) handleGenerate();
      }, ms);
    }
    return () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [generating]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLog]);

  // ── Category gate (source selector) ──
  if (!selectedSource) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-foreground flex items-center justify-center gap-2">
              <Search className="h-7 w-7 text-emerald-500" /> Research
            </h1>
            <p className="text-muted-foreground">Select a source to browse findings</p>
            <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full bg-muted/60 border border-border">
              <span className="text-2xl font-bold text-foreground">{allFindings.length}</span>
              <span className="text-sm text-muted-foreground">total findings</span>
            </div>
          </div>

          {/* Cortex Status Indicator */}
          <div className="w-full max-w-md mx-auto">
            <div className="glass-card rounded-lg px-4 py-3 flex items-center gap-3">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                isCortexRecent ? "bg-emerald-500/15" : "bg-muted"
              )}>
                <Brain className={cn(
                  "h-4 w-4",
                  isCortexRecent ? "text-emerald-500 animate-pulse" : "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Cortex</span>
                  <span className="text-[10px] text-muted-foreground italic">aka Zyla</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                    isCortexRecent
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : lastCortexPush
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                  )}>
                    {isCortexRecent ? 'LIVE' : lastCortexPush ? 'IDLE' : 'NEVER RUN'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {lastCortexPush
                    ? `Last cycle ${formatDistanceToNow(new Date(lastCortexPush), { addSuffix: true })} · ${cortexCycleCount} findings`
                    : 'No cycles yet — click X (Twitter) → Generate Research to begin'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-4xl">
            {RESEARCH_SOURCES.map(src => {
              const count = categoryCounts[src.id] || 0;
              const hasNew = categoryNewFlags[src.id];
              return (
                <button
                  key={src.id}
                  onClick={() => setSelectedSource(src.id)}
                  className="group glass-card p-6 rounded-xl text-left space-y-3 hover:ring-2 hover:ring-emerald-500/40 transition-all relative"
                >
                  {hasNew && (
                    <span className="absolute top-2 right-2 h-3 w-3 rounded-full bg-destructive border-2 border-background animate-pulse" />
                  )}
                  <span className={cn(
                    "absolute top-3 right-3 flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full text-xs font-semibold",
                    hasNew ? "top-3 right-7" : "",
                    count > 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                    {sourceIcon(src.id, 'h-5 w-5 text-emerald-500')}
                  </div>
                  <h3 className="font-semibold text-foreground">{src.label}</h3>
                  <p className="text-sm text-muted-foreground">{src.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Filtered findings view ──
  const activeSrc = RESEARCH_SOURCES.find(s => s.id === selectedSource);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedSource(null)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{activeSrc?.label || ''} Research</h1>
        </div>

        {/* Controls — 1 row, 2 columns */}
        <div className="grid grid-cols-2 gap-4 items-start">
          {/* Column 1: Findings count + filters */}
          <div className="space-y-2">
            <p className="text-muted-foreground text-lg">{filtered.length} findings</p>
            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-32 h-10 text-base"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {FINDING_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32 h-10 text-base"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Column 2: Actions */}
          <div className="flex flex-col items-end gap-2">
            {selectedSource === 'x' && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Source toggles */}
                <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                  <button
                    onClick={() => setScrapeSources(prev => prev.includes('x') ? prev.filter(s => s !== 'x') : [...prev, 'x'])}
                    className={cn(
                      "px-3 py-1.5 rounded text-base font-semibold transition-colors",
                      scrapeSources.includes('x') ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    𝕏 X
                  </button>
                  <button
                    onClick={() => setScrapeSources(prev => prev.includes('tiktok') ? prev.filter(s => s !== 'tiktok') : [...prev, 'tiktok'])}
                    className={cn(
                      "px-3 py-1.5 rounded text-base font-semibold transition-colors",
                      scrapeSources.includes('tiktok') ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    🎵 TikTok
                  </button>
                </div>
                {/* Interval selector */}
                <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                  {[
                    { label: '5m', val: 5 },
                    { label: '15m', val: 15 },
                    { label: '30m', val: 30 },
                    { label: '1h', val: 60 },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setLoopInterval(prev => prev === opt.val ? null : opt.val)}
                      className={cn(
                        "px-3 py-1.5 rounded text-sm font-semibold transition-colors",
                        loopInterval === opt.val ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {loopActive ? (
                  <Button size="sm" variant="destructive" onClick={stopLoop} className="gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" /> Stop Loop
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={loopInterval ? startLoop : handleGenerate}
                    disabled={generating || scrapeSources.length === 0}
                    className="gap-1.5"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                    {generating ? 'Running...' : loopInterval ? `Loop ${loopInterval}m` : 'Generate'}
                  </Button>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              {selectedSource === 'x' && filtered.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setShowPurgeConfirm(true)} disabled={purging}>
                  <Trash2 className="h-4 w-4" /> Purge All
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[420px]">
                  <DialogHeader><DialogTitle>Add Research Finding</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Title / Name" value={title} onChange={e => setTitle(e.target.value)} />
                    <Input placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
                    <Textarea placeholder="Summary..." value={summary} onChange={e => setSummary(e.target.value)} rows={3} />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={findingType} onValueChange={setFindingType}>
                        <SelectTrigger className="text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                        <SelectContent>
                          {FINDING_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={findingSource} onValueChange={setFindingSource}>
                        <SelectTrigger className="text-xs"><SelectValue placeholder="Source" /></SelectTrigger>
                        <SelectContent>
                          {RESEARCH_SOURCES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleCreate} disabled={creating} className="w-full">
                      {creating ? 'Adding...' : 'Add Finding'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* ══════ Cortex Pipeline Log ══════ */}
        {selectedSource === 'x' && showLog && (
          <div className="glass-card rounded-lg overflow-hidden border border-border">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">cortex pipeline</span>
                {generating && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                {!generating && progressLog.length > 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">COMPLETE</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setShowLog(false)}>
                Hide
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 space-y-1.5 bg-background/50 font-mono text-sm">
              {progressLog.length === 0 && generating && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Connecting to Cortex engine...</span>
                </div>
              )}
              {progressLog.map((entry, i) => (
                <div key={`${entry.step}-${i}`} className="flex items-start gap-2 animate-fade-in">
                  <span className="text-muted-foreground shrink-0 w-16">{entry.ts}</span>
                  <span className="shrink-0">
                    {entry.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : entry.status === 'done' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className={cn(
                      "font-medium",
                      entry.status === 'running' ? "text-foreground" : entry.status === 'done' ? "text-muted-foreground" : "text-destructive"
                    )}>
                      {entry.step >= 0 ? `[${entry.step}] ` : ''}{entry.label}
                    </span>
                    <p className="text-muted-foreground break-words">{entry.detail}</p>
                  </div>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Credits depleted warning removed — using Apify agents only */}

        {/* ══════ TikTok Animal Viral Radar ══════ */}
        {selectedSource === 'x' && !generating && tiktokRadar.length === 0 && showLog && progressLog.some(p => p.status === 'done' || p.status === 'error') && (
          <div className="glass-card rounded-lg p-8 text-center border border-border">
            <p className="text-lg font-bold text-foreground mb-1">No fresh metas — waiting for the next dead cat 🐿️</p>
            <p className="text-sm text-muted-foreground">No TikTok animal/pet/justice videos passed the strict 24h Tier S/A/B filter this cycle.</p>
          </div>
        )}
        {selectedSource === 'x' && tiktokRadar.length > 0 && (
          <div className="glass-card rounded-lg overflow-hidden border border-purple-500/30">
            <div className="px-4 py-3 bg-purple-500/5 border-b border-purple-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-bold text-foreground">🎵 TikTok Animal Viral Radar — {tiktokRadar.length} Videos (1M+ plays, 48h)</span>
              </div>
              <span className="text-sm px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium animate-pulse">48H · 1M+ VIEWS</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">#</th>
                    <th className="text-center px-3 py-2 text-muted-foreground font-medium">Tier</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Video</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">▶ Plays</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">❤ Likes</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">🔁 Shares</th>
                    <th className="text-center px-3 py-2 text-muted-foreground font-medium">Score</th>
                    <th className="text-center px-3 py-2 text-muted-foreground font-medium">Tokenized?</th>
                  </tr>
                </thead>
                <tbody>
                  {tiktokRadar.map((v, i) => {
                    const fmt = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : `${n}`;
                    const tierColor = v.tier === 'S' ? 'bg-red-500/20 text-red-400 animate-pulse' : v.tier === 'A' ? 'bg-amber-500/20 text-amber-400' : 'bg-muted text-muted-foreground';
                    return (
                      <tr key={v.id || i} className={cn(
                        "border-b border-purple-500/20 hover:bg-purple-500/10 transition-colors",
                        v.tier === 'S' ? "bg-purple-500/10" : "bg-purple-500/5"
                      )}>
                        <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn("text-sm px-2 py-0.5 rounded-full font-black", tierColor)}>
                            {v.tier || '?'}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[300px]">
                          <div className="flex items-start gap-2">
                            {v.coverUrl && (
                              <a href={v.webVideoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                <img src={v.coverUrl} alt="" className="w-10 h-14 rounded object-cover bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              </a>
                            )}
                            <div className="min-w-0">
                              <p className="text-foreground leading-snug line-clamp-2">{v.text || '(no description)'}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-muted-foreground">@{v.authorName}</span>
                                {v.webVideoUrl && (
                                  <a href={v.webVideoUrl} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-0.5">
                                    <Play className="h-2.5 w-2.5" /> Open
                                  </a>
                                )}
                              </div>
                              {v.hashtags?.length > 0 && (
                                <div className="flex gap-1 mt-0.5 flex-wrap">
                                  {v.hashtags.slice(0, 3).map((h, hi) => (
                                    <span key={hi} className="text-xs px-1.5 rounded bg-purple-500/10 text-purple-400">#{h}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">{fmt(v.playCount)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(v.diggCount)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(v.shareCount)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-sm font-bold",
                            v.narrativeScore >= 18 ? "bg-red-500/20 text-red-400" :
                            v.narrativeScore >= 12 ? "bg-primary/20 text-primary" :
                            v.narrativeScore >= 8 ? "bg-amber-500/20 text-amber-400" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {v.narrativeScore}/25
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {v.tokenized ? (
                            <span className="text-sm px-2 py-0.5 rounded-full font-bold bg-muted text-muted-foreground">
                              ⚠️ EXISTS
                            </span>
                          ) : (
                            <span className={cn(
                              "text-sm px-2 py-0.5 rounded-full font-bold",
                              v.tier === 'S' ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-primary/20 text-primary"
                            )}>
                              {v.tier === 'S' ? '🚨 SPIN NOW' : '🚀 LAUNCH'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════ Cortex Analyst Report ══════ */}
        {selectedSource === 'x' && topNarratives.length > 0 && (
          <div className="glass-card rounded-lg overflow-hidden border border-emerald-500/30">
            <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-emerald-500" />
                <span className="text-base font-bold text-foreground">📊 Cortex Analyst Report — {topNarratives.length} Narratives</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-sm"
                onClick={() => {
                  const report = topNarratives.map((n, i) => {
                    const rating = n.narrative_rating ?? n.bundle_score ?? 0;
                    const lines = [
                      `━━━ #${i + 1} — ${rating}/10 ━━━`,
                      `Name: ${n.name}`,
                      `Symbol: ${n.symbol || n.suggested_tickers?.[0] || '—'}`,
                      `Description: ${n.description || n.why_bundle || '—'}`,
                      `Rating: ${rating}/10 — ${n.rating_justification || n.why_bundle || ''}`,
                      `On-Chain: ${n.on_chain_evidence || '—'}`,
                      `Competition: ${n.competition}`,
                      `Window: ${n.deploy_window}`,
                      `Risk: ${n.risk || '—'}`,
                    ];
                    if (n.twitter_source_url || n.tweet_sources?.[0]?.url) {
                      lines.push(`Twitter: ${n.twitter_source_url || n.tweet_sources[0].url}`);
                    }
                    if (n.website) lines.push(`Website: ${n.website}`);
                    if (n.tweet_sources?.length) {
                      lines.push(`Sources:`);
                      n.tweet_sources.slice(0, 3).forEach(tw => {
                        lines.push(`  ${tw.user} (${tw.engagement}): "${tw.text.slice(0, 100)}"`);
                        if (tw.url) lines.push(`  ${tw.url}`);
                      });
                    }
                    return lines.join('\n');
                  }).join('\n\n');
                  const header = `CORTEX ANALYST REPORT — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\nSolana / Pump.fun Narrative Intelligence\n${'═'.repeat(50)}\n`;
                  const footer = `\n${'═'.repeat(50)}\n${cycleReasoning || ''}`;
                  navigator.clipboard.writeText(header + report + footer);
                  toast.success('Full report copied to clipboard');
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy Full Report
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {/* Analyst Summary */}
              {cycleReasoning && cycleReasoning !== 'No AI analysis available' && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5 text-primary" /> Analyst Summary
                    </span>
                    <button
                      onClick={() => copyToClipboard(cycleReasoning)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Copy className="h-2.5 w-2.5" /> Copy
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{cycleReasoning}</p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {topNarratives.map((n, i) => {
                  const rating = n.narrative_rating ?? n.bundle_score ?? 0;
                  const copyCard = () => {
                    const text = [
                      `Name: ${n.name}`,
                      `Symbol: ${n.symbol || n.suggested_tickers?.[0] || '—'}`,
                      `Description: ${n.description || n.why_bundle || '—'}`,
                      `Rating: ${rating}/10`,
                      `${n.rating_justification || n.why_bundle || ''}`,
                      n.twitter_source_url ? `Twitter: ${n.twitter_source_url}` : '',
                      n.website ? `Website: ${n.website}` : '',
                    ].filter(Boolean).join('\n');
                    copyToClipboard(text);
                  };

                  return (
                    <div key={i} className={cn(
                      "flex flex-col overflow-hidden rounded-xl border",
                      n.source_platform === 'tiktok' ? "bg-purple-500/5 border-purple-500/30" :
                      n.source_platform === 'cross-platform' ? "bg-gradient-to-r from-blue-500/5 to-purple-500/5 border-amber-500/30" :
                      n.source_platform === 'x' ? "bg-blue-500/5 border-blue-500/30" :
                      "bg-muted/30 border-border"
                    )}>
                      {/* Header strip */}
                      <div className={cn(
                        "px-3 py-1.5 border-b flex items-center gap-2 shrink-0",
                        n.source_platform === 'tiktok' ? "bg-purple-500/10 border-purple-500/20" :
                        n.source_platform === 'x' ? "bg-blue-500/10 border-blue-500/20" :
                        "bg-muted/40 border-border"
                      )}>
                        <span className="text-base font-bold text-foreground">{i + 1}.</span>
                        {n.tier && (
                          <span className={cn(
                            "text-sm px-2 py-0.5 rounded-full font-black",
                            n.tier === 'S' ? "bg-red-500/20 text-red-400 animate-pulse" :
                            n.tier === 'A' ? "bg-amber-500/20 text-amber-400" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {n.tier}
                          </span>
                        )}
                        {n.source_platform && (
                          <span className={cn(
                            "text-sm px-2 py-0.5 rounded-full font-bold",
                            n.source_platform === 'cross-platform' ? "bg-amber-500/20 text-amber-400" :
                            n.source_platform === 'tiktok' ? "bg-purple-500/20 text-purple-400" :
                            "bg-blue-500/20 text-blue-400"
                          )}>
                            {n.source_platform === 'cross-platform' ? '🔀 X+TT' : n.source_platform === 'tiktok' ? '🎵 TT' : '𝕏'}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 ml-auto shrink-0">
                          <button onClick={copyCard} className="text-muted-foreground hover:text-foreground">
                            <Copy className="h-3 w-3" />
                          </button>
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-sm font-bold",
                            rating >= 8 ? "bg-primary/20 text-primary" :
                            rating >= 6 ? "bg-accent/20 text-accent-foreground" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {rating}/10
                          </span>
                        </div>
                      </div>

                      {/* Body */}
                      <div className="p-2 space-y-1">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-base font-bold text-foreground line-clamp-1 leading-tight">{n.name}</h3>
                          {n.symbol && (
                            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">${n.symbol}</span>
                          )}
                        </div>

                        {n.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{n.description}</p>
                        )}

                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {n.deploy_window && (
                            <span>⏱ <span className={cn("font-semibold", n.deploy_window === 'NOW' ? "text-primary" : "text-foreground")}>{n.deploy_window}</span></span>
                          )}
                          {n.risk && <span>⚠ {n.risk}</span>}
                          {n.competition && <span>🏁 {n.competition}</span>}
                        </div>

                        {n.rating_justification && (
                          <p className="text-xs text-foreground leading-snug line-clamp-1">
                            <Zap className="h-2.5 w-2.5 inline mr-0.5 text-primary" />
                            <strong>{rating}/10</strong> — {n.rating_justification}
                          </p>
                        )}

                        {n.on_chain_evidence && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            <TrendingUp className="h-2.5 w-2.5 inline mr-0.5 text-emerald-500" />
                            {n.on_chain_evidence}
                          </p>
                        )}

                        {n.tweet_sources?.length > 0 && (
                          <div className="pt-0.5 border-t border-border space-y-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">𝕏 Sources</span>
                            {n.tweet_sources.slice(0, 1).map((tw, j) => (
                              <div key={j} className="flex items-center gap-1 text-xs">
                                <XIcon className="h-2.5 w-2.5 text-blue-400 shrink-0" />
                                <span className="font-bold text-foreground truncate">@{tw.user}</span>
                                <span className="text-blue-400 shrink-0">{tw.engagement}</span>
                                {tw.url && (
                                  <a href={tw.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-400 hover:underline shrink-0">
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {n.trigger_tiktoks?.length > 0 && (
                          <div className="pt-0.5 border-t border-border space-y-0.5">
                            <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">🎵 TikTok</span>
                            {n.trigger_tiktoks.slice(0, 1).map((tt, j) => (
                              <div key={j} className="flex items-center gap-1 text-xs">
                                <span className="font-semibold text-foreground truncate">{tt.author}</span>
                                <span className="text-pink-400 shrink-0">▶ {tt.plays}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {n.image_gen_prompt && (
                          <div className="pt-0.5 border-t border-border">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">🎨 Prompt</span>
                              <button onClick={() => copyToClipboard(n.image_gen_prompt!)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                                <Copy className="h-2.5 w-2.5" />
                              </button>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono line-clamp-1">{n.image_gen_prompt}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Top tweets fallback */}
              {topTweets.length > 0 && topNarratives.length === 0 && (
                <div className="space-y-3">
                  <span className="text-base font-semibold text-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" /> Top Tweets Found
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {topTweets.slice(0, 8).map((tw, j) => (
                      <div key={j} className="rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden hover:border-blue-500/40 transition-colors">
                        {tw.media_url && (
                          <img
                            src={tw.media_url}
                            alt=""
                            className="w-full h-32 object-cover bg-muted"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div className="p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            {tw.profile_pic && (
                              <img src={tw.profile_pic} alt="" className="w-7 h-7 rounded-full object-cover bg-muted shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                            <div className="min-w-0">
                              <span className="text-sm font-bold text-foreground block truncate">@{tw.user}</span>
                              {tw.token_symbol && (
                                <span className="text-sm font-mono font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-400">${tw.token_symbol}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground leading-snug line-clamp-3">{tw.text}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span>❤ {tw.favorites}</span>
                              <span>🔁 {tw.retweets}</span>
                            </div>
                            {tw.url && (
                              <a href={tw.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-400 hover:underline font-medium">
                                <ExternalLink className="h-2.5 w-2.5" /> Open
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cycleChainOfThought && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Chain-of-Thought Reasoning</summary>
                  <div className="mt-2 flex justify-end">
                    <button onClick={() => copyToClipboard(cycleChainOfThought)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <Copy className="h-2.5 w-2.5" /> Copy
                    </button>
                  </div>
                  <p className="mt-1 text-muted-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">{cycleChainOfThought}</p>
                </details>
              )}

              {evolvedQueries.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Evolved Search Queries (next cycle)</summary>
                  <ul className="mt-2 space-y-1">
                    {evolvedQueries.map((q, i) => (
                      <li key={i} className="text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded text-sm">{q}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Findings — 4-column card grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.filter(f => {
            // Gate: only show findings with required narrative fields
            const rd = f.raw_data as any;
            if (!rd) return false;
            const hasName = !!(rd.name || f.title);
            const hasSymbol = !!rd.symbol;
            const hasWindow = !!rd.deploy_window;
            const hasSources = (rd.tweet_sources?.length > 0) || (rd.trigger_tiktoks?.length > 0);
            return hasName && hasSymbol && hasWindow && hasSources;
          }).map(f => {
            const rawData = f.raw_data as any;
            const isNarrative = rawData?.type === 'narrative_report';
            const rating = rawData?.narrative_rating ?? rawData?.bundle_score ?? null;
            const tweetSources: TweetSource[] = rawData?.tweet_sources || [];
            const narrativeImage = tweetSources.find(ts => ts.media_url)?.media_url || rawData?.media_url || '';
            const sourcePlatform = rawData?.source_platform;

            return (
              <div key={f.id} className={cn(
                "glass-card overflow-hidden hover:shadow-lg transition-shadow rounded-xl border flex flex-col",
                sourcePlatform === 'tiktok' ? "border-purple-500/30" :
                sourcePlatform === 'x' ? "border-blue-500/30" :
                "border-border"
              )}>
                {/* Header strip */}
                <div className={cn(
                  "px-3 py-1.5 border-b flex items-center gap-2 shrink-0",
                  sourcePlatform === 'tiktok' ? "bg-purple-500/10 border-purple-500/20" :
                  sourcePlatform === 'x' ? "bg-blue-500/10 border-blue-500/20" :
                  "bg-muted/40 border-border"
                )}>
                  <Brain className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">Cortex AI · {format(new Date(f.created_at), 'MMM d, h:mm a')}</span>
                  {rating !== null && (
                    <span className={cn(
                      "text-sm px-2 py-0.5 rounded-full font-bold ml-auto shrink-0",
                      rating >= 8 ? "bg-primary/20 text-primary" :
                      rating >= 6 ? "bg-accent/20 text-accent-foreground" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {rating}/10
                    </span>
                  )}
                </div>

                {/* Card body — scrollable */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {/* Title + image row */}
                  <div className="flex items-start gap-2.5">
                    {narrativeImage && (
                      <img
                        src={narrativeImage}
                        alt={f.title}
                        className="w-14 h-14 rounded-lg object-cover bg-muted border border-border shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-foreground line-clamp-1 leading-tight">{f.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {sourceIcon(normSource(f.category))} {SOURCE_LABELS[normSource(f.category)] || 'Other'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium capitalize">{f.finding_type}</span>
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  {f.summary && (
                    <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{f.summary}</p>
                  )}

                  {/* Deploy fields (compact) */}
                  {isNarrative && (rawData.name || rawData.symbol) && (
                    <div className="grid gap-1 p-2 rounded-md bg-background border border-border text-xs">
                      {rawData.name && (
                        <div className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0">Name</span><span className="text-foreground font-semibold truncate">{rawData.name}</span></div>
                      )}
                      {rawData.symbol && (
                        <div className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0">Symbol</span><span className="text-foreground font-mono font-bold">${rawData.symbol}</span></div>
                      )}
                      {rawData.deploy_window && (
                        <div className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0">Window</span><span className={cn("font-semibold", rawData.deploy_window === 'NOW' ? "text-primary" : "text-foreground")}>{rawData.deploy_window}</span></div>
                      )}
                      {rawData.competition && (
                        <div className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0">Comp.</span><span className="text-foreground truncate">{rawData.competition}</span></div>
                      )}
                      {rawData.risk && (
                        <div className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0">Risk</span><span className="text-foreground truncate">{rawData.risk}</span></div>
                      )}
                    </div>
                  )}

                  {/* Rating justification */}
                  {isNarrative && rawData.rating_justification && (
                    <div className="p-2 rounded-md bg-primary/5 border border-primary/10">
                      <p className="text-sm text-foreground leading-snug line-clamp-3">
                        <Zap className="h-2.5 w-2.5 inline mr-0.5 text-primary" />
                        <strong>{rating}/10</strong> — {rawData.rating_justification}
                      </p>
                    </div>
                  )}

              {/* Tweet sources (compact) */}
                  {tweetSources.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">𝕏 Sources</span>
                      {tweetSources.slice(0, 1).map((tw, j) => (
                        <div key={j} className="rounded-md border border-blue-500/20 bg-blue-500/5 p-1.5 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <XIcon className="h-2.5 w-2.5 text-blue-400 shrink-0" />
                            <span className="text-xs font-bold text-foreground truncate">@{tw.user}</span>
                            <span className="text-[10px] text-blue-400 ml-auto shrink-0">{tw.engagement}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">{tw.text}</p>
                          {tw.url && (
                            <a href={tw.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:underline">
                              <ExternalLink className="h-2.5 w-2.5" /> View
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TikTok sources */}
                  {(rawData?.trigger_tiktoks as TriggerTikTok[])?.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border">
                      <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">🎵 TikTok</span>
                      {(rawData.trigger_tiktoks as TriggerTikTok[]).slice(0, 1).map((tt: TriggerTikTok, j: number) => (
                        <div key={j} className="rounded-md border border-purple-500/20 bg-purple-500/5 p-1.5 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Music className="h-2.5 w-2.5 text-purple-400 shrink-0" />
                            <span className="text-xs font-bold text-foreground truncate">{tt.author}</span>
                            <span className="text-[10px] text-pink-400 ml-auto shrink-0">▶ {tt.plays}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">{tt.text}</p>
                          {tt.url && (
                            <a href={tt.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-purple-400 hover:underline">
                              <ExternalLink className="h-2.5 w-2.5" /> View
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border shrink-0 bg-muted/20">
                  {f.source_url && (
                    <Button variant="ghost" size="sm" className="h-8 text-sm gap-1.5 px-2" onClick={() => window.open(f.source_url, '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5" /> Source
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 text-sm gap-1.5 px-2" onClick={() => copyToClipboard(`${f.title}\n${f.summary || ''}\n${f.source_url || ''}`)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  {f.status !== 'converted' && selectedSource !== 'x' && (
                    <Button variant="ghost" size="sm" className="h-8 text-sm gap-1.5 px-2 text-primary" onClick={() => handleConvertToClient(f)} disabled={converting === f.id}>
                      <UserPlus className="h-3.5 w-3.5" /> {converting === f.id ? '...' : 'Convert'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 text-sm gap-1.5 px-2 text-destructive ml-auto" onClick={() => setDeleteId(f.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && !loading && (
            <div className="col-span-2 text-center py-16 text-muted-foreground">
              No findings from {activeSrc?.label || 'this source'} yet.
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Finding?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this research finding.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPurgeConfirm} onOpenChange={setShowPurgeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge All X Findings?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete all {filtered.length} findings in this view. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePurgeAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={purging}>
              {purging ? 'Purging...' : `Delete ${filtered.length} findings`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
