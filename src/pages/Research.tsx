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
import { Plus, Search, ExternalLink, UserPlus, Copy, Trash2, RefreshCw, MapPin, Instagram, Star, ChevronLeft, Activity, Zap, CheckCircle2, Loader2, AlertCircle, Terminal } from 'lucide-react';
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
  const spacebotFindings = allFindings.filter(f => f.created_by === 'spacebot');
  const lastSpacebotPush = spacebotFindings[0]?.created_at;
  const spacebotCycleCount = spacebotFindings.length;
  const isSpacebotRecent = lastSpacebotPush && (Date.now() - new Date(lastSpacebotPush).getTime()) < 20 * 60 * 1000; // within 20min

  const handleGenerate = async () => {
    setGenerating(true);
    setProgressLog([]);
    setShowLog(true);

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

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

              if (currentEvent === 'progress') {
                setProgressLog(prev => {
                  const existing = prev.findIndex(p => p.step === data.step && p.label === data.label);
                  const entry = { step: data.step, label: data.label, status: data.status, detail: data.detail, ts: now };
                  if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = entry;
                    return updated;
                  }
                  return [...prev, entry];
                });
              } else if (currentEvent === 'complete') {
                toast.success(`Research complete: ${data.stats?.tweets ?? 0} tweets, ${data.stats?.tokens ?? 0} tokens, ${data.stats?.matches ?? 0} matches`);
                load();
              } else if (currentEvent === 'error') {
                toast.error(data.message || 'Generation failed');
              }
            } catch { /* skip bad JSON */ }
            currentEvent = '';
          }
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Research generation failed');
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

          {/* Spacebot Status Indicator */}
          <div className="w-full max-w-md mx-auto">
            <div className="glass-card rounded-lg px-4 py-3 flex items-center gap-3">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                isSpacebotRecent ? "bg-emerald-500/15" : "bg-muted"
              )}>
                <Activity className={cn(
                  "h-4 w-4",
                  isSpacebotRecent ? "text-emerald-500 animate-pulse" : "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">spacebot</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                    isSpacebotRecent
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : lastSpacebotPush
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                  )}>
                    {isSpacebotRecent ? 'LIVE' : lastSpacebotPush ? 'IDLE' : 'NEVER RUN'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {lastSpacebotPush
                    ? `Last cycle ${formatDistanceToNow(new Date(lastSpacebotPush), { addSuffix: true })} · ${spacebotCycleCount} findings`
                    : 'No data pushed yet — run spacebot.sh to begin'}
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
                <Zap className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`} />
                {generating ? 'Generating...' : 'Generate Research'}
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

        {/* Live Progress Log */}
        {selectedSource === 'x' && showLog && progressLog.length > 0 && (
          <div className="glass-card rounded-lg overflow-hidden border border-border">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">spacebot pipeline</span>
                {generating && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                {!generating && progressLog.some(p => p.status === 'done') && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">COMPLETE</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setShowLog(false)}>
                Hide
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto p-3 space-y-1.5 bg-background/50 font-mono text-xs">
              {progressLog.map((entry, i) => (
                <div key={`${entry.step}-${entry.label}-${i}`} className="flex items-start gap-2 animate-fade-in">
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
                      [{entry.step}] {entry.label}
                    </span>
                    <p className="text-muted-foreground truncate">{entry.detail}</p>
                  </div>
                </div>
              ))}
              <div ref={logEndRef} />
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
