import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SQUARE_BASE = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

const VALID_AMOUNTS = [2000, 4000, 6000, 10000]; // cents

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!SQUARE_ACCESS_TOKEN) throw new Error("SQUARE_ACCESS_TOKEN not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { amount_cents, landing_page_id, email } = body;

    if (!amount_cents || !VALID_AMOUNTS.includes(amount_cents)) {
      return new Response(
        JSON.stringify({ error: `Invalid amount. Must be one of: ${VALID_AMOUNTS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!landing_page_id) {
      return new Response(
        JSON.stringify({ error: "landing_page_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get location ID
    const locRes = await fetch(`${SQUARE_BASE}/locations`, {
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
    });
    const locData = await locRes.json();
    const locationId = locData.locations?.[0]?.id;
    if (!locationId) throw new Error("No Square location found");

    const amountDollars = (amount_cents / 100).toFixed(0);

    // Create payment link
    const linkBody: Record<string, unknown> = {
      idempotency_key: crypto.randomUUID(),
      quick_pay: {
        name: `Phone Credits — $${amountDollars} Top-Up`,
        price_money: {
          amount: amount_cents,
          currency: "USD",
        },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: `https://warren.guru/client-dashboard?credits_added=${amountDollars}`,
        ask_for_shipping_address: false,
      },
      payment_note: `phone_credits:${landing_page_id}:${amount_cents}`,
    };

    if (email && email.includes("@")) {
      linkBody.pre_populated_data = { buyer_email: email };
    }

    const linkRes = await fetch(`${SQUARE_BASE}/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
      body: JSON.stringify(linkBody),
    });
    const linkResult = await linkRes.json();

    if (!linkRes.ok) {
      console.error("Square payment link error:", JSON.stringify(linkResult));
      throw new Error(`Square API error: ${JSON.stringify(linkResult)}`);
    }

    const paymentLink = linkResult.payment_link;
    if (!paymentLink?.url) throw new Error("Failed to create payment link");

    // Store a record so the webhook can match it
    const orderId = paymentLink.order_id;
    if (orderId) {
      await sb.from("guru_subscriptions").insert({
        email: email || "unknown",
        status: "pending_credits",
        plan: "phone_credits",
        amount_cents,
        square_order_id: orderId,
        square_payment_link_id: paymentLink.id,
        meta: {
          type: "phone_credits",
          landing_page_id,
          amount_cents,
          payment_link_url: paymentLink.url,
        },
      });
    }

    console.log(`[phone-credits] Created payment link for $${amountDollars}, page ${landing_page_id}`);

    return new Response(
      JSON.stringify({ url: paymentLink.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("phone-credits error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
