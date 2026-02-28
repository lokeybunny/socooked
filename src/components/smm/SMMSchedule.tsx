import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSMMContext, PLATFORM_META } from '@/lib/smm/context';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  CalendarPlus, Sparkles, RefreshCw, Image, Video, Type, Hash,
  Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Send,
  ThumbsUp, Repeat2, Eye, Play, Zap, Clock, CheckCircle2,
  AlertCircle, Loader2, RotateCcw,
} from 'lucide-react';
import type { SMMProfile } from '@/lib/smm/types';
import { format, parseISO, isToday, differenceInHours } from 'date-fns';

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
  status: 'draft' | 'generating' | 'ready' | 'published' | 'failed' | 'planned';
}

interface ContentPlan {
  id: string;
  profile_username: string;
  platform: string;
  plan_name: string;
  status: string; // draft | live | completed
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

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; icon: React.ReactNode }> = {
    draft: { bg: 'bg-muted text-muted-foreground', icon: <Clock className="h-2.5 w-2.5" /> },
    generating: { bg: 'bg-yellow-500/10 text-yellow-600 animate-pulse', icon: <Loader2 className="h-2.5 w-2.5 animate-spin" /> },
    ready: { bg: 'bg-green-500/10 text-green-600', icon: <CheckCircle2 className="h-2.5 w-2.5" /> },
    published: { bg: 'bg-blue-500/10 text-blue-600', icon: <Zap className="h-2.5 w-2.5" /> },
    failed: { bg: 'bg-destructive/10 text-destructive', icon: <AlertCircle className="h-2.5 w-2.5" /> },
    planned: { bg: 'bg-muted text-muted-foreground', icon: <Clock className="h-2.5 w-2.5" /> },
  };
  const c = config[status] || config.draft;
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${c.bg}`}>
      {c.icon} {status}
    </Badge>
  );
}

// ─── Template Placeholder (shown when media not yet generated) ───
function MediaPlaceholder({ item }: { item: ScheduleItem }) {
  const hoursUntil = differenceInHours(parseISO(item.date), new Date());
  const isWithin48h = hoursUntil <= 48 && hoursUntil > 0;

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center gap-2 ${
      item.status === 'generating' ? 'bg-yellow-500/5 animate-pulse' :
      isWithin48h ? 'bg-primary/5 border border-dashed border-primary/20' :
      'bg-muted/30 border border-dashed border-border/50'
    }`}>
      {item.status === 'generating' ? (
        <>
          <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />
          <span className="text-[10px] text-yellow-600 font-medium">Generating…</span>
        </>
      ) : (
        <>
          {item.type === 'video' ? <Video className="h-5 w-5 text-muted-foreground" /> :
           item.type === 'carousel' ? <Image className="h-5 w-5 text-muted-foreground" /> :
           <Image className="h-5 w-5 text-muted-foreground" />}
          <span className="text-[10px] text-muted-foreground text-center px-2 max-w-[120px] truncate">
            {isWithin48h ? '⏰ Generating soon' : `📅 ${format(parseISO(item.date), 'MMM d')}`}
          </span>
          <span className="text-[9px] text-muted-foreground/60">Template</span>
        </>
      )}
    </div>
  );
}

// ─── Platform Feed Renderers ───

