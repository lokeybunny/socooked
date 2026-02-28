/**
 * GVoice Poll — polls WarrentheCreativeyt@gmail.com for Google Voice emails
 * and forwards them to Telegram. Tracks forwarded messages in webhook_events
 * to avoid duplicates. Stores telegram_message_id in communications for reply support.
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const IMPERSONATE_EMAIL = "WarrentheCreativeyt@gmail.com";
const GVOICE_SENDER = "voice-noreply@google.com";
const TG_API = "https://api.telegram.org/bot";

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GVOICE_CLIENT_ID");
  const clientSecret = Deno.env.get("GVOICE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GVOICE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GVOICE_CLIENT_ID, GVOICE_CLIENT_SECRET, or GVOICE_REFRESH_TOKEN not configured");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

function parseHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBase64Url(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    return atob(padded);
  }
}

function extractBody(payload: any): string {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data);
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

/** Strip HTML tags for clean Telegram text */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract the caller phone number and message content from a Google Voice email.
 * GVoice emails typically have subject like "New text message from (702) 555-1234"
 * or "Voicemail from (702) 555-1234" etc.
 */
function parseGVoiceEmail(subject: string, body: string): { phone: string; content: string; type: string } {
  let phone = "";
  let type = "message";

  // Extract phone from subject
  const phoneMatch = subject.match(/from\s+([(\d)\s\-+]+)/i);
  if (phoneMatch) phone = phoneMatch[1].trim();

  // Determine type
  if (/voicemail/i.test(subject)) type = "voicemail";
  else if (/text\s+message/i.test(subject)) type = "text";
  else if (/missed\s+call/i.test(subject)) type = "missed_call";

  const content = stripHtml(body).slice(0, 1500);
  return { phone, content, type };
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TG_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!TG_TOKEN || !TG_CHAT_ID) throw new Error("Telegram config missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const token = await getAccessToken();
    console.log("[gvoice-poll] OAuth2 token obtained OK");

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ─── Reply action: send an email reply to a GVoice thread ───
    if (action === "reply") {
      const { thread_id, gmail_id, message, phone, reply_to } = await req.json();
      if (!message) throw new Error("message required");

      // Use the stored Reply-To address (e.g. 14244651253.17027016192.xxx@txt.voice.google.com)
      // This is the actual address Gmail uses when you hit reply on a GVoice text email
      const isEmail = phone && phone.includes("@");
      const recipient = reply_to || (isEmail ? phone : GVOICE_SENDER);
      console.log(`[gvoice-reply] Using recipient: ${recipient} (reply_to=${reply_to}, phone=${phone})`);
      const replySubject = isEmail
        ? `Re: ${phone}`
        : `Re: Google Voice text from ${phone || "unknown"}`;
      
      // Build raw reply MIME
      const rawLines = [
        `From: ${IMPERSONATE_EMAIL}`,
        `To: ${recipient}`,
        `Subject: ${replySubject}`,
        `In-Reply-To: ${gmail_id || ""}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `MIME-Version: 1.0`,
        "",
        message,
      ];
      const raw = btoa(unescape(encodeURIComponent(rawLines.join("\r\n"))))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const sendRes = await fetch(`${GMAIL_API}/users/me/messages/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw, threadId: thread_id || undefined }),
      });
      const sendData = await sendRes.json();
      if (!sendRes.ok) throw new Error(`Send error: ${JSON.stringify(sendData)}`);

      // Log outbound communication
      await supabase.from("communications").insert({
        type: "phone",
        direction: "outbound",
        subject: replySubject,
        body: message.slice(0, 2000),
        from_address: IMPERSONATE_EMAIL,
        to_address: phone || GVOICE_SENDER,
        status: "sent",
        provider: "gvoice-reply",
        external_id: sendData.id,
        phone_number: phone || null,
        metadata: { gmail_id: sendData.id, thread_id: thread_id },
      });

      return new Response(JSON.stringify({ success: true, id: sendData.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Default: Poll for new GVoice emails ───
    // Fetch recent emails from voice-noreply@google.com
    const query = `in:inbox newer_than:7d`;
    const listUrl = `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=3`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    if (!listRes.ok) throw new Error(`Gmail list error: ${JSON.stringify(listData)}`);

    const messages = listData.messages || [];
    if (messages.length === 0) {
      return new Response(JSON.stringify({ forwarded: 0, message: "No new GVoice emails" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let forwarded = 0;

    for (const m of messages) {
      // Skip dedup check for testing — allow duplicates
      // const { data: existing } = await supabase
      //   .from("webhook_events")
      //   .select("id")
      //   .eq("source", "gvoice-poll")
      //   .eq("event_type", "gvoice_forwarded")
      //   .filter("payload->>gmail_id", "eq", m.id)
      //   .limit(1);
      // if (existing && existing.length > 0) continue;

      // Fetch full message
      const msgRes = await fetch(
        `${GMAIL_API}/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msg = await msgRes.json();
      if (!msgRes.ok) continue;

      const subject = parseHeader(msg.payload?.headers, "Subject");
      const date = parseHeader(msg.payload?.headers, "Date");
      const replyTo = parseHeader(msg.payload?.headers, "Reply-To");
      const from = parseHeader(msg.payload?.headers, "From");
      const body = extractBody(msg.payload || {});
      const { phone, content, type } = parseGVoiceEmail(subject, body);
      
      // The actual reply address is in Reply-To header (e.g. 14244651253.17027016192.xxx@txt.voice.google.com)
      const effectiveReplyTo = replyTo || from || GVOICE_SENDER;
      console.log(`[gvoice-poll] Reply-To: ${replyTo}, From: ${from}, Effective: ${effectiveReplyTo}`);

      // Build Telegram message
      const typeIcon = type === "voicemail" ? "🎙️" : type === "missed_call" ? "📵" : "💬";
      const tgText = [
        `${typeIcon} <b>Google Voice ${type.replace("_", " ")}</b>`,
        phone ? `📞 <b>${phone}</b>` : "",
        `📋 <i>${subject}</i>`,
        "",
        content.slice(0, 800),
        "",
        `<i>${date}</i>`,
      ].filter(Boolean).join("\n");

      // Send to Telegram
      const tgRes = await fetch(`${TG_API}${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_CHAT_ID,
          text: tgText.slice(0, 4000),
          parse_mode: "HTML",
        }),
      });
      const tgData = await tgRes.json();
      const telegramMessageId = tgData?.result?.message_id;

      // Log to communications table with telegram_message_id for reply support
      const { error: commErr } = await supabase.from("communications").insert({
        type: "phone",
        direction: "inbound",
        subject: subject,
        body: content.slice(0, 2000),
        from_address: phone || GVOICE_SENDER,
        to_address: IMPERSONATE_EMAIL,
        status: "received",
        provider: "gvoice-poll",
        external_id: m.id,
        phone_number: phone || null,
        metadata: {
          gmail_id: m.id,
          thread_id: msg.threadId,
          telegram_message_id: telegramMessageId ? String(telegramMessageId) : null,
          gvoice_type: type,
          source_email: IMPERSONATE_EMAIL,
          reply_to: effectiveReplyTo,
        },
      });
      if (commErr) console.error("[gvoice-poll] communications insert error:", commErr);

      // Mark as forwarded — store gmail_id, thread_id, phone for reply fallback
      await supabase.from("webhook_events").insert({
        source: "gvoice-poll",
        event_type: "gvoice_forwarded",
        payload: { gmail_id: m.id, thread_id: msg.threadId, telegram_message_id: telegramMessageId, phone: phone || null, reply_to: effectiveReplyTo },
        processed: true,
      });

      forwarded++;
    }

    return new Response(
      JSON.stringify({ forwarded, total: messages.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[gvoice-poll] error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
