import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSMMStore } from '@/lib/smm/store';
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
  Activity, ListOrdered, BarChart3, Instagram,
} from 'lucide-react';

const TABS = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'profiles', label: 'Profiles', icon: Users },
  { value: 'composer', label: 'Composer', icon: PenLine },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'history', label: 'History', icon: History },
  { value: 'status', label: 'Jobs', icon: Activity },
  { value: 'queue', label: 'Queue', icon: ListOrdered },
  { value: 'analytics', label: 'Analytics', icon: BarChart3 },
  { value: 'instagram', label: 'IG Inbox', icon: Instagram },
];

export default function SMM() {
  const { profiles, posts, loading, refresh } = useSMMStore();
  const [tab, setTab] = useState('overview');

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Social Media Manager</h1>
          <p className="text-muted-foreground mt-1">Schedule, publish, and analyze social content across all platforms.</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex w-auto">
              {TABS.map(t => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs sm:text-sm">
                  <t.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview"><SMMOverview posts={posts} /></TabsContent>
          <TabsContent value="profiles"><SMMProfiles profiles={profiles} onRefresh={refresh} /></TabsContent>
          <TabsContent value="composer"><SMMComposer profiles={profiles} onRefresh={refresh} /></TabsContent>
          <TabsContent value="calendar"><SMMCalendar posts={posts} onRefresh={refresh} /></TabsContent>
          <TabsContent value="history"><SMMHistory posts={posts} /></TabsContent>
          <TabsContent value="status"><SMMStatus /></TabsContent>
          <TabsContent value="queue"><SMMQueue profiles={profiles} /></TabsContent>
          <TabsContent value="analytics"><SMMAnalytics profiles={profiles} /></TabsContent>
          <TabsContent value="instagram"><SMMInstagram /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
