import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-nowpayments-sig",
};

function sortedStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(sortedStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k])).join(",") + "}";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SECRET = Deno.env.get("NOWPAYMENTS_IPN_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const rawBody = await req.text();
    const sig = req.headers.get("x-nowpayments-sig") ?? "";

    if (SECRET) {
      const parsed = JSON.parse(rawBody);
      const sorted = sortedStringify(parsed);
      const expected = createHmac("sha512", SECRET).update(sorted).digest("hex");
      if (expected !== sig) {
        console.error("HMAC mismatch");
        return new Response(JSON.stringify({ error: "invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("NOWPAYMENTS_IPN_SECRET not set — skipping HMAC verification");
    }

    const payload = JSON.parse(rawBody);
    const { order_id, payment_status } = payload;
    if (!order_id) return new Response("ok", { headers: corsHeaders });

    // Update payment row
    await supabase
      .from("poly_payments")
      .update({ status: payment_status })
      .eq("order_id", order_id);

    if (payment_status === "finished") {
      const { data: pay } = await supabase
        .from("poly_payments")
        .select("user_id, tier")
        .eq("order_id", order_id)
        .maybeSingle();

      if (pay?.user_id) {
        const days = pay.tier === "yearly" ? 365 : 30;
        const expires = new Date(Date.now() + days * 86400_000).toISOString();
        await supabase.from("poly_memberships").upsert({
          user_id: pay.user_id,
          role: "inner_edge_member",
          expires_at: expires,
        }, { onConflict: "user_id" });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
