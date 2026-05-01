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
const VOIDFIX_CALLS_URL = "https://sms.voidfix.com/services/read-calls.php";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
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
  const resp = await fetch(VOIDFIX_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody,
  });
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

async function handleInbound(payload: { from?: string; to?: string; body?: string; id?: string; device_id?: string; source?: string }) {
  const from = String(payload.from || "");
  const body = String(payload.body || "");
  const externalId = payload.id ? String(payload.id) : null;
  const inboundSource = payload.source || "voidfix-webhook";

  // Idempotency: skip if external_id already stored
  if (externalId) {
    const { data: existing } = await sb
      .from("communications")
      .select("id")
      .eq("external_id", externalId)
      .limit(1);
    if (existing && existing[0]) return;
  }

  const customerId = await findCustomerByPhone(from);

  const { data: insertedRow } = await sb.from("communications").insert({
    type: "sms",
    direction: "inbound",
    body,
    from_address: normalizePhone(from),
    to_address: payload.to || null,
    phone_number: normalizePhone(from),
    provider: "voidfix",
    external_id: externalId,
    status: "received",
    customer_id: customerId,
    metadata: { source: inboundSource, device_id: payload.device_id || null },
  }).select("id, created_at").single();

  // NOTE: No "this is my cell" auto-reply here — that fires only for the
  // Twilio landline webhook (twilio-sms-inbound), never for direct inbound
  // texts to the VoidFix cell.

  // Hook Reply classifier — awaited so the fetch survives in edge runtime
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/hook-reply-classifier`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        phone: normalizePhone(from),
        body,
        message_id: insertedRow?.id || null,
        message_created_at: insertedRow?.created_at || new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("[powerdial-sms] hook classifier error", e);
  }

  // Forward to sequence engine to advance any active enrollments
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/sms-sequence-engine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action: "process_inbound", phone: normalizePhone(from), body }),
    });
  } catch (e) {
    console.error("[powerdial-sms] sequence forward error", e);
  }
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
        await handleInbound({ from, to, body, id: id || undefined, device_id: deviceId || undefined });
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

    const result = await sendVoidfixSms(to, message);
    tStamp(`VoidFix API call complete ok=${result.ok} totalMs=${result.timing?.totalMs ?? "?"}`);

    const customerId = payload?.customer_id || (await findCustomerByPhone(to));
    tStamp("customer lookup done");

    const { error: logError } = await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: message,
      from_address: payload?.from_address || (VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null),
      to_address: normalizePhone(to),
      phone_number: normalizePhone(to),
      provider: "voidfix",
      external_id: result.id || null,
      status: result.ok ? "sent" : "failed",
      customer_id: customerId || null,
      metadata: {
        source,
        device_id: VOIDFIX_DEVICE_ID,
        ...extraMetadata,
        ...(result.error ? { error: result.error } : {}),
        ...(result.raw ? { voidfix_response: result.raw } : {}),
        ...(result.timing ? { timing_ms: result.timing } : {}),
      },
    });
    tStamp("DB log insert done");

    if (logError) {
      if (logError.code === "23505" && source === "powerdial-voicemail-drop-sms") {
        return json({ ok: true, duplicate: true, id: result.id || null });
      }
      console.error("[powerdial-sms] outbound log insert error:", logError);
      return json({ ok: false, error: "sms_sent_but_log_failed" }, 500);
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

    if (!result.ok) return json({ ok: false, error: result.error }, result.status || 500);
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
    const limit = Math.min(Number(payload?.limit) || 50, 200);
    const form = new URLSearchParams({
      key: VOIDFIX_API_KEY,
      devices: VOIDFIX_DEVICE_ID,
      limit: String(limit),
    });
    const resp = await fetch(VOIDFIX_READ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const text = await resp.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { return json({ ok: false, error: "voidfix_invalid_json", raw: text.slice(0, 300) }, 500); }

    const messages: any[] = data?.data?.messages || [];
    let imported = 0;
    for (const m of messages) {
      if (String(m.status) !== "Received") continue;
      const externalId = String(m.ID);
      // Skip if user previously deleted this message (blocklist)
      const { data: blocked } = await sb
        .from("sms_deleted_external_ids")
        .select("external_id")
        .eq("external_id", externalId)
        .limit(1);
      if (blocked && blocked[0]) continue;
      // dedupe against existing communications
      const { data: existing } = await sb
        .from("communications")
        .select("id")
        .eq("external_id", externalId)
        .limit(1);
      if (existing && existing[0]) continue;
      const from = normalizePhone(String(m.number || ""));
      const customerId = await findCustomerByPhone(from);
      const createdAt = m.deliveredDate || m.sentDate || null;
      const { data: insertedRow } = await sb.from("communications").insert({
        type: "sms",
        direction: "inbound",
        body: String(m.message || ""),
        from_address: from,
        to_address: VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null,
        phone_number: from,
        provider: "voidfix",
        external_id: externalId,
        status: "received",
        customer_id: customerId,
        metadata: { source: "voidfix-poll", device_id: m.deviceID, voidfix_status: m.status },
        ...(createdAt ? { created_at: new Date(createdAt).toISOString() } : {}),
      }).select("id, created_at").single();
      // No cell auto-reply for poll-imported inbound texts — auto-reply is
      // landline-only (handled by twilio-sms-inbound).
      // Hook Reply classifier — awaited so the fetch survives in edge runtime
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/hook-reply-classifier`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            phone: from,
            body: String(m.message || ""),
            message_id: insertedRow?.id || null,
            message_created_at: insertedRow?.created_at || new Date().toISOString(),
          }),
        });
      } catch (e) { console.error("[powerdial-sms/poll] hook classifier error", e); }
      // Advance sequences
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/sms-sequence-engine`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ action: "process_inbound", phone: from, body: String(m.message || "") }),
        });
      } catch (e) { console.error("[powerdial-sms/poll] sequence forward error", e); }
      imported += 1;
    }
    return json({ ok: true, imported, scanned: messages.length });
  }


  if (action === "poll_calls") {
    // Pull recent call log from the VoidFix Android device.
    if (!VOIDFIX_API_KEY || !VOIDFIX_DEVICE_ID) {
      return json({ ok: false, error: "missing_voidfix_credentials" }, 500);
    }
    const limit = Math.min(Number(payload?.limit) || 100, 500);
    const form = new URLSearchParams({
      key: VOIDFIX_API_KEY,
      devices: VOIDFIX_DEVICE_ID,
      limit: String(limit),
    });
    const resp = await fetch(VOIDFIX_CALLS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const text = await resp.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { return json({ ok: false, error: "voidfix_invalid_json", raw: text.slice(0, 300) }, 500); }

    // VoidFix call records: { ID, number, type, duration, simSlot, callDate, deviceID }
    // type values commonly: "Incoming"(1), "Outgoing"(2), "Missed"(3), "Voicemail"(4), "Rejected"(5), "Blocked"(6)
    const calls: any[] = data?.data?.calls || data?.data?.messages || [];
    let imported = 0;
    for (const c of calls) {
      const externalId = `voidfix-call-${String(c.ID || c.id || "")}`;
      if (!externalId || externalId === "voidfix-call-") continue;

      const { data: existing } = await sb
        .from("communications")
        .select("id")
        .eq("external_id", externalId)
        .limit(1);
      if (existing && existing[0]) continue;

      const rawType = String(c.type || "").toLowerCase();
      const typeNum = Number(c.type);
      let direction: "inbound" | "outbound" = "inbound";
      let status = "received";
      if (rawType.includes("outgo") || typeNum === 2) { direction = "outbound"; status = "completed"; }
      else if (rawType.includes("miss") || typeNum === 3) { direction = "inbound"; status = "missed"; }
      else if (rawType.includes("reject") || typeNum === 5) { direction = "inbound"; status = "rejected"; }
      else if (rawType.includes("block") || typeNum === 6) { direction = "inbound"; status = "blocked"; }
      else if (rawType.includes("voicemail") || typeNum === 4) { direction = "inbound"; status = "voicemail"; }
      else { direction = "inbound"; status = "received"; }

      const phone = normalizePhone(String(c.number || ""));
      const customerId = await findCustomerByPhone(phone);
      const callDate = c.callDate || c.date || null;
      const durationSec = Number(c.duration || 0);

      await sb.from("communications").insert({
        type: "call",
        direction,
        body: null,
        from_address: direction === "inbound" ? phone : (VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null),
        to_address: direction === "inbound" ? (VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null) : phone,
        phone_number: phone,
        provider: "voidfix",
        external_id: externalId,
        status,
        customer_id: customerId,
        metadata: {
          source: "voidfix-call-poll",
          device_id: c.deviceID,
          voidfix_type: c.type,
          duration_sec: durationSec,
          sim_slot: c.simSlot,
        },
        ...(callDate ? { created_at: new Date(callDate).toISOString() } : {}),
      });
      imported += 1;
    }
    return json({ ok: true, imported, scanned: calls.length });
  }

  return json({ ok: false, error: "unknown_action" }, 400);
});
