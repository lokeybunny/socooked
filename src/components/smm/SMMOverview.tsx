import { useState } from 'react';
import { useSMMContext, PLATFORM_META, EXTENDED_PLATFORMS } from '@/lib/smm/context';
import type { ScheduledPost, SMMProfile, Platform } from '@/lib/smm/types';
import { serverWallClockToIso } from '@/lib/smm/timezone';
import PostCard from './PostCard';
import { CalendarDays, Clock, AlertTriangle, CheckCircle, RefreshCw, LayoutGrid, List } from 'lucide-react';
import CronCountdown from './CronCountdown';
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
  providerDown?: boolean;
  onRefresh?: () => void;
  onUpdatePostTime?: (post: ScheduledPost, newScheduledDate: string) => void;
}

const PROCESSING_WINDOW_MS = 5 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const isTerminal = (post: ScheduledPost) => TERMINAL_STATUSES.has(post.status);

const isProcessingPost = (post: ScheduledPost, now = new Date()) => {
  if (isTerminal(post)) return false;
  if (post.status === 'pending' || post.status === 'in_progress') return true;
  if (!post.scheduled_date) return false;
  return new Date(post.scheduled_date).getTime() <= now.getTime() + PROCESSING_WINDOW_MS;
};

export default function SMMOverview({ posts, allPosts, profiles, providerDown, onRefresh, onUpdatePostTime }: Props) {
  const { navigateToTab } = useSMMContext();
  const [viewMode, setViewMode] = useState<'all' | 'byPlatform'>('all');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const todayPosts = posts
    .filter(p => p.scheduled_date?.startsWith(today))
    .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
  const processingPosts = todayPosts.filter(p => isProcessingPost(p, now));
  const todaySchedulePosts = todayPosts.filter(p => !isTerminal(p) && !isProcessingPost(p, now));
  const scheduledToday = todaySchedulePosts.filter(p => p.status === 'scheduled' || p.status === 'queued');
  const overduePosts = todaySchedulePosts.filter(p => p.scheduled_date && new Date(p.scheduled_date) < now);
  const failed24h = posts.filter(p => p.status === 'failed' && new Date(p.created_at) > new Date(Date.now() - 86400000));
  const completed7d = posts.filter(p => p.status === 'completed' && new Date(p.created_at) > new Date(Date.now() - 604800000));
  const total7d = posts.filter(p => new Date(p.created_at) > new Date(Date.now() - 604800000));
  const successRate = total7d.length ? Math.round((completed7d.length / total7d.length) * 100) : 100;
  const cutoff24h = new Date(Date.now() - 86400000).toISOString();
  const queued = posts
    .filter(p => (p.status === 'queued' || p.status === 'scheduled') && !isProcessingPost(p, now) && (!p.scheduled_date || p.scheduled_date >= cutoff24h))
    .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
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

  const activePlatforms = EXTENDED_PLATFORMS.filter(p => p !== 'all' && allPosts.some(post => post.platforms.includes(p as Platform)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard label="Scheduled Today" value={scheduledToday.length} icon={CalendarDays} color="bg-primary/10 text-primary" />
        <KPICard label="Queue Next Slot" value={queued.length > 0 && queued[0].scheduled_date ? format(new Date(queued[0].scheduled_date), 'h:mm a') : '—'} icon={Clock} color="bg-accent/20 text-accent-foreground" />
        <KPICard label="Processing" value={processingPosts.length} icon={RefreshCw} color="bg-primary/10 text-primary" />
        <KPICard label="Failed (24h)" value={failed24h.length} icon={AlertTriangle} color="bg-destructive/10 text-destructive" />
        <KPICard label="Success Rate (7d)" value={`${successRate}%`} icon={CheckCircle} color="bg-emerald-500/10 text-emerald-500" />
      </div>

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
            const nextScheduled = platPosts.find(post => !isProcessingPost(post, now) && (post.status === 'scheduled' || post.status === 'queued'));
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
                  <div className="flex justify-between"><span className="text-muted-foreground">Processing</span><span>{platPosts.filter(post => isProcessingPost(post, now)).length}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Today's Schedule ({todaySchedulePosts.length})</h3>
            {todaySchedulePosts.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">Nothing waiting in today’s schedule</p> : (
              <div className="space-y-2">
                {todaySchedulePosts.map(p => <PostCard key={p.id} post={p} compact onTimeEdit={handleTimeEdit} onDelete={() => { onRefresh?.(); }} />)}
              </div>
            )}
          </div>

          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Queue Preview</h3>
            {providerDown ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Waiting for Upload-Post API to reconnect…</p>
            ) : queued.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">Queue empty</p> : (
              <div className="space-y-2">
                {queued.slice(0, 8).map(p => <PostCard key={p.id} post={p} compact onDelete={() => onRefresh?.()} />)}
              </div>
            )}
          </div>

          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Processing Posts ({processingPosts.length})</h3>
            {processingPosts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Nothing is being pushed right now</p>
            ) : (
              <div className="space-y-2">
                {processingPosts.slice(0, 8).map(p => <PostCard key={p.id} post={p} compact onDelete={() => onRefresh?.()} />)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Posts</h3>
        <div className="space-y-2">
          {recent.map(p => <PostCard key={p.id} post={p} compact onDelete={() => onRefresh?.()} />)}
        </div>
      </div>
    </div>
  );
}
