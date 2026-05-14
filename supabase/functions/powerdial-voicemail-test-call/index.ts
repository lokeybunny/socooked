// Voicemail-drop test call.
//
// Places a real Twilio call to the operator's own phone number that plays the
// chosen voicemail recording (or its TTS fallback) so we can hear exactly what
// a recipient would hear when AMD detects voicemail in production.
//
// POST body:
//   { recording_id: uuid, to_phone: "+1...", use_tts_fallback?: bool }
//
// Behaviour:
//   - Fetches the recording (or active recording if no id given)
//   - Builds inline TwiML that plays the audio with the configured pauses
//     (or <Say>s the TTS fallback when use_tts_fallback=true)
//   - Issues Twilio REST POST /Calls.json with Twiml=<...>
//   - Logs into communications + updates voicemail_recordings.last_test_*

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
// Pinned verified caller ID — VMD test calls must come from the same
// verified outbound number as the live PowerDial dialer.
const VERIFIED_CALLER_ID = "+17028298105";
const TWILIO_FROM_NUMBER = VERIFIED_CALLER_ID;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResp({ ok: false, error: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResp({ ok: false, error: "auth required" }, 401);
  const { data: userData } = await sb.auth.getUser(jwt);
  if (!userData?.user) return jsonResp({ ok: false, error: "invalid token" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ ok: false, error: "invalid JSON" }, 400);
  }

  const recordingId = body?.recording_id ? String(body.recording_id) : null;
  const toPhone = normalizePhone(String(body?.to_phone || ""));
  const useTts = Boolean(body?.use_tts_fallback);

  if (!toPhone) return jsonResp({ ok: false, error: "to_phone required" }, 400);
  if (!TWILIO_FROM_NUMBER) return jsonResp({ ok: false, error: "TWILIO_FROM_NUMBER not configured" }, 500);

  // Find the recording
  const { data: rec } = recordingId
    ? await sb.from("voicemail_recordings").select("*").eq("id", recordingId).maybeSingle()
    : await sb.from("voicemail_recordings").select("*").eq("is_active", true).maybeSingle();

  if (!rec && !useTts) return jsonResp({ ok: false, error: "no recording found" }, 404);

  const pauseBefore = Math.max(0, Math.min(10, Number(rec?.pause_before_sec ?? 2)));
  const pauseAfter = Math.max(0, Math.min(10, Number(rec?.pause_after_sec ?? 1)));

  let twiml: string;
  if (useTts || !rec) {
    const text = String(rec?.tts_fallback_text || body?.tts_fallback_text || "Hello, this is a test voicemail drop.");
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="${pauseBefore}"/><Say voice="Polly.Joanna" language="en-US">${escapeXml(text)}</Say><Pause length="${pauseAfter}"/><Hangup/></Response>`;
  } else {
    const playUrl = `${SUPABASE_URL}/functions/v1/powerdial-voicemail-audio?id=${rec.id}`;
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="${pauseBefore}"/><Play>${escapeXml(playUrl)}</Play><Pause length="${pauseAfter}"/><Hangup/></Response>`;
  }

  // Place the call via Twilio REST
  const twResp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: toPhone,
        From: TWILIO_FROM_NUMBER,
        Twiml: twiml,
      }).toString(),
    },
  );
  const twJson = await twResp.json().catch(() => ({}));
  if (!twResp.ok) {
    return jsonResp({
      ok: false,
      error: `Twilio ${twResp.status}: ${twJson?.message || JSON.stringify(twJson)}`,
      details: twJson,
    }, 500);
  }

  const callSid = twJson?.sid || null;

  // Log into communications + update recording
  await sb.from("communications").insert({
    type: "call",
    direction: "outbound",
    body: useTts ? `[TTS test] ${rec?.tts_fallback_text || ""}` : `[Voicemail test] ${rec?.name || "active"}`,
    from_address: TWILIO_FROM_NUMBER,
    to_address: toPhone,
    phone_number: toPhone,
    provider: "twilio",
    external_id: callSid,
    status: "initiated",
    metadata: {
      source: "voicemail-drop-test",
      recording_id: rec?.id || null,
      use_tts_fallback: useTts,
    },
  });

  if (rec) {
    await sb.from("voicemail_recordings").update({
      last_test_call_sid: callSid,
      last_test_played_at: new Date().toISOString(),
    }).eq("id", rec.id);
  }

  return jsonResp({
    ok: true,
    call_sid: callSid,
    to: toPhone,
    used_tts: useTts || !rec,
    twiml,
  });
});
