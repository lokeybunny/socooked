// Twilio voicemail handler — two flows:
//   1) GET/POST without ?step=recording → returns TwiML that prompts caller and records voicemail
//   2) POST ?step=recording → Twilio's recordingStatusCallback hits us with the final recording URL/SID
//
// The recording is stored on Twilio (publicly accessible via TwiML basic auth proxy).
// We persist URL/SID/duration on the matching missed_call_events row so the CRM can play it back.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function escapeXml(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw);
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (s.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const step = url.searchParams.get("step") || "";

  try {
    // --- (2) Recording status callback from Twilio ---
    if (step === "recording") {
      const form = await req.formData();
      const recordingSid = String(form.get("RecordingSid") || "");
      const recordingUrl = String(form.get("RecordingUrl") || ""); // mp3 with .mp3 suffix
      const recordingDuration = parseInt(String(form.get("RecordingDuration") || "0"), 10) || 0;
      const callSid = String(form.get("CallSid") || "");
      const from = normalizePhone(String(form.get("From") || ""));
      const last10 = from.replace(/\D/g, "").slice(-10);

      // Find the missed_call_events row for this call. Prefer call_log_id link via call SID,
      // fall back to most recent open event for this phone in last 30 minutes.
      let eventId: string | null = null;
      const { data: viaCallLog } = await sb
        .from("powerdial_call_logs")
        .select("id")
        .eq("twilio_call_sid", callSid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (viaCallLog?.id) {
        const { data: ev } = await sb
          .from("missed_call_events")
          .select("id")
          .eq("call_log_id", viaCallLog.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        eventId = ev?.id || null;
      }

      if (!eventId && last10) {
        const since = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: ev } = await sb
          .from("missed_call_events")
          .select("id")
          .eq("phone_last10", last10)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        eventId = ev?.id || null;
      }

      if (eventId) {
        await sb
          .from("missed_call_events")
          .update({
            voicemail_recording_sid: recordingSid || null,
            voicemail_recording_url: recordingUrl ? `${recordingUrl}.mp3` : null,
            voicemail_duration: recordingDuration,
            voicemail_received_at: new Date().toISOString(),
            status: "voicemail_left",
          })
          .eq("id", eventId);
      }

      // Audit
      await sb.from("missed_call_webhook_audit").insert({
        webhook_name: "twilio-voicemail",
        event_stage: eventId ? "voicemail_recorded" : "voicemail_orphan",
        call_sid: callSid || null,
        phone_number: from || null,
        missed_call_event_id: eventId,
        raw_payload: {
          RecordingSid: recordingSid,
          RecordingUrl: recordingUrl,
          RecordingDuration: String(recordingDuration),
        },
      });

      return new Response("ok", { status: 200, headers: CORS });
    }

    // --- (1) Default: return voicemail TwiML to be played to caller ---
    const recCallback = `${SUPABASE_URL}/functions/v1/twilio-voicemail?step=recording`;
    const greetingUrl = `${SUPABASE_URL}/functions/v1/powerdial-voicemail-audio?file=guru`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(greetingUrl)}</Play>
  <Record
    maxLength="120"
    timeout="5"
    playBeep="true"
    trim="trim-silence"
    recordingStatusCallback="${escapeXml(recCallback)}"
    recordingStatusCallbackMethod="POST"
    recordingStatusCallbackEvent="completed"
  />
  <Hangup/>
</Response>`;

    return new Response(xml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
  } catch (err) {
    console.error("[twilio-voicemail]", err);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new Response(xml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
  }
});
