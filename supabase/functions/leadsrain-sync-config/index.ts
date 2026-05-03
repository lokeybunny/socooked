// GET / POST the lr_sync_config singleton (interval_minutes + enabled).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    const { data } = await sb.from("lr_sync_config").select("*").eq("id", 1).maybeSingle();
    return new Response(JSON.stringify(data ?? {}), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => ({}));
  const patch: any = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (Number.isFinite(body.interval_minutes)) patch.interval_minutes = Math.max(1, Math.min(60, body.interval_minutes));
  // Reset next_run_at so the new interval applies immediately
  patch.next_run_at = new Date().toISOString();

  const { data, error } = await sb.from("lr_sync_config").update(patch).eq("id", 1).select().maybeSingle();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
