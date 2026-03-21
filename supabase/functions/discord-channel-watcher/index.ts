import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const DISCORD_API = "https://discord.com/api/v10";
const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Delete expired bot messages that weren't interacted with */
async function cleanupExpiredMessages(supabase: any, botToken: string) {
  const cutoff = new Date(Date.now() - EXPIRY_MS).toISOString();

  const { data: expired } = await supabase
    .from("activity_log")
    .select("id, meta")
    .eq("entity_type", "shill-bot-msg")
    .eq("action", "pending")
    .lt("created_at", cutoff)
    .limit(50);

  if (!expired?.length) return 0;

  let deleted = 0;
  for (const row of expired) {
    const { channel_id, bot_message_id } = row.meta as any;
    if (channel_id && bot_message_id) {
      try {
        const res = await fetch(
          `${DISCORD_API}/channels/${channel_id}/messages/${bot_message_id}`,
          { method: "DELETE", headers: { Authorization: `Bot ${botToken}` } }
        );
        if (res.ok || res.status === 404) deleted++;
      } catch (e) {
        console.error("[discord-watcher] Delete error:", e);
      }
    }
    // Mark as expired regardless
    await supabase
      .from("activity_log")
      .update({ action: "expired" })
      .eq("id", row.id);
  }
  return deleted;
}

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
    // ── Step 0: Cleanup expired bot messages ──
    const expiredCount = await cleanupExpiredMessages(supabase, DISCORD_BOT_TOKEN);

    // Load all auto-shill configs
    const { data: configs } = await supabase
      .from("site_configs")
      .select("content, section")
      .eq("site_id", "smm-auto-shill");

    if (!configs?.length) return json({ ok: true, skipped: true, reason: "No configs", expired: expiredCount });

    // Collect discord channel configs — supports separate listen & reply channels
    const channelConfigs: { listenChannelId: string; replyChannelId: string; section: string; cfg: any }[] = [];
    for (const row of configs) {
      const cfg = row.content as any;
      // discord_channel_id = listen channel, discord_reply_channel_id = where bot posts (falls back to listen channel)
      const listenId = cfg?.discord_listen_channel_id || cfg?.discord_channel_id;
      if (cfg?.enabled && listenId) {
        channelConfigs.push({
          listenChannelId: String(listenId),
          replyChannelId: String(cfg?.discord_reply_channel_id || cfg?.discord_channel_id || listenId),
          section: row.section,
          cfg,
        });
      }
    }

    if (channelConfigs.length === 0) return json({ ok: true, skipped: true, reason: "No channels configured", expired: expiredCount });

    // Deduplicate by listen channel
    const seenChannels = new Set<string>();
    const uniqueChannels: { listenChannelId: string; replyChannelId: string; section: string; cfg: any }[] = [];
    for (const cc of channelConfigs) {
      if (!seenChannels.has(cc.listenChannelId)) {
        seenChannels.add(cc.listenChannelId);
        uniqueChannels.push(cc);
      }
    }

    // Collect campaign info from first enabled config (for the copy text)
    const firstEnabled = configs.find((r: any) => (r.content as any)?.enabled);
    const campaignUrl = (firstEnabled?.content as any)?.campaign_url || "";
    const ticker = (firstEnabled?.content as any)?.ticker || "";

    let totalForwarded = 0;

    for (const { listenChannelId, replyChannelId, section: ownerSection, cfg } of uniqueChannels) {
      const lastMessageId = cfg.last_message_id || null;

      // Fetch recent messages from the LISTEN channel
      let url = `${DISCORD_API}/channels/${listenChannelId}/messages?limit=50`;
      if (lastMessageId) url += `&after=${lastMessageId}`;

      let discordRes = await fetch(url, {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      });

      // If fetch fails with a lastMessageId, it may be stale. Retry without it.
      if (lastMessageId && (!discordRes.ok || discordRes.status === 404)) {
        console.warn(`[discord-watcher] Stale last_message_id for channel ${listenChannelId}, resetting`);
        url = `${DISCORD_API}/channels/${listenChannelId}/messages?limit=10`;
        discordRes = await fetch(url, {
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
        });
      }

      if (!discordRes.ok) {
        const errText = await discordRes.text();
        console.error(
          `[discord-watcher] Failed to fetch channel ${listenChannelId}: ${discordRes.status} ${errText}`
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

        // Skip bot messages
        if (msg.author?.bot) continue;

        // Extract X/Twitter URLs from message content
        const rawMatches = msg.content?.match(xUrlRegex);
        if (!rawMatches?.length) continue;

        // Deduplicate URLs within the same message
        const uniqueUrls = [...new Set(rawMatches)];

        // Deduplicate: check if we already forwarded this exact message
        const { count } = await supabase
          .from("activity_log")
          .select("id", { count: "exact", head: true })
          .eq("entity_type", "auto-shill")
          .eq("action", "telegram-notified")
          .filter("meta->>discord_msg_id", "eq", msg.id);

        if ((count ?? 0) > 0) continue;

        for (const tweetUrl of uniqueUrls) {
          const discordAuthor = msg.author?.username || "unknown";

          // Calculate expiry timestamp (5 minutes from now)
          const expiresAt = Math.floor((Date.now() + EXPIRY_MS) / 1000);

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

          // ── 2) Send Discord reply to the REPLY channel ──
          const discordEmbed = {
            title: "🔍 New Tweet Detected",
            description: `**Posted by:** ${discordAuthor}\n[Open Tweet](${tweetUrl})`,
            color: 0x1DA1F2,
            footer: {
              text: "⏱️ This message will self-destruct if no one interacts",
            },
            fields: [
              {
                name: "⏰ Expires",
                value: `<t:${expiresAt}:R>`,
                inline: true,
              },
            ],
          };

          const discordComponents = [
            {
              type: 1, // ActionRow
              components: [
                { type: 2, style: 5, label: "🚀 SHILL NOW", url: tweetUrl },
                { type: 2, style: 2, label: "📋 Get Shill Copy", custom_id: `shill_copy_${msg.id}` },
              ],
            },
          ];

          try {
            console.log(`[discord-watcher] Sending bot reply to REPLY channel ${replyChannelId}`);
            const botReplyRes = await fetch(`${DISCORD_API}/channels/${replyChannelId}/messages`, {
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

            if (botReplyRes.ok) {
              const botMsg = await botReplyRes.json();
              await supabase.from("activity_log").insert({
                entity_type: "shill-bot-msg",
                action: "pending",
                meta: {
                  bot_message_id: botMsg.id,
                  channel_id: replyChannelId,
                  discord_msg_id: msg.id,
                  tweet_url: tweetUrl,
                  expires_at: new Date(expiresAt * 1000).toISOString(),
                },
              });
            } else {
              const errText = await botReplyRes.text();
              console.error(`[discord-watcher] Bot reply failed ${botReplyRes.status}: ${errText}`);
            }
          } catch (e) {
            console.error("[discord-watcher] Discord reply error:", e);
          }

          totalForwarded++;

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

    return json({ ok: true, forwarded: totalForwarded, expired: expiredCount });
  } catch (err) {
    console.error("[discord-watcher] Fatal error:", err);
    return json({ error: String(err) }, 500);
  }
});
