import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Retry helper */
async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.log(`${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`${label} exhausted all retries`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      searchTerms = [],
      location = "",
      maxItems = 30,
      sortBy = "rating",
    } = body;

    const apifyToken = Deno.env.get("APIFY_TOKEN");
    if (!apifyToken) throw new Error("APIFY_TOKEN not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Build Apify input for agents~yelp-business
    const input: Record<string, any> = {
      maxItems: Math.min(maxItems, 100),
    };
    if (searchTerms.length) input.searchTerms = searchTerms;
    if (location) input.location = location;
    if (sortBy) input.sortBy = sortBy;

    console.log(`Yelp Finder: starting with input`, JSON.stringify(input));

    const actorId = "agents~yelp-business";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const results = await withRetry(async () => {
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Apify request failed (${res.status}): ${err.slice(0, 300)}`);
      }
      return res.json();
    }, "YelpFinder");

    if (!Array.isArray(results) || results.length === 0) {
      return new Response(JSON.stringify({ businesses: [], message: "No businesses found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Yelp Finder: got ${results.length} results from Apify`);

    // Filter to 3 stars and below only
    const lowRated = results.filter((b: any) => b.rating !== undefined && b.rating <= 3);
    console.log(`Yelp Finder: ${lowRated.length} businesses with 3 stars or below`);

    // Auto-create customers from yelp businesses
    const created: any[] = [];
    for (const biz of lowRated) {
      const fullName = biz.title || 'Unknown Business';
      if (!fullName || fullName === 'Unknown Business') continue;

      // Deduplicate by phone or website
      if (biz.phoneNumber) {
        const { data: existing } = await sb
          .from("customers")
          .select("id")
          .eq("phone", biz.phoneNumber)
          .limit(1);
        if (existing && existing.length > 0) {
          console.log(`Skipping duplicate (phone): ${biz.phoneNumber}`);
          continue;
        }
      }

      const addressStr = biz.address?.formatted || [
        biz.address?.addressLine1,
        biz.address?.city,
        biz.address?.regionCode,
        biz.address?.postalCode,
      ].filter(Boolean).join(", ") || null;

      const customerPayload = {
        full_name: fullName,
        email: null,
        phone: biz.phoneNumber || null,
        company: fullName,
        status: "lead",
        source: "yelp-finder",
        category: "potential",
        address: addressStr,
        notes: [
          `Rating: ${biz.rating}/5 (${biz.reviewCount} reviews)`,
          biz.categories?.length && `Categories: ${biz.categories.join(", ")}`,
          biz.priceRange && `Price Range: ${biz.priceRange}`,
          biz.website && `Website: ${biz.website}`,
        ].filter(Boolean).join("\n") || null,
        meta: {
          yelp_url: biz.url || null,
          yelp_rating: biz.rating,
          yelp_review_count: biz.reviewCount,
          yelp_categories: biz.categories || [],
          yelp_price_range: biz.priceRange || null,
          yelp_photo: biz.primaryPhoto || null,
          website: biz.website || null,
          phone: biz.phoneNumber || null,
          address: biz.address || null,
          coordinates: biz.coordinates || null,
          operation_hours: biz.operationHours || null,
          is_claimed: biz.isClaimed || false,
          is_closed: biz.isBusinessClosed || false,
          source_platform: "yelp-finder",
        },
      };

      const { data: inserted, error } = await sb
        .from("customers")
        .insert(customerPayload)
        .select("id, full_name, email, company")
        .single();

      if (error) {
        console.log(`Failed to create customer ${fullName}: ${error.message}`);
      } else {
        created.push({ ...inserted, ...biz });

        // Deduplicate research finding
        if (biz.url) {
          const { data: existingFinding } = await sb
            .from("research_findings")
            .select("id")
            .eq("finding_type", "lead")
            .eq("source_url", biz.url)
            .limit(1);
          if (existingFinding && existingFinding.length > 0) {
            console.log(`Skipping duplicate research finding for: ${biz.url}`);
            continue;
          }
        }

        // Create a research finding
        await sb.from("research_findings").insert({
          title: fullName,
          summary: [
            `${biz.rating}/5 ⭐ (${biz.reviewCount} reviews)`,
            biz.categories?.join(", "),
            addressStr,
          ].filter(Boolean).join(" · "),
          source_url: biz.url || biz.website || null,
          finding_type: "lead",
          category: "yelp",
          status: "new",
          created_by: "yelp-finder",
          customer_id: inserted.id,
          raw_data: {
            type: "yelp_business",
            name: fullName,
            symbol: biz.categories?.[0]?.substring(0, 6)?.toUpperCase() || "YELP",
            deploy_window: "OUTREACH",
            rating: biz.rating,
            review_count: biz.reviewCount,
            categories: biz.categories || [],
            price_range: biz.priceRange || null,
            phone: biz.phoneNumber || null,
            website: biz.website || null,
            yelp_url: biz.url || null,
            photo: biz.primaryPhoto || null,
            address: addressStr,
            coordinates: biz.coordinates || null,
            operation_hours: biz.operationHours || null,
            is_claimed: biz.isClaimed || false,
            is_closed: biz.isBusinessClosed || false,
            amenities: biz.amenities || [],
            source_platform: "yelp-finder",
          },
          tags: [...(biz.categories || []).slice(0, 3), "yelp-finder", `${biz.rating}★`].filter(Boolean),
        });
      }
    }

    console.log(`Yelp Finder: created ${created.length} new customers from ${lowRated.length} low-rated businesses`);

    return new Response(
      JSON.stringify({
        businesses: lowRated,
        all_results: results.length,
        low_rated_count: lowRated.length,
        created_count: created.length,
        created_customers: created,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Yelp Finder error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
