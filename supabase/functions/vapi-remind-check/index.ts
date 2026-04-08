import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEBDESIGN_ASSISTANT_ID = "dc35680f-8763-4702-84d7-e3df267ddaf9";

// PST call windows: 9am, 1pm, 5pm (every 4 hours from 9-7 PST)
const CALL_HOURS_PST = [9, 13, 17];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY");
    const VAPI_PHONE_NUMBER_ID = Deno.env.get("VAPI_PHONE_NUMBER_ID");
    if (!VAPI_API_KEY) throw new Error("VAPI_API_KEY not configured");
    if (!VAPI_PHONE_NUMBER_ID) throw new Error("VAPI_PHONE_NUMBER_ID not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "process_queue";

    // ─── ACTION: enqueue — creates the remind schedule for a lead ───
    if (action === "enqueue") {
      const { customer_id, phone, full_name, business_name } = body;
      if (!customer_id || !phone || !full_name) {
        return new Response(JSON.stringify({ error: "customer_id, phone, full_name required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already active
      const { data: existing } = await sb
        .from("vapi_remind_queue")
        .select("id, status")
        .eq("customer_id", customer_id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "Already has an active remind campaign", id: existing.id }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculate first call slot: next available PST call hour
      const nextSlot = getNextCallSlot();

      const { data: row, error } = await sb.from("vapi_remind_queue").insert({
        customer_id,
        phone,
        full_name,
        business_name: business_name || "",
        next_call_at: nextSlot.toISOString(),
        status: "active",
      }).select("id").single();

      if (error) throw error;

      console.log(`[remind] Enqueued ${full_name} (${phone}), first call at ${nextSlot.toISOString()}`);
      return new Response(JSON.stringify({ success: true, id: row.id, next_call_at: nextSlot.toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: cancel — stops a remind campaign ───
    if (action === "cancel") {
      const { customer_id } = body;
      if (!customer_id) {
        return new Response(JSON.stringify({ error: "customer_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await sb.from("vapi_remind_queue").update({ status: "paused" }).eq("customer_id", customer_id).eq("status", "active");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: process_queue — cron calls this to fire pending calls ───
    const now = new Date();

    // 1. First, check results of previous calls that are still "calling"
    const { data: pendingChecks } = await sb
      .from("vapi_remind_queue")
      .select("*")
      .eq("status", "active")
      .not("last_call_id", "is", null)
      .eq("last_call_result", "calling");

    for (const item of pendingChecks || []) {
      try {
        const callRes = await fetch(`https://api.vapi.ai/call/${item.last_call_id}`, {
          headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
        });
        if (!callRes.ok) continue;

        const call = await callRes.json();
        const status = call.status;
        const endedReason = call.endedReason || "";
        const transcript = call.transcript || call.artifact?.transcript || "";
        const summary = call.summary || call.artifact?.summary || call.analysis?.summary || "";

        // Determine if AI connected (real conversation happened)
        const hasConversation = !!(transcript && transcript.length > 50 && summary);
        const isVoicemail = ["voicemail", "machine-detected"].includes(endedReason);
        const isNoAnswer = ["no-answer", "busy", "customer-did-not-answer", "customer-busy"].includes(endedReason);
        const callFailed = isVoicemail || isNoAnswer || (!hasConversation && status === "ended");

        if (hasConversation && status === "ended") {
          // SUCCESS — AI connected with the user
          await sb.from("vapi_remind_queue").update({
            status: "connected",
            last_call_result: "connected",
            connected_at: new Date().toISOString(),
          }).eq("id", item.id);

          // Update customer meta with connected status
          const { data: cust } = await sb.from("customers").select("meta").eq("id", item.customer_id).maybeSingle();
          await sb.from("customers").update({
            meta: {
              ...((cust?.meta as any) || {}),
              vapi_remind_status: "connected",
              vapi_remind_connected_at: new Date().toISOString(),
              vapi_remind_transcript: transcript,
              vapi_remind_summary: summary,
            },
          }).eq("id", item.customer_id);

          console.log(`[remind] ✅ CONNECTED with ${item.full_name}`);
        } else if (callFailed || status === "ended") {
          // Failed call — schedule next attempt
          const nextSlot = getNextCallSlot();
          const newAttempts = item.attempts + 1;

          if (newAttempts >= item.max_attempts) {
            await sb.from("vapi_remind_queue").update({
              status: "expired",
              last_call_result: endedReason || "max_attempts",
              attempts: newAttempts,
            }).eq("id", item.id);
            console.log(`[remind] ❌ Max attempts for ${item.full_name}`);
          } else {
            await sb.from("vapi_remind_queue").update({
              last_call_result: endedReason || "no_transcript",
              attempts: newAttempts,
              next_call_at: nextSlot.toISOString(),
            }).eq("id", item.id);
            console.log(`[remind] ↩ ${item.full_name}: ${endedReason || "no_transcript"}, next at ${nextSlot.toISOString()}`);
          }
        }
        // If still in-progress, leave as-is
      } catch (err) {
        console.error(`[remind] Error checking call ${item.last_call_id}:`, err);
      }
    }

    // 2. Fire new calls for items where next_call_at <= now
    const { data: dueItems } = await sb
      .from("vapi_remind_queue")
      .select("*")
      .eq("status", "active")
      .lte("next_call_at", now.toISOString())
      .or("last_call_result.is.null,last_call_result.neq.calling")
      .order("next_call_at", { ascending: true })
      .limit(10);

    let callsMade = 0;
    for (const item of dueItems || []) {
      // Normalize phone
      let ph = (item.phone || "").trim().replace(/\D/g, "");
      if (ph.length === 11 && ph.startsWith("1")) ph = ph.slice(1);
      if (ph.length !== 10) {
        console.error(`[remind] Invalid phone for ${item.full_name}: ${item.phone}`);
        await sb.from("vapi_remind_queue").update({ status: "expired", last_call_result: "invalid_phone" }).eq("id", item.id);
        continue;
      }
      const customerNumber = `+1${ph}`;
      const firstName = item.full_name.split(" ")[0];

      try {
        const vapiRes = await fetch("https://api.vapi.ai/call/phone", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${VAPI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assistantId: WEBDESIGN_ASSISTANT_ID,
            assistantOverrides: {
              variableValues: {
                clientName: "Warren Guru Web Design",
                leadName: item.full_name,
                firstName,
                businessName: item.business_name || "their business",
                message: "",
              },
              serverUrl: `${SUPABASE_URL}/functions/v1/vapi-webhook`,
            },
            phoneNumberId: VAPI_PHONE_NUMBER_ID,
            customer: { number: customerNumber },
          }),
        });

        const vapiData = await vapiRes.json();
        if (!vapiRes.ok) {
          console.error(`[remind] Vapi error for ${item.full_name}:`, vapiData);
          continue;
        }

        await sb.from("vapi_remind_queue").update({
          last_call_id: vapiData.id,
          last_call_result: "calling",
        }).eq("id", item.id);

        callsMade++;
        console.log(`[remind] 📞 Called ${firstName} (${customerNumber}), call_id: ${vapiData.id}`);

        // ─── Send follow-up email via Gmail API ───
        try {
          // Look up customer email
          const { data: custData } = await sb
            .from("customers")
            .select("email")
            .eq("id", item.customer_id)
            .maybeSingle();

          const custEmail = custData?.email;
          if (custEmail) {
            const emailSubject = `Following Up - Web Design Services`;
            const emailBody = `
              <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.7;">
                <p>Hi ${firstName},</p>
                <p>
                  I just gave you a call in regards to web design services and wanted to touch base.
                  I'd love to find a good time to follow up and chat about how we can help your business grow online.
                </p>
                <p>
                  Could you let me know a good time to connect and the best contact number to reach you at?
                </p>
                <p>Looking forward to hearing from you!</p>
              </div>
            `;

            const gmailRes = await fetch(
              `${SUPABASE_URL}/functions/v1/gmail-api?action=send`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  apikey: SUPABASE_SERVICE_ROLE_KEY,
                },
                body: JSON.stringify({
                  to: custEmail,
                  subject: emailSubject,
                  body: emailBody,
                }),
              }
            );
            const gmailData = await gmailRes.json();
            if (gmailRes.ok) {
              console.log(`[remind] 📧 Follow-up email sent to ${custEmail} for ${item.full_name}`);
            } else {
              console.error(`[remind] Email send failed for ${item.full_name}:`, gmailData);
            }
          } else {
            console.log(`[remind] No email on file for ${item.full_name}, skipping follow-up email`);
          }
        } catch (emailErr) {
          console.error(`[remind] Email error for ${item.full_name}:`, emailErr);
        }
      } catch (err) {
        console.error(`[remind] Call error for ${item.full_name}:`, err);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      checked: (pendingChecks || []).length,
      calls_made: callsMade,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("vapi-remind-check error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Get next available call slot in PST window (9am, 1pm, 5pm) */
function getNextCallSlot(): Date {
  // Get current time in PST
  const now = new Date();
  const pstFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    pstFormatter.formatToParts(now).filter(p => p.type !== "literal").map(p => [p.type, p.value])
  ) as Record<string, string>;

  const pstHour = Number(parts.hour);
  const pstYear = Number(parts.year);
  const pstMonth = Number(parts.month) - 1;
  const pstDay = Number(parts.day);

  // Find next available hour today
  for (const h of [9, 13, 17]) {
    if (pstHour < h) {
      // Build a Date for this PST hour
      const target = buildPSTDate(pstYear, pstMonth, pstDay, h, 0);
      return target;
    }
  }

  // All today's slots passed — go to 9am tomorrow
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tmParts = Object.fromEntries(
    pstFormatter.formatToParts(tomorrow).filter(p => p.type !== "literal").map(p => [p.type, p.value])
  ) as Record<string, string>;

  return buildPSTDate(Number(tmParts.year), Number(tmParts.month) - 1, Number(tmParts.day), 9, 0);
}

function buildPSTDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Create a UTC date, then adjust for PST offset
  const utcGuess = new Date(Date.UTC(year, month, day, hour, minute, 0));
  // Get PST offset at that moment
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(
    formatter.formatToParts(utcGuess).filter(x => x.type !== "literal").map(x => [x.type, x.value])
  ) as Record<string, string>;
  const zonedMs = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  const offsetMs = zonedMs - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}
