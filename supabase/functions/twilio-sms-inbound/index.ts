// Twilio inbound SMS webhook
// Set this URL as your Twilio number's "A MESSAGE COMES IN" webhook (HTTP POST):
//   https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/twilio-sms-inbound
//
// Behavior:
//  1. Logs the inbound SMS into communications (type=sms, provider=twilio)
//  2. Forwards the message body to the VoidFix cell (so you see it on your real phone)
//  3. Responds with TwiML <Message> auto-reply telling the sender to text the VoidFix cell instead

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Cell to forward to (VoidFix line ending 8105)
const FORWARD_TO_CELL = Deno.env.get("VOIDFIX_FORWARD_CELL") || "+14244658105";

const AUTO_REPLY =
  "Hey, just got your message on my line ending in 8105. This is my cell — that's a landline. I'll follow back in a moment.";

function twimlReply(message: string) {
  const safe = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${safe}</Message></Response>`;
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
    .select("id")
    .or(`phone.ilike.%${last10}%`)
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

    if (!from || !body) {
      return twimlReply(AUTO_REPLY);
    }

    // Idempotency: skip duplicate webhooks
    if (sid) {
      const { data: dupe } = await sb
        .from("communications")
        .select("id")
        .eq("external_id", sid)
        .limit(1);
      if (dupe && dupe[0]) {
        return twimlReply(AUTO_REPLY);
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

    // Forward to VoidFix cell (fire and forget — don't block the TwiML response)
    forwardToVoidfixCell(normalizePhone(from), normalizePhone(to), body).catch((e) =>
      console.error("[twilio-sms-inbound] forward error:", e),
    );

    // Log the auto-reply we're about to send via TwiML
    sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: AUTO_REPLY,
      from_address: normalizePhone(to),
      to_address: normalizePhone(from),
      phone_number: normalizePhone(from),
      provider: "twilio",
      status: "sent",
      customer_id: customerId,
      metadata: { source: "twilio-auto-reply", twilio_number: to },
    }).then(() => {}, (e) => console.error("[twilio-sms-inbound] log auto-reply error:", e));

    return twimlReply(AUTO_REPLY);
  } catch (err) {
    console.error("[twilio-sms-inbound] error:", err);
    // Always return valid TwiML so Twilio doesn't show an error to the sender
    return twimlReply(AUTO_REPLY);
  }
});
