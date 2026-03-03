import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MCAP_THRESHOLD = 100_000; // $100K
const MIN_AGE_HOURS = 12;

async function fetchMarketCap(caAddress: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${caAddress}`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) {
      console.warn(`[cleanup] DexScreener ${res.status} for ${caAddress}`);
      await res.text();
      return null;
    }
    const data = await res.json();
    const pairs = data?.pairs;
    if (!pairs || pairs.length === 0) return null;

    // Get highest market cap across all pairs
    let maxMcap = 0;
    for (const pair of pairs) {
      const mcap = pair?.marketCap ?? pair?.fdv ?? 0;
      if (mcap > maxMcap) maxMcap = mcap;
    }
    return maxMcap || null;
  } catch (err) {
    console.error(`[cleanup] DexScreener fetch error for ${caAddress}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000).toISOString();

    // Fetch top gainers older than 12 hours
    const { data: candidates, error: fetchErr } = await supabase
      .from("market_cap_alerts")
      .select("id, ca_address, token_symbol, token_name")
      .eq("is_top_gainer", true)
      .lt("created_at", cutoff);

    if (fetchErr) {
      console.error("[cleanup] fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!candidates || candidates.length === 0) {
      console.log("[cleanup] No candidates older than 12h found");
      return new Response(JSON.stringify({ cleaned: 0, checked: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[cleanup] Checking ${candidates.length} candidates via DexScreener`);

    const toRemove: string[] = [];
    const kept: string[] = [];

    // Check each candidate's market cap via DexScreener
    // Process in batches of 5 to avoid rate limits
    for (let i = 0; i < candidates.length; i += 5) {
      const batch = candidates.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (alert: any) => {
          const mcap = await fetchMarketCap(alert.ca_address);
          const ticker = alert.token_symbol || alert.ca_address.slice(0, 8);

          if (mcap === null) {
            // Can't determine mcap — keep it (fail-safe)
            console.log(`[cleanup] ${ticker}: mcap unknown — keeping`);
            kept.push(ticker);
            return;
          }

          if (mcap < MCAP_THRESHOLD) {
            console.log(`[cleanup] ${ticker}: $${mcap.toLocaleString()} < $100K — removing`);
            toRemove.push(alert.id);
          } else {
            console.log(`[cleanup] ${ticker}: $${mcap.toLocaleString()} >= $100K — keeping`);
            kept.push(ticker);
          }
        })
      );

      // Small delay between batches to respect DexScreener rate limits
      if (i + 5 < candidates.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Remove top gainer status from under-100K tokens
    if (toRemove.length > 0) {
      const { error: updateErr } = await supabase
        .from("market_cap_alerts")
        .update({ is_top_gainer: false })
        .in("id", toRemove);

      if (updateErr) {
        console.error("[cleanup] update error:", updateErr);
      }
    }

    const summary = {
      checked: candidates.length,
      cleaned: toRemove.length,
      kept: kept.length,
    };

    console.log(`[cleanup] Done: ${JSON.stringify(summary)}`);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[cleanup] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
