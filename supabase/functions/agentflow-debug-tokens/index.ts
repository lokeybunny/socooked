const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const tokens = {
    APIFY_TOKEN: Deno.env.get("APIFY_TOKEN"),
    APIFY_TOKEN_CRAIGSLIST: Deno.env.get("APIFY_TOKEN_CRAIGSLIST"),
    APIFY_TOKEN_COMMUNITY: Deno.env.get("APIFY_TOKEN_COMMUNITY"),
  };
  const out: any = {};
  for (const [name, t] of Object.entries(tokens)) {
    if (!t) { out[name] = { present: false }; continue; }
    try {
      const r = await fetch(`https://api.apify.com/v2/users/me?token=${t}`);
      const text = await r.text();
      let body: any = text;
      try { body = JSON.parse(text); } catch {}
      out[name] = { present: true, prefix: t.slice(0,12)+"...", status: r.status, body: typeof body === "object" ? { id: body?.data?.id, username: body?.data?.username, plan: body?.data?.plan, usageCycle: body?.data?.currentBillingPeriodStart } : body };
    } catch (e: any) { out[name] = { present: true, error: e.message }; }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
