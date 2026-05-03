export type LRCampaignRow = {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  caller_id: string | null;
  list_id: string | null;
  status: string | null;
  total_leads: number;
  processed_leads: number;
  delivered_leads: number;
  failed_leads: number;
  remaining_leads: number;
  completion_percentage: number;
  started_at: string | null;
  last_synced_at: string | null;
  estimated_completion_at: string | null;
  updated_at: string;
};

export type LRSnapshot = {
  snapshot_at: string;
  processed_count: number;
  delivered_count: number;
  failed_count: number;
  remaining_count: number;
};

export type LRSyncLog = {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: string;
  campaigns_seen: number;
  campaigns_changed: number;
  http_status: number | null;
  error: string | null;
};

export const STATUS_STYLES: Record<string, { label: string; cls: string; dot: string }> = {
  completed: { label: "Completed", cls: "border-green-500/40 text-green-400 bg-green-500/10", dot: "bg-green-500" },
  active:    { label: "Active",    cls: "border-lime-500/40 text-lime-400 bg-lime-500/10 shadow-[0_0_12px_hsl(85_85%_50%/0.3)]", dot: "bg-lime-400 animate-pulse" },
  paused:    { label: "Paused",    cls: "border-amber-500/40 text-amber-400 bg-amber-500/10", dot: "bg-amber-400" },
  queued:    { label: "Queued",    cls: "border-slate-500/40 text-slate-300 bg-slate-500/10", dot: "bg-slate-400" },
  failed:    { label: "Failed",    cls: "border-red-500/40 text-red-400 bg-red-500/10", dot: "bg-red-500" },
  cancelled: { label: "Cancelled", cls: "border-red-500/40 text-red-400 bg-red-500/10", dot: "bg-red-500" },
  unknown:   { label: "Unknown",   cls: "border-slate-500/40 text-slate-400 bg-slate-500/10", dot: "bg-slate-500" },
};

export function statusStyle(status: string | null) {
  return STATUS_STYLES[status || "unknown"] || STATUS_STYLES.unknown;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function formatPct(n: number) {
  return `${(n || 0).toFixed(1)}%`;
}
