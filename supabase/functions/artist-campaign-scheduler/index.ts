import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { action, campaign_id, extend_days } = await req.json();

    if (action === "schedule") {
      // Fetch the campaign
      const { data: campaign, error: fetchErr } = await supabase
        .from("smm_artist_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .single();

      if (fetchErr || !campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Count current active campaigns for this profile
      const { count: activeCount } = await supabase
        .from("smm_artist_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("profile_username", campaign.profile_username)
        .eq("status", "active");

      // Allow up to 5 active slots (4 base + 1 temporary)
      if ((activeCount || 0) >= 5) {
        // Find the oldest active campaign and expire it
        const { data: oldest } = await supabase
          .from("smm_artist_campaigns")
          .select("id")
          .eq("profile_username", campaign.profile_username)
          .eq("status", "active")
          .order("started_at", { ascending: true })
          .limit(1)
          .single();

        if (oldest) {
          await supabase
            .from("smm_artist_campaigns")
            .update({ status: "expired" })
            .eq("id", oldest.id);
        }
      }

      // Schedule 7 days of content via the smm-api
      const startDate = new Date();
      const scheduledItems: string[] = [];

      for (let day = 0; day < campaign.days_total; day++) {
        const postDate = new Date(startDate);
        postDate.setDate(postDate.getDate() + day);

        const dateStr = postDate.toISOString().split("T")[0];
        const caption = buildCaption(campaign, day + 1);
        const mediaUrl = campaign.media_urls[day % campaign.media_urls.length] || "";

        // Schedule via smm-api
        const scheduleRes = await supabase.functions.invoke("smm-api", {
          body: {
            action: "schedule",
            profile_username: campaign.profile_username,
            platform: "instagram",
            scheduled_date: `${dateStr}T12:00:00`,
            title: `${campaign.artist_name} - ${campaign.song_title} (Day ${day + 1})`,
            description: caption,
            media_url: mediaUrl,
            job_id: `artist-${campaign.id}-day${day + 1}`,
          },
        });

        scheduledItems.push(`Day ${day + 1}: ${dateStr}`);

        // Throttle to avoid rate limits
        if (day < campaign.days_total - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      // Update campaign status to active
      const expiresAt = new Date(startDate);
      expiresAt.setDate(expiresAt.getDate() + campaign.days_total);

      await supabase
        .from("smm_artist_campaigns")
        .update({
          status: "active",
          started_at: startDate.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq("id", campaign_id);

      return new Response(
        JSON.stringify({ ok: true, scheduled: scheduledItems }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "continue") {
      const days = extend_days || 30;

      const { data: campaign } = await supabase
        .from("smm_artist_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .single();

      if (!campaign) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extend expiry
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + days);

      await supabase
        .from("smm_artist_campaigns")
        .update({
          status: "active",
          days_total: campaign.days_total + days,
          continued_until: newExpiry.toISOString(),
          expires_at: newExpiry.toISOString(),
        })
        .eq("id", campaign_id);

      // Schedule the extended days
      const startDate = new Date();
      for (let day = 0; day < Math.min(days, 7); day++) {
        const postDate = new Date(startDate);
        postDate.setDate(postDate.getDate() + day);
        const dateStr = postDate.toISOString().split("T")[0];
        const caption = buildCaption(campaign, campaign.days_completed + day + 1);
        const mediaUrl = campaign.media_urls[day % campaign.media_urls.length] || "";

        await supabase.functions.invoke("smm-api", {
          body: {
            action: "schedule",
            profile_username: campaign.profile_username,
            platform: "instagram",
            scheduled_date: `${dateStr}T12:00:00`,
            title: `${campaign.artist_name} - ${campaign.song_title} (Day ${campaign.days_completed + day + 1})`,
            description: caption,
            media_url: mediaUrl,
            job_id: `artist-${campaign.id}-day${campaign.days_completed + day + 1}`,
          },
        });

        if (day < Math.min(days, 7) - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      return new Response(
        JSON.stringify({ ok: true, extended_by: days }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildCaption(campaign: any, dayNumber: number): string {
  const handle = campaign.artist_handle;
  const song = campaign.song_title;

  const templates = [
    `🎶 ${song} by ${handle} — comment "Nyson Black" for the free download 🎁`,
    `🔥 New heat from ${handle} — "${song}" 🎵 Drop a 🔥 or 💩 below`,
    `${handle} just dropped "${song}" 🎶 Comment "Nyson Black" for a free song 🎁`,
    `Rate this track by ${handle}: "${song}" 🔥 or 💩? #NysonBlack #NewMusic`,
    `"${song}" — ${handle} 🎵 Comment "Nyson Black" to get this track free 🎁`,
    `Check out "${song}" by ${handle} 🎶 Is it 🔥 or 💩? #ShareTheVibes`,
    `${handle} with "${song}" — the vibes are unmatched 🎵 Free download: comment "Nyson Black" 🎁`,
  ];

  return templates[(dayNumber - 1) % templates.length];
}
