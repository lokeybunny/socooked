// TwiML answer + status webhook for auto-callback drops.
// Twilio calls this when the recipient picks up. Reads AnsweredBy:
//   - human / unknown  → play the drop MP3, then hang up
//   - machine_*        → hang up immediately (we do NOT leave voicemails on machines here)
// Also handles the StatusCallback (?status=1) to record completion state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Use the powerdial-voicemail-audio host (serves WAV / pcm_mulaw / 8000Hz / mono
// with proper audio/wav Content-Type). The raw MP3 in storage is served as
// application/octet-stream which causes Twilio to play STATIC.
const DEFAULT_AUDIO =
  "https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/powerdial-voicemail-audio?file=auto-callback-drop";

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const qid = url.searchParams.get("qid");
  const isStatus = url.searchParams.get("status") === "1";

  let form: FormData | null = null;
  try { form = await req.formData(); } catch { /* GET / no-body */ }

  const answeredBy = String(form?.get("AnsweredBy") || "").toLowerCase();
  const callStatus = String(form?.get("CallStatus") || "").toLowerCase();
  const callSid = String(form?.get("CallSid") || "");

  // ── Status callback path: just record final outcome ──
  if (isStatus) {
    if (qid) {
      const finalStatus =
        callStatus === "completed" ? "delivered" :
        callStatus === "no-answer" || callStatus === "busy" || callStatus === "canceled" ? "no_answer" :
        callStatus === "failed" ? "failed" :
        "completed";
      await sb.from("auto_callback_queue")
        .update({
          status: finalStatus,
          delivered_at: callStatus === "completed" ? new Date().toISOString() : null,
          twilio_call_sid: callSid || undefined,
        })
        .eq("id", qid);
    }
    return new Response("ok", { headers: CORS });
  }

  // ── Answer URL: decide play vs hangup based on AMD ──
  let audioUrl = DEFAULT_AUDIO;
  try {
    const { data: setting } = await sb
      .from("app_settings").select("value").eq("key", "auto_callback_drop").maybeSingle();
    const cfg = (setting?.value as any) || {};
    if (typeof cfg.audio_url === "string" && cfg.audio_url) audioUrl = cfg.audio_url;
  } catch { /* fall back to default */ }

  // Treat human + unknown as "play". Machine variants → hang up.
  const isHuman = !answeredBy || answeredBy === "human" || answeredBy === "unknown";

  if (qid) {
    await sb.from("auto_callback_queue")
      .update({ answered_by: answeredBy || "unknown" })
      .eq("id", qid);
  }

  if (!isHuman) {
    if (qid) {
      await sb.from("auto_callback_queue")
        .update({ status: "skipped_machine" })
        .eq("id", qid);
    }
    return xml("<Hangup/>");
  }

  return xml(`<Play>${audioUrl}</Play><Hangup/>`);
});
