// Drop.co delivery-status webhook receiver
// Configure this URL inside Drop.co (when supported) to push delivered/failed/etc events.
// Endpoint: https://<project>.supabase.co/functions/v1/dropco-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d.slice(-10);
}

function normalizeStatus(s: string): string {
  const k = (s || "").toLowerCase().trim();
  if (["delivered", "delivery", "success", "completed"].includes(k)) return "delivered";
  if (["failed", "fail", "error"].includes(k)) return "failed";
  if (["pending", "queued", "processing"].includes(k)) return "pending";
  if (["mailbox_full", "mailboxfull", "vm_full"].includes(k)) return "mailbox_full";
  if (["answered", "live_answer", "human"].includes(k)) return "answered";
  return k || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    console.log("[dropco-webhook] payload:", JSON.stringify(payload));

    const phone = normalizePhone(
      payload.PhoneTo || payload.Phone || payload.phone || payload.to || ""
    );
    const status = normalizeStatus(
      payload.Status || payload.status || payload.DeliveryStatus || payload.event || ""
    );
    const campaign_token = payload.CampaignToken || payload.campaign_token || null;
    const campaign_id = payload.CampaignId?.toString?.() || payload.campaign_id?.toString?.() || null;
    const activity_token = payload.ActivityToken || payload.activity_token || null;

    // Try to map back to a customer/lead by phone (last 10)
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

    const { error: insErr } = await supabase.from("dropco_logs").insert({
      lead_id: payload.lead_id || null,
      customer_id,
      phone: phone || null,
      campaign_id,
      campaign_token,
      status,
      activity_token,
      raw_payload: payload,
    });
    if (insErr) console.error("[dropco-webhook] insert error:", insErr.message);

    // Mirror status onto drop_vm_logs row if we can match by activity_token
    if (activity_token && status !== "unknown") {
      await supabase
        .from("drop_vm_logs")
        .update({ status })
        .eq("activity_token", activity_token);
    }

    // Auto-trigger VoidFix follow-up SMS on delivery (idempotent: only when delivery_tracking_enabled)
    if (status === "delivered" && phone) {
      const { data: campaign } = await supabase
        .from("drop_campaigns")
        .select("delivery_tracking_enabled")
        .eq("is_default", true)
        .maybeSingle();

      if (campaign?.delivery_tracking_enabled !== false) {
        try {
          console.log("[dropco-webhook] → VoidFix SMS handoff for", phone.slice(-4));
          await supabase.functions.invoke("powerdial-sms", {
            body: {
              action: "send",
              to: phone,
              body: "Hey this is Warren — just left you a quick voicemail.",
              customer_id,
              source: "vmdrp-webhook-followup",
            },
          });
        } catch (e: any) {
          console.error("[dropco-webhook] VoidFix invoke failed:", e.message);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, status, phone, customer_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[dropco-webhook] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
