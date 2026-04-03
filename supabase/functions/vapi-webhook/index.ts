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
      if (callId && status) {
        await sb
          .from("lw_landing_leads")
          .update({ vapi_call_status: status === "ended" ? "completed" : status })
          .eq("vapi_call_id", callId);
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

    const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      lines.push(`• Email Captured: ${emailMatch[0]}`);
    }
  }

  return lines.join("\n");
}
