import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data: { user }, error: userErr } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "start") {
      const { zipCodes, minDaysOnMarket = 30, maxListingsPerZip = 50, minPrice, maxPrice, homeTypes = ["SINGLE_FAMILY"] } = body;

      if (!zipCodes || !Array.isArray(zipCodes) || zipCodes.length === 0) {
        return new Response(JSON.stringify({ error: "zipCodes required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apifyToken = Deno.env.get("APIFY_TOKEN");
      if (!apifyToken) {
        return new Response(JSON.stringify({ error: "APIFY_TOKEN not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Start the Apify actor run
      const actorInput: Record<string, unknown> = {
        zipCodes,
        minDaysOnMarket: Number(minDaysOnMarket),
        maxListingsPerZip: Number(maxListingsPerZip),
        homeTypes,
      };
      if (minPrice) actorInput.minPrice = Number(minPrice);
      if (maxPrice) actorInput.maxPrice = Number(maxPrice);

      const runRes = await fetch(
        "https://api.apify.com/v2/acts/rSOvnzvjeB3OIXQPY/runs",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apifyToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(actorInput),
        }
      );

      if (!runRes.ok) {
        const errText = await runRes.text();
        return new Response(JSON.stringify({ error: `Apify error: ${runRes.status} - ${errText}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const runData = await runRes.json();
      const runId = runData?.data?.id;

      return new Response(JSON.stringify({ runId, status: "RUNNING" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "poll") {
      const { runId } = body;
      if (!runId) {
        return new Response(JSON.stringify({ error: "runId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apifyToken = Deno.env.get("APIFY_TOKEN");
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        { headers: { Authorization: `Bearer ${apifyToken}` } }
      );
      const statusData = await statusRes.json();
      const runStatus = statusData?.data?.status;

      if (runStatus === "SUCCEEDED") {
        // Fetch results from the dataset
        const datasetId = statusData?.data?.defaultDatasetId;
        const itemsRes = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&limit=1000`,
          { headers: { Authorization: `Bearer ${apifyToken}` } }
        );
        const items = await itemsRes.json();

        // Process and store results
        let stored = 0;
        const batchSize = 10;
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          const rows = batch.map((item: any) => {
            // Calculate price drop info from priceHistory
            const priceHistory = item.priceHistory || [];
            let priceDrop = 0;
            let dropCount = 0;
            if (priceHistory.length >= 2) {
              const originalPrice = priceHistory[0]?.price;
              const currentPrice = priceHistory[priceHistory.length - 1]?.price;
              if (originalPrice && currentPrice && originalPrice > currentPrice) {
                priceDrop = Math.round(((originalPrice - currentPrice) / originalPrice) * 100 * 10) / 10;
              }
              dropCount = priceHistory.filter((h: any) => h.event === "Price change" || h.priceChangeRate < 0).length;
            }

            return {
              zpid: String(item.zpid || ""),
              address: item.streetAddress || item.address || "",
              city: item.city || "",
              state: item.state || "",
              zip: item.zipcode || item.zip || "",
              listed_price: item.price || null,
              zestimate: item.zestimate || null,
              days_on_zillow: item.daysOnZillow || item.timeOnZillow || null,
              bedrooms: item.bedrooms || null,
              bathrooms: item.bathrooms || null,
              sqft: item.livingArea || item.sqft || null,
              lot_sqft: item.lotAreaValue || null,
              year_built: item.yearBuilt || null,
              home_type: item.homeType || "",
              home_status: item.homeStatus || "FOR_SALE",
              zillow_url: item.url || (item.zpid ? `https://www.zillow.com/homedetails/${item.zpid}_zpid/` : ""),
              agent_name: item.listingAgent?.name || item.agentName || "",
              agent_phone: item.listingAgent?.phone || item.agentPhone || "",
              brokerage: item.brokerageName || item.brokerage || "",
              price_history: priceHistory,
              total_price_drop_percent: priceDrop || null,
              price_drop_count: dropCount,
              date_posted: item.datePosted || item.dateSold || null,
              flagged: priceDrop >= 15 || dropCount >= 2,
              apify_run_id: runId,
              meta: {
                raw_home_status: item.homeStatus,
                lot_area_unit: item.lotAreaUnit,
                listing_sub_type: item.listingSubType,
              },
            };
          });

          const { error: insertErr } = await sb.from("stale_zillow_leads").insert(rows);
          if (!insertErr) stored += rows.length;
        }

        return new Response(
          JSON.stringify({
            status: "SUCCEEDED",
            totalFound: items.length,
            stored,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
        return new Response(
          JSON.stringify({ status: runStatus, error: "Apify run failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Still running
      return new Response(
        JSON.stringify({ status: runStatus || "RUNNING" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list") {
      const { page = 1, pageSize = 50, sortBy = "days_on_zillow", sortAsc = false, flaggedOnly = false } = body;
      let query = sb.from("stale_zillow_leads").select("*", { count: "exact" })
        .order(sortBy, { ascending: sortAsc })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (flaggedOnly) query = query.eq("flagged", true);

      const { data, count, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ data, total: count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
