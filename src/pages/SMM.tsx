import { useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
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
import {
  LayoutDashboard, Users, PenLine, CalendarDays, History,
  Activity, ListOrdered, BarChart3, MessageSquare, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Platform, ScheduledPost } from '@/lib/smm/types';

const TABS = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'profiles', label: 'Accounts', icon: Users },
  { value: 'composer', label: 'Composer', icon: PenLine },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'history', label: 'History', icon: History },
  { value: 'status', label: 'Jobs', icon: Activity },
  { value: 'queue', label: 'Queue', icon: ListOrdered },
  { value: 'analytics', label: 'Analytics', icon: BarChart3 },
  { value: 'instagram', label: 'IG Inbox', icon: MessageSquare },
];

const UNREAD_COUNTS: Record<string, number> = { instagram: 2 };

function filterPosts(posts: ScheduledPost[], profileId: string, platform: string): ScheduledPost[] {
  return posts
    .filter(p => !profileId || p.profile_id === profileId)
    .filter(p => platform === 'all' || p.platforms.includes(platform as Platform));
}

function SMMInner() {
  const { profiles, posts, loading, refresh } = useSMMStore();
  const { profileId, platform, activeTab, setActiveTab, setProfileId } = useSMMContext();

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-select first profile if none selected
  useEffect(() => {
    if (!profileId && profiles.length > 0) setProfileId(profiles[0].id);
  }, [profiles, profileId, setProfileId]);

  const filtered = filterPosts(posts, profileId, platform);

  return (
    <AppLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Social Media Manager</h1>
            <p className="text-muted-foreground mt-1">Schedule, publish, and analyze social content across all platforms.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <SMMContextBar profiles={profiles} />

        <div className="flex gap-4">
          {/* Platform Rail */}
          <SMMPlatformRail posts={posts} unreadCounts={UNREAD_COUNTS} />

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

              <TabsContent value="overview"><SMMOverview posts={filtered} allPosts={posts} profiles={profiles} /></TabsContent>
              <TabsContent value="profiles"><SMMProfiles profiles={profiles} onRefresh={refresh} /></TabsContent>
              <TabsContent value="composer"><SMMComposer profiles={profiles} onRefresh={refresh} /></TabsContent>
              <TabsContent value="calendar"><SMMCalendar posts={filtered} onRefresh={refresh} /></TabsContent>
              <TabsContent value="history"><SMMHistory posts={filtered} /></TabsContent>
              <TabsContent value="status"><SMMStatus /></TabsContent>
              <TabsContent value="queue"><SMMQueue profiles={profiles} /></TabsContent>
              <TabsContent value="analytics"><SMMAnalytics profiles={profiles} /></TabsContent>
              <TabsContent value="instagram"><SMMInstagram /></TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
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
