import {
  advanceCampaign,
  cancelSiblingCalls,
  normalizePhone,
  prepareVapiOutboundAssistant,
  resolvePowerDialAssistantId,
  sanitizePowerDialAssistantId,
  sb,
} from "../_shared/powerdial.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
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

function buildPowerDialWebhookUrl(type: string, campaignId: string, queueItemId: string, callLogId: string) {
  const webhookUrl = new URL(`${SUPABASE_URL}/functions/v1/powerdial-webhook`);
  webhookUrl.searchParams.set("type", type);
  webhookUrl.searchParams.set("campaign_id", campaignId);
  webhookUrl.searchParams.set("queue_item_id", queueItemId);
  webhookUrl.searchParams.set("call_log_id", callLogId);
  return webhookUrl.toString();
}

async function redirectCallToVapi(
  callSid: string,
  vapiPhoneNumber: string,
  assistantId: string,
  options: {
    campaignId: string;
    queueItemId: string;
    callLogId: string;
    twilioFrom?: string;
  },
): Promise<boolean> {
  try {
    const resolvedCallerId = normalizePhone(options.twilioFrom);
    const callerIdAttr = resolvedCallerId ? ` callerId="${escapeXml(resolvedCallerId)}"` : "";
    const dialCompleteUrl = buildPowerDialWebhookUrl(
      "dial-complete",
      options.campaignId,
      options.queueItemId,
      options.callLogId,
    );

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30" answerOnBridge="true" action="${escapeXml(dialCompleteUrl)}" method="POST"${callerIdAttr}>
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

async function handleCallCompletion(
  campaignId: string,
  queueItemId: string,
  callLogId: string,
  source: "status" | "dial-complete",
) {
  const [{ data: logData }, { data: qItem }] = await Promise.all([
    sb.from("powerdial_call_logs").select("connected_to_vapi, vapi_call_id").eq("id", callLogId).single(),
    sb.from("powerdial_queue").select("phone").eq("id", queueItemId).single(),
  ]);

  if (logData?.connected_to_vapi && qItem?.phone && !logData.vapi_call_id) {
    const matchedCall = await fetchRecentVapiCallForPhone(qItem.phone);
    if (matchedCall) {
      const transcript = matchedCall.transcript ||
        matchedCall.messages?.map((message: any) => `${message.role}: ${message.content}`).join("\n") || null;

      await sb.from("powerdial_call_logs").update({
        vapi_call_id: matchedCall.id,
        transcript,
        summary: matchedCall.analysis?.summary || matchedCall.summary || null,
        disposition: matchedCall.analysis?.successEvaluation || null,
        recording_url: matchedCall.recordingUrl || matchedCall.artifact?.recordingUrl || null,
        follow_up_needed: matchedCall.analysis?.successEvaluation === "follow_up",
      }).eq("id", callLogId);
      console.log(`[powerdial-webhook] Matched Vapi call from ${source}: ${matchedCall.id}`);

      await analyzeAndLabelPowerDialLead(callLogId, campaignId, queueItemId, qItem.phone, matchedCall);
    }
  }

  const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
  console.log(`[powerdial-webhook] Advance after ${source} completion for ${campaignId}:`, advanceResult);
  return advanceResult;
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

/** After a completed Vapi call, analyze transcript and push interested leads to CRM */
async function analyzeAndLabelPowerDialLead(
  callLogId: string,
  campaignId: string,
  queueItemId: string,
  phone: string,
  matchedCall: any,
) {
  try {
    const transcript = matchedCall.transcript ||
      matchedCall.messages?.map((m: any) => `${m.role}: ${m.content}`).join("\n") || "";
    const summary = matchedCall.analysis?.summary || matchedCall.summary || "";
    const disposition = matchedCall.analysis?.successEvaluation || "";

    // Determine if lead is interested based on Vapi analysis or keywords
    const interestSignals = [
      "interested", "yes", "sure", "tell me more", "sounds good",
      "schedule", "appointment", "book", "meeting", "callback",
      "follow_up", "follow up", "success",
    ];

    const notInterestedSignals = [
      "not interested", "no thanks", "don't call", "remove me",
      "stop calling", "hang up", "wrong number", "do not call",
    ];

    const lowerTranscript = (transcript + " " + summary + " " + disposition).toLowerCase();
    const isNotInterested = notInterestedSignals.some((s) => lowerTranscript.includes(s));
    const isInterested = !isNotInterested && interestSignals.some((s) => lowerTranscript.includes(s));

    if (!isInterested) {
      console.log(`[powerdial-webhook] Lead at ${phone} not interested or inconclusive, skipping CRM push`);
      return;
    }

    // Check if customer already exists by phone
    const normalizedPhone = normalizePhone(phone);
    const digits = normalizedPhone.replace(/\D/g, "");
    const last10 = digits.slice(-10);

    const { data: existing } = await sb
      .from("customers")
      .select("id, tags, meta, status")
      .or(`phone.ilike.%${last10}%`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update existing customer with power_dialed tag and status
      const currentTags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
      const newTags = [...new Set([...currentTags, "power_dialed"])];
      const currentMeta = existing.meta && typeof existing.meta === "object" && !Array.isArray(existing.meta)
        ? existing.meta as Record<string, unknown>
        : {};

      await sb.from("customers").update({
        tags: newTags,
        status: existing.status === "lead" ? "prospect" : existing.status,
        meta: {
          ...currentMeta,
          powerdial_campaign_id: campaignId,
          powerdial_interested: true,
          powerdial_transcript_summary: summary.slice(0, 500),
          powerdial_call_log_id: callLogId,
        },
        source: currentMeta.source || "power_dialed",
      }).eq("id", existing.id);

      console.log(`[powerdial-webhook] Updated existing customer ${existing.id} with power_dialed tag`);
    } else {
      // Create new customer from power dial
      const { data: qItem } = await sb
        .from("powerdial_queue")
        .select("contact_name, customer_id")
        .eq("id", queueItemId)
        .single();

      await sb.from("customers").insert({
        full_name: qItem?.contact_name || `Power Dialed ${last10}`,
        phone: normalizedPhone,
        status: "prospect",
        source: "power_dialed",
        tags: ["power_dialed"],
        meta: {
          powerdial_campaign_id: campaignId,
          powerdial_interested: true,
          powerdial_transcript_summary: summary.slice(0, 500),
          powerdial_call_log_id: callLogId,
        },
      });

      console.log(`[powerdial-webhook] Created new customer from power dial for ${normalizedPhone}`);
    }

    // Mark call log as lead pushed
    await sb.from("powerdial_call_logs").update({
      follow_up_needed: true,
      disposition: "interested",
    }).eq("id", callLogId);
  } catch (err) {
    console.error("[powerdial-webhook] Lead labeling error:", err);
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

        // Get frozen assistant from call log meta (set at dial time), fallback to campaign settings
        const [{ data: existingLog }, { data: campSettings }] = await Promise.all([
          sb.from("powerdial_call_logs").select("meta, batch_id").eq("id", callLogId).single(),
          sb.from("powerdial_campaigns").select("settings").eq("id", campaignId).single(),
        ]);

        // If this is a triple-dial batch, cancel the sibling calls
        const batchId = (existingLog as any)?.batch_id;
        if (batchId) {
          console.log(`[powerdial-webhook] Human detected in triple-dial batch ${batchId}, cancelling siblings`);
          await cancelSiblingCalls(batchId, callLogId, campaignId);
        }

        const existingMeta = existingLog?.meta && typeof existingLog.meta === "object" && !Array.isArray(existingLog.meta)
          ? existingLog.meta as Record<string, unknown>
          : {};

        // The assistant_id was frozen in call log meta at dial time by placeCall()
        const frozenAssistantId = typeof existingMeta.assistant_id === "string"
          ? existingMeta.assistant_id.trim()
          : "";

        // Always sanitize to ensure we never use an inbound assistant
        const assistantId = sanitizePowerDialAssistantId(
          frozenAssistantId || resolvePowerDialAssistantId((campSettings?.settings || {}) as Record<string, unknown>),
        );

        console.log(`[powerdial-webhook] Resolved outbound assistant: ${assistantId} (frozen=${frozenAssistantId}, campaign=${(campSettings?.settings as any)?.vapi_assistant_id || 'none'})`);

        // PATCH the Vapi phone number to use the correct outbound assistant BEFORE redirect
        const assistantPreparation = await prepareVapiOutboundAssistant(assistantId);
        console.log(`[powerdial-webhook] Vapi assistant prep: ok=${assistantPreparation.ok}, current=${assistantPreparation.currentAssistantId}, target=${assistantId}`);

        const vapiPhoneNumber = assistantPreparation.phoneNumber || await getVapiPhoneNumber(VAPI_PHONE_NUMBER_ID);
        const redirected = vapiPhoneNumber
          ? await redirectCallToVapi(callSid, vapiPhoneNumber, assistantId, {
              campaignId,
              queueItemId,
              callLogId,
              twilioFrom,
            })
          : false;

        await sb.from("powerdial_call_logs").update({
          connected_to_vapi: redirected,
          meta: {
            ...existingMeta,
            transfer_method: "twilio_redirect",
            assistant_id: assistantId,
            assistant_source: frozenAssistantId ? "call_log_frozen" : "campaign_settings",
            assistant_prepare_ok: assistantPreparation.ok,
            assistant_prepare_error: assistantPreparation.details,
            vapi_phone: vapiPhoneNumber,
            ...(assistantPreparation.currentAssistantId ? { vapi_phone_assistant_id: assistantPreparation.currentAssistantId } : {}),
            twilio_from: normalizePhone(twilioFrom) || null,
          },
        }).eq("id", callLogId);

        if (!redirected) {
          console.error("[powerdial-webhook] Failed to redirect human call to Vapi");
        }

        return json({ ok: true, amd_result: amdResult, redirected, assistant_id: assistantId });
      }

      // Non-human: hang up and advance
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

    if (type === "dial-complete") {
      const dialCallStatus = params.get("DialCallStatus") || params.get("CallStatus") || "completed";
      console.log(`[powerdial-webhook] Dial complete: ${dialCallStatus} for call ${callSid}`);

      await sb.from("powerdial_call_logs").update({
        twilio_status: dialCallStatus,
      }).eq("id", callLogId);

      const advanceResult = await handleCallCompletion(campaignId, queueItemId, callLogId, "dial-complete");
      return json({ ok: true, source: "dial-complete", dial_call_status: dialCallStatus, advanced: advanceResult });
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
        await handleCallCompletion(campaignId, queueItemId, callLogId, "status");
      }

      return json({ ok: true });
    }

    return json({ error: "unknown type" }, 400);
  } catch (err) {
    console.error("[powerdial-webhook]", err);
    return json({ error: String(err) }, 500);
  }
});
