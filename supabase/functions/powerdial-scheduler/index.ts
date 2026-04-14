import {
  dialNext,
  dialNextBatch,
  sb,
} from "../_shared/powerdial.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * powerdial-scheduler
 * Cron-invoked every minute.
 * 1) Starts campaigns whose scheduled_start <= now()
 * 2) Stops running campaigns whose scheduled_end <= now()
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const now = new Date().toISOString();
    const results: any[] = [];

    // ── 1. AUTO-STOP: campaigns past their scheduled end ──
    const { data: expiredCampaigns } = await sb
      .from("powerdial_campaigns")
      .select("id, name")
      .eq("status", "running")
      .not("scheduled_end", "is", null)
      .lte("scheduled_end", now);

    for (const camp of expiredCampaigns || []) {
      console.log(`[powerdial-scheduler] Auto-stopping campaign past end time: ${camp.name} (${camp.id})`);
      await sb.from("powerdial_campaigns").update({
        status: "stopped",
        ended_at: now,
        schedule_status: "ended_by_schedule",
      }).eq("id", camp.id);
      results.push({ campaign_id: camp.id, name: camp.name, action: "auto_stopped" });
    }

    // ── 2. AUTO-START: campaigns due to begin ──
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
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    for (const campaign of dueCampaigns || []) {
      console.log(`[powerdial-scheduler] Auto-starting campaign: ${campaign.name} (${campaign.id})`);

      await sb.from("powerdial_campaigns").update({
        status: "running",
        schedule_status: "triggered",
        started_at: now,
      }).eq("id", campaign.id);

      const tripleDialEnabled = Boolean(campaign.settings?.triple_dial);
      const result = tripleDialEnabled
        ? await dialNextBatch(campaign.id, 3, "[powerdial-scheduler]")
        : await dialNext(campaign.id, "[powerdial-scheduler]");

      console.log(`[powerdial-scheduler] Start result for ${campaign.id}:`, result);
      results.push({ campaign_id: campaign.id, name: campaign.name, action: "auto_started", ...result });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[powerdial-scheduler]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
