import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, serviceKey);

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";
const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
const TWILIO_CALLER_ID_ERROR_CODES = new Set([21210, 21212]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function fetchTwilioJson(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}${path}`,
    {
      ...init,
      headers,
    }
  );

  const text = await response.text();
  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { response, data };
}

async function listAvailableTwilioFromNumbers(): Promise<string[]> {
  const numbers = new Set<string>();
  const [incoming, outgoingCallerIds] = await Promise.all([
    fetchTwilioJson("/IncomingPhoneNumbers.json?PageSize=20", { method: "GET" }),
    fetchTwilioJson("/OutgoingCallerIds.json?PageSize=20", { method: "GET" }),
  ]);

  for (const item of incoming.data?.incoming_phone_numbers || []) {
    if (item?.phone_number) numbers.add(normalizePhone(String(item.phone_number)));
  }

  for (const item of outgoingCallerIds.data?.outgoing_caller_ids || []) {
    if (item?.phone_number) numbers.add(normalizePhone(String(item.phone_number)));
  }

  return Array.from(numbers);
}

function isTwilioCallerIdError(twilioData: any) {
  return TWILIO_CALLER_ID_ERROR_CODES.has(Number(twilioData?.code));
}

function buildCallParams(args: {
  phone: string;
  from: string;
  campaignId: string;
  queueItemId: string;
  callLogId: string;
}) {
  const webhookUrl = `${supabaseUrl}/functions/v1/powerdial-webhook`;

  return new URLSearchParams({
    To: args.phone,
    From: args.from,
    MachineDetection: "Enable",
    AsyncAmd: "true",
    AsyncAmdStatusCallback: `${webhookUrl}?type=amd&campaign_id=${args.campaignId}&queue_item_id=${args.queueItemId}&call_log_id=${args.callLogId}`,
    StatusCallback: `${webhookUrl}?type=status&campaign_id=${args.campaignId}&queue_item_id=${args.queueItemId}&call_log_id=${args.callLogId}`,
    StatusCallbackEvent: "initiated ringing answered completed",
    Url: `${webhookUrl}?type=twiml&campaign_id=${args.campaignId}&queue_item_id=${args.queueItemId}&call_log_id=${args.callLogId}`,
    Timeout: "30",
  });
}

async function resolveTwilioFromNumber(configuredFrom: string) {
  const availableFromNumbers = await listAvailableTwilioFromNumbers();
  const normalizedConfigured = configuredFrom ? normalizePhone(configuredFrom) : "";

  if (normalizedConfigured && availableFromNumbers.includes(normalizedConfigured)) {
    return { resolvedFrom: normalizedConfigured, availableFromNumbers };
  }

  return {
    resolvedFrom: availableFromNumbers[0] || null,
    availableFromNumbers,
  };
}

async function markCallFailed(
  campaign: any,
  queueItem: any,
  callLogId: string | null | undefined,
  meta: Record<string, unknown> = {},
) {
  if (callLogId) {
    await sb.from("powerdial_call_logs").update({
      twilio_status: "failed",
      amd_result: "failed",
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }).eq("id", callLogId);
  }

  await sb.from("powerdial_queue").update({ status: "completed", last_result: "failed" }).eq("id", queueItem.id);
  await sb.from("powerdial_campaigns").update({
    failed_count: campaign.failed_count + 1,
    completed_count: campaign.completed_count + 1,
  }).eq("id", campaign.id);
}

// Normalize phone to E.164
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("+")) return raw.replace(/[^\d+]/g, "");
  return `+${digits}`;
}

async function dialNext(campaignId: string): Promise<{ dialed: boolean; reason?: string }> {
  // Fetch campaign
  const { data: campaign, error: cErr } = await sb
    .from("powerdial_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) return { dialed: false, reason: "campaign_not_found" };
  if (campaign.status !== "running") return { dialed: false, reason: "campaign_not_running" };

  // Find next pending queue item
  const { data: nextItems } = await sb
    .from("powerdial_queue")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("position", { ascending: true })
    .limit(1);

  if (!nextItems || nextItems.length === 0) {
    // Check retry_later items
    const { data: retryItems } = await sb
      .from("powerdial_queue")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "retry_later")
      .lte("retry_at", new Date().toISOString())
      .order("position", { ascending: true })
      .limit(1);

    if (!retryItems || retryItems.length === 0) {
      // Campaign complete
      await sb.from("powerdial_campaigns").update({
        status: "completed",
        ended_at: new Date().toISOString(),
      }).eq("id", campaignId);
      return { dialed: false, reason: "campaign_completed" };
    }

    // Use retry item
    return await placeCall(campaign, retryItems[0]);
  }

  return await placeCall(campaign, nextItems[0]);
}

async function placeCall(campaign: any, queueItem: any): Promise<{ dialed: boolean; reason?: string }> {
  const phone = normalizePhone(queueItem.phone);

  // Mark as dialing
  await sb.from("powerdial_queue").update({ status: "dialing", last_dialed_at: new Date().toISOString() }).eq("id", queueItem.id);
  await sb.from("powerdial_campaigns").update({ current_index: queueItem.position }).eq("id", campaign.id);

  // Create call log entry
  const { data: log } = await sb.from("powerdial_call_logs").insert({
    campaign_id: campaign.id,
    queue_item_id: queueItem.id,
    customer_id: queueItem.customer_id,
    phone,
    attempt_number: queueItem.retry_count + 1,
    twilio_status: "initiated",
  }).select("id").single();

  const callLogId = log?.id;
  const safeCallLogId = callLogId || "";
  const configuredFrom = TWILIO_FROM ? normalizePhone(TWILIO_FROM) : "";
  let selectedFrom = configuredFrom;
  let availableFromNumbers: string[] = [];

  try {
    if (!selectedFrom) {
      const resolution = await resolveTwilioFromNumber(configuredFrom);
      selectedFrom = resolution.resolvedFrom || "";
      availableFromNumbers = resolution.availableFromNumbers;
    }

    if (!selectedFrom) {
      const message = "No verified or purchased Twilio caller ID is available for this account.";
      await markCallFailed(campaign, queueItem, callLogId, {
        twilio_error: { message },
        configured_from: configuredFrom || null,
        available_from_numbers: availableFromNumbers,
        needs_twilio_verified_from: true,
      });
      return { dialed: false, reason: "twilio_from_missing", message } as any;
    }

    let twilioResult = await fetchTwilioJson("/Calls.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildCallParams({
        phone,
        from: selectedFrom,
        campaignId: campaign.id,
        queueItemId: queueItem.id,
        callLogId: safeCallLogId,
      }).toString(),
    });

    let twilioResp = twilioResult.response;
    let twilioData = twilioResult.data;

    if (!twilioResp.ok && isTwilioCallerIdError(twilioData)) {
      const resolution = await resolveTwilioFromNumber(configuredFrom);
      availableFromNumbers = resolution.availableFromNumbers;

      if (resolution.resolvedFrom && resolution.resolvedFrom !== selectedFrom) {
        selectedFrom = resolution.resolvedFrom;
        twilioResult = await fetchTwilioJson("/Calls.json", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: buildCallParams({
            phone,
            from: selectedFrom,
            campaignId: campaign.id,
            queueItemId: queueItem.id,
            callLogId: safeCallLogId,
          }).toString(),
        });
        twilioResp = twilioResult.response;
        twilioData = twilioResult.data;
      }
    }

    if (!twilioResp.ok) {
      console.error("[powerdial] Twilio error:", twilioData);
      await markCallFailed(campaign, queueItem, callLogId, {
        twilio_error: twilioData,
        configured_from: configuredFrom || null,
        resolved_from: selectedFrom || null,
        available_from_numbers: availableFromNumbers,
        needs_twilio_verified_from: isTwilioCallerIdError(twilioData),
      });
      return {
        dialed: false,
        reason: "twilio_error",
        message: twilioData?.message || "Twilio call failed",
        twilio_code: twilioData?.code,
      } as any;
    }

    // Update call log with SID
    await sb.from("powerdial_call_logs").update({
      twilio_call_sid: twilioData.sid,
      twilio_status: "initiated",
      meta: {
        resolved_from: selectedFrom,
        ...(selectedFrom !== configuredFrom ? {
          configured_from: configuredFrom || null,
          auto_switched_from_number: true,
        } : {}),
      },
    }).eq("id", callLogId);

    return { dialed: true, from: selectedFrom } as any;
  } catch (err) {
    console.error("[powerdial] Call placement error:", err);
    await markCallFailed(campaign, queueItem, callLogId, {
      exception: err instanceof Error ? err.message : String(err),
      configured_from: configuredFrom || null,
      resolved_from: selectedFrom || null,
    });
    return {
      dialed: false,
      reason: "exception",
      message: err instanceof Error ? err.message : String(err),
    } as any;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action, campaign_id, campaign_name, lead_ids, phones, settings } = body;

    switch (action) {
      case "validate_config": {
        const resolution = await resolveTwilioFromNumber(TWILIO_FROM);
        return json({
          ok: true,
          configured_from: TWILIO_FROM ? normalizePhone(TWILIO_FROM) : null,
          resolved_from: resolution.resolvedFrom,
          available_from_numbers: resolution.availableFromNumbers,
          has_valid_from_number: Boolean(resolution.resolvedFrom),
        });
      }

      case "create_campaign": {
        // Create campaign + populate queue from lead_ids or raw phones
        const userId = body.user_id;
        if (!userId) return json({ error: "user_id required" }, 400);

        const { data: campaign, error } = await sb.from("powerdial_campaigns").insert({
          created_by: userId,
          name: campaign_name || "Untitled Campaign",
          settings: settings || undefined,
        }).select("*").single();

        if (error) return json({ error: error.message }, 500);

        // Populate queue
        const queueRows: any[] = [];
        if (lead_ids?.length) {
          const { data: customers } = await sb.from("customers").select("id, full_name, phone").in("id", lead_ids);
          (customers || []).forEach((c: any, i: number) => {
            if (c.phone) {
              queueRows.push({
                campaign_id: campaign.id,
                customer_id: c.id,
                phone: c.phone,
                contact_name: c.full_name,
                position: i,
              });
            }
          });
        } else if (phones?.length) {
          phones.forEach((p: any, i: number) => {
            queueRows.push({
              campaign_id: campaign.id,
              phone: typeof p === "string" ? p : p.phone,
              contact_name: typeof p === "string" ? null : p.name,
              position: i,
            });
          });
        }

        if (queueRows.length > 0) {
          await sb.from("powerdial_queue").insert(queueRows);
        }

        await sb.from("powerdial_campaigns").update({ total_leads: queueRows.length }).eq("id", campaign.id);

        return json({ campaign_id: campaign.id, queued: queueRows.length });
      }

      case "start":
      case "resume": {
        await sb.from("powerdial_campaigns").update({
          status: "running",
          ...(action === "start" ? { started_at: new Date().toISOString() } : {}),
        }).eq("id", campaign_id);
        // Dial first number
        const result = await dialNext(campaign_id);
        return json({ ok: true, ...result });
      }

      case "pause": {
        await sb.from("powerdial_campaigns").update({ status: "paused" }).eq("id", campaign_id);
        return json({ ok: true });
      }

      case "stop": {
        await sb.from("powerdial_campaigns").update({ status: "stopped", ended_at: new Date().toISOString() }).eq("id", campaign_id);
        return json({ ok: true });
      }

      case "skip": {
        // Skip current dialing item
        const { data: dialingItems } = await sb
          .from("powerdial_queue")
          .select("id")
          .eq("campaign_id", campaign_id)
          .eq("status", "dialing")
          .limit(1);

        if (dialingItems?.length) {
          await sb.from("powerdial_queue").update({ status: "skipped", last_result: "skipped" }).eq("id", dialingItems[0].id);
        }

        const result = await dialNext(campaign_id);
        return json({ ok: true, ...result });
      }

      case "advance": {
        // Called after a call completes to move to next number
        const delay = body.delay_ms || 2000;
        // Wait before dialing next
        await new Promise(r => setTimeout(r, Math.min(delay, 5000)));
        const result = await dialNext(campaign_id);
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
