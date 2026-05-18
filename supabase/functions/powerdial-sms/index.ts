// PowerDial SMS — VoidFix integration (send + receive via connected Android device)
// - POST {action:"send", to, body, customer_id?} → sends SMS via VoidFix, logs as outbound
// - POST {action:"list", phone?, limit?}        → returns recent SMS
// - POST {action:"threads", limit?}             → grouped threads
// - POST (form-encoded or JSON from VoidFix webhook) → logs inbound

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VOIDFIX_API_KEY = Deno.env.get("VOIDFIX_API_KEY") || "";
const VOIDFIX_DEVICE_ID = Deno.env.get("VOIDFIX_DEVICE_ID") || "";
const VOIDFIX_SEND_URL = "https://sms.voidfix.com/services/send.php";
const VOIDFIX_READ_URL = "https://sms.voidfix.com/services/read-messages.php";
const MMS_RESEND_NUMBER = "+17028322317";
const MMS_RESEND_MESSAGE = `I got your message, but this line cannot receive picture attachments. Please resend the photo to ${MMS_RESEND_NUMBER} so it comes through on my end.`;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_PRIMARY_AUTH_TOKEN") || Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";

async function sendTwilioMms(to: string, body: string, mediaUrls: string[]): Promise<{ ok: boolean; id?: string; error?: string; status?: number; raw?: any }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { ok: false, error: "missing_twilio_credentials" };
  }
  const toNum = normalizePhone(to);
  if (!toNum) return { ok: false, error: "invalid_to" };

  const form = new URLSearchParams();
  form.set("To", toNum);
  form.set("From", normalizePhone(TWILIO_FROM_NUMBER));
  if (body) form.set("Body", body);
  for (const u of mediaUrls.slice(0, 10)) form.append("MediaUrl", u);

  try {
    const resp = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    }, 15000, "twilio_mms");
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, status: resp.status, error: data?.message || `twilio_${resp.status}`, raw: data };
    return { ok: true, id: data?.sid || null, raw: data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "twilio_fetch_failed" };
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function runInBackground(work: Promise<unknown>, label: string) {
  const guarded = work.catch((e) => console.error(`[powerdial-sms] ${label} background error`, e));
  try {
    (globalThis as any).EdgeRuntime?.waitUntil?.(guarded);
  } catch {
    // ignore; the promise is already guarded
  }
}

