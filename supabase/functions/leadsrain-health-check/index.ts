// LeadsRain Health Check
// Authoritative integration health: PostLead HTTPS = primary signal.
// Campaign view endpoints are legacy/optional.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LR_USER = (Deno.env.get("LEADSRAIN_USERNAME") || "").trim();
const LR_KEY = (Deno.env.get("LEADSRAIN_API_KEY") || "").trim();
const RAW_PROXY = (Deno.env.get("LEADSRAIN_PROXY_URL") || "").replace(/\/+$/, "");
const PROXY = /^https:\/\//i.test(RAW_PROXY) && !/\.leadsrain\.com/i.test(RAW_PROXY) ? RAW_PROXY : "";

const POST_LEAD_URL = "https://api.leadsrain.com/ringless/api/add_posted_lead.php";
const CAMPAIGN_VIEW_PATH = "/rvm/api/campaign/view_api";

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function probe(url: string, payload: Record<string, any>, timeoutMs: number) {
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}
    return {
      reachable: true,
      http_status: resp.status,
      duration_ms: Date.now() - start,
      body_preview: text.slice(0, 500),
      json: parsed,
      error: null as string | null,
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    const timedOut = e?.name === "TimeoutError" || /timed out|aborted|deadline/i.test(msg);
    return {
      reachable: false,
      http_status: 0,
      duration_ms: Date.now() - start,
      body_preview: "",
      json: null,
      error: timedOut ? "timeout" : msg,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Auth (any logged-in user)
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader) {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
    }

    if (!LR_USER || !LR_KEY) return json({ ok: false, error: "Missing LeadsRain credentials" }, 500);

    const creds = { username: LR_USER, api_key: LR_KEY };

    // Primary: PostLead HTTPS reachability (no real lead — bogus list_id triggers a structured rejection without dropping VM)
    const postLead = await probe(POST_LEAD_URL, { ...creds, list_id: "0", phone_number: "0000000000", country_code: "USA", phone_code: "1" }, 12000);

    // Optional: legacy campaign view via proxy first, then direct s2 (HTTP, will likely timeout)
    const campaignViewProxy = PROXY ? await probe(`${PROXY}${CAMPAIGN_VIEW_PATH}`, creds, 15000) : null;
    const campaignViewDirect = !campaignViewProxy?.reachable
      ? await probe(`http://s2.leadsrain.com${CAMPAIGN_VIEW_PATH}`, creds, 8000)
      : null;

    const post_lead_status = postLead.reachable && postLead.http_status >= 200 && postLead.http_status < 500
      ? "reachable"
      : (postLead.error === "timeout" ? "timeout" : "unreachable");

    let campaign_view_status: "reachable" | "timeout" | "unreachable" | "not_configured" = "not_configured";
    const cv = campaignViewProxy?.reachable ? campaignViewProxy : campaignViewDirect;
    if (cv) {
      if (cv.reachable && cv.http_status >= 200 && cv.http_status < 500) campaign_view_status = "reachable";
      else if (cv.error === "timeout") campaign_view_status = "timeout";
      else campaign_view_status = "unreachable";
    }

    const api_reachable = post_lead_status === "reachable";

    let recommendation = "Use HTTPS PostLead API for live workflow.";
    if (api_reachable && campaign_view_status !== "reachable") {
      recommendation = "Use HTTPS PostLead API for live workflow. Campaign View endpoint may be legacy or unavailable.";
    } else if (!api_reachable) {
      recommendation = "PostLead API not reachable — verify LeadsRain status and credentials.";
    }

    return json({
      ok: true,
      api_reachable,
      post_lead_status,
      campaign_view_status,
      proxy_configured: !!PROXY,
      proxy_misconfigured: !!RAW_PROXY && !PROXY,
      recommendation,
      details: {
        post_lead: { url: POST_LEAD_URL, ...postLead },
        campaign_view_proxy: campaignViewProxy ? { url: `${PROXY}${CAMPAIGN_VIEW_PATH}`, ...campaignViewProxy } : null,
        campaign_view_direct: campaignViewDirect ? { url: `http://s2.leadsrain.com${CAMPAIGN_VIEW_PATH}`, ...campaignViewDirect } : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
