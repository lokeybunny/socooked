import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, validation-token",
};

// Map RC event types to friendly labels + emojis
function formatEvent(body: any): string | null {
  const event = body?.event;
  if (!event) return null;

  const now = new Date();
  const time = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Los_Angeles",
  });

  // SMS received
  if (event.includes("/message-store") && body.body?.type === "SMS") {
    const msg = body.body;
    const from = msg.from?.phoneNumber || msg.from?.name || "Unknown";
    const to = msg.to?.[0]?.phoneNumber || "Unknown";
    const text = msg.subject || "(no text)";
    return `📱 *SMS Received*\nFrom: ${from}\nTo: ${to}\n💬 ${text}\n🕐 ${time} PST`;
  }

  // Voicemail
  if (event.includes("/message-store") && body.body?.type === "VoiceMail") {
    const msg = body.body;
    const from = msg.from?.phoneNumber || msg.from?.name || "Unknown";
    const duration = msg.vmDuration ? `${msg.vmDuration}s` : "N/A";
    return `🎙️ *Voicemail Received*\nFrom: ${from}\nDuration: ${duration}\n🕐 ${time} PST`;
  }

  // Fax
  if (event.includes("/message-store") && body.body?.type === "Fax") {
    const msg = body.body;
    const from = msg.from?.phoneNumber || "Unknown";
    return `📠 *Fax Received*\nFrom: ${from}\n🕐 ${time} PST`;
  }

  // Telephony session (call events)
  if (event.includes("/telephony/sessions")) {
    const session = body.body;
    const parties = session?.parties || [];
    const direction = parties[0]?.direction || "unknown";
    const status = parties[0]?.status?.code || "unknown";
    const from = parties[0]?.from?.phoneNumber || parties[0]?.from?.name || "Unknown";
    const to = parties[0]?.to?.phoneNumber || parties[0]?.to?.name || "Unknown";

    if (status === "Setup" || status === "Proceeding") {
      const emoji = direction === "Inbound" ? "📞" : "📤";
      return `${emoji} *${direction} Call Started*\nFrom: ${from}\nTo: ${to}\n🕐 ${time} PST`;
    }
    if (status === "Disconnected") {
      const duration = session?.origin?.sessionDuration
        ? `${Math.round(session.origin.sessionDuration)}s`
        : "";
      return `📵 *Call Ended*\nFrom: ${from}\nTo: ${to}${duration ? `\nDuration: ${duration}` : ""}\n🕐 ${time} PST`;
    }
    // Missed call
    if (status === "MissedCall" || (status === "Disconnected" && parties[0]?.missedCall)) {
      return `❌ *Missed Call*\nFrom: ${from}\n🕐 ${time} PST`;
    }
    // Skip intermediate statuses
    return null;
  }

  // Presence / missed call event
  if (event.includes("/presence")) {
    const p = body.body;
    if (p?.telephonyStatus === "Ringing") {
      return `🔔 *Phone Ringing*\n🕐 ${time} PST`;
    }
    if (p?.activeCalls) {
      const missed = p.activeCalls.filter((c: any) => c.result === "Missed");
      if (missed.length > 0) {
        const from = missed[0].from || "Unknown";
        return `❌ *Missed Call*\nFrom: ${from}\n🕐 ${time} PST`;
      }
    }
    return null;
  }

  // Generic / extension info event
  if (event.includes("/message-store")) {
    const msg = body.body;
    const type = msg?.type || "Message";
    const from = msg?.from?.phoneNumber || "Unknown";
    return `📩 *${type} Received*\nFrom: ${from}\n🕐 ${time} PST`;
  }

  return `📌 *RingCentral Event*\n${event}\n🕐 ${time} PST`;
}

async function sendTelegram(text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // RingCentral webhook validation handshake
    const validationToken = req.headers.get("validation-token");
    if (validationToken) {
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Validation-Token": validationToken,
          "Content-Type": "application/json",
        },
      });
    }

    const body = await req.json();

    // Log to webhook_events for audit
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    await fetch(`${supabaseUrl}/rest/v1/webhook_events`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "ringcentral",
        event_type: body.event || "unknown",
        payload: body,
      }),
    });

    // Format and send to Telegram
    const message = formatEvent(body);
    if (message) {
      await sendTelegram(message);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ringcentral-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
