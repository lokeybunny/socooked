// Twilio inbound voice webhook for Business Line 1 (VoidFix → Twilio → Verizon)
// Configure as the Twilio number's "A CALL COMES IN" webhook (POST):
//   https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/twilio-inbound-call

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";
const TWILIO_PHONE_SID = Deno.env.get("TWILIO_PHONE_NUMBER_SID") || "PN886a8a5f97335d5a795f13d8b04ebee4";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEFAULTS = {
  forward_to: "+17027016192", // Verizon (Business Line 2)
  timeout_seconds: 22,
};

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

function escapeXml(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formToPayload(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) out[key] = String(value);
  return out;
}

async function auditInbound(args: {
  stage: string;
  callSid?: string;
  from?: string;
  to?: string;
  forwardedTo?: string;
  callLogId?: string | null;
  callLogCreated?: boolean;
  error?: string;
  rawPayload?: Record<string, string>;
}) {
  const { error } = await sb.from("missed_call_webhook_audit").insert({
    webhook_name: "twilio-inbound-call",
    event_stage: args.stage,
    call_sid: args.callSid || null,
    phone_number: args.from || null,
    to_number: args.to || null,
    forwarded_phone_number: args.forwardedTo || DEFAULTS.forward_to,
    twilio_phone_sid: TWILIO_PHONE_SID,
    call_log_id: args.callLogId || null,
    call_log_created: args.callLogCreated === true,
    missed_call_row_created: false,
    error_message: args.error || null,
    raw_payload: args.rawPayload || {},
  });
  if (error) console.error("[twilio-inbound-call][audit]", error.message);
}

async function loadCfg() {
  const { data } = await sb.from("app_settings").select("value").eq("key", "voidfix_missed_call").maybeSingle();
  const v = (data?.value as any) || {};
  return {
    forward_to: normalizePhone(v.forward_to) || DEFAULTS.forward_to,
    timeout_seconds: Number.isFinite(v.timeout_seconds) ? Math.min(60, Math.max(10, Number(v.timeout_seconds))) : DEFAULTS.timeout_seconds,
  };
}

const VIP_SIGNED_FORWARD = "+17028322317";

async function isSignedAgreementCaller(phone: string): Promise<boolean> {
  const last10 = phone.replace(/\D/g, "").slice(-10);
  if (!last10 || last10.length !== 10) return false;
  const { data } = await sb
    .from("proposals")
    .select("id")
    .eq("status", "signed")
    .ilike("client_phone", `%${last10}%`)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const form = await req.formData();
    const from = normalizePhone(String(form.get("From") || ""));
    const to = normalizePhone(String(form.get("To") || ""));
    const callSid = String(form.get("CallSid") || "");

    const cfg = await loadCfg();
    const customerId = await findCustomerByPhone(from);

    // Clear any stale active call_log rows for this caller — prevents the
    // unique-active-call-per-phone index from blocking back-to-back inbound calls.
    if (from) {
      await sb
        .from("powerdial_call_logs")
        .update({ twilio_status: "completed" })
        .eq("phone", from)
        .in("twilio_status", ["initiated", "ringing", "answered", "in-progress"]);
    }

    // Log the inbound leg (campaign_id NULL = forwarded inbound, not power-dialed)
    let insertedLog: { id: string } | null = null;
    let insertError: { message: string } | null = null;
    {
      const res = await sb.from("powerdial_call_logs").insert({
        twilio_call_sid: callSid,
        twilio_status: "ringing",
        phone: from || "unknown",
        from_number: from,
        to_number: to,
        customer_id: customerId,
        source: "twilio_forwarded_voidfix",
        meta: { inbound: true },
      }).select("id").single();
      insertedLog = res.data as any;
      insertError = res.error as any;
    }

    await auditInbound({
      stage: insertError ? "call_log_insert_failed" : "inbound_received",
      callSid,
      from,
      to,
      forwardedTo: cfg.forward_to,
      callLogId: insertedLog?.id || null,
      callLogCreated: Boolean(insertedLog?.id),
      error: insertError?.message,
      rawPayload: formToPayload(form),
    });

    const actionUrl = `${SUPABASE_URL}/functions/v1/twilio-dial-complete`;
    const whisperUrl = `${SUPABASE_URL}/functions/v1/twilio-whisper?from=${encodeURIComponent(from)}`;
    const callerId = from || normalizePhone(TWILIO_FROM) || TWILIO_FROM;

    // Whisper on the Verizon leg ("Press 1 to accept") prevents Verizon voicemail from
    // auto-answering and falsely marking the call as completed.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${cfg.timeout_seconds}" action="${escapeXml(actionUrl)}" method="POST" callerId="${escapeXml(callerId)}" answerOnBridge="true">
    <Number url="${escapeXml(whisperUrl)}" method="POST">${escapeXml(cfg.forward_to)}</Number>
  </Dial>
</Response>`;

    return new Response(xml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
  } catch (err) {
    console.error("[twilio-inbound-call]", err);
    await auditInbound({ stage: "error", error: (err as Error).message });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new Response(xml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
  }
});
