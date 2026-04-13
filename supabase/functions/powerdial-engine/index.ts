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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
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

  // Place Twilio call with AMD
  const webhookUrl = `${supabaseUrl}/functions/v1/powerdial-webhook`;
  const params = new URLSearchParams({
    To: phone,
    From: TWILIO_FROM,
    MachineDetection: "DetectMessageEnd",
    AsyncAmd: "true",
    AsyncAmdStatusCallback: `${webhookUrl}?type=amd&campaign_id=${campaign.id}&queue_item_id=${queueItem.id}&call_log_id=${callLogId}`,
    StatusCallback: `${webhookUrl}?type=status&campaign_id=${campaign.id}&queue_item_id=${queueItem.id}&call_log_id=${callLogId}`,
    StatusCallbackEvent: "initiated ringing answered completed",
    Url: `${webhookUrl}?type=twiml&campaign_id=${campaign.id}&queue_item_id=${queueItem.id}&call_log_id=${callLogId}`,
    Timeout: "30",
  });

  try {
    const twilioResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const twilioData = await twilioResp.json();

    if (!twilioResp.ok) {
      console.error("[powerdial] Twilio error:", twilioData);
      // Mark failed
      await sb.from("powerdial_call_logs").update({ twilio_status: "failed", amd_result: "failed", meta: { twilio_error: twilioData } }).eq("id", callLogId);
      await sb.from("powerdial_queue").update({ status: "completed", last_result: "failed" }).eq("id", queueItem.id);
      await sb.from("powerdial_campaigns").update({
        failed_count: campaign.failed_count + 1,
        completed_count: campaign.completed_count + 1,
      }).eq("id", campaign.id);
      return { dialed: false, reason: "twilio_error" };
    }

    // Update call log with SID
    await sb.from("powerdial_call_logs").update({
      twilio_call_sid: twilioData.sid,
      twilio_status: "initiated",
    }).eq("id", callLogId);

    return { dialed: true };
  } catch (err) {
    console.error("[powerdial] Call placement error:", err);
    await sb.from("powerdial_call_logs").update({ twilio_status: "failed" }).eq("id", callLogId);
    await sb.from("powerdial_queue").update({ status: "completed", last_result: "failed" }).eq("id", queueItem.id);
    return { dialed: false, reason: "exception" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action, campaign_id, campaign_name, lead_ids, phones, settings } = body;

    switch (action) {
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
