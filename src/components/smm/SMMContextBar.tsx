import { useSMMContext, EXTENDED_PLATFORMS, PLATFORM_META } from '@/lib/smm/context';
import type { SMMProfile } from '@/lib/smm/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PenLine, CalendarDays, MessageSquare } from 'lucide-react';

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'custom', label: 'Custom' },
];

export default function SMMContextBar({ profiles }: { profiles: SMMProfile[] }) {
  const { profileId, setProfileId, platform, setPlatform, dateRange, setDateRange, navigateToTab } = useSMMContext();

  return (
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border -mx-6 px-6 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Profile Selector */}
        <Select value={profileId || 'all'} onValueChange={v => setProfileId(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Platform Selector */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          {EXTENDED_PLATFORMS.map(p => {
            const meta = PLATFORM_META[p];
            if (!meta) return null;
            return (
              <button key={p} onClick={() => setPlatform(p)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${platform === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                title={meta.label}>
                {meta.abbr}
              </button>
            );
          })}
        </div>

        {/* Date Range */}
        <Select value={dateRange} onValueChange={v => setDateRange(v as any)}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {/* Quick Actions */}
        <div className="flex items-center gap-1.5">
          <Button variant="default" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigateToTab('composer')}>
            <PenLine className="h-3 w-3" /> Create Post
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigateToTab('calendar')}>
            <CalendarDays className="h-3 w-3" /> Calendar
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigateToTab('instagram')}>
            <MessageSquare className="h-3 w-3" /> Inbox
          </Button>
        </div>
      </div>
    </div>
  );
}
