import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Cron orchestrator: picks next active locations and triggers scrape (fire-and-forget)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: locs, error } = await supabase
      .from("target_locations")
      .select("location, last_scraped_at")
      .eq("is_active", true)
      .order("last_scraped_at", { ascending: true, nullsFirst: true })
      .limit(5);

    if (error) throw error;

    const dispatched: string[] = [];
    for (const l of locs || []) {
      // Fire-and-forget: do NOT await. Each scrape can take minutes.
      fetch(`${SUPABASE_URL}/functions/v1/agentflow-scrape-zillow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ location: l.location, max_pages: 5 }),
      }).catch((e) => console.error("dispatch error", l.location, e?.message));
      dispatched.push(l.location);
    }

    return new Response(JSON.stringify({ ok: true, dispatched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
