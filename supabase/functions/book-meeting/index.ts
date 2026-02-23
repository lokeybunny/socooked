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

function formatTime12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateNice(d: string): string {
  const date = new Date(`${d}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

async function sendTelegram(msg: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
    });
    console.log("Telegram notification sent");
  } catch (e) {
    console.error("Telegram failed:", e);
  }
}

async function sendEmail(to: string, subject: string, body: string) {
  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson) return;
  try {
    const sa = JSON.parse(saJson);
    const accessToken = await getAccessToken(sa);
    const raw = buildRawEmail(to, subject, body);
    await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    console.log("Email sent to", to);
  } catch (e) {
    console.error("Email failed:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action || "book";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ──────── CANCEL ────────
    if (action === "cancel") {
      const { booking_id } = body;
      if (!booking_id) throw new Error("Missing booking_id");

      const { data: booking, error } = await supabase
        .from("bookings").select("*").eq("id", booking_id).single();
      if (error || !booking) throw new Error("Booking not found");

      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking_id);
      if (booking.meeting_id) {
        await supabase.from("meetings").update({ status: "cancelled" }).eq("id", booking.meeting_id);
      }
      // Remove calendar event
      await supabase.from("calendar_events").delete().eq("source", "booking").eq("source_id", booking_id);

      const fDate = formatDateNice(booking.booking_date);
      const fTime = formatTime12(booking.start_time);

      // Telegram
      await sendTelegram([
        `❌ *Meeting Cancelled*`,
        ``,
        `👤 *Guest:* ${booking.guest_name}`,
        `📧 ${booking.guest_email}`,
        `📆 ${fDate} at ${fTime}`,
      ].join("\n"));

      // Email guest
      await sendEmail(
        booking.guest_email,
        `Meeting Cancelled - ${fDate}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#111;">Meeting Cancelled</h2>
          <p>Hi ${booking.guest_name},</p>
          <p>Unfortunately, your meeting scheduled for <strong>${fDate}</strong> at <strong>${fTime} (PST)</strong> has been cancelled.</p>
          <p>If you'd like to book a new time, please visit:</p>
          <p><a href="${SITE_DOMAIN}/letsmeet" style="color:#2754C5;">${SITE_DOMAIN}/letsmeet</a></p>
          <p>We apologize for any inconvenience.</p>
        </div>`
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──────── RESCHEDULE ────────
    if (action === "reschedule") {
      const { booking_id, new_date, new_time } = body;
      if (!booking_id || !new_date || !new_time) throw new Error("Missing reschedule fields");

      const { data: booking, error } = await supabase
        .from("bookings").select("*").eq("id", booking_id).single();
      if (error || !booking) throw new Error("Booking not found");

      // Calculate new end time
      const [h, m] = new_time.split(":").map(Number);
      const endMin = h * 60 + m + booking.duration_minutes;
      const newEnd = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

      const oldDate = formatDateNice(booking.booking_date);
      const oldTime = formatTime12(booking.start_time);
      const newDateFmt = formatDateNice(new_date);
      const newTimeFmt = formatTime12(new_time);

      // Update booking
      await supabase.from("bookings").update({
        booking_date: new_date,
        start_time: new_time,
        end_time: newEnd,
      }).eq("id", booking_id);

      // Update meeting
      if (booking.meeting_id) {
        await supabase.from("meetings").update({
          scheduled_at: `${new_date}T${new_time}:00`,
        }).eq("id", booking.meeting_id);
      }

      // Update calendar event
      const startDt = `${new_date}T${new_time}:00-08:00`;
      const endDt = `${new_date}T${newEnd}:00-08:00`;
      await supabase.from("calendar_events").update({
        start_time: startDt,
        end_time: endDt,
        title: `Meeting with ${booking.guest_name}`,
      }).eq("source", "booking").eq("source_id", booking_id);

      const roomUrl = booking.room_code ? `${SITE_DOMAIN}/meet/${booking.room_code}` : "";

      // Telegram
      await sendTelegram([
        `🔄 *Meeting Rescheduled*`,
        ``,
        `👤 *Guest:* ${booking.guest_name}`,
        `📧 ${booking.guest_email}`,
        ``,
        `📆 *Was:* ${oldDate} at ${oldTime}`,
        `📆 *Now:* ${newDateFmt} at ${newTimeFmt} (PST)`,
        roomUrl ? `🔗 [Join Meeting](${roomUrl})` : "",
      ].filter(Boolean).join("\n"));

      // Email guest
      await sendEmail(
        booking.guest_email,
        `Meeting Rescheduled - ${newDateFmt} at ${newTimeFmt}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#111;">Meeting Rescheduled 🔄</h2>
          <p>Hi ${booking.guest_name},</p>
          <p>Your meeting has been rescheduled. Here are the updated details:</p>
          <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:6px 0;color:#999;text-decoration:line-through;">Was: ${oldDate} at ${oldTime}</p>
            <p style="margin:6px 0;color:#333;"><strong>📅 New Date:</strong> ${newDateFmt}</p>
            <p style="margin:6px 0;color:#333;"><strong>🕐 New Time:</strong> ${newTimeFmt} (PST)</p>
            <p style="margin:6px 0;color:#333;"><strong>⏱ Duration:</strong> ${booking.duration_minutes} minutes</p>
          </div>
          ${roomUrl ? `<div style="text-align:center;margin:24px 0;">
            <a href="${roomUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Join Meeting</a>
          </div>` : ""}
          <p style="color:#666;font-size:13px;">The same meeting link will still work at the new time.</p>
        </div>`
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──────── BOOK (original flow) ────────
    const { guest_name, guest_email, guest_phone, booking_date, start_time, duration_minutes } = body;

    if (!guest_name || !guest_email || !booking_date || !start_time || !duration_minutes) {
      throw new Error("Missing required fields");
    }

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

    // Telegram notification
    const fmtDate = formatDateNice(booking_date);
    const fmtTime = formatTime12(start_time);
    await sendTelegram([
      `📅 *New Meeting Booked!*`,
      ``,
      `👤 *Guest:* ${guest_name}`,
      `📧 *Email:* ${guest_email}`,
      guest_phone ? `📞 *Phone:* ${guest_phone}` : null,
      `📆 *Date:* ${fmtDate}`,
      `🕐 *Time:* ${fmtTime} (PST)`,
      `⏱ *Duration:* ${duration_minutes} min`,
      `🔗 [Join Meeting](${roomUrl})`,
    ].filter(Boolean).join("\n"));

    // Send confirmation email
    const formattedDate = new Date(`${booking_date}T${start_time}:00`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const formattedTime = new Date(`${booking_date}T${start_time}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    await sendEmail(
      guest_email,
      `Meeting Confirmed - ${formattedDate} at ${formattedTime}`,
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
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
      </div>`
    );

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
