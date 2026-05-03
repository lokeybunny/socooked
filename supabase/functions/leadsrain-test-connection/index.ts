import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const USERNAME = Deno.env.get("LEADSRAIN_USERNAME") || "";
const API_KEY = Deno.env.get("LEADSRAIN_API_KEY") || "";

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
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({ username: USERNAME, api_key: API_KEY }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }
    const ok = resp.ok && (parsed?.status === "success" || typeof parsed?.campaign_id !== "undefined" || Array.isArray(parsed));
    return {
      url,
      ok: !!ok,
      http_status: resp.status,
      duration_ms: Date.now() - start,
      error: ok ? undefined : (parsed?.msg || parsed?.message || `HTTP ${resp.status}`),
      body_preview: text.slice(0, 400),
    };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" || /timed out|aborted/i.test(e?.message || "")
      ? `TIMEOUT after ${Date.now() - start}ms — LeadsRain server did not respond. Most likely cause: this server's IP is not whitelisted in your LeadsRain account.`
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

    const subdomains = ["s2", "s1", "s3", "app"];
    const endpoints = subdomains.map((s) => `https://${s}.leadsrain.com/rvm/api/campaign/view_api`);

    const [egressIp, ...attempts] = await Promise.all([
      getEgressIp(),
      ...endpoints.map((u) => tryEndpoint(u, 15000)),
    ]);

    const winner = attempts.find((a) => a.ok);
    const summary = winner
      ? `Connected via ${winner.url.match(/https:\/\/([^.]+)\./)?.[1]} in ${winner.duration_ms}ms`
      : `All ${attempts.length} endpoints failed. Egress IP: ${egressIp ?? "unknown"}. Likely cause: IP not whitelisted in LeadsRain.`;

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
