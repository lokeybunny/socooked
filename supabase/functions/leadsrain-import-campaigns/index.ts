import { corsHeaders } from '@supabase/supabase-js/cors';
import { ENDPOINTS, hasCreds } from "../_shared/leadsrainClient.ts";

const USERNAME = Deno.env.get("LEADSRAIN_USERNAME") || "";
const API_KEY = Deno.env.get("LEADSRAIN_API_KEY") || "";

async function callLR(url: string, body: Record<string, any>, timeoutMs = 12000) {
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
    return { ok: resp.ok, status: resp.status, json, text: text.slice(0, 4000), duration_ms: Date.now() - start };
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!hasCreds()) {
    return new Response(JSON.stringify({ success: false, error: "Missing LEADSRAIN_USERNAME / LEADSRAIN_API_KEY" }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Try s2 first (per docs), fall back to s1/s3 — these are HTTP-only and often blocked
  const hosts = ["http://s2.leadsrain.com", "http://s1.leadsrain.com", "http://s3.leadsrain.com"];
  let campaigns: any[] = [];
  let lists: any[] = [];
  const attempts: any[] = [];

  for (const host of hosts) {
    const c = await callLR(`${host}/rvm/api/campaign/view_api`, {});
    attempts.push({ url: `${host}/rvm/api/campaign/view_api`, status: c.status, duration_ms: c.duration_ms, error: (c as any).error, body_preview: c.text });
    if (c.ok && c.json) {
      campaigns = extractItems(c.json);
      const l = await callLR(`${host}/rvm/api/leadlist/view_api`, {});
      attempts.push({ url: `${host}/rvm/api/leadlist/view_api`, status: l.status, duration_ms: l.duration_ms, error: (l as any).error, body_preview: l.text });
      if (l.ok && l.json) lists = extractItems(l.json);
      break;
    }
  }

  const reachable = campaigns.length > 0 || lists.length > 0;
  return new Response(JSON.stringify({
    success: reachable,
    campaigns,
    lists,
    attempts,
    message: reachable
      ? `Imported ${campaigns.length} campaign(s) and ${lists.length} list(s) from LeadsRain.`
      : "Could not reach LeadsRain s1/s2/s3 management endpoints (HTTP-only, typically blocked from cloud egress). Add the campaign manually using the IDs from your LeadsRain dashboard.",
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
