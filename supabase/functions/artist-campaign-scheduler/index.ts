import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { action, campaign_id } = body;

    // ─── SCHEDULE: initial 7-14 day campaign ───
    if (action === "schedule") {
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (!campaign) return json({ error: "Campaign not found" }, 404);

      if (!campaign.media_urls || campaign.media_urls.length === 0) {
        await supabase.from("smm_artist_campaigns").update({ status: "paused" }).eq("id", campaign_id);
        return json({ error: "No media — campaign paused" }, 400);
      }

      // Cap active campaigns at 5
      const { count: activeCount } = await supabase
        .from("smm_artist_campaigns").select("id", { count: "exact", head: true })
        .eq("profile_username", campaign.profile_username).eq("status", "active");

      if ((activeCount || 0) >= 5) {
        const { data: oldest } = await supabase
          .from("smm_artist_campaigns").select("id")
          .eq("profile_username", campaign.profile_username).eq("status", "active")
          .order("started_at", { ascending: true }).limit(1).single();
        if (oldest) await supabase.from("smm_artist_campaigns").update({ status: "expired" }).eq("id", oldest.id);
      }

      const scheduledItems = await scheduleMediaDays(supabase, campaign, 0, campaign.days_total);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + campaign.days_total);

      await supabase.from("smm_artist_campaigns").update({
        status: "active", started_at: new Date().toISOString(), expires_at: expiresAt.toISOString(),
      }).eq("id", campaign_id);

      return json({ ok: true, scheduled: scheduledItems });
    }

    // ─── CONTINUE: extend by 14 days ───
    if (action === "continue") {
      const days = body.extend_days || 14;
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (!campaign) return json({ error: "Not found" }, 404);

      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + days);

      await supabase.from("smm_artist_campaigns").update({
        status: "active",
        days_total: campaign.days_total + days,
        continued_until: newExpiry.toISOString(),
        expires_at: newExpiry.toISOString(),
      }).eq("id", campaign_id);

      const scheduledItems = await scheduleMediaDays(supabase, campaign, campaign.days_completed, Math.min(days, 7));
      return json({ ok: true, extended_by: days, scheduled: scheduledItems });
    }

    // ─── RESCHEDULE: replace existing posts with updated media list ───
    if (action === "reschedule") {
      const { media_urls } = body;
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (!campaign) return json({ error: "Not found" }, 404);

      // Delete future scheduled posts for this campaign
      await cleanupFuturePosts(supabase, campaign);

      // Reschedule with new media
      const daysLeft = Math.max(1, campaign.days_total - campaign.days_completed);
      const updatedCampaign = { ...campaign, media_urls };
      const scheduledItems = await scheduleMediaDays(supabase, updatedCampaign, 0, Math.min(daysLeft, 7));

      return json({ ok: true, rescheduled: scheduledItems });
    }

    // ─── REMOVE-MEDIA: delete scheduled posts tied to a specific media URL ───
    if (action === "remove-media") {
      const { media_url, remaining_urls } = body;
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (!campaign) return json({ error: "Not found" }, 404);

      // Find all scheduled calendar events for this campaign that use this media
      const jobPrefix = `artist-${campaign_id}-`;
      const { data: events } = await supabase
        .from("calendar_events")
        .select("id, description, source_id")
        .like("source_id", `${jobPrefix}%`);

      let removed = 0;
      for (const evt of events || []) {
        // Check if the description/metadata references this media URL
        if (evt.description?.includes(media_url)) {
          await supabase.from("calendar_events").delete().eq("id", evt.id);
          removed++;
        }
      }

      // If no media left, pause the campaign
      if (!remaining_urls || remaining_urls.length === 0) {
        await supabase.from("smm_artist_campaigns").update({ status: "paused" }).eq("id", campaign_id);
      }

      return json({ ok: true, removed_events: removed });
    }

    // ─── CLEANUP: remove all scheduled posts for a campaign being deleted ───
    if (action === "cleanup") {
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (campaign) await cleanupFuturePosts(supabase, campaign);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

// ─── Helpers ───

async function cleanupFuturePosts(supabase: any, campaign: any) {
  const jobPrefix = `artist-${campaign.id}-`;
  const now = new Date().toISOString();

  await supabase
    .from("calendar_events")
    .delete()
    .like("source_id", `${jobPrefix}%`)
    .gte("start_time", now);
}

async function scheduleMediaDays(
  supabase: any, campaign: any, startOffset: number, totalDays: number,
): Promise<string[]> {
  const scheduledItems: string[] = [];
  const mediaCount = campaign.media_urls?.length || 0;
  if (mediaCount === 0) return scheduledItems;

  const startDate = new Date();

  for (let day = 0; day < totalDays; day++) {
    const postDate = new Date(startDate);
    postDate.setDate(postDate.getDate() + day);
    const dateStr = postDate.toISOString().split("T")[0];
    const dayNumber = startOffset + day + 1;
    const mediaUrl = campaign.media_urls[day % mediaCount];
    const caption = buildCaption(campaign, dayNumber, mediaUrl);

    await supabase.functions.invoke("smm-api", {
      body: {
        action: "schedule",
        profile_username: campaign.profile_username,
        platform: "instagram",
        scheduled_date: `${dateStr}T12:00:00`,
        title: `${campaign.artist_name} - ${campaign.song_title} (Day ${dayNumber})`,
        description: caption,
        media_url: mediaUrl,
        job_id: `artist-${campaign.id}-day${dayNumber}`,
      },
    });

    scheduledItems.push(`Day ${dayNumber}: ${dateStr}`);

    if (day < totalDays - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return scheduledItems;
}

function buildCaption(campaign: any, dayNumber: number, mediaUrl?: string): string {
  const handle = campaign.artist_handle;
  const song = campaign.song_title;

  // Embed media URL in description for metadata persistence
  const mediaMeta = mediaUrl ? `\n[media_url:${mediaUrl}]` : '';

  const templates = [
    `🎶 ${song} by ${handle} — comment "Nyson Black" for the free download 🎁`,
    `🔥 New heat from ${handle} — "${song}" 🎵 Drop a 🔥 or 💩 below`,
    `${handle} just dropped "${song}" 🎶 Comment "Nyson Black" for a free song 🎁`,
    `Rate this track by ${handle}: "${song}" 🔥 or 💩? #NysonBlack #NewMusic`,
    `"${song}" — ${handle} 🎵 Comment "Nyson Black" to get this track free 🎁`,
    `Check out "${song}" by ${handle} 🎶 Is it 🔥 or 💩? #ShareTheVibes`,
    `${handle} with "${song}" — the vibes are unmatched 🎵 Free download: comment "Nyson Black" 🎁`,
  ];

  return templates[(dayNumber - 1) % templates.length] + mediaMeta;
}
