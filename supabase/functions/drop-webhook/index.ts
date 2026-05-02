// Drop.co delivery-status webhook receiver
// URL configured in Drop.co dashboard:
//   https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/drop-webhook
//
// On every event, we:
//   1. Auto-capture CampaignId↔CampaignToken pairs (so users never have to paste UUIDs)
//   2. Update drop_vm_logs status by ActivityToken
//   3. Trigger VoidFix SMS on confirmed delivery (if enabled)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

function normalizePhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d.slice(-10);
}

function normalizeStatus(s: string): string {
  const k = (s || "").toLowerCase().trim();
  if (["delivered", "delivery", "success", "completed", "sent"].includes(k)) return "delivered";
  if (["failed", "fail", "error", "rejected"].includes(k)) return "failed";
  if (["pending", "queued", "processing", "accepted"].includes(k)) return "queued";
  if (["mailbox_full", "mailboxfull", "vm_full"].includes(k)) return "mailbox_full";
  if (["answered", "live_answer", "human"].includes(k)) return "answered";
  return k || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, endpoint: "drop-webhook", ready: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let payload: any = {};
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      payload = await req.json().catch(() => ({}));
    } else {
      const form = await req.formData().catch(() => null);
      if (form) form.forEach((v, k) => (payload[k] = v));
    }

    console.log("[drop-webhook] payload:", JSON.stringify(payload));

    const phone = normalizePhone(
      payload.PhoneTo || payload.Phone || payload.phone || payload.to || ""
    );
    const status = normalizeStatus(
      payload.Status || payload.status || payload.DeliveryStatus || payload.event || ""
    );
    const campaign_token: string | null =
      payload.CampaignToken || payload.campaign_token || null;
    const campaign_id_raw =
      payload.CampaignId ?? payload.campaign_id ?? null;
    const campaign_id: number | null =
      campaign_id_raw != null && !isNaN(Number(campaign_id_raw)) ? Number(campaign_id_raw) : null;
    const campaign_name: string | null =
      payload.CampaignName || payload.campaign_name || null;
    const activity_token: string | null =
      payload.ActivityToken || payload.activity_token || null;

    // ===== AUTO-CAPTURE: link CampaignId ↔ CampaignToken =====
    // If we have an ID-only saved campaign waiting for its token, fill it in now.
    if (campaign_id != null && campaign_token) {
      const { data: existingById } = await supabase
        .from("drop_campaigns")
        .select("id, campaign_token, name")
        .eq("campaign_id", campaign_id)
        .maybeSingle();

      if (existingById && !existingById.campaign_token) {
        console.log(`[drop-webhook] auto-filling token for campaign ${campaign_id}`);
        await supabase
          .from("drop_campaigns")
          .update({
            campaign_token,
            name: campaign_name || existingById.name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingById.id);
      } else if (!existingById) {
        // First time we see this campaign — auto-add it to the library so the user
        // never has to paste anything. Not default unless it's the first one.
        const { count } = await supabase
          .from("drop_campaigns")
          .select("*", { count: "exact", head: true });
        await supabase.from("drop_campaigns").insert({
          campaign_token,
          campaign_id,
          name: campaign_name || `Campaign ${campaign_id}`,
          audio_url: "https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/content-uploads/audio/voicemail-warren.mp3",
          is_default: (count || 0) === 0,
          meta: { source: "webhook-autocapture", first_seen_at: new Date().toISOString() },
        });
        console.log(`[drop-webhook] auto-added new campaign ${campaign_id}`);
      }
    }

    // ===== Map incoming event to a customer (by phone last-10) =====
    let customer_id: string | null = null;
    if (phone && phone.length === 10) {
      const { data: cust } = await supabase
        .from("customers")
        .select("id")
        .or(`phone.ilike.%${phone},phone.eq.+1${phone}`)
        .limit(1)
        .maybeSingle();
      customer_id = cust?.id || null;
    }

    // ===== Persist a raw event row =====
    await supabase.from("dropco_logs").insert({
      lead_id: payload.lead_id || null,
      customer_id,
      phone: phone || null,
      campaign_id: campaign_id != null ? String(campaign_id) : null,
      campaign_token,
      status,
      activity_token,
      raw_payload: payload,
    });

    // ===== Mirror onto the matching drop_vm_logs row =====
    if (activity_token && status !== "unknown") {
      await supabase
        .from("drop_vm_logs")
        .update({
          status,
          api_status_message: payload.ApiStatusMessage || payload.Status || null,
        })
        .eq("activity_token", activity_token);
    }

    // ===== VoidFix SMS handoff on confirmed delivery =====
    if (status === "delivered" && phone) {
      // Use the campaign matching this event (or default) to check tracking flag
      let tracking = true;
      if (campaign_token) {
        const { data: c } = await supabase
          .from("drop_campaigns")
          .select("delivery_tracking_enabled")
          .eq("campaign_token", campaign_token)
          .maybeSingle();
        if (c) tracking = c.delivery_tracking_enabled !== false;
      } else {
        const { data: c } = await supabase
          .from("drop_campaigns")
          .select("delivery_tracking_enabled")
          .eq("is_default", true)
          .maybeSingle();
        if (c) tracking = c.delivery_tracking_enabled !== false;
      }

      if (tracking) {
        try {
          console.log("[drop-webhook] → VoidFix SMS for", phone.slice(-4));
          await supabase.functions.invoke("powerdial-sms", {
            body: {
              action: "send",
              to: phone,
              body: "Hey this is Warren — just left you a quick voicemail.",
              customer_id,
              source: "drop-webhook-followup",
            },
          });
        } catch (e: any) {
          console.error("[drop-webhook] VoidFix invoke failed:", e.message);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, status, phone, customer_id, campaign_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[drop-webhook] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
