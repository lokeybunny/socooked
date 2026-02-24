import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const IMPERSONATE_EMAIL = "warren@stu25.com";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  );
  const payload = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        sub: IMPERSONATE_EMAIL,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
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
  return `${signingInput}.${base64url(sig)}`;
  // Exchange JWT for access token
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

function extractSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).toLowerCase().trim();
}

function extractSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split("@")[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Allow internal cron calls and bot calls
    const isInternal = req.headers.get("x-internal") === "true";
    const botSecret = req.headers.get("x-bot-secret");
    const validBot = botSecret === Deno.env.get("BOT_SECRET");

    if (!isInternal && !validBot) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return new Response(JSON.stringify({ error: "Telegram not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse Google SA
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
    let sa: any;
    const parseAttempts = [
      () => JSON.parse(saJson),
      () => JSON.parse(saJson.replace(/\\n/g, "\n")),
      () => JSON.parse(saJson.replace(/\\\\n/g, "\n")),
    ];
    for (const attempt of parseAttempts) {
      try { sa = attempt(); break; } catch {}
    }
    if (!sa) throw new Error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON");

    // Get Gmail access token
    const now = Math.floor(Date.now() / 1000);
    const jwtHeader = base64url(
      new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    );
    const jwtPayload = base64url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: sa.client_email,
          sub: IMPERSONATE_EMAIL,
          scope: "https://www.googleapis.com/auth/gmail.modify",
          aud: GOOGLE_TOKEN_URL,
          iat: now,
          exp: now + 3600,
        })
      )
    );
    const signingInput = `${jwtHeader}.${jwtPayload}`;
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
    const jwtToken = `${signingInput}.${base64url(sig)}`;
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwtToken}`,
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
    const accessToken = tokenData.access_token;

    // Fetch recent unread emails (last 10 minutes window, max 10)
    const listUrl = `${GMAIL_API}/users/me/messages?q=${encodeURIComponent("is:unread in:inbox category:primary newer_than:1h")}&maxResults=10`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listData = await listRes.json();
    if (!listRes.ok) throw new Error(`Gmail list error: ${JSON.stringify(listData)}`);

    const messages = listData.messages || [];
    if (messages.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: "no unread emails" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Supabase client to check customers and track notified IDs
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get already-notified message IDs from webhook_events to avoid duplicates
    const { data: recentNotifs } = await supabase
      .from("webhook_events")
      .select("payload")
      .eq("source", "gmail")
      .eq("event_type", "email_notification")
      .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .limit(100);

    const notifiedIds = new Set<string>();
    if (recentNotifs) {
      for (const n of recentNotifs) {
        const msgId = (n.payload as any)?.gmail_id;
        if (msgId) notifiedIds.add(msgId);
      }
    }

    // Filter out already-notified
    const newMessages = messages.filter((m: any) => !notifiedIds.has(m.id));
    if (newMessages.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: "all already notified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch message details
    const details = await Promise.all(
      newMessages.slice(0, 5).map(async (m: any) => {
        const res = await fetch(
          `${GMAIL_API}/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return res.json();
      })
    );

    // Load all customer emails for matching
    const { data: customers } = await supabase
      .from("customers")
      .select("id, full_name, email")
      .not("email", "is", null);

    const customerMap = new Map<string, { id: string; full_name: string }>();
    if (customers) {
      for (const c of customers) {
        if (c.email) customerMap.set(c.email.toLowerCase().trim(), { id: c.id, full_name: c.full_name });
      }
    }

    let notifiedCount = 0;

    for (const msg of details) {
      const from = parseHeader(msg.payload?.headers, "From");
      const subject = parseHeader(msg.payload?.headers, "Subject");
      const senderEmail = extractSenderEmail(from);
      const senderName = extractSenderName(from);

      // Extract email body text
      let bodyText = msg.snippet || "";
      try {
        const parts = msg.payload?.parts || [];
        const textPart = parts.find((p: any) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          bodyText = atob(textPart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        } else if (msg.payload?.body?.data) {
          bodyText = atob(msg.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        }
      } catch { /* fall back to snippet */ }

      // Trim body for Telegram (max ~500 chars)
      const trimmedBody = bodyText.length > 500 ? bodyText.slice(0, 500) + "…" : bodyText;

      // Check if sender is a customer
      const customer = customerMap.get(senderEmail);
      const isCustomer = !!customer;

      // Build Telegram message
      const emoji = isCustomer ? "👤" : "📩";
      const customerTag = isCustomer ? ` (CRM: ${customer!.full_name})` : "";
      const time = new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      });

      const text = [
        `${emoji} *New Email* from *${senderName}*${customerTag}`,
        `📧 ${senderEmail}`,
        `📋 *${subject || "(no subject)"}*`,
        `🕐 ${time} PST`,
        ``,
        `💬 ${trimmedBody}`,
        ``,
        isCustomer ? `🔗 [View in CRM](https://stu25.com/messages)` : "",
      ].filter((l) => l !== false).join("\n");

      // Send Telegram notification
      const tgRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: "Markdown",
          }),
        }
      );

      if (tgRes.ok) {
        notifiedCount++;
        // Record notification to prevent duplicates
        await supabase.from("webhook_events").insert({
          source: "gmail",
          event_type: "email_notification",
          payload: {
            gmail_id: msg.id,
            from: senderEmail,
            subject,
            is_customer: isCustomer,
            customer_id: customer?.id || null,
          },
          processed: true,
        });

        // Log inbound customer emails to communications table
        if (isCustomer && customer?.id) {
          const trimmedBodyForComm = bodyText.replace(/<[^>]*>/g, '').slice(0, 2000);
          // Check if already logged (by external_id)
          const { data: existing } = await supabase
            .from("communications")
            .select("id")
            .eq("external_id", msg.id)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("communications").insert({
              type: "email",
              direction: "inbound",
              subject: subject || null,
              body: trimmedBodyForComm,
              from_address: senderEmail,
              to_address: IMPERSONATE_EMAIL,
              status: "received",
              provider: "gmail",
              external_id: msg.id,
              customer_id: customer.id,
            });
          }
        }
      } else {
        console.error("Telegram send failed:", await tgRes.text());
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified: notifiedCount, checked: details.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("gmail-poll error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
