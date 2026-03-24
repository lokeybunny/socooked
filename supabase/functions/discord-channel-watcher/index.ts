import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const DISCORD_API = "https://discord.com/api/v10";
const X_API = "https://api.x.com/2";
const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Telegram shill lounge group for forwarding alerts
const TG_SHILL_LOUNGE = "-1002188568751";

// Discord channel to auto-forward to Telegram
const DISCORD_ANNOUNCEMENTS_CHANNEL = "1485107307842109523";

/** Escape dynamic content for Telegram HTML messages */
function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Send a message to the Telegram shill lounge */
async function sendToTelegramLounge(
  botToken: string,
  text: string,
  replyMarkup?: any,
  parseMode: "Markdown" | "HTML" = "Markdown",
) {
  try {
    const body: any = {
      chat_id: TG_SHILL_LOUNGE,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: false,
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`[discord-watcher] TG lounge send failed: ${await res.text()}`);
  } catch (e) {
    console.error("[discord-watcher] TG lounge error:", e);
  }
}

/** Extract tweet ID from an X/Twitter URL */
function extractTweetId(url: string): string | null {
  const m = url.match(/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/);
  return m ? m[1] : null;
}

/** Fetch tweet metrics from X API and store in shill_post_analytics */
async function enrichTweet(supabase: any, tweetUrl: string, discordMsgId: string, bearerToken: string) {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) return;

  try {
    const res = await fetch(
      `${X_API}/tweets/${tweetId}?tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=username,name`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    );
    if (!res.ok) {
      console.error(`[discord-watcher] X API ${res.status}: ${await res.text()}`);
      return;
    }

    const json = await res.json();
    const tweet = json.data;
    if (!tweet) return;

    const metrics = tweet.public_metrics || {};
    const author = json.includes?.users?.[0];

    const { error } = await supabase.from("shill_post_analytics").upsert({
      tweet_id: tweetId,
      tweet_url: tweetUrl,
      author_handle: author?.username || null,
      author_name: author?.name || null,
      text_content: tweet.text || null,
      likes: metrics.like_count || 0,
      retweets: metrics.retweet_count || 0,
      replies: metrics.reply_count || 0,
      views: metrics.impression_count || 0,
      posted_at: tweet.created_at || null,
      discord_msg_id: discordMsgId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tweet_id" });

    if (error) console.error(`[discord-watcher] Failed to upsert analytics:`, error.message);
    else console.log(`[discord-watcher] ✅ Enriched tweet ${tweetId} — ${metrics.like_count}❤️ ${metrics.retweet_count}🔁`);
  } catch (e) {
    console.error("[discord-watcher] Tweet enrich error:", e);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Delete expired bot messages from Discord and mark them in DB */
async function cleanupExpiredMessages(supabase: any, botToken: string) {
  const { data: candidates, error: fetchErr } = await supabase
    .from("activity_log")
    .select("id, meta, created_at")
    .eq("entity_type", "shill-bot-msg")
    .in("action", ["pending", "interacted"])
    .order("created_at", { ascending: true })
    .limit(500);

  if (fetchErr) {
    console.error("[discord-watcher] Cleanup fetch error:", fetchErr.message);
    return 0;
  }
  if (!candidates?.length) return 0;

  const nowMs = Date.now();
  const expired = candidates.filter((row: any) => {
    const meta = row.meta as any;
    const expiryIso = meta?.expires_at;
    const expiresAtMs = expiryIso ? Date.parse(expiryIso) : Date.parse(row.created_at) + EXPIRY_MS;
    return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
  });

  if (!expired.length) return 0;

  console.log(`[discord-watcher] Found ${expired.length} expired bot messages to clean up`);

  let deleted = 0;
  for (const row of expired) {
    const meta = row.meta as any;
    const channelId = meta?.channel_id;
    const botMsgId = meta?.bot_message_id;
    let deleteSucceeded = false;

    if (channelId && botMsgId) {
      try {
        const res = await fetch(
          `${DISCORD_API}/channels/${channelId}/messages/${botMsgId}`,
          { method: "DELETE", headers: { Authorization: `Bot ${botToken}` } }
        );
        if (res.ok || res.status === 404) {
          deleted++;
          deleteSucceeded = true;
          console.log(`[discord-watcher] Deleted bot msg ${botMsgId} from channel ${channelId}`);
        } else {
          const errText = await res.text();
          console.error(`[discord-watcher] Failed to delete msg ${botMsgId}: ${res.status} ${errText}`);
        }
      } catch (e) {
        console.error("[discord-watcher] Delete HTTP error:", e);
      }
    }

    if (!channelId || !botMsgId || deleteSucceeded) {
      const { error: updateErr } = await supabase
        .from("activity_log")
        .update({ action: "expired" })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`[discord-watcher] Failed to mark ${row.id} as expired:`, updateErr.message);
      }
    }
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
  const TWITTER_BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN");

  if (!DISCORD_BOT_TOKEN)
    return json({ error: "DISCORD_BOT_TOKEN not configured" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    let botUserId: string | null = null;
    try {
      const selfRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      });
      if (selfRes.ok) {
        const selfData = await selfRes.json();
        botUserId = typeof selfData?.id === "string" ? selfData.id : null;
      } else {
        console.error(`[discord-watcher] Failed to resolve bot identity: ${selfRes.status} ${await selfRes.text()}`);
      }
    } catch (error) {
      console.error("[discord-watcher] Failed to fetch bot identity:", error);
    }

    // ── Step 0: Cleanup expired bot messages ──
    const expiredCount = await cleanupExpiredMessages(supabase, DISCORD_BOT_TOKEN);
    if (expiredCount > 0) {
      console.log(`[discord-watcher] Cleaned up ${expiredCount} expired messages`);
    }

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

    // Deduplicate by listen channel — prefer configs with a distinct reply channel
    const seenChannels = new Map<string, typeof channelConfigs[0]>();
    for (const cc of channelConfigs) {
      const prev = seenChannels.get(cc.listenChannelId);
      if (!prev) {
        seenChannels.set(cc.listenChannelId, cc);
      } else if (prev.replyChannelId === prev.listenChannelId && cc.replyChannelId !== cc.listenChannelId) {
        // Prefer the config that has a dedicated reply channel
        seenChannels.set(cc.listenChannelId, cc);
      }
    }
    const uniqueChannels = Array.from(seenChannels.values());

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
        console.error(`[discord-watcher] Failed to fetch channel ${listenChannelId}: ${discordRes.status} ${errText}`);
        continue;
      }

      const messages: any[] = await discordRes.json();
      if (!messages.length) continue;

      // Sort oldest-first so we process in order
      messages.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const xUrlRegex = /https?:\/\/(x\.com|twitter\.com)\/\S+/gi;
      let newestId = lastMessageId;

      /** Extract X/Twitter URLs from a Discord message (content + embeds + forwarded/referenced) */
      const extractXUrls = (m: any): string[] => {
        const found: string[] = [];
        const scanMessage = (msg: any) => {
          if (msg.content) {
            const hits = msg.content.match(xUrlRegex);
            if (hits) found.push(...hits);
          }
          if (Array.isArray(msg.embeds)) {
            for (const embed of msg.embeds) {
              for (const prop of [embed.url, embed.description, embed.title]) {
                if (prop) { const h = prop.match(xUrlRegex); if (h) found.push(...h); }
              }
              if (Array.isArray(embed.fields)) {
                for (const f of embed.fields) {
                  const h = (f.value || '').match(xUrlRegex);
                  if (h) found.push(...h);
                }
              }
            }
          }
        };
        // Scan the main message
        scanMessage(m);
        // Scan forwarded / referenced message (Discord forwards include this)
        if (m.referenced_message) {
          scanMessage(m.referenced_message);
        }
        // Some forwarded messages use message_snapshots (newer Discord forward feature)
        if (Array.isArray(m.message_snapshots)) {
          for (const snap of m.message_snapshots) {
            if (snap.message) scanMessage(snap.message);
          }
        }
        return [...new Set(found)];
      };

      for (const msg of messages) {
        if (!newestId || BigInt(msg.id) > BigInt(newestId)) {
          newestId = msg.id;
        }

        if (botUserId && msg.author?.id === botUserId) {
          continue;
        }

        // ── Detect new member joins (Discord system message type 7) and send welcome ──
        if (msg.type === 7 && msg.author) {
          try {
            const welcomeUrl = `${SUPABASE_URL}/functions/v1/smm-auto-shill?action=welcome-member`;
            await fetch(welcomeUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": SERVICE_KEY,
              },
              body: JSON.stringify({
                username: msg.author.global_name || msg.author.username || "new member",
                user_id: msg.author.id,
              }),
            });
            console.log(`[discord-watcher] Welcomed new member: ${msg.author.username}`);
          } catch (e) {
            console.error(`[discord-watcher] Failed to welcome member:`, e);
          }
          continue;
        }

        // Extract X/Twitter URLs from content AND embeds (works for bot posts too)
        const uniqueUrls = extractXUrls(msg);
        if (!uniqueUrls.length) continue;

        // ── DEDUP: check if we already processed this discord message ──
        // Use jsonb containment operator which works reliably on JSONB
        const { data: existing } = await supabase
          .from("activity_log")
          .select("id")
          .eq("entity_type", "auto-shill")
          .eq("action", "telegram-notified")
          .contains("meta", { discord_msg_id: msg.id })
          .limit(1);

        if (existing && existing.length > 0) {
          continue; // Already processed this message
        }

        // ═══ RAID COMMUNITY AUTO-POST ═══
        // Any WhiteHouse-related content triggers community posts.
        // Direct @whitehouse posts bypass throttle; other WH content uses 10 min cooldown.
        const RAID_COMMUNITY_SOURCE = "1484699554271072257";
        const X_COMMUNITY_ID = "2029596385180291485";
        const WHITEHOUSE_CA = "7oXNE1dbpHUp6dn1JF8pRgCtzfCy4P2FuBneWjZHpump";

        if (listenChannelId === RAID_COMMUNITY_SOURCE && uniqueUrls.length > 0) {
          // Filter out posts from @warrenguru to avoid double-posting (Warren posts + bot reposts)
          const filteredUrls = uniqueUrls.filter(u => !/x\.com\/warrenguru\//i.test(u) && !/twitter\.com\/warrenguru\//i.test(u));
          if (filteredUrls.length === 0) {
            console.log(`[discord-watcher] All URLs are from @warrenguru — skipping to avoid double-post`);
          }

          if (filteredUrls.length > 0) {
          // Check if URL is directly from @whitehouse account
          const whUrlMatch = filteredUrls.find(u => /x\.com\/whitehouse\//i.test(u) || /twitter\.com\/whitehouse\//i.test(u));

          // Check message text + embeds for WhiteHouse-only keywords (no Trump/MAGA/POTUS)
          const allMsgText = [
            msg.content || "",
            ...(msg.embeds || []).flatMap((e: any) => [e.title || "", e.description || ""]),
            ...(msg.referenced_message ? [msg.referenced_message.content || ""] : []),
            ...(msg.message_snapshots || []).map((s: any) => s.message?.content || ""),
          ].join(" ").toLowerCase();

          const WH_KEYWORDS = [
            "whitehouse", "white house", "@whitehouse", "$whitehouse",
            "oval office", "executive order",
          ];
          const isWhiteHouseRelated = WH_KEYWORDS.some(kw => allMsgText.includes(kw));
          const isDirectWhitehouse = !!whUrlMatch;

          if (isDirectWhitehouse || isWhiteHouseRelated) {
            const raidTargetUrl = whUrlMatch || filteredUrls[0];
            const throttleSection = "raid-community-wh";
            const baseIntervalMs = isDirectWhitehouse ? 0 : 10 * 60 * 1000; // @whitehouse = instant, others = 10min

            const { data: raidThrottleCfg } = await supabase
              .from("site_configs")
              .select("content")
              .eq("site_id", "smm-auto-shill")
              .eq("section", throttleSection)
              .single();

            const lastPostMs = (raidThrottleCfg?.content as any)?.last_post_ms || 0;
            const elapsedMs = Date.now() - lastPostMs;
            const jitterMs = Math.floor(Math.random() * 3 * 60 * 1000);
            const effectiveInterval = baseIntervalMs + jitterMs;

            if (elapsedMs >= effectiveInterval) {
              const whMessages = [
                `Just Detected New Post that could be Raided $WHITEHOUSE\n\n${raidTargetUrl}\n\nCA: ${WHITEHOUSE_CA}`,
                `🚨 New @WhiteHouse post just dropped! Rally $WHITEHOUSE\n\n${raidTargetUrl}\n\nCA: ${WHITEHOUSE_CA}`,
                `Whitehouse just posted — time to raid $WHITEHOUSE 🏛️\n\n${raidTargetUrl}\n\nCA: ${WHITEHOUSE_CA}`,
                `Fresh @WhiteHouse tweet detected 🔥 Raid opportunity for $WHITEHOUSE\n\n${raidTargetUrl}\n\nCA: ${WHITEHOUSE_CA}`,
                `🏛️ New @WhiteHouse alert — $WHITEHOUSE raid incoming\n\n${raidTargetUrl}\n\nCA: ${WHITEHOUSE_CA}`,
                `Spotted a new @WhiteHouse post! Lets go $WHITEHOUSE\n\n${raidTargetUrl}\n\nCA: ${WHITEHOUSE_CA}`,
                `News about the White House just dropped — $WHITEHOUSE raid incoming!\n\n${raidTargetUrl}\n\nCA: ${WHITEHOUSE_CA}`,
              ];

              const raidText = whMessages[Math.floor(Math.random() * whMessages.length)];

              try {
                const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
                const postRes = await fetch(`${SUPABASE_URL}/functions/v1/smm-api?action=upload-text`, {
                  method: "POST",
                  headers: {
                    apikey: ANON_KEY,
                    Authorization: `Bearer ${ANON_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    title: raidText,
                    "platform[]": ["x"],
                    user: "xslaves",
                    community_id: X_COMMUNITY_ID,
                  }),
                });

                const postResult = await postRes.json();
                console.log(`[discord-watcher] 🎯 Community raid post (WhiteHouse):`, JSON.stringify(postResult).slice(0, 200));

                // Store the request_id and poll for the post URL
                const requestId = postResult?.request_id || postResult?.data?.request_id || "";
                let communityPostUrl = "";
                if (requestId) {
                  for (let poll = 0; poll < 10; poll++) {
                    await new Promise((r) => setTimeout(r, 5000));
                    try {
                      const statusRes = await fetch(
                        `${SUPABASE_URL}/functions/v1/smm-api?action=upload-status&request_id=${requestId}`,
                        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
                      );
                      const statusData = await statusRes.json();
                      const st = statusData?.status || statusData?.data?.status || "";
                      if (st === "completed" || st === "success" || st === "done") {
                        communityPostUrl = statusData?.post_url || statusData?.data?.post_url ||
                          statusData?.posts?.[0]?.post_url || statusData?.data?.posts?.[0]?.post_url || "";
                        break;
                      }
                      if (st === "failed" || st === "error") break;
                    } catch (_) { /* continue polling */ }
                  }
                }

                // Save latest community post URL for discord shill copy
                if (communityPostUrl) {
                  await supabase.from("site_configs").upsert({
                    site_id: "smm-auto-shill",
                    section: "latest-community-post",
                    content: { post_url: communityPostUrl, posted_at: new Date().toISOString(), request_id: requestId },
                  }, { onConflict: "site_id,section" });
                  console.log(`[discord-watcher] ✅ Stored community post URL: ${communityPostUrl}`);
                }

                await supabase.from("site_configs").upsert({
                  site_id: "smm-auto-shill",
                  section: throttleSection,
                  content: { last_post_ms: Date.now(), last_url: raidTargetUrl, is_whitehouse: isDirectWhitehouse, community_post_url: communityPostUrl || null },
                }, { onConflict: "site_id,section" });
              } catch (raidErr) {
                console.error("[discord-watcher] Community raid post error:", raidErr);
              }
            } else {
              console.log(`[discord-watcher] Community raid throttled — ${Math.round((effectiveInterval - elapsedMs) / 1000)}s remaining`);
            }
          } else {
            console.log(`[discord-watcher] No WhiteHouse content detected in raid source channel — skipping`);
          }
          } // end filteredUrls.length > 0
        }

        // For RT (retweet) messages in the raid channel, use the quoted tweet
        // URL which is typically the 3rd-to-last link (the actual target tweet).
        let tweetUrl: string;
        const RAID_LISTEN_CHANNEL = "1484843473352921138";
        const RAID_VERIFY_CHANNEL = "1485050868838564030";
        const isRtInRaidChannel = listenChannelId === RAID_LISTEN_CHANNEL &&
          (msg.content?.includes("RT") || msg.embeds?.some((e: any) =>
            [e.title, e.description].some((s: string | undefined) => s?.includes("RT"))
          ));

        // ── Secret-code RT verification on the verification channel ──
        // Raiders RT their #secret_code on X. A forwarding bot posts these
        // RTs into channel 1485050868838564030. We extract the #code from the
        // message text and match it against raiders to verify their clicks.
        const isVerifyChannel = listenChannelId === RAID_VERIFY_CHANNEL;
        if (isVerifyChannel) {
          // Collect all text from message content + embeds
          const allText = [
            msg.content || "",
            ...(msg.embeds || []).flatMap((e: any) => [e.title || "", e.description || ""]),
            ...(msg.referenced_message ? [msg.referenced_message.content || ""] : []),
            ...(msg.message_snapshots || []).map((s: any) => s.message?.content || ""),
          ].join(" ");

          // Extract hashtags like #storm42x, #bolt7
          const hashtagRegex = /#([a-zA-Z]+\d+x?)\b/gi;
          const hashtags: string[] = [];
          let hm: RegExpExecArray | null;
          while ((hm = hashtagRegex.exec(allText)) !== null) {
            hashtags.push(hm[1].toLowerCase());
          }

          if (hashtags.length > 0) {
            // Find raiders whose secret_code matches any extracted hashtag
            const { data: matchingRaiders } = await supabase
              .from("raiders")
              .select("id, secret_code, discord_user_id, discord_username")
              .in("secret_code", hashtags)
              .eq("status", "active");

            if (matchingRaiders?.length) {
              for (const raider of matchingRaiders) {
                // Find pending clicks for this raider
                const { data: pendingClicks } = await supabase
                  .from("shill_clicks")
                  .select("id")
                  .eq("discord_user_id", raider.discord_user_id)
                  .eq("status", "clicked")
                  .eq("click_type", "raid")
                  .order("created_at", { ascending: true })
                  .limit(1);

                if (pendingClicks?.length) {
                  const receiptUrl = uniqueUrls[0] || null;
                  const { error: verifyErr } = await supabase
                    .from("shill_clicks")
                    .update({
                      status: "verified",
                      verified_at: new Date().toISOString(),
                      receipt_tweet_url: receiptUrl,
                    })
                    .eq("id", pendingClicks[0].id);

                  if (verifyErr) {
                    console.error(`[discord-watcher] Failed to verify raid click for ${raider.discord_username}:`, verifyErr.message);
                  } else {
                    console.log(`[discord-watcher] ✅ Verified raid payment for ${raider.discord_username} via #${raider.secret_code}`);

                    // Update raider total_earned
                    await supabase.rpc("", {}).catch(() => {});
                    // Increment via direct update
                    const { data: currentRaider } = await supabase
                      .from("raiders")
                      .select("total_earned")
                      .eq("id", raider.id)
                      .single();

                    if (currentRaider) {
                      await supabase
                        .from("raiders")
                        .update({
                          total_earned: Number(currentRaider.total_earned) + 0.02,
                          updated_at: new Date().toISOString(),
                        })
                        .eq("id", raider.id);
                    }
                  }
                }
              }
            }
          }
        }

        if (isRtInRaidChannel && uniqueUrls.length >= 3) {
          tweetUrl = uniqueUrls[uniqueUrls.length - 3];
        } else if (isRtInRaidChannel && uniqueUrls.length >= 2) {
          // Fallback: pick the last URL (most likely the quoted tweet)
          tweetUrl = uniqueUrls[uniqueUrls.length - 1];
        } else {
          tweetUrl = uniqueUrls[0];
        }

        // ── Payment verification for RT receipts in the raid channel ──
        // When a user posts their reply receipt via TweetShift, we match any
        // extracted URL against pending shill_clicks to confirm payment.
        if (isRtInRaidChannel) {
          // Normalize URLs for comparison (strip query params, unify domain)
          const normalizeXUrl = (u: string): string =>
            u.replace(/https?:\/\/(x\.com|twitter\.com)/, "x.com")
             .split("?")[0]
             .replace(/[)\]}>]+$/, "")
             .replace(/\/+$/, "")
             .toLowerCase();

          const normalizedAll = uniqueUrls.map(normalizeXUrl);

          // Look for pending shill_clicks that match ANY of these URLs
          const { data: pendingClicks } = await supabase
            .from("shill_clicks")
            .select("id, tweet_url, source_tweet_url")
            .eq("status", "clicked")
            .limit(200);

          if (pendingClicks?.length) {
            for (const click of pendingClicks) {
              const clickUrl = normalizeXUrl(click.source_tweet_url || click.tweet_url || "");
              if (!clickUrl) continue;

              // Check if the original shill tweet URL appears in the RT receipt
              if (normalizedAll.includes(clickUrl)) {
                // Find the reply URL (a URL in the receipt that ISN'T the original)
                const replyUrl = uniqueUrls.find(u => normalizeXUrl(u) !== clickUrl) || tweetUrl;

                const { error: verifyErr } = await supabase
                  .from("shill_clicks")
                  .update({
                    status: "verified",
                    verified_at: new Date().toISOString(),
                    receipt_tweet_url: replyUrl,
                  })
                  .eq("id", click.id);

                if (verifyErr) {
                  console.error(`[discord-watcher] Failed to verify click ${click.id}:`, verifyErr.message);
                } else {
                  console.log(`[discord-watcher] ✅ Verified payment for click ${click.id} — matched ${clickUrl}`);
                }
              }
            }
          }
        }
        const discordAuthor = msg.author?.username || "unknown";

        // Cleanup runs every minute, so align the displayed countdown to the next
        // scheduler tick after the 5-minute mark to avoid showing "expired" before
        // the watcher can actually delete the message.
        const expiresAtMs = Date.now() + EXPIRY_MS;
        const expiresAt = Math.floor(expiresAtMs / 1000);

        // ── 1) Log to activity_log FIRST (before sending) to prevent race condition dupes ──
        const { error: logErr } = await supabase.from("activity_log").insert({
          entity_type: "auto-shill",
          action: "telegram-notified",
          meta: {
            discord_msg_id: msg.id,
            discord_author: discordAuthor,
            tweet_url: tweetUrl,
          },
        });

        if (logErr) {
          console.error(`[discord-watcher] Failed to log activity: ${logErr.message}`);
          continue;
        }

        // ── Post-insert race-condition guard: if another invocation also inserted, skip ──
        const { data: dupeCheck } = await supabase
          .from("activity_log")
          .select("id")
          .eq("entity_type", "auto-shill")
          .eq("action", "telegram-notified")
          .contains("meta", { discord_msg_id: msg.id });

        if (dupeCheck && dupeCheck.length > 1) {
          console.log(`[discord-watcher] Race dupe detected for msg ${msg.id}, skipping sends`);
          continue;
        }

        // ── 2) Send Telegram notification (main chat) ──
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

        // ── 2b) Forward shill/raid alert to Telegram Shill Lounge (max 2 per 5 min) ──
        const LOUNGE_WINDOW_MS = 5 * 60 * 1000;
        const LOUNGE_MAX_PER_WINDOW = 2;
        let shouldSendLounge = true;

        const { data: loungeThrottleRow } = await supabase
          .from("site_configs")
          .select("content")
          .eq("site_id", "smm-auto-shill")
          .eq("section", "tg-lounge-throttle")
          .single();

        const throttleData = (loungeThrottleRow?.content as any) || {};
        const sentTimestamps: number[] = Array.isArray(throttleData.sent_timestamps)
          ? throttleData.sent_timestamps : [];
        const nowMs = Date.now();
        // Keep only timestamps within the current window
        const recentSends = sentTimestamps.filter((ts: number) => (nowMs - ts) < LOUNGE_WINDOW_MS);

        if (recentSends.length >= LOUNGE_MAX_PER_WINDOW) {
          shouldSendLounge = false;
          console.log(`[discord-watcher] Lounge throttle active (${recentSends.length}/${LOUNGE_MAX_PER_WINDOW} in 5min), skipping TG forward`);
        }

        if (shouldSendLounge) {
          const isRaidType = listenChannelId === RAID_LISTEN_CHANNEL || replyChannelId === "1485010551196090448";
          const alertType = isRaidType ? "⚔️ RAID" : "🚀 SHILL";
          const payRate = isRaidType ? "$0.02" : "$0.05";
          const loungeText = `${alertType} *New Alert Dropped!*\n\n` +
            `💰 Earn *${payRate} per verified click* — that's passive income just for engaging!\n\n` +
            `Shillers earn *$0.05/click* • Raiders earn *$0.02/click*\n` +
            `Every click stacks up. Payouts every Friday in SOL 🤑\n\n` +
            `Whether you're already on the team or just getting started — jump in now!\n\n` +
            `👇 Tap below to start earning:`;
          const loungeKeyboard = {
            inline_keyboard: [
              [{ text: "💬 Join Discord & Start Earning", url: "https://discord.gg/warrenguru" }],
            ],
          };
          await sendToTelegramLounge(TELEGRAM_BOT_TOKEN, loungeText, loungeKeyboard);

          recentSends.push(nowMs);
          await supabase.from("site_configs").upsert({
            site_id: "smm-auto-shill",
            section: "tg-lounge-throttle",
            content: { sent_timestamps: recentSends },
          }, { onConflict: "site_id,section" });
        }

        // ── 3) Send Discord reply to the REPLY channel ──
        // Skip shill notifications for verify/shill-lounge channel
        const SHILL_LOUNGE_CHANNEL = "1485050868838564030";
        if (replyChannelId === SHILL_LOUNGE_CHANNEL) {
          console.log(`[discord-watcher] Skipping bot notification for shill-lounge channel ${SHILL_LOUNGE_CHANNEL}`);
          totalForwarded++;
          continue;
        }

        const discordEmbed = {
          title: "🔍 New Tweet Detected",
          description: `**Posted by:** ${discordAuthor}\n[Open Tweet](${tweetUrl})`,
          color: 0x1DA1F2,
          footer: {
            text: "⏱️ Auto-deletes in 5 minutes",
          },
          fields: [
            {
              name: "⏰ Expires",
              value: `<t:${expiresAt}:R>`,
              inline: true,
            },
          ],
        };

        const isRaidChannel = replyChannelId === "1485010551196090448";
        const isShillRoom = replyChannelId === "1484830617966481512";
        const buttonRow: any[] = [
          { type: 2, style: 1, label: isRaidChannel ? "⚔️ RAID NOW" : "🚀 SHILL NOW", custom_id: `shill_now_${msg.id}` },
          { type: 2, style: 2, label: "📋 Get Shill Copy", custom_id: `shill_copy_${msg.id}` },
        ];
        if (isShillRoom) {
          buttonRow.push({ type: 2, style: 3, label: "✅ Verify", custom_id: `shill_verify_${msg.id}` });
        }
        if (isRaidChannel) {
          buttonRow.push({ type: 2, style: 3, label: "✅ Verify Raid", custom_id: `raid_verify_${msg.id}` });
          buttonRow.push({ type: 2, style: 4, label: "🚫 Bad Link", custom_id: `bad_link_${msg.id}` });
        }
        const discordComponents = [
          { type: 1, components: buttonRow },
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
            // Track bot message for auto-cleanup
            await supabase.from("activity_log").insert({
              entity_type: "shill-bot-msg",
              action: "pending",
              meta: {
                bot_message_id: botMsg.id,
                channel_id: replyChannelId,
                discord_msg_id: msg.id,
                tweet_url: tweetUrl,
                expires_at: new Date(expiresAtMs).toISOString(),
              },
            });
          } else {
            const errText = await botReplyRes.text();
            console.error(`[discord-watcher] Bot reply failed ${botReplyRes.status}: ${errText}`);
          }
        } catch (e) {
          console.error("[discord-watcher] Discord reply error:", e);
        }

        // ── 5) Notify opted-in users (Discord DM + Telegram mention) ──
        try {
          const { data: notifyPrefs } = await supabase
            .from("discord_notify_prefs")
            .select("discord_user_id, discord_username, notify_discord_dm, notify_telegram, telegram_username")
            .or("notify_discord_dm.eq.true,notify_telegram.eq.true");

          if (notifyPrefs?.length) {
            const alertLabel = isRaidChannel ? "⚔️ RAID" : "🚀 SHILL";

            // Discord DM notifications
            const dmUsers = notifyPrefs.filter((p: any) => p.notify_discord_dm);
            for (const user of dmUsers) {
              try {
                // Open DM channel
                const dmChannelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
                  method: "POST",
                  headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ recipient_id: user.discord_user_id }),
                });
                if (dmChannelRes.ok) {
                  const dmChannel = await dmChannelRes.json();
                  await fetch(`${DISCORD_API}/channels/${dmChannel.id}/messages`, {
                    method: "POST",
                    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                      content: `${alertLabel} **New alert just dropped!** 🔥\n\n👤 Posted by: ${discordAuthor}\n\n💰 Head to the Discord to claim your click payment!`,
                    }),
                  });
                }
              } catch (dmErr) {
                console.error(`[discord-watcher] DM to ${user.discord_user_id} failed:`, dmErr);
              }
            }

            // Telegram mention notifications
            const tgUsers = notifyPrefs.filter((p: any) => p.notify_telegram && p.telegram_username);
            if (tgUsers.length > 0) {
              const mentions = tgUsers
                .map((u: any) => `@${String(u.telegram_username).replace(/^@/, "")}`)
                .join(" ");
              const safeAuthor = escapeTelegramHtml(String(discordAuthor || "unknown"));
              const tgAlertText = `${alertLabel} <b>Alert!</b>\n\n` +
                `👤 Posted by: <code>${safeAuthor}</code>\n\n` +
                `💰 Head to Discord and start earning!\n\n` +
                `📢 ${mentions}`;

              await sendToTelegramLounge(TELEGRAM_BOT_TOKEN, tgAlertText, undefined, "HTML");
            }
          }
        } catch (notifyErr) {
          console.error("[discord-watcher] User notification error:", notifyErr);
        }

        totalForwarded++;
        // ── 4) Auto-enrich tweet with X API analytics ──
        if (TWITTER_BEARER_TOKEN) {
          enrichTweet(supabase, tweetUrl, msg.id, TWITTER_BEARER_TOKEN).catch(e =>
            console.error("[discord-watcher] Enrich error:", e)
          );
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

    // ── Auto-forward announcements channel to Telegram Shill Lounge ──
    let announcementsForwarded = 0;
    try {
      // Get last forwarded message ID from site_configs
      const { data: fwdCfg } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "tg-announcements-fwd")
        .single();

      const lastFwdId = (fwdCfg?.content as any)?.last_message_id || null;

      let fwdUrl = `${DISCORD_API}/channels/${DISCORD_ANNOUNCEMENTS_CHANNEL}/messages?limit=20`;
      if (lastFwdId) fwdUrl += `&after=${lastFwdId}`;

      const fwdRes = await fetch(fwdUrl, {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      });

      if (fwdRes.ok) {
        const fwdMsgs: any[] = await fwdRes.json();
        if (fwdMsgs.length > 0) {
          fwdMsgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          let newestFwdId = lastFwdId;
          for (const fMsg of fwdMsgs) {
            if (!newestFwdId || BigInt(fMsg.id) > BigInt(newestFwdId)) {
              newestFwdId = fMsg.id;
            }

            const content = fMsg.content || "";
            const embedTexts = (fMsg.embeds || []).map((e: any) =>
              [e.title, e.description].filter(Boolean).join("\n")
            ).join("\n");
            const fullText = [content, embedTexts].filter(Boolean).join("\n\n");

            if (!fullText.trim()) continue;

            // Truncate if needed (Telegram 4096 char limit)
            const truncated = fullText.length > 3800 ? fullText.slice(0, 3800) + "…" : fullText;
            const author = fMsg.author?.username || "announcement";

            const fwdText = `📢 *Discord Announcement*\n` +
              `👤 \`${author}\`\n\n${truncated}`;

            await sendToTelegramLounge(TELEGRAM_BOT_TOKEN, fwdText);
            announcementsForwarded++;
          }

          // Save cursor
          if (newestFwdId && newestFwdId !== lastFwdId) {
            await supabase.from("site_configs").upsert({
              site_id: "smm-auto-shill",
              section: "tg-announcements-fwd",
              content: { last_message_id: newestFwdId },
            }, { onConflict: "site_id,section" });
          }
        }
      }
    } catch (e) {
      console.error("[discord-watcher] Announcements forward error:", e);
    }

    return json({ ok: true, forwarded: totalForwarded, announcements_forwarded: announcementsForwarded, expired: expiredCount });
  } catch (err) {
    console.error("[discord-watcher] Fatal error:", err);
    return json({ error: String(err) }, 500);
  }
});
