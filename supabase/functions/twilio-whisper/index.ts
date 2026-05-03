// Twilio whisper TwiML — played to the FORWARDED leg (Verizon) before the call connects.
// Forces a "Press 1 to accept" so Verizon voicemail can't auto-answer the call.
// If the agent doesn't press 1, Twilio treats the call as unanswered → triggers missed-call flow.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function escapeXml(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Read caller from query (set when we built the <Dial><Number url="..."> on inbound leg)
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from") || "";
  let prettyFrom = fromParam;
  if (/^\+1\d{10}$/.test(fromParam)) {
    const d = fromParam.slice(2);
    prettyFrom = `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }

  // Gather digit 1; if not pressed in 8s, hang up this leg → parent gets DialCallStatus=no-answer
  const gatherActionUrl = `${SUPABASE_URL}/functions/v1/twilio-whisper?step=gather`;
  const step = url.searchParams.get("step");

  if (step === "gather") {
    // After Gather completes — Twilio POSTs Digits here.
    const form = await req.formData().catch(() => null);
    const digits = String(form?.get("Digits") || "").trim();
    if (digits === "1") {
      // Accepted — connect through (return empty Response, parent <Dial> bridges audio)
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Connecting now.</Say></Response>`;
      return new Response(xml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
    }
    // Anything else → hang up the child leg so parent records as no-answer
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new Response(xml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
  }

  const announce = prettyFrom
    ? `Incoming call from ${escapeXml(prettyFrom)}.`
    : `Incoming forwarded call.`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="7" action="${escapeXml(gatherActionUrl)}" method="POST">
    <Say voice="alice" loop="2">${announce} Press 1 to accept.</Say>
  </Gather>
  <Hangup/>
</Response>`;

  return new Response(xml, { status: 200, headers: { ...CORS, "Content-Type": "text/xml; charset=utf-8" } });
});
