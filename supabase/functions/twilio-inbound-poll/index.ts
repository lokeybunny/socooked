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
const DEFAULT_AUTO_REPLY_PREFIX =
  "Hey, just got your message on my line ending in 8105. This is my cell — that's a landline. I'll follow back in a moment.";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type AutoReplyConfig = {
  enabled: boolean;
  prefix: string;
  include_quoted: boolean;
};

async function loadAutoReplyConfig(): Promise<AutoReplyConfig> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "sms_auto_reply").maybeSingle();
  const v = (data?.value || {}) as Partial<AutoReplyConfig>;
  return {
    enabled: v.enabled !== false,
    prefix: typeof v.prefix === "string" && v.prefix.trim() ? v.prefix : DEFAULT_AUTO_REPLY_PREFIX,
    include_quoted: v.include_quoted !== false,
  };
}

function buildAutoReply(inboundBody: string, cfg: AutoReplyConfig): string {
  const trimmed = (inboundBody || "").trim();
  if (!trimmed || !cfg.include_quoted) return cfg.prefix;
  const MAX_QUOTE = 600;
  const quoted = trimmed.length > MAX_QUOTE ? `${trimmed.slice(0, MAX_QUOTE).trim()}…` : trimmed;
  return `${cfg.prefix}\n\nYou wrote:\n"${quoted}"`;
}

async function alreadyLogged(sid: string): Promise<boolean> {
  const { data } = await sb
    .from("twilio_inbound_logs")
    .select("id")
    .eq("message_sid", sid)
    .eq("event", "twilio-poll:received")
    .limit(1);
  return !!(data && data[0]);
}


async function sendVoidfixAutoReply(from: string, sid: string, twilioNumber: string, inboundBody: string, cfg: AutoReplyConfig) {
  // KILL SWITCH (2026-05-14): poll-based auto-reply permanently disabled (spam flag).
  console.log(`[twilio-inbound-poll] auto-reply kill-switch active — skipping SMS to ${from}`);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/auto_reply_kill_log`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        source: "twilio-inbound-poll",
        phone: from,
        reason: "inbound poll auto-reply blocked",
        meta: { sid, twilio_number: twilioNumber },
      }),
    });
  } catch (e) { console.error("[kill-log]", e); }
  return;
  // eslint-disable-next-line no-unreachable
  const replyBody = buildAutoReply(inboundBody, cfg);
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      action: "send",
      to: from,
      body: replyBody,
      source: "twilio-auto-reply-voidfix",
      metadata: {
        source: "twilio-auto-reply-voidfix",
        twilio_number: twilioNumber,
        twilio_sid: sid,
        inbound_body: inboundBody,
        triggered_by: "twilio-inbound-poll",
      },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`powerdial-sms ${resp.status}: ${text.slice(0, 300)}`);
  }
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
    let autoReplied = 0;
    
    let autoReplyFailed = 0;

    const cfg = await loadAutoReplyConfig();

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
            num_media: Number(m.num_media || "0") || 0,
          },
        });

        // Fetch MMS media (out-of-band) so images appear in the SMS thread
        if (Number(m.num_media || "0") > 0) {
          fetch(`${SUPABASE_URL}/functions/v1/twilio-mms-fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ action: "fetch_one", sid: m.sid }),
          }).catch(() => {});
        }
      }

      newCount++;

      // Auto-reply via VoidFix for messages to the 8105 landline (no dedupe)
      if (cfg.enabled && m.to === TWILIO_LANDLINE && m.from) {
        // DND guard: don't auto-reply (or open a hook thread) for opted-out numbers
        const fromLast10 = String(m.from).replace(/\D/g, "").slice(-10);
        const { data: dnd } = await sb
          .from("sms_dnd_list")
          .select("id")
          .eq("phone_last10", fromLast10)
          .limit(1);
        if (dnd && dnd[0]) {
          await sb.from("twilio_inbound_logs").insert({
            event: "poll-auto-reply:skipped-dnd",
            level: "info",
            from_number: m.from,
            to_number: m.to,
            message_sid: m.sid,
            metadata: { reason: "phone_in_dnd_list" },
          });
        } else {
          try {
            await sendVoidfixAutoReply(m.from, m.sid, m.to, m.body, cfg);
            autoReplied++;
            await sb.from("twilio_inbound_logs").insert({
              event: "poll-auto-reply:sent",
              level: "info",
              from_number: m.from,
              to_number: m.to,
              message_sid: m.sid,
              metadata: { triggered_by: "twilio-inbound-poll" },
            });

            // Open a Hook Reply thread so the next inbound from this number
            // gets classified and (if positive/neutral) scheduled for follow-up.
            try {
              const fromNorm = m.from.startsWith("+") ? m.from : `+${String(m.from).replace(/\D/g, "")}`;
              // Look up the outbound communications row for this auto-reply
              const { data: outboundRow } = await sb
                .from("communications")
                .select("id, body, created_at")
                .eq("type", "sms")
                .eq("direction", "outbound")
                .eq("provider", "voidfix")
                .eq("metadata->>twilio_sid", m.sid)
                .order("created_at", { ascending: false })
                .limit(1);

              // Only open a thread if there isn't an active one already for this phone
              const { data: existingThread } = await sb
                .from("hook_reply_threads")
                .select("id")
                .eq("phone_last10", fromLast10)
                .in("status", ["awaiting_reply", "followup_scheduled"])
                .limit(1);

              if (!existingThread || existingThread.length === 0) {
                await sb.from("hook_reply_threads").insert({
                  phone: fromNorm,
                  phone_last10: fromLast10,
                  original_outbound_id: outboundRow?.[0]?.id || null,
                  original_outbound_body: outboundRow?.[0]?.body || cfg.prefix,
                  status: "awaiting_reply",
                  sentiment: "pending",
                  meta: {
                    twilio_inbound_sid: m.sid,
                    twilio_landline: m.to,
                    inbound_body: m.body,
                  },
                });
              }
            } catch (e) {
              console.error("[twilio-inbound-poll] hook thread create error:", e);
            }
          } catch (e) {
            autoReplyFailed++;
            await sb.from("twilio_inbound_logs").insert({
              event: "poll-auto-reply:failed",
              level: "error",
              from_number: m.from,
              to_number: m.to,
              message_sid: m.sid,
              metadata: { error: String((e as any)?.message || e) },
            });
          }
        }
      }
    }

    const elapsed = Date.now() - startedAt;
    await sb.from("twilio_inbound_logs").insert({
      event: "twilio-poll:summary",
      level: "info",
      elapsed_ms: elapsed,
      metadata: {
        fetched: messages.length,
        new: newCount,
        skipped,
        auto_replied: autoReplied,
        auto_reply_failed: autoReplyFailed,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        fetched: messages.length,
        new: newCount,
        skipped,
        auto_replied: autoReplied,
        auto_reply_failed: autoReplyFailed,
        elapsed_ms: elapsed,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
