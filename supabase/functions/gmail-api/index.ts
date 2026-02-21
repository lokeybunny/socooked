// Gmail API Edge Function
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
        scope: "https://www.googleapis.com/auth/gmail.modify",
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
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    const htmlPart = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data);
    const textPart = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

interface SimplifiedEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
}

async function getMessages(
  token: string,
  query: string,
  maxResults: number = 25
): Promise<SimplifiedEmail[]> {
  const listUrl = `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();
  if (!listRes.ok) throw new Error(`Gmail list error: ${JSON.stringify(listData)}`);

  const messages = listData.messages || [];
  if (messages.length === 0) return [];

  const details = await Promise.all(
    messages.map(async (m: any) => {
      const res = await fetch(
        `${GMAIL_API}/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.json();
    })
  );

  return details.map((msg: any) => ({
    id: msg.id,
    threadId: msg.threadId,
    from: parseHeader(msg.payload?.headers, "From"),
    to: parseHeader(msg.payload?.headers, "To"),
    subject: parseHeader(msg.payload?.headers, "Subject"),
    snippet: msg.snippet || "",
    body: extractBody(msg.payload || {}),
    date: parseHeader(msg.payload?.headers, "Date"),
    labelIds: msg.labelIds || [],
    isUnread: (msg.labelIds || []).includes("UNREAD"),
  }));
}

function buildRawEmail(to: string, from: string, subject: string, body: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset=UTF-8`,
    `MIME-Version: 1.0`,
    "",
    body,
  ];
  const raw = lines.join("\r\n");
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    let sa: any;
    try {
      sa = JSON.parse(saJson);
    } catch {
      try {
        sa = JSON.parse(JSON.parse(`"${saJson.replace(/"/g, '\\"')}"`));
      } catch {
        try {
          sa = JSON.parse(saJson.replace(/\\\\n/g, "\\n"));
        } catch {
          throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
        }
      }
    }

    const token = await getAccessToken(sa);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "inbox") {
      const emails = await getMessages(token, "in:inbox category:primary", 30);
      return new Response(JSON.stringify({ emails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sent") {
      const emails = await getMessages(token, "in:sent", 30);
      return new Response(JSON.stringify({ emails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "drafts") {
      const draftsUrl = `${GMAIL_API}/users/me/drafts?maxResults=30`;
      const draftsRes = await fetch(draftsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const draftsData = await draftsRes.json();
      if (!draftsRes.ok) throw new Error(`Drafts error: ${JSON.stringify(draftsData)}`);

      const drafts = draftsData.drafts || [];
      if (drafts.length === 0) {
        return new Response(JSON.stringify({ emails: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const details = await Promise.all(
        drafts.map(async (d: any) => {
          const res = await fetch(
            `${GMAIL_API}/users/me/drafts/${d.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return res.json();
        })
      );

      const emails: SimplifiedEmail[] = details.map((d: any) => {
        const msg = d.message || {};
        return {
          id: d.id,
          threadId: msg.threadId || "",
          from: parseHeader(msg.payload?.headers, "From"),
          to: parseHeader(msg.payload?.headers, "To"),
          subject: parseHeader(msg.payload?.headers, "Subject"),
          snippet: msg.snippet || "",
          body: extractBody(msg.payload || {}),
          date: parseHeader(msg.payload?.headers, "Date"),
          labelIds: msg.labelIds || [],
          isUnread: false,
        };
      });

      return new Response(JSON.stringify({ emails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "message") {
      const msgId = url.searchParams.get("id");
      if (!msgId) throw new Error("id required");
      const res = await fetch(
        `${GMAIL_API}/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msg = await res.json();
      if (!res.ok) throw new Error(`Message error: ${JSON.stringify(msg)}`);

      await fetch(`${GMAIL_API}/users/me/messages/${msgId}/modify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      });

      const email: SimplifiedEmail = {
        id: msg.id,
        threadId: msg.threadId,
        from: parseHeader(msg.payload?.headers, "From"),
        to: parseHeader(msg.payload?.headers, "To"),
        subject: parseHeader(msg.payload?.headers, "Subject"),
        snippet: msg.snippet || "",
        body: extractBody(msg.payload || {}),
        date: parseHeader(msg.payload?.headers, "Date"),
        labelIds: msg.labelIds || [],
        isUnread: false,
      };

      return new Response(JSON.stringify({ email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send") {
      const { to, subject, body } = await req.json();
      if (!to || !subject) throw new Error("to and subject required");

      const raw = buildRawEmail(to, IMPERSONATE_EMAIL, subject, body || "");
      const sendRes = await fetch(`${GMAIL_API}/users/me/messages/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      });
      const sendData = await sendRes.json();
      if (!sendRes.ok) throw new Error(`Send error: ${JSON.stringify(sendData)}`);

      return new Response(JSON.stringify({ success: true, id: sendData.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save-draft") {
      const { to, subject, body } = await req.json();
      const raw = buildRawEmail(to || "", IMPERSONATE_EMAIL, subject || "", body || "");
      const draftRes = await fetch(`${GMAIL_API}/users/me/drafts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: { raw } }),
      });
      const draftData = await draftRes.json();
      if (!draftRes.ok) throw new Error(`Draft error: ${JSON.stringify(draftData)}`);

      return new Response(JSON.stringify({ success: true, id: draftData.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use ?action=inbox|sent|drafts|message|send|save-draft" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Gmail API error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
