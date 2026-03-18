import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { anchorPostsToCampaignStart } from '@/lib/smm/anchorPosts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSMMStore } from '@/lib/smm/store';
import { SMMProvider, useSMMContext } from '@/lib/smm/context';
import SMMContextBar from '@/components/smm/SMMContextBar';
import SMMPlatformRail from '@/components/smm/SMMPlatformRail';
import SMMOverview from '@/components/smm/SMMOverview';
import {
  LayoutDashboard, Users, PenLine, CalendarDays, History,
  Activity, ListOrdered, BarChart3, MessageSquare, RefreshCw, Sparkles, Music, Clock, Zap, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ArtistContinueBanner from '@/components/smm/ArtistContinueBanner';
import type { Platform, ScheduledPost } from '@/lib/smm/types';

// Lazy load heavy tabs
const SMMProfiles = lazy(() => import('@/components/smm/SMMProfiles'));
const SMMComposer = lazy(() => import('@/components/smm/SMMComposer'));
const SMMCalendar = lazy(() => import('@/components/smm/SMMCalendar'));
const SMMHistory = lazy(() => import('@/components/smm/SMMHistory'));
const SMMStatus = lazy(() => import('@/components/smm/SMMStatus'));
const SMMQueue = lazy(() => import('@/components/smm/SMMQueue'));
const SMMAnalytics = lazy(() => import('@/components/smm/SMMAnalytics'));
const SMMInstagram = lazy(() => import('@/components/smm/SMMInstagram'));
const SMMTerminal = lazy(() => import('@/components/smm/SMMTerminal'));
const SMMSchedule = lazy(() => import('@/components/smm/SMMSchedule'));
const ArtistCampaignModal = lazy(() => import('@/components/smm/ArtistCampaignModal'));
const BoostConfigModal = lazy(() => import('@/components/smm/BoostConfigModal'));

const TABS = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'schedule', label: 'Schedule', icon: Sparkles },
  { value: 'profiles', label: 'Accounts', icon: Users },
  { value: 'composer', label: 'Composer', icon: PenLine },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'history', label: 'History', icon: History },
  { value: 'status', label: 'Jobs', icon: Activity },
  { value: 'queue', label: 'Queue', icon: ListOrdered },
  { value: 'analytics', label: 'Analytics', icon: BarChart3 },
  { value: 'instagram', label: 'IG Inbox', icon: MessageSquare },
];

const UNREAD_COUNTS: Record<string, number> = {};

function TabFallback() {
  return <div className="space-y-3 p-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;
}

function mirrorPostToPlatform(post: ScheduledPost, platform: Platform): ScheduledPost {
  return {
    ...post,
    id: `${post.id}-${platform}-view`,
    platforms: [platform],
    post_urls: post.post_urls.filter(url => url.platform === platform),
  };
}

function filterPosts(posts: ScheduledPost[], profileId: string, platform: string): ScheduledPost[] {
  const profileFiltered = posts.filter(p => !profileId || p.profile_id === profileId || p.profile_username === profileId);

  if (platform === 'all') return profileFiltered;

  if (platform === 'tiktok') {
    const nativeTiktok = profileFiltered.filter(p => p.platforms.includes('tiktok'));
    const mirrored = profileFiltered
      .filter(p => p.platforms.includes('instagram') && !p.platforms.includes('tiktok'))
      .map(p => mirrorPostToPlatform(p, 'tiktok'));
    const seen = new Set(nativeTiktok.map(p => p.job_id || p.id));
    return [...nativeTiktok, ...mirrored.filter(p => !seen.has(p.job_id || p.id))];
  }

  return profileFiltered.filter(p => p.platforms.includes(platform as Platform));
}

function PSTClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-1.5">
      <Clock className="h-3 w-3" />
      <span>{time}</span>
      <span className="text-[10px] opacity-60">PST</span>
    </div>
  );
}

