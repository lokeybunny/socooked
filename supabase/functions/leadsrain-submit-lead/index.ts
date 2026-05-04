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
const RAW_PROXY_URL = (Deno.env.get("LEADSRAIN_PROXY_URL") || "").replace(/\/+$/, "");
const LR_PROXY_URL = /^https:\/\//i.test(RAW_PROXY_URL) && !/\.leadsrain\.com/i.test(RAW_PROXY_URL) ? RAW_PROXY_URL : "";
// CRM-only mode: PostLead HTTPS endpoint is the only confirmed-working route.
// Legacy s1/s2/s3 shards timeout from Supabase egress; proxy is optional.
const LR_POSTLEAD_ENDPOINT = "https://api.leadsrain.com/ringless/api/add_posted_lead.php";
const LR_ENDPOINTS = [LR_POSTLEAD_ENDPOINT];

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

function normCallerId(raw: string | null | undefined): string | null {
  // Strip +1, spaces, dashes, parens — return 10 digits only.
  const digits = String(raw || "").replace(/\D/g, "");
  let ten = digits;
  if (digits.length === 11 && digits.startsWith("1")) ten = digits.slice(1);
  if (ten.length !== 10) return null;
  return ten;
}

function maskPayload(payload: Record<string, any>) {
  return { ...payload, username: "***", api_key: "***" };
}

function normalizeLeadPhone(raw: unknown): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.slice(-10);
  return ten.length === 10 ? ten : null;
}

function findLeadInList(raw: any, tenDigitPhone: string): any | null {
  const seen = new Set<any>();
  const visit = (node: any): any | null => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    if (!Array.isArray(node)) {
      const phone = normalizeLeadPhone(node.phone_number ?? node.phone ?? node.number ?? node.lead_phone ?? node.mobile ?? node.recipient);
      if (phone === tenDigitPhone) return node;
    }
    const values = Array.isArray(node) ? node : Object.values(node);
    for (const value of values) {
      const found = visit(value);
      if (found) return found;
    }
    return null;
  };
  return visit(raw);
}

function encodeUrlPayload(payload: Record<string, any>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) usp.append(k, String(v));
  return usp.toString();
}

