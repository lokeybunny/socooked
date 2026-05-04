import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const USERNAME = (Deno.env.get("LEADSRAIN_USERNAME") || "").trim();
const API_KEY = (Deno.env.get("LEADSRAIN_API_KEY") || "").trim();

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Attempt = {
  url: string;
  ok: boolean;
  http_status: number;
  duration_ms: number;
  error?: string;
  body_preview?: string;
};

async function tryEndpoint(url: string, timeoutMs: number): Promise<Attempt> {
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({ username: USERNAME, api_key: API_KEY }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }
    const statusText = String(parsed?.status || parsed?.Status || "").toLowerCase();
    const messageText = String(parsed?.msg || parsed?.message || parsed?.error || text || "").toLowerCase();
    const explicitFailure = /\b(error|fail|failed|invalid|denied|unauthorized|missing)\b/.test(statusText) || /\b(error|fail|failed|invalid|denied|unauthorized|missing)\b/.test(messageText);
    const ok = resp.ok && !explicitFailure && (statusText === "success" || typeof parsed?.lead_id !== "undefined" || typeof parsed?.campaign_id !== "undefined" || Array.isArray(parsed));
    return {
      url,
      ok: !!ok,
      http_status: resp.status,
      duration_ms: Date.now() - start,
      error: ok ? undefined : (parsed?.msg || parsed?.message || `HTTP ${resp.status}`),
      body_preview: text.slice(0, 4000),
    };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" || /timed out|aborted/i.test(e?.message || "")
      ? `TIMEOUT after ${Date.now() - start}ms — LeadsRain server did not respond. Verify the endpoint is reachable (HTTP, not HTTPS) and that credentials are valid.`
      : (e?.message || String(e));
    return {
      url,
      ok: false,
      http_status: 0,
      duration_ms: Date.now() - start,
      error: msg,
    };
  }
}

async function getEgressIp(): Promise<string | null> {
  try {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return j.ip || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ success: false, message: "Unauthorized" }, 401);

    if (!USERNAME || !API_KEY) {
      return json({ success: false, message: "LeadsRain credentials missing on server (LEADSRAIN_USERNAME / LEADSRAIN_API_KEY)" });
    }

    // The documented `s*.leadsrain.com` shards are HTTP-only and blocked from
    // most cloud egress (Supabase included). The Postlead endpoint we actually
    // use is mirrored on `api.leadsrain.com` over HTTPS — probe that primarily,
    // then probe the s-shards for diagnostic completeness.
    const endpoints = [
      "https://api.leadsrain.com/ringless/api/add_posted_lead.php",
      "http://s2.leadsrain.com/rvm/api/campaign/view_api",
      "http://s1.leadsrain.com/rvm/api/campaign/view_api",
      "http://s3.leadsrain.com/rvm/api/campaign/view_api",
    ];

    const [egressIp, ...attempts] = await Promise.all([
      getEgressIp(),
      ...endpoints.map((u) => tryEndpoint(u, 12000)),
    ]);

    // Reachable = TCP/HTTP succeeded (any 2xx/4xx response counts as reachable).
    // The s-shards being unreachable is expected from cloud egress and not a failure
    // for the integration since we only POST leads via api.leadsrain.com.
    const apiHit = attempts.find((a) => a.url.includes("api.leadsrain.com") && a.http_status > 0);
    const winner = attempts.find((a) => a.ok) || apiHit;
    const summary = apiHit
      ? `LeadsRain reachable via api.leadsrain.com (HTTP ${apiHit.http_status} in ${apiHit.duration_ms}ms). The s2/s1/s3 shards are HTTP-only and typically blocked from cloud egress — this is expected and does not affect Postlead.`
      : `All ${attempts.length} endpoints failed. Egress IP: ${egressIp ?? "unknown"}. Per LeadsRain docs no IP whitelisting is required — check that LEADSRAIN_USERNAME / LEADSRAIN_API_KEY are valid.`;

    return json({
      success: !!winner,
      message: summary,
      egress_ip: egressIp,
      username: USERNAME,
      attempts,
    });
  } catch (e: any) {
    return json({ success: false, message: e?.message || String(e) }, 500);
  }
});
