import { useSMMContext, PLATFORM_META } from '@/lib/smm/context';
import type { SMMProfile } from '@/lib/smm/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PenLine, CalendarDays, MessageSquare, User } from 'lucide-react';

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'custom', label: 'Custom' },
];

export default function SMMContextBar({ profiles }: { profiles: SMMProfile[] }) {
  const { profileId, setProfileId, platform, setPlatform, dateRange, setDateRange, navigateToTab } = useSMMContext();

  const selectedProfile = profiles.find(p => p.id === profileId) || profiles[0];
  const connectedAccounts = selectedProfile?.connected_platforms.filter(cp => cp.connected) || [];

  return (
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border -mx-6 px-6 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Profile selector */}
        <Select value={profileId || selectedProfile?.id || ''} onValueChange={setProfileId}>
          <SelectTrigger className="w-40 h-8 text-xs gap-1.5">
            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Select profile" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-medium">{p.username}</span>
                <span className="text-muted-foreground ml-1.5">
                  · {p.connected_platforms.filter(cp => cp.connected).length} acct{p.connected_platforms.filter(cp => cp.connected).length !== 1 ? 's' : ''}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Connected account icons for selected profile — compact pills */}
        {connectedAccounts.length > 0 && (
          <div className="flex items-center gap-1">
            {connectedAccounts.map(cp => {
              const meta = PLATFORM_META[cp.platform];
              if (!meta) return null;
              const isActive = platform === cp.platform;
              return (
                <button
                  key={cp.platform}
                  onClick={() => setPlatform(isActive ? 'all' : cp.platform)}
                  title={`@${cp.display_name}`}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  } ${cp.reauth_required ? 'opacity-50 ring-1 ring-amber-500/50' : ''}`}
                >
                  <meta.icon className="w-3 h-3" />
                  <span className="hidden sm:inline truncate max-w-[80px]">@{cp.display_name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Date Range */}
        <Select value={dateRange} onValueChange={v => setDateRange(v as any)}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
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
