import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LR_USER = (Deno.env.get("LEADSRAIN_USERNAME") || "").trim();
const LR_KEY = (Deno.env.get("LEADSRAIN_API_KEY") || "").trim();
const LR_ENDPOINT = "https://api.leadsrain.com/ringless/api/add_posted_lead.php";

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normPhone(raw: string): { ok: boolean; ten?: string; e164?: string; error?: string } {
  const digits = String(raw || "").replace(/\D/g, "");
  let ten = digits;
  if (digits.length === 11 && digits.startsWith("1")) ten = digits.slice(1);
  if (ten.length !== 10) return { ok: false, error: "Phone must be 10-digit US" };
  return { ok: true, ten, e164: `+1${ten}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    if (!LR_USER || !LR_KEY) return json({ ok: false, error: "Missing LeadsRain credentials" }, 500);

    const body = await req.json().catch(() => ({}));
    const {
      phone_number,
      first_name,
      last_name,
      email,
      caller_id,
      campaign_name,
      audio_url,
      list_id,
      lead_id,
      contact_id,
      customer_id,
      send_voidfix = true,
      voidfix_template = "Hey, this is Warren — just left you a quick voicemail.",
    } = body || {};

    const ph = normPhone(phone_number);
    if (!ph.ok) return json({ ok: false, error: ph.error }, 400);

    // Resolve defaults from settings (list_id is REQUIRED for LeadsRain to actually drop voicemail)
    const { data: settings } = await svc.from("leadsrain_settings").select("default_list_id, default_caller_id").limit(1).maybeSingle();
    const finalListId = list_id || settings?.default_list_id || null;
    const finalCallerId = caller_id || settings?.default_caller_id || null;

    if (!finalListId) {
      return json({
        ok: false,
        error: "Missing LeadsRain List ID. Open Settings on the LeadsRain page and paste your List ID (from LeadsRain dashboard → RVM → Lead Lists). Without it, no voicemail is dropped — Postlead just returns HTTP 200.",
      }, 400);
    }

    const reqPayload: Record<string, any> = {
      username: LR_USER,
      api_key: LR_KEY,
      list_id: finalListId,
      phone_number: ph.ten,
      first_name: first_name || "",
      last_name: last_name || "",
      email: email || "",
      country_code: "USA",
      phone_code: "1",
      scrub_lead: "tcpa_check",
      check_duplicate: "CHECK_DUPLICATE_IN_CAMPAIGN",
    };
    if (finalCallerId) reqPayload.caller_id = finalCallerId;

    // Insert pending row
    const { data: row, error: insErr } = await svc
      .from("leadsrain_submissions")
      .insert({
        lead_id: lead_id || null,
        contact_id: contact_id || null,
        customer_id: customer_id || null,
        phone_number: ph.e164,
        caller_id: caller_id || null,
        campaign_name: campaign_name || null,
        audio_url: audio_url || null,
        status: "submitted_to_leadsrain",
        raw_request: { ...reqPayload, api_key: "***" },
        submitted_by: userId,
      })
      .select("*")
      .single();
    if (insErr || !row) return json({ ok: false, error: insErr?.message || "Insert failed" }, 500);

    // Call LeadsRain Postlead
    let lrJson: any = null;
    let httpOk = false;
    let httpStatus = 0;
    let errMsg: string | null = null;
    try {
      const r = await fetch(LR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify(reqPayload),
        signal: AbortSignal.timeout(20000),
      });
      httpStatus = r.status;
      const txt = await r.text();
      const raw = txt.trim();
      try { lrJson = raw ? JSON.parse(raw) : { raw: "", accepted: true }; } catch { lrJson = { raw }; }
      const statusText = String(lrJson?.status || lrJson?.Status || "").toLowerCase();
      const messageText = String(lrJson?.msg || lrJson?.message || lrJson?.error || lrJson?.raw || "").toLowerCase();
      const explicitFailure = /\b(error|fail|failed|invalid|duplicate|denied|unauthorized)\b/.test(statusText) || /\b(error|fail|failed|invalid|denied|unauthorized)\b/.test(messageText);
      httpOk = r.ok && !explicitFailure && (raw === "" || !!lrJson?.lead_id || ["success", "ok", "accepted", "submitted"].includes(statusText));
      if (!httpOk) errMsg = lrJson?.msg || lrJson?.message || lrJson?.error || lrJson?.raw || `HTTP ${r.status}`;
    } catch (e: any) {
      errMsg = e?.message || String(e);
    }

    const newStatus = httpOk ? "accepted_by_api" : "failed_to_submit";
    const lrLeadId = lrJson?.lead_id?.toString() || null;
    const lrMsg = lrJson?.msg || lrJson?.message || (httpOk && lrJson?.accepted ? "LeadsRain accepted request with empty HTTP 200 response" : null);

    await svc.from("leadsrain_submissions").update({
      status: newStatus,
      leadsrain_lead_id: lrLeadId,
      leadsrain_message: lrMsg,
      raw_response: lrJson,
      error_message: errMsg,
    }).eq("id", row.id);

    // Trigger VoidFix SMS
    let voidfixSent = false;
    let voidfixErr: string | null = null;
    if (httpOk && send_voidfix) {
      try {
        const smsResp = await sb.functions.invoke("powerdial-sms", {
          body: { action: "send", to: ph.e164, body: voidfix_template, customer_id: customer_id || null },
        });
        const d: any = smsResp?.data || {};
        if (smsResp.error || d?.ok === false) {
          voidfixErr = smsResp.error?.message || d?.error || "VoidFix error";
        } else {
          voidfixSent = true;
          await svc.from("leadsrain_submissions").update({
            voidfix_sms_sent: true,
            voidfix_sms_at: new Date().toISOString(),
            status: "sms_followup_sent",
          }).eq("id", row.id);
        }
      } catch (e: any) { voidfixErr = e?.message || String(e); }
    }

    return json({
      ok: httpOk,
      submission_id: row.id,
      status: voidfixSent ? "sms_followup_sent" : newStatus,
      leadsrain_lead_id: lrLeadId,
      leadsrain_message: lrMsg,
      voidfix_sms_sent: voidfixSent,
      voidfix_error: voidfixErr,
      http_status: httpStatus,
      error: errMsg,
    }, 200);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