async function withTimeout<T>(work: PromiseLike<T>, ms: number, label: string): Promise<{ value: T | null; timedOut: boolean; error: any | null }> {
  let timeoutId: number | undefined;
  try {
    const value = await Promise.race([
      Promise.resolve(work),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), ms);
      }),
    ]);
    if (value === null) {
      console.warn(`[powerdial-sms] ${label} timed out after ${ms}ms`);
      return { value: null, timedOut: true, error: null };
    }
    return { value: value as T, timedOut: false, error: null };
  } catch (e) {
    console.error(`[powerdial-sms] ${label} failed`, e);
    return { value: null, timedOut: false, error: e };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number, label: string): Promise<Response> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`${label}_timeout`);
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function dbWithTimeout<T = any>(query: any, ms: number, label: string): Promise<T> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), ms);
  try {
    const executable = typeof query?.abortSignal === "function" ? query.abortSignal(ac.signal) : query;
    return await executable;
  } catch (e: any) {
    const message = e?.name === "AbortError" ? `${label}_timeout` : (e?.message || String(e));
    console.error(`[powerdial-sms] ${label} DB query failed`, message);
    return { data: null, error: { message, code: e?.name === "AbortError" ? "TIMEOUT" : e?.code } } as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(raw).startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

function extractVoidfixMediaUrls(value: unknown): string[] {
  const urls = new Set<string>();
  const walk = (item: unknown) => {
    if (!item) return;
    if (typeof item === "string") {
      if (/^https?:\/\//i.test(item)) urls.add(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (typeof item === "object") {
      const obj = item as Record<string, unknown>;
      ["url", "media_url", "download_url", "link", "path"].forEach((key) => walk(obj[key]));
      ["attachments", "attachment", "files", "media", "images"].forEach((key) => walk(obj[key]));
    }
  };
  walk(value);
  return Array.from(urls);
}

function hasVoidfixMmsSignal(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const typeKeys = ["type", "message_type", "messageType", "content_type", "contentType", "mime_type", "mimeType"];
  if (typeKeys.some((key) => /\b(mms|image|photo|picture|video)\b/i.test(String(obj[key] || "")))) return true;

  const countKeys = ["num_media", "NumMedia", "media_count", "mediaCount", "attachments_count", "attachment_count"];
  if (countKeys.some((key) => Number(obj[key] || 0) > 0)) return true;

  return ["attachments", "attachment", "files", "media", "images"].some((key) => {
    const item = obj[key];
    if (Array.isArray(item)) return item.length > 0;
    return !!item && typeof item === "object" && Object.keys(item as Record<string, unknown>).length > 0;
  });
}

function isVoidfixStrippedMms(body: string, mediaUrls: string[], raw?: unknown): boolean {
  if (mediaUrls.length > 0) return false;
  const placeholderBody = /^(image|photo|picture|video|media|attachment)\s*\d*$/i.test((body || "").trim());
  return placeholderBody || hasVoidfixMmsSignal(raw);
}

async function sendVoidfixSms(to: string, body: string): Promise<{ ok: boolean; id?: string; error?: string; status?: number; raw?: any; timing?: Record<string, number> }> {
  if (!VOIDFIX_API_KEY) return { ok: false, error: "missing_VOIDFIX_API_KEY" };
  if (!VOIDFIX_DEVICE_ID) return { ok: false, error: "missing_VOIDFIX_DEVICE_ID" };
  const toNum = normalizePhone(to);
  if (!toNum) return { ok: false, error: "invalid_to" };

  const formBody = new URLSearchParams({
    number: toNum,
    devices: VOIDFIX_DEVICE_ID,
    message: body,
    key: VOIDFIX_API_KEY,
  });

  const t0 = performance.now();
  console.log(`[powerdial-sms][TIMING] → POST VoidFix send.php to=${toNum} bytes=${body.length}`);
  const TIMEOUT_MS = 12000; // Keep edge calls well below the 150s idle timeout.
  let resp: Response;
  try {
    resp = await fetchWithTimeout(VOIDFIX_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody,
    }, TIMEOUT_MS, "voidfix_send");
  } catch (e: any) {
    const isAbort = e?.name === "AbortError" || /timeout/i.test(String(e?.message || e));
    const elapsed = Math.round(performance.now() - t0);
    console.error(`[powerdial-sms][TIMING] VoidFix fetch ${isAbort ? "TIMEOUT" : "FAIL"} after ${elapsed}ms`);
    // Soft-success on timeout: VoidFix typically still queues the SMS on its Android relay
    // even when the HTTP response stalls. Treat as queued so the user UI doesn't show 500.
    if (isAbort) {
      return { ok: true, id: `voidfix-queued-${Date.now()}`, status: 202, raw: { queued: true, reason: "voidfix_slow_response", elapsed_ms: elapsed } };
    }
    return { ok: false, error: e?.message || "voidfix_fetch_failed" };
  }
  const tHeaders = performance.now();

  const text = await resp.text();
  const tBody = performance.now();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  const headersMs = Math.round(tHeaders - t0);
  const bodyMs = Math.round(tBody - tHeaders);
  const totalMs = Math.round(tBody - t0);
  console.log(`[powerdial-sms][TIMING] ← VoidFix status=${resp.status} headersMs=${headersMs} bodyReadMs=${bodyMs} totalMs=${totalMs}`);

  // Inspect VoidFix-reported delivery state — this is where the Android device queue lives
  const msg0 = data?.data?.messages?.[0] || data?.data?.[0];
  if (msg0) {
    console.log(`[powerdial-sms][TIMING] VoidFix queue: id=${msg0.ID || msg0.id || "?"} status=${msg0.status || "?"} sentDate=${msg0.sentDate || "?"} deliveredDate=${msg0.deliveredDate || "null"}`);
  }

  const timing = { headersMs, bodyMs, totalMs };

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: data?.message || `VoidFix ${resp.status}`, raw: data, timing };
  }
  const success = data?.success !== false;
  if (!success) {
    return { ok: false, error: data?.message || data?.error || "voidfix_send_failed", raw: data, timing };
  }
  const id = data?.data?.[0]?.ID || data?.data?.[0]?.id || data?.data?.messages?.[0]?.ID || data?.id || null;
  return { ok: true, id, raw: data, timing };
}

