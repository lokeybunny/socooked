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

    // Collect unique discord channel IDs from any config that has one
    const channelConfigs: { channelId: string; section: string; cfg: any }[] = [];
    for (const row of configs) {
      const cfg = row.content as any;
      if (cfg?.enabled && cfg?.discord_channel_id) {
        channelConfigs.push({ channelId: String(cfg.discord_channel_id), section: row.section, cfg });
      }
    }

    if (channelConfigs.length === 0) return json({ ok: true, skipped: true, reason: "No channels configured" });

    // Deduplicate channels
    const seenChannels = new Set<string>();
    const uniqueChannels: { channelId: string; section: string; cfg: any }[] = [];
    for (const cc of channelConfigs) {
      if (!seenChannels.has(cc.channelId)) {
        seenChannels.add(cc.channelId);
        uniqueChannels.push(cc);
      }
    }

    // Collect campaign info from first enabled config (for the copy text)
    const firstEnabled = configs.find((r: any) => (r.content as any)?.enabled);
    const campaignUrl = (firstEnabled?.content as any)?.campaign_url || "";
    const ticker = (firstEnabled?.content as any)?.ticker || "";

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
        if (!newestId || BigInt(msg.id) > BigInt(newestId)) {
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
          .eq("action", "telegram-notified")
          .like("meta->>discord_msg_id", msg.id)
          .limit(1);

        if (existing?.length) continue;

        for (const tweetUrl of matches) {
          const discordAuthor = msg.author?.username || "unknown";

          // ── 1) Send Telegram notification ──
          const tgText = `🔍 *New Tweet from Discord*\n\n` +
            `👤 Posted by: \`${discordAuthor}\`\n` +
            `🔗 ${tweetUrl}\n\n` +
            `Tap below to open the tweet and get your shill copy.`;

          const inlineKeyboard = {
            inline_keyboard: [
              [{ text: "🚀 SHILL NOW", url: tweetUrl }],
              [{ text: "📋 Get Shill Copy", callback_data: `shill_copy` }],
            ],
          };

          try {
            await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: TELEGRAM_CHAT_ID,
                  text: tgText,
                  parse_mode: "Markdown",
                  reply_markup: inlineKeyboard,
                }),
              }
            );
          } catch (e) {
            console.error("[discord-watcher] Telegram send error:", e);
          }

          // ── 2) Send Discord reply in same channel with buttons ──
          const tickerClean = ticker.replace(/^\$/, "");
          const copyText = `${ticker} #${tickerClean} #crypto` +
            (campaignUrl ? `\n${campaignUrl}` : "");

          const discordEmbed = {
            title: "🔍 New Tweet Detected",
            description: `**Posted by:** ${discordAuthor}\n[Open Tweet](${tweetUrl})`,
            color: 0x1DA1F2,
          };

          const discordComponents = [
            {
              type: 1, // ActionRow
              components: [
                { type: 2, style: 5, label: "🚀 SHILL NOW", url: tweetUrl }, // Link button
                { type: 2, style: 2, label: "📋 Get Shill Copy", custom_id: `shill_copy_${msg.id}` }, // Secondary button
              ],
            },
          ];

          try {
            await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
              method: "POST",
              headers: {
                Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                embeds: [discordEmbed],
                components: discordComponents,
              }),
            });
          } catch (e) {
            console.error("[discord-watcher] Discord reply error:", e);
          }

          totalForwarded++;
          } catch (e) {
            console.error("[discord-watcher] Telegram send error:", e);
          }

          // Log to activity_log for dedup
          await supabase.from("activity_log").insert({
            entity_type: "auto-shill",
            action: "telegram-notified",
            meta: {
              discord_msg_id: msg.id,
              discord_author: discordAuthor,
              tweet_url: tweetUrl,
            },
          });
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

    return json({ ok: true, forwarded: totalForwarded });
  } catch (err) {
    console.error("[discord-watcher] Fatal error:", err);
    return json({ error: String(err) }, 500);
  }
});