function InstagramFeedPreview({ items }: { items: ScheduleItem[] }) {
  return (
    <div className="space-y-0">
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold">S</div>
        <span className="text-sm font-semibold text-foreground">STU25</span>
        <span className="ml-auto text-xs text-muted-foreground">Schedule Preview</span>
      </div>
      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {items.map((item) => (
          <div key={item.id} className="relative group cursor-pointer">
            <AspectRatio ratio={1}>
              {item.media_url ? (
                <img src={item.media_url} alt={item.caption} className="w-full h-full object-cover" />
              ) : (
                <MediaPlaceholder item={item} />
              )}
              {item.type === 'video' && item.media_url && (
                <div className="absolute top-1 right-1"><Play className="h-3 w-3 text-white drop-shadow" /></div>
              )}
            </AspectRatio>
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs">
              <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> —</span>
              <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> —</span>
            </div>
          </div>
        ))}
      </div>
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
              <div className="w-full h-40 rounded-md overflow-hidden"><MediaPlaceholder item={item} /></div>
            )}
            <div className="flex items-center gap-4 text-muted-foreground">
              <Heart className="h-4 w-4" /><MessageCircle className="h-4 w-4" /><Send className="h-4 w-4" />
              <Bookmark className="h-4 w-4 ml-auto" />
            </div>
            <p className="text-xs"><span className="font-semibold">STU25</span> {item.caption}</p>
            {item.hashtags?.length > 0 && (
              <p className="text-xs text-pink-500">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
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
          {item.media_url ? (
            <img src={item.media_url} alt="" className="w-full max-h-52 object-cover" />
          ) : item.type !== 'text' ? (
            <div className="w-full h-36"><MediaPlaceholder item={item} /></div>
          ) : null}
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
            <div className="w-full h-full"><MediaPlaceholder item={item} /></div>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-white text-xs font-semibold mb-1">@STU25</p>
            <p className="text-white/90 text-[11px] line-clamp-2">{item.caption}</p>
            {item.hashtags?.length > 0 && (
              <p className="text-white/70 text-[10px] mt-1">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-white/60">{format(parseISO(item.date), 'MMM d')}</span>
              <StatusBadge status={item.status} />
            </div>
          </div>
          <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 text-white/80">
            <Heart className="h-5 w-5" /><MessageCircle className="h-5 w-5" /><Bookmark className="h-5 w-5" /><Share2 className="h-5 w-5" />
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
              {item.hashtags?.length > 0 && (
                <p className="text-xs text-sky-500">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
              )}
              {(item.type === 'image' || item.type === 'video') && (
                item.media_url ? (
                  <img src={item.media_url} alt="" className="w-full rounded-xl max-h-48 object-cover mt-2 border border-border/30" />
                ) : (
                  <div className="w-full h-32 rounded-xl mt-2 overflow-hidden"><MediaPlaceholder item={item} /></div>
                )
              )}
              <div className="flex items-center justify-between text-muted-foreground pt-1 max-w-xs">
                <MessageCircle className="h-3.5 w-3.5" /><Repeat2 className="h-3.5 w-3.5" />
                <Heart className="h-3.5 w-3.5" /><Eye className="h-3.5 w-3.5" /><Share2 className="h-3.5 w-3.5" />
              </div>
              <StatusBadge status={item.status} />
            </div>
          </div>
        </div>
      ))}
    </div>
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
          Tell Cortex about your brand and goals — it'll ask the right questions before building your schedule.
        </p>
      </div>
      <Button onClick={onGenerate} className="gap-2">
        <Sparkles className="h-4 w-4" />
        Start Planning with Cortex
      </Button>
    </div>
  );
}

