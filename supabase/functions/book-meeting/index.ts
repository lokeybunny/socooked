import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const IMPERSONATE_EMAIL = "warren@stu25.com";
const SITE_DOMAIN = "https://stu25.com";

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
  const pemBody = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
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
  CEO of <a href="https://stu25.com" style="color:#2754C5;text-decoration:none;">STU25.com</a><br/>
  <a href="tel:+17029976750" style="color:#555;text-decoration:none;">(702) 997-6750</a>
</div>`;

function buildRawEmail(to: string, subject: string, body: string): string {
  const signedBody = body + EMAIL_SIGNATURE;
  const lines = [
    `From: Warren Thompson <${IMPERSONATE_EMAIL}>`,
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { guest_name, guest_email, guest_phone, booking_date, start_time, duration_minutes } = await req.json();

    if (!guest_name || !guest_email || !booking_date || !start_time || !duration_minutes) {
      throw new Error("Missing required fields");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Calculate end time
    const [h, m] = start_time.split(":").map(Number);
    const startMinutes = h * 60 + m;
    const endMinutes = startMinutes + duration_minutes;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const end_time = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

    // Create meeting room
    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .insert({ title: `Meeting with ${guest_name}`, scheduled_at: `${booking_date}T${start_time}:00`, status: "waiting" })
      .select()
      .single();
    if (meetingErr) throw meetingErr;

    const roomUrl = `${SITE_DOMAIN}/meet/${meeting.room_code}`;

    // Create booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        booking_date,
        start_time,
        end_time,
        duration_minutes,
        guest_name,
        guest_email,
        guest_phone: guest_phone || null,
        meeting_id: meeting.id,
        room_code: meeting.room_code,
        status: "confirmed",
      })
      .select()
      .single();
    if (bookingErr) throw bookingErr;

    // Create calendar event
    const startDt = `${booking_date}T${start_time}:00-08:00`;
    const endDt = `${booking_date}T${end_time}:00-08:00`;
    await supabase.from("calendar_events").insert({
      title: `Meeting with ${guest_name}`,
      start_time: startDt,
      end_time: endDt,
      source: "booking",
      source_id: booking.id,
      description: `Guest: ${guest_name} (${guest_email})\nMeeting Link: ${roomUrl}`,
      location: roomUrl,
      color: "#8b5cf6",
    });

    // Send Telegram notification
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");
    if (telegramToken && telegramChatId) {
      try {
        const dateObj2 = new Date(`${booking_date}T${start_time}:00`);
        const fmtDate = dateObj2.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        const fmtTime = dateObj2.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        const tgMsg = [
          `📅 *New Meeting Booked!*`,
          ``,
          `👤 *Guest:* ${guest_name}`,
          `📧 *Email:* ${guest_email}`,
          guest_phone ? `📞 *Phone:* ${guest_phone}` : null,
          `📆 *Date:* ${fmtDate}`,
          `🕐 *Time:* ${fmtTime} (PST)`,
          `⏱ *Duration:* ${duration_minutes} min`,
          `🔗 [Join Meeting](${roomUrl})`,
        ].filter(Boolean).join("\n");

        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: telegramChatId, text: tgMsg, parse_mode: "Markdown" }),
        });
        console.log("Telegram notification sent");
      } catch (tgErr) {
        console.error("Telegram notify failed:", tgErr);
      }
    }

    // Format date for email
    const dateObj = new Date(`${booking_date}T${start_time}:00`);
    const formattedDate = dateObj.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const formattedTime = dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    // Send confirmation email via Gmail API
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (saJson) {
      try {
        const sa = JSON.parse(saJson);
        const accessToken = await getAccessToken(sa);

        const emailBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#111;margin-bottom:16px;">Meeting Confirmed! 🎉</h2>
  <p style="color:#333;font-size:15px;">Hi ${guest_name},</p>
  <p style="color:#333;font-size:15px;">Your meeting has been booked successfully. Here are the details:</p>
  <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;">
    <p style="margin:6px 0;color:#333;"><strong>📅 Date:</strong> ${formattedDate}</p>
    <p style="margin:6px 0;color:#333;"><strong>🕐 Time:</strong> ${formattedTime} (Las Vegas / PST)</p>
    <p style="margin:6px 0;color:#333;"><strong>⏱ Duration:</strong> ${duration_minutes} minutes</p>
  </div>
  <div style="text-align:center;margin:24px 0;">
    <a href="${roomUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      Join Meeting
    </a>
  </div>
  <p style="color:#666;font-size:13px;">Click the button above at the scheduled time to join. No downloads required.</p>
  <p style="color:#666;font-size:13px;">If you need to reschedule, please reply to this email.</p>
</div>`;

        const raw = buildRawEmail(guest_email, `Meeting Confirmed - ${formattedDate} at ${formattedTime}`, emailBody);
        await fetch(`${GMAIL_API}/users/me/messages/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        });
        console.log("Confirmation email sent to", guest_email);
      } catch (emailErr) {
        console.error("Email send failed (booking still created):", emailErr);
      }
    }

    return new Response(JSON.stringify({ success: true, booking, room_url: roomUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("book-meeting error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
