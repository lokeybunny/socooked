import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const DISCORD_API = "https://discord.com/api/v10";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
  const BOT_SECRET = Deno.env.get("BOT_SECRET")!;
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

  if (!DISCORD_BOT_TOKEN)
    return json({ error: "DISCORD_BOT_TOKEN not configured" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Load all auto-shill configs
    const { data: configs } = await supabase
      .from("site_configs")
      .select("content, section")
      .eq("site_id", "smm-auto-shill");

    if (!configs?.length) return json({ ok: true, skipped: true, reason: "No configs" });

    // Collect all enabled profiles (these will each receive forwarded tweets)
    const enabledProfiles = configs
      .filter((row: any) => (row.content as any)?.enabled)
      .map((row: any) => row.section);

    // Collect unique discord channel IDs from any config that has one
    const channelConfigs: { channelId: string; section: string; cfg: any }[] = [];
    for (const row of configs) {
      const cfg = row.content as any;
      if (cfg?.enabled && cfg?.discord_channel_id) {
        channelConfigs.push({ channelId: String(cfg.discord_channel_id), section: row.section, cfg });
      }
    }

    if (channelConfigs.length === 0) return json({ ok: true, skipped: true, reason: "No channels configured" });

    // Deduplicate channels (multiple profiles might share a channel)
    const seenChannels = new Set<string>();
    const uniqueChannels: { channelId: string; section: string; cfg: any }[] = [];
    for (const cc of channelConfigs) {
      if (!seenChannels.has(cc.channelId)) {
        seenChannels.add(cc.channelId);
        uniqueChannels.push(cc);
      }
    }

    let totalForwarded = 0;

    for (const { channelId, section: ownerSection, cfg } of uniqueChannels) {
      const lastMessageId = cfg.last_message_id || null;

      // Fetch recent messages from Discord channel
      let url = `${DISCORD_API}/channels/${channelId}/messages?limit=50`;
      if (lastMessageId) url += `&after=${lastMessageId}`;

      const discordRes = await fetch(url, {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      });

      if (!discordRes.ok) {
        const errText = await discordRes.text();
        console.error(
          `[discord-watcher] Failed to fetch channel ${channelId}: ${discordRes.status} ${errText}`
        );
        continue;
      }

      const messages: any[] = await discordRes.json();
      if (!messages.length) continue;

      // Sort oldest-first so we process in order
      messages.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const xUrlRegex = /https?:\/\/(x\.com|twitter\.com)\/\S+/gi;
      let newestId = lastMessageId;

      for (const msg of messages) {
        // Track newest message ID regardless
        if (
          !newestId ||
          BigInt(msg.id) > BigInt(newestId)
        ) {
          newestId = msg.id;
        }

        // Extract X/Twitter URLs from message content
        const matches = msg.content?.match(xUrlRegex);
        if (!matches?.length) continue;

        // Deduplicate: check if we already forwarded this exact message
        const { data: existing } = await supabase
          .from("activity_log")
          .select("id")
          .eq("entity_type", "auto-shill")
          .eq("action", "received")
          .like("meta->>discord_msg_id", msg.id)
          .limit(1);

        if (existing?.length) continue;

        for (const tweetUrl of matches) {
          // Forward to ALL enabled profiles (not just the channel owner)
          for (const targetProfile of enabledProfiles) {
            const ingestUrl = `${SUPABASE_URL}/functions/v1/smm-auto-shill?action=ingest`;
            const ingestRes = await fetch(ingestUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-bot-secret": BOT_SECRET,
              },
              body: JSON.stringify({
                tweet_url: tweetUrl,
                profile_username: targetProfile,
                discord_msg_id: msg.id,
                discord_author: msg.author?.username || "unknown",
                is_bot: msg.author?.bot === true,
              }),
            });

            const ingestData = await ingestRes.json().catch(() => ({}));
            console.log(
              `[discord-watcher] Forwarded ${tweetUrl} for ${targetProfile}: ${JSON.stringify(ingestData)}`
            );
            totalForwarded++;
          }
        }
      }

      // Update last_message_id in config so we don't re-process
      if (newestId && newestId !== lastMessageId) {
        await supabase
          .from("site_configs")
          .update({
            content: { ...cfg, last_message_id: newestId },
          })
          .eq("site_id", "smm-auto-shill")
          .eq("section", ownerSection);
      }
    }

    // Notify Telegram if we forwarded anything
    if (totalForwarded > 0) {
      try {
        await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: TELEGRAM_CHAT_ID,
              text: `🔍 *Discord Watcher*\n📥 Forwarded ${totalForwarded} X link(s) to ${enabledProfiles.length} profile(s)`,
              parse_mode: "Markdown",
            }),
          }
        );
      } catch (e) {
        console.error("[discord-watcher] Telegram notify error:", e);
      }
    }

    return json({ ok: true, forwarded: totalForwarded, profiles: enabledProfiles.length });
  } catch (err) {
    console.error("[discord-watcher] Fatal error:", err);
    return json({ error: String(err) }, 500);
  }
});
