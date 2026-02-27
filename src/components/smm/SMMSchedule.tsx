import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSMMContext, PLATFORM_META } from '@/lib/smm/context';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  CalendarPlus, Sparkles, RefreshCw, Image, Video, Type, Hash,
  Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Send,
  ThumbsUp, Repeat2, Eye, Play,
} from 'lucide-react';
import type { SMMProfile } from '@/lib/smm/types';
import { format, parseISO, isToday, isTomorrow, isThisWeek } from 'date-fns';

// ─── Types ───
interface ScheduleItem {
  id: string;
  date: string;
  time: string;
  type: 'image' | 'video' | 'text' | 'carousel';
  caption: string;
  hashtags: string[];
  media_prompt?: string;
  media_url?: string;
  status: 'planned' | 'generating' | 'ready' | 'published' | 'failed';
}

interface ContentPlan {
  id: string;
  profile_username: string;
  platform: string;
  plan_name: string;
  status: string;
  brand_context: {
    niche?: string;
    voice?: string;
    audience?: string;
    keywords?: string[];
    hashtag_sets?: Record<string, string[]>;
  };
  schedule_items: ScheduleItem[];
  created_at: string;
  updated_at: string;
}

const SCHEDULE_PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'x', label: 'X' },
];

// ─── Platform Feed Renderers ───

