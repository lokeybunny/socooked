import {
  advanceCampaign,
  DEFAULT_POWERDIAL_SETTINGS,
  dialNext,
  dialNextBatch,
  resolveTwilioFromNumber,
  sanitizePowerDialAssistantId,
  sb,
} from "../_shared/powerdial.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function withDefaultCampaignSettings(settings: Record<string, unknown> | null | undefined) {
  const mergedSettings = {
    ...DEFAULT_POWERDIAL_SETTINGS,
    ...(settings || {}),
  };

  return {
    ...mergedSettings,
    vapi_assistant_id: sanitizePowerDialAssistantId(mergedSettings.vapi_assistant_id),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action, campaign_id, campaign_name, lead_ids, phones, settings } = body;

    switch (action) {
      case "validate_config": {
        const resolution = await resolveTwilioFromNumber();
        return json({
          ok: true,
          configured_from: resolution.availableFromNumbers.includes(resolution.resolvedFrom || "") ? resolution.resolvedFrom : null,
          resolved_from: resolution.resolvedFrom,
          available_from_numbers: resolution.availableFromNumbers,
          has_valid_from_number: Boolean(resolution.resolvedFrom),
        });
      }

      case "create_campaign": {
        const userId = body.user_id;
        if (!userId) return json({ error: "user_id required" }, 400);

        const mergedSettings = withDefaultCampaignSettings(settings);

        const { data: campaign, error } = await sb.from("powerdial_campaigns").insert({
          created_by: userId,
          name: campaign_name || "Untitled Campaign",
          settings: mergedSettings,
        }).select("*").single();

        if (error) return json({ error: error.message }, 500);

        const queueRows: any[] = [];
        if (lead_ids?.length) {
          const { data: customers } = await sb.from("customers").select("id, full_name, phone").in("id", lead_ids);
          (customers || []).forEach((customer: any, index: number) => {
            if (customer.phone) {
              queueRows.push({
                campaign_id: campaign.id,
                customer_id: customer.id,
                phone: customer.phone,
                contact_name: customer.full_name,
                position: index,
              });
            }
          });
        } else if (phones?.length) {
          phones.forEach((phoneEntry: any, index: number) => {
            queueRows.push({
              campaign_id: campaign.id,
              phone: typeof phoneEntry === "string" ? phoneEntry : phoneEntry.phone,
              contact_name: typeof phoneEntry === "string" ? null : phoneEntry.name,
              position: index,
            });
          });
        }

        if (queueRows.length > 0) {
          await sb.from("powerdial_queue").insert(queueRows);
        }

        await sb.from("powerdial_campaigns").update({ total_leads: queueRows.length }).eq("id", campaign.id);

        return json({
          campaign_id: campaign.id,
          queued: queueRows.length,
          settings: mergedSettings,
        });
      }

      case "start":
      case "resume": {
        const { data: campData } = await sb.from("powerdial_campaigns").select("settings").eq("id", campaign_id).single();
        await sb.from("powerdial_campaigns").update({
          status: "running",
          schedule_status: null,
          scheduled_start: null,
          scheduled_end: null,
          ended_at: null,
          ...(action === "start" ? { started_at: new Date().toISOString() } : {}),
        }).eq("id", campaign_id);

        const tripleDialEnabled = Boolean((campData?.settings as any)?.triple_dial);
        const result = tripleDialEnabled
          ? await dialNextBatch(campaign_id, 3, "[powerdial-engine]")
          : await dialNext(campaign_id, "[powerdial-engine]");
        console.log(`[powerdial-engine] ${action} result for ${campaign_id}:`, result);
        return json({ ok: true, ...result });
      }

      case "pause": {
        await sb.from("powerdial_campaigns").update({ status: "paused" }).eq("id", campaign_id);
        return json({ ok: true });
      }

      case "stop": {
        await sb.from("powerdial_campaigns").update({
          status: "stopped",
          ended_at: new Date().toISOString(),
        }).eq("id", campaign_id);
        return json({ ok: true });
      }

      case "skip": {
        const { data: dialingItems } = await sb
          .from("powerdial_queue")
          .select("id")
          .eq("campaign_id", campaign_id)
          .eq("status", "dialing")
          .limit(1);

        if (dialingItems?.length) {
          await sb.from("powerdial_queue").update({
            status: "skipped",
            last_result: "skipped",
          }).eq("id", dialingItems[0].id);
        }

        const result = await dialNext(campaign_id, "[powerdial-engine]");
        return json({ ok: true, ...result });
      }

      case "advance": {
        const result = await advanceCampaign(campaign_id, "[powerdial-engine]");
        console.log(`[powerdial-engine] advance result for ${campaign_id}:`, result);
        return json({ ok: true, ...result });
      }

      case "test_call": {
        const testPhone = body.phone;
        const testAssistantId = body.assistant_id;
        if (!testPhone) return json({ error: "phone required" }, 400);

        const { normalizePhone, prepareVapiOutboundAssistant, resolveTwilioFromNumber: resolveFrom, supabaseUrl: sbUrl } = await import("../_shared/powerdial.ts");
        const normalized = normalizePhone(testPhone);
        if (!normalized || normalized.replace(/\D/g, "").length < 10) {
          return json({ error: "Invalid phone number" }, 400);
        }

        // Resolve assistant
        const resolvedAssistant = sanitizePowerDialAssistantId(testAssistantId);
        const vapiPrep = await prepareVapiOutboundAssistant(resolvedAssistant);
        if (!vapiPrep.ok) {
          return json({ error: `Vapi setup failed: ${vapiPrep.details}` }, 500);
        }

        // Resolve from number
        const fromResolution = await resolveFrom();
        if (!fromResolution.resolvedFrom) {
          return json({ error: "No valid Twilio from number configured" }, 500);
        }

        // Place a single test call via Twilio
        const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
        const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
        const webhookUrl = `${sbUrl}/functions/v1/powerdial-webhook`;

        const callParams = new URLSearchParams({
          To: normalized,
          From: fromResolution.resolvedFrom,
          MachineDetection: "Enable",
          AsyncAmd: "true",
          AsyncAmdStatusCallback: `${webhookUrl}?type=amd&campaign_id=test&queue_item_id=test&call_log_id=test`,
          StatusCallback: `${webhookUrl}?type=status&campaign_id=test&queue_item_id=test&call_log_id=test`,
          StatusCallbackEvent: "initiated ringing answered completed",
          Url: `${webhookUrl}?type=twiml&campaign_id=test&queue_item_id=test&call_log_id=test`,
          Timeout: "30",
        });

        const twilioResp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: callParams.toString(),
          },
        );

        const twilioData = await twilioResp.json();
        if (!twilioResp.ok) {
          console.error("[powerdial-engine] test_call Twilio error:", twilioData);
          return json({ error: twilioData.message || "Twilio call failed", twilio_code: twilioData.code }, 500);
        }

        console.log(`[powerdial-engine] test_call placed to ${normalized}, SID: ${twilioData.sid}`);
        return json({ ok: true, call_sid: twilioData.sid, to: normalized, from: fromResolution.resolvedFrom, assistant: resolvedAssistant });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[powerdial-engine]", err);
    return json({ error: String(err) }, 500);
  }
});
