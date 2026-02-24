import { useState, useMemo } from 'react';
import type { ScheduledPost, Platform, PostStatus } from '@/lib/smm/types';
import { useSMMContext, PLATFORM_META, EXTENDED_PLATFORMS } from '@/lib/smm/context';
import PostCard from './PostCard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { List, LayoutList, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

const ALL_STATUSES: PostStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'scheduled', 'queued', 'cancelled'];

export default function SMMHistory({ posts }: { posts: ScheduledPost[] }) {
  const { platform } = useSMMContext();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return posts
      .filter(p => filterStatus === 'all' || p.status === filterStatus)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [posts, filterStatus]);

  // Group by day for timeline
  const grouped = useMemo(() => {
    const groups: Record<string, ScheduledPost[]> = {};
    filtered.forEach(p => {
      const day = p.created_at.slice(0, 10);
      if (!groups[day]) groups[day] = [];
      groups[day].push(p);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <div className="flex gap-1">
          <Button variant={viewMode === 'timeline' ? 'default' : 'outline'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setViewMode('timeline')}>
            <LayoutList className="h-3 w-3" /> Timeline
          </Button>
          <Button variant={viewMode === 'table' ? 'default' : 'outline'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setViewMode('table')}>
            <List className="h-3 w-3" /> Table
          </Button>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <div className="space-y-6">
          {grouped.map(([day, dayPosts]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {format(new Date(day + 'T12:00:00'), 'EEEE, MMMM d')}
              </p>
              <div className="space-y-2 pl-3 border-l-2 border-border">
                {dayPosts.map(p => <PostCard key={p.id} post={p} compact />)}
              </div>
            </div>
          ))}
          {grouped.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No posts match filters</p>}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left p-3 font-medium">Time</th>
                <th className="text-left p-3 font-medium">Profile</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Title</th>
                <th className="text-left p-3 font-medium">Platforms</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                  <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{format(new Date(p.created_at), 'MMM d, h:mm a')}</td>
                  <td className="p-3 font-medium">{p.profile_username}</td>
                  <td className="p-3 text-xs text-muted-foreground">{p.type}</td>
                  <td className="p-3 truncate max-w-[180px]">{p.title}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {p.platforms.map(pl => {
                        const meta = PLATFORM_META[pl];
                        return <span key={pl} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta?.color}`}>{meta?.abbr}</span>;
                      })}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                      p.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                    }`}>{p.status}</span>
                  </td>
                  <td className="p-3">{expandedId === p.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No posts match filters</p>}
        </div>
      )}
    </div>
  );
}