// ─── Cortex Chat Panel ───
function CortexChat({ profileId, platform, onPlanCreated }: { profileId: string; platform: string; onPlanCreated: () => void }) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg = { role: 'user', text: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('smm-scheduler', {
        body: {
          prompt: msg,
          profile: profileId,
          history: [...messages, userMsg],
        },
      });

      if (error) throw error;

      if (data?.type === 'clarify') {
        setMessages(prev => [...prev, { role: 'cortex', text: data.message }]);
      } else if (data?.type === 'content_plan') {
        setMessages(prev => [...prev, { role: 'cortex', text: `✅ ${data.message}` }]);
        onPlanCreated();
      } else if (data?.type === 'message') {
        setMessages(prev => [...prev, { role: 'cortex', text: data.message }]);
      } else {
        setMessages(prev => [...prev, { role: 'cortex', text: data?.message || 'Done.' }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'cortex', text: `❌ Error: ${e.message}` }]);
    }
    setLoading(false);
  };

  return (
    <Card className="flex flex-col h-[400px]">
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Cortex — SMM Strategist</span>
        <Badge variant="outline" className="text-[9px] ml-auto">{platform}</Badge>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <p className="text-xs text-muted-foreground">👋 Tell Cortex about your brand and what you want to schedule.</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {[
                'Create a week of Instagram content for my restaurant',
                'Plan 7 days of TikTok videos for a fitness brand',
                'Schedule a content plan for my tech startup on X',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => send(suggestion)}
                  className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-border/50 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Tell Cortex about your brand…"
          className="text-xs h-8"
          disabled={loading}
        />
        <Button size="sm" onClick={() => send()} disabled={loading || !input.trim()} className="h-8 px-3">
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

// ─── Main Component ───
export default function SMMSchedule({ profiles }: { profiles: SMMProfile[] }) {
  const { profileId } = useSMMContext();
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlatform, setActivePlatform] = useState('instagram');
  const [pushingLive, setPushingLive] = useState(false);

  const [resetting, setResetting] = useState(false);

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

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel('smm-content-plans')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'smm_content_plans', filter: `profile_username=eq.${profileId}` },
        () => { fetchPlans(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, fetchPlans]);

  const currentPlan = plans.find(p => p.platform === activePlatform);
  const items = (currentPlan?.schedule_items || []) as ScheduleItem[];
  const isDraft = currentPlan?.status === 'draft';
  const isLive = currentPlan?.status === 'live';

  const handlePushLive = async () => {
    if (!currentPlan) return;
    setPushingLive(true);
    try {
      const { error } = await supabase
        .from('smm_content_plans')
        .update({ status: 'live' } as any)
        .eq('id', currentPlan.id);
      if (error) throw error;
      toast.success('🔴 Schedule is now LIVE! Media will auto-generate 48hrs before each post.');
      await fetchPlans();
    } catch (e: any) {
      toast.error(`Failed to push live: ${e.message}`);
    }
    setPushingLive(false);
  };

  const handleReset = async () => {
    if (!profileId) return;
    setResetting(true);
    try {
      const platformsToReset = ['instagram', 'facebook', 'tiktok', 'x'];
      const { error } = await supabase
        .from('smm_content_plans')
        .delete()
        .eq('profile_username', profileId)
        .in('platform', platformsToReset);
      if (error) throw error;
      toast.success('Content schedule reset — all platform plans cleared.');
      await fetchPlans();
    } catch (e: any) {
      toast.error(`Failed to reset: ${e.message}`);
    }
    setResetting(false);
  };

  const todayItems = items.filter(i => { try { return isToday(parseISO(i.date)); } catch { return false; } });
  const upcomingItems = items.filter(i => { try { return !isToday(parseISO(i.date)); } catch { return true; } });

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const meta = PLATFORM_META[platform === 'x' ? 'twitter' : platform];
    if (!meta?.icon) return null;
    const Icon = meta.icon;
    return <Icon className="h-4 w-4" />;
  };

  const readyCount = items.filter(i => i.status === 'ready').length;
  const draftCount = items.filter(i => i.status === 'draft').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Content Schedule</h2>
          <p className="text-xs text-muted-foreground">
            {currentPlan ? (
              <>
                {currentPlan.plan_name}
                {isDraft && <span className="ml-2 text-yellow-600">● Draft — review & push live</span>}
                {isLive && <span className="ml-2 text-green-600">● Live — media auto-generates 48hrs before posts</span>}
              </>
            ) : 'Chat with Cortex to build your content strategy'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPlans} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          {/* Reset Button */}
          {plans.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" disabled={resetting}>
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Content Schedule?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all content plans for Instagram, Facebook, TikTok, and X. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, Reset All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* ─── THE RED BUTTON ─── */}
          {currentPlan && isDraft && (
            <Button
              size="sm"
              onClick={handlePushLive}
              disabled={pushingLive}
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 font-bold"
            >
              {pushingLive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Schedule to LIVE
            </Button>
          )}

          {isLive && (
            <Badge className="bg-green-600 text-white text-[10px] gap-1">
              <CheckCircle2 className="h-3 w-3" /> LIVE
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activePlatform} onValueChange={setActivePlatform}>
        <TabsList className="w-full justify-start">
          {SCHEDULE_PLATFORMS.map(p => (
            <TabsTrigger key={p.value} value={p.value} className="gap-1.5 text-xs">
              <PlatformIcon platform={p.value} />
              {p.label}
              {plans.find(pl => pl.platform === p.value) && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <EmptySchedule onGenerate={() => {}} />
                <CortexChat profileId={profileId || 'STU25'} platform={p.value} onPlanCreated={fetchPlans} />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Platform Preview */}
                <div className="lg:col-span-2 rounded-xl border border-border/50 bg-card overflow-hidden max-h-[700px] overflow-y-auto">
                  {p.value === 'instagram' && <InstagramFeedPreview items={items} />}
                  {p.value === 'facebook' && <FacebookFeedPreview items={items} />}
                  {p.value === 'tiktok' && <TikTokFeedPreview items={items} />}
                  {p.value === 'x' && <XFeedPreview items={items} />}
                </div>

                {/* Sidebar */}
                <div className="space-y-3">
                  {/* Cortex Chat */}
                  <CortexChat profileId={profileId || 'STU25'} platform={p.value} onPlanCreated={fetchPlans} />

                  {/* Brand Context */}
                  {currentPlan?.brand_context?.niche && (
                    <Card className="p-3 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brand Context</h4>
                      <div className="space-y-1 text-xs">
                        {currentPlan.brand_context.niche && <p><span className="font-medium">Niche:</span> {currentPlan.brand_context.niche}</p>}
                        {currentPlan.brand_context.voice && <p><span className="font-medium">Voice:</span> {currentPlan.brand_context.voice}</p>}
                        {currentPlan.brand_context.audience && <p><span className="font-medium">Audience:</span> {currentPlan.brand_context.audience}</p>}
                        {currentPlan.brand_context.keywords && currentPlan.brand_context.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {currentPlan.brand_context.keywords.map((k: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  {/* Timeline */}
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

                  {/* Stats */}
                  <Card className="p-3 space-y-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stats</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{items.length}</p>
                        <p className="text-muted-foreground">Total</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{draftCount}</p>
                        <p className="text-muted-foreground">Templates</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{readyCount}</p>
                        <p className="text-muted-foreground">Ready</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{items.filter(i => i.type === 'video').length}</p>
                        <p className="text-muted-foreground">Videos</p>
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
        <p className="text-[11px] font-medium truncate">{item.caption?.substring(0, 50)}…</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {format(parseISO(item.date), 'MMM d')} {item.time || ''}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0">{item.type}</Badge>
          <StatusBadge status={item.status} />
        </div>
      </div>
    </div>
  );
}
