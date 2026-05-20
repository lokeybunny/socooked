/**
 * SmartImage rehost cache.
 *
 * Avoids repeated `story-composer/image-rehost` invocations by remembering
 * `{ originalUrl -> hostedUrl }` mappings.
 *
 * Two layers:
 *  1. Runtime in-memory Map (fast, survives component remounts)
 *  2. localStorage persistence (survives full page reloads) — capped via LRU
 */

const LS_KEY = 'studio:rehostCache:v1';
const MAX_ENTRIES = 200;
let DEBUG = false;
export const setRehostCacheDebug = (v: boolean) => { DEBUG = v; };

interface Entry { hosted: string; t: number; }

const mem = new Map<string, Entry>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadFromLS() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.hosted === 'string') mem.set(k, v);
    }
    if (DEBUG) console.debug('[rehostCache] loaded', mem.size, 'entries');
  } catch (e) {
    if (DEBUG) console.warn('[rehostCache] load failed', e);
  }
}

function scheduleSave() {
  if (typeof window === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      // LRU prune
      if (mem.size > MAX_ENTRIES) {
        const sorted = [...mem.entries()].sort((a, b) => a[1].t - b[1].t);
        const toRemove = sorted.length - MAX_ENTRIES;
        for (let i = 0; i < toRemove; i++) mem.delete(sorted[i][0]);
      }
      const obj: Record<string, Entry> = {};
      mem.forEach((v, k) => { obj[k] = v; });
      window.localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch {
      /* quota or disabled — silently ignore */
    }
  }, 250);
}

export function getCachedRehost(originalUrl: string): string | null {
  if (!originalUrl) return null;
  loadFromLS();
  const hit = mem.get(originalUrl);
  if (!hit) return null;
  hit.t = Date.now(); // bump LRU
  return hit.hosted;
}

export function setCachedRehost(originalUrl: string, hostedUrl: string) {
  if (!originalUrl || !hostedUrl || originalUrl === hostedUrl) return;
  loadFromLS();
  mem.set(originalUrl, { hosted: hostedUrl, t: Date.now() });
  scheduleSave();
}

export function clearRehostCache() {
  mem.clear();
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(LS_KEY); } catch { /* noop */ }
  }
}

export function rehostCacheStats() {
  loadFromLS();
  return { size: mem.size, max: MAX_ENTRIES };
}
