import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ExternalLink, Pencil, Eye, ChevronDown, ChevronRight, Palette, Video, Sparkles, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ApiPreview {
  id: string;
  customer_id: string | null;
  source: string;
  title: string;
  prompt: string | null;
  preview_url: string | null;
  edit_url: string | null;
  thumbnail_url: string | null;
  status: string;
  meta: any;
  bot_task_id: string | null;
  thread_id: string | null;
  created_at: string;
  updated_at: string;
  customers?: { full_name: string; email: string | null } | null;
}

const SOURCE_CONFIG: Record<string, { label: string; icon: typeof Palette; color: string }> = {
  'v0-designer': { label: 'V0.dev', icon: Palette, color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  'higgsfield': { label: 'Higgsfield', icon: Video, color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  completed: { icon: CheckCircle2, color: 'text-emerald-400' },
  pending: { icon: Clock, color: 'text-amber-400' },
  in_progress: { icon: Loader2, color: 'text-blue-400' },
  failed: { icon: XCircle, color: 'text-destructive' },
};

export default function Previews() {
  const [previews, setPreviews] = useState<ApiPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPreviews();

    const channel = supabase
      .channel('api_previews_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'api_previews' }, () => {
        fetchPreviews();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchPreviews() {
    const { data, error } = await supabase
      .from('api_previews')
      .select('*, customers(full_name, email)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPreviews(data as unknown as ApiPreview[]);
      // Auto-expand all clients on first load
      const clientIds = new Set(data.map((p: any) => p.customer_id || '__uncategorized'));
      setExpandedClients(clientIds as Set<string>);
    }
    setLoading(false);
  }

  // Group by customer
  const filtered = previews.filter(p => {
    const matchSearch = !search || 
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.prompt?.toLowerCase().includes(search.toLowerCase()) ||
      (p.customers as any)?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchSource = !sourceFilter || p.source === sourceFilter;
    return matchSearch && matchSource;
  });

  const grouped = filtered.reduce<Record<string, { name: string; previews: ApiPreview[] }>>((acc, p) => {
    const key = p.customer_id || '__uncategorized';
    if (!acc[key]) {
      acc[key] = {
        name: (p.customers as any)?.full_name || 'Uncategorized',
        previews: [],
      };
    }
    acc[key].previews.push(p);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort((a, b) => {
    if (a[0] === '__uncategorized') return 1;
    if (b[0] === '__uncategorized') return -1;
    return a[1].name.localeCompare(b[1].name);
  });

  const toggleClient = (id: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sources = [...new Set(previews.map(p => p.source))];

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Previews</h1>
            <p className="text-sm text-muted-foreground mt-1">
              All API-generated work — organized by client
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{previews.length} total asset{previews.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, prompt, or client..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={sourceFilter === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSourceFilter(null)}
              className="text-xs"
            >
              All
            </Button>
            {sources.map(src => {
              const config = SOURCE_CONFIG[src] || { label: src, icon: Sparkles, color: 'bg-muted text-muted-foreground' };
              const Icon = config.icon;
              return (
                <Button
                  key={src}
                  variant={sourceFilter === src ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSourceFilter(sourceFilter === src ? null : src)}
                  className="text-xs gap-1.5"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2].map(j => <Skeleton key={j} className="h-40 rounded-lg" />)}
                </div>
              </div>
            ))}
          </div>
        ) : sortedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No previews yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              When APIs like V0.dev or Higgsfield generate work, it will appear here organized by client.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedGroups.map(([clientId, group]) => {
              const isExpanded = expandedClients.has(clientId);
              return (
                <div key={clientId} className="border border-border rounded-lg overflow-hidden bg-card">
                  {/* Client header */}
                  <button
                    onClick={() => toggleClient(clientId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm text-foreground">{group.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {group.previews.length} item{group.previews.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {[...new Set(group.previews.map(p => p.source))].map(src => {
                        const config = SOURCE_CONFIG[src] || { label: src, color: 'bg-muted text-muted-foreground' };
                        return (
                          <Badge key={src} variant="outline" className={cn('text-[10px] px-1.5 py-0', config.color)}>
                            {config.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </button>

                  {/* Previews grid */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.previews.map(preview => {
                        const srcConfig = SOURCE_CONFIG[preview.source] || { label: preview.source, icon: Sparkles, color: 'bg-muted text-muted-foreground' };
                        const statusConfig = STATUS_CONFIG[preview.status] || STATUS_CONFIG.completed;
                        const SrcIcon = srcConfig.icon;
                        const StatusIcon = statusConfig.icon;

                        return (
                          <div
                            key={preview.id}
                            className="group border border-border rounded-lg p-4 hover:border-primary/30 transition-all bg-background"
                          >
                            {/* Card header */}
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <SrcIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <Badge variant="outline" className={cn('text-[10px] shrink-0', srcConfig.color)}>
                                  {srcConfig.label}
                                </Badge>
                              </div>
                              <StatusIcon className={cn('h-4 w-4 shrink-0', statusConfig.color, preview.status === 'in_progress' && 'animate-spin')} />
                            </div>

                            {/* Title */}
                            <h4 className="text-sm font-medium text-foreground leading-snug line-clamp-2 mb-1">
                              {preview.title}
                            </h4>

                            {/* Prompt excerpt */}
                            {preview.prompt && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                                {preview.prompt}
                              </p>
                            )}

                            {/* Date */}
                            <p className="text-[11px] text-muted-foreground mb-3">
                              {format(new Date(preview.created_at), 'MMM d, yyyy · h:mm a')}
                            </p>

                            {/* Actions */}
                            <div className="flex gap-2">
                              {preview.preview_url && (
                                <a
                                  href={preview.preview_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Preview
                                </a>
                              )}
                              {preview.edit_url && (
                                <a
                                  href={preview.edit_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </a>
                              )}
                              {!preview.preview_url && !preview.edit_url && (
                                <span className="text-xs text-muted-foreground italic">No links available</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
