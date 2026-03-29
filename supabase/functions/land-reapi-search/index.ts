import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REAPI_BASE = "https://api.realestateapi.com/v2";

/** Normalize address for dedup: lowercase, strip punctuation, collapse whitespace */
function normalizeAddress(addr: string | null): string | null {
  if (!addr) return null;
  return addr.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim() || null;
}

/** Calculate distress score server-side (mirrors client scoring) */
function calcDistressScore(prop: any, flags: any): { score: number; grade: string; temperature: string; tags: string[] } {
  let raw = 0;
  const tags: string[] = ['RealEstateAPI Import'];

  if (flags.isTaxDelinquent) { raw += 20; tags.push('Tax Delinquent'); }
  if (flags.isAbsentee) { raw += 10; }
  if (flags.isOutOfState) { raw += 8; }
  if (flags.isVacant) { raw += 15; }
  if (flags.isPreForeclosure) { raw += 25; tags.push('Pre-Foreclosure'); }
  if (flags.hasTaxLien) { raw += 8; }
  if (flags.isCorporate) { raw += 5; }
  if (flags.yearsOwned && flags.yearsOwned >= 10) { raw += 10; }
  if (flags.equityPercent && flags.equityPercent >= 40) { raw += 15; }
  if (flags.freeAndClear) { raw += 10; }
  if (flags.isVacantLand) { raw += 10; }

  const score = Math.min(100, raw);
  const grade = score >= 70 ? 'A' : score >= 45 ? 'B' : score >= 20 ? 'C' : 'D';
  const temperature = score >= 70 ? 'Hot' : score >= 45 ? 'Warm' : 'Cold';

  if (score >= 70) tags.push('Hot Distress Lead');
  if (score >= 45) tags.push('Ready for Skip Trace');

  return { score, grade, temperature, tags };
}

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

    // Budget guardian
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
    const BUDGET_LIMIT = 500;
    if (monthlySpend >= BUDGET_LIMIT) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: `Monthly budget reached ($${monthlySpend}/$${BUDGET_LIMIT})`,
        }),
        { headers: corsHeaders }
      );
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const searchCounty = body.county;
    const searchState = body.state;
    const dealType = body.deal_type || "land";
    const propertyType = dealType === "land" ? "LAND" : "SFR";
    const pageSize = Math.min(body.size || 50, 100);

    // Distress search filters from client
    const distressFilters = body.distress_filters || {};

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

    // Load buyer counties for match tagging
    const { data: activeBuyers } = await supabase
      .from("lw_buyers")
      .select("target_counties")
      .eq("status", "active")
      .limit(200);
    const buyerCountySet = new Set<string>();
    (activeBuyers || []).forEach((b: any) => {
      (b.target_counties || []).forEach((c: string) => buyerCountySet.add(c.toLowerCase()));
    });

    let totalFetched = 0;
    let totalNew = 0;
    let totalCredits = 0;

    for (const { county, state } of counties) {
      const searchBody: any = {
        county,
        state,
        property_type: distressFilters.property_type || propertyType,
        size: pageSize,
        resultIndex: 0,
      };

      // Apply distress filters to REAPI search body
      if (distressFilters.absentee_owner !== undefined) searchBody.absentee_owner = distressFilters.absentee_owner;
      else if (body.absentee_owner !== false) searchBody.absentee_owner = true;

      if (distressFilters.vacant !== undefined) searchBody.vacant = distressFilters.vacant;
      else if (body.vacant !== false) searchBody.vacant = true;

      if (distressFilters.tax_delinquent_year) searchBody.tax_delinquent_year = distressFilters.tax_delinquent_year;
      else if (body.tax_delinquent_year) searchBody.tax_delinquent_year = body.tax_delinquent_year;

      if (distressFilters.pre_foreclosure) searchBody.pre_foreclosure = true;
      if (distressFilters.foreclosure) searchBody.foreclosure = true;
      if (distressFilters.auction) searchBody.auction = true;
      if (distressFilters.liens) searchBody.liens = true;
      if (distressFilters.free_and_clear) searchBody.free_and_clear = true;
      if (distressFilters.high_equity_percent) searchBody.equity_percent_min = distressFilters.high_equity_percent;
      if (distressFilters.years_owned_min) searchBody.years_owned_min = distressFilters.years_owned_min;
      if (distressFilters.out_of_state) searchBody.out_of_state_owner = true;
      if (distressFilters.vacant_land) {
        searchBody.property_type = "LAND";
        searchBody.vacant = true;
      }
      if (distressFilters.city) searchBody.city = distressFilters.city;
      if (distressFilters.zip) searchBody.zip = distressFilters.zip;
      if (distressFilters.acreage_min) searchBody.lot_size_min_acres = distressFilters.acreage_min;
      if (distressFilters.acreage_max) searchBody.lot_size_max_acres = distressFilters.acreage_max;
      if (distressFilters.value_min) searchBody.assessed_value_min = distressFilters.value_min;
      if (distressFilters.value_max) searchBody.assessed_value_max = distressFilters.value_max;

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
        console.error(`REAPI search failed for ${county}, ${state}: ${resp.status} — ${errBody}`);
        continue;
      }

      const data = await resp.json();
      const properties = data.data || data.results || [];
      totalFetched += properties.length;

      const creditsUsed = properties.length * 0.1;
      totalCredits += creditsUsed;

      for (const prop of properties) {
        const owner = prop.owner || {};
        const address = prop.address || {};
        const tax = prop.tax || {};
        const lot = prop.lot || {};
        const sale = prop.lastSale || prop.sale || {};
        const building = prop.building || prop.structure || {};
        const summary = prop.summary || {};

        const isTaxDelinquent = prop.isTaxDelinquent || tax.taxDelinquent || false;
        const isAbsentee = prop.isAbsenteeOwner || prop.absenteeOwner || false;
        const isOutOfState = prop.isOutOfState || prop.outOfStateOwner || false;
        const isVacant = prop.isVacant || prop.vacant || false;
        const isPreForeclosure = prop.isPreForeclosure || prop.preForeclosure || false;
        const hasTaxLien = prop.hasTaxLien || tax.taxLien || false;
        const isCorporate = prop.isCorporateOwned || owner.corporateOwner || false;
        const freeAndClear = prop.freeAndClear || prop.isFreeAndClear || false;
        const equityPercent = prop.equityPercent || prop.equity_percent || null;

        const saleDate = sale.saleDate || sale.lastSaleDate;
        let yearsOwned: number | null = null;
        if (saleDate) {
          yearsOwned = Math.floor(
            (Date.now() - new Date(saleDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
          );
        }

        const apn = prop.apn || prop.parcelNumber || address.apn || null;
        const fips = prop.fips || prop.countyFips || address.fips || null;
        const bedrooms = building.bedrooms || prop.bedrooms || summary.bedrooms || null;
        const bathrooms = building.bathrooms || building.bathsFull || prop.bathrooms || summary.bathrooms || null;
        const livingSqft = building.livingSquareFeet || building.squareFeet || prop.livingSquareFeet || prop.squareFeet || summary.livingSquareFeet || null;

        const addressFull = address.full || address.address ||
          [address.street, address.city, address.state, address.zip].filter(Boolean).join(", ") || null;

        const normalizedAddr = normalizeAddress(addressFull);
        const propCounty = (address.county || county || '').toLowerCase();
        const isVacantLand = (prop.propertyType === 'LAND' || prop.propertyType === 'VAC' || dealType === 'land');

        // Calculate distress score and tags
        const distressResult = calcDistressScore(prop, {
          isTaxDelinquent, isAbsentee, isOutOfState, isVacant, isPreForeclosure,
          hasTaxLien, isCorporate, yearsOwned, equityPercent, freeAndClear, isVacantLand,
        });

        // Check buyer county match
        if (buyerCountySet.has(propCounty)) {
          distressResult.tags.push('Buyer Matched');
        }

        const sourceRecordId = prop.id || prop.propertyId || null;

        const sellerRow = {
          owner_name: owner.fullName || owner.name ||
            [owner.firstName, owner.lastName].filter(Boolean).join(" ") || null,
          owner_mailing_address: owner.mailingAddress
            ? [owner.mailingAddress.street, owner.mailingAddress.city, owner.mailingAddress.state, owner.mailingAddress.zip]
                .filter(Boolean).join(", ")
            : null,
          deal_type: dealType,
          reapi_property_id: sourceRecordId,
          source_record_id: String(sourceRecordId || ''),
          apn,
          fips,
          address_full: addressFull,
          city: address.city || null,
          state: address.state || state,
          zip: address.zip || address.zipCode || null,
          county: address.county || county,
          acreage: lot.acres || lot.acreage || (lot.sqft ? lot.sqft / 43560 : null),
          lot_sqft: lot.sqft || lot.lotSqft || null,
          zoning: prop.zoning || null,
          property_type: prop.propertyType || (dealType === "land" ? "VAC" : "SFR"),
          is_absentee_owner: isAbsentee,
          is_out_of_state: isOutOfState,
          is_tax_delinquent: isTaxDelinquent,
          tax_delinquent_year: tax.taxDelinquentYear || prop.taxDelinquentYear || null,
          has_tax_lien: hasTaxLien,
          is_vacant: isVacant,
          is_pre_foreclosure: isPreForeclosure,
          is_corporate_owned: isCorporate,
          free_and_clear: freeAndClear,
          equity_percent: equityPercent,
          years_owned: yearsOwned,
          assessed_value: tax.assessedValue || prop.assessedValue || null,
          market_value: prop.estimatedValue || prop.avm || tax.marketValue || null,
          motivation_score: distressResult.score,
          distress_grade: distressResult.grade,
          lead_temperature: distressResult.temperature,
          tags: distressResult.tags,
          bedrooms: bedrooms ? Number(bedrooms) : null,
          bathrooms: bathrooms ? Number(bathrooms) : null,
          living_sqft: livingSqft ? Number(livingSqft) : null,
          source: "reapi",
          status: "new",
          meta: prop,
        };

        // Enhanced dedup: APN+FIPS, then normalized address, then source_record_id
        let existingId: string | null = null;

        if (apn && fips) {
          const { data: existing } = await supabase
            .from("lw_sellers")
            .select("id")
            .eq("apn", apn)
            .eq("fips", fips)
            .maybeSingle();
          if (existing) existingId = existing.id;
        }

        if (!existingId && normalizedAddr) {
          const { data: existing } = await supabase
            .from("lw_sellers")
            .select("id, address_full")
            .eq("state", address.state || state)
            .limit(50);
          if (existing) {
            const match = existing.find((e: any) => normalizeAddress(e.address_full) === normalizedAddr);
            if (match) existingId = match.id;
          }
        }

        if (!existingId && sourceRecordId) {
          const { data: existing } = await supabase
            .from("lw_sellers")
            .select("id")
            .eq("source_record_id", String(sourceRecordId))
            .maybeSingle();
          if (existing) existingId = existing.id;
        }

        if (existingId) {
          await supabase.from("lw_sellers").update(sellerRow).eq("id", existingId);
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
      params: { counties, deal_type: dealType, size: pageSize, distress_filters: distressFilters },
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
