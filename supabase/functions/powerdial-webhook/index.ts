import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, serviceKey);

const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
const VAPI_PHONE_NUMBER_ID = Deno.env.get("VAPI_PHONE_NUMBER_ID") || "";
const FALLBACK_VAPI_ASSISTANT = "fea7fb27-2311-4f42-9bc1-d6e6fa966ab8";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;

function twimlResponse(xml: string) {
  return new Response(xml, {
    headers: { ...CORS, "Content-Type": "text/xml" },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalizePhone(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+")) return raw;
  return `+${digits}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Fetch the E.164 phone number associated with a Vapi phoneNumberId */
async function getVapiPhoneNumber(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null;
  try {
    const resp = await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      // Vapi returns the number in data.number (E.164)
      return data.number || data.phoneNumber || null;
    }
    const errText = await resp.text();
    console.error("[powerdial-webhook] Vapi phone lookup error:", errText);
    return null;
  } catch (err) {
    console.error("[powerdial-webhook] Vapi phone lookup exception:", err);
    return null;
  }
}

/** Update a live Twilio call with new TwiML to transfer to Vapi */
async function redirectCallToVapi(callSid: string, vapiPhoneNumber: string, assistantId: string, twilioFrom?: string): Promise<boolean> {
  try {
    const resolvedCallerId = normalizePhone(twilioFrom);
    const callerIdAttr = resolvedCallerId ? ` callerId="${escapeXml(resolvedCallerId)}"` : "";

    // Reuse the verified Twilio number from the live outbound leg.
    // The configured env value may be invalid even when the actual live call was auto-fallbacked.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30" answerOnBridge="true"${callerIdAttr}>
    <Number>${escapeXml(vapiPhoneNumber)}</Number>
  </Dial>
</Response>`;

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Twiml: twiml }).toString(),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[powerdial-webhook] Twilio redirect error:", errText);
      return false;
    }
    const data = await resp.json();
    console.log(`[powerdial-webhook] Call ${callSid} redirected to Vapi number ${vapiPhoneNumber} with assistant ${assistantId} using caller ID ${resolvedCallerId || "default"}`);
    return true;
  } catch (err) {
    console.error("[powerdial-webhook] Redirect exception:", err);
    return false;
  }
}

