import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull the active Apify key from the apify_config table (API Management)
    const { data: apifyRow, error: apifyErr } = await sb
      .from("apify_config")
      .select("api_key")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (apifyErr) throw new Error(`Failed to fetch Apify config: ${apifyErr.message}`);
    const apifyToken = apifyRow?.api_key;
    if (!apifyToken) throw new Error("No active Apify API key found in API Management. Please add one at /api-management.");

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Step 1: Use AI to parse the natural language query
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a query parser. Extract search parameters from natural language queries about finding businesses on Google Maps. Return ONLY valid JSON with these fields:
- searchTerms: array of business type keywords (e.g. ["restaurant", "senior care"])
- location: string location (e.g. "Las Vegas, NV")
- maxItems: number between 250 and 350 (default 300)
- maxRating: number max star rating filter (e.g. 3 means 1-3 stars). Default null (no filter).
- minRating: number min star rating. Default null.

Examples:
"Find 300 Las Vegas businesses with 2-3 star Google ratings" → {"searchTerms":["businesses"],"location":"Las Vegas, NV","maxItems":300,"maxRating":3,"minRating":2}
"Get me 250 poor-rated restaurants in Henderson" → {"searchTerms":["restaurant"],"location":"Henderson, NV","maxItems":250,"maxRating":3,"minRating":1}
"Scrape senior care businesses in Las Vegas with bad reviews" → {"searchTerms":["senior care"],"location":"Las Vegas, NV","maxItems":300,"maxRating":3,"minRating":1}

Return ONLY the JSON object, nothing else.`,
          },
          { role: "user", content: query },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      throw new Error(`AI parse failed (${aiRes.status}): ${errText.slice(0, 200)}`);
    }

    const aiData = await aiRes.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "{}";
    let parsed: { searchTerms?: string[]; location?: string; maxItems?: number; maxRating?: number | null; minRating?: number | null };
    try {
      parsed = JSON.parse(aiContent);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    const searchTerms = parsed.searchTerms || ["businesses"];
    const location = parsed.location || "Las Vegas, NV";
    const maxItems = Math.min(Math.max(parsed.maxItems || 300, 250), 350);
    const maxRating = parsed.maxRating ?? null;
    const minRating = parsed.minRating ?? null;

    console.log(`Lead Hunter: parsed query → terms=${searchTerms}, location=${location}, maxItems=${maxItems}, rating=${minRating}-${maxRating}`);

    // Step 2: Run Apify Google Maps scraper
    const input: Record<string, any> = {
      maxCrawledPlacesPerSearch: maxItems,
      language: "en",
      deeperCityScrape: false,
      searchStringsArray: searchTerms.map(t => `${t} in ${location}`),
    };

    const actorId = "compass~crawler-google-places";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    console.log(`Lead Hunter: calling Apify with`, JSON.stringify(input));

    const apifyRes = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(300_000),
    });

    if (!apifyRes.ok) {
      const err = await apifyRes.text().catch(() => "");
      throw new Error(`Apify request failed (${apifyRes.status}): ${err.slice(0, 300)}`);
    }

    const results = await apifyRes.json();
    if (!Array.isArray(results) || results.length === 0) {
      return new Response(JSON.stringify({
        businesses: [],
        parsed: { searchTerms, location, maxItems, maxRating, minRating },
        message: "No businesses found for this query",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Lead Hunter: got ${results.length} raw results from Apify`);

    // Step 3: Filter by rating if specified
    let filtered = results;
    if (maxRating !== null || minRating !== null) {
      filtered = results.filter((b: any) => {
        const score = b.totalScore;
        if (score === undefined || score === null || score === 0) return false;
        if (maxRating !== null && score > maxRating) return false;
        if (minRating !== null && score < minRating) return false;
        return true;
      });
    }

    // Limit to maxItems
    filtered = filtered.slice(0, maxItems);

    console.log(`Lead Hunter: ${filtered.length} businesses after filtering`);

    // Step 4: Extract one negative review snippet per business
    const businesses = filtered.map((b: any) => {
      const reviews = b.reviews || b.reviewsData || [];
      let negativeReview = "";
      if (Array.isArray(reviews)) {
        const neg = reviews.find((r: any) => (r.stars || r.rating || 5) <= 3);
        if (neg) {
          negativeReview = (neg.text || neg.reviewText || neg.body || "").slice(0, 200);
        }
      }

      const phone = b.phone || b.phoneUnformatted || null;
      const address = b.address || [b.street, b.city, b.state, b.postalCode].filter(Boolean).join(", ") || "";

      return {
        name: b.title || "Unknown Business",
        phone,
        address,
        rating: b.totalScore || 0,
        reviewCount: b.reviewsCount || 0,
        negativeReview,
        website: b.website || null,
        gmapsUrl: b.url || null,
        categories: b.categories || [],
        categoryName: b.categoryName || null,
        imageUrl: b.imageUrl || null,
        placeId: b.placeId || null,
      };
    });

    return new Response(JSON.stringify({
      businesses,
      total: businesses.length,
      parsed: { searchTerms, location, maxItems, maxRating, minRating },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Lead Hunter error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
