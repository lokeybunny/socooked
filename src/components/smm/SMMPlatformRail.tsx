import { useSMMContext, EXTENDED_PLATFORMS, PLATFORM_META } from '@/lib/smm/context';
import type { ScheduledPost } from '@/lib/smm/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  posts: ScheduledPost[];
  unreadCounts: Record<string, number>;
}

export default function SMMPlatformRail({ posts, unreadCounts }: Props) {
  const { platform, setPlatform } = useSMMContext();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const getBadges = (p: string) => {
    if (p === 'all') return null;
    const platPosts = posts.filter(post => post.platforms.includes(p as any));
    const scheduledToday = platPosts.filter(post => post.status === 'scheduled' && post.scheduled_date?.startsWith(today)).length;
    const failed24h = platPosts.filter(post => post.status === 'failed' && new Date(post.created_at) > new Date(now.getTime() - 86400000)).length;
    const unread = unreadCounts[p] || 0;
    return { scheduledToday, failed24h, unread };
  };

  return (
    <div className="flex flex-col items-center gap-1 py-2 w-12 shrink-0 bg-muted/30 rounded-xl border border-border">
      {EXTENDED_PLATFORMS.map(p => {
        const meta = PLATFORM_META[p];
        if (!meta) return null;
        const badges = getBadges(p);
        const isActive = platform === p;

        return (
          <Tooltip key={p}>
            <TooltipTrigger asChild>
              <button onClick={() => setPlatform(p)}
                className={`relative w-9 h-9 flex items-center justify-center rounded-lg text-[10px] font-bold transition-all ${
                  isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}>
                {meta.abbr}
                {badges && badges.failed24h > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-[8px] text-white flex items-center justify-center font-bold">
                    {badges.failed24h}
                  </span>
                )}
                {badges && badges.unread > 0 && !badges.failed24h && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-[8px] text-primary-foreground flex items-center justify-center font-bold">
                    {badges.unread}
                  </span>
                )}
                {badges && badges.scheduledToday > 0 && !badges.failed24h && !badges.unread && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 text-[8px] text-foreground flex items-center justify-center font-bold">
                    {badges.scheduledToday}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <p className="font-medium">{meta.label}</p>
              {badges && (
                <p className="text-muted-foreground">
                  {badges.scheduledToday} today · {badges.failed24h} failed
                  {badges.unread > 0 && ` · ${badges.unread} unread`}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