async function advanceCampaign(campaignId: string) {
  try {
    const { data: campaign } = await sb
      .from("powerdial_campaigns")
      .select("settings, status")
      .eq("id", campaignId)
      .single();

    if (!campaign || campaign.status !== "running") return;

    const delay = (campaign.settings as any)?.call_delay_ms || 2000;

    await fetch(`${supabaseUrl}/functions/v1/powerdial-engine`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        "Content-Type": "application/json",
        apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      },
      body: JSON.stringify({ action: "advance", campaign_id: campaignId, delay_ms: delay }),
    });
  } catch (err) {
    console.error("[powerdial-webhook] advance error:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const campaignId = url.searchParams.get("campaign_id") || "";
  const queueItemId = url.searchParams.get("queue_item_id") || "";
  const callLogId = url.searchParams.get("call_log_id") || "";

  try {
    if (type === "twiml") {
      // Initial TwiML — hold the call while AMD processes async
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="30"/>
  <Say>Thank you for your time. Goodbye.</Say>
  <Hangup/>
</Response>`;
      return twimlResponse(xml);
    }

    // Parse form-encoded Twilio callback
    const formText = await req.text();
    const params = new URLSearchParams(formText);
    const callSid = params.get("CallSid") || "";
    const callStatus = params.get("CallStatus") || "";
    const twilioFrom = params.get("From") || "";

    if (type === "amd") {
      const answeredBy = params.get("AnsweredBy") || "";
      console.log(`[powerdial-webhook] AMD result: ${answeredBy} for call ${callSid}`);

      let amdResult = "unknown";
      let connectVapi = false;

      if (answeredBy === "human") {
        amdResult = "human";
        connectVapi = true;
      } else if (answeredBy.includes("machine") || answeredBy === "fax") {
        amdResult = "voicemail";
      } else if (answeredBy === "unknown") {
        amdResult = "human";
        connectVapi = true;
      }

      // Update call log
      await sb.from("powerdial_call_logs").update({
        amd_result: amdResult,
        connected_to_vapi: connectVapi,
      }).eq("id", callLogId);

      if (connectVapi) {
        // === KEY FIX: Redirect the existing Twilio call to the Vapi phone number ===
        // Instead of creating a separate outbound Vapi call (which the customer won't answer
        // because they're already on this call), we update THIS call's TwiML to dial
        // the Vapi phone number, transferring the live audio to the Vapi assistant.

        const { data: campSettings } = await sb.from("powerdial_campaigns").select("settings").eq("id", campaignId).single();
        const assistantId = (campSettings?.settings as any)?.vapi_assistant_id || FALLBACK_VAPI_ASSISTANT;

        // Get the actual Vapi phone number from the phoneNumberId
        const vapiPhoneNumber = await getVapiPhoneNumber(VAPI_PHONE_NUMBER_ID);

        if (vapiPhoneNumber) {
          const redirected = await redirectCallToVapi(callSid, vapiPhoneNumber, assistantId, twilioFrom);

          if (redirected) {
            await sb.from("powerdial_call_logs").update({
              connected_to_vapi: true,
              meta: {
                transfer_method: "twilio_redirect",
                vapi_phone: vapiPhoneNumber,
                assistant_id: assistantId,
                twilio_from: normalizePhone(twilioFrom) || null,
              },
            }).eq("id", callLogId);
            console.log(`[powerdial-webhook] Human detected — redirected call ${callSid} to Vapi at ${vapiPhoneNumber}`);
          } else {
            console.error("[powerdial-webhook] Failed to redirect call to Vapi");
            await sb.from("powerdial_call_logs").update({
              connected_to_vapi: false,
              meta: { vapi_error: "redirect_failed", twilio_from: normalizePhone(twilioFrom) || null },
            }).eq("id", callLogId);
          }
        } else {
          console.error("[powerdial-webhook] Could not resolve Vapi phone number from ID:", VAPI_PHONE_NUMBER_ID);
          await sb.from("powerdial_call_logs").update({
            connected_to_vapi: false,
            meta: {
              vapi_error: "no_vapi_phone_number",
              vapi_phone_number_id: VAPI_PHONE_NUMBER_ID,
              twilio_from: normalizePhone(twilioFrom) || null,
            },
          }).eq("id", callLogId);
        }

        // Update queue + campaign for human
        await sb.from("powerdial_queue").update({ status: "completed", last_result: "human_connected" }).eq("id", queueItemId);
        const { data: camp } = await sb.from("powerdial_campaigns").select("human_count, completed_count").eq("id", campaignId).single();
        if (camp) {
          await sb.from("powerdial_campaigns").update({
            human_count: camp.human_count + 1,
            completed_count: camp.completed_count + 1,
          }).eq("id", campaignId);
        }
      } else {
        // Voicemail — hangup the call
        try {
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ Status: "completed" }).toString(),
            }
          );
        } catch {}

        // Update queue + campaign for voicemail
        await sb.from("powerdial_queue").update({ status: "completed", last_result: "voicemail" }).eq("id", queueItemId);
        const { data: camp } = await sb.from("powerdial_campaigns").select("voicemail_count, completed_count").eq("id", campaignId).single();
        if (camp) {
          await sb.from("powerdial_campaigns").update({
            voicemail_count: camp.voicemail_count + 1,
            completed_count: camp.completed_count + 1,
          }).eq("id", campaignId);
        }

        // Advance to next
        await advanceCampaign(campaignId);
      }

      return json({ ok: true, amd_result: amdResult });
    }

    if (type === "status") {
      console.log(`[powerdial-webhook] Status: ${callStatus} for call ${callSid}`);

      // Update call log
      await sb.from("powerdial_call_logs").update({ twilio_status: callStatus }).eq("id", callLogId);

      if (callStatus === "busy") {
        await sb.from("powerdial_queue").update({ status: "completed", last_result: "busy" }).eq("id", queueItemId);
        const { data: camp } = await sb.from("powerdial_campaigns").select("busy_count, completed_count").eq("id", campaignId).single();
        if (camp) {
          await sb.from("powerdial_campaigns").update({
            busy_count: camp.busy_count + 1,
            completed_count: camp.completed_count + 1,
          }).eq("id", campaignId);
        }
        await sb.from("powerdial_call_logs").update({ amd_result: "busy" }).eq("id", callLogId);
        await advanceCampaign(campaignId);
      } else if (callStatus === "no-answer") {
        const { data: qItem } = await sb.from("powerdial_queue").select("retry_count").eq("id", queueItemId).single();
        const { data: camp } = await sb.from("powerdial_campaigns").select("settings, no_answer_count, completed_count").eq("id", campaignId).single();
        const maxRetries = (camp?.settings as any)?.max_retries || 2;
        const retryHours = (camp?.settings as any)?.retry_no_answer_hours || 4;

        if ((qItem?.retry_count || 0) < maxRetries) {
          const retryAt = new Date(Date.now() + retryHours * 3600000).toISOString();
          await sb.from("powerdial_queue").update({
            status: "retry_later",
            last_result: "no_answer",
            retry_count: (qItem?.retry_count || 0) + 1,
            retry_at: retryAt,
          }).eq("id", queueItemId);
          await sb.from("powerdial_call_logs").update({ amd_result: "no_answer", retry_eligible: true }).eq("id", callLogId);
        } else {
          await sb.from("powerdial_queue").update({ status: "completed", last_result: "no_answer" }).eq("id", queueItemId);
          await sb.from("powerdial_call_logs").update({ amd_result: "no_answer" }).eq("id", callLogId);
        }

        if (camp) {
          await sb.from("powerdial_campaigns").update({
            no_answer_count: camp.no_answer_count + 1,
            completed_count: camp.completed_count + 1,
          }).eq("id", campaignId);
        }
        await advanceCampaign(campaignId);
      } else if (callStatus === "failed" || callStatus === "canceled") {
        await sb.from("powerdial_queue").update({ status: "completed", last_result: "failed" }).eq("id", queueItemId);
        await sb.from("powerdial_call_logs").update({ amd_result: "failed", twilio_status: callStatus }).eq("id", callLogId);
        const { data: camp } = await sb.from("powerdial_campaigns").select("failed_count, completed_count").eq("id", campaignId).single();
        if (camp) {
          await sb.from("powerdial_campaigns").update({
            failed_count: camp.failed_count + 1,
            completed_count: camp.completed_count + 1,
          }).eq("id", campaignId);
        }
        await advanceCampaign(campaignId);
      } else if (callStatus === "completed") {
        // Call ended — check if it was a human call transferred to Vapi
        const { data: logData } = await sb.from("powerdial_call_logs").select("connected_to_vapi, vapi_call_id, meta").eq("id", callLogId).single();

        // If we transferred to Vapi via phone redirect, try to fetch call data from Vapi
        if (logData?.connected_to_vapi) {
          // Look up the most recent Vapi call for this phone number
          try {
            const { data: qItem } = await sb.from("powerdial_queue").select("phone").eq("id", queueItemId).single();
            if (qItem?.phone) {
              // Search Vapi calls by customer number (recent)
              const vapiResp = await fetch(`https://api.vapi.ai/call?limit=5&sortOrder=DESC`, {
                headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
              });
              if (vapiResp.ok) {
                const vapiCalls = await vapiResp.json();
                // Find the call that matches our customer phone
                const rawDigits = qItem.phone.replace(/\D/g, "");
                const matchedCall = (vapiCalls || []).find((c: any) => {
                  const cNum = (c.customer?.number || "").replace(/\D/g, "");
                  return cNum && rawDigits.endsWith(cNum.slice(-10));
                });

                if (matchedCall) {
                  await sb.from("powerdial_call_logs").update({
                    vapi_call_id: matchedCall.id,
                    transcript: matchedCall.transcript || matchedCall.messages?.map((m: any) => `${m.role}: ${m.content}`).join("\n") || null,
                    summary: matchedCall.analysis?.summary || matchedCall.summary || null,
                    disposition: matchedCall.analysis?.successEvaluation || null,
                    recording_url: matchedCall.recordingUrl || matchedCall.artifact?.recordingUrl || null,
                    follow_up_needed: matchedCall.analysis?.successEvaluation === "follow_up",
                  }).eq("id", callLogId);
                  console.log(`[powerdial-webhook] Matched Vapi call: ${matchedCall.id}`);
                }
              } else {
                await vapiResp.text(); // consume body
              }
            }
          } catch (err) {
            console.error("[powerdial-webhook] Vapi fetch error:", err);
          }
        }

        // Advance to next number
        await advanceCampaign(campaignId);
      }

      return json({ ok: true });
    }

    return json({ error: "unknown type" }, 400);
  } catch (err) {
    console.error("[powerdial-webhook]", err);
    return json({ error: String(err) }, 500);
  }
});
