// Drop.co VMDrop edge function
// Creates Drop.co campaigns via API, sends ringless voicemails, tracks status, exposes stats/logs.
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
      name, enable_missed_call, callback_type,
      default_caller_id, webhook_url, delivery_tracking_enabled,
      activity_token, contact_name, workflow_id,
    } = body;

    console.log("[drop-vm] action:", action, "phone:", phone ? "***" + String(phone).slice(-4) : "none");

    // ------------- Load saved Drop.co campaign -------------
    let { data: campaign } = await supabase
      .from("drop_campaigns")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();

    // ------------- Action: create_campaign (calls Drop.co VMDropCreate) -------------
    // NOTE: Many Drop.co accounts have API campaign creation DISABLED — they require
    // campaigns to be created in the Drop.co web UI. We try the API; if it's blocked
    // we surface a clear error so the user falls back to "Connect existing token".
    if (action === "create_campaign") {
      const audio = audio_url || DEFAULT_AUDIO_URL;
      const transfer = transfer_number || DEFAULT_TRANSFER_NUMBER;
      const cname = (name || DEFAULT_CAMPAIGN_NAME).trim();
      const cb = Number(callback_type ?? 1);

      console.log("[drop-vm] → Drop.co VMDropCreate", { name: cname, audio: audio.slice(0, 60) + "…" });
      const create = await dropApi("VMDropCreate", {
        ApiKey: DROP_API_KEY,
        VMDropName: cname,
        VMDropFileUrl: audio,
        EnableMissedCall: String(enable_missed_call !== false),
        CallbackForwardingType: String(cb),
        TransferNumber: normalizePhone(transfer) || transfer,
      });
      const j = create.json || {};
      console.log("[drop-vm] ← VMDropCreate", create.status, j.ApiStatusCode, j.ApiStatusMessage);

      if (!create.ok || j.ApiStatusCode !== 1000 || !j.CampaignToken) {
        const blocked = String(j.ApiStatusMessage || "").toLowerCase().includes("set up in the ui");
        return new Response(JSON.stringify({
          success: false,
          error: blocked
            ? "Drop.co disables API campaign creation for this account. Create the campaign in the Drop.co dashboard, then paste the CampaignToken below."
            : (j.ApiStatusMessage || "Drop.co rejected campaign creation"),
          api_status_code: j.ApiStatusCode ?? null,
          api_blocked: blocked,
          raw: j,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabase.from("drop_campaigns").update({ is_default: false }).eq("is_default", true);
      const saved = await supabase.from("drop_campaigns").upsert({
        campaign_token: j.CampaignToken,
        campaign_id: j.CampaignId ? Number(j.CampaignId) : null,
        name: j.CampaignName || cname,
        audio_url: audio,
        vm_drop_file: j.VMDropFile || null,
        vm_drop_duration: j.VMDropDuration ? Number(j.VMDropDuration) : null,
        enable_missed_call: enable_missed_call !== false,
        transfer_number: transfer,
        default_caller_id: default_caller_id || transfer,
        webhook_url: webhook_url || null,
        delivery_tracking_enabled: delivery_tracking_enabled !== false,
        callback_type: cb,
        is_default: true,
        raw_response: j,
        meta: { source: "drop-api-create" },
        updated_at: new Date().toISOString(),
      }, { onConflict: "campaign_token" }).select().single();

      return new Response(JSON.stringify({ success: true, campaign: saved.data, raw: j }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ------------- Action: validate_token (preview only — no DB write) -------------
    if (action === "validate_token") {
      const token = String(body.campaign_token || "").trim();
      if (!token) throw new Error("campaign_token is required");
      console.log("[drop-vm] → VMDropStatus (preview validate)");
      const check = await dropApi("VMDropStatus", { ApiKey: DROP_API_KEY, CampaignToken: token });
      const cj = check.json || {};
      const valid = check.ok && cj.ApiStatusCode === 1000;
      return new Response(JSON.stringify({
        success: valid,
        valid,
        api_status_code: cj.ApiStatusCode ?? null,
        api_status_message: cj.ApiStatusMessage || null,
        preview: valid ? {
          campaign_token: token,
          campaign_name: cj.CampaignName || null,
          campaign_id: cj.CampaignId ?? null,
          vm_drop_file: cj.VMDropFile || null,
          vm_drop_duration: cj.VMDropDuration ?? null,
          enable_missed_call: cj.EnableMissedCall ?? null,
          callback_forwarding_type: cj.CallbackForwardingType ?? null,
          transfer_number: cj.TransferNumber || null,
          allowable_campaign_count: cj.AllowableCampaignCount ?? null,
          status: cj.Status || cj.CampaignStatus || "active",
        } : null,
        error: valid ? null : (cj.ApiStatusMessage || "Drop.co rejected this CampaignToken"),
        raw: cj,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ------------- Action: connect_token (paste existing CampaignToken from Drop.co UI) -------------
    if (action === "connect_token") {
      const token = String(body.campaign_token || "").trim();
      if (!token) throw new Error("campaign_token is required");

      // Validate against Drop.co by fetching VMDropStatus
      console.log("[drop-vm] → VMDropStatus (validate token)");
      const check = await dropApi("VMDropStatus", { ApiKey: DROP_API_KEY, CampaignToken: token });
      const cj = check.json || {};
      console.log("[drop-vm] ← VMDropStatus", check.status, cj.ApiStatusCode, cj.ApiStatusMessage);

      if (!check.ok || cj.ApiStatusCode !== 1000) {
        return new Response(JSON.stringify({
          success: false,
          error: cj.ApiStatusMessage || "Drop.co rejected this CampaignToken",
          api_status_code: cj.ApiStatusCode ?? null,
          raw: cj,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const transfer = transfer_number || DEFAULT_TRANSFER_NUMBER;
      await supabase.from("drop_campaigns").update({ is_default: false }).eq("is_default", true);
      const saved = await supabase.from("drop_campaigns").upsert({
        campaign_token: token,
        campaign_id: cj.CampaignId ? Number(cj.CampaignId) : null,
        name: cj.CampaignName || (name || DEFAULT_CAMPAIGN_NAME),
        audio_url: cj.VMDropFile || audio_url || DEFAULT_AUDIO_URL,
        vm_drop_file: cj.VMDropFile || null,
        vm_drop_duration: cj.VMDropDuration ? Number(cj.VMDropDuration) : null,
        enable_missed_call: cj.EnableMissedCall ?? true,
        transfer_number: transfer,
        default_caller_id: default_caller_id || transfer,
        webhook_url: webhook_url || null,
        delivery_tracking_enabled: delivery_tracking_enabled !== false,
        callback_type: Number(callback_type ?? 1),
        is_default: true,
        raw_response: cj,
        meta: { source: "drop-token-paste" },
        updated_at: new Date().toISOString(),
      }, { onConflict: "campaign_token" }).select().single();

      return new Response(JSON.stringify({ success: true, campaign: saved.data, raw: cj }), {
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
          error: "No campaign saved. Create a Drop.co campaign first.",
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
        vm_drop_duration: j.VMDropDuration ?? campaign.vm_drop_duration ?? null,
        vm_drop_file: j.VMDropFile ?? campaign.vm_drop_file ?? null,
        enable_missed_call: j.EnableMissedCall ?? campaign.enable_missed_call ?? null,
        allowable_campaign_count: j.AllowableCampaignCount ?? null,
        raw: j,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ------------- Action: refresh_status (per-drop, uses ActivityToken) -------------
    if (action === "refresh_status") {
      const at = String(activity_token || "").trim();
      if (!at) throw new Error("activity_token required");
      const result = await dropApi("VMDropStatus", {
        ApiKey: DROP_API_KEY,
        ActivityToken: at,
      });
      const j = result.json || {};
      // Map Drop.co statuses → our enum
      const remote = String(j.Status || j.ActivityStatus || "").toLowerCase();
      let mapped: string | null = null;
      if (remote.includes("deliver")) mapped = "delivered";
      else if (remote.includes("queue") || remote.includes("pending") || remote.includes("process")) mapped = "queued";
      else if (remote.includes("fail") || remote.includes("error")) mapped = "failed";

      if (mapped) {
        await supabase
          .from("drop_vm_logs")
          .update({
            status: mapped,
            api_status_message: j.ApiStatusMessage || j.Status || null,
            response: j,
          })
          .eq("activity_token", at);
      }
      return new Response(JSON.stringify({
        success: result.ok && j.ApiStatusCode === 1000,
        status: mapped,
        raw: j,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ------------- Action: get_campaign -------------
    if (action === "get_campaign") {
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
        .select("id, phone, status, api_status_message, created_at, customer_id, activity_token, vm_drop_status_url")
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
          error: "Create a Drop.co campaign before updating audio.",
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
        error: "No Drop.co campaign — create one first",
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
    if (lead_id) params.C1 = String(lead_id);
    if (contact_name) params.C2 = String(contact_name);
    if (workflow_id) params.C3 = String(workflow_id);

    console.log("[drop-vm] → Drop.co Delivery", { phone: "***" + normalized.slice(-4), token: campaign.campaign_token.slice(0, 6) + "…" });
    const result = await dropApi("Delivery", params);
    console.log("[drop-vm] ← Drop.co", result.status, result.json?.ApiStatusCode, result.json?.ApiStatusMessage);

    const delivered = result.ok && result.json?.ApiStatusCode === 1000;
    const status = delivered ? "queued" : "failed";

    await supabase.from("drop_vm_logs").insert({
      campaign_token: campaign.campaign_token,
      phone: normalized,
      customer_id: customer_id || null,
      lead_id: lead_id || null,
      activity_token: result.json?.ActivityToken || null,
      vm_drop_status_url: result.json?.VmDropStatusUrl || result.json?.VMDropStatusUrl || null,
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
      activity_token: result.json?.ActivityToken || null,
      vm_drop_status_url: result.json?.VmDropStatusUrl || result.json?.VMDropStatusUrl || null,
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
