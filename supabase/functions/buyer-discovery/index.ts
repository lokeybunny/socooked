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
    const action = body.action || "start"; // "start" | "poll"

    // ── POLL: check running logs and ingest completed ones ──
    if (action === "poll") {
      const runIdFilter = body.run_id;
      const logsQuery = supabase
        .from("lw_buyer_ingestion_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(runIdFilter ? 1 : 10);

      const { data: runningLogs } = runIdFilter
        ? await logsQuery.eq("apify_run_id", runIdFilter)
        : await logsQuery.eq("status", "running");

      if (!runningLogs?.length) {
        return new Response(JSON.stringify({ message: "No running jobs to poll", polled: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: any[] = [];

      for (const log of runningLogs) {
        const runId = log.apify_run_id;
        if (!runId) continue;

        // Check run status
        const pollRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
        );
        if (!pollRes.ok) { await pollRes.text(); continue; }
        const pollData = await pollRes.json();
        const status = pollData?.data?.status;
        const datasetId = pollData?.data?.defaultDatasetId;

        const isTerminalWithUsableDataset = ["SUCCEEDED", "ABORTED", "TIMED-OUT"].includes(status) && datasetId;

        if (isTerminalWithUsableDataset) {
          const dsRes = await fetch(
            `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=500`
          );
          if (!dsRes.ok) {
            const errText = await dsRes.text();
            console.error(`[buyer-discovery] Dataset fetch failed for run ${runId}: ${errText}`);
            await supabase.from("lw_buyer_ingestion_logs")
              .update({ status: "error", error: `Dataset fetch failed: ${dsRes.status}` })
              .eq("apify_run_id", runId);
            results.push({ run_id: runId, status: "error", reason: "dataset_fetch_failed" });
            continue;
          }

          const records = await dsRes.json();
          console.log(`[buyer-discovery] Poll: got ${records.length} records for run ${runId} (${status})`);

          if (records.length === 0) {
            await supabase.from("lw_buyer_ingestion_logs")
              .update({
                status: "completed",
                records_received: 0,
                records_new: 0,
                records_skipped: 0,
                error: status === "SUCCEEDED" ? null : `Apify run ${status} with no dataset rows`,
              })
              .eq("apify_run_id", runId);
            results.push({ run_id: runId, status: "completed_empty", records: 0, apify_status: status });
            continue;
          }

          // Batch records into chunks of 50 to avoid edge function timeouts
          const CHUNK_SIZE = 50;
          const chunks: any[][] = [];
          for (let i = 0; i < records.length; i += CHUNK_SIZE) {
            chunks.push(records.slice(i, i + CHUNK_SIZE));
          }

          const ingestUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/buyer-ingest`;
          const headers = {
            "Content-Type": "application/json",
            "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
          };

          let totalNew = 0, totalUpdated = 0, totalSkipped = 0, chunkErrors = 0;

          for (let ci = 0; ci < chunks.length; ci++) {
            const chunk = chunks[ci];
            console.log(`[buyer-discovery] Ingesting chunk ${ci + 1}/${chunks.length} (${chunk.length} records) for run ${runId}`);
            try {
              const ingestRes = await fetch(ingestUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  run_id: runId,
                  dataset_id: datasetId,
                  source_id: log.source_id,
                  platform: log.platform,
                  records: chunk,
                }),
              });
              const ingestResult = await ingestRes.json().catch(() => ({}));
              if (ingestRes.ok && !ingestResult?.error) {
                totalNew += Number(ingestResult?.new || 0);
                totalUpdated += Number(ingestResult?.updated || 0);
                totalSkipped += Number(ingestResult?.skipped || 0);
              } else {
                console.error(`[buyer-discovery] Chunk ${ci + 1} failed:`, ingestResult?.error || ingestRes.status);
                chunkErrors++;
              }
            } catch (err) {
              console.error(`[buyer-discovery] Chunk ${ci + 1} exception:`, err);
              chunkErrors++;
            }
          }

          // Update log with totals
          await supabase.from("lw_buyer_ingestion_logs")
            .update({
              status: chunkErrors === chunks.length ? "error" : "completed",
              records_received: records.length,
              records_new: totalNew,
              records_updated: totalUpdated,
              records_skipped: totalSkipped,
              error: chunkErrors > 0 ? `${chunkErrors}/${chunks.length} chunks failed` : null,
            })
            .eq("apify_run_id", runId);

          console.log(`[buyer-discovery] Ingest complete for ${runId}: new=${totalNew} updated=${totalUpdated} skipped=${totalSkipped} errors=${chunkErrors}`);
          results.push({
            run_id: runId,
            status: "ingested",
            apify_status: status,
            partial: status !== "SUCCEEDED",
            ingest: { new: totalNew, updated: totalUpdated, skipped: totalSkipped, chunk_errors: chunkErrors },
          });
        } else if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
          await supabase.from("lw_buyer_ingestion_logs")
            .update({ status: "error", error: `Apify run ${status}` })
            .eq("apify_run_id", runId);
          results.push({ run_id: runId, status: "failed", apify_status: status });
        } else {
          results.push({ run_id: runId, status: "still_running", apify_status: status });
        }
      }

      return new Response(JSON.stringify({ polled: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── START: kick off Apify runs ──
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

        await supabase.from("lw_buyer_ingestion_logs").insert({
          source_id: source.id,
          apify_run_id: runId,
          platform: source.platform,
          status: "running",
          meta: { actor_id: actorId, input },
        });

        await supabase
          .from("lw_buyer_discovery_sources")
          .update({ last_run_at: new Date().toISOString(), run_count: (source.run_count || 0) + 1 })
          .eq("id", source.id);

        results.push({ source: source.name, status: "started", run_id: runId });
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
      // Category code: rew = "wanted: real estate" under housing
      const categoryCode = meta.category_code || "rew";
      let generatedUrls: { url: string }[] = [];

      if (cities.length > 0) {
        // One URL per city — scrape entire "wanted: real estate" category
        for (const city of cities) {
          const slug = city.toLowerCase().replace(/\s+/g, "");
          generatedUrls.push({
            url: `https://${slug}.craigslist.org/search/${categoryCode}`,
          });
        }
      } else if (urls.length > 0) {
        generatedUrls = urls.map((u: string) => ({ url: u }));
      } else {
        generatedUrls = [{ url: `https://craigslist.org/search/${categoryCode}` }];
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
