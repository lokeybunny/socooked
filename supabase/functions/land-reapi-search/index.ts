import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REAPI_BASE = "https://api.realestateapi.com/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const REAPI_KEY = Deno.env.get("REAPI_API_KEY");
    if (!REAPI_KEY)
      return new Response(
        JSON.stringify({ error: "REAPI_API_KEY not configured" }),
        { status: 500, headers: corsHeaders }
      );

    // Budget guardian — check monthly spend
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: runs } = await supabase
      .from("lw_ingestion_runs")
      .select("credits_used")
      .gte("created_at", monthStart.toISOString());

    const monthlySpend = (runs || []).reduce(
      (sum: number, r: any) => sum + (r.credits_used || 0),
      0
    );
    const BUDGET_LIMIT = 500; // $500/month ceiling
    if (monthlySpend >= BUDGET_LIMIT) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: `Monthly budget reached ($${monthlySpend}/$${BUDGET_LIMIT})`,
        }),
        { headers: corsHeaders }
      );
    }

    // Get body params or use defaults
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const searchCounty = body.county;
    const searchState = body.state;
    const dealType = body.deal_type || "land";
    const propertyType = dealType === "land" ? "VACANT" : "SFR";
    const pageSize = Math.min(body.size || 50, 100);

    // If no county specified, pull from top demand signals
    let counties: { county: string; state: string }[] = [];

    if (searchCounty && searchState) {
      counties = [{ county: searchCounty, state: searchState }];
    } else {
      const { data: demand } = await supabase
        .from("lw_demand_signals")
        .select("county, state")
        .eq("deal_type", dealType)
        .order("demand_rank", { ascending: true })
        .limit(5);
      counties = demand || [];
    }

    if (counties.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No demand signals found. Add buyers first to generate demand.",
          records: 0,
        }),
        { headers: corsHeaders }
      );
    }

    let totalFetched = 0;
    let totalNew = 0;
    let totalCredits = 0;

    for (const { county, state } of counties) {
      // Build REAPI search body per their v2 API spec
      const searchBody: any = {
        county,
        state,
        property_type: propertyType,
        size: pageSize,
        resultIndex: 0,
      };

      // Add motivation filters
      if (body.absentee_owner !== false) searchBody.absentee_owner = true;
      if (body.tax_delinquent_year)
        searchBody.tax_delinquent_year = body.tax_delinquent_year;
      if (body.vacant !== false) searchBody.vacant = true;

      const resp = await fetch(`${REAPI_BASE}/PropertySearch`, {
        method: "POST",
        headers: {
          "x-api-key": REAPI_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchBody),
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        console.error(
          `REAPI search failed for ${county}, ${state}: ${resp.status} — ${errBody}`
        );
        continue;
      }

      const data = await resp.json();
      const properties = data.data || data.results || [];
      totalFetched += properties.length;

      // Estimate credits (REAPI charges per record)
      const creditsUsed = properties.length * 0.1; // ~$0.10/record estimate
      totalCredits += creditsUsed;

      // Process each property
      for (const prop of properties) {
        const owner = prop.owner || {};
        const address = prop.address || {};
        const tax = prop.tax || {};
        const lot = prop.lot || {};
        const sale = prop.lastSale || prop.sale || {};

        // Calculate motivation score
        let motivationScore = 0;
        const isTaxDelinquent =
          prop.isTaxDelinquent || tax.taxDelinquent || false;
        const isAbsentee =
          prop.isAbsenteeOwner || prop.absenteeOwner || false;
        const isOutOfState =
          prop.isOutOfState || prop.outOfStateOwner || false;
        const isVacant = prop.isVacant || prop.vacant || false;
        const isPreForeclosure =
          prop.isPreForeclosure || prop.preForeclosure || false;
        const hasTaxLien = prop.hasTaxLien || tax.taxLien || false;
        const isCorporate =
          prop.isCorporateOwned || owner.corporateOwner || false;

        // Years owned calculation
        const saleDate = sale.saleDate || sale.lastSaleDate;
        let yearsOwned: number | null = null;
        if (saleDate) {
          yearsOwned = Math.floor(
            (Date.now() - new Date(saleDate).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          );
        }

        if (isTaxDelinquent) motivationScore += 30;
        if (isAbsentee) motivationScore += 20;
        if (isOutOfState) motivationScore += 15;
        if (isVacant) motivationScore += 10;
        if (yearsOwned && yearsOwned > 10) motivationScore += 10;
        if (isPreForeclosure) motivationScore += 10;
        if (hasTaxLien) motivationScore += 5;

        const apn =
          prop.apn || prop.parcelNumber || address.apn || null;
        const fips =
          prop.fips || prop.countyFips || address.fips || null;

        const sellerRow = {
          owner_name:
            owner.fullName ||
            owner.name ||
            [owner.firstName, owner.lastName].filter(Boolean).join(" ") ||
            null,
          owner_mailing_address: owner.mailingAddress
            ? [
                owner.mailingAddress.street,
                owner.mailingAddress.city,
                owner.mailingAddress.state,
                owner.mailingAddress.zip,
              ]
                .filter(Boolean)
                .join(", ")
            : null,
          deal_type: dealType,
          reapi_property_id: prop.id || prop.propertyId || null,
          apn,
          fips,
          address_full:
            address.full ||
            address.address ||
            [address.street, address.city, address.state, address.zip]
              .filter(Boolean)
              .join(", ") ||
            null,
          city: address.city || null,
          state: address.state || state,
          zip: address.zip || address.zipCode || null,
          county: address.county || county,
          acreage:
            lot.acres || lot.acreage || (lot.sqft ? lot.sqft / 43560 : null),
          lot_sqft: lot.sqft || lot.lotSqft || null,
          zoning: prop.zoning || null,
          property_type: prop.propertyType || (dealType === "land" ? "VAC" : "SFR"),
          is_absentee_owner: isAbsentee,
          is_out_of_state: isOutOfState,
          is_tax_delinquent: isTaxDelinquent,
          tax_delinquent_year:
            tax.taxDelinquentYear || prop.taxDelinquentYear || null,
          has_tax_lien: hasTaxLien,
          is_vacant: isVacant,
          is_pre_foreclosure: isPreForeclosure,
          is_corporate_owned: isCorporate,
          years_owned: yearsOwned,
          assessed_value: tax.assessedValue || prop.assessedValue || null,
          market_value: prop.estimatedValue || prop.avm || tax.marketValue || null,
          motivation_score: motivationScore,
          source: "reapi",
          status: "new",
          meta: prop, // stash raw response
        };

        // UPSERT — deduplicate on apn+fips if available
        if (apn && fips) {
          const { data: existing } = await supabase
            .from("lw_sellers")
            .select("id")
            .eq("apn", apn)
            .eq("fips", fips)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("lw_sellers")
              .update({
                ...sellerRow,
                motivation_score: motivationScore,
              })
              .eq("id", existing.id);
          } else {
            await supabase.from("lw_sellers").insert(sellerRow);
            totalNew++;
          }
        } else {
          await supabase.from("lw_sellers").insert(sellerRow);
          totalNew++;
        }
      }
    }

    // Log ingestion run
    await supabase.from("lw_ingestion_runs").insert({
      run_type: "reapi_property_search",
      source: "reapi",
      records_fetched: totalFetched,
      records_new: totalNew,
      credits_used: totalCredits,
      params: { counties, deal_type: dealType, size: pageSize },
      status: "completed",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        counties_searched: counties.length,
        records_fetched: totalFetched,
        records_new: totalNew,
        credits_used: totalCredits,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("land-reapi-search error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
