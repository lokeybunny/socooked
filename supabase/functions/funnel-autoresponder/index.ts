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
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    sub: IMPERSONATE_EMAIL,
    scope: "https://www.googleapis.com/auth/gmail.modify",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })));
  const signingInput = `${header}.${payload}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput)));
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

const EMAIL_SIGNATURE = `
<br/><br/>
<div style="margin-top:20px;padding-top:12px;border-top:1px solid #ccc;font-family:Arial,sans-serif;font-size:13px;color:#555;">
  <strong style="color:#111;">Warren Thompson</strong><br/>
  <a href="https://stu25.com" style="color:#2754C5;text-decoration:none;">STU25.com</a><br/>
  <a href="tel:+14244651253" style="color:#555;text-decoration:none;">(424) 465-1253</a> (cell) |
  <a href="tel:+17028322317" style="color:#555;text-decoration:none;">(702) 832-2317</a> (office)
</div>`;

interface FunnelEmailConfig {
  subject: string;
  body: (name: string) => string;
}

const FUNNEL_TEMPLATES: Record<string, FunnelEmailConfig> = {
  videography: {
    subject: "Thank You for Your Videography Inquiry - Warren Guru",
    body: (name: string) => `
<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.7;max-width:600px;">
  <p>Hi ${name},</p>
  <p>Thank you so much for reaching out about our <strong>videography services</strong>! We're excited that you're considering us for your project.</p>
  <p>We wanted to let you know that <strong>we'll be following up with you immediately via phone</strong> to discuss your vision, event details, and how we can bring your project to life.</p>
  <p>In the meantime, here's what you can expect:</p>
  <ul style="padding-left:20px;color:#374151;">
    <li>A personal call from our team to understand your needs</li>
    <li>A customized quote based on your specific project</li>
    <li>Creative direction ideas tailored to your vision</li>
  </ul>
  <p>If you'd like to reach us sooner, feel free to call or text anytime.</p>
  <p>We look forward to working with you!</p>
  <p style="margin-top:24px;">Best regards,</p>
</div>`,
  },
  seller: {
    subject: "Thank You for Your Property Inquiry - Warren Guru",
    body: (name: string) => `
<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.7;max-width:600px;">
  <p>Hi ${name},</p>
  <p>Thank you for submitting your property information! We appreciate you taking the time to reach out.</p>
  <p><strong>We'll be following up with you immediately via phone</strong> to discuss your property, your timeline, and how we can help you get the best possible outcome.</p>
  <p>Here's what happens next:</p>
  <ul style="padding-left:20px;color:#374151;">
    <li>A personal call from our acquisitions team</li>
    <li>A no-obligation cash offer for your property</li>
    <li>A fast, hassle-free process — no repairs, no agents, no fees</li>
  </ul>
  <p>We buy properties in any condition, and we can close on your timeline. If you need to reach us before we call, don't hesitate.</p>
  <p>Talk soon!</p>
  <p style="margin-top:24px;">Best regards,</p>
</div>`,
  },
  webdesign: {
    subject: "Thank You for Your Web Design Inquiry - Warren Guru",
    body: (name: string) => `
<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.7;max-width:600px;">
  <p>Hi ${name},</p>
  <p>Thank you for your interest in our <strong>AI-powered web design services</strong>! We're thrilled that you're looking to elevate your online presence.</p>
  <p><strong>We'll be following up with you immediately via phone</strong> to discuss your business, your goals, and how we can build the perfect website for you.</p>
  <p>Here's what you can expect:</p>
  <ul style="padding-left:20px;color:#374151;">
    <li>A discovery call to understand your business and brand</li>
    <li>A custom website mockup and strategy proposal</li>
    <li>Modern, AI-enhanced design that drives results</li>
  </ul>
  <p>We specialize in creating high-converting websites that make your business stand out. If you'd like to reach us sooner, feel free to call or text.</p>
  <p>Excited to get started!</p>
  <p style="margin-top:24px;">Best regards,</p>
</div>`,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { funnel, recipientEmail, recipientName } = await req.json();

    if (!funnel || !recipientEmail || !recipientName) {
      return new Response(JSON.stringify({ error: "funnel, recipientEmail, and recipientName are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const template = FUNNEL_TEMPLATES[funnel];
    if (!template) {
      return new Response(JSON.stringify({ error: `Unknown funnel: ${funnel}. Valid: ${Object.keys(FUNNEL_TEMPLATES).join(", ")}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse service account
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    let sa: any;
    const parseAttempts = [
      () => JSON.parse(saJson),
      () => JSON.parse(saJson.replace(/\\n/g, "\n")),
      () => JSON.parse(saJson.replace(/\\\\n/g, "\n")),
    ];
    for (const attempt of parseAttempts) {
      try { sa = attempt(); break; } catch { /* continue */ }
    }
    if (!sa) throw new Error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON");

    const token = await getAccessToken(sa);
    const htmlBody = template.body(recipientName) + EMAIL_SIGNATURE;

    // Build raw email – RFC 2047 encode subject to prevent charset corruption
    const subjectB64 = btoa(unescape(encodeURIComponent(template.subject)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(template.subject)))}?=`;
    const lines = [
      `From: Warren Thompson <${IMPERSONATE_EMAIL}>`,
      `To: ${recipientEmail}`,
      `Subject: ${encodedSubject}`,
      `Content-Type: text/html; charset=UTF-8`,
      `MIME-Version: 1.0`,
      "",
      htmlBody,
    ];
    const raw = btoa(unescape(encodeURIComponent(lines.join("\r\n"))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sendRes = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok) throw new Error(`Gmail send error: ${JSON.stringify(sendData)}`);

    console.log(`✅ Funnel autoresponder sent: ${funnel} → ${recipientEmail}`);

    return new Response(JSON.stringify({ ok: true, messageId: sendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Funnel autoresponder error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
