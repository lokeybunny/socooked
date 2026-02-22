import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  MessageSquare, Phone, Mail, MessageCircle, Search,
  Clock, User, ChevronDown, ChevronRight, Calendar,
  Hash, FileAudio, Copy, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate, SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { format, formatDistanceToNow } from 'date-fns';

const channelIcons: Record<string, any> = {
  call: Phone,
  email: Mail,
  sms: MessageCircle,
  chat: MessageSquare,
  dm: MessageCircle,
};

const channelColors: Record<string, string> = {
  call: 'bg-green-500/10 text-green-400 border-green-500/20',
  email: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  sms: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  chat: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  dm: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

export default function Threads() {
  const categoryGate = useCategoryGate();
  const [allThreads, setAllThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAll = async () => {
    const { data } = await supabase
      .from('conversation_threads')
      .select('*, customers(full_name, email, phone)')
      .order('created_at', { ascending: false });
    setAllThreads(data || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const validCategories = new Set(SERVICE_CATEGORIES.map(c => c.id));
  const normalizeCategory = (cat: string | null) => (cat && validCategories.has(cat)) ? cat : 'other';

  const filtered = useMemo(() => {
    let list = allThreads;
    if (categoryGate.selectedCategory) {
      list = list.filter(t => normalizeCategory(t.category) === categoryGate.selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => {
        const name = (t.customers?.full_name || '').toLowerCase();
        const summary = (t.summary || '').toLowerCase();
        const channel = (t.channel || '').toLowerCase();
        return name.includes(q) || summary.includes(q) || channel.includes(q);
      });
    }
    return list;
  }, [allThreads, categoryGate.selectedCategory, search]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach(t => {
      const day = format(new Date(t.created_at), 'yyyy-MM-dd');
      if (!groups[day]) groups[day] = [];
      groups[day].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const categoryCounts = SERVICE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = allThreads.filter(t => normalizeCategory(t.category) === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AppLayout>
      <CategoryGate
        title="Transcript Library"
        {...categoryGate}
        totalCount={allThreads.length}
        countLabel="transcripts"
        categoryCounts={categoryCounts}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-sm">
                {filtered.length} transcript{filtered.length !== 1 ? 's' : ''}
                {search && ` matching "${search}"`}
              </p>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by customer, channel..."
                className="pl-9"
              />
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-6">
            {grouped.map(([day, items]) => (
              <div key={day}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">
                      {format(new Date(day), 'EEEE, MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{items.length} entries</span>
                </div>

                {/* Thread cards for this day */}
                <div className="space-y-2 ml-2 border-l-2 border-border/50 pl-4">
                  {items.map(t => {
                    const isExpanded = expandedId === t.id;
                    const ChannelIcon = channelIcons[t.channel] || MessageSquare;
                    const colorClass = channelColors[t.channel] || channelColors.chat;
                    const customerName = t.customers?.full_name || 'Unknown';
                    const timeStr = format(new Date(t.created_at), 'h:mm a');
                    const relativeTime = formatDistanceToNow(new Date(t.created_at), { addSuffix: true });

                    return (
                      <div
                        key={t.id}
                        className="glass-card overflow-hidden transition-all duration-200 hover:border-primary/20"
                      >
                        {/* Main row — always visible */}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className="w-full flex items-center gap-3 p-4 text-left"
                        >
                          {/* Timeline dot */}
                          <div className="relative -ml-[1.65rem]">
                            <div className="w-3 h-3 rounded-full bg-primary border-2 border-background" />
                          </div>

                          {/* Channel icon */}
                          <div className={`p-2 rounded-lg border ${colorClass}`}>
                            <ChannelIcon className="h-4 w-4" />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground truncate">
                                {customerName}
                              </span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${colorClass}`}>
                                {t.channel}
                              </Badge>
                            </div>
                            {t.summary && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-lg">
                                {t.summary}
                              </p>
                            )}
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {timeStr}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
                            {/* Metadata grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Customer</p>
                                <div className="flex items-center gap-1.5">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-foreground">{customerName}</span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Channel</p>
                                <div className="flex items-center gap-1.5">
                                  <ChannelIcon className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-foreground capitalize">{t.channel}</span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Category</p>
                                <div className="flex items-center gap-1.5">
                                  <Hash className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-foreground capitalize">{(t.category || 'other').replace(/-/g, ' ')}</span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recorded</p>
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-foreground">{relativeTime}</span>
                                </div>
                              </div>
                            </div>

                            {/* Contact info */}
                            {(t.customers?.email || t.customers?.phone) && (
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                {t.customers?.email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" /> {t.customers.email}
                                  </span>
                                )}
                                {t.customers?.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" /> {t.customers.phone}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Summary */}
                            {t.summary && (
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Summary</p>
                                <p className="text-xs text-foreground leading-relaxed">{t.summary}</p>
                              </div>
                            )}

                            {/* Full transcript */}
                            {t.raw_transcript && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <FileAudio className="h-3.5 w-3.5 text-muted-foreground" />
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Full Transcript</p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs gap-1.5"
                                    onClick={() => {
                                      navigator.clipboard.writeText(t.raw_transcript);
                                      toast.success('Transcript copied to clipboard');
                                    }}
                                  >
                                    <Copy className="h-3 w-3" />
                                    Copy
                                  </Button>
                                </div>
                                <ScrollArea className="max-h-96">
                                  <div className="bg-background/50 border border-border rounded-lg p-3">
                                    <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed select-all">
                                      {t.raw_transcript}
                                    </pre>
                                  </div>
                                </ScrollArea>
                              </div>
                            )}

                            {/* Thread ID for bot reference */}
                            <div className="pt-2 border-t border-border/50">
                              <p className="text-[10px] text-muted-foreground font-mono">
                                Thread ID: {t.id}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {filtered.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                <FileAudio className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No transcripts found.</p>
                <p className="text-xs mt-1">Upload audio on the Phone page to get started.</p>
              </div>
            )}
          </div>
        </div>
      </CategoryGate>
    </AppLayout>
  );
}
