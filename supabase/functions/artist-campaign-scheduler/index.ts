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

    // ─── SCHEDULE: initial campaign ───
    if (action === "schedule") {
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (!campaign) return json({ error: "Campaign not found" }, 404);

      if (!campaign.media_urls || campaign.media_urls.length === 0) {
        await supabase.from("smm_artist_campaigns").update({ status: "paused" }).eq("id", campaign_id);
        return json({ error: "No media — campaign paused" }, 400);
      }

      // Cap active campaigns at 10
      const { count: activeCount } = await supabase
        .from("smm_artist_campaigns").select("id", { count: "exact", head: true })
        .eq("profile_username", campaign.profile_username).eq("status", "active");

      if ((activeCount || 0) >= 10) {
        const { data: oldest } = await supabase
          .from("smm_artist_campaigns").select("id")
          .eq("profile_username", campaign.profile_username).eq("status", "active")
          .order("started_at", { ascending: true }).limit(1).single();
        if (oldest) await supabase.from("smm_artist_campaigns").update({ status: "expired" }).eq("id", oldest.id);
      }

      const pattern = campaign.schedule_pattern || "daily";
      const platforms = campaign.platforms || ["instagram"];
      const scheduledItems = await scheduleMediaDays(supabase, campaign, 0, campaign.days_total, pattern, platforms);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + campaign.days_total);

      await supabase.from("smm_artist_campaigns").update({
        status: "active", started_at: new Date().toISOString(), expires_at: expiresAt.toISOString(),
      }).eq("id", campaign_id);

      return json({ ok: true, scheduled: scheduledItems });
    }

    // ─── CONTINUE: extend campaign ───
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

      const pattern = campaign.schedule_pattern || "daily";
      const platforms = campaign.platforms || ["instagram"];
      const scheduledItems = await scheduleMediaDays(supabase, campaign, campaign.days_completed, Math.min(days, 7), pattern, platforms);
      return json({ ok: true, extended_by: days, scheduled: scheduledItems });
    }

    // ─── RESCHEDULE ───
    if (action === "reschedule") {
      const { media_urls } = body;
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (!campaign) return json({ error: "Not found" }, 404);

      await cleanupFuturePosts(supabase, campaign);

      const daysLeft = Math.max(1, campaign.days_total - campaign.days_completed);
      const updatedCampaign = { ...campaign, media_urls };
      const pattern = campaign.schedule_pattern || "daily";
      const platforms = campaign.platforms || ["instagram"];
      const scheduledItems = await scheduleMediaDays(supabase, updatedCampaign, 0, Math.min(daysLeft, 7), pattern, platforms);

      return json({ ok: true, rescheduled: scheduledItems });
    }

    // ─── REMOVE-MEDIA ───
    if (action === "remove-media") {
      const { media_url, remaining_urls } = body;
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (!campaign) return json({ error: "Not found" }, 404);

      const jobPrefix = `artist-${campaign_id}-`;
      const { data: events } = await supabase
        .from("calendar_events")
        .select("id, description, source_id")
        .like("source_id", `${jobPrefix}%`);

      let removed = 0;
      for (const evt of events || []) {
        if (evt.description?.includes(media_url)) {
          await supabase.from("calendar_events").delete().eq("id", evt.id);
          removed++;
        }
      }

      if (!remaining_urls || remaining_urls.length === 0) {
        await supabase.from("smm_artist_campaigns").update({ status: "paused" }).eq("id", campaign_id);
      }

      return json({ ok: true, removed_events: removed });
    }

    // ─── CLEANUP ───
    if (action === "cleanup") {
      const { data: campaign } = await supabase
        .from("smm_artist_campaigns").select("*").eq("id", campaign_id).single();
      if (campaign) await cleanupFuturePosts(supabase, campaign);
      return json({ ok: true });
    }

    // ─── FILL-ROTATION: ensure 4-6 posts/day for next 7 days across all active artists ───
    if (action === "fill-rotation") {
      const profileUsername = body.profile_username || "NysonBlack";
      const daysAhead = body.days || 7;
      const postsPerDay = body.posts_per_day || 5;

      const { data: activeCampaigns } = await supabase
        .from("smm_artist_campaigns")
        .select("*")
        .eq("profile_username", profileUsername)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (!activeCampaigns || activeCampaigns.length === 0) {
        return json({ error: "No active campaigns found" }, 400);
      }

      // Time slots for posts throughout the day (spread 9am-9pm)
      const TIME_SLOTS = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];

      const scheduled: string[] = [];
      const today = new Date();

      for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
        const postDate = new Date(today);
        postDate.setDate(postDate.getDate() + dayOffset);
        const dateStr = postDate.toISOString().split("T")[0];

        // Rotate artist order each day so lead artist changes
        const rotationOffset = dayOffset % activeCampaigns.length;
        const rotatedCampaigns = [
          ...activeCampaigns.slice(rotationOffset),
          ...activeCampaigns.slice(0, rotationOffset),
        ];

        // Pick up to postsPerDay artists for this day
        const dailyArtists = rotatedCampaigns.slice(0, Math.min(postsPerDay, rotatedCampaigns.length));

        for (let slotIdx = 0; slotIdx < dailyArtists.length; slotIdx++) {
          const campaign = dailyArtists[slotIdx];
          const mediaCount = campaign.media_urls?.length || 0;
          if (mediaCount === 0) continue;

          const timeSlot = TIME_SLOTS[slotIdx % TIME_SLOTS.length];
          const platforms = campaign.platforms || ["instagram"];

          // Use a global day counter for media rotation across days
          const globalDayIndex = campaign.days_completed + dayOffset;
          const mediaUrl = campaign.media_urls[globalDayIndex % mediaCount];
          const caption = buildCaption(campaign, globalDayIndex + 1, mediaUrl);
          const title = `${campaign.artist_name} - ${campaign.song_title} (Day ${globalDayIndex + 1})`;

          for (const platform of platforms) {
            const platformSuffix = platforms.length > 1 ? `-${platform.slice(0, 2)}` : "";
            const sourceId = `rotation-${campaign.id}-d${dayOffset + 1}-s${slotIdx + 1}${platformSuffix}`;

            // Check for existing event
            const { data: existing } = await supabase
              .from("calendar_events")
              .select("id")
              .eq("source", "smm")
              .eq("source_id", sourceId)
              .maybeSingle();

            if (!existing) {
              const { error } = await supabase.from("calendar_events").insert({
                title: `[${platform.toUpperCase()}] ${title}`,
                description: `${caption}\nMedia URL: ${mediaUrl}\nProfile: ${profileUsername}`,
                start_time: `${dateStr}T${timeSlot}:00+00:00`,
                source: "smm",
                source_id: sourceId,
                all_day: false,
                category: "artist-campaign",
              });

              if (error) {
                console.error(`[fill-rotation] insert error for ${sourceId}:`, error.message);
              }
            }

            scheduled.push(`${dateStr} ${timeSlot} [${platform}] ${campaign.artist_name}`);
          }

          // Small delay between inserts
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      return json({ ok: true, scheduled, total: scheduled.length });
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

/**
 * Generate dates based on schedule_pattern.
 * - "daily": consecutive days
 * - "biweekly-tue-fri": every other Tuesday + every other Friday
 */
function generateScheduleDates(
  startDate: Date, totalSlots: number, pattern: string,
): Date[] {
  if (pattern === "biweekly-tue-fri") {
    const dates: Date[] = [];
    // Find the next Tuesday and next Friday from startDate
    const cursor = new Date(startDate);

    // Collect alternating Tuesdays (day 2) and Fridays (day 5)
    // "every other" means skip one occurrence between each
    let tuesdayCount = 0;
    let fridayCount = 0;

    // Scan forward up to 400 days to fill slots
    for (let d = 0; d < 400 && dates.length < totalSlots; d++) {
      const check = new Date(startDate);
      check.setDate(check.getDate() + d);
      const dow = check.getDay();

      if (dow === 2) { // Tuesday
        tuesdayCount++;
        if (tuesdayCount % 2 === 1) { // every other (1st, 3rd, 5th...)
          dates.push(new Date(check));
        }
      } else if (dow === 5) { // Friday
        fridayCount++;
        if (fridayCount % 2 === 1) {
          dates.push(new Date(check));
        }
      }
    }

    // Sort chronologically
    dates.sort((a, b) => a.getTime() - b.getTime());
    return dates.slice(0, totalSlots);
  }

  // Default: daily
  const dates: Date[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

async function scheduleMediaDays(
  supabase: any, campaign: any, startOffset: number, totalSlots: number,
  pattern: string, platforms: string[],
): Promise<string[]> {
  const scheduledItems: string[] = [];
  const mediaCount = campaign.media_urls?.length || 0;
  if (mediaCount === 0) return scheduledItems;

  const startDate = new Date();
  const dates = generateScheduleDates(startDate, totalSlots, pattern);

  let postIndex = 0;
  for (const postDate of dates) {
    const dateStr = postDate.toISOString().split("T")[0];
    const postNumber = startOffset + postIndex + 1;
    const mediaUrl = campaign.media_urls[postIndex % mediaCount];
    const caption = buildCaption(campaign, postNumber, mediaUrl);
    const title = `${campaign.artist_name} - ${campaign.song_title} (Day ${postNumber})`;

    for (const platform of platforms) {
      const platformSuffix = platforms.length > 1 ? `-${platform.slice(0, 2)}` : "";
      const sourceId = `artist-${campaign.id}-day${postNumber}${platformSuffix}`;

      // Check if this event already exists to avoid duplicates
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id")
        .eq("source", "smm")
        .eq("source_id", sourceId)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("calendar_events").insert({
          title: `[${platform.toUpperCase()}] ${title}`,
          description: `${caption}\nMedia URL: ${mediaUrl}\nProfile: ${campaign.profile_username}`,
          start_time: `${dateStr}T12:00:00+00:00`,
          source: "smm",
          source_id: sourceId,
          all_day: false,
          category: "artist-campaign",
        });

        if (error) {
          console.error(`[artist-scheduler] calendar insert error for ${sourceId}:`, error.message);
        }
      }

      scheduledItems.push(`Day ${postNumber}: ${dateStr} [${platform}]`);

      // Small delay between inserts
      await new Promise((r) => setTimeout(r, 500));
    }

    postIndex++;
  }

  return scheduledItems;
}

function buildCaption(campaign: any, dayNumber: number, mediaUrl?: string): string {
  const handle = campaign.artist_handle;
  const song = campaign.song_title;
  const mediaMeta = mediaUrl ? `\n[media_url:${mediaUrl}]` : "";

  const templates = [
    `🎶 ${song} by ${handle} — comment "Nyson Black" for the free download 🎁`,
    `🔥 New heat from ${handle} — "${song}" 🎵 Drop a 🔥 or 💩 below`,
    `${handle} just dropped "${song}" 🎶 Comment "Nyson Black" for a free song 🎁`,
    `Rate this track by ${handle}: "${song}" 🔥 or 💩? #NysonBlack #NewMusic`,
    `"${song}" — ${handle} 🎵 Comment "Nyson Black" to get this track free 🎁`,
    `Check out "${song}" by ${handle} 🎶 Is it 🔥 or 💩? #ShareTheVibes`,
    `${handle} with "${song}" — the vibes are unmatched 🎵 Free download: comment "Nyson Black" 🎁`,
    `💿 ${handle} — "${song}" is on repeat 🔁 Comment "Nyson Black" for the free DL 🎁`,
    `⚡ Who's rocking with ${handle}? "${song}" is a vibe 🎶 🔥 or 💩?`,
    `🎵 "${song}" by ${handle} — this one hits different 🎧 Comment "Nyson Black" for the free track!`,
    `🚀 ${handle} ain't slowing down — "${song}" 🔥 Rate it below!`,
    `🎤 ${handle} delivered on "${song}" 🎶 Comment "Nyson Black" = free download 🎁`,
    `Put your headphones on for this one 🎧 "${song}" by ${handle} 🔥 or 💩?`,
    `🔊 "${song}" — ${handle} going crazy 🎵 Drop "Nyson Black" for the free song 🎁`,
    `Is ${handle} next up? 🤔 Listen to "${song}" and tell us 🔥 or 💩`,
    `🎹 Vibes on vibes — "${song}" by ${handle} 🎶 Free download: comment "Nyson Black" 🎁`,
    `${handle} snapped on "${song}" 🔥🎵 What do you think? Drop a 🔥 or 💩`,
    `💎 Hidden gem alert: "${song}" by ${handle} 🎶 Comment "Nyson Black" for free 🎁`,
    `🌊 Wave check — "${song}" by ${handle} 🎵 Is this 🔥 or 💩?`,
    `This track by ${handle} is something else 🎶 "${song}" — Comment "Nyson Black" for a free copy 🎁`,
    `🎧 Late night vibes with "${song}" by ${handle} 🎵 🔥 or 💩? Let us know!`,
    `${handle} keeps delivering 🔥 "${song}" — Comment "Nyson Black" for the free download 🎁`,
    `📱 Share "${song}" by ${handle} with someone who needs to hear it 🎶 #NysonBlack`,
    `🎵 Can't stop playing "${song}" by ${handle} — Drop "Nyson Black" for the free track 🎁`,
    `${handle} going up 📈 "${song}" is proof 🎶 Rate it: 🔥 or 💩?`,
  ];

  return templates[(dayNumber - 1) % templates.length] + mediaMeta;
}