async function findCustomerByPhone(phone: string): Promise<string | null> {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const last10 = norm.replace(/\D/g, "").slice(-10);
  const { data } = await sb
    .from("customers")
    .select("id, phone, status, created_at")
    .or(`phone.ilike.%${last10}%`)
    .not("status", "in", "(dead,lost,archived,deleted)")
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data[0] ? data[0].id : null;
}

// NOTE: The "this is my cell" auto-reply is intentionally ONLY triggered by
// the Twilio landline webhook (twilio-sms-inbound). Inbound texts directly to
// the VoidFix cell number must NEVER receive this auto-reply.

// First-time texter auto-reply (configurable in SMS / Phone settings).
// Fires once per phone number, only if no prior inbound exists from that number.
async function maybeSendFirstTimeAutoReply(fromPhone: string) {
  try {
    const norm = normalizePhone(fromPhone);
    const last10 = norm.replace(/\D/g, "").slice(-10);
    if (!last10 || last10.length !== 10) return;

    // Check setting
    const { data: settingRow } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "voidfix_first_reply")
      .maybeSingle();
    const setting = (settingRow?.value as { enabled?: boolean; message?: string }) || {};
    if (setting.enabled === false) return;
    const message = (setting.message || "").trim() ||
      "Hi this is Warren, AI Videographer / Director, Busy in a meeting, will call you back, can I send you my IG reel in the mean time?";

    // Has this number ever received our first-time auto-reply before?
    const { data: priorReply } = await sb
      .from("communications")
      .select("id")
      .eq("type", "sms")
      .eq("direction", "outbound")
      .eq("provider", "voidfix")
      .eq("metadata->>source", "voidfix-first-time-auto-reply")
      .or(`to_address.ilike.%${last10}%,phone_number.ilike.%${last10}%`)
      .limit(1);
    if (priorReply && priorReply[0]) return; // already greeted

    // DND guard
    const { data: dnd } = await sb
      .from("sms_dnd_list")
      .select("id")
      .eq("phone_last10", last10)
      .limit(1);
    if (dnd && dnd[0]) return;

    // Has this number texted us BEFORE this latest message? If yes, not first-time.
    // We just inserted the current inbound; count inbound messages from this number.
    const { count: inboundCount } = await sb
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("type", "sms")
      .eq("direction", "inbound")
      .eq("provider", "voidfix")
      .or(`from_address.ilike.%${last10}%,phone_number.ilike.%${last10}%`);
    if ((inboundCount || 0) > 1) return; // not first time

    console.log(`[powerdial-sms][first-reply] sending to ${norm}`);
    const result = await sendVoidfixSms(norm, message);
    const customerId = await findCustomerByPhone(norm);
    await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: message,
      from_address: VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null,
      to_address: norm,
      phone_number: norm,
      provider: "voidfix",
      external_id: result.id || null,
      status: result.ok ? "sent" : "failed",
      customer_id: customerId,
      metadata: {
        source: "voidfix-first-time-auto-reply",
        device_id: VOIDFIX_DEVICE_ID,
        ...(result.error ? { error: result.error } : {}),
      },
    });

    // Open a thread so a positive reply triggers the IG-link auto-response.
    if (result.ok) {
      try {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existingThread } = await sb
          .from("hook_reply_threads")
          .select("id")
          .eq("phone_last10", last10)
          .gte("created_at", fourteenDaysAgo)
          .limit(1);
        if (!existingThread?.[0]) {
          await sb.from("hook_reply_threads").insert({
            phone: norm,
            phone_last10: last10,
            status: "awaiting_reply",
            sentiment: "pending",
            meta: {
              source: "voidfix-first-time-auto-reply",
              outbound_body: message,
              customer_id: customerId || null,
            },
          });
        }
      } catch (e) {
        console.error("[powerdial-sms][first-reply] thread create error", e);
      }
    }
  } catch (e) {
    console.error("[powerdial-sms][first-reply] error", e);
  }
}

