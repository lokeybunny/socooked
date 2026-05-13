// Phone Device Audit
// Combines Twilio Lookup (line_type_intelligence) + VoidFix iMessage validate
// to permanently tag a contact as iPhone, Android, landline, or VoIP.
//
// Flow:
//   1. POST { action: 'quote', phone } -> returns cost ($0.008) + cached/locked flag
//   2. POST { action: 'run',   phone } -> runs lookup + iMessage validate, persists device_type
//
// Once device_type is set on sms_contacts, /run refuses to overwrite (returns existing).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TWILIO_LOOKUP_COST = 0.008;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalizeE164(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}
function last10(raw: string) { return String(raw || "").replace(/\D/g, "").slice(-10); }

async function twilioLookup(e164: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN) throw new Error("twilio_credentials_missing");
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`twilio_lookup_failed_${r.status}: ${JSON.stringify(j)}`);
  const lti = j.line_type_intelligence || {};
  return {
    valid: !!j.valid,
    line_type: String(lti.type || "unknown").toLowerCase(),
    carrier_name: lti.carrier_name || null,
    raw: j,
  };
}

async function imessageValidate(e164: string): Promise<boolean | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/voidfix-imessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
      },
      body: JSON.stringify({ action: "validate", to: e164 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return null;
    // If VoidFix itself reported failure, return null (unknown) instead of false
    if (j.ok === false) return null;
    return !!j.isImessage;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const action = payload?.action;
  const phone = String(payload?.phone || "");
  const e164 = normalizeE164(phone);
  const l10 = last10(phone);
  if (!e164 || l10.length !== 10) return json({ ok: false, error: "invalid_phone" }, 400);

  // Look up existing contact (locks the result if device_type is already set)
  const { data: contact } = await sb
    .from("sms_contacts")
    .select("phone_last10, name, device_type, device_audited_at, device_audit_meta")
    .eq("phone_last10", l10)
    .maybeSingle();

  if (action === "quote") {
    return json({
      ok: true,
      cost_usd: TWILIO_LOOKUP_COST,
      provider: "Twilio Lookup (line_type_intelligence) + VoidFix iMessage validate",
      already_audited: !!contact?.device_type,
      device_type: contact?.device_type || null,
      audited_at: contact?.device_audited_at || null,
    });
  }

  if (action === "run") {
    if (contact?.device_type) {
      return json({
        ok: true,
        locked: true,
        device_type: contact.device_type,
        audited_at: contact.device_audited_at,
        message: "Device type already audited — locked",
      });
    }

    let lookup: any;
    try { lookup = await twilioLookup(e164); }
    catch (e) { return json({ ok: false, error: (e as Error).message }, 502); }

    let isIMessage: boolean | null = null;
    if (lookup.line_type === "mobile" || lookup.line_type === "voip") {
      isIMessage = await imessageValidate(e164);
    }

    let device_type: "iphone" | "android" | "landline" | "voip" | "unknown" = "unknown";
    if (lookup.line_type === "landline" || lookup.line_type === "fixed") device_type = "landline";
    else if (lookup.line_type === "voip") device_type = isIMessage === true ? "iphone" : isIMessage === false ? "voip" : "unknown";
    else if (lookup.line_type === "mobile") device_type = isIMessage === true ? "iphone" : isIMessage === false ? "android" : "unknown";

    const auditedAt = new Date().toISOString();
    const meta = {
      twilio: { line_type: lookup.line_type, carrier: lookup.carrier_name, valid: lookup.valid },
      imessage_validated: isIMessage,
      cost_usd: TWILIO_LOOKUP_COST,
    };

    // Append device suffix to name (locked)
    const suffix = device_type === "iphone" ? "_iPhone"
                 : device_type === "android" ? "_Android"
                 : device_type === "landline" ? "_Landline"
                 : device_type === "voip" ? "_VoIP" : "";

    if (contact) {
      const baseName = (contact.name || "").replace(/_(iPhone|Android|Landline|VoIP)$/i, "");
      await sb.from("sms_contacts").update({
        device_type, device_audited_at: auditedAt, device_audit_meta: meta,
        name: suffix ? `${baseName}${suffix}` : baseName,
        updated_at: new Date().toISOString(),
      }).eq("phone_last10", l10);
    } else {
      await sb.from("sms_contacts").insert({
        phone_last10: l10,
        phone: e164,
        name: suffix ? `(${e164})${suffix}` : `(${e164})`,
        device_type, device_audited_at: auditedAt, device_audit_meta: meta,
      });
    }

    return json({
      ok: true, locked: false, device_type, audited_at: auditedAt,
      cost_usd: TWILIO_LOOKUP_COST, meta,
    });
  }

  return json({ ok: false, error: "unknown_action" }, 400);
});
