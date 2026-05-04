// LeadsRain PostLead proxy — thin wrapper around the HTTPS PostLead API.
// All browser/CRM code MUST go through this function instead of calling LeadsRain directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LR_USER = (Deno.env.get("LEADSRAIN_USERNAME") || "").trim();
const LR_KEY = (Deno.env.get("LEADSRAIN_API_KEY") || "").trim();
const RAW_PROXY = (Deno.env.get("LEADSRAIN_PROXY_URL") || "").replace(/\/+$/, "");
const PROXY = /^https:\/\//i.test(RAW_PROXY) && !/\.leadsrain\.com/i.test(RAW_PROXY) ? RAW_PROXY : "";

const ENDPOINTS = [
  ...(PROXY ? [`${PROXY}/ringless/api/add_posted_lead.php`] : []),
  "https://api.leadsrain.com/ringless/api/add_posted_lead.php",
];

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function normPhone(raw: string) {
  const d = String(raw || "").replace(/\D/g, "");
  let ten = d;
  if (d.length === 11 && d.startsWith("1")) ten = d.slice(1);
  return ten.length === 10 ? ten : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    if (!LR_USER || !LR_KEY) return json({ ok: false, error: "Missing LeadsRain credentials" }, 500);

    const body = await req.json().catch(() => ({}));
    const ten = normPhone(body?.phone_number);
    if (!ten) return json({ ok: false, error: "phone_number must be 10-digit US" }, 400);
    if (!body?.list_id) return json({ ok: false, error: "list_id required" }, 400);

    const payload: Record<string, any> = {
      username: LR_USER,
      api_key: LR_KEY,
      list_id: String(body.list_id),
      phone_number: ten,
      first_name: body.first_name || "",
      last_name: body.last_name || "",
      email: body.email || "",
      country_code: body.country_code || "USA",
      phone_code: body.phone_code || "1",
      scrub_lead: body.scrub_lead || "tcpa_check",
      check_duplicate: body.check_duplicate || "CHECK_DUPLICATE_IN_CAMPAIGN",
    };
    if (body.caller_id) payload.caller_id = String(body.caller_id);
    if (body.comments) payload.comments = String(body.comments);

    let lastErr: string | null = null;
    let lastStatus = 0;
    let lastJson: any = null;
    let usedEndpoint: string | null = null;

    for (const ep of ENDPOINTS) {
      usedEndpoint = ep;
      try {
        const resp = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000),
        });
        lastStatus = resp.status;
        const text = await resp.text();
        try { lastJson = text ? JSON.parse(text) : { raw: "" }; } catch { lastJson = { raw: text }; }
        const leadId = lastJson?.lead_id?.toString() || null;
        const statusText = String(lastJson?.status || lastJson?.Status || "").toLowerCase();
        const success = resp.ok && (leadId || ["success", "ok", "accepted", "submitted"].includes(statusText));
        if (success) {
          return json({
            ok: true,
            lead_id: leadId,
            http_status: resp.status,
            endpoint: ep,
            response: lastJson,
          });
        }
        lastErr = lastJson?.msg || lastJson?.message || lastJson?.error || (text.trim() === "" ? `Empty HTTP ${resp.status}` : `HTTP ${resp.status}`);
        if (/invalid username|api key/i.test(lastErr || "")) break;
      } catch (e: any) {
        lastErr = e?.message || String(e);
      }
    }

    return json({ ok: false, error: lastErr || "PostLead failed", http_status: lastStatus, endpoint: usedEndpoint, response: lastJson }, 502);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
