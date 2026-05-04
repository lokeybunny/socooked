import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { postLead, parseProviderId, hasCreds } from "../_shared/leadsrainClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function normalizePhoneE164(raw: string): { ok: boolean; e164?: string; ten?: string; error?: string } {
  const digits = String(raw || "").replace(/\D/g, "");
  let ten = digits;
  if (digits.length === 11 && digits.startsWith("1")) ten = digits.slice(1);
  if (ten.length !== 10) return { ok: false, error: "Phone must be a 10-digit US number" };
  return { ok: true, e164: `+1${ten}`, ten };
}

async function logTimeline(row: {
  lead_id?: string | null;
  customer_id?: string | null;
  event_type: string;
  event_title: string;
  event_description?: string;
  provider?: string;
  provider_record_id?: string | null;
  metadata?: any;
}) {
  await svc.from("lead_timeline_events").insert({
    lead_id: row.lead_id || null,
    customer_id: row.customer_id || null,
    event_type: row.event_type,
    event_title: row.event_title,
    event_description: row.event_description || null,
    provider: row.provider || null,
    provider_record_id: row.provider_record_id || null,
    metadata: row.metadata || {},
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // JWT auth — admin-only
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    if (!hasCreds()) return json({ ok: false, error: "Server missing LeadsRain credentials" }, 500);

    const body = await req.json().catch(() => ({}));
    const { customer_id, lead_id, phone_number, campaign_id, first_name, last_name } = body || {};

    // Validate phone
    const ph = normalizePhoneE164(phone_number);
    if (!ph.ok) return json({ ok: false, error: ph.error }, 400);

    // Resolve campaign — explicit or default-active
    let campaign: any = null;
    if (campaign_id) {
      const { data } = await svc.from("leadsrain_campaigns").select("*").eq("id", campaign_id).maybeSingle();
      campaign = data;
    }
    if (!campaign) {
      const { data } = await svc.from("leadsrain_campaigns").select("*").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      campaign = data;
    }
    if (!campaign) return json({ ok: false, error: "No active LeadsRain campaign configured. Add one in Settings → LeadsRain." }, 400);
    if (!campaign.provider_list_id) return json({ ok: false, error: "Campaign is missing provider_list_id (LeadsRain list ID)" }, 400);

    // Settings — VoidFix follow-up
    const { data: settings } = await svc.from("leadsrain_settings").select("*").limit(1).maybeSingle();

    // Opt-out check
    let optedOut = false;
    let cust: any = null;
    if (customer_id) {
      const { data } = await svc.from("customers").select("id, full_name, meta").eq("id", customer_id).maybeSingle();
      cust = data;
      optedOut = String(cust?.meta?.sms_opt_out || "").toLowerCase() === "true";
    }

    // Idempotency — same phone+campaign in last 30 min
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: dup } = await svc.from("leadsrain_drops")
      .select("id, status, created_at")
      .eq("phone_number", ph.e164)
      .eq("campaign_id", campaign.id)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dup) {
      return json({ ok: false, error: "Duplicate: same number was sent in the last 30 minutes", drop_id: dup.id, status: dup.status }, 409);
    }

    // Insert queued row
    const { data: drop, error: dropErr } = await svc.from("leadsrain_drops").insert({
      lead_id: lead_id || null,
      customer_id: customer_id || null,
      campaign_id: campaign.id,
      phone_number: ph.e164,
      caller_id: campaign.caller_id,
      status: "queued",
      provider_campaign_id: campaign.provider_campaign_id,
      provider_list_id: campaign.provider_list_id,
      raw_request: { phone: ph.e164, list_id: campaign.provider_list_id, first_name, last_name },
    }).select("*").single();
    if (dropErr || !drop) return json({ ok: false, error: dropErr?.message || "Failed to create drop record" }, 500);

    await logTimeline({
      lead_id, customer_id, event_type: "voice_drop_queued",
      event_title: `Voice drop queued for ${ph.e164}`,
      provider: "leadsrain", provider_record_id: drop.id,
      metadata: { drop_id: drop.id, campaign_id: campaign.id, campaign_name: campaign.campaign_name },
    });

    // Call LeadsRain
    const lr = await postLead({
      list_id: campaign.provider_list_id,
      phone_number: ph.ten!,
      first_name: first_name || cust?.full_name?.split(" ")[0],
      last_name: last_name || cust?.full_name?.split(" ").slice(1).join(" "),
    });

    const providerLeadId = parseProviderId(lr.raw);
    const newStatus = lr.ok ? "sent" : "failed";

    await svc.from("leadsrain_drops").update({
      status: newStatus,
      provider_lead_id: providerLeadId,
      raw_response: lr.raw,
      error_message: lr.ok ? null : (lr.error || "LeadsRain rejected request"),
    }).eq("id", drop.id);

    await logTimeline({
      lead_id, customer_id,
      event_type: lr.ok ? "voice_drop_sent" : "voice_drop_failed",
      event_title: lr.ok ? `Voice drop sent to ${ph.e164}` : `Voice drop failed for ${ph.e164}`,
      event_description: lr.ok ? undefined : (lr.error || "LeadsRain rejected request"),
      provider: "leadsrain", provider_record_id: providerLeadId || drop.id,
      metadata: { drop_id: drop.id, status: newStatus, raw_msg: lr.raw?.msg || lr.raw?.message },
    });

    if (!lr.ok) {
      return json({ ok: false, drop_id: drop.id, status: "failed", error: lr.error || "LeadsRain rejected request", raw: lr.raw }, 502);
    }

    // VoidFix follow-up SMS — only fire when LeadsRain returns a concrete lead/drop id.
    // Delivery polling can send the SMS later once LeadsRain reports completed/delivered.
    let voidfixSent = false;
    let voidfixError: string | null = null;
    const followupEnabled = settings?.enable_voidfix_followup !== false;
    if (followupEnabled && !optedOut && providerLeadId) {
      try {
        const tmpl = settings?.voidfix_template || "Hey, this is Warren — just left you a quick voicemail.";
        const smsResp = await sb.functions.invoke("powerdial-sms", {
          body: { action: "send", to: ph.e164, body: tmpl, customer_id: customer_id || null },
        });
        const smsData: any = smsResp?.data || {};
        if (smsResp.error || smsData?.ok === false) {
          voidfixError = smsResp.error?.message || smsData?.error || "VoidFix returned an error";
        } else {
          voidfixSent = true;
          await svc.from("leadsrain_drops").update({
            voidfix_sms_sent_at: new Date().toISOString(),
            voidfix_sms_message_id: smsData?.id || smsData?.message_id || null,
          }).eq("id", drop.id);
          await logTimeline({
            lead_id, customer_id, event_type: "voidfix_sms_sent",
            event_title: `VoidFix follow-up SMS sent to ${ph.e164}`,
            provider: "voidfix", provider_record_id: smsData?.id || null,
            metadata: { drop_id: drop.id, template: tmpl },
          });
        }
      } catch (e: any) {
        voidfixError = e?.message || String(e);
      }
      if (voidfixError) {
        await svc.from("leadsrain_drops").update({ voidfix_sms_error: voidfixError }).eq("id", drop.id);
        await logTimeline({
          lead_id, customer_id, event_type: "voidfix_sms_failed",
          event_title: `VoidFix follow-up SMS failed`,
          event_description: voidfixError,
          provider: "voidfix", metadata: { drop_id: drop.id },
        });
      }
    }

    return json({ ok: true, drop_id: drop.id, status: "sent", provider_lead_id: providerLeadId, voidfix_sms_sent: voidfixSent, voidfix_error: voidfixError });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
