// Authorize.Net charge endpoint — production environment
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOGIN_ID = Deno.env.get("AUTHORIZE_NET_LOGIN_ID")!;
const TRANSACTION_KEY = Deno.env.get("AUTHORIZE_NET_TRANSACTION_KEY")!;
// Use production endpoint. Switch to sandbox URL for testing.
const ENDPOINT = "https://api.authorize.net/xml/v1/request.api";

function bad(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, error: msg, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function luhnValid(num: string): boolean {
  if (!/^\d+$/.test(num)) return false;
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = parseInt(num[i], 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  try {
    const body = await req.json();
    const amount = Number(body.amount);
    const cardNumber = String(body.cardNumber || "").replace(/[^\d]/g, "").slice(0, 16);
    const expMonth = String(body.expMonth || "").padStart(2, "0");
    const expYear = String(body.expYear || "");
    const cvv = String(body.cvv || "");
    const zip = String(body.zip || "");
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const note = String(body.note || "").slice(0, 250);

    if (!amount || amount < 1 || amount > 100000) {
      return bad("Enter a valid amount between $1 and $100,000.", 400, { field: "amount" });
    }
    if (!/^\d{13,16}$/.test(cardNumber)) {
      return bad("Card number must be 13–16 digits.", 400, { field: "cardNumber" });
    }
    if (!luhnValid(cardNumber)) {
      return bad("That card number doesn't look right. Please double-check the digits.", 400, { field: "cardNumber" });
    }
    if (!/^\d{2}$/.test(expMonth) || Number(expMonth) < 1 || Number(expMonth) > 12) {
      return bad("Expiry month must be 01–12.", 400, { field: "exp" });
    }
    if (!/^\d{2,4}$/.test(expYear)) {
      return bad("Expiry year is invalid.", 400, { field: "exp" });
    }
    // Reject expired cards
    const fullYear = expYear.length === 2 ? 2000 + Number(expYear) : Number(expYear);
    const now = new Date();
    const lastDay = new Date(fullYear, Number(expMonth), 0, 23, 59, 59);
    if (lastDay < now) {
      return bad("This card has expired.", 400, { field: "exp" });
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      return bad("CVV must be 3 or 4 digits.", 400, { field: "cvv" });
    }

    const expDate = `${expMonth}${expYear.slice(-2)}`;
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ") || "Customer";

    const payload = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: LOGIN_ID,
          transactionKey: TRANSACTION_KEY,
        },
        refId: `pm_${Date.now()}`,
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: amount.toFixed(2),
          payment: {
            creditCard: {
              cardNumber,
              expirationDate: expDate,
              cardCode: cvv,
            },
          },
          order: { description: note || "PayMe charge" },
          billTo: {
            firstName: firstName || "Guest",
            lastName,
            zip: zip || undefined,
            email: email || undefined,
          },
        },
      },
    };

    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Authorize.Net often returns a UTF-8 BOM
    const text = (await resp.text()).replace(/^\uFEFF/, "").trim();
    let data: any;
    try { data = JSON.parse(text); } catch { return bad("Bad gateway response", 502, { raw: text.slice(0, 500) }); }

    const tr = data?.transactionResponse;
    const result = data?.messages?.resultCode;

    if (result === "Ok" && tr?.responseCode === "1") {
      // Record receipt (no card data stored)
      try {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await sb.from("payme_charges").insert({
          transaction_id: String(tr.transId),
          auth_code: tr.authCode || null,
          amount: Number(amount.toFixed(2)),
          last4: cardNumber.slice(-4),
          payer_name: name || null,
          payer_email: email || null,
          note: note || null,
        });
      } catch (e) {
        console.error("[authnet-charge] receipt insert failed", e);
      }

      return new Response(JSON.stringify({
        ok: true,
        transactionId: tr.transId,
        authCode: tr.authCode,
        amount: amount.toFixed(2),
        last4: cardNumber.slice(-4),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const errMsg =
      tr?.errors?.[0]?.errorText ||
      data?.messages?.message?.[0]?.text ||
      "Transaction declined";
    return bad(errMsg, 402, { code: tr?.responseCode, full: data });
  } catch (e) {
    console.error("[authnet-charge]", e);
    return bad((e as Error).message || "Server error", 500);
  }
});
