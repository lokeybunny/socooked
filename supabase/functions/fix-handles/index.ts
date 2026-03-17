import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Fix social media handle punctuation in calendar events.
 * Removes periods immediately after @handles so Instagram/TikTok tags stay clickable.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Handles that should never have a period immediately after them
  const handlePatterns = [
    { search: "@lamb.wavvv.", replace: "@lamb.wavv " },
    { search: "@lamb.wavv.", replace: "@lamb.wavv " },
    { search: "@oranjgoodman.", replace: "@oranjgoodman " },
  ];

  let totalFixed = 0;
  const details: string[] = [];

  for (const pattern of handlePatterns) {
    const { data: events, error } = await supabase
      .from("calendar_events")
      .select("id, title, description")
      .eq("source", "smm")
      .or(`title.like.%${pattern.search}%,description.like.%${pattern.search}%`);

    if (error) {
      console.error(`[fix-handles] Query error for "${pattern.search}":`, error.message);
      continue;
    }
    if (!events?.length) continue;

    for (const ev of events) {
      const updates: Record<string, string> = {};
      if (ev.title?.includes(pattern.search)) {
        updates.title = ev.title.replaceAll(pattern.search, pattern.replace).trim();
      }
      if (ev.description?.includes(pattern.search)) {
        updates.description = ev.description.replaceAll(pattern.search, pattern.replace).trim();
      }
      if (Object.keys(updates).length > 0) {
        const { error: upErr } = await supabase
          .from("calendar_events")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", ev.id);
        if (!upErr) totalFixed++;
        else console.error(`[fix-handles] Update error ${ev.id}:`, upErr.message);
      }
    }

    details.push(`"${pattern.search}" → ${events.length} matches`);
  }

  return new Response(
    JSON.stringify({ message: `Fixed ${totalFixed} events`, totalFixed, details }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
