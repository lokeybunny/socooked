import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const now = new Date();

  // 1. Auto-draft: findings older than 24h that are still status='new' → status='drafted'
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: toDraft, error: draftErr } = await sb
    .from("research_findings")
    .update({ status: "drafted" })
    .eq("status", "new")
    .lt("created_at", twentyFourHoursAgo)
    .select("id");

  const draftedCount = toDraft?.length || 0;
  if (draftErr) console.error("Draft error:", draftErr.message);

  // 2. Permanent delete: drafted findings older than 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: toDelete, error: delErr } = await sb
    .from("research_findings")
    .delete()
    .eq("status", "drafted")
    .lt("created_at", sevenDaysAgo)
    .select("id");

  const deletedCount = toDelete?.length || 0;
  if (delErr) console.error("Delete error:", delErr.message);

  console.log(`[research-drafts] Drafted: ${draftedCount}, Deleted: ${deletedCount}`);

  return new Response(
    JSON.stringify({ success: true, drafted: draftedCount, deleted: deletedCount }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
