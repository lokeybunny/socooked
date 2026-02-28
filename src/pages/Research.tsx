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
import { Plus, Search, ExternalLink, UserPlus, Copy, Trash2, RefreshCw, MapPin, Instagram, Star, ChevronLeft, Activity, Zap, CheckCircle2, Loader2, AlertCircle, Terminal, Brain, TrendingUp, Target } from 'lucide-react';
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

interface Narrative {
  name: string;
  confidence: number;
  why_100x: string;
  example_tokens: string[];
  token_addresses?: string[];
  mcap_range?: string;
  timing: string;
  strategy: string;
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
    setCycleChainOfThought('');
    setCycleReasoning('');
    setEvolvedQueries([]);
    setShowLog(true);

    // Add initial entry immediately so the log panel is visible
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

        // Process complete SSE messages (separated by double newline)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete last chunk

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
              if (data.top_narratives?.length) {
                setTopNarratives(data.top_narratives);
              }
              if (data.top_tweets?.length) {
                setTopTweets(data.top_tweets);
              }
              if (data.chain_of_thought) {
                setCycleChainOfThought(data.chain_of_thought);
              }
              if (data.reasoning) {
                setCycleReasoning(data.reasoning);
              }
              if (data.evolved_queries?.length) {
                setEvolvedQueries(data.evolved_queries);
              }
              toast.success(`Cortex cycle complete: ${data.stats?.tweets ?? 0} tweets, ${data.stats?.tokens ?? 0} tokens, ${data.stats?.matches ?? 0} clusters`);
              load();
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

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">{filtered.length} findings</p>
          <div className="flex items-center gap-2">
            {selectedSource === 'x' && (
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="gap-1.5"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="h-4 w-4" />
                )}
                {generating ? 'Cortex running...' : 'Generate Research'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Finding</Button>
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

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {FINDING_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* ══════ Cortex Pipeline Log ══════ */}
        {selectedSource === 'x' && showLog && (
          <div className="glass-card rounded-lg overflow-hidden border border-border">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">cortex pipeline</span>
                {generating && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                {!generating && progressLog.length > 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">COMPLETE</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setShowLog(false)}>
                Hide
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 space-y-1.5 bg-background/50 font-mono text-xs">
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

        {/* ══════ Cortex Top Narratives Panel ══════ */}
        {selectedSource === 'x' && topNarratives.length > 0 && (
          <div className="glass-card rounded-lg overflow-hidden border border-emerald-500/30">
            <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20 flex items-center gap-2">
              <Brain className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-bold text-foreground">Cortex Cycle Complete — Top {topNarratives.length} Narratives Right Now</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Cortex Reasoning Summary */}
              {cycleReasoning && cycleReasoning !== 'No Grok analysis available' && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground">Cortex Analysis</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{cycleReasoning}</p>
                </div>
              )}

              {topNarratives.map((n, i) => (
                <div key={i} className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-foreground">{i + 1}.</span>
                      <span className="font-semibold text-foreground">{n.name}</span>
                    </div>
                    <div className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-bold",
                      n.confidence >= 90 ? "bg-primary/20 text-primary" :
                      n.confidence >= 75 ? "bg-accent/20 text-accent-foreground" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {n.confidence}/100
                    </div>
                  </div>

                  {/* Why 100x — Cortex reasoning */}
                  <div className="p-2.5 rounded-md bg-primary/5 border border-primary/10">
                    <p className="text-xs text-foreground leading-relaxed">
                      <Zap className="h-3 w-3 inline mr-1 text-primary" />
                      <strong>Why 100x:</strong> {n.why_100x}
                    </p>
                  </div>

                  {/* Example tokens + metadata */}
                  <div className="flex flex-wrap gap-1.5">
                    {n.example_tokens?.map((t, j) => (
                      <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium">{t}</span>
                    ))}
                    {n.mcap_range && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">MCAP: {n.mcap_range}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1 text-primary">
                      <Target className="h-3 w-3" /> {n.timing}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="h-3 w-3" /> {n.strategy}
                    </span>
                  </div>

                  {/* Matched tweets for this narrative */}
                  {(() => {
                    const narrativeTweets = topTweets.filter(tw => 
                      n.example_tokens?.some(t => t.replace('$', '').toLowerCase() === tw.token_symbol?.toLowerCase())
                    );
                    if (narrativeTweets.length === 0) return null;
                    return (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Supporting Tweets</span>
                        {narrativeTweets.slice(0, 3).map((tw, j) => (
                          <div key={j} className="flex gap-2.5 p-2 rounded-md bg-background/60 border border-border">
                            {/* Profile pic or media */}
                            {(tw.media_url || tw.profile_pic) && (
                              <div className="shrink-0">
                                <img
                                  src={tw.media_url || tw.profile_pic}
                                  alt=""
                                  className={cn(
                                    "object-cover bg-muted",
                                    tw.media_url ? "w-16 h-16 rounded-md" : "w-8 h-8 rounded-full"
                                  )}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {!tw.media_url && tw.profile_pic && (
                                  <img src={tw.profile_pic} alt="" className="w-4 h-4 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                )}
                                <span className="text-[10px] font-semibold text-foreground">@{tw.user}</span>
                                <span className="text-[10px] text-muted-foreground">❤ {tw.favorites} · 🔁 {tw.retweets}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{tw.text}</p>
                              {tw.url && (
                                <a
                                  href={tw.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-1"
                                >
                                  <ExternalLink className="h-2.5 w-2.5" /> View on X
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ))}

              {/* Top tweets that didn't match a narrative */}
              {topTweets.length > 0 && topNarratives.length === 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" /> Top Tweets Found
                  </span>
                  {topTweets.slice(0, 6).map((tw, j) => (
                    <div key={j} className="flex gap-2.5 p-2.5 rounded-md bg-muted/30 border border-border">
                      {(tw.media_url || tw.profile_pic) && (
                        <div className="shrink-0">
                          <img
                            src={tw.media_url || tw.profile_pic}
                            alt=""
                            className={cn(
                              "object-cover bg-muted",
                              tw.media_url ? "w-16 h-16 rounded-md" : "w-8 h-8 rounded-full"
                            )}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-semibold text-foreground">@{tw.user}</span>
                          <span className="text-[10px] px-1 rounded bg-primary/10 text-primary font-mono">${tw.token_symbol}</span>
                          <span className="text-[10px] text-muted-foreground">❤ {tw.favorites} · 🔁 {tw.retweets}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{tw.text}</p>
                        {tw.url && (
                          <a href={tw.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-1">
                            <ExternalLink className="h-2.5 w-2.5" /> View on X
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cycleChainOfThought && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Chain-of-Thought Reasoning</summary>
                  <p className="mt-2 text-muted-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">{cycleChainOfThought}</p>
                </details>
              )}

              {evolvedQueries.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Evolved Search Queries (next cycle)</summary>
                  <ul className="mt-2 space-y-1">
                    {evolvedQueries.map((q, i) => (
                      <li key={i} className="text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded text-[10px]">{q}</li>
                    ))}
                  </ul>
                </details>
              )}

              <p className="text-[10px] text-muted-foreground text-center">
                Say "Hey Zyla" anytime to force a new cycle.
              </p>
            </div>
          </div>
        )}

        {/* Findings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(f => (
            <div key={f.id} className="glass-card p-5 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-semibold text-foreground line-clamp-1">{f.title}</h3>
                <StatusBadge status={f.status} />
              </div>
              {f.summary && <p className="text-xs text-muted-foreground line-clamp-3">{f.summary}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  {sourceIcon(normSource(f.category))} {SOURCE_LABELS[normSource(f.category)] || 'Other'}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium capitalize">{f.finding_type}</span>
                <span className="text-[10px] text-muted-foreground">{f.created_by}</span>
                <span className="text-[10px] text-muted-foreground">· {format(new Date(f.created_at), 'MMM d, h:mm a')}</span>
              </div>
              {f.customers?.full_name && (
                <p className="text-xs text-muted-foreground">→ Converted to: {f.customers.full_name}</p>
              )}
              <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                {f.source_url && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => window.open(f.source_url, '_blank')}>
                    <ExternalLink className="h-3 w-3" /> Source
                  </Button>
                )}
                {f.summary && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => copyToClipboard(`${f.title}\n${f.summary}\n${f.source_url || ''}`)}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                )}
                {f.status !== 'converted' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                    onClick={() => handleConvertToClient(f)}
                    disabled={converting === f.id}
                  >
                    <UserPlus className="h-3 w-3" /> {converting === f.id ? 'Converting...' : 'Convert'}
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive ml-auto" onClick={() => setDeleteId(f.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="col-span-full text-center py-16 text-muted-foreground">
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
    </AppLayout>
  );
}
