import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { viewCampaign, normalizeStatus, hasCreds } from "../_shared/leadsrainClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
    if (!hasCreds()) return json({ ok: false, error: "Server missing LeadsRain credentials" }, 500);

    const { drop_id } = await req.json().catch(() => ({}));
    if (!drop_id) return json({ ok: false, error: "drop_id required" }, 400);

    const { data: drop } = await svc.from("leadsrain_drops").select("*").eq("id", drop_id).maybeSingle();
    if (!drop) return json({ ok: false, error: "Drop not found" }, 404);

    const lr = await viewCampaign(drop.provider_campaign_id);
    if (!lr.ok) return json({ ok: false, error: lr.error || "LeadsRain refresh failed", raw: lr.raw });

    // Best-effort: scan for the lead in returned campaign payload
    const candidates: any[] = Array.isArray(lr.raw?.leads) ? lr.raw.leads
      : Array.isArray(lr.raw?.data?.leads) ? lr.raw.data.leads
      : Array.isArray(lr.raw?.data) ? lr.raw.data
      : [];
    const match = candidates.find((c: any) =>
      String(c.lead_id || c.id || "") === String(drop.provider_lead_id || "") ||
      String(c.phone_number || c.phone || "").replace(/\D/g, "").endsWith(drop.phone_number.replace(/\D/g, "").slice(-10))
    );
    const rawStatus = match?.status || match?.delivery_status || match?.call_status || null;
    const newStatus = normalizeStatus(rawStatus);

    if (newStatus !== "unknown" && newStatus !== drop.status) {
      await svc.from("leadsrain_drops").update({
        status: newStatus,
        raw_response: lr.raw,
      }).eq("id", drop.id);

      const eventType = newStatus === "delivered" ? "voice_drop_delivered"
        : newStatus === "failed" || newStatus === "rejected" ? "voice_drop_failed"
        : "voice_drop_sent";

      await svc.from("lead_timeline_events").insert({
        lead_id: drop.lead_id, customer_id: drop.customer_id,
        event_type: eventType,
        event_title: `Voice drop status: ${newStatus}`,
        provider: "leadsrain", provider_record_id: drop.id,
        metadata: { drop_id: drop.id, raw_status: rawStatus },
      });
    }

    return json({ ok: true, drop_id: drop.id, status: newStatus, raw_status: rawStatus, matched: !!match });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
