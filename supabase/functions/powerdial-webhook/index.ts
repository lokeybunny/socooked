import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  advanceCampaign,
  DEFAULT_OUTBOUND_VAPI_ASSISTANT,
  normalizePhone,
  sb,
} from "../_shared/powerdial.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
const VAPI_PHONE_NUMBER_ID = Deno.env.get("VAPI_PHONE_NUMBER_ID") || "";
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getVapiPhoneNumber(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null;

  try {
    const resp = await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[powerdial-webhook] Vapi phone lookup error:", errText);
      return null;
    }

    const data = await resp.json();
    return data.number || data.phoneNumber || null;
  } catch (err) {
    console.error("[powerdial-webhook] Vapi phone lookup exception:", err);
    return null;
  }
}

async function updateVapiPhoneAssistant(phoneNumberId: string, assistantId: string) {
  if (!phoneNumberId || !assistantId) {
    return {
      ok: false,
      phoneNumber: null,
      details: "Missing Vapi phone number ID or assistant ID",
    };
  }

  try {
    const resp = await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ assistantId }),
    });

    const text = await resp.text();
    let data: any = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!resp.ok) {
      console.error("[powerdial-webhook] Vapi phone assistant update error:", data);
      return {
        ok: false,
        phoneNumber: data.number || data.phoneNumber || null,
        details: data?.message || data?.error || text || `HTTP ${resp.status}`,
      };
    }

    return {
      ok: true,
      phoneNumber: data.number || data.phoneNumber || null,
      details: null,
    };
  } catch (err) {
    console.error("[powerdial-webhook] Vapi phone assistant update exception:", err);
    return {
      ok: false,
      phoneNumber: null,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

async function redirectCallToVapi(callSid: string, vapiPhoneNumber: string, assistantId: string, twilioFrom?: string): Promise<boolean> {
  try {
    const resolvedCallerId = normalizePhone(twilioFrom);
    const callerIdAttr = resolvedCallerId ? ` callerId="${escapeXml(resolvedCallerId)}"` : "";

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
      },
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[powerdial-webhook] Twilio redirect error:", errText);
      return false;
    }

    console.log(`[powerdial-webhook] Call ${callSid} redirected to Vapi number ${vapiPhoneNumber} with assistant ${assistantId}`);
    return true;
  } catch (err) {
    console.error("[powerdial-webhook] Redirect exception:", err);
    return false;
  }
}

async function updateQueueStatusOnce(
  queueItemId: string,
  values: Record<string, unknown>,
  allowedStatuses: string[] = ["dialing"],
) {
  if (!queueItemId) return false;

  const { data } = await sb
    .from("powerdial_queue")
    .update(values)
    .eq("id", queueItemId)
    .in("status", allowedStatuses)
    .select("id")
    .maybeSingle();

  return Boolean(data);
}

async function bumpCampaignCount(
  campaignId: string,
  field: "human_count" | "voicemail_count" | "busy_count" | "no_answer_count" | "failed_count",
) {
  const { data: campaign } = await sb
    .from("powerdial_campaigns")
    .select("human_count, voicemail_count, busy_count, no_answer_count, failed_count, completed_count")
    .eq("id", campaignId)
    .single();

  if (!campaign) return;

  const currentValue = Number((campaign as any)[field] || 0);
  await sb.from("powerdial_campaigns").update({
    [field]: currentValue + 1,
    completed_count: Number(campaign.completed_count || 0) + 1,
  }).eq("id", campaignId);
}

