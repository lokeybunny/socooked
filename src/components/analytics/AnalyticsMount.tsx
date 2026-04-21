import { useLocation } from "react-router-dom";
import { useAnalytics } from "@/hooks/useAnalytics";

// Routes where analytics tracking is enabled (public landing pages only)
const TRACKED_PATHS = [
  "/",
  "/video",
  "/videography",
  "/web",
  "/webdesign",
  "/course",
  "/liquidate",
  "/sell",
  "/store",
  "/shop",
  "/payme",
  "/stream",
  "/terms",
  "/letsmeet",
  "/solana",
  "/warren-landing",
  "/warren-guru",
  "/bundler-docs",
  "/vanities",
  "/thankyou",
  "/thankyou-videography",
  "/thankyou-seller",
  "/thankyou-webdesign",
];

function isTracked(pathname: string): boolean {
  return TRACKED_PATHS.some((p) => p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/"));
}

function TrackerInner() {
  useAnalytics();
  return null;
}

/**
 * Mounts the analytics tracker only on public landing pages.
 * Authenticated CRM routes are not tracked.
 */
export function AnalyticsMount() {
  const location = useLocation();
  if (!isTracked(location.pathname)) return null;
  return <TrackerInner />;
}
