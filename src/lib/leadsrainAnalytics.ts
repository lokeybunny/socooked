export type LRSubmissionRow = {
  id: string;
  lead_id: string | null;
  contact_id: string | null;
  customer_id: string | null;
  phone_number: string;
  caller_id: string | null;
  campaign_name: string | null;
  audio_url: string | null;
  status: string;
  leadsrain_lead_id: string | null;
  leadsrain_message: string | null;
  raw_request: any;
  raw_response: any;
  error_message: string | null;
  voidfix_sms_sent: boolean;
  voidfix_sms_at: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
};

export const SUBMISSION_STATUS_STYLES: Record<string, { label: string; cls: string; dot: string }> = {
  draft:                  { label: "Draft",          cls: "border-slate-500/40 text-slate-300 bg-slate-500/10", dot: "bg-slate-400" },
  submitted_to_leadsrain: { label: "Submitting",     cls: "border-blue-500/40 text-blue-400 bg-blue-500/10",   dot: "bg-blue-400 animate-pulse" },
  accepted_by_api:        { label: "Accepted",       cls: "border-lime-500/40 text-lime-400 bg-lime-500/10",   dot: "bg-lime-400" },
  sms_followup_sent:      { label: "SMS Sent",       cls: "border-green-500/40 text-green-400 bg-green-500/10",dot: "bg-green-500" },
  failed_to_submit:       { label: "Failed",         cls: "border-red-500/40 text-red-400 bg-red-500/10",      dot: "bg-red-500" },
  unknown:                { label: "Unknown",        cls: "border-slate-500/40 text-slate-400 bg-slate-500/10",dot: "bg-slate-500" },
};

export function submissionStatusStyle(s: string | null) {
  return SUBMISSION_STATUS_STYLES[s || "unknown"] || SUBMISSION_STATUS_STYLES.unknown;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function exportSubmissionsCsv(rows: LRSubmissionRow[]): string {
  const headers = [
    "created_at","status","phone_number","caller_id","campaign_name",
    "audio_url","leadsrain_lead_id","leadsrain_message","voidfix_sms_sent","error_message",
  ];
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => esc((r as any)[h])).join(","));
  }
  return lines.join("\n");
}
