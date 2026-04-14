import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import {
  dialNext,
  dialNextBatch,
  sanitizePowerDialAssistantId,
  DEFAULT_POWERDIAL_SETTINGS,
  sb,
} from "../_shared/powerdial.ts";

/**
 * powerdial-scheduler
 * Cron-invoked every minute. Finds campaigns with schedule_status = 'scheduled'
 * whose scheduled_start <= now(), then auto-starts them.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const now = new Date().toISOString();

    // Find campaigns due to start
    const { data: dueCampaigns, error: fetchErr } = await sb
      .from("powerdial_campaigns")
      .select("id, name, settings")
      .eq("schedule_status", "scheduled")
      .eq("status", "idle")
      .lte("scheduled_start", now);

    if (fetchErr) {
      console.error("[powerdial-scheduler] fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dueCampaigns?.length) {
      return new Response(JSON.stringify({ ok: true, triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const campaign of dueCampaigns) {
      console.log(`[powerdial-scheduler] Auto-starting campaign: ${campaign.name} (${campaign.id})`);

      // Mark as triggered + running
      await sb.from("powerdial_campaigns").update({
        status: "running",
        schedule_status: "triggered",
        started_at: now,
      }).eq("id", campaign.id);

      // Kick off dialing
      const tripleDialEnabled = Boolean(campaign.settings?.triple_dial);
      const result = tripleDialEnabled
        ? await dialNextBatch(campaign.id, 3, "[powerdial-scheduler]")
        : await dialNext(campaign.id, "[powerdial-scheduler]");

      console.log(`[powerdial-scheduler] Start result for ${campaign.id}:`, result);
      results.push({ campaign_id: campaign.id, name: campaign.name, ...result });
    }

    return new Response(JSON.stringify({ ok: true, triggered: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[powerdial-scheduler]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
