// Twilio inbound SMS webhook
// Set this URL as your Twilio number's "A MESSAGE COMES IN" webhook (HTTP POST):
//   https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/twilio-sms-inbound
//
// Behavior:
//  1. Logs the inbound SMS into communications (type=sms, provider=twilio)
//  2. Sends the requested auto-reply through VoidFix so it comes from the cell device
//  3. Forwards the message body to the VoidFix cell (so you see it on your real phone)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Defaults — overridable via app_settings.sms_auto_reply
const DEFAULT_FORWARD_TO_CELL = Deno.env.get("VOIDFIX_FORWARD_CELL") || "+14244658105";
const DEFAULT_AUTO_REPLY_PREFIX =
  "Hey, just got your message on my line ending in 8105. This is my cell — that's a landline. I'll follow back in a moment.";

type AutoReplyConfig = {
  enabled: boolean;
  forward_enabled: boolean;
  prefix: string;
  forward_to_cell: string;
  include_quoted: boolean;
};

async function loadConfig(): Promise<AutoReplyConfig> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "sms_auto_reply").maybeSingle();
  const v = (data?.value || {}) as Partial<AutoReplyConfig>;
  return {
    enabled: v.enabled !== false,
    forward_enabled: v.forward_enabled !== false,
    prefix: typeof v.prefix === "string" && v.prefix.trim() ? v.prefix : DEFAULT_AUTO_REPLY_PREFIX,
    forward_to_cell: typeof v.forward_to_cell === "string" && v.forward_to_cell.trim() ? v.forward_to_cell : DEFAULT_FORWARD_TO_CELL,
    include_quoted: v.include_quoted !== false,
  };
}

function buildAutoReply(inboundBody: string, cfg: AutoReplyConfig): string {
  const trimmed = (inboundBody || "").trim();
  if (!trimmed || !cfg.include_quoted) return cfg.prefix;
  const MAX_QUOTE = 600;
  const quoted = trimmed.length > MAX_QUOTE ? `${trimmed.slice(0, MAX_QUOTE).trim()}…` : trimmed;
  return `${cfg.prefix}\n\nYou wrote:\n"${quoted}"`;
}

function twimlAck() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`;
  return new Response(xml, {
    status: 200,
    headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" },
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

async function findCustomerByPhone(phone: string): Promise<string | null> {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const last10 = norm.replace(/\D/g, "").slice(-10);
  const { data } = await sb
    .from("customers")
    .select("id, status, created_at")
    .or(`phone.ilike.%${last10}%`)
    .not("status", "in", "(dead,lost,archived,deleted)")
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data[0] ? data[0].id : null;
}

async function forwardToVoidfixCell(from: string, twilioNumber: string, body: string) {
  // Send a copy of the inbound message to the VoidFix cell so the operator sees it
  const forwardBody = `[Twilio ${twilioNumber}] From ${from}:\n${body}`;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action: "send", to: FORWARD_TO_CELL, body: forwardBody }),
    });
  } catch (e) {
    console.error("[twilio-sms-inbound] forward to voidfix failed:", e);
  }
}

async function sendVoidfixAutoReply(
  from: string,
  twilioNumber: string,
  sid: string | null,
  customerId: string | null,
  inboundBody: string,
) {
  const to = normalizePhone(from);
  if (!to) return;
  const replyBody = buildAutoReply(inboundBody);
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      action: "send",
      to,
      body: replyBody,
      customer_id: customerId,
      source: "twilio-auto-reply-voidfix",
      metadata: {
        source: "twilio-auto-reply-voidfix",
        twilio_number: normalizePhone(twilioNumber),
        twilio_sid: sid || null,
        inbound_body: inboundBody,
      },
    }),
  });
  const resultText = await resp.text();
  if (!resp.ok) {
    throw new Error(`VoidFix auto-reply failed [${resp.status}]: ${resultText.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const contentType = req.headers.get("content-type") || "";
    let from = "", to = "", body = "", sid = "";

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      from = String(form.get("From") || "");
      to = String(form.get("To") || "");
      body = String(form.get("Body") || "");
      sid = String(form.get("MessageSid") || form.get("SmsSid") || "");
    } else {
      // Fallback: JSON
      const j = await req.json().catch(() => ({}));
      from = String(j.From || j.from || "");
      to = String(j.To || j.to || "");
      body = String(j.Body || j.body || "");
      sid = String(j.MessageSid || j.sid || "");
    }

    if (!from || !body) return twimlAck();

    // Idempotency: skip duplicate webhooks
    if (sid) {
      const { data: dupe } = await sb
        .from("communications")
        .select("id")
        .eq("external_id", sid)
        .limit(1);
      if (dupe && dupe[0]) {
        return twimlAck();
      }
    }

    const customerId = await findCustomerByPhone(from);

    // Log the inbound Twilio SMS
    await sb.from("communications").insert({
      type: "sms",
      direction: "inbound",
      body,
      from_address: normalizePhone(from),
      to_address: normalizePhone(to),
      phone_number: normalizePhone(from),
      provider: "twilio",
      external_id: sid || null,
      status: "received",
      customer_id: customerId,
      metadata: { source: "twilio-webhook", twilio_number: to },
    });

    // Send the requested auto-reply from the VoidFix phone/device, not Twilio TwiML.
    try {
      await sendVoidfixAutoReply(from, to, sid || null, customerId, body);
    } catch (e) {
      console.error("[twilio-sms-inbound] VoidFix auto-reply error:", e);
    }

    // Forward to VoidFix cell (fire and forget — don't block the webhook ack)
    forwardToVoidfixCell(normalizePhone(from), normalizePhone(to), body).catch((e) =>
      console.error("[twilio-sms-inbound] forward error:", e),
    );

    return twimlAck();
  } catch (err) {
    console.error("[twilio-sms-inbound] error:", err);
    // Always return valid TwiML so Twilio doesn't show an error/retry storm to the sender
    return twimlAck();
  }
});
