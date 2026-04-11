import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SQUARE_BASE = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

/**
 * course-checkout — Creates a Square payment link for the AI filmmaking course.
 *
 * Body: { customer_id: string, email: string, name: string, amount_cents?: number }
 * amount_cents defaults to 9900 ($99) but can be overridden.
 */
Deno.serve(async (req) => {
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
    const { customer_id, email, name, amount_cents } = body;

    if (!customer_id || !email) {
      return new Response(
        JSON.stringify({ error: "customer_id and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default price: $99 (9900 cents) — easily adjustable
    const priceCents = amount_cents && Number.isInteger(amount_cents) && amount_cents > 0
      ? amount_cents
      : 29900;

    // Get Square location
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

    const priceDollars = (priceCents / 100).toFixed(2);

    // Build the redirect URL with customer_id so we can verify on return
    const redirectUrl = `https://socooked.lovable.app/course/success?cid=${customer_id}`;

    const linkBody: Record<string, unknown> = {
      idempotency_key: crypto.randomUUID(),
      quick_pay: {
        name: `AI Filmmaking 2 Hour Master Course — $${priceDollars}`,
        price_money: {
          amount: priceCents,
          currency: "USD",
        },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: redirectUrl,
        ask_for_shipping_address: false,
      },
      payment_note: `ai_course:${customer_id}`,
    };

    if (email?.includes("@")) {
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

    // Store subscription record for tracking
    const orderId = paymentLink.order_id;
    if (orderId) {
      await sb.from("guru_subscriptions").insert({
        email,
        full_name: name || null,
        status: "pending",
        plan: "ai_course",
        amount_cents: priceCents,
        square_order_id: orderId,
        square_payment_link_id: paymentLink.id,
        meta: {
          type: "ai_course",
          customer_id,
          payment_link_url: paymentLink.url,
        },
      });
    }

    // Update customer record with course tag
    await sb
      .from("customers")
      .update({
        tags: ["ai-course", "pending-payment"],
        meta: { course_order_id: orderId, course_amount: priceCents },
      })
      .eq("id", customer_id);

    console.log(`[course-checkout] Payment link created for ${email}, $${priceDollars}`);

    return new Response(
      JSON.stringify({
        payment_url: paymentLink.url,
        order_id: orderId,
        amount_cents: priceCents,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[course-checkout] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
