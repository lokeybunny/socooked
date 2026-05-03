import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LR_USER = Deno.env.get("LEADSRAIN_USERNAME") || "";
const LR_KEY = Deno.env.get("LEADSRAIN_API_KEY") || "";
const LR_BASE = Deno.env.get("LEADSRAIN_BASE_URL") || "http://s2.leadsrain.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: claims } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);

    const { campaign_id } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    const { data: c } = await supabase.from("voice_drop_campaigns").select("*").eq("id", campaign_id).single();
    if (!c) return json({ error: "Not found" }, 404);

    let lrData: any = null;
    if (c.leadsrain_campaign_id && LR_USER && LR_KEY) {
      try {
        const r = await fetch(`${LR_BASE}/rvm/api/campaign/view_api`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: LR_USER, api_key: LR_KEY, campaign_id: c.leadsrain_campaign_id }),
          signal: AbortSignal.timeout(20000),
        });
        lrData = await r.json().catch(() => null);
      } catch (_) { /* ignore */ }
    }

    // Recompute counts from local events/leads (authoritative for callbacks/sms)
    const [{ count: leadsCount }, { count: callbacks }, { count: missed }, { count: answered }, { count: smsSent }, { count: drops }] = await Promise.all([
      supabase.from("voice_drop_leads").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id),
      supabase.from("voice_drop_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id).eq("event_type", "callback_received"),
      supabase.from("voice_drop_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id).eq("event_type", "missed_call"),
      supabase.from("voice_drop_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id).eq("event_type", "answered_call"),
      supabase.from("voice_drop_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id).eq("event_type", "sms_auto_reply_sent"),
      supabase.from("voice_drop_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id).eq("event_type", "drop_sent"),
    ]);

    const dropsSent = drops ?? 0;
    const cb = callbacks ?? 0;
    const conv = dropsSent > 0 ? cb / dropsSent : 0;

    const { data: updated } = await supabase.from("voice_drop_campaigns").update({
      total_leads: leadsCount ?? 0,
      drops_sent: dropsSent,
      estimated_delivered: Math.floor(dropsSent * 0.85),
      callbacks_count: cb,
      missed_calls_count: missed ?? 0,
      answered_calls_count: answered ?? 0,
      sms_replies_sent_count: smsSent ?? 0,
      conversion_rate: Number(conv.toFixed(4)),
      last_synced_at: new Date().toISOString(),
    }).eq("id", campaign_id).select().single();

    return json({ ok: true, campaign: updated, leadsrain: lrData });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
