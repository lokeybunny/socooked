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

  const selectedProfile = profiles.find(p => p.id === profileId);

  return (
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border -mx-6 px-6 py-3 space-y-2">
      {/* Connected accounts banner */}
      {selectedProfile && selectedProfile.connected_platforms.length > 0 && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground font-medium">Connected:</span>
          {selectedProfile.connected_platforms.map(cp => {
            const meta = PLATFORM_META[cp.platform];
            if (!meta) return null;
            return (
              <button
                key={cp.platform}
                onClick={() => setPlatform(cp.platform)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors ${
                  platform === cp.platform
                    ? 'bg-primary text-primary-foreground'
                    : meta.color
                } ${cp.reauth_required ? 'opacity-50' : ''}`}
              >
                <meta.icon className="w-3 h-3" />
                <span className="font-semibold">@{cp.display_name}</span>
                {cp.reauth_required && <span className="text-[9px]">(reauth)</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Profile Selector */}
        <Select value={profileId || 'all'} onValueChange={v => setProfileId(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-52 h-8 text-xs">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {profiles.map(p => {
              const handles = p.connected_platforms
                .map(cp => {
                  const meta = PLATFORM_META[cp.platform];
                  return meta ? `${meta.abbr}: @${cp.display_name}` : null;
                })
                .filter(Boolean)
                .join(' · ');
              return (
                <SelectItem key={p.id} value={p.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{p.username}</span>
                    {handles && <span className="text-[10px] text-muted-foreground">{handles}</span>}
                  </div>
                </SelectItem>
              );
            })}
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
