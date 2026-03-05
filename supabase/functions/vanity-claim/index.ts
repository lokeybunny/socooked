import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT = 3; // max claims per window
const WINDOW_MINUTES = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP from headers (Supabase edge functions forward this)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check rate limit: how many vanities this IP claimed in last WINDOW_MINUTES
    const windowStart = new Date(
      Date.now() - WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    const { count, error: countErr } = await supabase
      .from("vanities")
      .select("*", { count: "exact", head: true })
      .eq("claimed_ip", ip)
      .gte("claimed_at", windowStart);

    if (countErr) throw countErr;

    if ((count ?? 0) >= RATE_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: `You can only claim ${RATE_LIMIT} vanities every ${WINDOW_MINUTES} minutes. Please wait and try again.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Claim the next unclaimed vanity atomically using a DB function
    // We'll do: select one unclaimed, then update it. Use a transaction-like approach.
    const { data: vanity, error: fetchErr } = await supabase
      .from("vanities")
      .select("id, value")
      .is("claimed_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (fetchErr || !vanity) {
      return new Response(
        JSON.stringify({
          error: "exhausted",
          message: "All vanities have been claimed. Check back later!",
        }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as claimed — only if still unclaimed (optimistic lock)
    const { data: claimed, error: updateErr } = await supabase
      .from("vanities")
      .update({ claimed_at: new Date().toISOString(), claimed_ip: ip })
      .eq("id", vanity.id)
      .is("claimed_at", null)
      .select("value")
      .single();

    if (updateErr || !claimed) {
      // Race condition — someone else grabbed it, retry once
      const { data: retry, error: retryErr } = await supabase
        .from("vanities")
        .select("id, value")
        .is("claimed_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (retryErr || !retry) {
        return new Response(
          JSON.stringify({ error: "exhausted", message: "All vanities have been claimed." }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: retryClaimed, error: retryUpErr } = await supabase
        .from("vanities")
        .update({ claimed_at: new Date().toISOString(), claimed_ip: ip })
        .eq("id", retry.id)
        .is("claimed_at", null)
        .select("value")
        .single();

      if (retryUpErr || !retryClaimed) {
        return new Response(
          JSON.stringify({ error: "busy", message: "Too busy right now, please try again." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ vanity: retryClaimed.value }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate remaining claims in this window
    const remaining = RATE_LIMIT - ((count ?? 0) + 1);

    return new Response(
      JSON.stringify({ vanity: claimed.value, remaining }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("vanity-claim error:", err);
    return new Response(
      JSON.stringify({ error: "server_error", message: "Something went wrong." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
