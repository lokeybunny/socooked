// Shared USD ↔ SOL conversion utility.
// One source of truth for live SOL/USD rate + formatting helpers so every
// pricing surface (VIP, Hour, checkout, receipts) renders identically.
import { useEffect, useState } from 'react';

const RATE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
const REFRESH_MS = 60_000;
const CACHE_KEY = 'wg_sol_usd_v1';
const CACHE_TTL_MS = 5 * 60_000;

type Cached = { rate: number; at: number };

let cachedRate: number | null = null;
let lastFetchAt = 0;
let inflight: Promise<number | null> | null = null;
const listeners = new Set<(rate: number | null) => void>();

function readCache(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (!c?.rate || Date.now() - c.at > CACHE_TTL_MS) return null;
    return c.rate;
  } catch { return null; }
}

function writeCache(rate: number) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, at: Date.now() } satisfies Cached)); }
  catch { /* ignore */ }
}

async function fetchRate(): Promise<number | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(RATE_URL);
      const j = await r.json();
      const price = Number(j?.solana?.usd);
      if (price > 0) {
        cachedRate = price;
        lastFetchAt = Date.now();
        writeCache(price);
        listeners.forEach((cb) => cb(price));
        return price;
      }
      return null;
    } catch { return null; }
    finally { inflight = null; }
  })();
  return inflight;
}

// Hydrate from cache once at module load
if (typeof window !== 'undefined' && cachedRate == null) {
  cachedRate = readCache();
}

/** React hook — subscribe to the live SOL/USD rate with auto-refresh. */
export function useSolUsd() {
  const [rate, setRate] = useState<number | null>(cachedRate);

  useEffect(() => {
    listeners.add(setRate);
    if (cachedRate == null || Date.now() - lastFetchAt > REFRESH_MS) {
      fetchRate().then((r) => { if (r) setRate(r); });
    }
    const id = window.setInterval(() => { fetchRate().then((r) => { if (r) setRate(r); }); }, REFRESH_MS);
    return () => { listeners.delete(setRate); window.clearInterval(id); };
  }, []);

  return {
    rate,
    /** USD → SOL string (e.g. "4.2153"). Returns "—" until rate loads. */
    usdToSol: (usd: number, digits = 4) => (rate && rate > 0 ? (usd / rate).toFixed(digits) : '—'),
    /** SOL → USD string (e.g. "$632"). Returns "—" until rate loads. */
    solToUsd: (sol: number) => (rate && rate > 0 ? `$${(sol * rate).toFixed(2)}` : '—'),
    /** USD formatted, e.g. "$999". */
    fmtUsd: (usd: number) => `$${usd.toLocaleString()}`,
  };
}

/** Imperative one-shot fetch — useful outside React (analytics, server-derived UI, etc.). */
export async function getSolUsdRate(): Promise<number | null> {
  if (cachedRate && Date.now() - lastFetchAt < REFRESH_MS) return cachedRate;
  return fetchRate();
}
