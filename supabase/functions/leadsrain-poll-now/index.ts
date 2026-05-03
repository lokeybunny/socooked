// Manual trigger — invokes leadsrain-poll-sync with force=true.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/leadsrain-poll-sync`;
const KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ force: true }),
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