async function fetchRecentVapiCallForPhone(phone: string) {
  try {
    const vapiResp = await fetch("https://api.vapi.ai/call?limit=10&sortOrder=DESC", {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });

    if (!vapiResp.ok) {
      await vapiResp.text();
      return null;
    }

    const vapiCalls = await vapiResp.json();
    const rawDigits = phone.replace(/\D/g, "");

    return (vapiCalls || []).find((call: any) => {
      const callNumber = String(call.customer?.number || "").replace(/\D/g, "");
      return callNumber && rawDigits.endsWith(callNumber.slice(-10));
    }) || null;
  } catch (err) {
    console.error("[powerdial-webhook] Vapi fetch error:", err);
    return null;
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
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="30"/>
  <Say>Thank you for your time. Goodbye.</Say>
  <Hangup/>
</Response>`;
      return twimlResponse(xml);
    }

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

      await sb.from("powerdial_call_logs").update({ amd_result: amdResult }).eq("id", callLogId);

      if (connectVapi) {
        const queueProcessed = await updateQueueStatusOnce(queueItemId, {
          status: "completed",
          last_result: "human_connected",
        });

        if (queueProcessed) {
          await bumpCampaignCount(campaignId, "human_count");
        }

        const { data: campSettings } = await sb
          .from("powerdial_campaigns")
          .select("settings")
          .eq("id", campaignId)
          .single();

        const assistantId = String((campSettings?.settings as any)?.vapi_assistant_id || DEFAULT_OUTBOUND_VAPI_ASSISTANT).trim();
        const assistantUpdate = await updateVapiPhoneAssistant(VAPI_PHONE_NUMBER_ID, assistantId);
        const vapiPhoneNumber = assistantUpdate.phoneNumber || await getVapiPhoneNumber(VAPI_PHONE_NUMBER_ID);
        const redirected = vapiPhoneNumber
          ? await redirectCallToVapi(callSid, vapiPhoneNumber, assistantId, twilioFrom)
          : false;

        await sb.from("powerdial_call_logs").update({
          connected_to_vapi: redirected,
          meta: {
            transfer_method: "twilio_redirect",
            assistant_id: assistantId,
            assistant_update_ok: assistantUpdate.ok,
            assistant_update_error: assistantUpdate.details,
            vapi_phone: vapiPhoneNumber,
            twilio_from: normalizePhone(twilioFrom) || null,
          },
        }).eq("id", callLogId);

        if (!redirected) {
          console.error("[powerdial-webhook] Failed to redirect human call to Vapi");
        }

        return json({ ok: true, amd_result: amdResult, redirected });
      }

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
          },
        );
      } catch (err) {
        console.error("[powerdial-webhook] Failed to force-complete voicemail call:", err);
      }

      const queueProcessed = await updateQueueStatusOnce(queueItemId, {
        status: "completed",
        last_result: "voicemail",
      });

      if (queueProcessed) {
        await bumpCampaignCount(campaignId, "voicemail_count");
      }

      const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
      console.log(`[powerdial-webhook] Advance after voicemail for ${campaignId}:`, advanceResult);

      return json({ ok: true, amd_result: amdResult, advanced: advanceResult });
    }

    if (type === "status") {
      console.log(`[powerdial-webhook] Status: ${callStatus} for call ${callSid}`);
      await sb.from("powerdial_call_logs").update({ twilio_status: callStatus }).eq("id", callLogId);

      if (callStatus === "busy") {
        const queueProcessed = await updateQueueStatusOnce(queueItemId, {
          status: "completed",
          last_result: "busy",
        });

        if (queueProcessed) {
          await bumpCampaignCount(campaignId, "busy_count");
          await sb.from("powerdial_call_logs").update({ amd_result: "busy" }).eq("id", callLogId);
        }

        const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
        console.log(`[powerdial-webhook] Advance after busy for ${campaignId}:`, advanceResult);
      } else if (callStatus === "no-answer") {
        const [{ data: qItem }, { data: campaign }] = await Promise.all([
          sb.from("powerdial_queue").select("retry_count").eq("id", queueItemId).single(),
          sb.from("powerdial_campaigns").select("settings").eq("id", campaignId).single(),
        ]);

        const maxRetries = Number((campaign?.settings as any)?.max_retries || 2);
        const retryHours = Number((campaign?.settings as any)?.retry_no_answer_hours || 4);
        const currentRetryCount = Number(qItem?.retry_count || 0);
        const willRetry = currentRetryCount < maxRetries;

        const queueProcessed = await updateQueueStatusOnce(queueItemId, willRetry
          ? {
              status: "retry_later",
              last_result: "no_answer",
              retry_count: currentRetryCount + 1,
              retry_at: new Date(Date.now() + retryHours * 3600000).toISOString(),
            }
          : {
              status: "completed",
              last_result: "no_answer",
            });

        if (queueProcessed) {
          await sb.from("powerdial_call_logs").update({
            amd_result: "no_answer",
            retry_eligible: willRetry,
          }).eq("id", callLogId);
          await bumpCampaignCount(campaignId, "no_answer_count");
        }

        const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
        console.log(`[powerdial-webhook] Advance after no-answer for ${campaignId}:`, advanceResult);
      } else if (callStatus === "failed" || callStatus === "canceled") {
        const queueProcessed = await updateQueueStatusOnce(queueItemId, {
          status: "completed",
          last_result: "failed",
        });

        if (queueProcessed) {
          await sb.from("powerdial_call_logs").update({
            amd_result: "failed",
            twilio_status: callStatus,
          }).eq("id", callLogId);
          await bumpCampaignCount(campaignId, "failed_count");
        }

        const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
        console.log(`[powerdial-webhook] Advance after failed/canceled for ${campaignId}:`, advanceResult);
      } else if (callStatus === "completed") {
        const [{ data: logData }, { data: qItem }] = await Promise.all([
          sb.from("powerdial_call_logs").select("connected_to_vapi").eq("id", callLogId).single(),
          sb.from("powerdial_queue").select("phone").eq("id", queueItemId).single(),
        ]);

        if (logData?.connected_to_vapi && qItem?.phone) {
          const matchedCall = await fetchRecentVapiCallForPhone(qItem.phone);
          if (matchedCall) {
            await sb.from("powerdial_call_logs").update({
              vapi_call_id: matchedCall.id,
              transcript: matchedCall.transcript || matchedCall.messages?.map((message: any) => `${message.role}: ${message.content}`).join("
") || null,
              summary: matchedCall.analysis?.summary || matchedCall.summary || null,
              disposition: matchedCall.analysis?.successEvaluation || null,
              recording_url: matchedCall.recordingUrl || matchedCall.artifact?.recordingUrl || null,
              follow_up_needed: matchedCall.analysis?.successEvaluation === "follow_up",
            }).eq("id", callLogId);
            console.log(`[powerdial-webhook] Matched Vapi call: ${matchedCall.id}`);
          }
        }

        const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
        console.log(`[powerdial-webhook] Advance after completed for ${campaignId}:`, advanceResult);
      }

      return json({ ok: true });
    }

    return json({ error: "unknown type" }, 400);
  } catch (err) {
    console.error("[powerdial-webhook]", err);
    return json({ error: String(err) }, 500);
  }
});
