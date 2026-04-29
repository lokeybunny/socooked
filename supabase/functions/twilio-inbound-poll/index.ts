// Polls Twilio REST API for inbound messages to +17028298105 and writes them
// into `twilio_inbound_logs` so the SMS page TWILIO INBOUND panel shows them
// in (near) realtime — even if the webhook URL on the Twilio number is broken
// or pointing somewhere else.
//
// Public endpoint (no JWT): scheduled by cron every 30s and also callable from
// the SMS panel's manual "Sync now" button.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;

const TWILIO_LANDLINE = "+17028298105";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function alreadyLogged(sid: string): Promise<boolean> {
  const { data } = await sb
    .from("twilio_inbound_logs")
    .select("id")
    .eq("message_sid", sid)
    .eq("event", "twilio-poll:received")
    .limit(1);
  return !!(data && data[0]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "Twilio creds not configured" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  try {
    // Pull last 50 inbound messages directly from Twilio REST API
    const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`);
    url.searchParams.set("To", TWILIO_LANDLINE);
    url.searchParams.set("PageSize", "50");

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ ok: false, error: `Twilio API ${resp.status}: ${text.slice(0, 300)}` }), {
        status: resp.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const messages = (data.messages || []) as Array<{
      sid: string;
      from: string;
      to: string;
      body: string;
      direction: string;
      status: string;
      date_sent: string | null;
      date_created: string;
      num_segments: string;
      num_media: string;
      error_code: number | null;
      error_message: string | null;
    }>;

    let newCount = 0;
    let skipped = 0;

    for (const m of messages) {
      // Only process inbound to our landline
      if (!m.direction || !m.direction.startsWith("inbound")) {
        skipped++;
        continue;
      }
      if (await alreadyLogged(m.sid)) {
        skipped++;
        continue;
      }

      // Log into our realtime stream
      await sb.from("twilio_inbound_logs").insert({
        event: "twilio-poll:received",
        level: "info",
        from_number: m.from,
        to_number: m.to,
        message_sid: m.sid,
        body: m.body,
        elapsed_ms: null,
        metadata: {
          source: "twilio-rest-poll",
          status: m.status,
          direction: m.direction,
          date_sent: m.date_sent,
          date_created: m.date_created,
          num_segments: m.num_segments,
          num_media: m.num_media,
          error_code: m.error_code,
          error_message: m.error_message,
        },
      });

      // Also mirror into communications if not present
      const { data: existing } = await sb
        .from("communications")
        .select("id")
        .eq("external_id", m.sid)
        .limit(1);
      if (!existing || existing.length === 0) {
        await sb.from("communications").insert({
          type: "sms",
          direction: "inbound",
          body: m.body,
          from_address: m.from,
          to_address: m.to,
          phone_number: m.from,
          provider: "twilio",
          external_id: m.sid,
          status: "received",
          metadata: {
            source: "twilio-rest-poll",
            landline_reply: m.to === TWILIO_LANDLINE,
            twilio_number: m.to,
          },
        });
      }

      newCount++;
    }

    const elapsed = Date.now() - startedAt;
    await sb.from("twilio_inbound_logs").insert({
      event: "twilio-poll:summary",
      level: "info",
      elapsed_ms: elapsed,
      metadata: { fetched: messages.length, new: newCount, skipped },
    });

    return new Response(JSON.stringify({ ok: true, fetched: messages.length, new: newCount, skipped, elapsed_ms: elapsed }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
