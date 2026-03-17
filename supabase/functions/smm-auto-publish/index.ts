import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const reqBody = await req.json().catch(() => ({}));
    const catchUp = reqBody.catch_up === true;
    const forceAllToday = reqBody.force_all_today === true;
    
    const now = new Date();
    // Normal mode: 20-min lookback. Catch-up mode: look back 24 hours. Force: entire day
    const lookbackMs = (catchUp || forceAllToday) ? 24 * 60 * 60 * 1000 : 20 * 60 * 1000;
    const windowStart = new Date(now.getTime() - lookbackMs).toISOString();
    // Force mode: extend window to end of today (UTC midnight)
    const windowEnd = forceAllToday
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)).toISOString()
      : new Date(now.getTime() + 2 * 60 * 1000).toISOString();

    console.log(`[smm-auto-publish] ${catchUp ? "CATCH-UP" : "Normal"} window: ${windowStart} → ${windowEnd}`);

    // Get SMM calendar events that are due
    const { data: events, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("category", "smm")
      .gte("start_time", windowStart)
      .lte("start_time", windowEnd)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[smm-auto-publish] Query error:", error);
      return json({ error: error.message }, 500);
    }

    if (!events || events.length === 0) {
      console.log("[smm-auto-publish] No events due in window");
      return json({ ok: true, published: 0, message: "No events due" });
    }

    // Filter out already-published events (check if source_id has been marked)
    // We'll use a convention: after publishing, we prepend "published-" to the source_id
    const unpublished = events.filter(e => !e.source_id?.startsWith("published-"));

    if (unpublished.length === 0) {
      console.log("[smm-auto-publish] All due events already published");
      return json({ ok: true, published: 0, message: "All already published" });
    }

    console.log(`[smm-auto-publish] Found ${unpublished.length} unpublished events in window`);

    // CRITICAL: Only publish ONE event per invocation to avoid double-posting
    const event = unpublished[0];
    const results: string[] = [];

    try {
      // Extract media URL from description
      const mediaMatch = event.description?.match(/Media URL:\s*(https?:\/\/\S+)/i);
      const mediaUrl = mediaMatch?.[1]?.trim();

      if (!mediaUrl) {
        console.log(`[smm-auto-publish] Skipping event ${event.id} — no media URL found`);
        return json({ ok: true, published: 0, message: "Skipped — no media URL", remaining: unpublished.length - 1 });
      }

      // Extract profile from description or default to NysonBlack
      const profileMatch = event.description?.match(/Profile:\s*(\S+)/i);
      const profileUsername = profileMatch?.[1] || "NysonBlack";

      // Build caption from description — strip metadata lines
      let caption = event.description || event.title || "";
      caption = caption
        .replace(/Media URL:\s*https?:\/\/\S+/gi, "")
        .replace(/Profile:\s*\S+/gi, "")
        .replace(/Type:\s*\S+/gi, "")
        .replace(/Original Week.*\n?/gi, "")
        .replace(/Recycled from.*\n?/gi, "")
        .replace(/\[media_url:[^\]]*\]/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      // Detect if image or video
      const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(mediaUrl);
      const uploadAction = isVideo ? "upload-video" : "upload-photos";
      const platforms = ["instagram", "tiktok"];

      console.log(`[smm-auto-publish] Publishing 1 of ${unpublished.length}: "${event.title?.substring(0, 60)}" via ${uploadAction}`);

      const smmUrl = `${SUPABASE_URL}/functions/v1/smm-api?action=${uploadAction}`;

      const uploadRes = await fetch(smmUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ANON_KEY}`,
          "apikey": ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: profileUsername,
          "platform[]": platforms,
          title: caption,
          ...(isVideo ? { video: mediaUrl, ig_post_type: "reels", share_to_feed: "true" } : { "photos[]": [mediaUrl] }),
          async_upload: true,
        }),
      });

      const uploadText = await uploadRes.text();
      console.log(`[smm-auto-publish] Upload response (${uploadRes.status}):`, uploadText.substring(0, 300));

      if (uploadRes.ok) {
        await supabase
          .from("calendar_events")
          .update({ source_id: `published-${event.source_id || event.id}` })
          .eq("id", event.id);

        await supabase.from("activity_log").insert({
          entity_type: "smm",
          action: "auto_published",
          meta: { name: `📤 Auto-published: ${event.title}`, profile: profileUsername, platforms },
        });

        // ── Auto-Boost: check if enabled for this profile ──
        try {
          const { data: boostConfig } = await supabase
            .from("site_configs")
            .select("content")
            .eq("site_id", "smm-boost")
            .eq("section", `auto-boost-${profileUsername}`)
            .single();

          const config = boostConfig?.content as { enabled?: boolean; preset_id?: string } | null;
          if (config?.enabled && config?.preset_id) {
            const { data: preset } = await supabase
              .from("smm_boost_presets")
              .select("*")
              .eq("id", config.preset_id)
              .single();

            if (preset && Array.isArray((preset as any).services) && (preset as any).services.length > 0) {
              // Parse upload response to get post URL
              let postUrl: string | null = null;
              try {
                const uploadData = JSON.parse(uploadText);
                // Try to find post URL from the upload response
                postUrl = uploadData?.data?.post_url || uploadData?.data?.permalink || mediaUrl;
              } catch { postUrl = mediaUrl; }

              if (postUrl) {
                console.log(`[smm-auto-publish] Triggering auto-boost with preset "${(preset as any).preset_name}" for ${postUrl}`);
                const boostUrl = `${SUPABASE_URL}/functions/v1/darkside-smm?action=auto-boost`;
                await fetch(boostUrl, {
                  method: "POST",
                  headers: {
                    "apikey": ANON_KEY,
                    "Authorization": `Bearer ${ANON_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    link: postUrl,
                    profile_username: profileUsername,
                    platform: "instagram",
                    services: (preset as any).services.map((s: any) => ({
                      service_id: s.service_id,
                      service_name: s.service_name,
                      quantity: s.quantity,
                    })),
                  }),
                });
                console.log(`[smm-auto-publish] Auto-boost triggered successfully`);
              }
            }
          }
        } catch (boostErr) {
          console.error("[smm-auto-publish] Auto-boost error (non-fatal):", boostErr);
        }

        return json({ ok: true, published: 1, remaining: unpublished.length - 1, title: event.title });
      } else {
        console.error(`[smm-auto-publish] Failed for ${event.id}:`, uploadText.substring(0, 300));

        await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
          method: "POST",
          headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            record: {
              id: crypto.randomUUID(),
              entity_type: "smm",
              entity_id: null,
              action: "failed",
              actor_id: null,
              meta: { name: `🚨 Auto-publish FAILED: ${event.title}`, error: uploadText.substring(0, 200) },
              created_at: new Date().toISOString(),
            },
          }),
        });

        return json({ ok: false, published: 0, error: uploadText.substring(0, 200) }, 500);
      }
    } catch (eventErr) {
      console.error(`[smm-auto-publish] Error processing event ${event.id}:`, eventErr);
      return json({ ok: false, error: (eventErr as Error).message }, 500);
    }
  } catch (err) {
    console.error("[smm-auto-publish] Fatal error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
