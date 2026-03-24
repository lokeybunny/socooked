import { useState, useRef } from 'react';
import type { ScheduledPost } from '@/lib/smm/types';
import { PLATFORM_META } from '@/lib/smm/context';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MoreHorizontal, Edit, Copy, Clock, CalendarDays, X, ExternalLink, Play, Eye, AlertTriangle, Trash2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import VideoThumbnail from '@/components/ui/VideoThumbnail';
import { supabase } from '@/integrations/supabase/client';

const isVideoUrl = (url?: string) => url && /\.(mp4|mov|webm|m3u8|avi)/i.test(url);
const getVideoSrc = (post: ScheduledPost) => post.media_url || post.preview_url || '';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-primary/10 text-primary',
  queued: 'bg-amber-400/10 text-amber-500',
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-amber-400/10 text-amber-500',
  completed: 'bg-emerald-500/10 text-emerald-500',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground line-through',
};

/** Check if a scheduled post's time has already passed and it hasn't been completed/published */
function isOverdue(post: ScheduledPost): boolean {
  if (!post.scheduled_date) return false;
  if (['completed', 'failed', 'cancelled'].includes(post.status)) return false;
  return new Date(post.scheduled_date) < new Date();
}

function getOverdueReason(post: ScheduledPost): string {
  const scheduled = post.scheduled_date ? new Date(post.scheduled_date) : null;
  if (!scheduled) return 'Unknown issue';
  const minutesLate = Math.round((Date.now() - scheduled.getTime()) / 60000);
  const hoursLate = Math.round(minutesLate / 60);
  const lateLabel = minutesLate < 60 ? `${minutesLate}m` : `${hoursLate}h ${minutesLate % 60}m`;

  if (post.status === 'scheduled' || post.status === 'queued') {
    return `⚠️ This post was scheduled for ${format(scheduled, 'h:mm a')} but hasn't been published yet (${lateLabel} overdue). The upload may have stalled or the API queue is backed up. Use PUSH to force-retry the upload now.`;
  }
  if (post.status === 'pending' || post.status === 'in_progress') {
    return `⏳ This post has been processing since ${format(scheduled, 'h:mm a')} (${lateLabel} ago). It may be stuck in the upload pipeline. Use PUSH to retry.`;
  }
  return `This post missed its ${format(scheduled, 'h:mm a')} slot (${lateLabel} overdue).`;
}

interface PostCardProps {
  post: ScheduledPost;
  compact?: boolean;
  onEdit?: (post: ScheduledPost) => void;
  onDuplicate?: (post: ScheduledPost) => void;
  onCancel?: (post: ScheduledPost) => void;
  onReschedule?: (post: ScheduledPost) => void;
  onTimeEdit?: (post: ScheduledPost, newTime: string) => void;
  onPush?: (post: ScheduledPost) => void;
  onDelete?: (post: ScheduledPost) => void;
}

