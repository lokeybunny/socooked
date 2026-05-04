const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZENROWS_API_KEY = Deno.env.get("ZENROWS_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { url = "https://www.zillow.com/homes/Portland-OR_rb/" } = await req.json().catch(() => ({}));
    const u = new URL("https://api.zenrows.com/v1/");
    u.searchParams.set("apikey", ZENROWS_API_KEY);
    u.searchParams.set("url", url);
    u.searchParams.set("js_render", "true");
    u.searchParams.set("premium_proxy", "true");
    u.searchParams.set("proxy_country", "us");

    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(90000) });
    const status = r.status;
    const html = await r.text();
    const size = html.length;

    const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) {
      return json({ ok: true, status, size, has_next_data: false, html_preview: html.slice(0, 500) });
    }
    let listings: any[] = [];
    let firstAttribution: any = null;
    let firstKeys: string[] = [];
    try {
      const data = JSON.parse(m[1]);
      listings = data?.props?.pageProps?.searchPageState?.cat1?.searchResults?.listResults
        || data?.props?.pageProps?.searchResults?.listResults || [];
      if (listings.length > 0) {
        firstKeys = Object.keys(listings[0]).slice(0, 40);
        firstAttribution = listings[0].attributionInfo || null;
      }
    } catch (e: any) {
      return json({ ok: false, parse_error: e.message, status, size });
    }

    // Field probes via regex on raw blob
    const blob = m[1];
    const probes = {
      agentProfileUrl: (blob.match(/"agentProfileUrl"\s*:\s*"([^"]+)"/g) || []).slice(0, 3),
      agentZuid: (blob.match(/"agentZuid"\s*:\s*"([^"]+)"/g) || []).slice(0, 3),
      encodedZuid: (blob.match(/"encodedZuid"\s*:\s*"([^"]+)"/g) || []).slice(0, 3),
      agentPhoneNumber: (blob.match(/"agentPhoneNumber"\s*:\s*"([^"]+)"/g) || []).slice(0, 3),
      brokerPhoneNumber: (blob.match(/"brokerPhoneNumber"\s*:\s*"([^"]+)"/g) || []).slice(0, 3),
      agentName: (blob.match(/"agentName"\s*:\s*"([^"]+)"/g) || []).slice(0, 3),
    };

    return json({
      ok: true, status, size,
      listings_count: listings.length,
      first_keys: firstKeys,
      first_attribution: firstAttribution,
      probes,
    });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
