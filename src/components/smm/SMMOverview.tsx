import { useState } from 'react';
import { smmApi } from '@/lib/smm/store';
import { useSMMContext, PLATFORM_META, EXTENDED_PLATFORMS } from '@/lib/smm/context';
import type { ScheduledPost, SMMProfile, WebhookEvent, Platform } from '@/lib/smm/types';
import { serverWallClockToIso } from '@/lib/smm/timezone';
import PostCard from './PostCard';
import { CalendarDays, Clock, AlertTriangle, CheckCircle, Bell, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function KPICard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface Props {
  posts: ScheduledPost[];
  allPosts: ScheduledPost[];
  profiles: SMMProfile[];
  onRefresh?: () => void;
  onUpdatePostTime?: (post: ScheduledPost, newScheduledDate: string) => void;
}

export default function SMMOverview({ posts, allPosts, profiles, onRefresh, onUpdatePostTime }: Props) {
  const { platform, navigateToTab } = useSMMContext();
  const [webhooks] = useState<WebhookEvent[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'byPlatform'>('all');

  const today = new Date().toISOString().slice(0, 10);
  const todayPosts = posts.filter(p => p.scheduled_date?.startsWith(today)).sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
  const scheduledToday = todayPosts.filter(p => p.status === 'scheduled');
  const overduePosts = todayPosts.filter(p =>
    p.scheduled_date && !['completed', 'failed', 'cancelled'].includes(p.status) && new Date(p.scheduled_date) < new Date()
  );
  const failed24h = posts.filter(p => p.status === 'failed' && new Date(p.created_at) > new Date(Date.now() - 86400000));
  const completed7d = posts.filter(p => p.status === 'completed' && new Date(p.created_at) > new Date(Date.now() - 604800000));
  const total7d = posts.filter(p => new Date(p.created_at) > new Date(Date.now() - 604800000));
  const successRate = total7d.length ? Math.round((completed7d.length / total7d.length) * 100) : 100;
  const queued = posts.filter(p => p.status === 'queued' || p.status === 'scheduled').sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
  const recent = [...posts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);

  const handleTimeEdit = async (post: ScheduledPost, newTime: string) => {
    const dateStr = post.scheduled_date?.slice(0, 10) || today;
    const newStartTime = serverWallClockToIso(dateStr, newTime);

    const updateAndRefresh = async (eventId: string) => {
      const { error } = await supabase.from('calendar_events').update({ start_time: newStartTime }).eq('id', eventId);
      if (error) {
        toast.error('Failed to update time');
        return;
      }

      onUpdatePostTime?.(post, newStartTime);
      onRefresh?.();
      toast.success(`Rescheduled to ${newTime}`);
    };

    const { data: direct } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('id', post.id)
      .maybeSingle();

    if (direct) return updateAndRefresh(direct.id);

    if (post.job_id) {
      const { data: byJob } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('source', 'smm')
        .eq('source_id', post.job_id)
        .maybeSingle();
      if (byJob) return updateAndRefresh(byJob.id);
    }

    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, title')
      .eq('source', 'smm')
      .gte('start_time', `${dateStr}T00:00:00`)
      .lte('start_time', `${dateStr}T23:59:59`);
    const match = events?.find(e => {
      const eClean = e.title.replace(/[^\w]/g, '').toLowerCase();
      const pClean = post.title.replace(/[^\w]/g, '').toLowerCase();
      return eClean.includes(pClean.slice(0, 40)) || pClean.includes(eClean.slice(0, 40));
    });
    if (match) return updateAndRefresh(match.id);
    toast.error('Could not find matching calendar event');
  };

  // By-platform view data
  const activePlatforms = EXTENDED_PLATFORMS.filter(p => p !== 'all' && allPosts.some(post => post.platforms.includes(p as Platform)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard label="Scheduled Today" value={scheduledToday.length} icon={CalendarDays} color="bg-primary/10 text-primary" />
        <KPICard label="Queue Next Slot" value={queued.length > 0 && queued[0].scheduled_date ? format(new Date(queued[0].scheduled_date), 'h:mm a') : '—'} icon={Clock} color="bg-accent/20 text-accent-foreground" />
        <KPICard label="Overdue" value={overduePosts.length} icon={AlertTriangle} color={overduePosts.length > 0 ? 'bg-destructive/20 text-destructive animate-pulse' : 'bg-muted/50 text-muted-foreground'} />
        <KPICard label="Failed (24h)" value={failed24h.length} icon={AlertTriangle} color="bg-destructive/10 text-destructive" />
        <KPICard label="Success Rate (7d)" value={`${successRate}%`} icon={CheckCircle} color="bg-emerald-500/10 text-emerald-500" />
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-2">
        <Button variant={viewMode === 'all' ? 'default' : 'outline'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setViewMode('all')}>
          <List className="h-3 w-3" /> All Platforms
        </Button>
        <Button variant={viewMode === 'byPlatform' ? 'default' : 'outline'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setViewMode('byPlatform')}>
          <LayoutGrid className="h-3 w-3" /> By Platform
        </Button>
      </div>

      {viewMode === 'byPlatform' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePlatforms.map(p => {
            const meta = PLATFORM_META[p];
            const platPosts = allPosts.filter(post => post.platforms.includes(p as Platform));
            const nextScheduled = platPosts.find(post => post.status === 'scheduled');
            const lastCompleted = platPosts.find(post => post.status === 'completed');
            return (
              <div key={p} className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${meta?.color}`}>{meta?.abbr}</span>
                  <span className="text-sm font-medium text-foreground">{meta?.label}</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Next scheduled</span><span className="text-foreground">{nextScheduled?.title ? nextScheduled.title.slice(0, 20) + '…' : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last result</span><span className={lastCompleted ? 'text-emerald-500' : 'text-muted-foreground'}>{lastCompleted ? 'Success' : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total posts</span><span>{platPosts.length}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Today's Schedule */}
          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Today's Schedule ({todayPosts.length})</h3>
            {todayPosts.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">Nothing scheduled today</p> : (
              <div className="space-y-2">
                {todayPosts.map(p => <PostCard key={p.id} post={p} compact onTimeEdit={handleTimeEdit} onDelete={() => onRefresh?.()} />)}
              </div>
            )}
          </div>

          {/* Queue Preview */}
          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Queue Preview</h3>
            {queued.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">Queue empty</p> : (
              <div className="space-y-2">
                {queued.slice(0, 8).map(p => <PostCard key={p.id} post={p} compact onDelete={() => onRefresh?.()} />)}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications</h3>
            <div className="space-y-2">
              {webhooks.slice(0, 6).map(w => (
                <div key={w.id} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${w.read ? 'bg-muted/30' : 'bg-primary/5 border border-primary/20'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${w.type === 'upload_failed' ? 'bg-destructive' : 'bg-emerald-500'}`} />
                  <div>
                    <p className="text-foreground">{w.message}</p>
                    <p className="text-muted-foreground">{format(new Date(w.timestamp), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent History (PostCard-based) */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Posts</h3>
        <div className="space-y-2">
          {recent.map(p => <PostCard key={p.id} post={p} compact onDelete={() => onRefresh?.()} />)}
        </div>
      </div>
    </div>
  );
}