// ─── Post Detail Dialog ───
function PostDetailDialog({ post, open, onOpenChange, onDelete }: { post: ScheduledPost; open: boolean; onOpenChange: (v: boolean) => void; onDelete?: (post: ScheduledPost) => void }) {
  const hasVideo = post.type === 'video' || isVideoUrl(post.media_url) || isVideoUrl(post.preview_url);
  const hasMedia = hasVideo || post.preview_url || post.media_url;
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const normalizedId = post.id.replace(/-(instagram|facebook|tiktok|linkedin|pinterest|youtube|twitter)-view$/, '');

      // Try deleting directly by ID
      const { error: directErr, count } = await supabase
        .from('calendar_events')
        .delete({ count: 'exact' })
        .eq('id', normalizedId);

      if (!directErr && count && count > 0) {
        toast.success('Post removed from schedule');
        onOpenChange(false);
        onDelete?.(post);
        return;
      }

      // Try by source_id matching job_id
      if (post.job_id) {
        const { error: jobErr, count: jobCount } = await supabase
          .from('calendar_events')
          .delete({ count: 'exact' })
          .eq('source', 'smm')
          .eq('source_id', post.job_id);
        if (!jobErr && jobCount && jobCount > 0) {
          toast.success('Post removed from schedule');
          onOpenChange(false);
          onDelete?.(post);
          return;
        }
      }

      // Fuzzy match by title + date
      if (post.scheduled_date) {
        const dateStr = post.scheduled_date.slice(0, 10);
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
        if (match) {
          await supabase.from('calendar_events').delete().eq('id', match.id);
          toast.success('Post removed from schedule');
          onOpenChange(false);
          onDelete?.(post);
          return;
        }
      }

      toast.error('Could not find matching calendar event to delete');
    } catch (err) {
      console.error('Delete post error:', err);
      toast.error('Failed to delete post');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug pr-6">Post Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Media */}
          {hasMedia && (
            <div className="w-full rounded-lg overflow-hidden border border-border/50 bg-muted/20">
              {hasVideo && (post.media_url || post.preview_url) ? (
                <VideoThumbnail
                  src={getVideoSrc(post)}
                  title={post.title}
                  className="w-full max-h-72"
                  videoClassName="w-full max-h-72 object-contain bg-black"
                  controls={true}
                />
              ) : post.preview_url ? (
                <img src={post.preview_url} alt="" className="w-full max-h-72 object-contain" />
              ) : post.media_url ? (
                <img src={post.media_url} alt="" className="w-full max-h-72 object-contain" />
              ) : null}
            </div>
          )}

          {/* Caption / Title */}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground whitespace-pre-wrap break-words">{post.title}</p>
            {post.description && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{post.description}</p>
            )}
          </div>

          {/* Platforms */}
          <div className="flex items-center gap-2 flex-wrap">
            {post.platforms.map(p => {
              const meta = PLATFORM_META[p];
              return meta ? <span key={p} className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span> : null;
            })}
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between text-xs">
            <span className={`font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[post.status]}`}>{post.status}</span>
            <div className="flex items-center gap-3 text-muted-foreground">
              {post.scheduled_date && (
                <span>
                  <CalendarDays className="h-3 w-3 inline mr-1" />
                  {format(new Date(post.scheduled_date), 'MMM d, h:mm a')}
                </span>
              )}
              <span>{post.type}</span>
              <span className="font-mono">{post.profile_username}</span>
            </div>
          </div>

          {/* Published URLs */}
          {post.post_urls.length > 0 && (
            <div className="flex gap-2 pt-2 border-t border-border">
              {post.post_urls.map(u => (
                <a key={u.platform} href={u.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />{u.platform}
                </a>
              ))}
            </div>
          )}

          {/* Error */}
          {post.error && <p className="text-xs text-destructive border-t border-border pt-2">Error: {post.error}</p>}

          {/* Timestamps */}
          <div className="text-[10px] text-muted-foreground border-t border-border pt-2 space-y-0.5">
            <p>Created: {format(new Date(post.created_at), 'MMM d, yyyy h:mm a')}</p>
            {post.published_at && <p>Published: {format(new Date(post.published_at), 'MMM d, yyyy h:mm a')}</p>}
            {post.job_id && <p className="font-mono">Job: {post.job_id}</p>}
          </div>

          {/* Delete from schedule */}
          {!['completed', 'failed', 'cancelled'].includes(post.status) && (
            <div className="border-t border-border pt-3">
              <Button
                variant="destructive"
                size="sm"
                className="w-full gap-2"
                disabled={deleting}
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? 'Removing…' : 'Remove from Schedule'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PostCard({ post, compact, onEdit, onDuplicate, onCancel, onReschedule, onTimeEdit, onPush, onDelete }: PostCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [overdueInfoOpen, setOverdueInfoOpen] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const scheduledLocal = post.scheduled_date ? format(new Date(post.scheduled_date), 'MMM d, h:mm a') : null;
  const scheduledUTC = post.scheduled_date ? format(new Date(post.scheduled_date), "yyyy-MM-dd'T'HH:mm:ss'Z'") : null;
  const overdue = isOverdue(post);

  if (compact) {
    return (
      <>
        <div className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors group ${overdue ? 'bg-destructive/5 border border-destructive/20' : 'bg-muted/40 hover:bg-muted/60'}`}>
          {(post.type === 'video' || isVideoUrl(post.media_url) || isVideoUrl(post.preview_url)) && (post.media_url || post.preview_url) ? (
            <div className="w-8 h-8 rounded overflow-hidden shrink-0">
              <VideoThumbnail src={getVideoSrc(post)} title={post.title} className="w-8 h-8" videoClassName="w-full h-full object-cover" controls={false} />
            </div>
          ) : post.preview_url ? (
            <img src={post.preview_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded bg-muted shrink-0 flex items-center justify-center">
              <Play className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {post.platforms.map(p => {
                const meta = PLATFORM_META[p];
                return meta ? <span key={p} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.color}`}>{meta.abbr}</span> : null;
              })}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLES[post.status]}`}>{post.status}</span>
              {scheduledLocal && onTimeEdit && !editingTime && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingTime(true); setTimeout(() => timeInputRef.current?.showPicker(), 50); }}
                  className={`text-[10px] hover:underline cursor-pointer flex items-center gap-0.5 ${overdue ? 'text-destructive font-bold' : 'text-primary'}`}
                  title="Click to edit time"
                >
                  <Clock className="h-2.5 w-2.5" />{scheduledLocal}
                </button>
              )}
              {scheduledLocal && onTimeEdit && editingTime && (
                <input
                  ref={timeInputRef}
                  type="time"
                  defaultValue={post.scheduled_date ? format(new Date(post.scheduled_date), 'HH:mm') : ''}
                  className="text-[10px] bg-muted rounded px-1 py-0.5 w-20 border border-primary/30"
                  autoFocus
                  onBlur={(e) => { setEditingTime(false); if (e.target.value) onTimeEdit(post, e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setEditingTime(false); onTimeEdit(post, (e.target as HTMLInputElement).value); } if (e.key === 'Escape') setEditingTime(false); }}
                />
              )}
              {scheduledLocal && !onTimeEdit && <span className="text-[10px] text-muted-foreground" title={scheduledUTC || ''}>{scheduledLocal}</span>}
              {/* PUSH button for overdue posts */}
              {overdue && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOverdueInfoOpen(true);
                  }}
                  className="text-[10px] font-black tracking-wider px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-1 animate-pulse"
                  title="Post missed its scheduled time — click for details"
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  PUSH
                </button>
              )}
              {/* PUSH button for failed posts */}
              {post.status === 'failed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPush) {
                      onPush(post);
                    } else {
                      toast.info('Force-push coming soon — use the terminal to manually re-upload this post.');
                    }
                  }}
                  className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-1"
                  title="Retry this failed post"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  PUSH
                </button>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem onClick={() => setDetailOpen(true)}><Eye className="h-3.5 w-3.5 mr-2" />View Post</DropdownMenuItem>
              {onEdit && <DropdownMenuItem onClick={() => onEdit(post)}><Edit className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>}
              {onDuplicate && <DropdownMenuItem onClick={() => onDuplicate(post)}><Copy className="h-3.5 w-3.5 mr-2" />Duplicate</DropdownMenuItem>}
              {onReschedule && <DropdownMenuItem onClick={() => onReschedule(post)}><CalendarDays className="h-3.5 w-3.5 mr-2" />Reschedule</DropdownMenuItem>}
              {onCancel && <DropdownMenuItem onClick={() => onCancel(post)} className="text-destructive"><X className="h-3.5 w-3.5 mr-2" />Cancel</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <PostDetailDialog post={post} open={detailOpen} onOpenChange={setDetailOpen} onDelete={onDelete} />
        {/* Overdue Info Dialog */}
        <Dialog open={overdueInfoOpen} onOpenChange={setOverdueInfoOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Missed Schedule
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-foreground leading-relaxed">{getOverdueReason(post)}</p>
              <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Post</span><span className="text-foreground font-medium truncate ml-2 max-w-[200px]">{post.title.slice(0, 50)}{post.title.length > 50 ? '…' : ''}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Scheduled</span><span className="text-destructive font-semibold">{scheduledLocal}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={`font-medium ${STATUS_STYLES[post.status]} px-2 py-0.5 rounded-full`}>{post.status}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Platforms</span><span>{post.platforms.join(', ')}</span></div>
                {post.job_id && <div className="flex justify-between"><span className="text-muted-foreground">Job ID</span><span className="font-mono text-[10px]">{post.job_id}</span></div>}
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
                  onClick={() => {
                    setOverdueInfoOpen(false);
                    if (onPush) {
                      onPush(post);
                    } else {
                      toast.info('Force-push coming soon — use the terminal to manually re-upload this post.');
                    }
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Force Push Now
                </Button>
                <Button variant="outline" onClick={() => setOverdueInfoOpen(false)}>Dismiss</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="glass-card p-4 space-y-3 hover:border-primary/30 transition-colors">
        <div className="flex items-start gap-3">
          {(post.type === 'video' || isVideoUrl(post.media_url) || isVideoUrl(post.preview_url)) && (post.media_url || post.preview_url) ? (
            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0">
              <VideoThumbnail src={getVideoSrc(post)} title={post.title} className="w-16 h-16" videoClassName="w-full h-full object-cover" />
            </div>
          ) : post.preview_url ? (
            <img src={post.preview_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-muted shrink-0 flex items-center justify-center">
              <Play className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground truncate">{post.title}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover">
                  <DropdownMenuItem onClick={() => setDetailOpen(true)}><Eye className="h-3.5 w-3.5 mr-2" />View Post</DropdownMenuItem>
                  {onEdit && <DropdownMenuItem onClick={() => onEdit(post)}><Edit className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>}
                  {onDuplicate && <DropdownMenuItem onClick={() => onDuplicate(post)}><Copy className="h-3.5 w-3.5 mr-2" />Duplicate</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => toast.info('Move to queue (mock)')}><Clock className="h-3.5 w-3.5 mr-2" />Move to Queue</DropdownMenuItem>
                  {onReschedule && <DropdownMenuItem onClick={() => onReschedule(post)}><CalendarDays className="h-3.5 w-3.5 mr-2" />Reschedule</DropdownMenuItem>}
                  {onCancel && <DropdownMenuItem onClick={() => onCancel(post)} className="text-destructive"><X className="h-3.5 w-3.5 mr-2" />Cancel</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {post.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{post.description}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {post.platforms.map(p => {
            const meta = PLATFORM_META[p];
            return meta ? <span key={p} className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span> : null;
          })}
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className={`font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[post.status]}`}>{post.status}</span>
          <div className="flex items-center gap-3 text-muted-foreground">
            {scheduledLocal && <span title={scheduledUTC || ''}><CalendarDays className="h-3 w-3 inline mr-1" />{scheduledLocal}</span>}
            <span>{post.type}</span>
            <span className="font-mono">{post.profile_username}</span>
          </div>
        </div>

        {post.post_urls.length > 0 && (
          <div className="flex gap-2 pt-1 border-t border-border">
            {post.post_urls.map(u => (
              <a key={u.platform} href={u.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" />{u.platform}
              </a>
            ))}
          </div>
        )}

        {post.error && <p className="text-xs text-destructive border-t border-border pt-2">Error: {post.error}</p>}
      </div>
      <PostDetailDialog post={post} open={detailOpen} onOpenChange={setDetailOpen} onDelete={onDelete} />
    </>
  );
}
