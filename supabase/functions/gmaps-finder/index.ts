import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    } = body;

    const apifyToken = Deno.env.get("APIFY_TOKEN");
    if (!apifyToken) throw new Error("APIFY_TOKEN not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Build Apify input for compass~crawler-google-places
    const input: Record<string, any> = {
      maxCrawledPlacesPerSearch: Math.min(maxItems, 100),
      language: "en",
      deeperCityScrape: false,
    };

    // Search terms go into searchStringsArray
    if (searchTerms.length) {
      if (location) {
        // Combine search terms with location for better results
        input.searchStringsArray = searchTerms.map((t: string) => `${t} in ${location}`);
      } else {
        input.searchStringsArray = searchTerms;
      }
    }

    // If no search terms but location, use location as a geolocation hint
    if (!searchTerms.length && location) {
      input.searchStringsArray = [location];
    }

    console.log(`GMaps Finder: starting with input`, JSON.stringify(input));

    const actorId = "compass~crawler-google-places";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const results = await withRetry(async () => {
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Apify request failed (${res.status}): ${err.slice(0, 300)}`);
      }
      return res.json();
    }, "GMapsFinder");

    if (!Array.isArray(results) || results.length === 0) {
      return new Response(JSON.stringify({ businesses: [], message: "No businesses found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`GMaps Finder: got ${results.length} results from Apify`);

    // Use all results (no star rating filter)
    const lowRated = results.filter((b: any) => b.totalScore !== undefined && b.totalScore !== null && b.totalScore > 0);
    console.log(`GMaps Finder: ${lowRated.length} businesses with ratings`);

    // Auto-create customers from Google Maps businesses
    const created: any[] = [];
    for (const biz of lowRated) {
      const fullName = biz.title || "Unknown Business";
      if (!fullName || fullName === "Unknown Business") continue;

      // Deduplicate by phone
      const phone = biz.phone || biz.phoneUnformatted || null;
      if (phone) {
        const { data: existing } = await sb
          .from("customers")
          .select("id")
          .eq("phone", phone)
          .limit(1);
        if (existing && existing.length > 0) {
          console.log(`Skipping duplicate (phone): ${phone}`);
          continue;
        }
      }

      // Deduplicate by website
      if (biz.website) {
        const { data: existing } = await sb
          .from("customers")
          .select("id")
          .eq("meta->>website", biz.website)
          .limit(1);
        if (existing && existing.length > 0) {
          console.log(`Skipping duplicate (website): ${biz.website}`);
          continue;
        }
      }

      const addressStr = biz.address || [biz.street, biz.city, biz.state, biz.postalCode].filter(Boolean).join(", ") || null;

      const customerPayload = {
        full_name: fullName,
        email: null,
        phone: phone,
        company: fullName,
        status: "lead",
        source: "gmaps-finder",
        category: "potential",
        address: addressStr,
        notes: [
          `Rating: ${biz.totalScore}/5 (${biz.reviewsCount || 0} reviews)`,
          biz.categoryName && `Category: ${biz.categoryName}`,
          biz.price && `Price: ${biz.price}`,
          biz.website && `Website: ${biz.website}`,
        ].filter(Boolean).join("\n") || null,
        meta: {
          gmaps_url: biz.url || null,
          gmaps_rating: biz.totalScore,
          gmaps_review_count: biz.reviewsCount || 0,
          gmaps_categories: biz.categories || [],
          gmaps_price: biz.price || null,
          gmaps_photo: biz.imageUrl || null,
          website: biz.website || null,
          phone: phone,
          address: addressStr,
          coordinates: biz.location || null,
          opening_hours: biz.openingHours || null,
          permanently_closed: biz.permanentlyClosed || false,
          temporarily_closed: biz.temporarilyClosed || false,
          place_id: biz.placeId || null,
          neighborhood: biz.neighborhood || null,
          source_platform: "gmaps-finder",
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
        const sourceUrl = biz.url || biz.website || null;
        if (sourceUrl) {
          const { data: existingFinding } = await sb
            .from("research_findings")
            .select("id")
            .eq("finding_type", "lead")
            .eq("source_url", sourceUrl)
            .limit(1);
          if (existingFinding && existingFinding.length > 0) {
            console.log(`Skipping duplicate research finding for: ${sourceUrl}`);
            continue;
          }
        }

        // Create a research finding
        await sb.from("research_findings").insert({
          title: fullName,
          summary: [
            `${biz.totalScore}/5 ⭐ (${biz.reviewsCount || 0} reviews)`,
            biz.categoryName,
            addressStr,
          ].filter(Boolean).join(" · "),
          source_url: sourceUrl,
          finding_type: "lead",
          category: "google-maps",
          status: "new",
          created_by: "gmaps-finder",
          customer_id: inserted.id,
          raw_data: {
            type: "gmaps_business",
            name: fullName,
            symbol: biz.categoryName?.substring(0, 6)?.toUpperCase() || "GMAPS",
            deploy_window: "OUTREACH",
            rating: biz.totalScore,
            review_count: biz.reviewsCount || 0,
            categories: biz.categories || [],
            category_name: biz.categoryName || null,
            price: biz.price || null,
            phone: phone,
            website: biz.website || null,
            gmaps_url: biz.url || null,
            photo: biz.imageUrl || null,
            address: addressStr,
            coordinates: biz.location || null,
            opening_hours: biz.openingHours || null,
            permanently_closed: biz.permanentlyClosed || false,
            temporarily_closed: biz.temporarilyClosed || false,
            place_id: biz.placeId || null,
            neighborhood: biz.neighborhood || null,
            review_distribution: biz.reviewsDistribution || null,
            source_platform: "gmaps-finder",
          },
          tags: [...(biz.categories || []).slice(0, 3), "gmaps-finder", `${biz.totalScore}★`].filter(Boolean),
        });
      }
    }

    console.log(`GMaps Finder: created ${created.length} new customers from ${lowRated.length} low-rated businesses`);

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
    console.error("GMaps Finder error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
