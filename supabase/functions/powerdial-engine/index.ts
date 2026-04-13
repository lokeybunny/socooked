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
        await sb.from("powerdial_campaigns").update({
          status: "running",
          ...(action === "start" ? { started_at: new Date().toISOString() } : {}),
        }).eq("id", campaign_id);

        const result = await dialNext(campaign_id, "[powerdial-engine]");
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

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[powerdial-engine]", err);
    return json({ error: String(err) }, 500);
  }
});