function DarksideBalance() {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/darkside-smm?action=balance`;
    fetch(url, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    })
      .then(r => r.json())
      .then(json => {
        const bal = json?.data?.balance;
        if (bal !== undefined) setBalance(String(bal));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-7 w-20" />;
  if (balance === null) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-1.5">
      <Wallet className="h-3 w-3 text-primary" />
      <span>${balance}</span>
    </div>
  );
}

function SMMInner() {
  const { profiles, posts, loading, refresh, setPosts, providerDown } = useSMMStore();
  const { profileId, platform, activeTab, setActiveTab, setProfileId } = useSMMContext();
  const [artistModalOpen, setArtistModalOpen] = useState(false);
  const [boostModalOpen, setBoostModalOpen] = useState(false);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: debounced auto-refresh when calendar_events are updated
  useEffect(() => {
    const channel = supabase
      .channel('smm-calendar-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'calendar_events',
        filter: 'source=eq.smm',
      }, (payload) => {
        console.log('[SMM] Realtime calendar change detected:', payload.eventType);
        if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setPosts(prev => prev.filter(p => {
              const normalizedId = p.id.replace(/-(instagram|facebook|tiktok|linkedin|pinterest|youtube|twitter)-view$/, '');
              return normalizedId !== deletedId && p.id !== deletedId && p.job_id !== deletedId;
            }));
          }
        }
        // Debounce refresh to avoid cascading reloads
        if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = setTimeout(() => refresh(), 3000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    };
  }, [refresh, setPosts]);

  // Auto-select first profile if none selected
  useEffect(() => {
    if (!profileId && profiles.length > 0) setProfileId(profiles[0].id);
  }, [profiles, profileId, setProfileId]);

  const anchoredPosts = useMemo(() => anchorPostsToCampaignStart(posts), [posts]);
  const filtered = useMemo(() => filterPosts(anchoredPosts, profileId, platform), [anchoredPosts, profileId, platform]);

  // Derive set of connected platform keys from all profiles
  const connectedPlatforms = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach(p => p.connected_platforms.filter(cp => cp.connected).forEach(cp => set.add(cp.platform)));
    return set;
  }, [profiles]);

  return (
    <AppLayout>
      <div className="relative space-y-4 animate-fade-in">
        {/* Provider Down Overlay */}
        {providerDown && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
            <div className="glass-card p-8 max-w-md text-center space-y-4 shadow-xl">
              <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Upload-Post API is Down</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The social media provider (Upload-Post) is currently experiencing an outage on their end.
                This is <span className="font-semibold text-foreground">not</span> an issue with our system.
              </p>
              <p className="text-xs text-muted-foreground">
                Please stand by — the dashboard will automatically resume when the service recovers.
              </p>
              <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={refresh} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Retry Connection
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Social Media Manager</h1>
            <p className="text-muted-foreground mt-1">Schedule, publish, and analyze social content across all platforms.</p>
          </div>
          <PSTClock />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBoostModalOpen(true)}>
              <Zap className="h-3.5 w-3.5" />
              Boost
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setArtistModalOpen(true)}>
              <Music className="h-3.5 w-3.5" />
              Artist
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <ArtistContinueBanner profileUsername={profileId || undefined} onRefresh={refresh} />
        <SMMContextBar profiles={profiles} />

        <div className="flex gap-4">
          <SMMPlatformRail posts={anchoredPosts} unreadCounts={UNREAD_COUNTS} connectedPlatforms={connectedPlatforms} />

          <div className="flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center gap-3 mb-4">
                <div className="overflow-x-auto -mx-1 px-1 flex-1">
                  <TabsList className="inline-flex w-auto">
                    {TABS.map(t => (
                      <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs sm:text-sm">
                        <t.icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <DarksideBalance />
              </div>

              <TabsContent value="overview">
                <SMMOverview posts={filtered} allPosts={anchoredPosts} profiles={profiles} onRefresh={refresh} onUpdatePostTime={(post, newDate) => {
                  const normalizedId = post.id.replace(/-(instagram|facebook|tiktok|linkedin|pinterest|youtube|twitter)-view$/, '');
                  setPosts(prev => prev.map(p => {
                    const sameJob = !!post.job_id && (p.job_id === post.job_id || p.id === post.job_id);
                    const sameId = p.id === post.id || p.id === normalizedId || p.job_id === post.id || p.job_id === normalizedId;
                    return sameJob || sameId ? { ...p, scheduled_date: newDate } : p;
                  }));
                }} />
              </TabsContent>
              <Suspense fallback={<TabFallback />}>
                <TabsContent value="schedule"><SMMSchedule profiles={profiles} /></TabsContent>
                <TabsContent value="profiles"><SMMProfiles profiles={profiles} onRefresh={refresh} /></TabsContent>
                <TabsContent value="composer"><SMMComposer profiles={profiles} onRefresh={refresh} /></TabsContent>
                <TabsContent value="calendar"><SMMCalendar posts={filtered} onRefresh={refresh} /></TabsContent>
                <TabsContent value="history"><SMMHistory posts={filtered} /></TabsContent>
                <TabsContent value="status"><SMMStatus /></TabsContent>
                <TabsContent value="queue"><SMMQueue profiles={profiles} posts={filtered} /></TabsContent>
                <TabsContent value="analytics"><SMMAnalytics profiles={profiles} /></TabsContent>
                <TabsContent value="instagram"><SMMInstagram /></TabsContent>
              </Suspense>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Persistent AI Scheduler Terminal - lazy */}
      <Suspense fallback={null}>
        {profileId && <SMMTerminal profileUsername={profileId} />}
      </Suspense>

      {/* Modals - lazy */}
      <Suspense fallback={null}>
        {artistModalOpen && (
          <ArtistCampaignModal
            open={artistModalOpen}
            onOpenChange={setArtistModalOpen}
            profileUsername={profileId || 'NysonBlack'}
            onRefresh={refresh}
          />
        )}
        {boostModalOpen && (
          <BoostConfigModal
            open={boostModalOpen}
            onOpenChange={setBoostModalOpen}
            profileUsername={profileId || 'NysonBlack'}
          />
        )}
      </Suspense>
    </AppLayout>
  );
}

export default function SMM() {
  return (
    <SMMProvider>
      <SMMInner />
    </SMMProvider>
  );
}
