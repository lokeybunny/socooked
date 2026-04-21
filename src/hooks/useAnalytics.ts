import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const INGEST_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/analytics-ingest`;
const VISITOR_KEY = "wg_visitor_id";
const SESSION_KEY = "wg_session_id";
const SESSION_TS_KEY = "wg_session_ts";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity

function getOrCreateVisitor(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return crypto.randomUUID();
  }
}

function getStoredSession(): string | null {
  try {
    const id = sessionStorage.getItem(SESSION_KEY);
    const ts = Number(sessionStorage.getItem(SESSION_TS_KEY) || "0");
    if (id && Date.now() - ts < SESSION_TIMEOUT_MS) return id;
  } catch {}
  return null;
}

function storeSession(id: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, id);
    sessionStorage.setItem(SESSION_TS_KEY, String(Date.now()));
  } catch {}
}

function parseUTM(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  ["source", "medium", "campaign", "content", "term"].forEach((k) => {
    const v = params.get(`utm_${k}`);
    if (v) out[k] = v;
  });
  return out;
}

async function send(body: Record<string, unknown>) {
  try {
    const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(INGEST_URL, blob);
      return null;
    }
    const r = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return await r.json().catch(() => null);
  } catch (e) {
    console.warn("[analytics] failed", e);
    return null;
  }
}

async function ensureSession(path: string): Promise<string | null> {
  const existing = getStoredSession();
  if (existing) return existing;
  const visitor_id = getOrCreateVisitor();
  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "session_start",
      visitor_id,
      landing_path: path,
      referrer: document.referrer || null,
      utm: parseUTM(),
      user_agent: navigator.userAgent,
    }),
  });
  const j = await res.json().catch(() => null);
  if (j?.session_id) {
    storeSession(j.session_id);
    return j.session_id;
  }
  return null;
}

/**
 * Track page views for the current route. Drop into landing pages only.
 */
export function useAnalytics() {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);
  const startTime = useRef<number>(Date.now());
  const maxScroll = useRef<number>(0);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPath.current === path) return;
    const previousPath = lastPath.current;
    lastPath.current = path;
    startTime.current = Date.now();
    maxScroll.current = 0;

    (async () => {
      const visitor_id = getOrCreateVisitor();
      const session_id = await ensureSession(path);
      if (!session_id) return;
      sessionStorage.setItem(SESSION_TS_KEY, String(Date.now()));
      // If this is the first route the session was created with, the ingest already inserted the pageview.
      // Only send a new pageview when navigating to a different path.
      if (previousPath !== null) {
        await send({
          type: "pageview",
          session_id,
          visitor_id,
          path,
          title: document.title,
          referrer: document.referrer || null,
        });
      }
    })();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      if (total <= 0) return;
      const pct = Math.min(100, Math.round((h.scrollTop / total) * 100));
      if (pct > maxScroll.current) maxScroll.current = pct;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const heartbeat = window.setInterval(() => {
      const session_id = getStoredSession();
      if (!session_id) return;
      const time_on_page = Math.floor((Date.now() - startTime.current) / 1000);
      send({ type: "heartbeat", session_id, time_on_page, scroll_depth: maxScroll.current });
    }, 15000);

    const onUnload = () => {
      const session_id = getStoredSession();
      if (!session_id) return;
      const time_on_page = Math.floor((Date.now() - startTime.current) / 1000);
      send({ type: "heartbeat", session_id, time_on_page, scroll_depth: maxScroll.current });
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onUnload();
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", onUnload);
      window.clearInterval(heartbeat);
    };
  }, []);
}

/**
 * Track a custom event (button click, conversion, etc.)
 */
export function trackEvent(event_name: string, opts?: { label?: string; value?: number; meta?: Record<string, unknown> }) {
  const visitor_id = getOrCreateVisitor();
  const session_id = getStoredSession();
  send({
    type: "event",
    session_id,
    visitor_id,
    event_name,
    event_label: opts?.label,
    event_value: opts?.value,
    path: window.location.pathname,
    meta: opts?.meta,
  });
}
