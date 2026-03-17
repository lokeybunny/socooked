import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { anchorPostsToCampaignStart } from '@/lib/smm/anchorPosts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSMMStore } from '@/lib/smm/store';
import { SMMProvider, useSMMContext } from '@/lib/smm/context';
import SMMContextBar from '@/components/smm/SMMContextBar';
import SMMPlatformRail from '@/components/smm/SMMPlatformRail';
import SMMOverview from '@/components/smm/SMMOverview';
import SMMProfiles from '@/components/smm/SMMProfiles';
import SMMComposer from '@/components/smm/SMMComposer';
import SMMCalendar from '@/components/smm/SMMCalendar';
import SMMHistory from '@/components/smm/SMMHistory';
import SMMStatus from '@/components/smm/SMMStatus';
import SMMQueue from '@/components/smm/SMMQueue';
import SMMAnalytics from '@/components/smm/SMMAnalytics';
import SMMInstagram from '@/components/smm/SMMInstagram';
import SMMTerminal from '@/components/smm/SMMTerminal';
import SMMSchedule from '@/components/smm/SMMSchedule';
import {
  LayoutDashboard, Users, PenLine, CalendarDays, History,
  Activity, ListOrdered, BarChart3, MessageSquare, RefreshCw, Sparkles, Music, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ArtistCampaignModal from '@/components/smm/ArtistCampaignModal';
import ArtistContinueBanner from '@/components/smm/ArtistContinueBanner';
import type { Platform, ScheduledPost } from '@/lib/smm/types';

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
    // Include posts already tagged as tiktok (e.g. from upload history)
    const nativeTiktok = profileFiltered.filter(p => p.platforms.includes('tiktok'));
    // Mirror instagram posts to tiktok (scheduled/calendar posts)
    const mirrored = profileFiltered
      .filter(p => p.platforms.includes('instagram') && !p.platforms.includes('tiktok'))
      .map(p => mirrorPostToPlatform(p, 'tiktok'));
    // Dedupe by job_id
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

function SMMInner() {
  const { profiles, posts, loading, refresh, setPosts } = useSMMStore();
  const { profileId, platform, activeTab, setActiveTab, setProfileId } = useSMMContext();
  const [artistModalOpen, setArtistModalOpen] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-select first profile if none selected
  useEffect(() => {
    if (!profileId && profiles.length > 0) setProfileId(profiles[0].id);
  }, [profiles, profileId, setProfileId]);

  const anchoredPosts = useMemo(() => anchorPostsToCampaignStart(posts), [posts]);
  const filtered = filterPosts(anchoredPosts, profileId, platform);

  // Derive set of connected platform keys from all profiles
  const connectedPlatforms = new Set<string>();
  profiles.forEach(p => p.connected_platforms.filter(cp => cp.connected).forEach(cp => connectedPlatforms.add(cp.platform)));

  return (
    <AppLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Social Media Manager</h1>
            <p className="text-muted-foreground mt-1">Schedule, publish, and analyze social content across all platforms.</p>
          </div>
          <PSTClock />
          <div className="flex items-center gap-2">
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
          {/* Platform Rail */}
          <SMMPlatformRail posts={anchoredPosts} unreadCounts={UNREAD_COUNTS} connectedPlatforms={connectedPlatforms} />

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto -mx-1 px-1 mb-4">
                <TabsList className="inline-flex w-auto">
                  {TABS.map(t => (
                    <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs sm:text-sm">
                      <t.icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="overview"><SMMOverview posts={filtered} allPosts={anchoredPosts} profiles={profiles} onRefresh={refresh} onUpdatePostTime={(post, newDate) => {
                const normalizedId = post.id.replace(/-(instagram|facebook|tiktok|linkedin|pinterest|youtube|twitter)-view$/, '');
                setPosts(prev => prev.map(p => {
                  const sameJob = !!post.job_id && (p.job_id === post.job_id || p.id === post.job_id);
                  const sameId = p.id === post.id || p.id === normalizedId || p.job_id === post.id || p.job_id === normalizedId;
                  return sameJob || sameId ? { ...p, scheduled_date: newDate } : p;
                }));
              }} /></TabsContent>
              <TabsContent value="schedule"><SMMSchedule profiles={profiles} /></TabsContent>
              <TabsContent value="profiles"><SMMProfiles profiles={profiles} onRefresh={refresh} /></TabsContent>
              <TabsContent value="composer"><SMMComposer profiles={profiles} onRefresh={refresh} /></TabsContent>
              <TabsContent value="calendar"><SMMCalendar posts={filtered} onRefresh={refresh} /></TabsContent>
              <TabsContent value="history"><SMMHistory posts={filtered} /></TabsContent>
              <TabsContent value="status"><SMMStatus /></TabsContent>
              <TabsContent value="queue"><SMMQueue profiles={profiles} posts={filtered} /></TabsContent>
              <TabsContent value="analytics"><SMMAnalytics profiles={profiles} /></TabsContent>
              <TabsContent value="instagram"><SMMInstagram /></TabsContent>
            </Tabs>
          </div>
      </div>
      </div>

      {/* Persistent AI Scheduler Terminal */}
      {profileId && <SMMTerminal profileUsername={profileId} />}

      {/* Artist Campaign Modal */}
      <ArtistCampaignModal
        open={artistModalOpen}
        onOpenChange={setArtistModalOpen}
        profileUsername={profileId || 'NysonBlack'}
        onRefresh={refresh}
      />
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