function InstagramFeedPreview({ items }: { items: ScheduleItem[] }) {
  return (
    <div className="space-y-0">
      {/* IG Profile Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold">S</div>
        <span className="text-sm font-semibold text-foreground">STU25</span>
        <span className="ml-auto text-xs text-muted-foreground">Schedule Preview</span>
      </div>

      {/* IG Grid View */}
      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {items.map((item) => (
          <div key={item.id} className="relative group cursor-pointer">
            <AspectRatio ratio={1}>
              {item.media_url ? (
                <img src={item.media_url} alt={item.caption} className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center gap-1 ${
                  item.status === 'generating' ? 'bg-pink-500/10 animate-pulse' :
                  item.status === 'ready' ? 'bg-pink-500/5' :
                  'bg-muted/50'
                }`}>
                  {item.type === 'video' ? <Video className="h-5 w-5 text-muted-foreground" /> :
                   item.type === 'carousel' ? <Image className="h-5 w-5 text-muted-foreground" /> :
                   item.type === 'text' ? <Type className="h-5 w-5 text-muted-foreground" /> :
                   <Image className="h-5 w-5 text-muted-foreground" />}
                  <span className="text-[10px] text-muted-foreground">{format(parseISO(item.date), 'MMM d')}</span>
                </div>
              )}
              {item.type === 'video' && item.media_url && (
                <div className="absolute top-1 right-1"><Play className="h-3 w-3 text-white drop-shadow" /></div>
              )}
            </AspectRatio>
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs">
              <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> —</span>
              <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> —</span>
            </div>
          </div>
        ))}
      </div>

      {/* IG Feed Posts (expanded view) */}
      <div className="divide-y divide-border/30 mt-2">
        {items.slice(0, 3).map((item) => (
          <div key={`feed-${item.id}`} className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-yellow-500" />
              <span className="text-xs font-semibold">STU25</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{format(parseISO(item.date), 'MMM d, h:mm a')}</span>
            </div>
            {item.media_url ? (
              <img src={item.media_url} alt="" className="w-full rounded-md max-h-64 object-cover" />
            ) : (
              <div className="w-full h-40 rounded-md bg-muted/30 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">{item.media_prompt || 'Media pending'}</span>
              </div>
            )}
            <div className="flex items-center gap-4 text-muted-foreground">
              <Heart className="h-4 w-4" /><MessageCircle className="h-4 w-4" /><Send className="h-4 w-4" />
              <Bookmark className="h-4 w-4 ml-auto" />
            </div>
            <p className="text-xs"><span className="font-semibold">STU25</span> {item.caption}</p>
            {item.hashtags.length > 0 && (
              <p className="text-xs text-pink-500">{item.hashtags.map(h => `#${h}`).join(' ')}</p>
            )}
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FacebookFeedPreview({ items }: { items: ScheduleItem[] }) {
  return (
    <div className="space-y-3 p-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-2 p-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">S</div>
            <div>
              <p className="text-xs font-semibold">STU25</p>
              <p className="text-[10px] text-muted-foreground">{format(parseISO(item.date), 'MMM d')} · 🌐</p>
            </div>
            <MoreHorizontal className="h-4 w-4 text-muted-foreground ml-auto" />
          </div>
          <p className="px-3 pb-2 text-xs">{item.caption}</p>
          {item.hashtags.length > 0 && (
            <p className="px-3 pb-2 text-xs text-blue-500">{item.hashtags.map(h => `#${h}`).join(' ')}</p>
          )}
          {item.media_url ? (
            <img src={item.media_url} alt="" className="w-full max-h-52 object-cover" />
          ) : (
            <div className="w-full h-36 bg-muted/30 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">{item.type === 'video' ? '🎬 Video' : '📸 Image'} — {item.status}</span>
            </div>
          )}
          <div className="flex items-center justify-around p-2 border-t border-border/30 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> Like</span>
            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Comment</span>
            <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Share</span>
          </div>
          <div className="px-3 pb-2"><StatusBadge status={item.status} /></div>
        </div>
      ))}
    </div>
  );
}

function TikTokFeedPreview({ items }: { items: ScheduleItem[] }) {
  return (
    <div className="space-y-3 p-3">
      {items.map((item) => (
        <div key={item.id} className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[400px]">
          {item.media_url ? (
            <img src={item.media_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-foreground/5 to-foreground/20">
              <Video className="h-8 w-8 text-white/60 mb-2" />
              <span className="text-xs text-white/60">{item.media_prompt || 'Video pending'}</span>
            </div>
          )}
          {/* TikTok overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-white text-xs font-semibold mb-1">@STU25</p>
            <p className="text-white/90 text-[11px] line-clamp-2">{item.caption}</p>
            {item.hashtags.length > 0 && (
              <p className="text-white/70 text-[10px] mt-1">{item.hashtags.map(h => `#${h}`).join(' ')}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-white/60">{format(parseISO(item.date), 'MMM d')}</span>
              <StatusBadge status={item.status} />
            </div>
          </div>
          {/* Side actions */}
          <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 text-white/80">
            <Heart className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
            <Bookmark className="h-5 w-5" />
            <Share2 className="h-5 w-5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function XFeedPreview({ items }: { items: ScheduleItem[] }) {
  return (
    <div className="divide-y divide-border/30">
      {items.map((item) => (
        <div key={item.id} className="p-3 hover:bg-muted/20 transition-colors">
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold shrink-0">S</div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold">STU25</span>
                <span className="text-xs text-muted-foreground">@STU25 · {format(parseISO(item.date), 'MMM d')}</span>
              </div>
              <p className="text-sm">{item.caption}</p>
              {item.hashtags.length > 0 && (
                <p className="text-xs text-sky-500">{item.hashtags.map(h => `#${h}`).join(' ')}</p>
              )}
              {(item.type === 'image' || item.type === 'video') && (
                item.media_url ? (
                  <img src={item.media_url} alt="" className="w-full rounded-xl max-h-48 object-cover mt-2 border border-border/30" />
                ) : (
                  <div className="w-full h-32 rounded-xl bg-muted/30 mt-2 flex items-center justify-center border border-border/30">
                    <span className="text-xs text-muted-foreground">{item.status === 'generating' ? '⏳ Generating...' : 'Media pending'}</span>
                  </div>
                )
              )}
              <div className="flex items-center justify-between text-muted-foreground pt-1 max-w-xs">
                <MessageCircle className="h-3.5 w-3.5" />
                <Repeat2 className="h-3.5 w-3.5" />
                <Heart className="h-3.5 w-3.5" />
                <Eye className="h-3.5 w-3.5" />
                <Share2 className="h-3.5 w-3.5" />
              </div>
              <StatusBadge status={item.status} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    planned: 'bg-muted text-muted-foreground',
    generating: 'bg-yellow-500/10 text-yellow-600 animate-pulse',
    ready: 'bg-green-500/10 text-green-600',
    published: 'bg-blue-500/10 text-blue-600',
    failed: 'bg-destructive/10 text-destructive',
  };
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${styles[status] || ''}`}>
      {status}
    </Badge>
  );
}

function EmptySchedule({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <CalendarPlus className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No Content Plan Yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Ask Cortex to generate a full content schedule with images, videos, captions, and hashtags tailored to your brand.
        </p>
      </div>
      <Button onClick={onGenerate} className="gap-2">
        <Sparkles className="h-4 w-4" />
        Generate Schedule with Cortex
      </Button>
    </div>
  );
}

// ─── Main Component ───
export default function SMMSchedule({ profiles }: { profiles: SMMProfile[] }) {
  const { profileId } = useSMMContext();
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlatform, setActivePlatform] = useState('instagram');
  const [generating, setGenerating] = useState(false);

  const fetchPlans = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const { data } = await supabase
      .from('smm_content_plans')
      .select('*')
      .eq('profile_username', profileId)
      .order('created_at', { ascending: false });
    setPlans((data as any[]) || []);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // Realtime subscription
  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel('smm-content-plans')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'smm_content_plans',
        filter: `profile_username=eq.${profileId}`,
      }, () => { fetchPlans(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, fetchPlans]);

  const handleGenerate = useCallback(async () => {
    if (!profileId) return;
    setGenerating(true);
    try {
      await supabase.functions.invoke('smm-scheduler', {
        body: {
          prompt: `Create a full 7-day content schedule for ${activePlatform}. Include a mix of images, videos, and carousel posts. Generate creative captions, relevant hashtags, and visual prompts for each post. Consider the brand niche and target audience. Make it engaging and growth-oriented. Use the brand prompt library for inspiration.`,
          profile: profileId,
        },
      });
      await fetchPlans();
    } catch (e) {
      console.error('Schedule generation error:', e);
    }
    setGenerating(false);
  }, [profileId, activePlatform, fetchPlans]);

  const currentPlan = plans.find(p => p.platform === activePlatform);
  const items = (currentPlan?.schedule_items || []) as ScheduleItem[];

  // Group items by time bucket
  const todayItems = items.filter(i => { try { return isToday(parseISO(i.date)); } catch { return false; } });
  const upcomingItems = items.filter(i => { try { return !isToday(parseISO(i.date)); } catch { return true; } });

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const meta = PLATFORM_META[platform === 'x' ? 'twitter' : platform];
    if (!meta?.icon) return null;
    const Icon = meta.icon;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Content Schedule</h2>
          <p className="text-xs text-muted-foreground">
            AI-powered content planning with platform-native previews
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPlans} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1.5">
            <Sparkles className={`h-3.5 w-3.5 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'Generating…' : 'Generate Plan'}
          </Button>
        </div>
      </div>

      {/* Platform Tabs */}
      <Tabs value={activePlatform} onValueChange={setActivePlatform}>
        <TabsList className="w-full justify-start">
          {SCHEDULE_PLATFORMS.map(p => (
            <TabsTrigger key={p.value} value={p.value} className="gap-1.5 text-xs">
              <PlatformIcon platform={p.value} />
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SCHEDULE_PLATFORMS.map(p => (
          <TabsContent key={p.value} value={p.value}>
            {loading ? (
              <div className="space-y-3 p-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
              </div>
            ) : items.length === 0 ? (
              <EmptySchedule onGenerate={handleGenerate} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Platform Preview */}
                <div className="lg:col-span-2 rounded-xl border border-border/50 bg-card overflow-hidden max-h-[700px] overflow-y-auto">
                  {p.value === 'instagram' && <InstagramFeedPreview items={items} />}
                  {p.value === 'facebook' && <FacebookFeedPreview items={items} />}
                  {p.value === 'tiktok' && <TikTokFeedPreview items={items} />}
                  {p.value === 'x' && <XFeedPreview items={items} />}
                </div>

                {/* Timeline Sidebar */}
                <div className="space-y-3">
                  {currentPlan?.brand_context?.niche && (
                    <Card className="p-3 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brand Context</h4>
                      <div className="space-y-1 text-xs">
                        {currentPlan.brand_context.niche && <p><span className="font-medium">Niche:</span> {currentPlan.brand_context.niche}</p>}
                        {currentPlan.brand_context.voice && <p><span className="font-medium">Voice:</span> {currentPlan.brand_context.voice}</p>}
                        {currentPlan.brand_context.audience && <p><span className="font-medium">Audience:</span> {currentPlan.brand_context.audience}</p>}
                        {currentPlan.brand_context.keywords?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {currentPlan.brand_context.keywords.map((k, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  <Card className="p-3 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeline</h4>
                    {todayItems.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-primary mb-1">Today</p>
                        {todayItems.map(item => <TimelineItem key={item.id} item={item} />)}
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">Upcoming</p>
                      {upcomingItems.map(item => <TimelineItem key={item.id} item={item} />)}
                    </div>
                  </Card>

                  <Card className="p-3 space-y-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stats</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{items.length}</p>
                        <p className="text-muted-foreground">Total Posts</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{items.filter(i => i.status === 'ready').length}</p>
                        <p className="text-muted-foreground">Ready</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{items.filter(i => i.type === 'video').length}</p>
                        <p className="text-muted-foreground">Videos</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{items.filter(i => i.type === 'image').length}</p>
                        <p className="text-muted-foreground">Images</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TimelineItem({ item }: { item: ScheduleItem }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-l-2 border-border pl-2 ml-1">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate">{item.caption.substring(0, 50)}…</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {format(parseISO(item.date), 'MMM d')} {item.time || ''}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            {item.type}
          </Badge>
          <StatusBadge status={item.status} />
        </div>
      </div>
    </div>
  );
}
