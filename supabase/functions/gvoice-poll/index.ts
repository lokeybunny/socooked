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
const IMPERSONATE_EMAIL = "warren@stu25.com";
const GVOICE_SENDER = "voice-noreply@google.com";
const TG_API = "https://api.telegram.org/bot";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(sa: any, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  );
  const payload = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        sub: IMPERSONATE_EMAIL,
        scope,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
      })
    )
  );
  const signingInput = `${header}.${payload}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(signingInput)
    )
  );
  const jwt = `${signingInput}.${base64url(sig)}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
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
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TG_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!TG_TOKEN || !TG_CHAT_ID) throw new Error("Telegram config missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Parse service account
    let sa: any;
    // Try multiple parse strategies for service account JSON
    const cleaned = saJson.trim();
    const parseAttempts: (() => any)[] = [
      () => JSON.parse(cleaned),
      () => JSON.parse(cleaned.replace(/\\n/g, "\n")),
      () => JSON.parse(cleaned.replace(/\\\\n/g, "\n")),
      () => JSON.parse(cleaned.replace(/\n/g, "\\n")),
    ];
    for (const attempt of parseAttempts) {
      try { sa = attempt(); break; } catch (_e) { /* skip */ }
    }
    if (!sa) {
      console.error("[gvoice-poll] JSON parse failed. First 100 chars:", cleaned.slice(0, 100));
      throw new Error("Failed to parse GVOICE_SERVICE_ACCOUNT_JSON");
    }
    if (!sa.client_email || !sa.private_key) {
      throw new Error("GVOICE_SERVICE_ACCOUNT_JSON missing client_email or private_key");
    }
    console.log("[gvoice-poll] SA parsed OK, email:", sa.client_email);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const scope = action === "reply" 
      ? "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send"
      : "https://www.googleapis.com/auth/gmail.modify";
    const token = await getAccessToken(sa, scope);

    // ─── Reply action: send an email reply to a GVoice thread ───
    if (action === "reply") {
      const { thread_id, gmail_id, message, phone } = await req.json();
      if (!message) throw new Error("message required");

      // Google Voice texts come from voice-noreply@google.com but replies
      // need to go to the phone number's GVoice SMS address.
      // The simplest approach: reply to the original thread via Gmail API
      const replySubject = `Re: Google Voice text from ${phone || "unknown"}`;
      
      // Build raw reply MIME
      const boundary = `boundary_${crypto.randomUUID().replace(/-/g, "")}`;
      const rawLines = [
        `From: ${IMPERSONATE_EMAIL}`,
        `To: ${GVOICE_SENDER}`,
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
    const query = `subject:(702) 701-6192 in:inbox newer_than:1d`;
    const listUrl = `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;
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
      // Check if already forwarded
      const { data: existing } = await supabase
        .from("webhook_events")
        .select("id")
        .eq("source", "gvoice-poll")
        .eq("event_type", "gvoice_forwarded")
        .filter("payload->>gmail_id", "eq", m.id)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Fetch full message
      const msgRes = await fetch(
        `${GMAIL_API}/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msg = await msgRes.json();
      if (!msgRes.ok) continue;

      const subject = parseHeader(msg.payload?.headers, "Subject");
      const date = parseHeader(msg.payload?.headers, "Date");
      const body = extractBody(msg.payload || {});
      const { phone, content, type } = parseGVoiceEmail(subject, body);

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
      await supabase.from("communications").insert({
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
        },
      });

      // Mark as forwarded to prevent duplicates
      await supabase.from("webhook_events").insert({
        source: "gvoice-poll",
        event_type: "gvoice_forwarded",
        payload: { gmail_id: m.id, telegram_message_id: telegramMessageId },
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
