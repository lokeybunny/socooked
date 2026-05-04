const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t = Deno.env.get("APIFY_TOKEN")!;
  const r = await fetch(`https://api.apify.com/v2/acts/maxcopell~zillow-scraper/run-sync-get-dataset-items?token=${t}&clean=true&format=json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ searchUrls: [{ url: "https://www.zillow.com/portland-or/" }], extractionMethod: "MAP_MARKERS", maxItems: 5 }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await r.text();
  return new Response(JSON.stringify({ status: r.status, body: text.slice(0, 1500) }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
