// LeadsRain Connection Diagnostic
// Server-side definitive test: network, auth, parsing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SECRET_USER = (Deno.env.get("LEADSRAIN_USERNAME") || "").trim();
const SECRET_KEY = (Deno.env.get("LEADSRAIN_API_KEY") || "").trim();
const RAW_PROXY = (Deno.env.get("LEADSRAIN_PROXY_URL") || "").replace(/\/+$/, "");
const PROXY = /^https:\/\//i.test(RAW_PROXY) && !/\.leadsrain\.com/i.test(RAW_PROXY) ? RAW_PROXY : "";

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type ResultType =
  | "NETWORK_TIMEOUT"
  | "NETWORK_REACHABLE_AUTH_FAILED"
  | "AUTH_SUCCESS_CAMPAIGNS_FOUND"
  | "AUTH_SUCCESS_NO_CAMPAIGNS"
  | "AUTH_SUCCESS_PARSE_UNKNOWN"
  | "REACHABLE_PARSE_NEEDS_MAPPING"
  | "API_ERROR"
  | "OPTIONAL_PROXY_NOT_CONFIGURED"
  | "SERVER_ERROR"
  | "UNKNOWN";

const DIAGNOSIS: Record<ResultType, string> = {
  NETWORK_TIMEOUT: "LeadsRain did not respond from this environment. This is a network/proxy/egress issue, not an auth failure.",
  NETWORK_REACHABLE_AUTH_FAILED: "LeadsRain responded, but credentials were rejected. This proves the network path works and the username/API key are wrong.",
  AUTH_SUCCESS_CAMPAIGNS_FOUND: "Credentials are valid and campaign data was returned.",
  AUTH_SUCCESS_NO_CAMPAIGNS: "Credentials are valid, but no campaigns were returned.",
  AUTH_SUCCESS_PARSE_UNKNOWN: "LeadsRain responded, but the response shape needs mapping.",
  REACHABLE_PARSE_NEEDS_MAPPING: "LeadsRain returned HTTP 200 but no known success field. Endpoint is reachable; map the response shape to mark Success.",
  API_ERROR: "LeadsRain returned a 4xx error. Check request payload or credentials.",
  OPTIONAL_PROXY_NOT_CONFIGURED: "Optional proxy not configured. Only required for legacy campaign-view endpoints. PostLead HTTPS works without it.",
  SERVER_ERROR: "LeadsRain server responded with a 5xx error.",
  UNKNOWN: "Unable to classify the response.",
};

// Flexible LeadsRain response parser. Looks for ANY of the known success/error shapes.
function parseLeadsRain(json: any, bodyText: string) {
  const known = {
    success: undefined as any,
    status: undefined as any,
    message: undefined as any,
    error: undefined as any,
    campaign_id: undefined as any,
    lead_id: undefined as any,
    data: undefined as any,
    result: undefined as any,
  };
  if (json && typeof json === "object") {
    known.success = json.success;
    known.status = json.status ?? json.Status;
    known.message = json.msg ?? json.message;
    known.error = json.error;
    known.campaign_id = json.campaign_id ?? json.list_id;
    known.lead_id = json.lead_id ?? json.id ?? json.posted_lead_id ?? json.data?.lead_id;
    known.data = json.data;
    known.result = json.result;
  }
  const statusStr = String(known.status ?? "").toLowerCase();
  const msgStr = String(known.message ?? known.error ?? "").toLowerCase();
  const haystack = `${statusStr} ${msgStr} ${(bodyText || "").toLowerCase()}`;
  const successHit =
    known.success === true ||
    !!known.lead_id ||
    !!known.campaign_id ||
    statusStr === "success" || statusStr === "ok" ||
    /\b(success|accepted|added|submitted|posted)\b/.test(haystack);
  const errorHit =
    known.success === false ||
    /\b(invalid api key|invalid username|unauthorized|denied|failed|failure|error)\b/.test(haystack);
  return { known, successHit, errorHit };
}