async function handleInbound(payload: { from?: string; to?: string; body?: string; id?: string; device_id?: string; source?: string; raw?: any }) {
  const from = String(payload.from || "");
  const body = String(payload.body || "");
  const externalId = payload.id ? String(payload.id) : null;
  const inboundSource = payload.source || "voidfix-webhook";
  const mediaUrls = extractVoidfixMediaUrls(payload.raw || payload);
  const normalizedFrom = normalizePhone(from);

  // Idempotency: skip if external_id already stored
  if (externalId) {
    const { data: existing } = await sb
      .from("communications")
      .select("id")
      .eq("external_id", externalId)
      .limit(1);
    if (existing && existing[0]) return;
  }

  if (normalizedFrom && body.trim().length >= 20) {
    const recentDuplicateSince = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: sameRecent } = await sb
      .from("communications")
      .select("id")
      .eq("type", "sms")
      .eq("direction", "inbound")
      .eq("provider", "voidfix")
      .eq("phone_number", normalizedFrom)
      .eq("body", body)
      .gte("created_at", recentDuplicateSince)
      .limit(1);
    if (sameRecent?.[0]) return;
  }

  const customerId = await findCustomerByPhone(from);

  const metadata: Record<string, unknown> = { source: inboundSource, device_id: payload.device_id || null };
  if (isVoidfixStrippedMms(body, mediaUrls, payload.raw || payload)) metadata.voidfix_mms_stripped = true;

  const { data: insertedRow, error: insertError } = await sb.from("communications").insert({
    type: "sms",
    direction: "inbound",
    body,
    from_address: normalizedFrom,
    to_address: payload.to || null,
    phone_number: normalizedFrom,
    provider: "voidfix",
    external_id: externalId,
    status: "received",
    customer_id: customerId,
    media_urls: mediaUrls,
    metadata,
  }).select("id, created_at").single();

  if (insertError) {
    if ((insertError as any).code === "23505") return;
    console.error("[powerdial-sms] inbound insert error", insertError.message);
    return;
  }

  if (isVoidfixStrippedMms(body, mediaUrls, payload.raw || payload)) {
    const result = await sendVoidfixSms(from, MMS_RESEND_MESSAGE);
    await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: MMS_RESEND_MESSAGE,
      from_address: VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null,
      to_address: normalizePhone(from),
      phone_number: normalizePhone(from),
      provider: "voidfix",
      external_id: result.id || null,
      status: result.ok ? "sent" : "failed",
      customer_id: customerId,
      metadata: { source: "voidfix-mms-resend-instruction", device_id: VOIDFIX_DEVICE_ID, triggered_by: externalId, ...(result.error ? { error: result.error } : {}) },
    });
  }

  // NOTE: No "this is my cell" auto-reply here — that fires only for the
  // Twilio landline webhook (twilio-sms-inbound), never for direct inbound
  // texts to the VoidFix cell.

  // Downstream processing must never hold the webhook open long enough to hit the edge idle timeout.
  runInBackground(maybeSendFirstTimeAutoReply(from), "first-time-auto-reply");
  runInBackground(fetchWithTimeout(`${SUPABASE_URL}/functions/v1/hook-reply-classifier`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        phone: normalizePhone(from),
        body,
        message_id: insertedRow?.id || null,
        message_created_at: insertedRow?.created_at || new Date().toISOString(),
      }),
    }, 8000, "hook_reply_classifier").then((r) => r.text()), "hook-classifier");
  runInBackground(fetchWithTimeout(`${SUPABASE_URL}/functions/v1/sms-sequence-engine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action: "process_inbound", phone: normalizePhone(from), body }),
    }, 8000, "sms_sequence_engine").then((r) => r.text()), "sequence-engine");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const contentType = req.headers.get("content-type") || "";

  // VoidFix inbound webhook — form-encoded
  if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const form = await req.formData();
      // VoidFix common fields: number, message, device_id, ID/id
      // Also accept Twilio-style for backward compat
      const from = String(form.get("number") || form.get("From") || form.get("from") || "");
      const to = String(form.get("To") || form.get("to") || "");
      const body = String(form.get("message") || form.get("Body") || form.get("body") || "");
      const id = String(form.get("ID") || form.get("id") || form.get("MessageSid") || "");
      const deviceId = String(form.get("device_id") || form.get("devices") || "");

      if (from && body) {
        await handleInbound({ from, to, body, id: id || undefined, device_id: deviceId || undefined, raw: Object.fromEntries(form.entries()) });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[powerdial-sms/voidfix] form inbound error:", err);
      return json({ success: false }, 200);
    }
  }

  // JSON: could be VoidFix JSON webhook OR app API call
  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // VoidFix JSON webhook detection (no `action` field, has `number`/`message`)
  if (!payload?.action && (payload?.number || payload?.from) && (payload?.message || payload?.body)) {
    try {
      await handleInbound({
        from: payload.number || payload.from,
        to: payload.to,
        body: payload.message || payload.body,
        id: payload.ID || payload.id,
        device_id: payload.device_id || payload.devices,
        raw: payload,
      });
      return json({ success: true });
    } catch (err) {
      console.error("[powerdial-sms/voidfix] json inbound error:", err);
      return json({ success: false }, 200);
    }
  }

  const action = payload?.action;

  if (action === "send") {
    const sendStart = performance.now();
    const tStamp = (label: string) => console.log(`[powerdial-sms][TIMING] +${(performance.now() - sendStart).toFixed(0)}ms ${label}`);

    const to = String(payload?.to || "").trim();
    const message = String(payload?.body || "").trim();
    if (!to || !message) return json({ ok: false, error: "missing_to_or_body" }, 400);

    const source = String(payload?.source || "powerdial-sms");
    const extraMetadata = payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
    const callLogId = extraMetadata?.call_log_id ? String(extraMetadata.call_log_id) : "";

    tStamp(`send action received to=${to} source=${source}`);

    // Manual cooldown — admin can pause Android SMS API for 24h via /sms → Cool Down
    try {
      const { data: cd } = await sb
        .from("app_settings")
        .select("value")
        .eq("key", "voidfix_manual_cooldown")
        .maybeSingle();
      const until = (cd?.value as any)?.sms_until;
      if (until && new Date(until).getTime() > Date.now()) {
        tStamp(`blocked by manual cooldown until ${until}`);
        return json({ ok: false, error: "manual_cooldown", channel: "sms", until }, 423);
      }
    } catch (e) { console.error("[powerdial-sms] cooldown check failed:", (e as any)?.message || e); }

    // DND guard — bypass for the auto-reply hook itself so the initial Warren Guru hook still fires
    const bypassDnd = source === "twilio-auto-reply-voidfix";
    if (!bypassDnd) {
      const toLast10 = normalizePhone(to).replace(/\D/g, "").slice(-10);
      if (toLast10) {
        const { data: dnd } = await sb
          .from("sms_dnd_list")
          .select("id, reason")
          .eq("phone_last10", toLast10)
          .limit(1);
        if (dnd && dnd[0]) {
          tStamp("blocked by DND list");
          return json({ ok: false, error: "dnd", reason: dnd[0].reason || "opted_out" }, 403);
        }
      }
    }


    if (source === "powerdial-voicemail-drop-sms" && callLogId) {
      const { data: existing } = await sb
        .from("communications")
        .select("id")
        .eq("type", "sms")
        .eq("direction", "outbound")
        .eq("provider", "voidfix")
        .eq("metadata->>source", "powerdial-voicemail-drop-sms")
        .eq("metadata->>call_log_id", callLogId)
        .limit(1);
      if (existing?.[0]) return json({ ok: true, duplicate: true, id: existing[0].id });
    }

    const mediaUrlsIn: string[] = Array.isArray(payload?.mediaUrls)
      ? payload.mediaUrls.filter((u: unknown) => typeof u === "string" && /^https?:\/\//i.test(u))
      : [];
    const hybridImessageThread = !!payload?.hybridImessageThread;

    const result = mediaUrlsIn.length > 0
      ? await sendTwilioMms(to, message, mediaUrlsIn)
      : await sendVoidfixSms(to, message);
    tStamp(`send complete provider=${mediaUrlsIn.length > 0 ? "twilio-mms" : "voidfix"} ok=${result.ok}`);

    const customerId = payload?.customer_id || (await findCustomerByPhone(to));
    tStamp("customer lookup done");

    const providerName = mediaUrlsIn.length > 0 ? "twilio" : "voidfix";
    const fromAddr = mediaUrlsIn.length > 0
      ? (TWILIO_FROM_NUMBER ? normalizePhone(TWILIO_FROM_NUMBER) : null)
      : (payload?.from_address || (VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null));

    const insertPromise = sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: message,
      from_address: fromAddr,
      to_address: normalizePhone(to),
      phone_number: normalizePhone(to),
      provider: providerName,
      external_id: result.id || null,
      status: result.ok ? "sent" : "failed",
      customer_id: customerId || null,
      media_urls: mediaUrlsIn.length > 0 ? mediaUrlsIn : null,
      metadata: {
        source,
        device_id: providerName === "voidfix" ? VOIDFIX_DEVICE_ID : null,
        transport: mediaUrlsIn.length > 0 ? "mms" : "sms",
        hybrid_imessage_thread: hybridImessageThread,
        ...extraMetadata,
        ...(result.error ? { error: result.error } : {}),
        ...((result as any).raw ? { provider_response: (result as any).raw } : {}),
        ...((result as any).timing ? { timing_ms: (result as any).timing } : {}),
      },
    });

    // Race the DB insert against a short timeout — DB has been timing out and blocking the response.
    // SMS is already sent via VoidFix at this point; the inbox poll will reconcile if log insert fails.
    const logResult = await Promise.race([
      insertPromise.then((r: any) => ({ timeout: false, error: r?.error })),
      new Promise<{ timeout: true; error: null }>((resolve) =>
        setTimeout(() => resolve({ timeout: true, error: null }), 8000)
      ),
    ]);
    tStamp(`DB log insert done (timeout=${logResult.timeout})`);

    const logError = logResult.error;
    if (logError) {
      if (logError.code === "23505" && source === "powerdial-voicemail-drop-sms") {
        return json({ ok: true, duplicate: true, id: result.id || null });
      }
      console.error("[powerdial-sms] outbound log insert error (non-fatal):", logError);
      return json({
        ok: result.ok,
        id: result.id || null,
        log_warning: "log_insert_failed",
        log_error: logError.message || String(logError),
      }, result.ok ? 200 : 502);
    }
    if (logResult.timeout) {
      console.warn("[powerdial-sms] log insert timed out — returning success anyway");
    }

    // Hook Reply tracking — create a thread when the Warren Guru hook outbound is sent
    if (result.ok) {
      try {
        const lower = (message || "").toLowerCase();
        const isVmHook = lower.includes("warren guru") && (lower.includes("voicemail") || lower.includes("voice mail"));
        const isDroppedHook = source === "powerdial-dropped-call-sms" || (lower.includes("got disconnected") && lower.includes("warren"));
        const isHook = isVmHook || isDroppedHook;
        if (isHook) {
          const toLast10 = normalizePhone(to).replace(/\D/g, "").slice(-10);
          if (toLast10 && toLast10.length === 10) {
            // Skip if an open thread already exists in last 14 days
            const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
            const { data: existingThread } = await sb
              .from("hook_reply_threads")
              .select("id")
              .eq("phone_last10", toLast10)
              .gte("created_at", fourteenDaysAgo)
              .limit(1);
            if (!existingThread?.[0]) {
              await sb.from("hook_reply_threads").insert({
                phone: normalizePhone(to),
                phone_last10: toLast10,
                status: "awaiting_reply",
                sentiment: "pending",
                meta: { source, customer_id: customerId || null, outbound_body: message },
              });
              tStamp("hook_reply_threads row created");
            }
          }
        }
      } catch (e) {
        console.error("[powerdial-sms] hook thread create error", e);
      }
    }

    if (!result.ok) {
      // Normalize VoidFix upstream errors into short codes so the client UI shows a friendly toast
      // instead of a runtime-error overlay. Always return 200 so supabase.functions.invoke()
      // doesn't throw — the caller checks data.ok.
      const rawErr = typeof result.error === "string"
        ? result.error
        : ((result.error as any)?.message || JSON.stringify(result.error));
      let friendly = rawErr || "send_failed";
      if (/fcm\.googleapis\.com|Could not resolve host/i.test(rawErr || "")) {
        friendly = "voidfix_device_offline: VoidFix Android device cannot reach Google FCM. Check device internet/Wi-Fi.";
      } else if (/voidfix_timeout/i.test(rawErr || "")) {
        friendly = "voidfix_slow_response: VoidFix server stalled. Message may still queue on the device.";
      }
      return json({ ok: false, error: friendly, raw_error: rawErr }, 200);
    }
    tStamp("returning success to caller");
    return json({ ok: true, id: result.id, timing_ms: result.timing });
  }

  if (action === "list") {
    const phone = payload?.phone ? normalizePhone(String(payload.phone)) : null;
    const limit = Math.min(Number(payload?.limit) || 200, 500);

    let query = sb
      .from("communications")
      .select("*")
      .eq("type", "sms")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (phone) {
      const last10 = phone.replace(/\D/g, "").slice(-10);
      query = query.or(`from_address.ilike.%${last10}%,to_address.ilike.%${last10}%,phone_number.ilike.%${last10}%`);
    }

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, messages: data || [] });
  }

  if (action === "threads") {
    const limit = Math.min(Number(payload?.limit) || 500, 1000);
    const { data, error } = await sb
      .from("communications")
      .select("*")
      .eq("type", "sms")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json({ ok: false, error: error.message }, 500);

    const threads = new Map<string, any>();
    for (const m of data || []) {
      const counterpartRaw = m.direction === "inbound" ? m.from_address : m.to_address;
      const cp = normalizePhone(counterpartRaw || "");
      if (!cp) continue;
      const key = cp.replace(/\D/g, "").slice(-10);
      if (!threads.has(key)) {
        threads.set(key, { phone: cp, last_message: m, count: 0, customer_id: m.customer_id });
      }
      threads.get(key).count += 1;
    }
    return json({ ok: true, threads: Array.from(threads.values()) });
  }

  if (action === "poll") {
    // Pull recent messages from VoidFix and store any new "Received" ones.
    if (!VOIDFIX_API_KEY || !VOIDFIX_DEVICE_ID) {
      return json({ ok: false, error: "missing_voidfix_credentials" }, 500);
    }
    const limit = Math.min(Number(payload?.limit) || 25, 50);
    const form = new URLSearchParams({
      key: VOIDFIX_API_KEY,
      devices: VOIDFIX_DEVICE_ID,
      limit: String(limit),
    });
    const resp = await fetchWithTimeout(VOIDFIX_READ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    }, 12000, "voidfix_read");
    const text = await resp.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { return json({ ok: false, error: "voidfix_invalid_json", raw: text.slice(0, 300) }, 500); }

    const messages: any[] = data?.data?.messages || [];
    let imported = 0;
    let statusUpdated = 0;

    // ---- Outbound delivery-status sync ----
    // VoidFix returns Sent/Delivered/Pending/Failed for our outbound messages.
    // Update existing communications rows by external_id so the UI reflects
    // the latest delivery state instead of being stuck on "sent"/"pending".
    const mapVoidfixStatus = (s: string): string | null => {
      const v = String(s || "").toLowerCase();
      if (v === "delivered") return "delivered";
      if (v === "sent") return "sent";
      if (v === "pending" || v === "queued") return "pending";
      if (v === "failed" || v === "error") return "failed";
      return null;
    };
    // ---- Outbound delivery-status sync (bounded background work) ----
    const syncOutboundStatuses = async () => Promise.all(messages.map(async (m) => {
      const vfStatus = String(m.status || "");
      if (vfStatus === "Received") return;
      const externalId = m.ID ? String(m.ID) : null;
      if (!externalId) return;
      const mapped = mapVoidfixStatus(vfStatus);
      if (!mapped) return;
      const { data: existing } = await dbWithTimeout(sb
        .from("communications")
        .select("id, status, metadata")
        .eq("external_id", externalId)
        .eq("direction", "outbound")
        .limit(1), 2500, "poll_status_lookup");
      const row = existing?.[0];
      if (!row) return;
      const prevMeta = (row.metadata as any) || {};
      const prevStatus = prevMeta?.voidfix_status;
      if (row.status === mapped && prevStatus === vfStatus) return;
      await dbWithTimeout(sb.from("communications").update({
        status: mapped,
        metadata: {
          ...prevMeta,
          voidfix_status: vfStatus,
          voidfix_sent_date: m.sentDate || prevMeta?.voidfix_sent_date || null,
          voidfix_delivered_date: m.deliveredDate || prevMeta?.voidfix_delivered_date || null,
          voidfix_status_synced_at: new Date().toISOString(),
        },
      }).eq("id", row.id), 2500, "poll_status_update");
      statusUpdated += 1;
    }));
    const statusSync = await withTimeout(syncOutboundStatuses(), 10000, "poll_status_sync");
    if (statusSync.timedOut) runInBackground(syncOutboundStatuses(), "poll-status-sync");

    // ---- Inbound import (parallelized; downstream calls fire-and-forget) ----
    const inboundMessages = messages.filter((m) => String(m.status) === "Received").slice(0, 10);
    const processInboundMessages = async () => Promise.all(inboundMessages.map(async (m) => {
      const externalId = String(m.ID);
      const { data: blocked } = await dbWithTimeout(sb
        .from("sms_deleted_external_ids")
        .select("external_id")
        .eq("external_id", externalId)
        .limit(1), 2500, "poll_deleted_lookup");
      if (blocked && blocked[0]) return 0;
      const { data: existing } = await dbWithTimeout(sb
        .from("communications")
        .select("id")
        .eq("external_id", externalId)
        .limit(1), 2500, "poll_existing_lookup");
      if (existing && existing[0]) return 0;
      const from = normalizePhone(String(m.number || ""));
      const customerId = await findCustomerByPhone(from);
      const createdAt = m.deliveredDate || m.sentDate || null;
      const body = String(m.message || "");
      const mediaUrls = extractVoidfixMediaUrls(m);
      const strippedMms = isVoidfixStrippedMms(body, mediaUrls, m);
      if (from && body.trim().length >= 20) {
        const messageAt = createdAt ? new Date(createdAt).getTime() : Date.now();
        const duplicateWindowStart = new Date(messageAt - 2 * 60_000).toISOString();
        const duplicateWindowEnd = new Date(messageAt + 2 * 60_000).toISOString();
        const { data: sameRecent } = await dbWithTimeout(sb
          .from("communications")
          .select("id")
          .eq("type", "sms")
          .eq("direction", "inbound")
          .eq("provider", "voidfix")
          .eq("phone_number", from)
          .eq("body", body)
          .gte("created_at", duplicateWindowStart)
          .lte("created_at", duplicateWindowEnd)
          .limit(1), 2500, "poll_duplicate_lookup");
        if (sameRecent?.[0]) return 0;
      }
      const { data: insertedRow, error: insertError } = await dbWithTimeout(sb.from("communications").insert({
        type: "sms",
        direction: "inbound",
        body,
        from_address: from,
        to_address: VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null,
        phone_number: from,
        provider: "voidfix",
        external_id: externalId,
        status: "received",
        customer_id: customerId,
        media_urls: mediaUrls,
        metadata: { source: "voidfix-poll", device_id: m.deviceID, voidfix_status: m.status, ...(strippedMms ? { voidfix_mms_stripped: true } : {}) },
        ...(createdAt ? { created_at: new Date(createdAt).toISOString() } : {}),
      }).select("id, created_at").single();

      if (insertError) {
        if ((insertError as any).code === "23505") return 0;
        console.error("[powerdial-sms/poll] inbound insert error", insertError.message);
        return 0;
      }

      if (strippedMms) {
        const result = await sendVoidfixSms(from, MMS_RESEND_MESSAGE);
        await sb.from("communications").insert({
          type: "sms",
          direction: "outbound",
          body: MMS_RESEND_MESSAGE,
          from_address: VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null,
          to_address: from,
          phone_number: from,
          provider: "voidfix",
          external_id: result.id || null,
          status: result.ok ? "sent" : "failed",
          customer_id: customerId,
          metadata: { source: "voidfix-mms-resend-instruction", device_id: VOIDFIX_DEVICE_ID, triggered_by: externalId, ...(result.error ? { error: result.error } : {}) },
        });
      }

      // Fire-and-forget downstream work — don't block the response
      const downstream = (async () => {
        try { await maybeSendFirstTimeAutoReply(from); } catch (e) { console.error("[poll] auto-reply error", e); }
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/hook-reply-classifier`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({
              phone: from,
              body,
              message_id: insertedRow?.id || null,
              message_created_at: insertedRow?.created_at || new Date().toISOString(),
            }),
          });
        } catch (e) { console.error("[powerdial-sms/poll] hook classifier error", e); }
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/sms-sequence-engine`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ action: "process_inbound", phone: from, body }),
          });
        } catch (e) { console.error("[powerdial-sms/poll] sequence forward error", e); }
      })();
      try { (globalThis as any).EdgeRuntime?.waitUntil?.(downstream); } catch { /* noop */ }
      return 1;
    }));
    imported = inboundResults.reduce((a, b) => a + b, 0);

    return json({ ok: true, imported, status_updated: statusUpdated, scanned: messages.length });
  }


  if (action === "poll_calls") {
    // VoidFix's HTTP API does not expose a call-log endpoint — only SMS.
    // To pull Android call history we'd need the device app to push call
    // events to a webhook. Until that's wired, this is a graceful no-op.
    return json({ ok: true, imported: 0, scanned: 0, note: "voidfix_call_log_not_available" });
  }

  return json({ ok: false, error: "unknown_action" }, 400);
});
