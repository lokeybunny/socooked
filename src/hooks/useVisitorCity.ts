import { useEffect, useState } from 'react';

const CACHE_KEY = 'visitor_city_v2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const DEFAULT_CITY = 'Las Vegas';
const DEFAULT_REGION = 'NV';

interface CachedLocation {
  city: string;
  region: string; // state/region code, e.g. "NV", "CA"
  ts: number;
}

export interface VisitorLocation {
  city: string;
  region: string;
}

/**
 * Detects the visitor's city + region (state code) via free IP geolocation (ipapi.co).
 * Falls back to "Las Vegas, NV" if detection fails or is still loading.
 * Cached in localStorage for 24h.
 */
export function useVisitorLocation(): VisitorLocation {
  const [loc, setLoc] = useState<VisitorLocation>(() => {
    if (typeof window === 'undefined') return { city: DEFAULT_CITY, region: DEFAULT_REGION };
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed: CachedLocation = JSON.parse(raw);
        if (Date.now() - parsed.ts < CACHE_TTL_MS && parsed.city) {
          return { city: parsed.city, region: parsed.region || DEFAULT_REGION };
        }
      }
    } catch {
      // ignore
    }
    return { city: DEFAULT_CITY, region: DEFAULT_REGION };
  });

  useEffect(() => {
    let aborted = false;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed: CachedLocation = JSON.parse(raw);
        if (Date.now() - parsed.ts < CACHE_TTL_MS && parsed.city) return;
      }
    } catch {
      // ignore
    }

    (async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) return;
        const data = await res.json();
        const detectedCity: string | undefined = data?.city;
        const detectedRegion: string | undefined = data?.region_code || data?.region;
        if (!aborted && detectedCity && typeof detectedCity === 'string') {
          const next = {
            city: detectedCity,
            region: (detectedRegion && typeof detectedRegion === 'string') ? detectedRegion : DEFAULT_REGION,
          };
          setLoc(next);
          try {
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ ...next, ts: Date.now() } satisfies CachedLocation),
            );
          } catch {
            // ignore
          }
        }
      } catch {
        // network error — keep default
      }
    })();

    return () => {
      aborted = true;
    };
  }, []);

  return loc;
}

/**
 * Backwards-compatible city-only hook.
 */
export function useVisitorCity(): string {
  return useVisitorLocation().city;
}