function classify({ httpStatus, bodyText, json, error, timedOut }: {
  httpStatus: number; bodyText: string; json: any; error: string | null; timedOut: boolean;
}): ResultType {
  if (timedOut || httpStatus === 0) return "NETWORK_TIMEOUT";
  const errLow = (error || "").toLowerCase();
  if (/timeout|aborted|fetch failed|connection refused|network/.test(errLow) && httpStatus === 0) return "NETWORK_TIMEOUT";
  if (httpStatus >= 500 && httpStatus <= 599) return "SERVER_ERROR";

  const bodyLow = (bodyText || "").toLowerCase();
  const msg = String(json?.msg || json?.message || json?.error || "").toLowerCase();
  const haystack = `${bodyLow} ${msg}`;
  if (/invalid username|invalid api[\s_-]?key|unauthorized|authentication failed|login failed|api key required/.test(haystack)) {
    return "NETWORK_REACHABLE_AUTH_FAILED";
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    // Try campaign arrays first
    const arrays = [
      Array.isArray(json) ? json : null,
      Array.isArray(json?.data) ? json.data : null,
      Array.isArray(json?.campaigns) ? json.campaigns : null,
      Array.isArray(json?.campaign) ? json.campaign : null,
      Array.isArray(json?.result) ? json.result : null,
    ].filter(Boolean) as any[][];
    if (arrays.length) {
      return arrays[0].length > 0 ? "AUTH_SUCCESS_CAMPAIGNS_FOUND" : "AUTH_SUCCESS_NO_CAMPAIGNS";
    }
    // Flexible parser — any known success marker
    const { successHit, errorHit } = parseLeadsRain(json, bodyText);
    if (successHit && !errorHit) return "AUTH_SUCCESS_PARSE_UNKNOWN";
    // HTTP 200 with no known shape: reachable, parser mapping needed (NOT a failure)
    return "REACHABLE_PARSE_NEEDS_MAPPING";
  }
  if (httpStatus >= 400 && httpStatus < 500) return "API_ERROR";
  return "UNKNOWN";
}

