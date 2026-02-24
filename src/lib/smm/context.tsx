import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Platform } from './types';
import { 
  InstagramLogo, 
  FacebookLogo, 
  TikTokLogo, 
  XLogo, 
  LinkedInLogo, 
  YoutubeLogo, 
  PinterestLogo, 
  RedditLogo, 
  ThreadsLogo, 
  BlueskyLogo 
} from '@/components/smm/SMMBrandIcons';
import { LayoutGrid } from 'lucide-react';

export type DateRange = 'today' | '7d' | '30d' | 'custom';

export const ALL_PLATFORMS: (Platform | 'all')[] = ['all', 'instagram', 'facebook', 'tiktok', 'twitter', 'linkedin', 'youtube', 'pinterest'];
export const EXTENDED_PLATFORMS: string[] = ['all', 'instagram', 'facebook', 'tiktok', 'twitter', 'linkedin', 'youtube', 'pinterest', 'reddit', 'threads', 'bluesky'];

export const PLATFORM_META: Record<string, { label: string; color: string; abbr: string; icon: any }> = {
  all:       { label: 'All Platforms', color: 'bg-muted text-foreground', abbr: 'ALL', icon: LayoutGrid },
  instagram: { label: 'Instagram', color: 'bg-pink-500/10 text-pink-500', abbr: 'IG', icon: InstagramLogo },
  facebook:  { label: 'Facebook', color: 'bg-blue-500/10 text-blue-500', abbr: 'FB', icon: FacebookLogo },
  tiktok:    { label: 'TikTok', color: 'bg-foreground/10 text-foreground', abbr: 'TT', icon: TikTokLogo },
  twitter:   { label: 'X (Twitter)', color: 'bg-foreground/10 text-foreground', abbr: 'X', icon: XLogo },
  linkedin:  { label: 'LinkedIn', color: 'bg-sky-600/10 text-sky-600', abbr: 'LI', icon: LinkedInLogo },
  youtube:   { label: 'YouTube', color: 'bg-red-500/10 text-red-500', abbr: 'YT', icon: YoutubeLogo },
  pinterest: { label: 'Pinterest', color: 'bg-red-600/10 text-red-600', abbr: 'PI', icon: PinterestLogo },
  reddit:    { label: 'Reddit', color: 'bg-orange-500/10 text-orange-500', abbr: 'RD', icon: RedditLogo },
  threads:   { label: 'Threads', color: 'bg-foreground/10 text-foreground', abbr: 'TH', icon: ThreadsLogo },
  bluesky:   { label: 'Bluesky', color: 'bg-sky-400/10 text-sky-400', abbr: 'BS', icon: BlueskyLogo },
};

interface SMMContextType {
  profileId: string;
  setProfileId: (id: string) => void;
  platform: string;
  setPlatform: (p: string) => void;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  navigateToTab: (tab: string, opts?: { platform?: string; profileId?: string }) => void;
}

const SMMContext = createContext<SMMContextType | null>(null);

export function SMMProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [profileId, setProfileIdState] = useState(searchParams.get('profile') || '');
  const [platform, setPlatformState] = useState(searchParams.get('platform') || 'all');
  const [dateRange, setDateRangeState] = useState<DateRange>((searchParams.get('range') as DateRange) || '7d');
  const [activeTab, setActiveTabState] = useState(searchParams.get('tab') || 'overview');

  // Sync to URL
  const syncParams = useCallback((updates: Record<string, string>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v && v !== 'all' && v !== '7d' && v !== 'overview') next.set(k, v);
        else next.delete(k);
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setProfileId = useCallback((id: string) => { setProfileIdState(id); syncParams({ profile: id }); }, [syncParams]);
  const setPlatform = useCallback((p: string) => { setPlatformState(p); syncParams({ platform: p }); }, [syncParams]);
  const setDateRange = useCallback((r: DateRange) => { setDateRangeState(r); syncParams({ range: r }); }, [syncParams]);
  const setActiveTab = useCallback((t: string) => { setActiveTabState(t); syncParams({ tab: t }); }, [syncParams]);

  const navigateToTab = useCallback((tab: string, opts?: { platform?: string; profileId?: string }) => {
    if (opts?.platform) setPlatformState(opts.platform);
    if (opts?.profileId) setProfileIdState(opts.profileId);
    setActiveTabState(tab);
    syncParams({
      tab,
      platform: opts?.platform || platform,
      profile: opts?.profileId || profileId,
    });
  }, [platform, profileId, syncParams]);

  return (
    <SMMContext.Provider value={{ profileId, setProfileId, platform, setPlatform, dateRange, setDateRange, activeTab, setActiveTab, navigateToTab }}>
      {children}
    </SMMContext.Provider>
  );
}

export function useSMMContext() {
  const ctx = useContext(SMMContext);
  if (!ctx) throw new Error('useSMMContext must be used within SMMProvider');
  return ctx;
}
