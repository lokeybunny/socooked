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
    if (!auth.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;

    const body = await req.json();
    const {
      campaign_name,
      campaign_cid,
      sound_file_url,
      call_time_id,
      business_line_1,
      twilio_number,
      verizon_forward_number,
      notes,
    } = body || {};
    if (!campaign_name || !campaign_cid) {
      return json({ error: "campaign_name and campaign_cid are required" }, 400);
    }

    let lrCampaignId: string | null = null;
    let lrRaw: any = null;
    if (LR_USER && LR_KEY) {
      try {
        const resp = await fetch(`${LR_BASE}/rvm/api/campaign/add_api`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: LR_USER,
            api_key: LR_KEY,
            campaign_name,
            campaign_cid,
            sound_file_url,
            call_time_id: call_time_id ?? "1",
          }),
          signal: AbortSignal.timeout(30000),
        });
        const txt = await resp.text();
        try { lrRaw = JSON.parse(txt); } catch { lrRaw = { raw: txt }; }
        lrCampaignId = lrRaw?.campaign_id?.toString() ?? null;
      } catch (e: any) {
        lrRaw = { error: e?.message || String(e) };
      }
    }

    const { data: campaign, error: insErr } = await supabase
      .from("voice_drop_campaigns")
      .insert({
        user_id: userId,
        provider: "leadsrain",
        campaign_name,
        leadsrain_campaign_id: lrCampaignId,
        campaign_cid,
        business_line_1,
        twilio_number,
        verizon_forward_number,
        sound_file_url,
        notes,
        status: lrCampaignId ? "active" : "draft",
        active_start_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    await supabase.from("voice_drop_events").insert({
      user_id: userId,
      campaign_id: campaign.id,
      phone_number: campaign_cid,
      event_type: "campaign_created",
      provider: "leadsrain",
      event_source: "leadsrain-create-campaign",
      raw_payload: lrRaw,
    });

    return json({ ok: true, campaign, leadsrain: lrRaw });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
