import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICES = {
  monthly: { usd: 25, sol: 0.8, days: 30 },
  yearly: { usd: 199, sol: 4, days: 365 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const NOW_API = Deno.env.get("NOWPAYMENTS_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const tier: keyof typeof PRICES = body.tier === "yearly" ? "yearly" : "monthly";
    const discord_id: string | undefined = body.discord_id;
    const user_id: string | undefined = body.user_id;
    const price = PRICES[tier];

    const order_id = crypto.randomUUID();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Record pending payment
    await supabase.from("poly_payments").insert({
      user_id: user_id ?? null,
      order_id,
      amount_sol: price.sol,
      tier,
      status: "pending",
    });

    if (!NOW_API) {
      // Stub mode: return a placeholder so UI flow works
      return new Response(JSON.stringify({
        order_id,
        invoice_url: `https://nowpayments.io/payment?stub=${order_id}`,
        pay_amount: price.sol,
        pay_currency: "sol",
        stub: true,
        message: "NOWPAYMENTS_API_KEY not set — invoice is a placeholder.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ipnUrl = `${SUPABASE_URL}/functions/v1/poly-nowpayments-webhook`;
    const invRes = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: { "x-api-key": NOW_API, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: price.usd,
        price_currency: "usd",
        pay_currency: "sol",
        order_id,
        order_description: `PolyVibe InnerEdge ${tier}`,
        ipn_callback_url: ipnUrl,
        success_url: `${req.headers.get("origin") ?? ""}/poly?paid=1`,
        cancel_url: `${req.headers.get("origin") ?? ""}/poly?cancelled=1`,
      }),
    });

    if (!invRes.ok) {
      const t = await invRes.text();
      console.error("NowPayments error:", invRes.status, t);
      return new Response(JSON.stringify({ error: "NowPayments error", detail: t }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const inv = await invRes.json();
    return new Response(JSON.stringify({ order_id, invoice_url: inv.invoice_url, raw: inv }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("poly-create-invoice error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
