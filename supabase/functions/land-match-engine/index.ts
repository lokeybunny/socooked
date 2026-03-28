import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get all active buyers
    const { data: buyers } = await supabase
      .from("lw_buyers")
      .select("*")
      .eq("status", "active");

    if (!buyers || buyers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active buyers", matches: 0 }),
        { headers: corsHeaders }
      );
    }

    let totalMatches = 0;

    for (const buyer of buyers) {
      // Build seller query matching buyer criteria
      let query = supabase
        .from("lw_sellers")
        .select("*")
        .in("status", ["new", "skip_traced"])
        .gte("motivation_score", 40);

      // Filter by deal type
      if (buyer.deal_type) {
        query = query.eq("deal_type", buyer.deal_type);
      }

      // Filter by target counties
      if (buyer.target_counties && buyer.target_counties.length > 0) {
        query = query.in("county", buyer.target_counties);
      }

      // Filter by target states
      if (
        buyer.target_states &&
        buyer.target_states.length > 0 &&
        (!buyer.target_counties || buyer.target_counties.length === 0)
      ) {
        query = query.in("state", buyer.target_states);
      }

      // Filter by acreage
      if (buyer.acreage_min != null && buyer.acreage_min > 0) {
        query = query.gte("acreage", buyer.acreage_min);
      }
      if (buyer.acreage_max != null) {
        query = query.lte("acreage", buyer.acreage_max);
      }

      query = query.limit(100);

      const { data: sellers } = await query;
      if (!sellers || sellers.length === 0) continue;

      for (const seller of sellers) {
        // Compute match score
        const motivationWeight = (seller.motivation_score || 0) * 0.4;
        const buyerActivityWeight = (buyer.activity_score || 0) * 0.3;

        // Spread score — estimate spread if we have values
        let spreadScore = 5; // default low
        const marketVal = seller.market_value || seller.assessed_value || 0;
        const offerEstimate = marketVal * 0.65; // 65% of value
        const buyerMidBudget =
          buyer.budget_min && buyer.budget_max
            ? (buyer.budget_min + buyer.budget_max) / 2
            : buyer.budget_max || 0;
        const estimatedSpread = buyerMidBudget - offerEstimate;

        if (estimatedSpread > 10000) spreadScore = 30;
        else if (estimatedSpread > 5000) spreadScore = 20;
        else if (estimatedSpread > 2000) spreadScore = 10;

        const spreadWeight = spreadScore * 0.3;
        const matchScore = Math.round(
          motivationWeight + buyerActivityWeight + spreadWeight
        );

        // Determine title
        const propAddr =
          seller.address_full ||
          [seller.city, seller.county, seller.state].filter(Boolean).join(", ") ||
          "Unknown";
        const title = `${seller.deal_type === "home" ? "🏠" : "🏞️"} ${propAddr}`;

        // Check if deal already exists for this seller+buyer pair
        const { data: existing } = await supabase
          .from("lw_deals")
          .select("id, match_score")
          .eq("seller_id", seller.id)
          .eq("buyer_id", buyer.id)
          .maybeSingle();

        if (existing) {
          // Update score if improved
          if (matchScore > (existing.match_score || 0)) {
            await supabase
              .from("lw_deals")
              .update({ match_score: matchScore })
              .eq("id", existing.id);
          }
        } else {
          await supabase.from("lw_deals").insert({
            seller_id: seller.id,
            buyer_id: buyer.id,
            title,
            deal_type: seller.deal_type || "land",
            match_score: matchScore,
            our_offer: offerEstimate > 0 ? offerEstimate : null,
            buyer_price: buyerMidBudget > 0 ? buyerMidBudget : null,
            seller_ask: seller.asking_price || null,
            stage: "matched",
            priority:
              matchScore >= 70 ? "high" : matchScore >= 40 ? "medium" : "low",
          });
          totalMatches++;
        }
      }
    }

    // 2. Refresh demand signals
    const demandQuery = `
      SELECT 
        unnest(target_counties) as county,
        unnest(target_states) as state,
        deal_type,
        count(*) as buyer_count,
        avg(budget_max) as avg_budget,
        avg(acreage_min) as avg_acreage_min,
        avg(acreage_max) as avg_acreage_max
      FROM lw_buyers
      WHERE status = 'active'
        AND array_length(target_counties, 1) > 0
      GROUP BY unnest(target_counties), unnest(target_states), deal_type
      ORDER BY count(*) DESC
    `;

    // We can't run raw SQL, so aggregate manually
    const demandMap: Record<
      string,
      {
        county: string;
        state: string;
        deal_type: string;
        count: number;
        budgets: number[];
        acreageMins: number[];
        acreageMaxs: number[];
      }
    > = {};

    for (const buyer of buyers) {
      const counties = buyer.target_counties || [];
      const states = buyer.target_states || [];
      const dt = buyer.deal_type || "land";

      for (let i = 0; i < counties.length; i++) {
        const county = counties[i];
        const state = states[i] || states[0] || "";
        const key = `${county}|${state}|${dt}`;

        if (!demandMap[key]) {
          demandMap[key] = {
            county,
            state,
            deal_type: dt,
            count: 0,
            budgets: [],
            acreageMins: [],
            acreageMaxs: [],
          };
        }
        demandMap[key].count++;
        if (buyer.budget_max) demandMap[key].budgets.push(buyer.budget_max);
        if (buyer.acreage_min) demandMap[key].acreageMins.push(buyer.acreage_min);
        if (buyer.acreage_max) demandMap[key].acreageMaxs.push(buyer.acreage_max);
      }
    }

    // Sort by count desc and assign ranks
    const demandEntries = Object.values(demandMap).sort(
      (a, b) => b.count - a.count
    );

    for (let i = 0; i < demandEntries.length; i++) {
      const d = demandEntries[i];
      const avg = (arr: number[]) =>
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

      const { data: existing } = await supabase
        .from("lw_demand_signals")
        .select("id")
        .eq("county", d.county)
        .eq("state", d.state)
        .eq("deal_type", d.deal_type)
        .maybeSingle();

      const row = {
        county: d.county,
        state: d.state,
        deal_type: d.deal_type,
        buyer_count: d.count,
        avg_budget: avg(d.budgets),
        avg_acreage_min: avg(d.acreageMins),
        avg_acreage_max: avg(d.acreageMaxs),
        demand_rank: i + 1,
        last_refreshed_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from("lw_demand_signals")
          .update(row)
          .eq("id", existing.id);
      } else {
        await supabase.from("lw_demand_signals").insert(row);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        new_matches: totalMatches,
        demand_signals_refreshed: demandEntries.length,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("land-match-engine error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
