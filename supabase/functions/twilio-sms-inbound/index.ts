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
const TWILIO_LANDLINE_NUMBER = "+17028298105";
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

async function logEvent(event: string, fields: {
  level?: 'info' | 'warn' | 'error';
  from?: string | null;
  to?: string | null;
  sid?: string | null;
  body?: string | null;
  elapsed_ms?: number | null;
  metadata?: Record<string, unknown>;
} = {}) {
  try {
    await sb.from("twilio_inbound_logs").insert({
      event,
      level: fields.level || 'info',
      from_number: fields.from || null,
      to_number: fields.to || null,
      message_sid: fields.sid || null,
      body: fields.body ?? null,
      elapsed_ms: fields.elapsed_ms ?? null,
      metadata: fields.metadata || {},
    });
  } catch (e) {
    console.error('[twilio-sms-inbound] logEvent failed:', e);
  }
}

function runAfterResponse(label: string, task: Promise<unknown>, ctx: { from?: string; to?: string; sid?: string | null } = {}) {
  const startedAt = performance.now();
  const guarded = task
    .then(() => {
      const elapsed = Math.round(performance.now() - startedAt);
      console.log(`[twilio-sms-inbound][TIMING] ${label} completed in ${elapsed}ms`);
      void logEvent(`bg:${label}:done`, { elapsed_ms: elapsed, ...ctx });
    })
    .catch((e) => {
      const elapsed = Math.round(performance.now() - startedAt);
      console.error(`[twilio-sms-inbound][TIMING] ${label} FAILED after ${elapsed}ms:`, e);
      void logEvent(`bg:${label}:failed`, { level: 'error', elapsed_ms: elapsed, metadata: { error: String(e?.message || e) }, ...ctx });
    });
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") waitUntil(guarded);
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

async function forwardToVoidfixCell(from: string, twilioNumber: string, body: string, cell: string) {
  const forwardBody = `[Twilio ${twilioNumber}] From ${from}:\n${body}`;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action: "send", to: cell, body: forwardBody }),
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
  cfg: AutoReplyConfig,
) {
  // KILL SWITCH (2026-05-14): All "Busy in a meeting / IG reel" auto-replies are
  // permanently disabled — they were causing Warren's number to be flagged as spam.
  // Do not re-enable without explicit instruction.
  console.log("[twilio-sms-inbound] auto-reply kill-switch active — skipping send");
  return;
  // eslint-disable-next-line no-unreachable
  const to = normalizePhone(from);
  if (!to) return;
  const replyBody = buildAutoReply(inboundBody, cfg);
  const t0 = performance.now();
  console.log(`[twilio-sms-inbound][TIMING] → calling powerdial-sms (sid=${sid || "?"})`);
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
  const fetchMs = (performance.now() - t0).toFixed(0);
  const resultText = await resp.text();
  const totalMs = (performance.now() - t0).toFixed(0);
  console.log(`[twilio-sms-inbound][TIMING] ← powerdial-sms responded status=${resp.status} fetchMs=${fetchMs} totalMs=${totalMs}`);
  if (!resp.ok) {
    throw new Error(`VoidFix auto-reply failed [${resp.status}] in ${totalMs}ms: ${resultText.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const reqStart = performance.now();
  const tStamp = (label: string) => console.log(`[twilio-sms-inbound][TIMING] +${(performance.now() - reqStart).toFixed(0)}ms ${label}`);

  try {
    const contentType = req.headers.get("content-type") || "";
    let from = "", to = "", body = "", sid = "";
    let numMedia = 0;

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      from = String(form.get("From") || "");
      to = String(form.get("To") || "");
      body = String(form.get("Body") || "");
      sid = String(form.get("MessageSid") || form.get("SmsSid") || "");
      numMedia = Number(form.get("NumMedia") || "0") || 0;
    } else {
      // Fallback: JSON
      const j = await req.json().catch(() => ({}));
      from = String(j.From || j.from || "");
      to = String(j.To || j.to || "");
      body = String(j.Body || j.body || "");
      sid = String(j.MessageSid || j.sid || "");
      numMedia = Number(j.NumMedia || j.num_media || "0") || 0;
    }

    tStamp(`parsed payload from=${from} to=${to} sid=${sid} numMedia=${numMedia}`);

    // Allow image-only messages (empty body but has media)
    if (!from || (!body && numMedia === 0)) {
      void logEvent('webhook:ignored:missing-fields', { level: 'warn', from, to, sid, body, metadata: { content_type: contentType, num_media: numMedia } });
      return twimlAck();
    }

    const normalizedFrom = normalizePhone(from);
    const normalizedTo = normalizePhone(to);
    const is8105LandlineWebhook = normalizedTo === TWILIO_LANDLINE_NUMBER;

    void logEvent('webhook:received', {
      from: normalizedFrom,
      to: normalizedTo,
      sid,
      body,
      metadata: { is_8105_landline: is8105LandlineWebhook, content_type: contentType },
    });

    // Duplicate-protection removed: every inbound webhook triggers a fresh auto-reply.

    const customerId = await findCustomerByPhone(from);
    tStamp(`customer lookup done customerId=${customerId || "none"}`);
    void logEvent('customer:lookup', { from: normalizedFrom, to: normalizedTo, sid, metadata: { customer_id: customerId } });

    // Log the inbound Twilio SMS — flagged as a "landline reply" so the CRM
    // knows this came in to the 8105 landline and still needs follow-up from
    // our VoidFix cell.
    await sb.from("communications").insert({
      type: "sms",
      direction: "inbound",
      body,
      from_address: normalizedFrom,
      to_address: normalizedTo,
      phone_number: normalizedFrom,
      provider: "twilio",
      external_id: sid || null,
      status: "received",
      customer_id: customerId,
      metadata: {
        source: is8105LandlineWebhook ? "twilio-landline-reply" : "twilio-inbound-non-8105",
        landline_reply: is8105LandlineWebhook,
        twilio_number: normalizedTo,
        num_media: numMedia,
      },
    });
    tStamp("inbound communication logged");
    void logEvent('inbound:persisted', { from: normalizedFrom, to: normalizedTo, sid, body, metadata: { num_media: numMedia } });

    // If this MMS has media, fetch & store the images out-of-band so the SMS UI can render them.
    if (numMedia > 0 && sid) {
      runAfterResponse(
        "twilio-mms-fetch",
        fetch(`${SUPABASE_URL}/functions/v1/twilio-mms-fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ action: "fetch_one", sid }),
        }).then((r) => r.text()),
        { from: normalizedFrom, to: normalizedTo, sid },
      );
    }

    const fromLast10 = normalizedFrom.replace(/\D/g, "").slice(-10);

    // DND check — never auto-reply or open hook threads for opted-out numbers
    let isDnd = false;
    if (fromLast10) {
      const { data: dndRow } = await sb
        .from("sms_dnd_list")
        .select("id")
        .eq("phone_last10", fromLast10)
        .limit(1);
      isDnd = !!(dndRow && dndRow[0]);
    }

    // Universal opt-out: any inbound matching stop/unsubscribe/no auto-adds to DND,
    // regardless of whether a hook_reply_thread exists for this number.
    const lowered = (body || "").toLowerCase().trim();
    const OPT_OUT_RE = /(^|[^a-z])(stop|stopall|unsubscribe|cancel|end|quit|no)([^a-z]|$)/i;
    const matchedOptOut = lowered && OPT_OUT_RE.test(lowered);
    if (matchedOptOut && fromLast10 && !isDnd) {
      try {
        await sb.from("sms_dnd_list").upsert(
          {
            phone: normalizedFrom,
            phone_last10: fromLast10,
            reason: `keyword:${lowered.match(OPT_OUT_RE)?.[2] || "opt_out"}`,
            source: "twilio_inbound",
            original_message_body: body,
          },
          { onConflict: "phone_last10" },
        );
        isDnd = true;
        void logEvent('dnd:auto-added', { from: normalizedFrom, to: normalizedTo, sid, body, metadata: { keyword: lowered.match(OPT_OUT_RE)?.[2] } });
      } catch (e) {
        console.error("[twilio-sms-inbound] DND upsert failed:", e);
      }
    }

    const cfg = await loadConfig();
    tStamp("config loaded");

    // "How much" pricing auto-reply — fires on any inbound containing the phrase, not DND.
    const HOW_MUCH_RE = /how\s*much/i;
    const matchedHowMuch = !isDnd && HOW_MUCH_RE.test(body || "");
    const PRICING_REPLY = "The first client deal is no deposit whatsoever. However, if you do like what we have to offer, at the end of everything it'll be $200 — that's 50% off our original video package.";
    if (matchedHowMuch) {
      void logEvent('auto-reply:how-much', { from: normalizedFrom, to: normalizedTo, sid });
      runAfterResponse(
        "how-much-pricing-reply",
        sendVoidfixAutoReply(from, to, sid || null, customerId, body, { ...cfg, prefix: PRICING_REPLY, include_quoted: false }),
        { from: normalizedFrom, to: normalizedTo, sid },
      );
    }

    // Send the canned reply ONLY when Twilio's webhook `To` is the 8105 landline AND not DND.
    // Skip when we already sent the pricing reply so the sender doesn't get two messages.
    if (cfg.enabled && is8105LandlineWebhook && !isDnd && !matchedHowMuch) {
      tStamp("scheduling VoidFix auto-reply (background)");
      void logEvent('auto-reply:scheduled', { from: normalizedFrom, to: normalizedTo, sid });
      runAfterResponse("VoidFix auto-reply", sendVoidfixAutoReply(from, to, sid || null, customerId, body, cfg), { from: normalizedFrom, to: normalizedTo, sid });

      // Open Hook Reply thread (best-effort, fire-and-forget) so the next inbound gets classified
      runAfterResponse(
        "open-hook-reply-thread",
        (async () => {
          // Only one open thread per phone at a time
          const { data: existing } = await sb
            .from("hook_reply_threads")
            .select("id")
            .eq("phone_last10", fromLast10)
            .in("status", ["awaiting_reply", "followup_scheduled"])
            .limit(1);
          if (existing && existing[0]) return;
          await sb.from("hook_reply_threads").insert({
            phone: normalizedFrom,
            phone_last10: fromLast10,
            original_outbound_body: cfg.prefix,
            status: "awaiting_reply",
            sentiment: "pending",
            meta: {
              twilio_inbound_sid: sid || null,
              twilio_landline: normalizedTo,
              inbound_body: body,
              source: "twilio-sms-inbound-webhook",
            },
          });
        })(),
        { from: normalizedFrom, to: normalizedTo, sid },
      );
    } else if (isDnd) {
      void logEvent('auto-reply:skipped:dnd', { from: normalizedFrom, to: normalizedTo, sid });
    } else if (!is8105LandlineWebhook) {
      console.log(`[twilio-sms-inbound] skipped auto-reply: webhook To=${normalizedTo || "unknown"} is not ${TWILIO_LANDLINE_NUMBER}`);
      void logEvent('auto-reply:skipped:not-8105', { level: 'warn', from: normalizedFrom, to: normalizedTo, sid });
    } else {
      console.log("[twilio-sms-inbound] auto-reply disabled by app_settings");
      void logEvent('auto-reply:skipped:disabled', { from: normalizedFrom, to: normalizedTo, sid });
    }

    // Hook Reply classifier — runs whenever a Twilio inbound arrives
    runAfterResponse(
      "hook-reply-classifier",
      fetch(`${SUPABASE_URL}/functions/v1/hook-reply-classifier`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ phone: normalizedFrom, body, message_id: sid || null }),
      }).then((r) => r.text()),
      { from: normalizedFrom, to: normalizedTo, sid },
    );

    // Fire-and-forget: audit the sender's device so the SMS thread auto-routes
    // to iMessage vs SMS. Audit fn is idempotent (locks once device_type is set).
    runAfterResponse(
      "phone-device-audit",
      fetch(`${SUPABASE_URL}/functions/v1/phone-device-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ action: "run", phone: normalizedFrom }),
      }).then((r) => r.text()),
      { from: normalizedFrom, to: normalizedTo, sid },
    );

    // Forward to VoidFix cell (fire and forget — don't block the webhook ack)
    if (cfg.forward_enabled && is8105LandlineWebhook) {
      void logEvent('forward:scheduled', { from: normalizedFrom, to: normalizedTo, sid, metadata: { cell: cfg.forward_to_cell } });
      runAfterResponse("forward", forwardToVoidfixCell(normalizedFrom, normalizedTo, body, cfg.forward_to_cell), { from: normalizedFrom, to: normalizedTo, sid });
    }

    tStamp("returning TwiML ack to Twilio");
    void logEvent('webhook:ack', { from: normalizedFrom, to: normalizedTo, sid, elapsed_ms: Math.round(performance.now() - reqStart) });

    return twimlAck();
  } catch (err) {
    console.error("[twilio-sms-inbound] error:", err);
    void logEvent('webhook:error', { level: 'error', metadata: { error: String((err as any)?.message || err) } });
    // Always return valid TwiML so Twilio doesn't show an error/retry storm to the sender
    return twimlAck();
  }
});
