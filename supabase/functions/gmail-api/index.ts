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

const EMAIL_SIGNATURE = `
<br/><br/>
<div style="margin-top:20px;padding-top:12px;border-top:1px solid #ccc;font-family:Arial,sans-serif;font-size:13px;color:#555;">
  <strong style="color:#111;">Warren Thompson</strong><br/>
  CEO of <a href="https://stu25.com" style="color:#2754C5;text-decoration:none;">STU25.com</a><br/>
  <a href="tel:+17029976750" style="color:#555;text-decoration:none;">(702) 997-6750</a>
</div>`;

function appendSignature(html: string): string {
  // Insert before closing </body> or </html>, or just append
  if (html.toLowerCase().includes('</body>')) {
    return html.replace(/<\/body>/i, `${EMAIL_SIGNATURE}</body>`);
  }
  if (html.toLowerCase().includes('</html>')) {
    return html.replace(/<\/html>/i, `${EMAIL_SIGNATURE}</html>`);
  }
  return html + EMAIL_SIGNATURE;
}

const INVOICE_KEYWORDS = [/\binvoice\b/i, /\binv[-\s]?\d{2,}\b/i];

function isInvoiceEmail(subject: string, body: string): boolean {
  const combined = `${subject}\n${body}`;
  return INVOICE_KEYWORDS.some((pattern) => pattern.test(combined));
}

function hasPdfAttachment(
  attachments?: { filename: string; mimeType: string; data: string }[]
): boolean {
  if (!attachments?.length) return false;
  return attachments.some((att) => {
    const mime = (att.mimeType || "").toLowerCase();
    const name = (att.filename || "").toLowerCase();
    return mime.includes("pdf") || name.endsWith(".pdf");
  });
}

function buildInvoiceSupportBody(recipient: string): string {
  return `
    <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;">
      <p>Hello,</p>
      <p>
        Your invoice details are attached as a PDF to preserve formatting, totals,
        and a clean print-ready copy.
      </p>
      <p>
        Please review the attached PDF invoice for the full breakdown and payment terms.
      </p>
      <p>If you have any questions, just reply to this email.</p>
      <p style="margin-top:16px;">Recipient: ${recipient}</p>
    </div>
  `;
}

function buildRawEmail(to: string, from: string, subject: string, body: string, attachments?: { filename: string; mimeType: string; data: string }[]): string {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, '')}`;
  const signedBody = appendSignature(body);

  if (!attachments || attachments.length === 0) {
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset=UTF-8`,
      `MIME-Version: 1.0`,
      "",
      signedBody,
    ];
    const raw = lines.join("\r\n");
    return btoa(unescape(encodeURIComponent(raw)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    "",
    signedBody,
  ];

  for (const att of attachments) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
    lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    lines.push(`Content-Transfer-Encoding: base64`);
    lines.push("");
    // Break base64 into 76-char lines per MIME spec
    const b64 = att.data;
    for (let i = 0; i < b64.length; i += 76) {
      lines.push(b64.substring(i, i + 76));
    }
  }

  lines.push(`--${boundary}--`);

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
    // Try multiple parsing strategies for the service account JSON
    const parseAttempts = [
      () => JSON.parse(saJson),
      () => JSON.parse(saJson.replace(/\\n/g, "\n")),
      () => JSON.parse(saJson.replace(/\\\\n/g, "\n")),
      () => JSON.parse(JSON.parse(`"${saJson.replace(/"/g, '\\"')}"`)),
      () => JSON.parse(saJson.trim()),
    ];
    
    let parseError: any;
    for (const attempt of parseAttempts) {
      try {
        sa = attempt();
        break;
      } catch (e) {
        parseError = e;
      }
    }
    
    if (!sa) {
      console.error("JSON parse failed. First 200 chars:", saJson.substring(0, 200));
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${parseError?.message}`);
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
      const { to, subject, body, attachments } = await req.json();
      if (!to || !subject) throw new Error("to and subject required");

      const invoiceEmail = isInvoiceEmail(subject || "", body || "");
      const hasInvoicePdf = hasPdfAttachment(attachments);

      if (invoiceEmail && !hasInvoicePdf) {
        return new Response(
          JSON.stringify({
            error:
              "Invoice-related emails must include a PDF attachment. Use invoice-api?action=send-invoice (preferred) or attach a PDF before sending.",
            blocked: true,
            code: "invoice_pdf_required",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Anti-spam: block duplicate emails to same recipient within 3 minutes ───
      const recipientLower = to.toLowerCase().trim();
      const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

      const saJson2 = Deno.env.get("SUPABASE_URL");
      const saKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (saJson2 && saKey) {
        const checkUrl = `${saJson2}/rest/v1/communications?to_address=eq.${encodeURIComponent(recipientLower)}&type=eq.email&direction=eq.outbound&created_at=gte.${encodeURIComponent(threeMinAgo)}&select=id,subject&limit=1`;
        const checkRes = await fetch(checkUrl, {
          headers: {
            apikey: saKey,
            Authorization: `Bearer ${saKey}`,
          },
        });
        if (checkRes.ok) {
          const recent = await checkRes.json();
          if (recent && recent.length > 0) {
            return new Response(
              JSON.stringify({
                error: `Email to ${to} blocked — another email was sent to this recipient less than 3 minutes ago (subject: "${recent[0].subject || 'unknown'}"). Wait before sending again.`,
                blocked: true,
                recent_id: recent[0].id,
              }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      const normalizedBody = invoiceEmail
        ? buildInvoiceSupportBody(to)
        : (body || "");

      const raw = buildRawEmail(to, IMPERSONATE_EMAIL, subject, normalizedBody, attachments);
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

      // Log to communications table so emails appear in project hubs
      const sbUrl = Deno.env.get("SUPABASE_URL");
      const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (sbUrl && sbKey) {
        // Find customer by email
        const custRes = await fetch(
          `${sbUrl}/rest/v1/customers?email=ilike.${encodeURIComponent(recipientLower)}&select=id&limit=1`,
          { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
        );
        let customerId: string | null = null;
        if (custRes.ok) {
          const custs = await custRes.json();
          if (custs?.length > 0) customerId = custs[0].id;
        }

        const commPayload = {
          type: 'email',
          direction: 'outbound',
          subject: subject || null,
          body: (body || '').replace(/<[^>]*>/g, '').slice(0, 2000),
          from_address: IMPERSONATE_EMAIL,
          to_address: recipientLower,
          status: 'sent',
          provider: 'gmail',
          external_id: sendData.id,
          ...(customerId ? { customer_id: customerId } : {}),
        };

        await fetch(`${sbUrl}/rest/v1/communications`, {
          method: 'POST',
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(commPayload),
        });
      }

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
