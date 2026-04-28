// TwiML endpoint that the Twilio Voice SDK hits when the browser places an
// outgoing call. Bridges the browser leg to the dialed PSTN number using the
// configured Twilio caller ID.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";

function normalizePhone(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

function escapeXml(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const ct = req.headers.get("content-type") || "";
    let to = "";
    let from = "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      to = String(form.get("To") || form.get("to") || "");
      from = String(form.get("From") || form.get("from") || "");
    } else if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      to = body.To || body.to || "";
      from = body.From || body.from || "";
    } else {
      const url = new URL(req.url);
      to = url.searchParams.get("To") || "";
    }

    const normalizedTo = normalizePhone(to);
    const callerId = normalizePhone(TWILIO_FROM) || TWILIO_FROM;

    if (!normalizedTo) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid number.</Say><Hangup/></Response>`;
      return new Response(xml, { headers: { ...CORS, "Content-Type": "text/xml" } });
    }

    // Bridge the browser leg directly to the dialed PSTN number.
    // answerOnBridge=true means the browser hears ringing until the callee answers.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerId)}" answerOnBridge="true" timeout="30">
    <Number>${escapeXml(normalizedTo)}</Number>
  </Dial>
</Response>`;
    return new Response(xml, { headers: { ...CORS, "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("[twilio-voice-twiml]", err);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say><Hangup/></Response>`;
    return new Response(xml, { headers: { ...CORS, "Content-Type": "text/xml" } });
  }
});
