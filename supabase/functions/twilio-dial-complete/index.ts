// Twilio Dial action callback — fired after the <Dial> verb finishes.
// Receives DialCallStatus (completed, no-answer, busy, failed, canceled).
// On miss → fire VoidFix auto-reply + log missed_call_event + add to power dialer queue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_PHONE_SID = Deno.env.get("TWILIO_PHONE_NUMBER_SID") || "PN886a8a5f97335d5a795f13d8b04ebee4";
const FORWARDED_TO_NUMBER = "+17027016192";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_MISSED_MESSAGE =
  "Currently in a meeting, talk with you soon. In the meanwhile, check my work out on IG: https://instagram.com/w4rr3nGURU";

const MISSED_STATES = new Set(["no-answer", "busy", "failed", "canceled"]);
// Window for collapsing duplicate missed_call_event rows (avoids row spam from Twilio retries)
const DEDUPE_WINDOW_MIN = 10;
// Cooldown for sending the courtesy auto-reply SMS. If the same caller misses again
// after this window has passed, send another auto-reply (still attached to the same event row).
const AUTO_REPLY_COOLDOWN_MIN = 2;

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw);
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (s.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

function formToPayload(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) out[key] = String(value);
  return out;
}

async function auditDialComplete(args: {
  stage: string;
  callSid?: string;
  dialCallSid?: string;
  from?: string;
  to?: string;
  dialStatus?: string;
  isMissed?: boolean;
  callLogId?: string | null;
  missedCallEventId?: string | null;
  callLogCreated?: boolean;
  missedCallRowCreated?: boolean;
  error?: string;
  rawPayload?: Record<string, string>;
}) {
  const { error } = await sb.from("missed_call_webhook_audit").insert({
    webhook_name: "twilio-dial-complete",
    event_stage: args.stage,
    call_sid: args.callSid || null,
    dial_call_sid: args.dialCallSid || null,
    phone_number: args.from || null,
    to_number: args.to || null,
    forwarded_phone_number: FORWARDED_TO_NUMBER,
    twilio_phone_sid: TWILIO_PHONE_SID,
    dial_status: args.dialStatus || null,
    is_missed: typeof args.isMissed === "boolean" ? args.isMissed : null,
    call_log_id: args.callLogId || null,
    missed_call_event_id: args.missedCallEventId || null,
    call_log_created: args.callLogCreated === true,
    missed_call_row_created: args.missedCallRowCreated === true,
    error_message: args.error || null,
    raw_payload: args.rawPayload || {},
  });
  if (error) console.error("[twilio-dial-complete][audit]", error.message);
}

async function loadCfg() {
  const { data } = await sb.from("app_settings").select("value").eq("key", "voidfix_missed_call").maybeSingle();
  const v = (data?.value as any) || {};
  return {
    enabled: v.enabled !== false,
    queue_enabled: v.queue_enabled !== false,
    message: typeof v.message === "string" && v.message.trim() ? v.message.trim() : DEFAULT_MISSED_MESSAGE,
    auto_reply_enabled: v.auto_reply_enabled !== false,
  };
}

async function findCustomerByPhone(phone: string): Promise<string | null> {
  const last10 = phone.replace(/\D/g, "").slice(-10);
  if (!last10 || last10.length !== 10) return null;
  const { data } = await sb
    .from("customers")
    .select("id")
    .or(`phone.ilike.%${last10}%`)
    .not("status", "in", "(dead,lost,archived,deleted)")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}

