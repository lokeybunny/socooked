// Drop.co VMDrop edge function
// Uses a Drop.co UI-created campaign token, sends ringless voicemails, exposes stats/logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DROP_API_BASE = "https://customerapi.drop.co";
const DEFAULT_AUDIO_URL = "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/content-uploads/audio/voicemail-warren.mp3";
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
    const {
      action = "send",
      phone, customer_id, lead_id, audio_url, transfer_number,
      campaign_token, campaign_id, name,
      default_caller_id, webhook_url, delivery_tracking_enabled,
    } = body;

    console.log("[drop-vm] action:", action, "phone:", phone ? "***" + String(phone).slice(-4) : "none");

    // ------------- Load saved Drop.co campaign -------------
    let { data: campaign } = await supabase
      .from("drop_campaigns")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();

    // ------------- Action: save_campaign -------------
    if (action === "save_campaign") {
      const token = String(campaign_token || "").trim();
      if (!token) throw new Error("Missing Drop.co Campaign Token");
      await supabase.from("drop_campaigns").update({ is_default: false }).eq("is_default", true);
      const saved = await supabase.from("drop_campaigns").upsert({
        campaign_token: token,
        campaign_id: campaign_id ? Number(campaign_id) : null,
        name: name || DEFAULT_CAMPAIGN_NAME,
        audio_url: audio_url || DEFAULT_AUDIO_URL,
        transfer_number: transfer_number || DEFAULT_TRANSFER_NUMBER,
        default_caller_id: default_caller_id || transfer_number || DEFAULT_TRANSFER_NUMBER,
        webhook_url: webhook_url || null,
        delivery_tracking_enabled: delivery_tracking_enabled !== false,
        callback_type: 1,
        is_default: true,
        meta: { source: "drop-ui" },
        updated_at: new Date().toISOString(),
      }, { onConflict: "campaign_token" }).select().single();
      console.log("[drop-vm] save_campaign saved id:", saved.data?.id);
      return new Response(JSON.stringify({ success: true, campaign: saved.data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ------------- Action: update_settings -------------
    if (action === "update_settings") {
      if (!campaign) throw new Error("No campaign saved yet");
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (default_caller_id !== undefined) patch.default_caller_id = default_caller_id || null;
      if (webhook_url !== undefined) patch.webhook_url = webhook_url || null;
      if (delivery_tracking_enabled !== undefined) patch.delivery_tracking_enabled = !!delivery_tracking_enabled;
      if (transfer_number !== undefined) patch.transfer_number = transfer_number || DEFAULT_TRANSFER_NUMBER;
      const upd = await supabase.from("drop_campaigns").update(patch).eq("id", campaign.id).select().single();
      return new Response(JSON.stringify({ success: true, campaign: upd.data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }


    // ------------- Action: disconnect_campaign -------------
    if (action === "disconnect_campaign") {
      if (campaign) {
        await supabase.from("drop_campaigns").delete().eq("id", campaign.id);
      }
      return new Response(JSON.stringify({ success: true, campaign: null, needs_setup: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ------------- Action: test_connection -------------
    if (action === "test_connection") {
      if (!campaign) {
        return new Response(JSON.stringify({
          success: false,
          error: "No campaign saved. Paste a CampaignToken first.",
          needs_setup: true,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const result = await dropApi("VMDropStatus", {
        ApiKey: DROP_API_KEY,
        CampaignToken: campaign.campaign_token,
      });
      const j = result.json || {};
      const valid = result.ok && j.ApiStatusCode === 1000;
      return new Response(JSON.stringify({
        success: valid,
        valid,
        http_status: result.status,
        api_status_code: j.ApiStatusCode ?? null,
        api_status_message: j.ApiStatusMessage || null,
        campaign_name: j.CampaignName || campaign.name,
        campaign_id: j.CampaignId ?? campaign.campaign_id ?? null,
        vm_drop_duration: j.VMDropDuration ?? null,
        vm_drop_file: j.VMDropFile ?? null,
        enable_missed_call: j.EnableMissedCall ?? null,
        allowable_campaign_count: j.AllowableCampaignCount ?? null,
        raw: j,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ------------- Action: get_campaign -------------
    if (action === "get_campaign" || action === "create_campaign") {
      return new Response(JSON.stringify({ success: true, campaign, needs_setup: !campaign }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ------------- Action: stats -------------
    if (action === "stats") {
      const { count: totalCount } = await supabase
        .from("drop_vm_logs")
        .select("*", { count: "exact", head: true });
      const { count: queuedCount } = await supabase
        .from("drop_vm_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "queued");
      const { count: failedCount } = await supabase
        .from("drop_vm_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed");
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: last24Count } = await supabase
        .from("drop_vm_logs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since);

      return new Response(JSON.stringify({
        success: true,
        stats: {
          total: totalCount || 0,
          queued: queuedCount || 0,
          failed: failedCount || 0,
          last_24h: last24Count || 0,
        },
        campaign,
        needs_setup: !campaign,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ------------- Action: list_logs -------------
    if (action === "list_logs") {
      const limit = Math.min(Number(body.limit) || 25, 100);
      const { data: logs } = await supabase
        .from("drop_vm_logs")
        .select("id, phone, status, api_status_message, created_at, customer_id, activity_token")
        .order("created_at", { ascending: false })
        .limit(limit);
      return new Response(JSON.stringify({ success: true, logs: logs || [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ------------- Action: update_audio -------------
    if (action === "update_audio") {
      if (!campaign) {
        return new Response(JSON.stringify({
          success: false,
          error: "Add a Drop.co campaign token before updating audio.",
          needs_setup: true,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!audio_url) throw new Error("audio_url is required");
      await supabase
        .from("drop_campaigns")
        .update({ audio_url, updated_at: new Date().toISOString() })
        .eq("id", campaign.id);
      campaign.audio_url = audio_url;
      return new Response(JSON.stringify({ success: true, campaign }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ------------- Action: send (default) -------------
    if (!campaign) {
      console.error("[drop-vm] send blocked — no campaign saved");
      return new Response(JSON.stringify({
        success: false,
        error: "Missing Drop.co Campaign Token",
        needs_setup: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!campaign.campaign_token) {
      console.error("[drop-vm] send blocked — campaign row missing token");
      throw new Error("Missing Drop.co Campaign Token");
    }
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
    if (audio_url || campaign.audio_url) params.Audio = audio_url || campaign.audio_url;
    if (campaign.default_caller_id) params.CallerId = campaign.default_caller_id;

    console.log("[drop-vm] → Drop.co Delivery", { phone: "***" + normalized.slice(-4), token: campaign.campaign_token.slice(0, 6) + "…" });
    const result = await dropApi("Delivery", params);
    console.log("[drop-vm] ← Drop.co", result.status, result.json?.ApiStatusCode, result.json?.ApiStatusMessage);

    const delivered = result.ok && result.json?.ApiStatusCode === 1000;
    const status = delivered ? "queued" : "failed";

    await supabase.from("drop_vm_logs").insert({
      campaign_token: campaign.campaign_token,
      phone: normalized,
      customer_id: customer_id || null,
      activity_token: result.json?.ActivityToken || null,
      status,
      api_status_code: result.json?.ApiStatusCode || null,
      api_status_message: result.json?.ApiStatusMessage || null,
      response: result.json,
    });

    // ------------- VoidFix SMS handoff on delivery -------------
    let voidfix_result: any = null;
    if (delivered && campaign.delivery_tracking_enabled !== false) {
      try {
        console.log("[drop-vm] → VoidFix SMS handoff");
        const sms = await supabase.functions.invoke("powerdial-sms", {
          body: {
            action: "send",
            to: normalized,
            body: "Hey this is Warren — just left you a quick voicemail.",
            customer_id: customer_id || null,
            source: "vmdrp-auto-followup",
          },
        });
        voidfix_result = sms.data || { error: sms.error?.message };
        console.log("[drop-vm] ← VoidFix", voidfix_result?.ok, voidfix_result?.error || "ok");
      } catch (e: any) {
        console.error("[drop-vm] VoidFix handoff failed:", e.message);
        voidfix_result = { ok: false, error: e.message };
      }
    }

    return new Response(JSON.stringify({
      success: delivered,
      status,
      drop_response: result.json,
      campaign_token: campaign.campaign_token,
      voidfix: voidfix_result,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("drop-vm error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
