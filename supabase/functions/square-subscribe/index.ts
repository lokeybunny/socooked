import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SQUARE_BASE = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

async function squareFetch(
  path: string,
  token: string,
  body: Record<string, unknown>,
  method = "POST"
) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Square API error:", JSON.stringify(data));
    throw new Error(
      `Square API error [${res.status}]: ${JSON.stringify(data)}`
    );
  }
  return data;
}

async function squareGet(path: string, token: string) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Square GET error [${res.status}]: ${JSON.stringify(data)}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!SQUARE_ACCESS_TOKEN)
      throw new Error("SQUARE_ACCESS_TOKEN not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { email, name } = await req.json();
    if (!email) throw new Error("Email is required");

    // 1. Get location ID
    const locRes = await squareGet("/locations", SQUARE_ACCESS_TOKEN);
    const locationId = locRes.locations?.[0]?.id;
    if (!locationId) throw new Error("No Square location found");

    // 2. Create payment link for $599 first month
    const idempotencyKey = crypto.randomUUID();
    const linkResult = await squareFetch(
      "/online-checkout/payment-links",
      SQUARE_ACCESS_TOKEN,
      {
        idempotency_key: idempotencyKey,
        quick_pay: {
          name: "Warren Guru — Pro Subscription (Month 1)",
          price_money: {
            amount: 59900,
            currency: "USD",
          },
          location_id: locationId,
        },
        checkout_options: {
          redirect_url: "https://warren.guru/thankyou?subscribed=true",
          ask_for_shipping_address: false,
        },
        pre_populated_data: {
          buyer_email: email || undefined,
        },
      }
    );

    const paymentLink = linkResult.payment_link;
    if (!paymentLink?.url) throw new Error("Failed to create payment link");

    // 3. Record in DB
    const trialEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sb.from("guru_subscriptions").insert({
      email,
      full_name: name || null,
      status: "pending",
      plan: "pro",
      amount_cents: 59900,
      square_payment_link_id: paymentLink.id,
      square_order_id: paymentLink.order_id || null,
      trial_ends_at: trialEnd,
      meta: {
        payment_link_url: paymentLink.url,
        location_id: locationId,
      },
    });

    return new Response(
      JSON.stringify({ url: paymentLink.url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("square-subscribe error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
