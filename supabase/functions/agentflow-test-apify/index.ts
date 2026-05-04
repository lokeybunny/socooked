const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const tokens = {
    APIFY_TOKEN_PAID: Deno.env.get("APIFY_TOKEN_PAID"),
    APIFY_TOKEN: Deno.env.get("APIFY_TOKEN"),
    APIFY_TOKEN_CRAIGSLIST: Deno.env.get("APIFY_TOKEN_CRAIGSLIST"),
    APIFY_TOKEN_COMMUNITY: Deno.env.get("APIFY_TOKEN_COMMUNITY"),
  };

  const results: Record<string, any> = {};

  for (const [name, token] of Object.entries(tokens)) {
    if (!token) {
      results[name] = { present: false };
      continue;
    }
    try {
      // Test 1: identity (user info)
      const userR = await fetch(`https://api.apify.com/v2/users/me?token=${token}`);
      const userBody = await userR.text();
      let userJson: any = null;
      try { userJson = JSON.parse(userBody); } catch {}

      results[name] = {
        present: true,
        token_preview: token.slice(0, 10) + "..." + token.slice(-4),
        user_status: userR.status,
        username: userJson?.data?.username || null,
        plan: userJson?.data?.plan || null,
        usage_cycle: userJson?.data?.usageCycle || null,
        error: userR.ok ? null : userBody.slice(0, 400),
      };
    } catch (e: any) {
      results[name] = { present: true, error: e?.message || String(e) };
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
