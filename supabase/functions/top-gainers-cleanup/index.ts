import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Remove is_top_gainer flag from alerts older than 24h
    const { data: expired, error: fetchErr } = await supabase
      .from("market_cap_alerts")
      .select("id, ca_address, token_symbol")
      .eq("is_top_gainer", true)
      .lt("created_at", cutoff);

    if (fetchErr) {
      console.error("[top-gainers-cleanup] fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!expired || expired.length === 0) {
      console.log("[top-gainers-cleanup] No expired top gainers found");
      return new Response(JSON.stringify({ cleaned: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = expired.map((a: any) => a.id);
    const { error: updateErr } = await supabase
      .from("market_cap_alerts")
      .update({ is_top_gainer: false })
      .in("id", ids);

    if (updateErr) {
      console.error("[top-gainers-cleanup] update error:", updateErr);
    }

    console.log(`[top-gainers-cleanup] Removed ${ids.length} expired top gainers`);

    return new Response(JSON.stringify({ cleaned: ids.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[top-gainers-cleanup] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
