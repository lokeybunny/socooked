import { useEffect, useState } from 'react';

const CACHE_KEY = 'visitor_city_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const DEFAULT_CITY = 'Las Vegas';

interface CachedCity {
  city: string;
  ts: number;
}

/**
 * Detects the visitor's city via free IP geolocation (ipapi.co).
 * Falls back to "Las Vegas" if detection fails or is still loading.
 * Result is cached in localStorage for 24h to avoid repeat calls.
 */
export function useVisitorCity(): string {
  const [city, setCity] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_CITY;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed: CachedCity = JSON.parse(raw);
        if (Date.now() - parsed.ts < CACHE_TTL_MS && parsed.city) {
          return parsed.city;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_CITY;
  });

  useEffect(() => {
    let aborted = false;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed: CachedCity = JSON.parse(raw);
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
        const detected: string | undefined = data?.city;
        if (!aborted && detected && typeof detected === 'string') {
          setCity(detected);
          try {
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ city: detected, ts: Date.now() } satisfies CachedCity),
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

  return city;
}
