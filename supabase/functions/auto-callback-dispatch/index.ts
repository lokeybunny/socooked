// Auto-callback dispatcher.
// Cron-triggered (every minute). Finds due `auto_callback_queue` rows and
// initiates outbound Twilio calls with Answering Machine Detection (AMD).
// The TwiML answer URL only plays the drop audio when AnsweredBy=human.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
// Hardcoded caller ID for ALL auto-callback outbound calls.
// Per user policy: outbound auto-callbacks must always show (702) 786-4139.
const TWILIO_FROM = "+17027864139";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function authHeader() {
  return `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { data: setting } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "auto_callback_drop")
      .maybeSingle();
    const cfg = (setting?.value as any) || {};
    if (cfg.enabled === false) {
      return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: due } = await sb
      .from("auto_callback_queue")
      .select("id, phone, attempts")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);

    const results: any[] = [];
    for (const row of due || []) {
      // Claim row first to prevent double-dial
      const { data: claimed } = await sb
        .from("auto_callback_queue")
        .update({ status: "dialing", attempts: (row.attempts || 0) + 1 })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      try {
        const answerUrl = `${SUPABASE_URL}/functions/v1/auto-callback-twiml?qid=${row.id}`;
        const statusUrl = `${SUPABASE_URL}/functions/v1/auto-callback-twiml?qid=${row.id}&status=1`;
        const params = new URLSearchParams({
          To: row.phone,
          From: TWILIO_FROM,
          Url: answerUrl,
          Method: "POST",
          Timeout: "25",
          MachineDetection: "Enable",
          MachineDetectionTimeout: "10",
          AsyncAmd: "false",
          StatusCallback: statusUrl,
          StatusCallbackEvent: "completed",
          StatusCallbackMethod: "POST",
        });

        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader(),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          },
        );
        const data = await resp.json();
        if (!resp.ok) {
          await sb.from("auto_callback_queue")
            .update({ status: "failed", last_error: data?.message || `status_${resp.status}` })
            .eq("id", row.id);
          results.push({ id: row.id, ok: false, error: data?.message });
          continue;
        }
        await sb.from("auto_callback_queue")
          .update({ twilio_call_sid: data.sid, last_error: null })
          .eq("id", row.id);
        results.push({ id: row.id, ok: true, sid: data.sid });
      } catch (e) {
        await sb.from("auto_callback_queue")
          .update({ status: "failed", last_error: (e as Error).message })
          .eq("id", row.id);
        results.push({ id: row.id, ok: false, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, dispatched: results.length, results }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auto-callback-dispatch]", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
