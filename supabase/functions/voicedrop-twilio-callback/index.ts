import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VOIDFIX_API_KEY = Deno.env.get("VOIDFIX_API_KEY") || "";
const VOIDFIX_DEVICE_ID = Deno.env.get("VOIDFIX_DEVICE_ID") || "";
const DEFAULT_SMS = "Currently in a meeting, talk with you soon. In the meanwhile, check my work out on IG: https://instagram.com/w4rr3nGURU";

// Twilio status callback / call webhook entrypoint.
// Called by Twilio when an inbound call (forwarded from Business Line 1) completes.
// Body params (form-encoded): From, To, CallStatus, CallDuration, CallSid, etc.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const ct = req.headers.get("content-type") || "";
    let payload: Record<string, any> = {};
    if (ct.includes("application/json")) {
      payload = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((v, k) => payload[k] = v.toString());
    }

    const fromRaw = String(payload.From || payload.from || "");
    const phone = fromRaw.replace(/\D/g, "").slice(-10);
    const status = String(payload.CallStatus || payload.status || "").toLowerCase();
    const duration = Number(payload.CallDuration || 0);
    const isAnswered = ["completed", "in-progress", "answered"].includes(status) && duration > 0;
    const isMissed = ["no-answer", "busy", "failed", "canceled"].includes(status) || (status === "completed" && duration === 0);

    if (!phone) return json({ ok: false, error: "missing From phone" }, 400);

    // Find active LR campaign for attribution
    const nowIso = new Date().toISOString();
    const { data: leadHit } = await supabase
      .from("voice_drop_leads")
      .select("id, campaign_id, user_id")
      .eq("phone_number", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let campaignId: string | null = leadHit?.campaign_id || null;
    let userId: string | null = leadHit?.user_id || null;

    if (!campaignId) {
      const { data: c } = await supabase
        .from("voice_drop_campaigns")
        .select("id, user_id, attribution_window_hours, active_start_at, active_end_at")
        .eq("provider", "leadsrain")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      campaignId = c?.id || null;
      userId = c?.user_id || null;
    }

    // Log generic callback_received
    await supabase.from("voice_drop_events").insert({
      user_id: userId, campaign_id: campaignId, phone_number: phone,
      event_type: "callback_received", provider: "leadsrain",
      event_source: "twilio_forwarded", raw_payload: payload,
    });
    await supabase.from("voice_drop_events").insert({
      user_id: userId, campaign_id: campaignId, phone_number: phone,
      event_type: isMissed ? "missed_call" : "answered_call",
      provider: "leadsrain", event_source: "twilio_forwarded",
      raw_payload: { status, duration, CallSid: payload.CallSid },
    });

    if (campaignId) {
      const field = isMissed ? "missed_calls_count" : "answered_calls_count";
      const { data: cur } = await supabase.from("voice_drop_campaigns").select(`callbacks_count, ${field}`).eq("id", campaignId).single();
      await supabase.from("voice_drop_campaigns").update({
        callbacks_count: (cur?.callbacks_count ?? 0) + 1,
        [field]: ((cur as any)?.[field] ?? 0) + 1,
      }).eq("id", campaignId);
    }

    // VoidFix dedupe + send
    let smsSent = false;
    let smsError: string | null = null;
    const callSid = String(payload.CallSid || payload.callSid || "");
    if (isMissed) {
      // 1) Dedupe by CallSid — each call should trigger AT MOST one auto-reply, ever.
      let dupe: any = null;
      if (callSid) {
        const { data: sidDupe } = await supabase
          .from("voice_drop_events").select("id")
          .eq("event_type", "sms_auto_reply_sent")
          .contains("raw_payload", { CallSid: callSid })
          .limit(1).maybeSingle();
        if (sidDupe) dupe = sidDupe;
      }
      // 2) Backup dedupe by phone within last 60 minutes (was 10) to stop retry storms.
      if (!dupe) {
        const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: phoneDupe } = await supabase
          .from("voice_drop_events").select("id")
          .eq("phone_number", phone).eq("event_type", "sms_auto_reply_sent")
          .gte("created_at", sixtyMinAgo).limit(1).maybeSingle();
        if (phoneDupe) dupe = phoneDupe;
      }

      // Resolve user setting
      let messageBody = DEFAULT_SMS;
      let voidfixEnabled = true;
      if (userId) {
        const { data: s } = await supabase.from("voice_drop_settings").select("default_missed_call_sms, voidfix_enabled").eq("user_id", userId).maybeSingle();
        if (s?.default_missed_call_sms) messageBody = s.default_missed_call_sms;
        if (s && typeof s.voidfix_enabled === "boolean") voidfixEnabled = s.voidfix_enabled;
      }

      if (!dupe && voidfixEnabled && VOIDFIX_API_KEY) {
        // Insert sentinel BEFORE sending so concurrent/retry webhooks see it and bail.
        await supabase.from("voice_drop_events").insert({
          user_id: userId, campaign_id: campaignId, phone_number: phone,
          event_type: "sms_auto_reply_sent", provider: "voidfix",
          event_source: "voicedrop-twilio-callback",
          raw_payload: { sent: false, pending: true, CallSid: callSid, message: messageBody },
        });

        try {
          const r = await fetch("https://voidfix.com/api/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VOIDFIX_API_KEY}` },
            body: JSON.stringify({ device_id: VOIDFIX_DEVICE_ID, phone: `+1${phone}`, message: messageBody }),
            signal: AbortSignal.timeout(15000),
          });
          smsSent = r.ok;
          if (!r.ok) smsError = `HTTP ${r.status}`;
        } catch (e: any) {
          smsError = e?.message || String(e);
        }

        if (campaignId && smsSent) {
          const { data: cur } = await supabase.from("voice_drop_campaigns").select("sms_replies_sent_count").eq("id", campaignId).single();
          await supabase.from("voice_drop_campaigns").update({ sms_replies_sent_count: (cur?.sms_replies_sent_count ?? 0) + 1 }).eq("id", campaignId);
        }
      }
    }

    return json({ ok: true, campaign_id: campaignId, missed: isMissed, sms_sent: smsSent, sms_error: smsError });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
