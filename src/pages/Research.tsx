import { useEffect, useState, useRef, useCallback } from 'react'; // refresh
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Search, ExternalLink, UserPlus, Copy, Trash2, RefreshCw, MapPin, Instagram, Star, ChevronLeft, Activity, Zap, CheckCircle2, Loader2, AlertCircle, Terminal, Brain, TrendingUp, Target, Play, Music, Eye, Archive, Briefcase, Globe, Building2, Mail, Phone, Linkedin, Users, ImageIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useResearchLoop } from '@/hooks/useResearchLoop';
import { useLeadLoop } from '@/hooks/useLeadLoop';
import { useYelpLoop } from '@/hooks/useYelpLoop';
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
const STATUSES = ['new', 'reviewed', 'converted', 'dismissed', 'drafted'] as const;

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



interface Narrative {
  name: string;
  symbol: string;
  description: string;
  narrative_rating: number;
  rating_justification: string;
  tweet_sources: TweetSource[];
  
  on_chain_evidence: string;
  competition: string;
  deploy_window: string;
  risk: string;
  website?: string;
  twitter_source_url?: string;
  
  source_platform?: string;
  image_gen_prompt?: string;
  tier?: string;
  // Legacy compat
  bundle_score?: number;
  suggested_tickers?: string[];
  why_bundle?: string;
}

