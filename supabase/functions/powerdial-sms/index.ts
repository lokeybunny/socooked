// PowerDial SMS — send & receive Twilio SMS, persist to communications table.
// - POST {action:"send", to, body, customer_id?} → sends SMS via Twilio, logs as outbound
// - POST {action:"list", phone?, limit?}        → returns recent SMS threads/messages
// - POST  (Twilio inbound webhook, form-encoded: From, To, Body, MessageSid) → logs inbound

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";

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

async function sendTwilioSms(to: string, body: string, from?: string): Promise<{ ok: boolean; sid?: string; error?: string; status?: number }> {
  const fromNum = normalizePhone(from || TWILIO_FROM_NUMBER);
  const toNum = normalizePhone(to);
  if (!fromNum) return { ok: false, error: "no_twilio_from" };
  if (!toNum) return { ok: false, error: "invalid_to" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const statusCallback = `${SUPABASE_URL}/functions/v1/powerdial-sms`;
  const formBody = new URLSearchParams({ To: toNum, From: fromNum, Body: body, StatusCallback: statusCallback });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody,
  });

  const data = await resp.json().catch(() => ({} as any));
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: data?.message || `Twilio ${resp.status}` };
  }
  return { ok: true, sid: data?.sid };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const contentType = req.headers.get("content-type") || "";

  // Twilio inbound webhook (form-encoded)
  if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const form = await req.formData();
      const from = String(form.get("From") || "");
      const to = String(form.get("To") || "");
      const body = String(form.get("Body") || "");
      const sid = String(form.get("MessageSid") || "");

      const customerId = await findCustomerByPhone(from);

      await sb.from("communications").insert({
        type: "sms",
        direction: "inbound",
        body,
        from_address: from,
        to_address: to,
        phone_number: from,
        provider: "twilio",
        external_id: sid,
        status: "received",
        customer_id: customerId,
        metadata: { source: "powerdial-sms" },
      });

      return new Response("<Response/>", {
        status: 200,
        headers: { ...CORS, "Content-Type": "text/xml" },
      });
    } catch (err) {
      console.error("[powerdial-sms] inbound error:", err);
      return new Response("<Response/>", {
        status: 200,
        headers: { ...CORS, "Content-Type": "text/xml" },
      });
    }
  }

  // JSON API for the app
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const action = body?.action;

  if (action === "send") {
    const to = String(body?.to || "").trim();
    const message = String(body?.body || "").trim();
    if (!to || !message) return json({ ok: false, error: "missing_to_or_body" }, 400);

    const result = await sendTwilioSms(to, message);
    const customerId = body?.customer_id || (await findCustomerByPhone(to));

    await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: message,
      from_address: normalizePhone(TWILIO_FROM_NUMBER),
      to_address: normalizePhone(to),
      phone_number: normalizePhone(to),
      provider: "twilio",
      external_id: result.sid || null,
      status: result.ok ? "sent" : "failed",
      customer_id: customerId || null,
      metadata: {
        source: "powerdial-sms",
        ...(result.error ? { error: result.error } : {}),
      },
    });

    if (!result.ok) return json({ ok: false, error: result.error }, result.status || 500);
    return json({ ok: true, sid: result.sid });
  }

  if (action === "list") {
    const phone = body?.phone ? normalizePhone(String(body.phone)) : null;
    const limit = Math.min(Number(body?.limit) || 200, 500);

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
    // Group recent SMS by counterpart phone number
    const limit = Math.min(Number(body?.limit) || 500, 1000);
    const { data, error } = await sb
      .from("communications")
      .select("*")
      .eq("type", "sms")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json({ ok: false, error: error.message }, 500);

    const ourFrom = normalizePhone(TWILIO_FROM_NUMBER);
    const ourLast10 = ourFrom.replace(/\D/g, "").slice(-10);
    const threads = new Map<string, any>();

    for (const m of data || []) {
      const counterpartRaw = m.direction === "inbound" ? m.from_address : m.to_address;
      const cp = normalizePhone(counterpartRaw || "");
      if (!cp) continue;
      const cpLast10 = cp.replace(/\D/g, "").slice(-10);
      if (cpLast10 === ourLast10) continue;
      const key = cpLast10;
      if (!threads.has(key)) {
        threads.set(key, { phone: cp, last_message: m, count: 0, customer_id: m.customer_id });
      }
      threads.get(key).count += 1;
    }

    return json({ ok: true, threads: Array.from(threads.values()) });
  }

  return json({ ok: false, error: "unknown_action" }, 400);
});
