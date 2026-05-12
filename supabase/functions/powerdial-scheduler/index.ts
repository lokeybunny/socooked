import {
  advanceCampaign,
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

    // ── 3. HEARTBEAT TICK: keep running campaigns moving even when no UI is open ──
    // The webhook chains the next dial when each Twilio callback fires, but if a
    // callback is dropped/delayed the campaign can stall. This tick re-advances any
    // running campaign that has no in-flight `dialing` rows so the queue keeps
    // processing server-side regardless of whether the user has the page open.
    // The user's manual `stop` action still wins — stopped/paused campaigns are skipped.
    const stallThresholdMs = 90_000; // 90s with no dial activity = stalled
    const stallCutoff = new Date(Date.now() - stallThresholdMs).toISOString();

    const { data: runningCampaigns } = await sb
      .from("powerdial_campaigns")
      .select("id, name")
      .eq("status", "running");

    for (const camp of runningCampaigns || []) {
      // Skip if there is still an in-flight dialing row updated recently
      const { count: inFlight } = await sb
        .from("powerdial_queue")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", camp.id)
        .eq("status", "dialing")
        .gte("updated_at", stallCutoff);

      if ((inFlight ?? 0) > 0) continue;

      // Make sure there is still pending work; otherwise let the webhook close it out
      const { count: pending } = await sb
        .from("powerdial_queue")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", camp.id)
        .eq("status", "pending");

      if ((pending ?? 0) === 0) continue;

      console.log(`[powerdial-scheduler] Heartbeat advance for stalled campaign ${camp.name} (${camp.id})`);
      const tickResult = await advanceCampaign(camp.id, "[powerdial-scheduler:tick]");
      results.push({ campaign_id: camp.id, name: camp.name, action: "heartbeat_advance", ...tickResult });
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
