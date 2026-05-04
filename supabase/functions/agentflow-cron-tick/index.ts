import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Cron orchestrator: picks next active locations and triggers scrape
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: locs } = await supabase
    .from("target_locations")
    .select("location, last_scraped_at")
    .eq("is_active", true)
    .order("last_scraped_at", { ascending: true, nullsFirst: true })
    .limit(10);

  const results: any[] = [];
  for (const l of locs || []) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/agentflow-scrape-zillow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ location: l.location, max_pages: 5 }),
      });
      results.push({ location: l.location, ok: r.ok });
    } catch (e: any) {
      results.push({ location: l.location, ok: false, err: e?.message });
    }
  }
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
