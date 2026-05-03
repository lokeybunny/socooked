// Public webhook for LeadsRain delivery callbacks (if your plan supports it).
// Configure URL in LeadsRain dashboard:
//   https://<PROJECT>.supabase.co/functions/v1/leadsrain-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeStatus } from "../_shared/leadsrainClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, message: "LeadsRain webhook live" });

  try {
    const ct = req.headers.get("content-type") || "";
    let payload: Record<string, any> = {};
    if (ct.includes("application/json")) {
      payload = await req.json().catch(() => ({}));
    } else {
      const text = await req.text();
      try { payload = JSON.parse(text); } catch {
        const params = new URLSearchParams(text);
        params.forEach((v, k) => { payload[k] = v; });
      }
    }

    const providerLeadId = payload.lead_id || payload.id || payload.posted_lead_id || null;
    const phone = String(payload.phone_number || payload.phone || "").replace(/\D/g, "").slice(-10);
    const rawStatus = payload.status || payload.delivery_status || payload.call_status || null;
    const newStatus = normalizeStatus(rawStatus);

    // Match the drop
    let drop: any = null;
    if (providerLeadId) {
      const { data } = await svc.from("leadsrain_drops").select("*").eq("provider_lead_id", String(providerLeadId)).order("created_at", { ascending: false }).limit(1).maybeSingle();
      drop = data;
    }
    if (!drop && phone) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await svc.from("leadsrain_drops").select("*").gte("created_at", since).ilike("phone_number", `%${phone}`).order("created_at", { ascending: false }).limit(1).maybeSingle();
      drop = data;
    }

    if (!drop) {
      await svc.from("lead_timeline_events").insert({
        event_type: "leadsrain_webhook_unmatched",
        event_title: "Unmatched LeadsRain webhook",
        provider: "leadsrain",
        metadata: { payload },
      });
      return json({ ok: true, matched: false });
    }

    // Idempotency: skip if status already at this terminal state
    if (drop.status === newStatus) {
      return json({ ok: true, matched: true, no_change: true, drop_id: drop.id, status: newStatus });
    }

    await svc.from("leadsrain_drops").update({
      status: newStatus,
      raw_response: { ...(drop.raw_response || {}), webhook: payload },
    }).eq("id", drop.id);

    const eventType =
      newStatus === "delivered" ? "voice_drop_delivered" :
      newStatus === "failed" || newStatus === "rejected" ? "voice_drop_failed" :
      "voice_drop_sent";

    await svc.from("lead_timeline_events").insert({
      lead_id: drop.lead_id, customer_id: drop.customer_id,
      event_type: eventType,
      event_title: `Voice drop ${newStatus} (webhook)`,
      provider: "leadsrain", provider_record_id: drop.id,
      metadata: { drop_id: drop.id, raw_status: rawStatus },
    });

    return json({ ok: true, matched: true, drop_id: drop.id, status: newStatus });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