export default function Research() {
  const researchLoop = useResearchLoop();
  const leadLoop = useLeadLoop();
  const { loopState } = researchLoop;
  const generating = loopState.generating;
  const loopActive = loopState.active;
  const progressLog = loopState.progressLog;
  const scrapeSources = loopState.sources;
  const loopInterval = loopState.interval;

  const leadState = leadLoop.loopState;
  const leadGenerating = leadState.generating;
  const leadLoopActive = leadState.active;
  const leadProgressLog = leadState.progressLog;
  const leadInterval = leadState.interval;

  const yelpLoop = useYelpLoop();
  const yelpState = yelpLoop.loopState;
  const yelpGenerating = yelpState.generating;
  const yelpLoopActive = yelpState.active;
  const yelpProgressLog = yelpState.progressLog;
  const yelpInterval = yelpState.interval;

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
  const [showLog, setShowLog] = useState(false);
  const [topNarratives, setTopNarratives] = useState<Narrative[]>([]);
  const [topTweets, setTopTweets] = useState<MatchedTweet[]>([]);
  const [cycleChainOfThought, setCycleChainOfThought] = useState('');
  const [cycleReasoning, setCycleReasoning] = useState('');
  const [evolvedQueries, setEvolvedQueries] = useState<string[]>([]);
  const [creditsDepleted, setCreditsDepleted] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftFindings, setDraftFindings] = useState<any[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [detailNarrative, setDetailNarrative] = useState<Narrative | null>(null);
  const [customerDetail, setCustomerDetail] = useState<any | null>(null);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // New finding form
  const [title, setTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [findingType, setFindingType] = useState<string>('lead');
  const [findingSource, setFindingSource] = useState<string>('other');
  const [creating, setCreating] = useState(false);

  // Lead Finder state (for "Other" source)
  const [lfJobTitle, setLfJobTitle] = useState('');
  const [lfLocation, setLfLocation] = useState('');
  const [lfCity, setLfCity] = useState('');
  const [lfIndustry, setLfIndustry] = useState('');
  const [lfKeywords, setLfKeywords] = useState('');
  const [lfFetchCount, setLfFetchCount] = useState('25');
  const [lfSearching, setLfSearching] = useState(false);
  const [lfResults, setLfResults] = useState<any[]>([]);
  const [lfCreatedCount, setLfCreatedCount] = useState(0);
  const [lfHasSearched, setLfHasSearched] = useState(false);

  // Yelp Finder state
  const [yelpSearchTerms, setYelpSearchTerms] = useState('');
  const [yelpLocation, setYelpLocation] = useState('');
  const [yelpMaxItems, setYelpMaxItems] = useState('30');
  const [yelpSearching, setYelpSearching] = useState(false);
  const [yelpResults, setYelpResults] = useState<any[]>([]);
  const [yelpCreatedCount, setYelpCreatedCount] = useState(0);
  const [yelpHasSearched, setYelpHasSearched] = useState(false);

  const handleYelpSearch = async () => {
    if (!yelpSearchTerms && !yelpLocation) {
      toast.error('Enter search terms or a location');
      return;
    }
    setYelpSearching(true);
    setYelpHasSearched(true);
    setYelpResults([]);
    setYelpCreatedCount(0);
    try {
      const payload: Record<string, any> = { maxItems: parseInt(yelpMaxItems) || 30, sortBy: 'rating' };
      if (yelpSearchTerms) payload.searchTerms = yelpSearchTerms.split(',').map(s => s.trim()).filter(Boolean);
      if (yelpLocation) payload.location = yelpLocation.trim();

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 210_000);

      const resp = await fetch(`${supabaseUrl}/functions/v1/yelp-finder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(errBody || `Request failed (${resp.status})`);
      }
      const data = await resp.json();

      setYelpResults(data.businesses || []);
      setYelpCreatedCount(data.created_count || 0);
      if (data.created_count > 0) {
        toast.success(`Found ${data.low_rated_count} low-rated businesses, ${data.created_count} new added`);
        load();
      } else if (data.low_rated_count > 0) {
        toast.info(`Found ${data.low_rated_count} low-rated businesses (all already in CRM)`);
      } else {
        toast.info(`Found ${data.all_results || 0} businesses but none rated 3★ or below.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Yelp search failed');
    } finally {
      setYelpSearching(false);
    }
  };

  const handleLeadFinderSearch = async () => {
    if (!lfJobTitle && !lfLocation && !lfCity && !lfIndustry && !lfKeywords) {
      toast.error('Fill in at least one search field');
      return;
    }
    setLfSearching(true);
    setLfHasSearched(true);
    setLfResults([]);
    setLfCreatedCount(0);
    try {
      const payload: Record<string, any> = { fetch_count: parseInt(lfFetchCount) || 25 };
      if (lfJobTitle) payload.contact_job_title = lfJobTitle.split(',').map(s => s.trim()).filter(Boolean);
      if (lfLocation) payload.contact_location = lfLocation.split(',').map(s => s.trim()).filter(Boolean);
      if (lfCity) payload.contact_city = lfCity.split(',').map(s => s.trim()).filter(Boolean);
      if (lfIndustry) payload.company_industry = lfIndustry.split(',').map(s => s.trim()).filter(Boolean);
      if (lfKeywords) payload.company_keywords = lfKeywords.split(',').map(s => s.trim()).filter(Boolean);

      // Use raw fetch with extended timeout — Apify sync calls can take 2-3 minutes
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 210_000); // 3.5 min timeout
      
      const resp = await fetch(`${supabaseUrl}/functions/v1/lead-finder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(errBody || `Request failed (${resp.status})`);
      }
      const data = await resp.json();

      setLfResults(data.leads || []);
      setLfCreatedCount(data.created_count || 0);
      if (data.created_count > 0) {
        toast.success(`Found ${data.total_found} leads, ${data.created_count} new added`);
        load(); // Refresh findings
      } else if (data.total_found > 0) {
        toast.info(`Found ${data.total_found} leads (all already in CRM)`);
      } else {
        toast.info('No leads found. Try broadening your criteria.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Lead search failed');
    } finally {
      setLfSearching(false);
    }
  };

  const validSources = RESEARCH_SOURCES.map(s => s.id);
  const normSource = (c: string | null) => (c && validSources.includes(c) ? c : 'other');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('research_findings')
      .select('*, customers(full_name, email)')
      .neq('status', 'drafted')
      .order('created_at', { ascending: false });
    setAllFindings(data || []);
    setLoading(false);
  };

  const loadDrafts = async () => {
    const { data } = await supabase
      .from('research_findings')
      .select('*')
      .eq('status', 'drafted')
      .order('created_at', { ascending: false });
    setDraftFindings(data || []);
    setDraftCount(data?.length || 0);
  };

  const loadDraftCount = async () => {
    const { count } = await supabase
      .from('research_findings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'drafted');
    setDraftCount(count || 0);
  };

  useEffect(() => { load(); loadDraftCount(); }, []);

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

  // Client-side dedup helper for X findings: keep first occurrence by symbol/name/media_url
  const deduplicateXFindings = useCallback((items: any[]) => {
    const seen = new Set<string>();
    return items.filter(f => {
      if (normSource(f.category) !== 'x') return true;
      // Filter out cycle reports entirely — only show individual narratives
      const tags: string[] = f.tags || [];
      if (tags.includes('cycle-report')) return false;
      const rd = f.raw_data || {};
      if (rd.type === 'cycle_report' || f.title?.includes('NarrativeEdge Cycle') || f.title?.includes('Cortex Analyst Report')) return false;
      // Build composite keys from symbol, name, and first media_url
      const keys: string[] = [];
      if (rd.symbol) keys.push(`sym:${String(rd.symbol).toLowerCase()}`);
      if (rd.name) keys.push(`name:${String(rd.name).toLowerCase()}`);
      const media = rd.media_url || rd.tweet_sources?.[0]?.media_url;
      if (media) keys.push(`media:${media}`);
      // If no keys, keep it (can't dedup)
      if (keys.length === 0) return true;
      // If ANY key was already seen, it's a duplicate
      if (keys.some(k => seen.has(k))) return false;
      keys.forEach(k => seen.add(k));
      return true;
    });
  }, []);

  useEffect(() => {
    let items = selectedSource
      ? allFindings.filter(f => normSource(f.category) === selectedSource)
      : allFindings;
    items = deduplicateXFindings(items);
    setFindings(items);
  }, [selectedSource, allFindings, deduplicateXFindings]);

  const categoryCounts = RESEARCH_SOURCES.reduce((acc, src) => {
    const catItems = allFindings.filter(f => normSource(f.category) === src.id);
    // For X, apply dedup so the badge matches displayed count
    acc[src.id] = src.id === 'x' ? deduplicateXFindings(catItems).length : catItems.length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = findings.filter(f => {
    if (filterType !== 'all' && f.finding_type !== filterType) return false;
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    return true;
  });

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [filterType, filterStatus, selectedSource]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedFiltered = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

  const openCustomerDetail = async (customerId: string) => {
    if (!customerId) return;
    setCustomerDetailLoading(true);
    const { data } = await supabase.from('customers').select('*').eq('id', customerId).single();
    setCustomerDetail(data);
    setCustomerDetailLoading(false);
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

  const handleGenerate = () => {
    setTopNarratives([]);
    setTopTweets([]);
    // TikTok removed
    setCycleChainOfThought('');
    setCycleReasoning('');
    setEvolvedQueries([]);
    setShowLog(true);
    setCreditsDepleted(false);
    researchLoop.runOnce();
  };

  const startLoop = () => {
    if (!loopInterval) return;
    setShowLog(true);
    researchLoop.startLoop();
  };

  const stopLoop = () => {
    researchLoop.stopLoop();
    toast.info('Auto-generate loop stopped');
  };

  // Wire up onComplete callback to consume results
  useEffect(() => {
    researchLoop.onComplete.current = (data: any) => {
      if (data.top_narratives?.length) setTopNarratives(data.top_narratives);
      if (data.top_tweets?.length) setTopTweets(data.top_tweets);
      // TikTok radar removed
      if (data.chain_of_thought) setCycleChainOfThought(data.chain_of_thought);
      if (data.reasoning) setCycleReasoning(data.reasoning);
      if (data.evolved_queries?.length) setEvolvedQueries(data.evolved_queries);
      if (data.stats?.credits_depleted) setCreditsDepleted(true);
      toast.success(`Cortex cycle complete: ${data.stats?.tweets ?? 0} tweets, ${data.stats?.tokens ?? 0} tokens, ${data.stats?.matches ?? 0} clusters`);
      load();
    };
    return () => { researchLoop.onComplete.current = null; };
  }, []);

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
                    className="px-3 py-1.5 rounded text-base font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  >
                    𝕏 X
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
                      onClick={() => researchLoop.setInterval(loopInterval === opt.val ? null : opt.val)}
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
            {selectedSource === 'other' && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                  <span className="px-3 py-1.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    🤖 Lead Agent
                  </span>
                </div>
                {/* All States toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer rounded-md border border-border bg-muted/30 px-3 py-1.5">
                  <Checkbox
                    checked={leadLoop.loopState.allStates}
                    onCheckedChange={(checked) => leadLoop.setAllStates(!!checked)}
                  />
                  <span className="text-xs font-medium text-foreground">All States</span>
                </label>
                <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                  {[
                    { label: '5m', val: 5 },
                    { label: '15m', val: 15 },
                    { label: '30m', val: 30 },
                    { label: '1h', val: 60 },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => leadLoop.setInterval(leadInterval === opt.val ? null : opt.val)}
                      className={cn(
                        "px-3 py-1.5 rounded text-sm font-semibold transition-colors",
                        leadInterval === opt.val ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {leadLoopActive ? (
                  <Button size="sm" variant="destructive" onClick={() => { leadLoop.stopLoop(); }} className="gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" /> Stop Agent
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={leadInterval ? () => leadLoop.startLoop() : () => leadLoop.runOnce()}
                    disabled={leadGenerating}
                    className="gap-1.5"
                  >
                    {leadGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                    {leadGenerating ? 'Searching...' : leadInterval ? `Loop ${leadInterval}m` : 'Run Once'}
                  </Button>
                )}
              </div>
            )}
            {selectedSource === 'yelp' && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                  <span className="px-3 py-1.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                    ⭐ Yelp Agent
                  </span>
                </div>
                {/* All Cities toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer rounded-md border border-border bg-muted/30 px-3 py-1.5">
                  <Checkbox
                    checked={yelpLoop.loopState.allCities}
                    onCheckedChange={(checked) => yelpLoop.setAllCities(!!checked)}
                  />
                  <span className="text-xs font-medium text-foreground">All Cities</span>
                </label>
                <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                  {[
                    { label: '5m', val: 5 },
                    { label: '15m', val: 15 },
                    { label: '30m', val: 30 },
                    { label: '1h', val: 60 },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => yelpLoop.setInterval(yelpInterval === opt.val ? null : opt.val)}
                      className={cn(
                        "px-3 py-1.5 rounded text-sm font-semibold transition-colors",
                        yelpInterval === opt.val ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {yelpLoopActive ? (
                  <Button size="sm" variant="destructive" onClick={() => { yelpLoop.stopLoop(); }} className="gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" /> Stop Agent
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={yelpInterval ? () => yelpLoop.startLoop() : () => yelpLoop.runOnce()}
                    disabled={yelpGenerating}
                    className="gap-1.5"
                  >
                    {yelpGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                    {yelpGenerating ? 'Searching...' : yelpInterval ? `Loop ${yelpInterval}m` : 'Run Once'}
                  </Button>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              {selectedSource === 'x' && (
                <Button
                  variant={showDrafts ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { setShowDrafts(!showDrafts); if (!showDrafts) loadDrafts(); }}
                >
                  <Archive className="h-4 w-4" /> Drafts{draftCount > 0 && ` (${draftCount})`}
                </Button>
              )}
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

        {/* ══════ Lead Agent Pipeline Log ══════ */}
        {selectedSource === 'other' && leadProgressLog.length > 0 && (
          <div className="glass-card rounded-lg overflow-hidden border border-border">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-foreground">lead agent pipeline</span>
                {leadGenerating && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                {!leadGenerating && leadState.cyclesCompleted > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                    {leadState.cyclesCompleted} cycles · {leadState.totalNewCreated} new leads
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => leadLoop.clearLog()}>
                Clear
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 space-y-1.5 bg-background/50 font-mono text-sm">
              {leadProgressLog.map((entry, i) => (
                <div key={`lead-${entry.step}-${i}`} className="flex items-start gap-2 animate-fade-in">
                  <span className="text-muted-foreground shrink-0 w-16">{entry.ts}</span>
                  <span className="shrink-0">
                    {entry.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : entry.status === 'done' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className={cn(
                      "font-medium",
                      entry.status === 'running' ? "text-foreground" : entry.status === 'done' ? "text-muted-foreground" : "text-destructive"
                    )}>
                      {entry.label}
                    </span>
                    <p className="text-muted-foreground break-words">{entry.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════ Yelp Agent Pipeline Log ══════ */}
        {selectedSource === 'yelp' && yelpProgressLog.length > 0 && (
          <div className="glass-card rounded-lg overflow-hidden border border-border">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-semibold text-foreground">yelp agent pipeline</span>
                {yelpGenerating && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                {!yelpGenerating && yelpState.cyclesCompleted > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 font-medium">
                    {yelpState.cyclesCompleted} cycles · {yelpState.totalNewCreated} new leads
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => yelpLoop.clearLog()}>
                Clear
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 space-y-1.5 bg-background/50 font-mono text-sm">
              {yelpProgressLog.map((entry, i) => (
                <div key={`yelp-${entry.step}-${i}`} className="flex items-start gap-2 animate-fade-in">
                  <span className="text-muted-foreground shrink-0 w-16">{entry.ts}</span>
                  <span className="shrink-0">
                    {entry.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : entry.status === 'done' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-yellow-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className={cn(
                      "font-medium",
                      entry.status === 'running' ? "text-foreground" : entry.status === 'done' ? "text-muted-foreground" : "text-destructive"
                    )}>
                      {entry.label}
                    </span>
                    <p className="text-muted-foreground break-words">{entry.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Credits depleted warning removed — using Apify agents only */}

        {/* TikTok radar removed */}

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
                          {(n.twitter_source_url || n.tweet_sources?.[0]?.url) && (
                            <a
                              href={n.twitter_source_url || n.tweet_sources[0].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-blue-400 transition-colors"
                              title="View original post"
                            >
                              <Eye className="h-3 w-3" />
                            </a>
                          )}
                          <button onClick={() => setDetailNarrative(n)} className="text-muted-foreground hover:text-foreground" title="View full details">
                            <ExternalLink className="h-3 w-3" />
                          </button>
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

                        {(n.tweet_sources?.length > 0 || n.twitter_source_url) && (
                          <div className="pt-0.5 border-t border-border space-y-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">𝕏 Sources</span>
                            {n.tweet_sources?.length > 0 ? (
                              n.tweet_sources.slice(0, 1).map((tw, j) => (
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
                              ))
                            ) : n.twitter_source_url ? (
                              <div className="flex items-center gap-1 text-xs">
                                <XIcon className="h-2.5 w-2.5 text-blue-400 shrink-0" />
                                <a href={n.twitter_source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">
                                  View original post
                                </a>
                                <a href={n.twitter_source_url} target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-400 hover:underline shrink-0">
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              </div>
                            ) : null}
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

        {/* ══════ Drafts Panel ══════ */}
        {showDrafts && selectedSource === 'x' && (
          <div className="glass-card rounded-lg overflow-hidden border border-amber-500/30">
            <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-bold text-foreground">📁 Drafts — {draftFindings.length} findings</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">Auto-archived after 24h · Deleted after 7 days</span>
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setShowDrafts(false)}>
                Hide
              </Button>
            </div>
            {draftFindings.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No drafted findings yet. Findings are auto-drafted 24 hours after generation.
              </div>
            ) : (
              <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto">
                {draftFindings.map(f => {
                  const rd = f.raw_data as any;
                  return (
                    <div key={f.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2 space-y-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[10px] text-muted-foreground truncate">{format(new Date(f.created_at), 'M/d h:mma')}</span>
                        {rd?.narrative_rating && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 ml-auto shrink-0">{rd.narrative_rating}/10</span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-foreground line-clamp-2 break-words">{f.title}</h4>
                      {rd?.symbol && <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">${rd.symbol}</span>}
                      {rd?.deploy_window && <span className="text-[10px] text-muted-foreground block">⏱ {rd.deploy_window}</span>}
                      <div className="flex items-center gap-1 pt-1">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => copyToClipboard(`${f.title}\n${f.summary || ''}\n${f.source_url || ''}`)}>
                          <Copy className="h-2.5 w-2.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-destructive ml-auto" onClick={async () => {
                          await supabase.from('research_findings').delete().eq('id', f.id);
                          loadDrafts();
                          toast.success('Draft deleted');
                        }}>
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════ Lead Finder Panel (Other source) ══════ */}
        {selectedSource === 'other' && (
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Lead Finder — B2B Leads via Apify
              </CardTitle>
              <p className="text-xs text-muted-foreground">Generate B2B leads with verified emails. Results auto-save as findings + create CRM customers in the "Potential" category.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Briefcase className="h-3 w-3" /> Job Title</Label>
                  <Input value={lfJobTitle} onChange={e => setLfJobTitle(e.target.value)} placeholder="e.g. CEO, Realtor, Marketing Manager" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Globe className="h-3 w-3" /> Location</Label>
                  <Input value={lfLocation} onChange={e => setLfLocation(e.target.value)} placeholder="e.g. United States, California" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><MapPin className="h-3 w-3" /> City</Label>
                  <Input value={lfCity} onChange={e => setLfCity(e.target.value)} placeholder="e.g. Los Angeles, Miami" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Building2 className="h-3 w-3" /> Industry</Label>
                  <Input value={lfIndustry} onChange={e => setLfIndustry(e.target.value)} placeholder="e.g. Real Estate, SaaS" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Company Keywords</Label>
                  <Input value={lfKeywords} onChange={e => setLfKeywords(e.target.value)} placeholder="e.g. AI, blockchain" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs"># Leads (max 100)</Label>
                  <Input type="number" value={lfFetchCount} onChange={e => setLfFetchCount(e.target.value)} min="1" max="100" className="h-9 text-sm" />
                </div>
              </div>
              <Button onClick={handleLeadFinderSearch} disabled={lfSearching} size="sm">
                {lfSearching ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching…</> : <><Target className="h-4 w-4 mr-2" /> Find Leads</>}
              </Button>

              {/* Searching state */}
              {lfSearching && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                    <p className="text-xs text-muted-foreground">Searching for leads… This may take up to 3 minutes.</p>
                  </div>
                </div>
              )}

              {/* Results preview */}
              {!lfSearching && lfHasSearched && lfResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {lfResults.length} leads found · <span className="text-primary font-medium">{lfCreatedCount} new</span> added to CRM & findings
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
                    {lfResults.slice(0, 12).map((lead: any, i: number) => {
                      const name = lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
                      return (
                        <div key={i} className="rounded-lg border border-border bg-muted/30 p-2 space-y-1 text-xs">
                          <span className="font-semibold text-foreground block truncate">{name}</span>
                          {lead.job_title && <span className="text-muted-foreground block truncate">{lead.job_title}</span>}
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            {lead.email && <span className="flex items-center gap-0.5"><Mail className="h-2.5 w-2.5" />{lead.email}</span>}
                            {lead.company_name && <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{lead.company_name}</span>}
                            {lead.linkedin && (
                              <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary hover:underline">
                                <Linkedin className="h-2.5 w-2.5" /> LinkedIn
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {lfResults.length > 12 && <p className="text-[10px] text-muted-foreground">+{lfResults.length - 12} more (all saved as findings below)</p>}
                </div>
              )}

              {!lfSearching && lfHasSearched && lfResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No leads found. Try broadening your search criteria.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════ Yelp Finder Panel ══════ */}
        {selectedSource === 'yelp' && (
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Yelp Finder — Low-Rated Businesses (3★ & Below)
              </CardTitle>
              <p className="text-xs text-muted-foreground">Search Yelp for businesses rated 3 stars or below. Results auto-save as findings + create CRM customers in the "Potential" category.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Search className="h-3 w-3" /> Search Terms</Label>
                  <Input value={yelpSearchTerms} onChange={e => setYelpSearchTerms(e.target.value)} placeholder="e.g. restaurant, plumber, dentist" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><MapPin className="h-3 w-3" /> Location</Label>
                  <Input value={yelpLocation} onChange={e => setYelpLocation(e.target.value)} placeholder="e.g. Los Angeles, CA" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs"># Results (max 100)</Label>
                  <Input type="number" value={yelpMaxItems} onChange={e => setYelpMaxItems(e.target.value)} min="1" max="100" className="h-9 text-sm" />
                </div>
              </div>
              <Button onClick={handleYelpSearch} disabled={yelpSearching} size="sm">
                {yelpSearching ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching…</> : <><Star className="h-4 w-4 mr-2" /> Find Low-Rated</>}
              </Button>

              {/* Searching state */}
              {yelpSearching && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-6 w-6 animate-spin text-yellow-500 mx-auto" />
                    <p className="text-xs text-muted-foreground">Searching Yelp… This may take up to 3 minutes.</p>
                  </div>
                </div>
              )}

              {/* Results preview */}
              {!yelpSearching && yelpHasSearched && yelpResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {yelpResults.length} low-rated businesses found · <span className="text-yellow-500 font-medium">{yelpCreatedCount} new</span> added to CRM & findings
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                    {yelpResults.slice(0, 16).map((biz: any, i: number) => (
                      <div key={i} className="rounded-lg border border-border bg-muted/30 overflow-hidden text-xs">
                        {biz.primaryPhoto && (
                          <img src={biz.primaryPhoto} alt={biz.title} className="w-full h-24 object-cover bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        <div className="p-2 space-y-1">
                          <span className="font-semibold text-foreground block truncate">{biz.title}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-500 font-bold">{biz.rating}★</span>
                            <span className="text-muted-foreground">({biz.reviewCount} reviews)</span>
                          </div>
                          {biz.categories?.length > 0 && (
                            <span className="text-muted-foreground block truncate">{biz.categories.join(", ")}</span>
                          )}
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            {biz.phoneNumber && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{biz.phoneNumber}</span>}
                            {biz.address?.city && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{biz.address.city}, {biz.address.regionCode}</span>}
                            {biz.url && (
                              <a href={biz.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-yellow-500 hover:underline">
                                <ExternalLink className="h-2.5 w-2.5" /> Yelp
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {yelpResults.length > 16 && <p className="text-[10px] text-muted-foreground">+{yelpResults.length - 16} more (all saved as findings below)</p>}
                </div>
              )}

              {!yelpSearching && yelpHasSearched && yelpResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No businesses rated 3★ or below found. Try different search terms or location.</p>
              )}
            </CardContent>
          </Card>
        )}


        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {paginatedFiltered.filter(f => {
            // Gate: only show findings with required narrative fields
            const rd = f.raw_data as any;
            if (!rd) return false;
            const hasName = !!(rd.name || f.title);
            const hasSymbol = !!rd.symbol;
            const hasWindow = !!rd.deploy_window;
            const hasSources = (rd.tweet_sources?.length > 0) || (rd.type === 'lead_finder') || (rd.type === 'yelp_business');
            // X findings require media (image/video)
            const isX = normSource(f.category) === 'x';
            const hasMedia = !!(rd.media_url || rd.tweet_sources?.find((ts: any) => ts.media_url));
            if (isX && !hasMedia) return false;
            return hasName && hasSymbol && hasWindow && hasSources;
          }).map(f => {
            const rawData = f.raw_data as any;
            const isNarrative = rawData?.type === 'narrative_report';
            const rating = rawData?.narrative_rating ?? rawData?.bundle_score ?? null;
            const tweetSources: TweetSource[] = rawData?.tweet_sources || [];
            const narrativeImage = tweetSources.find(ts => ts.media_url)?.media_url || rawData?.media_url || rawData?.photo || '';
            const sourcePlatform = rawData?.source_platform;

            return (
              <div key={f.id} className={cn(
                "glass-card overflow-hidden hover:shadow-lg transition-shadow rounded-xl border flex flex-col min-w-0",
                sourcePlatform === 'yelp-finder' ? "border-yellow-500/30" :
                sourcePlatform === 'lead-finder' ? "border-emerald-500/30" :
                sourcePlatform === 'tiktok' ? "border-purple-500/30" :
                sourcePlatform === 'x' ? "border-blue-500/30" :
                "border-border"
              )}>
                {/* Header strip */}
                <div className={cn(
                  "px-2 py-1 border-b flex items-center gap-1 shrink-0 min-w-0 overflow-hidden",
                  sourcePlatform === 'tiktok' ? "bg-purple-500/10 border-purple-500/20" :
                  sourcePlatform === 'x' ? "bg-blue-500/10 border-blue-500/20" :
                  "bg-muted/40 border-border"
                )}>
                  <Brain className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-[10px] text-muted-foreground truncate min-w-0">{format(new Date(f.created_at), 'M/d h:mma')}</span>
                  {rating !== null && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-auto shrink-0",
                      rating >= 8 ? "bg-primary/20 text-primary" :
                      rating >= 6 ? "bg-accent/20 text-accent-foreground" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {rating}/10
                    </span>
                  )}
                </div>

                {/* Card body — scrollable */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1.5 min-w-0">
                  {/* Title + image row */}
                  <div className="flex items-start gap-2 min-w-0">
                    {narrativeImage && (
                      <img
                        src={narrativeImage}
                        alt={f.title}
                        className="w-10 h-10 rounded-lg object-cover bg-muted border border-border shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                        onClick={(e) => { e.stopPropagation(); setPreviewImage(narrativeImage); }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <h3 className="text-xs font-bold text-foreground line-clamp-2 leading-tight break-words">{f.title}</h3>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {sourceIcon(normSource(f.category))} {SOURCE_LABELS[normSource(f.category)] || 'Other'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium capitalize">{f.finding_type}</span>
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
                      {tweetSources.slice(0, 2).map((tw, j) => {
                        const isGoldCheck = (tw as any).verifiedType === "Business";
                        return (
                          <div key={j} className={cn(
                            "rounded-md p-1.5 space-y-0.5",
                            isGoldCheck ? "border border-yellow-500/40 bg-yellow-500/5" : "border border-blue-500/20 bg-blue-500/5"
                          )}>
                            <div className="flex items-center gap-1">
                              <XIcon className={cn("h-2.5 w-2.5 shrink-0", isGoldCheck ? "text-yellow-500" : "text-blue-400")} />
                              <span className={cn("text-xs font-bold truncate", isGoldCheck ? "text-yellow-500" : "text-foreground")}>@{tw.user}</span>
                              {isGoldCheck && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-500 font-bold shrink-0">✓ GOLD</span>}
                              <span className={cn("text-[10px] ml-auto shrink-0", isGoldCheck ? "text-yellow-500" : "text-blue-400")}>{tw.engagement}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">{tw.text}</p>
                            <div className="flex items-center gap-2">
                              {tw.url && (
                                <a href={tw.url} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-0.5 text-[10px] hover:underline", isGoldCheck ? "text-yellow-500" : "text-blue-400")}>
                                  <ExternalLink className="h-2.5 w-2.5" /> View
                                </a>
                              )}
                              {tw.media_url && (
                                <button onClick={() => setPreviewImage(tw.media_url!)} className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                                  <ImageIcon className="h-2.5 w-2.5" /> Media
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Lead Finder sources */}
                  {rawData?.type === 'lead_finder' && (
                    <div className="space-y-1 pt-1 border-t border-border">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Lead Details</span>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                        {rawData.email && <span className="flex items-center gap-0.5"><Mail className="h-2.5 w-2.5" />{rawData.email}</span>}
                        {rawData.phone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{rawData.phone}</span>}
                        {rawData.company_name && <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{rawData.company_name}</span>}
                        {rawData.linkedin && (
                          <a href={rawData.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary hover:underline">
                            <Linkedin className="h-2.5 w-2.5" /> LinkedIn
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Yelp Business details */}
                  {rawData?.type === 'yelp_business' && (
                    <div className="space-y-1 pt-1 border-t border-border">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Yelp Business</span>
                      <div className="flex items-center gap-1 text-xs">
                        <Star className="h-2.5 w-2.5 text-yellow-500" />
                        <span className="font-bold text-yellow-500">{rawData.rating}★</span>
                        <span className="text-muted-foreground">({rawData.review_count} reviews)</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                        {rawData.phone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{rawData.phone}</span>}
                        {rawData.address && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{rawData.address}</span>}
                        {rawData.website && (
                          <a href={rawData.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-yellow-500 hover:underline">
                            <Globe className="h-2.5 w-2.5" /> Website
                          </a>
                        )}
                        {rawData.yelp_url && (
                          <a href={rawData.yelp_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-yellow-500 hover:underline">
                            <Star className="h-2.5 w-2.5" /> Yelp
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border shrink-0 bg-muted/20">
                  {(rawData?.type === 'lead_finder' || rawData?.type === 'yelp_business') && f.customer_id && (
                    <Button variant="ghost" size="sm" className="h-8 text-sm gap-1.5 px-2" onClick={() => openCustomerDetail(f.customer_id)}>
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                  )}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce((acc: (number | string)[], p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  typeof p === 'string' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground text-sm">…</span>
                  ) : (
                    <Button key={p} size="sm" variant={p === currentPage ? 'default' : 'outline'} className="h-8 w-8 p-0 text-xs" onClick={() => setCurrentPage(p)}>
                      {p}
                    </Button>
                  )
                )}
            </div>
            <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              Next
            </Button>
            <span className="text-xs text-muted-foreground ml-2">{filtered.length} total</span>
          </div>
        )}
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

      {/* Image Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-3xl p-2">
          {previewImage && (
            <img
              src={previewImage}
              alt="Preview"
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
          )}
        </DialogContent>
      </Dialog>


      {/* ══════ Narrative Detail Modal ══════ */}
      <Dialog open={!!detailNarrative} onOpenChange={() => setDetailNarrative(null)}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          {detailNarrative && (() => {
            const n = detailNarrative;
            const rating = n.narrative_rating ?? n.bundle_score ?? 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 flex-wrap">
                    {n.source_platform === 'tiktok' ? <Music className="h-5 w-5 text-purple-500" /> : <XIcon className="h-5 w-5" />}
                    <span>{n.name}</span>
                    {n.symbol && <span className="font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary text-sm">${n.symbol}</span>}
                    {n.tier && (
                      <span className={cn(
                        "text-sm px-2 py-0.5 rounded-full font-black",
                        n.tier === 'S' ? "bg-red-500/20 text-red-400" :
                        n.tier === 'A' ? "bg-amber-500/20 text-amber-400" :
                        "bg-muted text-muted-foreground"
                      )}>Tier {n.tier}</span>
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-sm font-bold",
                      rating >= 8 ? "bg-primary/20 text-primary" :
                      rating >= 6 ? "bg-accent/20 text-accent-foreground" :
                      "bg-muted text-muted-foreground"
                    )}>{rating}/10</span>
                    {n.source_platform && (
                      <span className={cn(
                        "text-sm px-2 py-0.5 rounded-full font-bold",
                        n.source_platform === 'cross-platform' ? "bg-amber-500/20 text-amber-400" :
                        n.source_platform === 'tiktok' ? "bg-purple-500/20 text-purple-400" :
                        "bg-blue-500/20 text-blue-400"
                      )}>
                        {n.source_platform === 'cross-platform' ? '🔀 X + TikTok' : n.source_platform === 'tiktok' ? '🎵 TikTok' : '𝕏 X (Twitter)'}
                      </span>
                    )}
                  </div>

                  {n.description && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</span>
                      <p className="text-sm text-foreground leading-relaxed">{n.description}</p>
                    </div>
                  )}

                  {n.rating_justification && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Zap className="h-3 w-3 text-primary" /> Rating Justification</span>
                      <p className="text-sm text-foreground leading-relaxed">{n.rating_justification}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {n.deploy_window && (
                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">⏱ Deploy Window</p>
                        <p className={cn("text-sm font-bold", n.deploy_window === 'NOW' ? "text-primary" : "text-foreground")}>{n.deploy_window}</p>
                      </div>
                    )}
                    {n.risk && (
                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">⚠ Risk</p>
                        <p className="text-sm font-bold text-foreground">{n.risk}</p>
                      </div>
                    )}
                    {n.competition && (
                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">🏁 Competition</p>
                        <p className="text-sm font-bold text-foreground">{n.competition}</p>
                      </div>
                    )}
                    {n.on_chain_evidence && (
                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">📊 On-Chain</p>
                        <p className="text-sm text-foreground">{n.on_chain_evidence}</p>
                      </div>
                    )}
                  </div>

                  {n.tweet_sources?.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">𝕏 Tweet Sources ({n.tweet_sources.length})</span>
                      <div className="space-y-2">
                        {n.tweet_sources.map((tw, j) => (
                          <div key={j} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <XIcon className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                              <span className="text-sm font-bold text-foreground">@{tw.user}</span>
                              <span className="text-xs text-blue-400 ml-auto">{tw.engagement}</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{tw.text}</p>
                            {tw.media_url && (
                              <img src={tw.media_url} alt="" className="w-full max-h-48 rounded-lg object-cover bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                            {tw.url && (
                              <a href={tw.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                                <ExternalLink className="h-3 w-3" /> View Tweet
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                  {n.image_gen_prompt && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🎨 Image Gen Prompt</span>
                        <button onClick={() => copyToClipboard(n.image_gen_prompt!)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono bg-muted/30 p-3 rounded-lg">{n.image_gen_prompt}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {n.twitter_source_url && (
                      <a href={n.twitter_source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-sm font-medium">
                        <XIcon className="h-3.5 w-3.5" /> Open on X
                      </a>
                    )}
                    {n.website && (
                      <a href={n.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-sm font-medium">
                        <ExternalLink className="h-3.5 w-3.5" /> Website
                      </a>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══════ Customer Detail Modal (Lead Finder) ══════ */}
      <Dialog open={!!customerDetail} onOpenChange={() => setCustomerDetail(null)}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          {customerDetail && (() => {
            const c = customerDetail;
            const meta = c.meta && typeof c.meta === 'object' ? c.meta : {};
            const metaKeys = Object.keys(meta).filter(k => meta[k] !== null && meta[k] !== '' && meta[k] !== undefined);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    {c.full_name}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Core Info */}
                  <div className="grid gap-3">
                    {c.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-3 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={`tel:${c.phone}`} className="text-foreground hover:underline">{c.phone}</a>
                      </div>
                    )}
                    {c.company && (
                      <div className="flex items-center gap-3 text-sm">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground">{c.company}</span>
                      </div>
                    )}
                    {c.address && (
                      <div className="flex items-center gap-3 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground">{c.address}</span>
                      </div>
                    )}
                    {(meta as any).linkedin && (
                      <div className="flex items-center gap-3 text-sm">
                        <Linkedin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={(meta as any).linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{(meta as any).linkedin}</a>
                      </div>
                    )}
                  </div>

                  {/* Status & Source */}
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={c.status} />
                    {c.source && (
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">{c.source}</span>
                    )}
                    {c.category && (
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium capitalize">{c.category}</span>
                    )}
                  </div>

                  {/* Notes */}
                  {c.notes && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-lg border border-border">{c.notes}</p>
                    </div>
                  )}

                  {/* Tags */}
                  {Array.isArray(c.tags) && c.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {c.tags.map((tag: string) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Extra Info (meta) */}
                  {metaKeys.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Extra Info</span>
                      <div className="grid gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                        {metaKeys.map(k => (
                          <div key={k} className="flex gap-2 text-sm">
                            <span className="font-medium text-foreground min-w-[120px] capitalize shrink-0">{k.replace(/_/g, ' ')}:</span>
                            <span className="text-muted-foreground break-all">
                              {typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        window.location.href = `/customers?open=${c.id}`;
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open in Customers
                    </Button>
                    {(meta as any).company_website && (
                      <a href={(meta as any).company_website} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Globe className="h-3.5 w-3.5" /> Website
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
