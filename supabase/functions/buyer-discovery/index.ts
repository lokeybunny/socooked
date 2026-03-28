import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  if (!APIFY_TOKEN) {
    return new Response(JSON.stringify({ error: "APIFY_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { source_id } = body;

    let query = supabase.from("lw_buyer_discovery_sources").select("*").eq("is_enabled", true);
    if (source_id) query = query.eq("id", source_id);
    const { data: sources, error: srcErr } = await query;
    if (srcErr) throw srcErr;
    if (!sources?.length) {
      return new Response(JSON.stringify({ message: "No enabled sources found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const source of sources) {
      try {
        const input = buildApifyInput(source);
        const actorId = (source.apify_actor_id || "").replace("/", "~");
        if (!actorId) {
          results.push({ source: source.name, status: "skipped", reason: "no actor_id" });
          continue;
        }

        // Start Apify run
        const runRes = await fetch(
          `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}&waitForFinish=0`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }
        );

        if (!runRes.ok) {
          const errText = await runRes.text();
          results.push({ source: source.name, status: "error", error: errText });
          continue;
        }

        const runData = await runRes.json();
        const runId = runData?.data?.id;
        const datasetId = runData?.data?.defaultDatasetId;

        // Log the run
        await supabase.from("lw_buyer_ingestion_logs").insert({
          source_id: source.id,
          apify_run_id: runId,
          platform: source.platform,
          status: "running",
          meta: { actor_id: actorId, input },
        });

        // Update source last_run
        await supabase
          .from("lw_buyer_discovery_sources")
          .update({ last_run_at: new Date().toISOString(), run_count: (source.run_count || 0) + 1 })
          .eq("id", source.id);

        // Poll for completion (up to ~150s)
        let finalStatus = "RUNNING";
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const pollRes = await fetch(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
          );
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            finalStatus = pollData?.data?.status;
            if (finalStatus === "SUCCEEDED" || finalStatus === "FAILED" || finalStatus === "ABORTED" || finalStatus === "TIMED-OUT") {
              break;
            }
          } else {
            await pollRes.text(); // consume body
          }
        }

        if (finalStatus === "SUCCEEDED" && datasetId) {
          // Fetch dataset items
          const dsRes = await fetch(
            `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=500`
          );
          if (dsRes.ok) {
            const records = await dsRes.json();
            console.log(`[buyer-discovery] Got ${records.length} records from dataset ${datasetId}`);

            // Call buyer-ingest internally
            const ingestUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/buyer-ingest`;
            const ingestRes = await fetch(ingestUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
              },
              body: JSON.stringify({
                run_id: runId,
                dataset_id: datasetId,
                source_id: source.id,
                platform: source.platform,
                records, // pass records directly so ingest doesn't need to re-fetch
              }),
            });
            const ingestResult = await ingestRes.json();
            console.log(`[buyer-discovery] Ingest result:`, JSON.stringify(ingestResult));
            results.push({ source: source.name, status: "completed", run_id: runId, ingest: ingestResult });
          } else {
            const errText = await dsRes.text();
            results.push({ source: source.name, status: "error", error: `Dataset fetch failed: ${errText}` });
            await supabase.from("lw_buyer_ingestion_logs").update({ status: "error", error: `Dataset fetch failed` }).eq("apify_run_id", runId);
          }
        } else if (finalStatus === "RUNNING") {
          // Still running after timeout — leave as running, user can check later
          results.push({ source: source.name, status: "timeout", run_id: runId, message: "Run still in progress after 150s" });
        } else {
          results.push({ source: source.name, status: "error", error: `Run ended with status: ${finalStatus}` });
          await supabase.from("lw_buyer_ingestion_logs").update({ status: "error", error: `Apify run ${finalStatus}` }).eq("apify_run_id", runId);
        }
      } catch (err) {
        results.push({ source: source.name, status: "error", error: String(err) });
      }
    }

    return new Response(JSON.stringify({ sources_processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildApifyInput(source: any) {
  const keywords = source.search_keywords || [];
  const urls = source.search_urls || [];
  const platform = source.platform;
  const meta = source.meta || {};

  switch (platform) {
    case "facebook":
      return {
        startUrls: urls.map((u: string) => ({ url: u })),
        maxPosts: meta.max_posts || 100,
        maxComments: meta.max_comments || 50,
        ...meta.actor_input,
      };
    case "twitter":
      return {
        searchTerms: keywords,
        maxTweets: meta.max_tweets || 200,
        sort: "Latest",
        ...meta.actor_input,
      };
    case "craigslist": {
      const cities: string[] = meta.cities || [];
      const searchKeywords = keywords.length ? keywords : ["land"];
      let generatedUrls: { url: string }[] = [];

      if (cities.length > 0) {
        for (const city of cities) {
          const slug = city.toLowerCase().replace(/\s+/g, "");
          for (const kw of searchKeywords) {
            generatedUrls.push({
              url: `https://${slug}.craigslist.org/search/hsw?query=${encodeURIComponent(kw)}`,
            });
          }
        }
      } else if (urls.length > 0) {
        generatedUrls = urls.map((u: string) => ({ url: u }));
      } else {
        generatedUrls = [{ url: "https://craigslist.org/search/hsw?query=land" }];
      }

      return {
        urls: generatedUrls,
        maxItems: meta.max_items || 100,
        ...meta.actor_input,
      };
    }
    case "biggerpockets":
    case "directory":
    case "web":
      return {
        startUrls: urls.map((u: string) => ({ url: u })),
        maxPages: meta.max_pages || 50,
        ...meta.actor_input,
      };
    default:
      return { startUrls: urls.map((u: string) => ({ url: u })), ...meta.actor_input };
  }
}
