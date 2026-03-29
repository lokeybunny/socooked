import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Distress Score Recalculation Engine
 * 
 * Recalculates distress_score (motivation_score), buyer_match_score,
 * opportunity_score, distress_grade, and lead_temperature for all
 * lw_sellers records (or a specific batch).
 * 
 * Uses configurable weights from lw_buyer_config (key: 'distress_weights').
 */

const DEFAULT_WEIGHTS: Record<string, number> = {
  absentee_owner: 10, vacant_flag: 15, tax_delinquent: 20,
  high_equity: 15, free_and_clear: 10, pre_foreclosure: 25,
  auction_status: 20, out_of_state_owner: 8, years_owned_10plus: 10,
  lien_count_2plus: 10, probate_flag: 15, vacant_land: 10,
  corporate_owned: 5, trust_owned: 5, inherited_flag: 12,
  tax_lien: 8, county_buyer_match: 12,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const batchId = body.batch_id || null;

    // Load configurable weights
    const { data: weightConfig } = await supabase
      .from("lw_buyer_config")
      .select("value")
      .eq("key", "distress_weights")
      .maybeSingle();
    const weights = { ...DEFAULT_WEIGHTS, ...(weightConfig?.value || {}) };

    // Load buyer demand counties
    const { data: buyers } = await supabase
      .from("lw_buyers")
      .select("target_counties")
      .eq("status", "active");
    const demandCounties = new Set<string>();
    (buyers || []).forEach((b: any) =>
      (b.target_counties || []).forEach((c: string) => demandCounties.add(c.toLowerCase()))
    );

    // Load sellers
    let query = supabase.from("lw_sellers").select("*");
    if (batchId) query = query.eq("import_batch_id", batchId);
    const { data: sellers } = await query.limit(1000);

    let updated = 0;
    for (const s of sellers || []) {
      let score = 0;
      if (s.is_absentee_owner) score += weights.absentee_owner;
      if (s.is_vacant) score += weights.vacant_flag;
      if (s.is_tax_delinquent) score += weights.tax_delinquent;
      if ((s.equity_percent || 0) >= 40) score += weights.high_equity;
      if (s.free_and_clear) score += weights.free_and_clear;
      if (s.is_pre_foreclosure) score += weights.pre_foreclosure;
      if (s.auction_status === "active" || s.auction_status === "scheduled") score += weights.auction_status;
      if (s.is_out_of_state) score += weights.out_of_state_owner;
      if ((s.years_owned || 0) >= 10) score += weights.years_owned_10plus;
      if ((s.lien_count || 0) >= 2) score += weights.lien_count_2plus;
      if (s.probate_flag) score += weights.probate_flag;
      if (s.property_type === "VAC" || s.deal_type === "land") score += weights.vacant_land;
      if (s.is_corporate_owned) score += weights.corporate_owned;
      if (s.trust_owned) score += weights.trust_owned;
      if (s.inherited_flag) score += weights.inherited_flag;
      if (s.has_tax_lien) score += weights.tax_lien;
      if (demandCounties.has((s.county || "").toLowerCase())) score += weights.county_buyer_match;

      const cappedScore = Math.min(100, score);
      const grade = cappedScore >= 70 ? "A" : cappedScore >= 45 ? "B" : cappedScore >= 20 ? "C" : "D";
      const temp = cappedScore >= 70 ? "Hot" : cappedScore >= 45 ? "Warm" : "Cold";

      await supabase.from("lw_sellers").update({
        motivation_score: cappedScore,
        distress_grade: grade,
        lead_temperature: temp,
        opportunity_score: Math.round(cappedScore * 0.5 + (s.buyer_match_score || 0) * 0.5),
      }).eq("id", s.id);
      updated++;
    }

    return new Response(JSON.stringify({ ok: true, updated }), { headers: corsHeaders });
  } catch (err) {
    console.error("distress-score-recalc error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
