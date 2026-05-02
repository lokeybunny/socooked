// Drop.co VMDrop edge function
// Creates default campaign on first use, then sends ringless voicemails
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DROP_API_BASE = "https://api.drop.co/api";
const DEFAULT_AUDIO_URL = "https://warren.guru/audio/voicemail-warren.wav";
const DEFAULT_TRANSFER_NUMBER = "4244651253";
const DEFAULT_CAMPAIGN_NAME = "Warren Default VM";

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(-10);
}

async function dropApi(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${DROP_API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "POST" });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const DROP_API_KEY = Deno.env.get("DROP_API_KEY");
    if (!DROP_API_KEY) throw new Error("DROP_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action = "send", phone, customer_id, audio_url } = body;

    // ------------- Ensure default campaign exists -------------
    let { data: campaign } = await supabase
      .from("drop_campaigns")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();

    if (!campaign) {
      const audioForCampaign = audio_url || DEFAULT_AUDIO_URL;
      const created = await dropApi("VMDropCreate", {
        ApiKey: DROP_API_KEY,
        VMDropName: `${DEFAULT_CAMPAIGN_NAME} ${Date.now()}`,
        VMDropFileUrl: audioForCampaign,
        EnableMissedCall: "true",
        CallbackForwardingType: "1",
        TransferNumber: DEFAULT_TRANSFER_NUMBER,
      });

      if (!created.ok || !created.json?.CampaignToken) {
        return new Response(JSON.stringify({
          success: false,
          error: "Failed to create Drop.co campaign",
          drop_response: created.json,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const insert = await supabase.from("drop_campaigns").insert({
        campaign_token: created.json.CampaignToken,
        campaign_id: created.json.CampaignId,
        name: created.json.CampaignName,
        audio_url: audioForCampaign,
        transfer_number: DEFAULT_TRANSFER_NUMBER,
        callback_type: 1,
        is_default: true,
        meta: created.json,
      }).select().single();
      campaign = insert.data;
    }

    if (action === "create_campaign") {
      return new Response(JSON.stringify({ success: true, campaign }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ------------- Send the VM drop -------------
    if (!phone) throw new Error("phone is required");
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) throw new Error(`Invalid phone: ${phone}`);

    const params: Record<string, string> = {
      ApiKey: DROP_API_KEY,
      CampaignToken: campaign.campaign_token,
      PhoneTo: normalized,
      AllowDuplicates: "true",
      Source: "phone-app",
    };
    if (audio_url) params.Audio = audio_url;

    const result = await dropApi("Delivery", params);

    await supabase.from("drop_vm_logs").insert({
      campaign_token: campaign.campaign_token,
      phone: normalized,
      customer_id: customer_id || null,
      activity_token: result.json?.ActivityToken || null,
      status: result.ok && result.json?.ApiStatusCode === 1000 ? "queued" : "failed",
      api_status_code: result.json?.ApiStatusCode || null,
      api_status_message: result.json?.ApiStatusMessage || null,
      response: result.json,
    });

    return new Response(JSON.stringify({
      success: result.ok && result.json?.ApiStatusCode === 1000,
      drop_response: result.json,
      campaign_token: campaign.campaign_token,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("drop-vm error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
