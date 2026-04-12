import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function getGmailAccessToken(sa: any): Promise<string> {
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
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Gmail auth failed: " + JSON.stringify(json));
  return json.access_token;
}

function rfc2047Base64(str: string): string {
  const encoded = btoa(unescape(encodeURIComponent(str)));
  return `=?UTF-8?B?${encoded}?=`;
}

async function sendGmailNotification(
  recipientEmail: string,
  subject: string,
  htmlBody: string,
) {
  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson) { console.error("No GOOGLE_SERVICE_ACCOUNT_JSON"); return; }
  const sa = JSON.parse(saJson);
  const accessToken = await getGmailAccessToken(sa);

  const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");
  const rawMessage = [
    `From: Warren Guru <${IMPERSONATE_EMAIL}>`,
    `To: ${recipientEmail}`,
    `Subject: ${rfc2047Base64(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    htmlBody.replace(/<[^>]+>/g, ""),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gmail send failed:", res.status, errText);
  } else {
    console.log("Lead notification email sent to", recipientEmail);
  }
}

function buildLeadEmailHtml(lead: any, landingPage: any, aiConnected: boolean): string {
  const accentColor = landingPage?.accent_color || "#10b981";
  const clientName = landingPage?.client_name || "Your Brand";

  const aiSection = aiConnected && lead.ai_notes
    ? `
      <div style="background:#f0fdf4;border-left:4px solid ${accentColor};padding:16px;margin:16px 0;border-radius:4px;">
        <h3 style="margin:0 0 8px;color:#065f46;font-size:16px;">✅ AI Agent Call Notes</h3>
        <pre style="margin:0;white-space:pre-wrap;font-family:inherit;color:#1f2937;font-size:14px;line-height:1.6;">${escapeHtml(lead.ai_notes)}</pre>
      </div>`
    : `
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;margin:16px 0;border-radius:4px;">
        <h3 style="margin:0 0 8px;color:#92400e;font-size:16px;">⚠️ AI Agent Did Not Connect</h3>
        <p style="margin:0;color:#78350f;font-size:14px;">The AI voice agent was unable to reach this seller. Please follow up manually as soon as possible.</p>
      </div>`;

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#000;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;">🏠 New Seller Lead — ${escapeHtml(clientName)}</h1>
    </div>
    <div style="padding:24px 32px;">
      <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">Lead Details</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Name</td><td style="padding:8px 0;color:#111827;font-weight:600;">${escapeHtml(lead.full_name)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Phone</td><td style="padding:8px 0;color:#111827;font-weight:600;">${escapeHtml(lead.phone)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Property Address</td><td style="padding:8px 0;color:#111827;font-weight:600;">${escapeHtml(lead.property_address)}</td></tr>
        ${lead.email ? `<tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;color:#111827;">${escapeHtml(lead.email)}</td></tr>` : ""}
        ${lead.asking_price ? `<tr><td style="padding:8px 0;color:#6b7280;">Asking Price</td><td style="padding:8px 0;color:#111827;">$${Number(lead.asking_price).toLocaleString()}</td></tr>` : ""}
        ${lead.motivation ? `<tr><td style="padding:8px 0;color:#6b7280;">Motivation</td><td style="padding:8px 0;color:#111827;">${escapeHtml(lead.motivation)}</td></tr>` : ""}
        ${lead.timeline ? `<tr><td style="padding:8px 0;color:#6b7280;">Timeline</td><td style="padding:8px 0;color:#111827;">${escapeHtml(lead.timeline)}</td></tr>` : ""}
        ${lead.property_condition ? `<tr><td style="padding:8px 0;color:#6b7280;">Condition</td><td style="padding:8px 0;color:#111827;">${escapeHtml(lead.property_condition)}</td></tr>` : ""}
        ${lead.lead_score ? `<tr><td style="padding:8px 0;color:#6b7280;">Lead Score</td><td style="padding:8px 0;color:#111827;font-weight:600;">${lead.lead_score}/100</td></tr>` : ""}
      </table>

      ${aiSection}

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">Submitted at ${new Date(lead.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
        <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">Powered by Warren Guru — Automated Wholesale Pipeline</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    const { message } = payload;

    console.log("Vapi webhook event:", message?.type, "call:", message?.call?.id);

    // ─── Handle function-call: check_availability ───
    if (message?.type === "function-call" || message?.type === "tool-calls") {
      const toolCall = message?.toolCallList?.[0]
        || message?.toolWithToolCallList?.[0]?.toolCall
        || message?.toolCalls?.[0]
        || null;
      const functionCall = message?.functionCall
        || toolCall?.function
        || (toolCall?.name ? toolCall : null);
      const toolCallId = toolCall?.id;
      const fnName = functionCall?.name;
      const rawParams = functionCall?.parameters || functionCall?.arguments;
      console.log("[vapi-webhook] Function call:", fnName, JSON.stringify(rawParams));

      if (fnName === "check_availability") {
        const params = typeof rawParams === "string"
          ? JSON.parse(rawParams)
          : (rawParams || {});
        const requestedDate = params.date; // e.g. "2026-04-15"
        const requestedTime = params.time; // e.g. "8:40 AM" or "08:40"

        // Blocked slots in PST
        const BLOCKED_SLOTS = [
          { startH: 8, startM: 0, endH: 10, endM: 0, label: "8:00 AM - 10:00 AM" },
          { startH: 14, startM: 30, endH: 15, endM: 30, label: "2:30 PM - 3:30 PM" },
        ];

        // Parse requested time to PST minutes
        let reqHour = 0, reqMin = 0;
        if (requestedTime) {
          const tMatch = requestedTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
          if (tMatch) {
            reqHour = parseInt(tMatch[1]);
            reqMin = tMatch[2] ? parseInt(tMatch[2]) : 0;
            const period = (tMatch[3] || "").replace(/\./g, "").toLowerCase();
            if (period === "pm" && reqHour < 12) reqHour += 12;
            if (period === "am" && reqHour === 12) reqHour = 0;
          }
        }

        const reqTimeMin = reqHour * 60 + reqMin;
        const sessionDuration = 120; // 2 hours default
        const reqEndMin = reqTimeMin + sessionDuration;

        // Check against blocked slots
        const blockedConflict = BLOCKED_SLOTS.find(slot => {
          const slotStart = slot.startH * 60 + slot.startM;
          const slotEnd = slot.endH * 60 + slot.endM;
          return reqTimeMin < slotEnd && reqEndMin > slotStart;
        });

        // Check against existing calendar events for that date
        let calendarConflict = false;
        let calendarConflictInfo = "";
        if (requestedDate) {
          // Convert requested PST time to UTC for DB query
          const pstToUtcOffset = 7; // PST = UTC-7 (PDT), UTC-8 (PST)
          const startUtc = new Date(`${requestedDate}T${String(reqHour).padStart(2,"0")}:${String(reqMin).padStart(2,"0")}:00`);
          startUtc.setHours(startUtc.getHours() + pstToUtcOffset);
          const endUtc = new Date(startUtc.getTime() + sessionDuration * 60 * 1000);

          const { data: conflicts } = await sb
            .from("calendar_events")
            .select("id, title, start_time, end_time")
            .lt("start_time", endUtc.toISOString())
            .gt("end_time", startUtc.toISOString());

          if (conflicts && conflicts.length > 0) {
            calendarConflict = true;
            calendarConflictInfo = conflicts.map(c => c.title).join(", ");
          }
        }

        let resultMessage: string;
        let available = true;

        if (blockedConflict) {
          available = false;
          resultMessage = `That time is NOT available. The ${blockedConflict.label} PST window is blocked every day. Please suggest a different time outside of 8:00-10:00 AM and 2:30-3:30 PM PST.`;
        } else if (calendarConflict) {
          available = false;
          resultMessage = `That time is NOT available — there is already a booking at that time. Please suggest a different time.`;
        } else {
          resultMessage = `That time is available! You can confirm the booking for ${requestedTime || "the requested time"} on ${requestedDate || "the requested date"}.`;
        }

        console.log(`[vapi-webhook] Availability check: date=${requestedDate}, time=${requestedTime}, available=${available}`);

        // Respond in the format Vapi expects
        const responsePayload = message?.type === "tool-calls"
          ? {
            results: [{
              name: fnName,
              toolCallId,
              result: JSON.stringify({ available, message: resultMessage }),
            }],
          }
          : { result: JSON.stringify({ available, message: resultMessage }) };

        return new Response(JSON.stringify(responsePayload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Default: return empty result for unknown function calls
      const defaultResponse = message?.type === "tool-calls"
        ? {
          results: [{
            name: fnName || "unknown_function",
            toolCallId,
            result: JSON.stringify({ error: "Unknown function" }),
          }],
        }
        : { result: JSON.stringify({ error: "Unknown function" }) };
      return new Response(JSON.stringify(defaultResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle end-of-call report
    if (message?.type === "end-of-call-report") {
      const callId = message.call?.id;
      if (!callId) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the lead by vapi_call_id — try lw_landing_leads first, then customers
      const { data: lead } = await sb
        .from("lw_landing_leads")
        .select("*")
        .eq("vapi_call_id", callId)
        .single();

      // Fallback: check customers table (videography/webdesign funnel leads)
      let customerLead: any = null;
      if (!lead) {
        const { data: custRow } = await sb
          .from("customers")
          .select("*")
          .filter("meta->>vapi_call_id", "eq", callId)
          .single();
        customerLead = custRow;
      }

      if (!lead && !customerLead) {
        console.log("No lead found for call:", callId);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If it's a customer-table lead, handle separately
      if (customerLead) {
        const transcript = message.transcript || "";
        const summary = message.summary || "";
        const recordingUrl = message.recordingUrl || null;
        const endedReason = message.endedReason || "unknown";
        let duration = message.call?.duration || message.duration || 0;
        if (!duration && message.startedAt && message.endedAt) {
          duration = (new Date(message.endedAt).getTime() - new Date(message.startedAt).getTime()) / 1000;
        }
        if (!duration && message.call?.startedAt && message.call?.endedAt) {
          duration = (new Date(message.call.endedAt).getTime() - new Date(message.call.startedAt).getTime()) / 1000;
        }

        const hasContent = !!(transcript?.trim() || summary?.trim());
        const callFailed = !hasContent && ([
          "assistant-error", "no-answer", "busy", "voicemail",
          "machine-detected", "customer-did-not-answer", "customer-busy",
          "silence-timed-out",
        ].includes(endedReason) || duration < 15);

        const aiNotes = callFailed
          ? `AI Agent could not connect.\n• Reason: ${endedReason.replace(/-/g, " ")}\n• Duration: ${Math.round(duration)}s`
          : buildAINotes(transcript, summary, endedReason, duration, recordingUrl);

        const existingMeta = (customerLead.meta as any) || {};
        await sb
          .from("customers")
          .update({
            meta: {
              ...existingMeta,
              vapi_call_status: callFailed ? "no_answer" : "completed",
              vapi_transcript: transcript,
              vapi_summary: summary,
              vapi_recording_url: recordingUrl,
              vapi_ended_reason: endedReason,
              vapi_duration_seconds: duration,
              vapi_ai_notes: aiNotes,
            },
            notes: (customerLead.notes || "") + "\n\n" + aiNotes,
          })
          .eq("id", customerLead.id);

        console.log(`[vapi-webhook] Updated customer ${customerLead.id} with call results`);

        // ─── Videography: Auto-create tentative calendar booking ───
        const isVideography = customerLead.source === "videography-landing" ||
          ((customerLead.tags as string[]) || []).includes("videography");
        const assistantId = message.call?.assistantId || message.call?.assistant?.id || "";
        const VIDEOGRAPHY_ASSISTANT_ID = "0045f12e-56e2-4245-971b-1f7dd2069282";

        if (isVideography && !callFailed && (assistantId === VIDEOGRAPHY_ASSISTANT_ID || isVideography)) {
          try {
            const scheduledDate = extractScheduleFromTranscript(transcript, summary);
            if (scheduledDate) {
              // Check for conflicts with existing calendar events
              const eventStart = new Date(scheduledDate);
              const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000); // 2-hour block

              // ── Check blocked time slots (PST): 8-10AM and 2:30-3:30PM ──
              const pstOffset = -8; // PST is UTC-8 (ignore DST for simplicity)
              const pstHour = (eventStart.getUTCHours() + pstOffset + 24) % 24;
              const pstMin = eventStart.getUTCMinutes();
              const pstTime = pstHour + pstMin / 60;
              const endPstHour = (eventEnd.getUTCHours() + pstOffset + 24) % 24;
              const endPstTime = endPstHour + eventEnd.getUTCMinutes() / 60;
              const blockedSlots = [
                { start: 8, end: 10, label: "8:00 AM - 10:00 AM PST" },
                { start: 14.5, end: 15.5, label: "2:30 PM - 3:30 PM PST" },
              ];
              const hitsBlockedSlot = blockedSlots.some(slot =>
                (pstTime < slot.end && endPstTime > slot.start)
              );

              const { data: conflicts } = await sb
                .from("calendar_events")
                .select("id, title, start_time, end_time")
                .lt("start_time", eventEnd.toISOString())
                .gt("end_time", eventStart.toISOString());

              const hasConflict = (conflicts && conflicts.length > 0) || hitsBlockedSlot;
              const conflictReason = hitsBlockedSlot
                ? `Blocked time slot (${blockedSlots.find(s => pstTime < s.end && endPstTime > s.start)?.label || "blocked"})`
                : "";

              // Create tentative calendar event in videography-hub calendar
              const eventTitle = `📹 ${hasConflict ? "⚠️ CONFLICT — " : ""}Videography: ${customerLead.full_name}`;
              await sb.from("calendar_events").insert({
                title: eventTitle,
                description: `Tentative videography booking from AI call.\n\nClient: ${customerLead.full_name}\nPhone: ${customerLead.phone || "N/A"}\nEmail: ${customerLead.email || "N/A"}\n\n${hasConflict ? `⚠️ CONFLICT: ${hitsBlockedSlot ? conflictReason : "Another event exists at this time."}. Review needed.` : "No conflicts detected."}\n\nAI Notes:\n${aiNotes}`,
                start_time: eventStart.toISOString(),
                end_time: eventEnd.toISOString(),
                category: "videography",
                source: "vapi-ai",
                source_id: callId,
                customer_id: customerLead.id,
                color: hasConflict ? "#ef4444" : "#8b5cf6",
                location: "TBD — confirm with client",
              });
              console.log(`[vapi-webhook] Created tentative videography booking for ${customerLead.full_name} at ${eventStart.toISOString()}, conflict: ${hasConflict}, blockedSlot: ${hitsBlockedSlot}`);

              // If conflict, send notifications
              if (hasConflict) {
                const conflictDetails = (conflicts || []).map(c =>
                  `• ${c.title} (${new Date(c.start_time).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })})`
                ).join("\n");

                // 1. Email notification
                const conflictEmailHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
  <h2 style="color:#ef4444;">⚠️ Videography Booking Conflict</h2>
  <p>A new tentative videography booking has been created from an AI call, but it <strong>conflicts</strong> with existing events.</p>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="margin:0;font-weight:600;">New Booking:</p>
    <p style="margin:4px 0;">Client: ${escapeHtml(customerLead.full_name)}</p>
    <p style="margin:4px 0;">Phone: ${escapeHtml(customerLead.phone || "N/A")}</p>
    <p style="margin:4px 0;">Time: ${eventStart.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT</p>
  </div>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="margin:0;font-weight:600;">Conflicting Events:</p>
    <pre style="margin:8px 0 0;white-space:pre-wrap;font-family:inherit;">${escapeHtml(conflictDetails)}</pre>
  </div>
  <p>Please review and resolve in the <a href="https://socooked.lovable.app/calendar" style="color:#2563eb;">Calendar</a>.</p>
</div>`;
                try {
                  await sendGmailNotification("warren@stu25.com", "⚠️ Videography Booking Conflict — " + customerLead.full_name, conflictEmailHtml);
                } catch (e) { console.error("[vapi-webhook] Conflict email failed:", e); }

                // 2. Telegram notification
                try {
                  await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
                      "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
                    },
                    body: JSON.stringify({
                      entity_type: "videography_booking",
                      action: "conflict",
                      meta: {
                        message: `⚠️ *VIDEOGRAPHY BOOKING CONFLICT*\n\n📹 Client: *${customerLead.full_name}*\n📞 ${customerLead.phone || "N/A"}\n🕐 ${eventStart.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT\n\n❌ Conflicts with:\n${conflictDetails}\n\nReview in Calendar.`,
                      },
                    }),
                  });
                } catch (e) { console.error("[vapi-webhook] Conflict telegram failed:", e); }

                // 3. CRM notification (activity_log)
                await sb.from("activity_log").insert({
                  entity_type: "videography_booking",
                  entity_id: customerLead.id,
                  action: "conflict",
                  meta: {
                    name: `Booking conflict: ${customerLead.full_name}`,
                    message: `Tentative booking at ${eventStart.toISOString()} conflicts with ${conflicts?.length} existing event(s).`,
                  },
                });
              }

              // Update customer meta with booking info
              await sb.from("customers").update({
                meta: {
                  ...existingMeta,
                  vapi_call_status: "completed",
                  vapi_transcript: transcript,
                  vapi_summary: summary,
                  vapi_recording_url: recordingUrl,
                  vapi_ended_reason: endedReason,
                  vapi_duration_seconds: duration,
                  vapi_ai_notes: aiNotes,
                  videography_tentative_date: eventStart.toISOString(),
                  videography_booking_conflict: hasConflict,
                },
              }).eq("id", customerLead.id);
            }
          } catch (bookingErr) {
            console.error("[vapi-webhook] Videography booking creation failed:", bookingErr);
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract transcript and summary
      const transcript = message.transcript || "";
      const summary = message.summary || "";
      const recordingUrl = message.recordingUrl || null;
      const endedReason = message.endedReason || "unknown";
      // Compute duration: prefer explicit field, fall back to timestamp diff
      let duration = message.call?.duration || message.duration || 0;
      if (!duration && message.startedAt && message.endedAt) {
        duration = (new Date(message.endedAt).getTime() - new Date(message.startedAt).getTime()) / 1000;
      }
      if (!duration && message.call?.startedAt && message.call?.endedAt) {
        duration = (new Date(message.call.endedAt).getTime() - new Date(message.call.startedAt).getTime()) / 1000;
      }

      // ─── Calculate call cost and deduct from credits ───
      const costBreakdown = message.cost ?? message.costBreakdown?.total ?? 0;
      const callCostCents = Math.round((typeof costBreakdown === 'number' ? costBreakdown : 0) * 100);

      if (lead.landing_page_id && callCostCents > 0) {
        // Fetch current balance
        const { data: pageData } = await sb
          .from("lw_landing_pages")
          .select("vapi_credit_balance_cents, vapi_total_spent_cents, email, client_name")
          .eq("id", lead.landing_page_id)
          .single();

        if (pageData) {
          const newBalance = Math.max(0, (pageData.vapi_credit_balance_cents || 0) - callCostCents);
          const newSpent = (pageData.vapi_total_spent_cents || 0) + callCostCents;

          await sb
            .from("lw_landing_pages")
            .update({
              vapi_credit_balance_cents: newBalance,
              vapi_total_spent_cents: newSpent,
            })
            .eq("id", lead.landing_page_id);

          console.log(`[vapi-webhook] Deducted ${callCostCents}¢ from page ${lead.landing_page_id}. Balance: ${newBalance}¢`);

          // If credit exhausted, send notification email
          if (newBalance <= 0 && pageData.email) {
            const creditExhaustedHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <h2 style="color: #dc2626;">⚠️ Phone Credits Exhausted</h2>
  <p>Hi ${(pageData.client_name || 'there').split(' ')[0]},</p>
  <p>Your <strong>$20.00</strong> phone credit balance has been fully used. As a result, <strong>new leads from your landing page will no longer receive automated AI callbacks</strong> until more credits are added.</p>
  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 0; font-weight: 600; color: #991b1b;">Total Spent: $${(newSpent / 100).toFixed(2)}</p>
    <p style="margin: 4px 0 0; color: #991b1b;">Remaining Balance: $0.00</p>
  </div>
  <p>To continue receiving AI-powered callbacks for your leads, please reach out to Warren to add more credits to your account.</p>
  <p>You can still view all your leads in your <a href="https://socooked.lovable.app/client-login" style="color: #2563eb;">Client Dashboard</a>.</p>
  <br/>
  <p>Best regards,</p>
  <p><strong>Warren A Thompson</strong><br/>
  STU25 — Web &amp; Social Media Services<br/>
  <a href="mailto:warren@stu25.com">warren@stu25.com</a></p>
</div>`;

            try {
              await sendGmailNotification(
                pageData.email,
                '⚠️ Phone Credits Exhausted — Action Required',
                creditExhaustedHtml,
              );
              console.log(`[vapi-webhook] Credit exhaustion email sent to ${pageData.email}`);
            } catch (emailErr) {
              console.error("[vapi-webhook] Failed to send credit exhaustion email:", emailErr);
            }
          }
        }
      }

      // Determine if AI actually connected with the seller
      // If we have transcript or summary content, treat it as a connected call
      // even when the duration is short or the ended reason is ambiguous.
      const hasContent = !!(transcript?.trim() || summary?.trim());
      const callFailed = !hasContent && ([
        "assistant-error", "no-answer", "busy", "voicemail",
        "machine-detected", "customer-did-not-answer", "customer-busy",
        "silence-timed-out",
      ].includes(endedReason) || duration < 15);

      // Build AI notes from the conversation
      const aiNotes = callFailed
        ? `AI Agent could not connect.\n• Reason: ${endedReason.replace(/-/g, " ")}\n• Duration: ${Math.round(duration)}s`
        : buildAINotes(transcript, summary, endedReason, duration, recordingUrl);

      // Track retry count from existing meta
      const prevRetryCount = (lead.meta as any)?.vapi_retry_count ?? 0;

      // Update lead with call results + retry count
      const newRetryCount = callFailed ? prevRetryCount : prevRetryCount;
      await sb
        .from("lw_landing_leads")
        .update({
          vapi_call_status: callFailed ? "no_answer" : "completed",
          ai_notes: aiNotes,
          vapi_recording_url: recordingUrl,
          meta: {
            ...(lead.meta as any),
            vapi_transcript: transcript,
            vapi_summary: summary,
            vapi_recording_url: recordingUrl,
            vapi_ended_reason: endedReason,
            vapi_duration_seconds: duration,
            vapi_cost_cents: callCostCents,
            vapi_retry_count: callFailed ? prevRetryCount + 1 : prevRetryCount,
            vapi_last_retry_at: callFailed ? new Date().toISOString() : (lead.meta as any)?.vapi_last_retry_at,
          },
        })
        .eq("id", lead.id);

      // ─── Auto-retry: if call failed and we haven't retried twice yet, call again ───
      // Retry immediately — Vapi will call back, and the next end-of-call-report
      // will increment retry_count again. Max 2 retries (3 total attempts).
      if (callFailed && prevRetryCount < 2) {
        console.log(`[vapi-webhook] Call failed (${endedReason}), triggering retry #${prevRetryCount + 1} for lead ${lead.id}`);

        try {
          const retryRes = await fetch(`${SUPABASE_URL}/functions/v1/vapi-outbound`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
              "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
            },
            body: JSON.stringify({
              action: "trigger_call",
              lead_id: lead.id,
            }),
          });
          const retryData = await retryRes.json();
          console.log(`[vapi-webhook] Retry #${prevRetryCount + 1} result:`, retryData);
        } catch (retryErr) {
          console.error(`[vapi-webhook] Retry #${prevRetryCount + 1} failed:`, retryErr);
        }
      }

      console.log("Updated lead", lead.id, "with AI notes");

      // --- Send email notification to landing page owner ---
      // Only send email if call succeeded OR if all retries are exhausted (no more retries coming)
      const willRetry = callFailed && prevRetryCount < 2;
      if (lead.landing_page_id && !willRetry) {
        const { data: landingPage } = await sb
          .from("lw_landing_pages")
          .select("client_name, email, phone, accent_color, slug")
          .eq("id", lead.landing_page_id)
          .single();

        if (landingPage?.email) {
          const updatedLead = { ...lead, ai_notes: aiNotes };
          const retryNote = callFailed && prevRetryCount >= 2 ? ` (after ${prevRetryCount + 1} attempts)` : "";
          const subject = callFailed
            ? `🏠 New Lead: ${lead.full_name} — AI Agent Did Not Connect${retryNote}`
            : `🏠 New Lead: ${lead.full_name} — AI Call Completed`;
          const html = buildLeadEmailHtml(updatedLead, landingPage, !callFailed);

          try {
            await sendGmailNotification(landingPage.email, subject, html);
          } catch (emailErr) {
            console.error("Failed to send lead notification email:", emailErr);
          }
        } else {
          console.log("No email on landing page for lead", lead.id);
        }
      }
    }

    // Handle status updates
    if (message?.type === "status-update") {
      const callId = message.call?.id;
      const status = message.status;
      const assistantId = message.call?.assistantId || message.call?.assistant?.id || "";

      // ─── Assistant-to-funnel mapping ───
      const WEB_ASSISTANT_ID = "fea7fb27-2311-4f42-9bc1-d6e6fa966ab8";
      const VIDEO_ASSISTANT_ID = "29ca9037-ff4c-4d56-a9c7-6c5bc1ab1b38";

      if (callId && status) {
        // Determine mapped call status
        const mappedStatus = status === "in-progress" ? "in_call" : status === "ended" ? "completed" : status;

        // Try lw_landing_leads first
        const { data: llLead } = await sb
          .from("lw_landing_leads")
          .update({ vapi_call_status: mappedStatus })
          .eq("vapi_call_id", callId)
          .select("id")
          .maybeSingle();

        // Fallback to customers table
        if (!llLead) {
          const { data: custRow } = await sb
            .from("customers")
            .select("id, meta, source")
            .filter("meta->>vapi_call_id", "eq", callId)
            .maybeSingle();

          if (custRow) {
            await sb.from("customers").update({
              meta: {
                ...((custRow.meta as any) || {}),
                vapi_call_status: mappedStatus,
              },
            }).eq("id", custRow.id);
          }
        }

        // ─── Direct-dial Vapi calls: route to correct funnel as "IN CALL" ───
        if (status === "in-progress" && (assistantId === WEB_ASSISTANT_ID || assistantId === VIDEO_ASSISTANT_ID)) {
          const customerPhone = message.call?.customer?.number || "";
          const isWeb = assistantId === WEB_ASSISTANT_ID;
          const funnelSource = isWeb ? "webdesign-landing" : "videography-landing";
          const funnelCategory = isWeb ? "web_design" : "videography";
          const funnelTag = isWeb ? "web_direct_call" : "video_direct_call";

          console.log(`[vapi-webhook] Direct-dial IN CALL detected: assistant=${isWeb ? "web" : "video"}, phone=${customerPhone}, callId=${callId}`);

          // Check if a customer already exists with this call ID
          const { data: existingByCall } = await sb
            .from("customers")
            .select("id")
            .filter("meta->>vapi_call_id", "eq", callId)
            .maybeSingle();

          if (!existingByCall) {
            // Create a new lead record for this direct call
            const cleanPhone = customerPhone.replace(/^\+1/, "");
            await sb.from("customers").insert({
              full_name: `Direct Caller (${cleanPhone || "Unknown"})`,
              phone: cleanPhone || null,
              source: funnelSource,
              category: funnelCategory,
              status: "lead",
              tags: [funnelTag, "in_call", "vapi_direct"],
              meta: {
                vapi_call_id: callId,
                vapi_call_status: "in_call",
                vapi_assistant_id: assistantId,
                vapi_direct_dial: true,
                vapi_call_started_at: new Date().toISOString(),
              },
            });
            console.log(`[vapi-webhook] Created ${funnelCategory} direct-call lead for ${cleanPhone}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("vapi-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildAINotes(
  transcript: string,
  summary: string,
  endedReason: string,
  duration: number,
  recordingUrl: string | null
): string {
  const lines: string[] = [];
  lines.push("AI Notes:");
  lines.push("");

  if (summary) {
    lines.push("• Call Summary: " + summary);
  }

  lines.push(`• Call Duration: ${Math.round(duration)}s`);
  lines.push(`• Call Outcome: ${endedReason.replace(/-/g, " ")}`);

  if (recordingUrl) {
    lines.push(`• Recording: ${recordingUrl}`);
  }

  if (transcript) {
    // ─── Videography-specific extraction ───
    const lcTranscript = transcript.toLowerCase();
    const isVideographyCall = lcTranscript.includes("livestream") || lcTranscript.includes("live stream") ||
      lcTranscript.includes("vivian") || lcTranscript.includes("videography") ||
      lcTranscript.includes("funeral") || lcTranscript.includes("memorial") || lcTranscript.includes("graveside");

    if (isVideographyCall) {
      // Extract service type
      const serviceTypes = ["funeral", "memorial", "graveside", "multiple locations", "celebration of life", "viewing", "wake", "repast"];
      const foundTypes = serviceTypes.filter(t => lcTranscript.includes(t));
      if (foundTypes.length) lines.push(`• Service Type: ${foundTypes.join(", ")}`);

      // Extract duration mentioned
      const durMatch = transcript.match(/(?:about\s*)?(\w+)\s*hours?/i);
      if (durMatch) lines.push(`• Estimated Duration: ${durMatch[0].trim()}`);

      // Extract address from transcript (look for patterns near "address" or "held" or "location")
      const addrMatch = transcript.match(/(?:address|held|location)[^.]*?(\d+\s+[\w\s]+(?:lane|street|drive|road|ave|avenue|blvd|boulevard|way|court|ct|pl|place|circle|cir|parkway|pkwy|trail|trl))/i);
      if (addrMatch) lines.push(`• Venue Address: ${addrMatch[1].trim()}`);

      // Extract funeral home / org name
      const orgMatch = transcript.match(/(?:funeral\s*home|organization)[^.]*?(?:is\s*|name\s*(?:is\s*)?)?([A-Z][\w\s]+?)(?:\.|$)/m);
      if (orgMatch) lines.push(`• Organization: ${orgMatch[1].trim()}`);

      // Extract contact name
      const contactMatch = transcript.match(/(?:this\s*is\s*(?:me,?\s*)?|my\s*name\s*is\s*|name\s*is\s*)([A-Z][a-z]+\s+[A-Z][a-z]+)/);
      if (contactMatch) lines.push(`• Contact Name: ${contactMatch[1].trim()}`);

      // Recording requested?
      if (lcTranscript.includes("recorded") || lcTranscript.includes("recording")) {
        const wantsRecording = /(?:would you like|want).*record.*?\b(yes|sure|yeah|please|absolutely)/i.test(transcript) ||
          /(?:yes|sure)\b.*record/i.test(transcript);
        if (wantsRecording) lines.push(`• Recording Requested: Yes`);
      }

      // Private viewing link
      if (lcTranscript.includes("private viewing link") || lcTranscript.includes("private link")) {
        const wantsPrivate = /private\s*(?:viewing\s*)?link.*?\b(yes|sure|yeah|please)/i.test(transcript);
        lines.push(`• Private Viewing Link: ${wantsPrivate ? "Yes" : "No"}`);
      }
    } else {
      // ─── Real estate extraction (existing) ───
      const conditionPatterns = [
        { pattern: /(?:major|significant)\s*repair/i, value: "Major repairs needed" },
        { pattern: /needs?\s*(?:some\s*)?work/i, value: "Needs work" },
        { pattern: /(?:fair|okay|decent)\s*(?:condition|shape)/i, value: "Fair condition" },
        { pattern: /(?:good|great|excellent)\s*(?:condition|shape)/i, value: "Good condition" },
      ];
      for (const { pattern, value } of conditionPatterns) {
        if (pattern.test(transcript)) {
          lines.push(`• Property Condition: ${value}`);
          break;
        }
      }

      const timelinePatterns = [
        { pattern: /asap|as\s*soon\s*as\s*possible|right\s*away|immediately/i, value: "ASAP" },
        { pattern: /(?:1|one|two|2|three|3)\s*(?:to\s*(?:3|three))?\s*months?/i, value: "1-3 months" },
        { pattern: /flexible|no\s*rush|whenever/i, value: "Flexible" },
        { pattern: /just\s*(?:looking|exploring|curious)/i, value: "Just exploring" },
      ];
      for (const { pattern, value } of timelinePatterns) {
        if (pattern.test(transcript)) {
          lines.push(`• Selling Timeline: ${value}`);
          break;
        }
      }

      const motivationPatterns = [
        { pattern: /downsize|downsizing/i, value: "Downsizing" },
        { pattern: /relocat|moving/i, value: "Relocation" },
        { pattern: /financ|behind\s*on\s*payment|foreclosure/i, value: "Financial hardship" },
        { pattern: /inherit/i, value: "Inherited property" },
        { pattern: /divorce|separat/i, value: "Divorce/Separation" },
      ];
      for (const { pattern, value } of motivationPatterns) {
        if (pattern.test(transcript)) {
          lines.push(`• Motivation: ${value}`);
          break;
        }
      }

      const priceMatch = transcript.match(/\$[\d,]+(?:\.\d{2})?|\b(\d{2,3})\s*(?:thousand|k)\b/i);
      if (priceMatch) {
        lines.push(`• Price Mentioned: ${priceMatch[0]}`);
      }
    }

    const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      lines.push(`• Email Captured: ${emailMatch[0]}`);
    }
  }

  return lines.join("\n");
}

/**
 * Extract a scheduled date/time from transcript and summary text.
 * Looks for common date patterns mentioned during the call.
 * Returns an ISO date string or null if no schedule found.
 */
function extractScheduleFromTranscript(transcript: string, summary: string): string | null {
  const text = `${summary}\n${transcript}`.toLowerCase();

  // Pattern: explicit date like "January 15th", "March 3", "12/25", "2026-04-10"
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const monthAbbr = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

  // Try "Month Day" pattern
  const monthDayMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  );

  let dateStr: string | null = null;

  if (monthDayMatch) {
    const mName = monthDayMatch[1];
    const day = parseInt(monthDayMatch[2]);
    const mIdx = months.indexOf(mName) !== -1 ? months.indexOf(mName) : monthAbbr.indexOf(mName);
    if (mIdx !== -1 && day >= 1 && day <= 31) {
      const now = new Date();
      let year = now.getFullYear();
      const candidate = new Date(year, mIdx, day);
      if (candidate < now) candidate.setFullYear(year + 1);
      dateStr = candidate.toISOString().split("T")[0];
    }
  }

  // Try MM/DD or MM-DD pattern
  if (!dateStr) {
    const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (slashMatch) {
      const m = parseInt(slashMatch[1]);
      const d = parseInt(slashMatch[2]);
      let y = slashMatch[3] ? parseInt(slashMatch[3]) : new Date().getFullYear();
      if (y < 100) y += 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const candidate = new Date(y, m - 1, d);
        if (candidate < new Date()) candidate.setFullYear(candidate.getFullYear() + 1);
        dateStr = candidate.toISOString().split("T")[0];
      }
    }
  }

  // Try relative dates: "this saturday", "next monday", "tomorrow", etc.
  if (!dateStr) {
    const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const relMatch = text.match(/\b(?:this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (relMatch) {
      const targetDay = days.indexOf(relMatch[1]);
      const now = new Date();
      const currentDay = now.getDay();
      let daysAhead = targetDay - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      if (text.includes("next") && daysAhead <= 7) daysAhead += 7;
      const target = new Date(now);
      target.setDate(target.getDate() + daysAhead);
      dateStr = target.toISOString().split("T")[0];
    }
  }

  if (!dateStr) {
    if (text.includes("tomorrow")) {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      dateStr = t.toISOString().split("T")[0];
    }
  }

  if (!dateStr) return null;

  // Try to extract time
  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/);
  let hours = 10; // default 10am
  let minutes = 0;
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3].replace(/\./g, "");
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
  }

  // Build date in Pacific time (approximate — set to UTC-7)
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, hours + 7, minutes));
  return utcDate.toISOString();
}
