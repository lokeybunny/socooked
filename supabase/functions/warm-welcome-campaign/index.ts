// Warm Welcome Campaign control plane
// Actions:
//   - start:  { action:'start', name?, contacts: [{hot_reply_id?, phone, name?, reply_text?, reply_at?}] }
//   - stop:   { action:'stop', campaign_id }
//   - resume: { action:'resume', campaign_id }
//   - status: { action:'status', campaign_id? }   (returns latest if no id)
//   - logs:   { action:'logs', campaign_id, limit? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function last10(raw: string) { return String(raw || "").replace(/\D/g, "").slice(-10); }
function e164(raw: string) {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

async function start(payload: any) {
  const contacts: any[] = Array.isArray(payload?.contacts) ? payload.contacts : [];
  if (contacts.length === 0) return json({ ok: false, error: "no_contacts" }, 400);

  const { data: campaign, error } = await sb.from("warm_welcome_campaigns").insert({
    name: payload?.name || `Warm Welcome ${new Date().toISOString().slice(0,16).replace('T',' ')}`,
    status: 'running',
    total_targets: contacts.length,
    filter_snapshot: payload?.filter_snapshot || null,
  }).select().single();
  if (error) return json({ ok: false, error: error.message }, 500);

  const seen = new Set<string>();
  const rows = contacts
    .map((c) => ({
      campaign_id: campaign.id,
      hot_reply_id: c.hot_reply_id || null,
      phone_last10: last10(c.phone),
      phone_e164: e164(c.phone),
      name: c.name || null,
      reply_text: c.reply_text || null,
      reply_at: c.reply_at || null,
    }))
    .filter((r) => {
      if (!r.phone_last10 || r.phone_last10.length !== 10) return false;
      if (seen.has(r.phone_last10)) return false;
      seen.add(r.phone_last10);
      return true;
    });

  if (rows.length) {
    const { error: tErr } = await sb.from("warm_welcome_targets").insert(rows);
    if (tErr) return json({ ok: false, error: tErr.message }, 500);
  }

  await sb.from("warm_welcome_campaigns")
    .update({ total_targets: rows.length })
    .eq("id", campaign.id);

  await sb.from("warm_welcome_logs").insert({
    campaign_id: campaign.id,
    level: 'info',
    message: `Campaign started with ${rows.length} contacts`,
  });

  return json({ ok: true, campaign_id: campaign.id, queued: rows.length });
}

async function stop(payload: any) {
  if (!payload?.campaign_id) return json({ ok: false, error: "missing_campaign_id" }, 400);
  await sb.from("warm_welcome_campaigns").update({ status: 'stopped' }).eq("id", payload.campaign_id);
  await sb.from("warm_welcome_logs").insert({
    campaign_id: payload.campaign_id, level: 'warn', message: 'Campaign stopped by user',
  });
  return json({ ok: true });
}

async function resume(payload: any) {
  if (!payload?.campaign_id) return json({ ok: false, error: "missing_campaign_id" }, 400);
  await sb.from("warm_welcome_campaigns").update({ status: 'running', cooldown_until: null }).eq("id", payload.campaign_id);
  await sb.from("warm_welcome_logs").insert({
    campaign_id: payload.campaign_id, level: 'info', message: 'Campaign resumed',
  });
  return json({ ok: true });
}

async function status(payload: any) {
  let q = sb.from("warm_welcome_campaigns").select("*").order("created_at", { ascending: false }).limit(1);
  if (payload?.campaign_id) q = sb.from("warm_welcome_campaigns").select("*").eq("id", payload.campaign_id).limit(1);
  const { data } = await q;
  return json({ ok: true, campaign: data?.[0] || null });
}

async function logs(payload: any) {
  if (!payload?.campaign_id) return json({ ok: false, error: "missing_campaign_id" }, 400);
  const { data } = await sb.from("warm_welcome_logs")
    .select("*").eq("campaign_id", payload.campaign_id)
    .order("created_at", { ascending: false }).limit(payload?.limit || 100);
  return json({ ok: true, logs: data || [] });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  switch (payload?.action) {
    case "start":  return start(payload);
    case "stop":   return stop(payload);
    case "resume": return resume(payload);
    case "status": return status(payload);
    case "logs":   return logs(payload);
    default: return json({ ok: false, error: "unknown_action" }, 400);
  }
});
