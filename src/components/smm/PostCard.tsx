import { useState } from 'react';
import type { ScheduledPost } from '@/lib/smm/types';
import { PLATFORM_META } from '@/lib/smm/context';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MoreHorizontal, Edit, Copy, Clock, CalendarDays, X, ExternalLink, Play, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import VideoThumbnail from '@/components/ui/VideoThumbnail';

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

interface PostCardProps {
  post: ScheduledPost;
  compact?: boolean;
  onEdit?: (post: ScheduledPost) => void;
  onDuplicate?: (post: ScheduledPost) => void;
  onCancel?: (post: ScheduledPost) => void;
  onReschedule?: (post: ScheduledPost) => void;
}

// ─── Post Detail Dialog ───
function PostDetailDialog({ post, open, onOpenChange }: { post: ScheduledPost; open: boolean; onOpenChange: (v: boolean) => void }) {
  const hasVideo = post.type === 'video' || isVideoUrl(post.media_url) || isVideoUrl(post.preview_url);
  const hasMedia = hasVideo || post.preview_url || post.media_url;

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
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PostCard({ post, compact, onEdit, onDuplicate, onCancel, onReschedule }: PostCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const scheduledLocal = post.scheduled_date ? format(new Date(post.scheduled_date), 'MMM d, h:mm a') : null;
  const scheduledUTC = post.scheduled_date ? format(new Date(post.scheduled_date), "yyyy-MM-dd'T'HH:mm:ss'Z'") : null;

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors group">
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
            <div className="flex items-center gap-2 mt-0.5">
              {post.platforms.map(p => {
                const meta = PLATFORM_META[p];
                return meta ? <span key={p} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.color}`}>{meta.abbr}</span> : null;
              })}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLES[post.status]}`}>{post.status}</span>
              {scheduledLocal && <span className="text-[10px] text-muted-foreground" title={scheduledUTC || ''}>{scheduledLocal}</span>}
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
        <PostDetailDialog post={post} open={detailOpen} onOpenChange={setDetailOpen} />
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
      <PostDetailDialog post={post} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}
