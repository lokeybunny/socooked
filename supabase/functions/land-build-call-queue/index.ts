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

    const today = new Date().toISOString().split("T")[0];
    const maxCalls = 25;

    // Clear today's queue
    await supabase.from("lw_call_queue").delete().eq("queue_date", today);

    // 7-day cooldown — don't re-call sellers contacted recently
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get deals with high match scores where seller has a phone
    const { data: deals } = await supabase
      .from("lw_deals")
      .select("*, lw_sellers(*)")
      .in("stage", ["matched", "contacted_seller", "offer_sent"])
      .order("match_score", { ascending: false })
      .limit(200);

    if (!deals || deals.length === 0) {
      return new Response(
        JSON.stringify({ message: "No deals to queue", queued: 0 }),
        { headers: corsHeaders }
      );
    }

    const queueRows: any[] = [];
    const seenSellerIds = new Set<string>();

    for (const deal of deals) {
      if (queueRows.length >= maxCalls) break;

      const seller = deal.lw_sellers;
      if (!seller) continue;
      if (!seller.owner_phone) continue; // must have phone
      if (seenSellerIds.has(seller.id)) continue; // one call per seller
      seenSellerIds.add(seller.id);

      // Skip if contacted in last 7 days
      if (
        seller.contacted_at &&
        new Date(seller.contacted_at) > sevenDaysAgo
      ) {
        continue;
      }

      // Build human-readable reason
      const reasons: string[] = [];
      if (seller.is_tax_delinquent)
        reasons.push(`Tax delinquent${seller.tax_delinquent_year ? ` (${seller.tax_delinquent_year})` : ""}`);
      if (seller.is_absentee_owner) reasons.push("Absentee owner");
      if (seller.is_out_of_state) reasons.push("Out-of-state");
      if (seller.is_vacant) reasons.push("Vacant");
      if (seller.is_pre_foreclosure) reasons.push("Pre-foreclosure");
      if (seller.years_owned && seller.years_owned > 10)
        reasons.push(`Owned ${seller.years_owned}yr`);

      // Count active buyers in this county
      const { count: buyerCount } = await supabase
        .from("lw_buyers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .contains("target_counties", [seller.county]);

      if (buyerCount && buyerCount > 0)
        reasons.push(`${buyerCount} buyer${buyerCount > 1 ? "s" : ""} want ${seller.county} County`);

      const reason =
        reasons.length > 0 ? reasons.join(" · ") : "Matched to active buyer demand";

      queueRows.push({
        queue_date: today,
        seller_id: seller.id,
        deal_id: deal.id,
        call_priority: queueRows.length + 1,
        reason,
        owner_name: seller.owner_name,
        owner_phone: seller.owner_phone,
        property_address: seller.address_full,
        motivation_score: seller.motivation_score,
        match_score: deal.match_score,
        status: "pending",
      });
    }

    if (queueRows.length > 0) {
      await supabase.from("lw_call_queue").insert(queueRows);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        queued: queueRows.length,
        date: today,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("land-build-call-queue error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
