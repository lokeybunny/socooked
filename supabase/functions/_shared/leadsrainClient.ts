// Shared LeadsRain RVM API client.
// Auth: every call requires { username, api_key } in JSON body.
// Docs: https://leadsrain.com/apidocs/

const USERNAME = Deno.env.get("LEADSRAIN_USERNAME") || "";
const API_KEY = Deno.env.get("LEADSRAIN_API_KEY") || "";

const BASE = "https://s2.leadsrain.com";

export const ENDPOINTS = {
  campaignAdd: `${BASE}/rvm/api/campaign/add_api`,
  campaignView: `${BASE}/rvm/api/campaign/view_api`,
  campaignDelete: `${BASE}/rvm/api/campaign/delete_api`,
  listAdd: `${BASE}/rvm/api/leadlist/add_api`,
  listView: `${BASE}/rvm/api/leadlist/view_api`,
  listDelete: `${BASE}/rvm/api/leadlist/delete_api`,
  postLead: `${BASE}/ringless/api/add_posted_lead.php`,
};

export type LRResult<T = any> = {
  ok: boolean;
  status: number;
  data: T;
  raw: any;
  error?: string;
};

function creds() {
  return { username: USERNAME, api_key: API_KEY };
}

export function hasCreds(): boolean {
  return Boolean(USERNAME && API_KEY);
}

async function call(url: string, body: Record<string, any>): Promise<LRResult> {
  const payload = { ...creds(), ...body };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = { raw_text: text }; }
    const success =
      resp.ok &&
      (json?.status === "success" || typeof json?.lead_id !== "undefined" || typeof json?.campaign_id !== "undefined" || typeof json?.list_id !== "undefined");
    return {
      ok: !!success,
      status: resp.status,
      data: json,
      raw: json,
      error: success ? undefined : (json?.msg || json?.message || `HTTP ${resp.status}`),
    };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, raw: null, error: e?.message || String(e) };
  }
}

export async function testConnection(): Promise<LRResult> {
  if (!hasCreds()) return { ok: false, status: 0, data: null, raw: null, error: "Missing LEADSRAIN_USERNAME or LEADSRAIN_API_KEY" };
  // View Campaign with no campaign_id returns the user's campaign list — good for credential check.
  return await call(ENDPOINTS.campaignView, {});
}

export async function viewCampaign(campaign_id?: string | null): Promise<LRResult> {
  return await call(ENDPOINTS.campaignView, campaign_id ? { campaign_id } : {});
}

export async function viewList(list_id: string): Promise<LRResult> {
  return await call(ENDPOINTS.listView, { list_id });
}

export type PostLeadInput = {
  list_id: string;
  phone_number: string; // 10 digits
  first_name?: string;
  last_name?: string;
  email?: string;
  comments?: string;
  scrub_lead?: "no_scrub" | "tcpa_check" | "tcpa_check_with_name";
  check_duplicate?: "CHECK_DUPLICATE_IN_LIST" | "CHECK_DUPLICATE_IN_CAMPAIGN" | "NO_DUPLICATE_CHECK";
  country_code?: string;
  phone_code?: string;
};

export async function postLead(input: PostLeadInput): Promise<LRResult> {
  const body: Record<string, any> = {
    list_id: input.list_id,
    phone_number: input.phone_number,
    scrub_lead: input.scrub_lead ?? "tcpa_check",
    check_duplicate: input.check_duplicate ?? "CHECK_DUPLICATE_IN_CAMPAIGN",
    country_code: input.country_code ?? "USA",
    phone_code: input.phone_code ?? "1",
  };
  if (input.first_name) body.first_name = input.first_name;
  if (input.last_name) body.last_name = input.last_name;
  if (input.email) body.email = input.email;
  if (input.comments) body.comments = input.comments;
  return await call(ENDPOINTS.postLead, body);
}

// Normalize raw provider strings to CRM canonical statuses.
export function normalizeStatus(raw?: string | null): "queued" | "sent" | "delivered" | "failed" | "pending" | "rejected" | "unknown" {
  if (!raw) return "unknown";
  const s = String(raw).toLowerCase().trim();
  if (["delivered", "success", "completed", "sent_to_voicemail", "vm_delivered"].includes(s)) return "delivered";
  if (["sent", "dispatched", "accepted", "in_progress", "calling"].includes(s)) return "sent";
  if (["queued", "processing", "pending_dispatch", "scheduled"].includes(s)) return "queued";
  if (["pending"].includes(s)) return "pending";
  if (["failed", "error", "invalid", "no_answer", "busy"].includes(s)) return "failed";
  if (["rejected", "dnc", "tcpa", "scrub_blocked", "blocked", "fail"].includes(s)) return "rejected";
  return "unknown";
}

// Best-effort: try to parse a provider-supplied lead/drop ID from any response shape.
export function parseProviderId(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;
  return (
    raw.lead_id?.toString() ??
    raw.id?.toString() ??
    raw.posted_lead_id?.toString() ??
    raw.data?.lead_id?.toString() ??
    null
  );
}
