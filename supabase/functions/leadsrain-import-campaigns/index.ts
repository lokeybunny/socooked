// Pulls LeadsRain campaigns/lists. LeadsRain s1/s2/s3 are HTTP-only and
// typically blocked from cloud egress, so we prefer LEADSRAIN_PROXY_URL
// (Cloudflare Worker in cloudflare-worker/leadsrain-proxy) when set.
//
// Optional request body: { proxy_url?: string, campaign_ids?: string[] }
//   - proxy_url overrides the secret for one call
//   - campaign_ids lets the caller pin specific IDs (e.g. ["368407"]) so
//     they show up even if the list endpoint is empty/blocked.

import { hasCreds } from "../_shared/leadsrainClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USERNAME = Deno.env.get("LEADSRAIN_USERNAME") || "";
const API_KEY = Deno.env.get("LEADSRAIN_API_KEY") || "";
const PROXY_URL_SECRET = (Deno.env.get("LEADSRAIN_PROXY_URL") || "").replace(/\/+$/, "");

async function callLR(url: string, body: Record<string, any>, timeoutMs = 8000) {
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({ username: USERNAME, api_key: API_KEY, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { ok: resp.ok, status: resp.status, json, text: text.slice(0, 2000), duration_ms: Date.now() - start };
  } catch (e: any) {
    return { ok: false, status: 0, json: null, text: "", error: e?.message || String(e), duration_ms: Date.now() - start };
  }
}

function extractItems(json: any): any[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.campaigns)) return json.campaigns;
  if (Array.isArray(json?.lists)) return json.lists;
  if (Array.isArray(json?.result)) return json.result;
  if (Array.isArray(json?.records)) return json.records;
  if (json?.data && typeof json.data === "object") return Object.values(json.data);
  return [];
}

function extractOne(json: any): any | null {
  if (!json) return null;
  if (Array.isArray(json)) return json[0] ?? null;
  if (json?.data && !Array.isArray(json.data)) return json.data;
  if (Array.isArray(json?.data)) return json.data[0] ?? null;
  if (json?.campaign) return json.campaign;
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!hasCreds()) {
    return new Response(JSON.stringify({ success: false, error: "Missing LEADSRAIN_USERNAME / LEADSRAIN_API_KEY" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: any = {};
  try { payload = await req.json(); } catch { /* empty body ok */ }
  const requestedIds: string[] = Array.isArray(payload?.campaign_ids)
    ? payload.campaign_ids.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const proxyUrl = String(payload?.proxy_url || PROXY_URL_SECRET || "").replace(/\/+$/, "");

  // Build candidate base hosts. Proxy first (HTTPS, reachable), then HTTP shards (usually blocked).
  const bases: string[] = [];
  if (proxyUrl) bases.push(proxyUrl);
  bases.push("http://s2.leadsrain.com", "http://s1.leadsrain.com", "http://s3.leadsrain.com");

  let campaigns: any[] = [];
  let lists: any[] = [];
  let usedBase: string | null = null;
  const attempts: any[] = [];

  for (const base of bases) {
    const c = await callLR(`${base}/rvm/api/campaign/view_api`, {});
    attempts.push({ base, kind: "campaigns", status: c.status, duration_ms: c.duration_ms, error: (c as any).error, body_preview: c.text });
    if (c.ok && c.json) {
      campaigns = extractItems(c.json);
      const l = await callLR(`${base}/rvm/api/leadlist/view_api`, {});
      attempts.push({ base, kind: "lists", status: l.status, duration_ms: l.duration_ms, error: (l as any).error, body_preview: l.text });
      if (l.ok && l.json) lists = extractItems(l.json);
      usedBase = base;
      break;
    }
  }

  // Pin specific campaign IDs (e.g. 368407) by fetching them individually.
  const haveIds = new Set(campaigns.map((c: any) => String(c?.campaign_id ?? c?.id ?? "")));
  for (const id of requestedIds) {
    if (haveIds.has(id)) continue;
    let pinned: any = null;
    for (const base of bases) {
      const r = await callLR(`${base}/rvm/api/campaign/view_api`, { campaign_id: id });
      attempts.push({ base, kind: `campaign:${id}`, status: r.status, duration_ms: r.duration_ms, error: (r as any).error });
      if (r.ok && r.json) {
        pinned = extractOne(r.json);
        if (!usedBase) usedBase = base;
        break;
      }
    }
    if (pinned) {
      if (!pinned.campaign_id) pinned.campaign_id = id;
      campaigns.push(pinned);
    } else {
      // At least surface a stub so the UI shows it.
      campaigns.push({ campaign_id: id, campaign_name: `Campaign ${id} (unreachable)`, status: "unknown", _stub: true });
    }
  }

  const reachable = campaigns.length > 0 || lists.length > 0;
  return new Response(JSON.stringify({
    success: reachable,
    campaigns,
    lists,
    used_base: usedBase,
    proxy_configured: Boolean(proxyUrl),
    attempts,
    message: reachable
      ? `Imported ${campaigns.length} campaign(s) and ${lists.length} list(s)${usedBase ? ` via ${usedBase}` : ""}.`
      : (proxyUrl
          ? "Proxy is configured but did not return data. Check the worker URL and LeadsRain credentials."
          : "Could not reach LeadsRain. Deploy the Cloudflare Worker in cloudflare-worker/leadsrain-proxy and set LEADSRAIN_PROXY_URL."),
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
