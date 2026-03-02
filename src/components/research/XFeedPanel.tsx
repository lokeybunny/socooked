import { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ExternalLink, Heart, Repeat2, MessageCircle, Eye, Loader2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface Tweet {
  id: string;
  text: string;
  user: string;
  display_name: string;
  avatar: string;
  verified: boolean;
  gold: boolean;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  created_at: string;
  media_url: string;
  url: string;
}

const CACHE_KEY = 'x-feed-cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 min
const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 min

function getCachedFeed(): { tweets: Tweet[]; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    if (!parsed.tweets?.length) return null;
    return parsed;
  } catch { return null; }
}

function setCachedFeed(tweets: Tweet[]) {
  if (tweets.length > 0) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ tweets, ts: Date.now() }));
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function XFeedPanel() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFeed = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/x-feed-scraper`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(200_000),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const newTweets = data.tweets || [];
      if (!mountedRef.current) return;
      if (newTweets.length > 0) {
        // Merge with existing: new tweets first, then existing ones not in new set
        setTweets(prev => {
          const ids = new Set(newTweets.map((t: Tweet) => t.id));
          const kept = prev.filter(t => !ids.has(t.id));
          return [...newTweets, ...kept].slice(0, 200);
        });
        setCachedFeed(newTweets);
      }
      setLastFetched(new Date());
    } catch (err: any) {
      if (mountedRef.current) setError(err.message || 'Feed fetch failed');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Auto-load on mount + set up recurring refresh
  useEffect(() => {
    mountedRef.current = true;
    
    // Load cache first for instant display
    const cached = getCachedFeed();
    if (cached) {
      setTweets(cached.tweets);
      setLastFetched(new Date(cached.ts));
    }
    
    // Always fetch fresh data
    fetchFeed();
    
    // Auto-refresh every 10 minutes
    intervalRef.current = setInterval(fetchFeed, AUTO_REFRESH_INTERVAL);
    
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchFeed]);

  return (
    <div className="glass-card rounded-xl border border-border overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-foreground/10 flex items-center justify-center">
          <XIcon className="h-4 w-4 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground leading-tight">Live Feed</h3>
          <p className="text-[10px] text-muted-foreground">
            {loading ? 'Fetching latest tweets…' :
             tweets.length > 0
              ? `${tweets.length} tweets · ${lastFetched ? formatDistanceToNow(lastFetched, { addSuffix: true }) : ''}`
              : '500+ curated accounts'}
          </p>
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        {!loading && tweets.length > 0 && (
          <button
            onClick={fetchFeed}
            className="h-7 w-7 p-0 shrink-0 rounded-md flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Tweet list */}
      {tweets.length === 0 && !loading && !error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <XIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground text-center">No posts yet</p>
          <p className="text-xs text-muted-foreground text-center">Posts from the Telegram feed will appear here automatically.</p>
          <button
            onClick={fetchFeed}
            className="mt-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : error && tweets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
          <p className="text-sm text-destructive text-center">{error}</p>
          <p className="text-xs text-muted-foreground">Retrying automatically…</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border">
            {tweets.map((tw) => (
              <article
                key={tw.id}
                className="p-3 hover:bg-muted/30 transition-colors group cursor-pointer"
                onClick={() => window.open(tw.url, '_blank')}
              >
                <div className="flex gap-2.5">
                  {/* Avatar */}
                  <div className="shrink-0">
                    {tw.avatar ? (
                      <img
                        src={tw.avatar}
                        alt={tw.user}
                        className="h-9 w-9 rounded-full object-cover bg-muted"
                        onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).className = 'h-9 w-9 rounded-full bg-muted'; }}
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-muted" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Author line */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-sm font-bold text-foreground truncate">{tw.display_name || tw.user}</span>
                      {tw.verified && (
                        <svg viewBox="0 0 22 22" className={cn("h-3.5 w-3.5 shrink-0", tw.gold ? "text-yellow-500" : "text-blue-500")} fill="currentColor">
                          <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.607-.274 1.264-.144 1.897.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                        </svg>
                      )}
                      <span className="text-xs text-muted-foreground truncate">@{tw.user}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                        {tw.created_at ? formatDistanceToNow(new Date(tw.created_at), { addSuffix: false }) : ''}
                      </span>
                    </div>

                    {/* Tweet text */}
                    <p className="text-sm text-foreground/90 leading-snug line-clamp-3 whitespace-pre-wrap break-words">
                      {tw.text}
                    </p>

                    {/* Media */}
                    {tw.media_url && (
                      <div className="mt-1.5 rounded-xl overflow-hidden border border-border">
                        <img
                          src={tw.media_url}
                          alt=""
                          className="w-full max-h-48 object-cover bg-muted"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}

                    {/* Engagement bar */}
                    <div className="flex items-center gap-4 pt-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {tw.replies > 0 && formatNum(tw.replies)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Repeat2 className="h-3.5 w-3.5" />
                        {tw.retweets > 0 && formatNum(tw.retweets)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Heart className="h-3.5 w-3.5" />
                        {tw.likes > 0 && formatNum(tw.likes)}
                      </span>
                      {tw.views > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="h-3.5 w-3.5" />
                          {formatNum(tw.views)}
                        </span>
                      )}
                      <a
                        href={tw.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Loading overlay when refreshing with existing tweets */}
      {loading && tweets.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">Scraping latest tweets…<br />This may take 1-2 minutes.</p>
        </div>
      )}
    </div>
  );
}