async function runTest(name: string, endpoint: string, payload: Record<string, any>, timeoutMs: number) {
  const start = Date.now();
  let httpStatus = 0;
  let bodyText = "";
  let parsed: any = null;
  let error: string | null = null;
  let timedOut = false;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = resp.status;
    bodyText = await resp.text();
    try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
  } catch (e: any) {
    error = e?.message || String(e);
    if (e?.name === "TimeoutError" || /timed out|aborted|deadline/i.test(error || "")) timedOut = true;
  }
  const result_type = classify({ httpStatus, bodyText, json: parsed, error, timedOut });
  return {
    name,
    endpoint,
    http_status: httpStatus,
    duration_ms: Date.now() - start,
    result_type,
    diagnosis: DIAGNOSIS[result_type],
    error,
    raw_text_preview: bodyText.slice(0, 2000),
    raw_json: parsed,
  };
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return key.slice(0, 2) + "…";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Auth (admin-only)
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const overrideUser = (body?.username || "").toString().trim();
    const overrideKey = (body?.api_key || "").toString().trim();
    const campaignId = (body?.campaign_id || "").toString().trim();
    const mode = (body?.mode || "all").toString();

    const username = overrideUser || SECRET_USER;
    const api_key = overrideKey || SECRET_KEY;

    if (!username || !api_key) {
      return json({ ok: false, error: "Missing username or api_key (none provided and no Supabase secrets configured)" }, 400);
    }

    const credPayload: Record<string, any> = { username, api_key };
    const cidPayload = campaignId ? { ...credPayload, campaign_id: campaignId } : null;

    const tests: Array<Promise<any>> = [];
    const want = (m: string) => mode === "all" || mode === m;

    // PostLead is the authoritative health signal — always include in "all".
    if (want("postlead") || mode === "all") {
      tests.push(runTest("PostLead HTTPS Reachability (PRIMARY)", "https://api.leadsrain.com/ringless/api/add_posted_lead.php", credPayload, 12000));
    }
    if (want("s2")) {
      tests.push(runTest("Direct S2 Campaign View (legacy/optional)", "http://s2.leadsrain.com/rvm/api/campaign/view_api", credPayload, 12000));
      if (cidPayload) tests.push(runTest("Direct S2 Campaign View w/ ID (legacy/optional)", "http://s2.leadsrain.com/rvm/api/campaign/view_api", cidPayload, 12000));
    }
    if (want("s1")) tests.push(runTest("Direct S1 Campaign View (legacy/optional)", "http://s1.leadsrain.com/rvm/api/campaign/view_api", credPayload, 12000));
    if (want("s3")) tests.push(runTest("Direct S3 Campaign View (legacy/optional)", "http://s3.leadsrain.com/rvm/api/campaign/view_api", credPayload, 12000));
    if (want("proxy")) {
      if (PROXY) {
        tests.push(runTest("Proxy Campaign View (legacy/optional)", `${PROXY}/rvm/api/campaign/view_api`, credPayload, 45000));
        if (cidPayload) tests.push(runTest("Proxy Campaign View w/ ID (legacy/optional)", `${PROXY}/rvm/api/campaign/view_api`, cidPayload, 45000));
      } else {
        tests.push(Promise.resolve({
          name: "Proxy Campaign View (legacy/optional)",
          endpoint: RAW_PROXY || "(not configured — optional)",
          http_status: 0,
          duration_ms: 0,
          result_type: "OPTIONAL_PROXY_NOT_CONFIGURED" as ResultType,
          diagnosis: RAW_PROXY
            ? "LEADSRAIN_PROXY_URL is set but invalid. Optional — only needed for legacy campaign-view endpoints. PostLead HTTPS works without it."
            : "Optional Cloudflare/Fly proxy not configured. PostLead HTTPS still works without it; only legacy campaign-view endpoints need this proxy.",
          error: "proxy_not_configured (optional)",
          raw_text_preview: "",
          raw_json: null,
        }));
      }
    }

    const results = await Promise.all(tests);

    // Final diagnosis
    const has = (t: ResultType) => results.find((r) => r.result_type === t);
    const found = has("AUTH_SUCCESS_CAMPAIGNS_FOUND");
    const noCamps = has("AUTH_SUCCESS_NO_CAMPAIGNS");
    const authFail = has("NETWORK_REACHABLE_AUTH_FAILED");
    const parseUnknown = has("AUTH_SUCCESS_PARSE_UNKNOWN");
    const serverErr = has("SERVER_ERROR");

    const campaignTests = results.filter((r) => /Campaign View/i.test(r.name));
    const postleadTest = results.find((r) => /PostLead HTTPS/i.test(r.name));
    const allCampaignsTimedOut = campaignTests.length > 0 && campaignTests.every((r) => r.result_type === "NETWORK_TIMEOUT");
    const reachableNeedsMap = has("REACHABLE_PARSE_NEEDS_MAPPING");

    let final_diagnosis = "No LeadsRain endpoint reachable from this environment.";
    let recommended_next_step = "Deploy an external proxy or use Zapier as bridge.";
    let network_reachable: boolean | null = false;
    let auth_valid: boolean | null = null;
    let campaigns_found: boolean | null = null;
    let best_endpoint: string | null = null;

    if (found) {
      final_diagnosis = "Working. Auth valid. Campaigns found.";
      recommended_next_step = "Use this endpoint for polling.";
      network_reachable = true; auth_valid = true; campaigns_found = true;
      best_endpoint = found.endpoint;
    } else if (noCamps) {
      final_diagnosis = "Working. Auth valid. No campaigns found.";
      recommended_next_step = "Create or activate a campaign in LeadsRain, then sync again.";
      network_reachable = true; auth_valid = true; campaigns_found = false;
      best_endpoint = noCamps.endpoint;
    } else if (authFail) {
      final_diagnosis = "Network works. Credentials are wrong.";
      recommended_next_step = "Confirm exact LeadsRain username. Try login email first.";
      network_reachable = true; auth_valid = false;
      best_endpoint = authFail.endpoint;
    } else if (postleadTest && postleadTest.http_status >= 200 && postleadTest.http_status < 500) {
      // PostLead HTTPS reachable = integration considered healthy. Campaign view is legacy/optional.
      final_diagnosis = postleadTest.result_type === "REACHABLE_PARSE_NEEDS_MAPPING"
        ? "LeadsRain API is reachable. Parser mapping required."
        : (allCampaignsTimedOut
          ? "Healthy. PostLead API reachable. Campaign View endpoint timed out (legacy/optional)."
          : "Healthy. PostLead API reachable.");
      recommended_next_step = "Use HTTPS PostLead API for live workflow. Campaign View endpoint is legacy/optional.";
      network_reachable = true; auth_valid = null;
      best_endpoint = postleadTest.endpoint;
    } else if (parseUnknown || reachableNeedsMap) {
      const t = parseUnknown || reachableNeedsMap!;
      final_diagnosis = "LeadsRain API is reachable. Parser mapping required.";
      recommended_next_step = "Inspect the raw JSON below and update the parser.";
      network_reachable = true; auth_valid = null;
      best_endpoint = t.endpoint;
    }

    return json({
      ok: true,
      summary: {
        final_diagnosis,
        network_reachable,
        auth_valid,
        campaigns_found,
        best_endpoint,
        recommended_next_step,
      },
      credentials: {
        username_present: !!username,
        api_key_present: !!api_key,
        api_key_preview: maskKey(api_key),
        username_source: overrideUser ? "override" : "secret",
        proxy_configured: !!PROXY,
        proxy_misconfigured: !!RAW_PROXY && !PROXY,
      },
      tests: results,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
