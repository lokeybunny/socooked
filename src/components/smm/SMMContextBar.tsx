import { useSMMContext, PLATFORM_META } from '@/lib/smm/context';
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
  const { profileId, platform, setPlatform, dateRange, setDateRange, navigateToTab } = useSMMContext();

  // Auto-resolve the active profile (single-profile setup)
  const selectedProfile = profiles.find(p => p.id === profileId) || profiles[0];
  const connectedAccounts = selectedProfile?.connected_platforms.filter(cp => cp.connected) || [];

  return (
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border -mx-6 px-6 py-3 space-y-2">
      {/* Connected accounts as primary selectors */}
      {connectedAccounts.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-medium">Accounts:</span>
          {connectedAccounts.map(cp => {
            const meta = PLATFORM_META[cp.platform];
            if (!meta) return null;
            const isActive = platform === cp.platform;
            return (
              <button
                key={cp.platform}
                onClick={() => setPlatform(cp.platform)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                } ${cp.reauth_required ? 'opacity-50 ring-1 ring-amber-500/50' : ''}`}
              >
                <meta.icon className="w-3.5 h-3.5" />
                <span>@{cp.display_name}</span>
                {cp.reauth_required && <span className="text-[9px] text-amber-500">(reauth)</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
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
