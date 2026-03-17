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
    
    const now = new Date();
    // Normal mode: 20-min lookback. Catch-up mode: look back 24 hours
    const lookbackMs = catchUp ? 24 * 60 * 60 * 1000 : 20 * 60 * 1000;
    const windowStart = new Date(now.getTime() - lookbackMs).toISOString();
    const windowEnd = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

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

    console.log(`[smm-auto-publish] Found ${unpublished.length} events to publish`);

    const results: string[] = [];

    for (const event of unpublished) {
      try {
        // Extract media URL from description
        const mediaMatch = event.description?.match(/Media URL:\s*(https?:\/\/\S+)/i);
        const mediaUrl = mediaMatch?.[1]?.trim();

        if (!mediaUrl) {
          console.log(`[smm-auto-publish] Skipping event ${event.id} — no media URL found`);
          results.push(`${event.title}: SKIPPED (no media)`);
          continue;
        }

        // Extract profile from description or default to NysonBlack
        const profileMatch = event.description?.match(/Profile:\s*(\S+)/i);
        const profileUsername = profileMatch?.[1] || "NysonBlack";

        // Build caption from description — strip metadata lines
        let caption = event.description || event.title || "";
        // Remove metadata lines
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

        // Determine platforms — publish to both Instagram and TikTok
        const platforms = ["instagram", "tiktok"];

        console.log(`[smm-auto-publish] Publishing: "${event.title}" via ${uploadAction} to ${platforms.join(", ")}`);

        // Call smm-api to upload
        const uploadRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ANON_KEY}`,
            "apikey": ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: uploadAction,
            profile_username: profileUsername,
            "platform[]": platforms,
            title: caption,
            media_url: mediaUrl,
            ...(isVideo ? { ig_post_type: "reels", share_to_feed: "true" } : {}),
          }),
        });

        const uploadText = await uploadRes.text();
        console.log(`[smm-auto-publish] Upload response (${uploadRes.status}):`, uploadText.substring(0, 300));

        if (uploadRes.ok) {
          // Mark as published by updating source_id
          await supabase
            .from("calendar_events")
            .update({ source_id: `published-${event.source_id || event.id}` })
            .eq("id", event.id);

          results.push(`${event.title}: PUBLISHED ✅`);

          // Log activity
          await supabase.from("activity_log").insert({
            entity_type: "smm",
            action: "auto_published",
            meta: { name: `📤 Auto-published: ${event.title}`, profile: profileUsername, platforms },
          });
        } else {
          results.push(`${event.title}: FAILED (${uploadRes.status})`);
          console.error(`[smm-auto-publish] Failed for ${event.id}:`, uploadText.substring(0, 300));

          // Send failure notification via telegram
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
                meta: {
                  name: `🚨 Auto-publish FAILED: ${event.title}`,
                  error: uploadText.substring(0, 200),
                },
                created_at: new Date().toISOString(),
              },
            }),
          });
        }

        // Throttle between uploads (8 second spacing per rate limit rules)
        if (unpublished.indexOf(event) < unpublished.length - 1) {
          await new Promise(r => setTimeout(r, 8000));
        }
      } catch (eventErr) {
        console.error(`[smm-auto-publish] Error processing event ${event.id}:`, eventErr);
        results.push(`${event.title}: ERROR (${(eventErr as Error).message})`);
      }
    }

    return json({ ok: true, published: results.filter(r => r.includes("PUBLISHED")).length, results });
  } catch (err) {
    console.error("[smm-auto-publish] Fatal error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
