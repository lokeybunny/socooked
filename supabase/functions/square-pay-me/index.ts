import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { amount_cents, name, note } = await req.json();

    if (!amount_cents || typeof amount_cents !== "number" || amount_cents < 100) {
      return new Response(JSON.stringify({ error: "Amount must be at least $1.00" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (amount_cents > 10000000) {
      return new Response(JSON.stringify({ error: "Amount too large" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!SQUARE_ACCESS_TOKEN) throw new Error("SQUARE_ACCESS_TOKEN not configured");

    const idempotencyKey = crypto.randomUUID();

    const description = [
      name && name !== "Anonymous" ? `From: ${name}` : null,
      note ? `Note: ${note}` : null,
    ]
      .filter(Boolean)
      .join(" | ") || "Payment to Warren";

    const body = {
      idempotency_key: idempotencyKey,
      order: {
        location_id: "main",
        line_items: [
          {
            name: description.slice(0, 255),
            quantity: "1",
            base_price_money: {
              amount: amount_cents,
              currency: "USD",
            },
          },
        ],
      },
      checkout_options: {
        allow_tipping: true,
        redirect_url: `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app")}/payme?paid=true`,
      },
    };

    // Get location ID first
    const locRes = await fetch("https://connect.squareup.com/v2/locations", {
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    const locData = await locRes.json();
    const locationId = locData.locations?.[0]?.id;
    if (!locationId) throw new Error("No Square location found");

    // Update body with real location ID
    body.order.location_id = locationId;
    body.checkout_options.redirect_url = "https://socooked.lovable.app/payme?paid=true";

    const res = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-01-18",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Square error:", JSON.stringify(data));
      throw new Error(data.errors?.[0]?.detail || "Square API error");
    }

    return new Response(JSON.stringify({ url: data.payment_link?.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("square-pay-me error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
