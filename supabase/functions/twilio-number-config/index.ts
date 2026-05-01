// Twilio Number Configuration helper — used by the Phone settings page.
// Lists incoming numbers and updates the VoiceUrl for the configured TWILIO_FROM_NUMBER.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function basicAuth() {
  return "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return json({ ok: false, error: "missing_twilio_creds" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = body?.action;

  // Find SID for the configured TWILIO_FROM number
  async function findNumberSid(phoneNumber: string): Promise<string | null> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`;
    const r = await fetch(url, { headers: { Authorization: basicAuth() } });
    const d = await r.json();
    return d?.incoming_phone_numbers?.[0]?.sid || null;
  }

  if (action === "status") {
    if (!TWILIO_FROM) return json({ ok: false, error: "missing_TWILIO_FROM_NUMBER" }, 500);
    const sid = await findNumberSid(TWILIO_FROM);
    if (!sid) return json({ ok: false, error: "number_not_found_in_account", number: TWILIO_FROM });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`, {
      headers: { Authorization: basicAuth() },
    });
    const d = await r.json();
    return json({
      ok: true,
      number: TWILIO_FROM,
      sid,
      voice_url: d.voice_url,
      voice_method: d.voice_method,
      friendly_name: d.friendly_name,
      desired_voice_url: `${SUPABASE_URL}/functions/v1/twilio-inbound-call`,
      is_configured: d.voice_url === `${SUPABASE_URL}/functions/v1/twilio-inbound-call`,
    });
  }

  if (action === "configure") {
    // Allow explicit sid override (e.g. PN…) so we can wire a number even if TWILIO_FROM_NUMBER is misconfigured
    let sid: string | null = typeof body?.sid === "string" && body.sid.startsWith("PN") ? body.sid : null;
    if (!sid) {
      if (!TWILIO_FROM) return json({ ok: false, error: "missing_TWILIO_FROM_NUMBER_or_sid" }, 500);
      sid = await findNumberSid(TWILIO_FROM);
      if (!sid) return json({ ok: false, error: "number_not_found_in_account", number: TWILIO_FROM });
    }
    const targetUrl = `${SUPABASE_URL}/functions/v1/twilio-inbound-call`;
    const form = new URLSearchParams({ VoiceUrl: targetUrl, VoiceMethod: "POST" });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`, {
      method: "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const d = await r.json();
    if (!r.ok) return json({ ok: false, error: d?.message || `twilio_${r.status}`, raw: d }, 500);
    return json({ ok: true, voice_url: d.voice_url, sid });
  }

  if (action === "list") {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PageSize=50`, {
      headers: { Authorization: basicAuth() },
    });
    const d = await r.json();
    if (!r.ok) return json({ ok: false, error: d?.message || `twilio_${r.status}`, raw: d }, 500);
    const numbers = (d?.incoming_phone_numbers || []).map((n: any) => ({
      sid: n.sid,
      phone_number: n.phone_number,
      friendly_name: n.friendly_name,
      voice_url: n.voice_url,
    }));
    return json({ ok: true, current_TWILIO_FROM_NUMBER: TWILIO_FROM, numbers });
  }

  return json({ ok: false, error: "unknown_action" }, 400);
});
