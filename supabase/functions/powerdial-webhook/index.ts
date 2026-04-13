import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, serviceKey);

const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
// Default Vapi assistant for powerdial — uses existing web design inbound assistant
const DEFAULT_VAPI_ASSISTANT = "fea7fb27-2311-4f42-9bc1-d6e6fa966ab8";

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

async function advanceCampaign(campaignId: string) {
  // Trigger next dial via the engine
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
      // Initial TwiML — just hold the call while AMD processes
      // AMD runs async, so we need to keep the call alive
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

    if (type === "amd") {
      const answeredBy = params.get("AnsweredBy") || "";
      const machineDetection = params.get("MachineDetectionDuration") || "";
      console.log(`[powerdial-webhook] AMD result: ${answeredBy} for call ${callSid}`);

      let amdResult = "unknown";
      let connectVapi = false;

      if (answeredBy === "human") {
        amdResult = "human";
        connectVapi = true;
      } else if (answeredBy.includes("machine") || answeredBy === "fax") {
        amdResult = "voicemail";
      } else if (answeredBy === "unknown") {
        // Treat unknown as potential human for safety
        amdResult = "human";
        connectVapi = true;
      }

      // Update call log
      await sb.from("powerdial_call_logs").update({
        amd_result: amdResult,
        connected_to_vapi: connectVapi,
      }).eq("id", callLogId);

      if (connectVapi) {
        // Connect to Vapi by updating the call with new TwiML
        // Get queue item phone for context
        const { data: qItem } = await sb.from("powerdial_queue").select("phone, contact_name, customer_id").eq("id", queueItemId).single();

        try {
          // Create Vapi call that connects to the existing Twilio call
          const vapiResp = await fetch("https://api.vapi.ai/call", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${VAPI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              assistantId: DEFAULT_VAPI_ASSISTANT,
              phoneCallProvider: "twilio",
              phoneCallTransport: "pstn",
              customer: {
                number: qItem?.phone || "",
                name: qItem?.contact_name || "Unknown",
              },
              metadata: {
                powerdial_campaign_id: campaignId,
                powerdial_queue_item_id: queueItemId,
                powerdial_call_log_id: callLogId,
                customer_id: qItem?.customer_id || "",
              },
            }),
          });

          if (vapiResp.ok) {
            const vapiData = await vapiResp.json();
            await sb.from("powerdial_call_logs").update({
              vapi_call_id: vapiData.id,
              connected_to_vapi: true,
            }).eq("id", callLogId);
            console.log(`[powerdial-webhook] Vapi call created: ${vapiData.id}`);
          } else {
            const errText = await vapiResp.text();
            console.error("[powerdial-webhook] Vapi error:", errText);
            // Still connected even if Vapi fails - Twilio call continues
            await sb.from("powerdial_call_logs").update({
              connected_to_vapi: false,
              meta: { vapi_error: errText },
            }).eq("id", callLogId);
          }
        } catch (vapiErr) {
          console.error("[powerdial-webhook] Vapi exception:", vapiErr);
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
        // Voicemail - hangup the call
        try {
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get("TWILIO_ACCOUNT_SID")}/Calls/${callSid}.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID")}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`)}`,
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
        // Check retry logic
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
        // Call ended — check if it was a human call with Vapi
        const { data: logData } = await sb.from("powerdial_call_logs").select("connected_to_vapi, vapi_call_id").eq("id", callLogId).single();

        if (logData?.connected_to_vapi && logData?.vapi_call_id) {
          // Fetch Vapi call data
          try {
            const vapiResp = await fetch(`https://api.vapi.ai/call/${logData.vapi_call_id}`, {
              headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
            });
            if (vapiResp.ok) {
              const vapiCall = await vapiResp.json();
              await sb.from("powerdial_call_logs").update({
                transcript: vapiCall.transcript || vapiCall.messages?.map((m: any) => `${m.role}: ${m.content}`).join("\n") || null,
                summary: vapiCall.analysis?.summary || vapiCall.summary || null,
                disposition: vapiCall.analysis?.successEvaluation || null,
                recording_url: vapiCall.recordingUrl || vapiCall.artifact?.recordingUrl || null,
                follow_up_needed: vapiCall.analysis?.successEvaluation === "follow_up",
              }).eq("id", callLogId);
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