function encodeMultipartPayload(payload: Record<string, any>, boundary: string) {
  return Object.entries(payload).map(([key, value]) => (
    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`
  )).join("") + `--${boundary}--\r\n`;
}

function buildBody(payload: Record<string, any>, contentType: string, boundary?: string) {
  if (contentType === "application/x-www-form-urlencoded") return encodeUrlPayload(payload);
  if (contentType === "multipart/form-data") return encodeMultipartPayload(payload, boundary || "----LeadsRainBoundary");
  return JSON.stringify(payload);
}

async function checkLeadVisibleInList(listId: string, tenDigitPhone: string) {
  const payload = { username: LR_USER, api_key: LR_KEY, list_id: listId };
  const candidates = [
    ...(LR_PROXY_URL ? [`${LR_PROXY_URL}/rvm/api/leadlist/view_api`] : []),
    "https://s2.leadsrain.com/rvm/api/leadlist/view_api",
    "http://s2.leadsrain.com/rvm/api/leadlist/view_api",
  ];
  let last = { ok: false, status: 0, error: "List visibility check did not run", matched_lead: null as any, raw_text: "" };
  for (const endpoint of candidates) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });
      const rawText = await resp.text();
      let parsed: any = null;
      try { parsed = rawText.trim() ? JSON.parse(rawText) : null; } catch { parsed = rawText; }
      const matchedLead = findLeadInList(parsed, tenDigitPhone);
      last = { ok: resp.ok, status: resp.status, error: matchedLead ? undefined : "Lead not visible in list response", matched_lead: matchedLead, raw_text: rawText.slice(0, 500) };
      if (matchedLead || resp.ok) break;
    } catch (e: any) {
      last = { ok: false, status: 0, error: e?.message || String(e), matched_lead: null, raw_text: "" };
    }
  }
  return last;
}

// Flexible PostLead response parser. Handles JSON objects, plain strings, and HTML.
// HTTP 200 + no explicit failure markers = accepted.
function parsePostLeadResponse(httpStatus: number, rawText: string, json: any) {
  const text = String(rawText || "").trim();
  const lower = text.toLowerCase();
  const FAIL_RX = /\b(invalid api key|invalid username|missing phone|duplicate|campaign not found|failed|failure|denied|unauthorized|missing|required|error)\b/;
  const SUCCESS_RX = /\b(success|accepted|added|submitted|queued|lead_id|posted)\b/;

  let provider_status = "";
  let provider_lead_id: string | null = null;
  let message: string | null = null;

  if (json && typeof json === "object") {
    provider_status = String(json.status ?? json.Status ?? (json.success === true ? "success" : json.success === false ? "error" : "")).toLowerCase();
    provider_lead_id =
      json.lead_id?.toString?.() ??
      json.id?.toString?.() ??
      json.posted_lead_id?.toString?.() ??
      json.data?.lead_id?.toString?.() ??
      json.data?.id?.toString?.() ??
      null;
    message = json.msg ?? json.message ?? json.error ?? json.data?.message ?? null;
  } else if (text) {
    message = text.length > 500 ? text.slice(0, 500) : text;
  }

  const haystack = `${provider_status} ${message ?? ""} ${lower}`;
  const explicitFail = FAIL_RX.test(haystack);
  const explicitSuccess = !!provider_lead_id || SUCCESS_RX.test(haystack) || provider_status === "success" || (json && json.success === true);

  // mode: accepted = explicit success markers / lead_id (REAL acceptance)
  //       parser_needs_mapping = HTTP 200 with a parsable body but unknown shape
  //       rejected = explicit failure markers OR empty 200 (LeadsRain returns empty body when lead is silently dropped)
  //       failed = non-2xx / network
  const trimmedText = (text || "").trim();
  const hasBody = !!json || trimmedText.length > 0;
  let mode: "accepted" | "parser_needs_mapping" | "rejected" | "failed" = "failed";
  let ok = false;
  if (httpStatus >= 200 && httpStatus < 300) {
    if (explicitSuccess) { mode = "accepted"; ok = true; }
    else if (explicitFail) { mode = "rejected"; ok = false; }
    else if (!hasBody) { mode = "rejected"; ok = false; message = message || "Rejected. Payload sent, but LeadsRain returned empty response."; }
    else { mode = "parser_needs_mapping"; ok = false; }
  } else {
    mode = "failed";
  }

  if (!ok && !message) message = explicitFail ? "LeadsRain rejected the lead" : `HTTP ${httpStatus}`;
  return { ok, mode, provider_status, provider_lead_id, message, raw: json ?? text };
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
      campaign_id: campaign_id_in,
      audio_url,
      list_id,
      list_id_field,        // override which key name to use for list_id
      content_type,         // "json" | "form"
      extra_payload,        // arbitrary extra fields for manual tester
      lead_id,
      contact_id,
      customer_id,
      send_voidfix = true,
      voidfix_template = "Hey, this is Warren — just left you a quick voicemail.",
    } = body || {};

    const ph = normPhone(phone_number);
    if (!ph.ok) return json({ ok: false, error: ph.error }, 400);

    // Resolve defaults from settings (list_id + caller_id REQUIRED; integration must be active)
    const { data: settings } = await svc
      .from("leadsrain_settings")
      .select("default_list_id, default_caller_id, default_campaign_external_id, is_active")
      .limit(1)
      .maybeSingle();

    if (settings && (settings as any).is_active === false) {
      return json({ ok: false, error: "LeadsRain integration is disabled. Toggle it on in Settings before submitting." }, 400);
    }

    const rawListId = list_id ?? settings?.default_list_id ?? null;
    const listIdStr = String(rawListId ?? "").trim();
    const finalListId = (!listIdStr || /^(undefined|null)$/i.test(listIdStr)) ? null : listIdStr;
    const finalCallerId = normCallerId(caller_id || settings?.default_caller_id || null);
    const finalCampaignId = campaign_id_in || (settings as any)?.default_campaign_external_id || null;

    if (!finalListId) {
      return json({ ok: false, error: "Missing LeadsRain list_id. Choose an active LeadsRain list connected to an RVM campaign.", missing: "list_id" }, 400);
    }
    if (!finalCallerId) {
      return json({ ok: false, error: "Missing/invalid Caller ID. Must be a 10-digit number verified in LeadsRain.", missing: "caller_id" }, 400);
    }

    const phoneFieldVariants: string[] = ["phone_number", "phone", "number", "lead_phone"];
    const requestedContentType = String(content_type || "").trim().toLowerCase();
    const requestedPhoneField = String((body as any)?.phone_field || "").trim();

    function buildPayload(phoneKey: string): Record<string, any> {
      // Send list_id as an integer per docs. Minimal clean payload.
      const listIdNum = Number(finalListId);
      const p: Record<string, any> = {
        username: LR_USER,
        api_key: LR_KEY,
        list_id: Number.isFinite(listIdNum) ? listIdNum : finalListId,
        country_code: "USA",
        phone_code: "1",
        scrub_lead: "no_scrub",
        check_duplicate: "NO_DUPLICATE_CHECK",
      };
      p[phoneKey || "phone_number"] = ph.ten;
      // Optional contact info — only include when provided.
      if (first_name) p.first_name = first_name;
      if (last_name) p.last_name = last_name;
      if (email) p.email = email;
      if (extra_payload && typeof extra_payload === "object") Object.assign(p, extra_payload);
      return p;
    }

    const initialPayload = buildPayload("phone_number");

    // Insert pending row
    const { data: row, error: insErr } = await svc
      .from("leadsrain_submissions")
      .insert({
        lead_id: lead_id || null,
        contact_id: contact_id || null,
        customer_id: customer_id || null,
        phone_number: ph.e164,
        caller_id: finalCallerId || null,
        campaign_name: campaign_name || null,
        audio_url: audio_url || null,
        status: "submitted_to_leadsrain",
        raw_request: maskPayload(initialPayload),
        submitted_by: userId,
      })
      .select("*")
      .single();
    if (insErr || !row) return json({ ok: false, error: insErr?.message || "Insert failed" }, 500);

    type AttemptDebug = {
      phone_field: string;
      content_type: string;
      http_status: number;
      raw_text: string;
      mode: string;
      submitted_payload: Record<string, any>;
      final_post_body: string;
      lead_visible_in_list: boolean;
      leadsrain_list_check?: { ok: boolean; status: number; error?: string; matched_lead?: any };
    };
    const contentTypeVariants = requestedContentType === "json" || requestedContentType === "application/json"
      ? ["application/json"]
      : requestedContentType === "multipart" || requestedContentType === "multipart/form-data"
      ? ["multipart/form-data"]
      : requestedContentType === "form" || requestedContentType === "application/x-www-form-urlencoded"
      ? ["application/x-www-form-urlencoded"]
      : ["application/x-www-form-urlencoded", "multipart/form-data", "application/json"];
    const activePhoneFields = requestedPhoneField ? [requestedPhoneField] : phoneFieldVariants;
    const attempts: AttemptDebug[] = [];
    let lrJson: any = null;
    let lrRawText = "";
    let httpOk = false;
    let httpStatus = 0;
    let errMsg: string | null = null;
    let usedEndpoint: string | null = null;
    let usedPhoneField = activePhoneFields[0] || "phone_number";
    let usedContentType = contentTypeVariants[0];
    let lastPayload: Record<string, any> = initialPayload;
    let leadVisibleInList = false;
    let listVisibilityCheck: any = null;
    let parsed: { ok: boolean; mode: "accepted" | "parser_needs_mapping" | "rejected" | "failed"; provider_status: string; provider_lead_id: string | null; message: string | null; raw: any } = {
      ok: false, mode: "failed", provider_status: "", provider_lead_id: null, message: null, raw: null,
    };

    try {
      outer: for (const endpoint of LR_ENDPOINTS) {
        for (const ct of contentTypeVariants) {
          for (const phoneField of activePhoneFields) {
          usedEndpoint = endpoint;
          usedPhoneField = phoneField;
          const payload = buildPayload(phoneField);
          lastPayload = payload;
          const headers: Record<string, string> = { "Cache-Control": "no-cache", "Accept": "application/json" };
          let bodyStr: string;
          if (ct === "application/x-www-form-urlencoded") {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            bodyStr = encodeUrlPayload(payload);
            usedContentType = "application/x-www-form-urlencoded";
          } else if (ct === "multipart/form-data") {
            const boundary = `----LeadsRain${crypto.randomUUID().replace(/-/g, "")}`;
            headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
            bodyStr = encodeMultipartPayload(payload, boundary);
            usedContentType = "multipart/form-data";
          } else {
            headers["Content-Type"] = "application/json";
            bodyStr = JSON.stringify(payload);
            usedContentType = "application/json";
          }
          const sanitizedBodyStr = bodyStr.split(LR_USER).join("***").split(LR_KEY).join("***");
          const r = await fetch(endpoint, { method: "POST", headers, body: bodyStr, signal: AbortSignal.timeout(20000) });
          httpStatus = r.status;
          lrRawText = (await r.text()) || "";
          const trimmed = lrRawText.trim();
          try { lrJson = trimmed ? JSON.parse(trimmed) : null; } catch { lrJson = null; }
          parsed = parsePostLeadResponse(r.status, lrRawText, lrJson);
          httpOk = parsed.ok;
          errMsg = httpOk ? null : (parsed.message || `HTTP ${r.status}`);
          let matchedLead: any = null;
          let visible = false;
          try {
            const listCheck = await checkLeadVisibleInList(finalListId, ph.ten!);
            matchedLead = listCheck.matched_lead;
            visible = !!matchedLead;
            listVisibilityCheck = { ok: listCheck.ok, status: listCheck.status, error: listCheck.error, matched_lead: matchedLead ? { ...matchedLead, api_key: undefined } : null, raw_text: listCheck.raw_text };
          } catch (e: any) {
            listVisibilityCheck = { ok: false, status: 0, error: e?.message || String(e), matched_lead: null };
          }
          leadVisibleInList = visible;
          if (visible && r.status >= 200 && r.status < 300) {
            parsed = { ...parsed, ok: true, mode: "accepted", message: parsed.message || "Lead appeared inside LeadsRain list after test." };
            httpOk = true;
            errMsg = null;
          }
          attempts.push({
            phone_field: phoneField,
            content_type: usedContentType,
            http_status: r.status,
            raw_text: trimmed.slice(0, 500),
            mode: parsed.mode,
            submitted_payload: maskPayload(payload),
            final_post_body: sanitizedBodyStr,
            lead_visible_in_list: visible,
            leadsrain_list_check: listVisibilityCheck,
          });
          if (httpOk || parsed.mode === "parser_needs_mapping") break outer;
          if (/invalid username|api key|invalid api/i.test(errMsg || "")) break outer;
          if (trimmed.length > 0) break outer;
          }
        }
      }
    } catch (e: any) {
      errMsg = e?.message || String(e);
      parsed.mode = "failed";
    }

    // Map parser mode -> CRM submission status
    const STATUS_BY_MODE: Record<string, string> = {
      accepted: "accepted_by_api",
      parser_needs_mapping: "api_connected_parser_needs_mapping",
      rejected: "rejected",
      failed: "failed_to_submit",
    };
    const newStatus = STATUS_BY_MODE[parsed.mode] || "failed_to_submit";
    const lrLeadId = parsed.provider_lead_id;
    const lrMsg = parsed.message;

    await svc.from("leadsrain_submissions").update({
      status: newStatus,
      leadsrain_lead_id: lrLeadId,
      leadsrain_message: lrMsg,
      raw_response: { parsed, json: lrJson, raw_text: lrRawText, http_status: httpStatus, endpoint: usedEndpoint?.replace(/^https?:\/\//, ""), mode: parsed.mode },
      error_message: errMsg,
    }).eq("id", row.id);

    // Trigger VoidFix SMS ONLY when LeadsRain explicitly accepted the lead (real lead_id / success marker).
    // Empty 200 or parser_needs_mapping does NOT count — the voicemail was not actually queued.
    let voidfixSent = false;
    let voidfixErr: string | null = null;
    if (parsed.mode === "accepted" && send_voidfix) {
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

    const userMessage =
      parsed.mode === "accepted" ? "LeadsRain accepted the lead." :
      parsed.mode === "parser_needs_mapping" ? "LeadsRain returned 200 but no lead_id — NOT counted as accepted. Inspect the raw response and confirm in LeadsRain dashboard before relying on it." :
      parsed.mode === "rejected" ? (lrMsg || errMsg || "LeadsRain did not accept the lead.") :
      (errMsg || "LeadsRain submission failed.");

    return json({
      ok: httpOk,
      submission_id: row.id,
      status: voidfixSent ? "sms_followup_sent" : newStatus,
      mode: parsed.mode,
      user_message: userMessage,
      leadsrain_lead_id: lrLeadId,
      leadsrain_message: lrMsg,
      voidfix_sms_sent: voidfixSent,
      voidfix_error: voidfixErr,
      http_status: httpStatus,
      error: errMsg,
      list_id: finalListId,
      caller_id: finalCallerId,
      campaign_id: finalCampaignId,
      list_id_field: usedListField,
      content_type: usedContentType,
      endpoint: usedEndpoint,
      attempts,
      submitted_payload: { ...lastPayload, api_key: "***", username: "***" },
      raw_response: { json: lrJson, raw_text: lrRawText, http_status: httpStatus, endpoint: usedEndpoint },
    }, 200);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
