import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit") ?? "20";
    const search = url.searchParams.get("q") ?? "";

    // Public Polymarket Gamma API
    const apiUrl = new URL("https://gamma-api.polymarket.com/markets");
    apiUrl.searchParams.set("limit", limit);
    apiUrl.searchParams.set("active", "true");
    apiUrl.searchParams.set("closed", "false");
    apiUrl.searchParams.set("order", "volume24hr");
    apiUrl.searchParams.set("ascending", "false");
    if (search) apiUrl.searchParams.set("q", search);

    const res = await fetch(apiUrl.toString());
    if (!res.ok) {
      const txt = await res.text();
      console.error("Gamma error:", res.status, txt);
      return new Response(JSON.stringify({ error: "Polymarket API error", status: res.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ markets: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("poly-markets error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