async function sendVoidfixAutoReply(toPhone: string, message: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: "send",
        to: toPhone,
        body: message,
        source: "twilio-missed-call-auto-reply",
        metadata: { source_kind: "missed_call" },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
      return { ok: false, error: data?.error || `status_${resp.status}` };
    }
    return { ok: true, id: data?.id || undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const form = await req.formData();
    const rawPayload = formToPayload(form);
    const callSid = String(form.get("CallSid") || ""); // parent (caller→Twilio)
    const dialCallSid = String(form.get("DialCallSid") || ""); // child (Twilio→Verizon)
    const from = normalizePhone(String(form.get("From") || ""));
    const to = normalizePhone(String(form.get("To") || ""));
    const dialStatus = String(form.get("DialCallStatus") || "").toLowerCase();
    const dialBridgedRaw = String(form.get("DialBridged") || "").toLowerCase();
    const dialBridged = dialBridgedRaw === "true" ? true : dialBridgedRaw === "false" ? false : null;
    const dialDuration = parseInt(String(form.get("DialCallDuration") || "0"), 10) || 0;

    // With whisper/accept, Twilio may report "completed" because the forwarded leg
    // answered the whisper prompt, even when it never bridged to the original caller.
    // DialBridged=false means the real caller was not connected → count as missed.
    const completedButNotBridged = dialStatus === "completed" && dialBridged === false;
    const isMissed = MISSED_STATES.has(dialStatus) || completedButNotBridged;
    const isAnswered = dialStatus === "completed" && !completedButNotBridged;
    const effectiveStatus = completedButNotBridged ? "no-answer" : (isAnswered ? "completed" : dialStatus || "no-answer");

    // Update the original call_logs row (matched by CallSid)
    const { data: logRow } = await sb
      .from("powerdial_call_logs")
      .select("id, customer_id")
      .eq("twilio_call_sid", callSid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let logId = logRow?.id || null;
    let customerId = logRow?.customer_id || null;
    if (!customerId) customerId = await findCustomerByPhone(from);

    let callLogCreated = false;
    let callLogError: string | undefined;

    if (logId) {
      const { error: updateError } = await sb
        .from("powerdial_call_logs")
        .update({
          twilio_status: effectiveStatus,
          dial_call_status: dialStatus,
          parent_call_sid: dialCallSid || null,
          missed: isMissed,
          answered: isAnswered,
          customer_id: customerId,
          meta: { from_number: from, to_number: to, dial_duration: dialDuration, dial_bridged: dialBridged, missed_reason: completedButNotBridged ? "completed_unbridged" : null, inbound: true },
        })
        .eq("id", logId);
      callLogError = updateError?.message;
    } else {
      const { data: inserted, error: insertError } = await sb
        .from("powerdial_call_logs")
        .insert({
          twilio_call_sid: callSid,
          parent_call_sid: dialCallSid || null,
          twilio_status: effectiveStatus,
          dial_call_status: dialStatus,
          missed: isMissed,
          answered: isAnswered,
          phone: from || "unknown",
          from_number: from,
          to_number: to,
          customer_id: customerId,
          source: "twilio_forwarded_voidfix",
          meta: { dial_duration: dialDuration, dial_bridged: dialBridged, missed_reason: completedButNotBridged ? "completed_unbridged" : null, inbound: true },
        })
        .select("id")
        .single();
      logId = inserted?.id || null;
      callLogCreated = Boolean(inserted?.id);
      callLogError = insertError?.message;
    }

    await auditDialComplete({
      stage: callLogError ? "call_log_write_failed" : "dial_complete_received",
      callSid,
      dialCallSid,
      from,
      to,
      dialStatus,
      isMissed,
      callLogId: logId,
      callLogCreated,
      error: callLogError,
      rawPayload,
    });

    // Acknowledge XML — empty when answered, redirect to voicemail when missed
    const ackXml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    const voicemailUrl = `${SUPABASE_URL}/functions/v1/twilio-voicemail`;
    const voicemailXml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${voicemailUrl}</Redirect></Response>`;
    const ackResp = new Response(ackXml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
    const voicemailResp = () => new Response(voicemailXml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });

    if (!isMissed || !from) {
      await auditDialComplete({
        stage: !isMissed ? "not_missed" : "missing_caller_number",
        callSid,
        dialCallSid,
        from,
        to,
        dialStatus,
        isMissed,
        callLogId: logId,
        rawPayload,
      });
      return ackResp;
    }

    const cfg = await loadCfg();
    if (!cfg.enabled) {
      await auditDialComplete({
        stage: "missed_call_logging_disabled",
        callSid,
        dialCallSid,
        from,
        to,
        dialStatus,
        isMissed,
        callLogId: logId,
        rawPayload,
      });
      return voicemailResp();
    }

    const last10 = from.replace(/\D/g, "").slice(-10);

    // Dedupe: only one missed_call_event + one auto-reply per number per 10min window
    const since = new Date(Date.now() - DEDUPE_WINDOW_MIN * 60_000).toISOString();
    const { data: recent } = await sb
      .from("missed_call_events")
      .select("id, auto_reply_sent, auto_reply_message, voidfix_message_id, meta, updated_at, created_at")
      .eq("phone_last10", last10)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);

    const recentEvent = recent?.[0];

    if (recentEvent) {
      // Decide whether to re-send the auto-reply: only if cooldown elapsed since last send.
      const lastReplyAtIso = (recentEvent.meta as any)?.last_auto_reply_at || recentEvent.updated_at || recentEvent.created_at;
      const lastReplyMs = lastReplyAtIso ? new Date(lastReplyAtIso).getTime() : 0;
      const cooldownPassed = Date.now() - lastReplyMs >= AUTO_REPLY_COOLDOWN_MIN * 60_000;
      const shouldResend = cfg.auto_reply_enabled && cooldownPassed;

      let resendResult: { ok: boolean; id?: string; error?: string } = { ok: false };
      if (shouldResend) {
        resendResult = await sendVoidfixAutoReply(from, cfg.message);
      }

      // Always re-link the latest call_log_id so the voicemail callback can attach the recording.
      await sb
        .from("missed_call_events")
        .update({
          call_log_id: logId,
          meta: {
            ...(recentEvent.meta as any || {}),
            last_call_log_id: logId,
            last_at: new Date().toISOString(),
            ...(resendResult.ok ? { last_auto_reply_at: new Date().toISOString() } : {}),
          },
          ...(resendResult.ok ? { auto_reply_sent: true, voidfix_message_id: resendResult.id || recentEvent.voidfix_message_id } : {}),
        })
        .eq("id", recentEvent.id);

      await auditDialComplete({
        stage: shouldResend
          ? (resendResult.ok ? "missed_call_deduped_resent" : "missed_call_deduped_resend_failed")
          : "missed_call_deduped",
        callSid,
        dialCallSid,
        from,
        to,
        dialStatus,
        isMissed,
        callLogId: logId,
        missedCallEventId: recentEvent.id,
        missedCallRowCreated: false,
        rawPayload: { ...rawPayload, _resend: shouldResend, _resendError: resendResult.error || null },
      });
      return voicemailResp();
    }

    // Send auto-reply (if enabled)
    let autoReplyResult: { ok: boolean; id?: string; error?: string } = { ok: false };
    if (cfg.auto_reply_enabled) {
      autoReplyResult = await sendVoidfixAutoReply(from, cfg.message);
    }

    // Insert missed_call_event
    const { data: missedEvent, error: missedInsertError } = await sb.from("missed_call_events").insert({
      call_log_id: logId,
      customer_id: customerId,
      phone_number: from,
      phone_last10: last10,
      status: autoReplyResult.ok ? "auto_replied" : (cfg.auto_reply_enabled ? "auto_reply_failed" : "logged"),
      callback_status: "open",
      auto_reply_sent: autoReplyResult.ok,
      auto_reply_message: cfg.auto_reply_enabled ? cfg.message : null,
      voidfix_message_id: autoReplyResult.id || null,
      error_message: autoReplyResult.error || null,
    }).select("id").single();

    await auditDialComplete({
      stage: missedInsertError ? "missed_call_insert_failed" : "missed_call_created",
      callSid,
      dialCallSid,
      from,
      to,
      dialStatus,
      isMissed,
      callLogId: logId,
      missedCallEventId: missedEvent?.id || null,
      missedCallRowCreated: Boolean(missedEvent?.id),
      error: missedInsertError?.message,
      rawPayload,
    });

    // Add to power dialer callback queue (no campaign — generic callback queue uses NULL campaign)
    if (cfg.queue_enabled) {
      // Use the most recent active power-dialer campaign if one exists; otherwise skip
      // (queue requires campaign_id). Fallback: skip silently.
      const { data: anyCampaign } = await sb
        .from("powerdial_campaigns")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (anyCampaign?.id) {
        const { data: existing } = await sb
          .from("powerdial_queue")
          .select("id")
          .eq("phone", from)
          .in("status", ["pending", "retry_later"])
          .limit(1);
        if (!existing?.[0]) {
          await sb.from("powerdial_queue").insert({
            campaign_id: anyCampaign.id,
            customer_id: customerId,
            phone: from,
            status: "pending",
            position: 0,
          });
        }
      }
    }

    return voicemailResp();
  } catch (err) {
    console.error("[twilio-dial-complete]", err);
    await auditDialComplete({ stage: "error", error: (err as Error).message });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new Response(xml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
  }
});
