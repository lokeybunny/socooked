// Lightweight manual outbound dialer using Twilio REST API directly (no Vapi, no PowerDial campaign).
// Actions: dial, hangup, status

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalizePhone(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

function twilioAuthHeader() {
  return `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "dial";

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return json({ error: "Twilio credentials not configured" }, 500);
    }

    if (action === "dial") {
      const to = normalizePhone(body.to || "");
      const from = normalizePhone(body.from || TWILIO_FROM) || TWILIO_FROM;
      if (!to) return json({ error: "Invalid 'to' phone number" }, 400);
      if (!from) return json({ error: "No Twilio 'from' number configured" }, 500);

      // Two-leg call: Twilio first dials YOU (caller), then bridges to recipient.
      // body.caller = your phone number to ring first
      const caller = normalizePhone(body.caller || "");
      if (!caller) return json({ error: "Caller phone required (your phone to ring first)" }, 400);

      // TwiML inline: when caller answers, bridge to 'to'
      const twiml = `<Response><Dial callerId="${from}" timeout="30" answerOnBridge="true"><Number>${to}</Number></Dial></Response>`;

      const params = new URLSearchParams({
        To: caller,
        From: from,
        Twiml: twiml,
        Timeout: "30",
      });

      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
        {
          method: "POST",
          headers: {
            Authorization: twilioAuthHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );

      const data = await resp.json();
      if (!resp.ok) {
        console.error("[twilio-dial] error:", data);
        return json({ error: data.message || "Twilio dial failed", code: data.code }, 500);
      }

      console.log(`[twilio-dial] bridging caller ${caller} → ${to}, SID: ${data.sid}`);
      return json({ ok: true, call_sid: data.sid, to, from, caller, status: data.status });
    }

    if (action === "hangup") {
      const sid = body.call_sid;
      if (!sid) return json({ error: "call_sid required" }, 400);

      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${sid}.json`,
        {
          method: "POST",
          headers: {
            Authorization: twilioAuthHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ Status: "completed" }).toString(),
        },
      );
      const data = await resp.json();
      if (!resp.ok) return json({ error: data.message || "Hangup failed" }, 500);
      return json({ ok: true, status: data.status });
    }

    if (action === "status") {
      const sid = body.call_sid;
      if (!sid) return json({ error: "call_sid required" }, 400);
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${sid}.json`,
        { headers: { Authorization: twilioAuthHeader() } },
      );
      const data = await resp.json();
      if (!resp.ok) return json({ error: data.message || "Status fetch failed" }, 500);
      return json({
        ok: true,
        status: data.status,
        duration: data.duration,
        from: data.from,
        to: data.to,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[twilio-dial]", err);
    return json({ error: String(err) }, 500);
  }
});
