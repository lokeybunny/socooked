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

async function sendVoidfixSms(to: string, body: string): Promise<{ ok: boolean; id?: string; error?: string; status?: number; raw?: any }> {
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

  const resp = await fetch(VOIDFIX_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody,
  });

  const text = await resp.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: data?.message || `VoidFix ${resp.status}`, raw: data };
  }
  // VoidFix typically returns { success: true, data: [{ ID: "..." }] } or similar
  const success = data?.success !== false;
  if (!success) {
    return { ok: false, error: data?.message || data?.error || "voidfix_send_failed", raw: data };
  }
  const id = data?.data?.[0]?.ID || data?.data?.[0]?.id || data?.id || null;
  return { ok: true, id, raw: data };
}

async function findCustomerByPhone(phone: string): Promise<string | null> {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const last10 = norm.replace(/\D/g, "").slice(-10);
  const { data } = await sb
    .from("customers")
    .select("id, phone")
    .or(`phone.ilike.%${last10}%`)
    .limit(1);
  return data && data[0] ? data[0].id : null;
}

async function handleInbound(payload: { from?: string; to?: string; body?: string; id?: string; device_id?: string }) {
  const from = String(payload.from || "");
  const body = String(payload.body || "");
  const externalId = payload.id ? String(payload.id) : null;

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

  await sb.from("communications").insert({
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
    metadata: { source: "voidfix-webhook", device_id: payload.device_id || null },
  });
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
    const to = String(payload?.to || "").trim();
    const message = String(payload?.body || "").trim();
    if (!to || !message) return json({ ok: false, error: "missing_to_or_body" }, 400);

    const result = await sendVoidfixSms(to, message);
    const customerId = payload?.customer_id || (await findCustomerByPhone(to));

    await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: message,
      from_address: VOIDFIX_DEVICE_ID ? `voidfix:${VOIDFIX_DEVICE_ID}` : null,
      to_address: normalizePhone(to),
      phone_number: normalizePhone(to),
      provider: "voidfix",
      external_id: result.id || null,
      status: result.ok ? "sent" : "failed",
      customer_id: customerId || null,
      metadata: {
        source: "powerdial-sms",
        device_id: VOIDFIX_DEVICE_ID,
        ...(result.error ? { error: result.error } : {}),
        ...(result.raw ? { voidfix_response: result.raw } : {}),
      },
    });

    if (!result.ok) return json({ ok: false, error: result.error }, result.status || 500);
    return json({ ok: true, id: result.id });
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

  return json({ ok: false, error: "unknown_action" }, 400);
});
