import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Bell, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

interface ActivityEntry {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  meta: any;
  created_at: string;
  actor_id: string | null;
}

const ENTITY_ROUTE_MAP: Record<string, (id?: string) => string> = {
  customer: (id) => id ? `/customers?open=${id}` : '/customers',
  deal: (id) => id ? `/deals?open=${id}` : '/deals',
  project: (id) => id ? `/projects?open=${id}` : '/projects',
  task: (id) => id ? `/tasks?open=${id}` : '/tasks',
  board: (id) => id ? `/boards/${id}` : '/boards',
  card: () => '/boards',
  list: () => '/boards',
  invoice: (id) => id ? `/invoices?open=${id}` : '/invoices',
  document: (id) => id ? `/documents?open=${id}` : '/documents',
  signature: () => '/signatures',
  thread: (id) => id ? `/threads?open=${id}` : '/threads',
  content: (id) => id ? `/content?open=${id}` : '/content',
  lead: (id) => id ? `/leads?open=${id}` : '/leads',
  email: () => '/email',
  phone: () => '/phone',
  communication: () => '/email',
};

const getEntityIcon = (type: string) => {
  const colors: Record<string, string> = {
    customer: 'bg-blue-500/10 text-blue-500',
    deal: 'bg-green-500/10 text-green-500',
    project: 'bg-purple-500/10 text-purple-500',
    task: 'bg-orange-500/10 text-orange-500',
    board: 'bg-indigo-500/10 text-indigo-500',
    card: 'bg-indigo-500/10 text-indigo-500',
    invoice: 'bg-emerald-500/10 text-emerald-500',
    document: 'bg-amber-500/10 text-amber-500',
    signature: 'bg-pink-500/10 text-pink-500',
    thread: 'bg-cyan-500/10 text-cyan-500',
    content: 'bg-rose-500/10 text-rose-500',
    lead: 'bg-yellow-500/10 text-yellow-500',
  };
  return colors[type] || 'bg-muted text-muted-foreground';
};

const formatAction = (entry: ActivityEntry) => {
  const entity = entry.entity_type.charAt(0).toUpperCase() + entry.entity_type.slice(1);
  const name = entry.meta?.name || entry.meta?.title || '';
  const nameStr = name ? ` "${name}"` : '';
  return `${entity}${nameStr} was ${entry.action}`;
};

export default function Notifications() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(40);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      setEntries((data as ActivityEntry[]) || []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('activity_log_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload) => {
          setEntries((prev) => [payload.new as ActivityEntry, ...prev].slice(0, 500));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = entries.length > visibleCount;

  const handleClick = (entry: ActivityEntry) => {
    const routeFn = ENTITY_ROUTE_MAP[entry.entity_type];
    if (routeFn) {
      navigate(routeFn(entry.entity_id || undefined));
    }
  };

  // Group by date
  const grouped = visibleEntries.reduce((acc, entry) => {
    const date = new Date(entry.created_at).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, ActivityEntry[]>);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Showing {visibleEntries.length} of {entries.length} activities · Live updates
          </p>
        </div>

        {Object.entries(grouped).map(([date, items]) => (
          <div key={date} className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-background py-2 z-10">{date}</h2>
            <div className="space-y-1">
              {items.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => handleClick(entry)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left group"
                >
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${getEntityIcon(entry.entity_type)}`}>
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-1">{formatAction(entry)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {hasMore && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => setVisibleCount((prev) => prev + 40)}
              className="px-6 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              Show More ({entries.length - visibleCount} remaining)
            </button>
          </div>
        )}

        {entries.length === 0 && !loading && (
          <div className="text-center py-20 text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No activity yet. Actions across the system will appear here in real-time.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
