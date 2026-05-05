import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LR_USER = Deno.env.get("LEADSRAIN_USERNAME") || "";
const LR_KEY = Deno.env.get("LEADSRAIN_API_KEY") || "";
const LR_BASE = Deno.env.get("LEADSRAIN_BASE_URL") || "http://s2.leadsrain.com";
const LR_API = "https://api.leadsrain.com";

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
    const userId = claims.claims.sub;

    const { campaign_id, leads } = await req.json();
    if (!campaign_id || !Array.isArray(leads)) return json({ error: "campaign_id and leads[] required" }, 400);

    const { data: campaign, error: cErr } = await supabase
      .from("voice_drop_campaigns").select("*").eq("id", campaign_id).single();
    if (cErr || !campaign) return json({ error: "Campaign not found" }, 404);

    let listId = campaign.leadsrain_list_id;
    if (!listId && LR_USER && LR_KEY) {
      try {
        const r = await fetch(`${LR_BASE}/rvm/api/leadlist/add_api`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: LR_USER, api_key: LR_KEY,
            list_name: `${campaign.campaign_name} List`,
            campaign_id: campaign.leadsrain_campaign_id,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const j = await r.json().catch(() => ({}));
        listId = j?.list_id?.toString() ?? null;
        if (listId) {
          await supabase.from("voice_drop_campaigns")
            .update({ leadsrain_list_id: listId }).eq("id", campaign_id);
        }
      } catch (_) { /* ignore */ }
    }

    const results: any[] = [];
    for (const lead of leads) {
      const phone = String(lead.phone_number || "").replace(/\D/g, "").slice(-10);
      if (phone.length !== 10) {
        results.push({ phone: lead.phone_number, ok: false, error: "Invalid phone" });
        continue;
      }
      let lrResp: any = null;
      let status = "pending";
      let err: string | null = null;
      if (listId && LR_USER && LR_KEY) {
        try {
          const r = await fetch(`${LR_API}/ringless/api/add_posted_lead.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: LR_USER, api_key: LR_KEY,
              list_id: listId, phone_number: phone,
              first_name: lead.first_name, last_name: lead.last_name, email: lead.email,
              scrub_lead: "no_scrub",
              check_duplicate: "NO_DUPLICATE_CHECK",
              country_code: "USA", phone_code: "1",
            }),
            signal: AbortSignal.timeout(20000),
          });
          const txt = await r.text();
          try { lrResp = JSON.parse(txt); } catch { lrResp = { raw: txt }; }
          status = lrResp?.lead_id ? "uploaded" : "failed";
          if (status === "failed") err = lrResp?.msg || lrResp?.message || `HTTP ${r.status}`;
        } catch (e: any) {
          status = "failed"; err = e?.message || String(e);
        }
      } else {
        status = "queued_local";
      }

      const { data: leadRow } = await supabase.from("voice_drop_leads").insert({
        user_id: userId,
        campaign_id,
        phone_number: phone,
        first_name: lead.first_name, last_name: lead.last_name,
        email: lead.email, address: lead.address, city: lead.city,
        state: lead.state, zip: lead.zip, notes: lead.notes,
        leadsrain_upload_status: status,
        leadsrain_response: lrResp,
        error_message: err,
      }).select().single();

      await supabase.from("voice_drop_events").insert({
        user_id: userId, campaign_id, lead_id: leadRow?.id, phone_number: phone,
        event_type: status === "uploaded" ? "lead_uploaded" : "drop_sent",
        provider: "leadsrain", event_source: "bulk-upload", raw_payload: lrResp,
      });
      results.push({ phone, ok: status === "uploaded" || status === "queued_local", status, error: err });
    }

    // Update counts
    const uploaded = results.filter(r => r.ok).length;
    await supabase.rpc("noop").catch(() => {});
    const { data: agg } = await supabase
      .from("voice_drop_leads").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id);
    await supabase.from("voice_drop_campaigns").update({
      total_leads: (agg as any)?.count ?? campaign.total_leads + uploaded,
      drops_sent: campaign.drops_sent + uploaded,
      estimated_delivered: Math.floor((campaign.drops_sent + uploaded) * 0.85),
      last_synced_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return json({ ok: true, results, list_id: listId });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
