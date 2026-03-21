import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret, x-signature-ed25519, x-signature-timestamp",
};

const API_BASE = "https://api.upload-post.com/api";
const FALLBACK_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c";
const FALLBACK_DISCORD_PUBLIC_KEY = "3d6e57e2ae6bcf70b70dc1fbf0caacb5fe2ed07a9c9a325bdc34734a952ca42d";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ─── Ed25519 signature verification for Discord Interactions ───
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function verifyDiscordSignature(publicKeyHex: string, signature: string, timestamp: string, body: string): boolean {
  try {
    const publicKey = hexToUint8Array(publicKeyHex);
    const sig = hexToUint8Array(signature);
    const message = new TextEncoder().encode(timestamp + body);
    return nacl.sign.detached.verify(message, sig, publicKey);
  } catch (e) {
    console.error("[auto-shill] Signature verification error:", e);
    return false;
  }
}

async function resolveDiscordConfig(supabase: any, requestedProfile?: string | null) {
  const normalizedProfile = requestedProfile?.trim() || "NysonBlack";
  const { data: exactRow } = await supabase
    .from("site_configs").select("content, section")
    .eq("site_id", "smm-auto-shill").eq("section", normalizedProfile).maybeSingle();

  const exactContent = exactRow?.content as any;
  if (exactContent?.discord_public_key) {
    return { profileUsername: exactRow?.section || normalizedProfile, publicKey: String(exactContent.discord_public_key) };
  }

  const { data: allConfigs } = await supabase
    .from("site_configs").select("content, section")
    .eq("site_id", "smm-auto-shill").order("section", { ascending: true });

  for (const row of allConfigs || []) {
    const content = row.content as any;
    if (content?.discord_public_key) {
      return { profileUsername: row.section || normalizedProfile, publicKey: String(content.discord_public_key) };
    }
  }

  return { profileUsername: normalizedProfile, publicKey: FALLBACK_DISCORD_PUBLIC_KEY };
}

// ─── Telegram helper ───
function makeSendTelegram(token: string, chatId: string) {
  return async (text: string) => {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      });
    } catch (e) { console.error("[auto-shill] Telegram error:", e); }
  };
}

// ─── AI contextual reply generator ───
async function generateInterruptorHook(
  LOVABLE_API_KEY: string
): Promise<string> {
  const systemPrompt = `You are a sharp, edgy crypto personality on X (Twitter). Your job is to write a single punchy "interruptor" hook — a bold, attention-grabbing opening line that makes people stop scrolling.

Rules:
- Write ONLY the hook line, nothing else
- Keep it under 100 characters
- Use a provocative, confident tone — like you know something others don't
- Do NOT mention any ticker, coin name, link, or hashtag — those are added separately
- Do NOT use quotes around your output
- Do NOT repeat the same hook twice — be creative and varied
- Style: mysterious, bold, contrarian, urgent — like a whisper that demands attention

Examples of the STYLE (do not copy these exactly, create new ones):
- "Nobody's gonna say it… so I will."
- "I've been watching this for weeks. Finally."
- "They don't want you to see this."
- "Call me crazy but this changes everything."
- "Everyone's sleeping on this. Not me."
- "Deleted my last tweet about this. But f*ck it."
- "The chart doesn't lie."
- "I wasn't gonna post this but here we go."
- "This is the one they'll talk about later."
- "If you know, you know. If you don't… read this."`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Write a fresh interruptor hook for a crypto tweet. Just the hook line, nothing else." },
        ],
        temperature: 1.2,
      }),
    });

    if (!res.ok) {
      console.error("[auto-shill] AI gateway error:", res.status, await res.text());
      return "Nobody's gonna say it… so I will.";
    }

    const data = await res.json();
    let reply = data.choices?.[0]?.message?.content?.trim() || "";
    // Strip wrapping quotes if AI added them
    reply = reply.replace(/^["']|["']$/g, "").trim();
    return reply || "Nobody's gonna say it… so I will.";
  } catch (e) {
    console.error("[auto-shill] AI generation error:", e);
    return "Nobody's gonna say it… so I will.";
  }
}

function extractTweetId(tweetUrl: string): string | null {
  try {
    const url = new URL(tweetUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const statusIndex = parts.findIndex((part) => part === "status");
    if (statusIndex >= 0 && parts[statusIndex + 1]) {
      return parts[statusIndex + 1];
    }
    return null;
  } catch {
    return null;
  }
}

async function verifyReplyOnX(replyPostId: string, targetTweetUrl: string, twitterBearerToken?: string | null) {
  const targetTweetId = extractTweetId(targetTweetUrl);
  if (!targetTweetId) {
    return { verified: false, reason: "Could not parse target tweet id" };
  }

  if (!twitterBearerToken) {
    return { verified: false, reason: "TWITTER_BEARER_TOKEN not configured" };
  }

  let lastFailure = "Unknown X verification failure";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const verifyRes = await fetch(
        `https://api.x.com/2/tweets/${replyPostId}?tweet.fields=referenced_tweets,conversation_id,author_id`,
        {
          headers: {
            "Authorization": `Bearer ${twitterBearerToken}`,
          },
        }
      );

      const verifyText = await verifyRes.text();
      console.log(`[auto-shill] X verify attempt ${attempt} (${verifyRes.status}): ${verifyText.substring(0, 500)}`);

      if (!verifyRes.ok) {
        lastFailure = `X verify failed (${verifyRes.status}): ${verifyText.substring(0, 300)}`;
      } else {
        const verifyData = JSON.parse(verifyText);
        const referencedTweets = Array.isArray(verifyData?.data?.referenced_tweets)
          ? verifyData.data.referenced_tweets
          : [];

        const isReplyToTarget = referencedTweets.some(
          (ref: any) => ref?.type === "replied_to" && String(ref?.id || "") === targetTweetId
        );

        if (isReplyToTarget) {
          return {
            verified: true,
            reason: "Verified on X",
            data: verifyData?.data || null,
          };
        }

        lastFailure = `Posted tweet ${replyPostId} is not a reply to target ${targetTweetId}`;
      }
    } catch (error) {
      lastFailure = `X verify exception: ${String(error)}`;
      console.error("[auto-shill] X verify error:", error);
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return { verified: false, reason: lastFailure };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || FALLBACK_ANON_KEY;
  const BOT_SECRET = Deno.env.get("BOT_SECRET")!;
  const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY")!;
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TWITTER_BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const sendTelegram = makeSendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);

  const urlObj = new URL(req.url);
  const action = urlObj.searchParams.get("action") || "ingest";

  // ─── Discord Interactions endpoint ───
  if (action === "discord-interact" && req.method === "POST") {
    const sig = req.headers.get("x-signature-ed25519") || "";
    const timestamp = req.headers.get("x-signature-timestamp") || "";
    const rawBody = await req.text();

    const requestedProfile = urlObj.searchParams.get("profile") || urlObj.searchParams.get("section");
    const { publicKey, profileUsername: matchedProfile } = await resolveDiscordConfig(supabase, requestedProfile);

    const isValid = verifyDiscordSignature(publicKey, sig, timestamp, rawBody);
    if (!isValid) return json({ error: "Invalid request signature" }, 401);

    const interaction = JSON.parse(rawBody);
    if (interaction.type === 1) return json({ type: 1 });

    if (interaction.type === 2) {
      const commandName = interaction.data?.name || "";

      // ─── /clean command — bulk delete bot messages from channel ───
      if (commandName === "clean") {
        const channelId = interaction.channel_id;
        const DISCORD_BOT_TOKEN_ENV = Deno.env.get("DISCORD_BOT_TOKEN");

        if (!DISCORD_BOT_TOKEN_ENV) {
          return json({ type: 4, data: { content: "❌ Bot token not configured.", flags: 64 } });
        }

        // Respond immediately — cleanup runs async
        const cleanupPromise = (async () => {
          try {
            // 1) Delete tracked bot messages from DB for this channel
            const { data: tracked } = await supabase
              .from("activity_log")
              .select("id, meta")
              .eq("entity_type", "shill-bot-msg")
              .in("action", ["pending", "interacted"])
              .limit(200);

            let deleted = 0;
            const toDelete = (tracked || []).filter((r: any) => {
              const meta = r.meta as any;
              return meta?.channel_id === channelId || !channelId;
            });

            for (const row of toDelete) {
              const meta = row.meta as any;
              const msgId = meta?.bot_message_id;
              const chId = meta?.channel_id;
              if (msgId && chId) {
                try {
                  const res = await fetch(
                    `https://discord.com/api/v10/channels/${chId}/messages/${msgId}`,
                    { method: "DELETE", headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}` } }
                  );
                  if (res.ok || res.status === 404) deleted++;
                } catch (e) {
                  console.error("[auto-shill] Clean delete error:", e);
                }
              }
              await supabase.from("activity_log").update({ action: "cleaned" }).eq("id", row.id);
            }

            // 2) Follow-up message in channel with result
            await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
              method: "POST",
              headers: {
                Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ content: `🧹 Cleanup complete — removed **${deleted}** bot messages.` }),
            });
          } catch (e) {
            console.error("[auto-shill] /clean error:", e);
          }
        })();
        cleanupPromise.catch(e => console.error("[auto-shill] /clean async error:", e));

        return json({ type: 4, data: { content: "🧹 Cleaning up bot messages… hang tight." } });
      }

      // ─── /shill command ───
      let tweetUrl = "";
      const profileUsername = matchedProfile || "NysonBlack";

      if (interaction.data?.options) {
        const urlOption = interaction.data.options.find((o: any) => o.name === "url" || o.name === "tweet");
        if (urlOption) tweetUrl = urlOption.value;
      }

      if (!tweetUrl && interaction.data?.resolved?.messages) {
        const msgs = Object.values(interaction.data.resolved.messages) as any[];
        for (const msg of msgs) {
          const match = msg.content?.match(/https?:\/\/(x\.com|twitter\.com)\/\S+/i);
          if (match) { tweetUrl = match[0]; break; }
        }
      }

      if (!tweetUrl) {
        return json({ type: 4, data: { content: "❌ No tweet URL found.", flags: 64 } });
      }

      const processPromise = processAutoShill(supabase, tweetUrl, profileUsername, UPLOAD_POST_API_KEY, LOVABLE_API_KEY, TWITTER_BEARER_TOKEN, sendTelegram, false);
      processPromise.catch(e => console.error("[auto-shill] Async process error:", e));

      return json({ type: 4, data: { content: `🗣️ Auto-shill queued: ${tweetUrl}\n👤 ${profileUsername}` } });
    }

    // ─── Component interaction (button clicks) ───
    if (interaction.type === 3) {
      const customId = interaction.data?.custom_id || "";
      const discordUser = interaction.member?.user || interaction.user || {};
      const discordUserId = discordUser.id || "unknown";
      const discordUsername = discordUser.username || discordUser.global_name || "unknown";

      // Extract tweet URL from the original message's embed
      let tweetUrl = "";
      const embeds = interaction.message?.embeds || [];
      if (embeds.length > 0) {
        const desc = embeds[0].description || "";
        const urlMatch = desc.match(/https?:\/\/(x\.com|twitter\.com)\/\S+/i);
        if (urlMatch) tweetUrl = urlMatch[0].replace(/\)$/, "");
      }

      // ─── SHILL NOW button — record click + give URL ───
      if (customId.startsWith("shill_now_")) {
        const discordMsgId = customId.replace("shill_now_", "") || null;

        await supabase.from("shill_clicks").insert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          tweet_url: tweetUrl || null,
          discord_msg_id: discordMsgId,
        });

        if (discordMsgId) {
          await supabase.from("activity_log")
            .update({ action: "interacted" })
            .eq("entity_type", "shill-bot-msg")
            .eq("action", "pending")
            .like("meta->>discord_msg_id", discordMsgId);
        }

        // type 7 = UPDATE_MESSAGE — replaces the original embed so it gets
        // auto-deleted along with the bot message (no orphan ephemeral)
        return json({
          type: 7,
          data: {
            content: `🚀 **Go shill this tweet now!**\n${tweetUrl}\n\n✅ Click recorded for \`${discordUsername}\``,
            embeds: [],
            components: [],
          },
        });
      }

      // ─── Get Shill Copy button ───
      if (customId.startsWith("shill_copy")) {
        const discordMsgId = customId.replace("shill_copy_", "") || null;

        await supabase.from("shill_clicks").insert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          tweet_url: tweetUrl || null,
          discord_msg_id: discordMsgId,
        });

        if (discordMsgId) {
          await supabase.from("activity_log")
            .update({ action: "interacted" })
            .eq("entity_type", "shill-bot-msg")
            .eq("action", "pending")
            .like("meta->>discord_msg_id", discordMsgId);
        }

        const { data: shillConfigs } = await supabase
          .from("site_configs").select("content")
          .eq("site_id", "smm-auto-shill");

        const enabledCfg = shillConfigs?.find((r: any) => (r.content as any)?.enabled);
        const cfg = enabledCfg?.content as any;
        const campaignUrl = cfg?.campaign_url || "";
        const shillTicker = cfg?.ticker || "";

        if (!shillTicker) {
          return json({ type: 4, data: { content: "⚠️ No ticker configured in Auto Shill settings.", flags: 64 } });
        }

        const tickerClean = shillTicker.replace(/^\$/, "");
        const copyText = `${shillTicker} #${tickerClean} #crypto` +
          (campaignUrl ? `\n${campaignUrl}` : "");

        return json({
          type: 7,
          data: {
            content: `📋 **Shill Copy — paste this as your reply:**\n\`\`\`\n${copyText}\n\`\`\``,
            embeds: [],
            components: [],
          },
        });
      }

      return json({ type: 4, data: { content: "❓ Unknown action.", flags: 64 } });
    }

    return json({ type: 1 });
  }

  // ─── REGISTER slash commands ───
  if (action === "register-commands" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const profileUsername = body.profile || urlObj.searchParams.get("profile") || "NysonBlack";

    const { data: cfgRow } = await supabase
      .from("site_configs").select("content")
      .eq("site_id", "smm-auto-shill").eq("section", profileUsername).single();

    const cfg = cfgRow?.content as any;
    const appId = cfg?.discord_app_id;
    if (!appId) return json({ error: "No discord_app_id configured" }, 400);

    const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!DISCORD_BOT_TOKEN) return json({ error: "DISCORD_BOT_TOKEN not set" }, 500);

    const guildId = body.guild_id || urlObj.searchParams.get("guild_id") || "";
    const registerUrl = guildId
      ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${appId}/commands`;

    const commands = [
      {
        name: "shill", description: "Auto-reply to a tweet via X", type: 1,
        options: [{ name: "url", description: "The X/Twitter tweet URL", type: 3, required: true }],
      },
      {
        name: "clean", description: "Delete all bot shill messages from this channel", type: 1,
      },
    ];

    const results = [];
    for (const cmd of commands) {
      const res = await fetch(registerUrl, {
        method: "POST",
        headers: { "Authorization": `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      });
      results.push({ command: cmd.name, status: res.status, data: await res.json() });
    }
    return json({ ok: true, results });
  }

  // ─── Auth: bot secret, anon/publishable key, or service role ───
  const botSecret = req.headers.get("x-bot-secret");
  const authHeader = req.headers.get("authorization") || "";
  const apikeyHeader = req.headers.get("apikey") || "";
  const isBot = botSecret === BOT_SECRET;
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const validKeys = [ANON_KEY, FALLBACK_ANON_KEY, SERVICE_KEY].filter(Boolean);
  const isAuthed = validKeys.some(k => apikeyHeader === k || bearerToken === k);
  if (!isBot && !isAuthed) return json({ error: "Unauthorized" }, 401);

  try {
    // ─── Force clean: delete ALL bot messages from a channel via Discord API ───
    if (action === "force-clean-channel") {
      const body = await req.json().catch(() => ({}));
      const channelId = body.channel_id;
      const DISCORD_BOT_TOKEN_ENV = Deno.env.get("DISCORD_BOT_TOKEN");
      if (!channelId || !DISCORD_BOT_TOKEN_ENV) return json({ error: "Missing channel_id or bot token" }, 400);

      // Get the bot's own user ID
      const meRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}` },
      });
      const me = await meRes.json();
      const botUserId = me.id;

      // Fetch last 100 messages and delete any from our bot
      let deleted = 0;
      let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
      const msgRes = await fetch(url, { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}` } });
      if (!msgRes.ok) return json({ error: `Discord fetch failed: ${msgRes.status}` }, 500);
      const msgs: any[] = await msgRes.json();

      for (const m of msgs) {
        if (m.author?.id === botUserId) {
          const delRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${m.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}` },
          });
          if (delRes.ok || delRes.status === 404) deleted++;
          // Rate limit: small delay between deletes
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Also clean expired DB records
      await supabase.from("activity_log")
        .update({ action: "cleaned" })
        .eq("entity_type", "shill-bot-msg")
        .eq("action", "expired");

      return json({ ok: true, deleted, total_checked: msgs.length });
    }


    // ─── GET campaign config ───
    if (action === "get-config") {
      const profileUsername = urlObj.searchParams.get("profile") || "NysonBlack";
      const { data } = await supabase
        .from("site_configs").select("content")
        .eq("site_id", "smm-auto-shill").eq("section", profileUsername).single();

      return json({
        config: data?.content || {
          enabled: false,
          campaign_url: "",
          ticker: "",
          discord_app_id: "",
          discord_public_key: "",
        }
      });
    }

    // ─── SAVE campaign config ───
    if (action === "save-config") {
      const body = await req.json();
      const { profile_username, enabled, campaign_url, ticker, discord_app_id, discord_public_key, discord_channel_id, team_accounts } = body;
      const section = profile_username || "NysonBlack";

      // Preserve last_message_id if it exists
      const { data: existingRow } = await supabase
        .from("site_configs").select("content")
        .eq("site_id", "smm-auto-shill").eq("section", section).maybeSingle();
      const existingContent = existingRow?.content as any;

      const { retweet_accounts } = body;
      await supabase.from("site_configs").upsert({
        site_id: "smm-auto-shill",
        section,
        content: {
          enabled,
          campaign_url: campaign_url || "",
          ticker: ticker || "",
          discord_app_id: discord_app_id || "",
          discord_public_key: discord_public_key || "",
          discord_channel_id: discord_channel_id || "",
          team_accounts: Array.isArray(team_accounts) ? team_accounts : [],
          retweet_accounts: Array.isArray(retweet_accounts) ? retweet_accounts : [],
          last_message_id: existingContent?.last_message_id || null,
        },
        is_published: true,
      }, { onConflict: "site_id,section" });

      return json({ ok: true });
    }

    // ─── GET feed (incoming URLs + replies) ───
    if (action === "feed") {
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .eq("entity_type", "auto-shill")
        .order("created_at", { ascending: false })
        .limit(100);

      return json({ feed: data || [] });
    }

    // ─── INGEST: other bot sends tweet URL via webhook ───
    if (action === "ingest" && req.method === "POST") {
      const body = await req.json();
      const tweetUrl = body.tweet_url || body.url || body.content || "";
      const profileUsername = body.profile_username || body.profile || "NysonBlack";
      const discordMsgId = body.discord_msg_id || null;
      const discordAuthor = body.discord_author || null;
      const isBot = body.is_bot === true;

      if (!tweetUrl || (!tweetUrl.includes("x.com/") && !tweetUrl.includes("twitter.com/"))) {
        await supabase.from("activity_log").insert({
          entity_type: "auto-shill", action: "skipped",
          meta: { name: `⏭️ Non-X URL skipped`, url: tweetUrl, profile: profileUsername, discord_msg_id: discordMsgId },
        });
        return json({ ok: true, skipped: true, reason: "Not an X/Twitter URL" });
      }

      // Log as received + notify Telegram immediately
      await supabase.from("activity_log").insert({
        entity_type: "auto-shill", action: "received",
        meta: { name: `📥 Received: ${tweetUrl}`, tweet_url: tweetUrl, profile: profileUsername, discord_msg_id: discordMsgId, discord_author: discordAuthor },
      });
      await sendTelegram(`📥 *Discord → Auto-Shill*\n🔗 ${tweetUrl}\n👤 ${profileUsername}${discordAuthor ? `\n🎮 Discord: ${discordAuthor}` : ''}\n⏳ Processing reply...`);

      const result = await processAutoShill(supabase, tweetUrl, profileUsername, UPLOAD_POST_API_KEY, LOVABLE_API_KEY, TWITTER_BEARER_TOKEN, sendTelegram, isBot);
      return json(result, result.ok ? 200 : 500);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[auto-shill] Fatal error:", err);
    await sendTelegram(`🚨 *Auto-Shill CRASH*\n❌ ${String(err)}`);
    return json({ error: String(err) }, 500);
  }
});

// ─── Find an available team account (not in cooldown or 24h reply ban) ───
async function findAvailableAccount(
  supabase: any, teamAccounts: string[], primaryAccount: string, COOLDOWN_MS: number
): Promise<{ account: string; allInCooldown: boolean; cooldownInfo: string }> {
  const accounts = teamAccounts.length > 0 ? teamAccounts : [primaryAccount];
  const BAN_MS = 24 * 60 * 60 * 1000; // 24 hours
  const banCutoff = new Date(Date.now() - BAN_MS).toISOString();
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS).toISOString();

  // Fetch 24h reply bans
  const { data: banEntries } = await supabase
    .from("activity_log").select("meta, created_at")
    .eq("entity_type", "auto-shill")
    .eq("action", "reply_banned")
    .gte("created_at", banCutoff)
    .order("created_at", { ascending: false })
    .limit(100);

  const bannedAccounts = new Set<string>();
  for (const entry of banEntries || []) {
    const account = entry.meta?.used_account || "";
    if (account) bannedAccounts.add(account);
  }

  // Fetch recent cooldown activity
  const { data: recentActivity } = await supabase
    .from("activity_log").select("meta, created_at")
    .eq("entity_type", "auto-shill")
    .in("action", ["replied", "failed"])
    .gte("created_at", cooldownCutoff)
    .order("created_at", { ascending: false })
    .limit(100);

  const lastActivityMap = new Map<string, Date>();
  for (const entry of recentActivity || []) {
    const usedAccount = entry.meta?.used_account || entry.meta?.profile || "";
    if (usedAccount && !lastActivityMap.has(usedAccount)) {
      lastActivityMap.set(usedAccount, new Date(entry.created_at));
    }
  }

  // Find first account NOT banned and NOT in cooldown
  for (const account of accounts) {
    if (bannedAccounts.has(account)) {
      console.log(`[auto-shill] Account @${account} is reply-banned (24h)`);
      continue;
    }
    const lastAt = lastActivityMap.get(account);
    if (!lastAt) {
      console.log(`[auto-shill] Account @${account} is available (no recent activity)`);
      return { account, allInCooldown: false, cooldownInfo: "" };
    }
    const elapsed = Date.now() - lastAt.getTime();
    if (elapsed >= COOLDOWN_MS) {
      console.log(`[auto-shill] Account @${account} is available (last activity ${Math.round(elapsed / 1000)}s ago)`);
      return { account, allInCooldown: false, cooldownInfo: "" };
    }
  }

  // All accounts unavailable — find soonest available (excluding banned)
  const unbanned = accounts.filter(a => !bannedAccounts.has(a));
  if (unbanned.length === 0) {
    const cooldownInfo = `All ${accounts.length} account(s) are reply-banned (24h). No accounts available.`;
    return { account: accounts[0], allInCooldown: true, cooldownInfo };
  }

  let soonestAccount = unbanned[0];
  let soonestWaitMs = COOLDOWN_MS;
  for (const account of unbanned) {
    const lastAt = lastActivityMap.get(account);
    if (lastAt) {
      const wait = COOLDOWN_MS - (Date.now() - lastAt.getTime());
      if (wait < soonestWaitMs) {
        soonestWaitMs = wait;
        soonestAccount = account;
      }
    }
  }

  const waitMin = Math.ceil(soonestWaitMs / 60000);
  const cooldownInfo = `All ${unbanned.length} available account(s) in cooldown. @${soonestAccount} available in ~${waitMin}m`;
  return { account: soonestAccount, allInCooldown: true, cooldownInfo };
}

// ─── Core: AI rage-bait reply + campaign link + ticker + hashtags ───
async function processAutoShill(
  supabase: any, tweetUrl: string, profileUsername: string,
  UPLOAD_POST_API_KEY: string, LOVABLE_API_KEY: string, TWITTER_BEARER_TOKEN: string | null | undefined,
  sendTelegram: (text: string) => Promise<void>, isBot: boolean = false
) {
  console.log(`[auto-shill] Processing: ${tweetUrl} for ${profileUsername}`);

  // Load campaign config
  const { data: configRow } = await supabase
    .from("site_configs").select("content")
    .eq("site_id", "smm-auto-shill").eq("section", profileUsername).single();

  const config = configRow?.content as any;
  if (!config?.enabled) return { ok: false, skipped: true, reason: "Auto-shill disabled" };

  const campaignUrl = config.campaign_url || "";
  const ticker = config.ticker || "";
  if (!ticker) return { ok: false, error: "No ticker configured" };

  const teamAccounts: string[] = Array.isArray(config.team_accounts) ? config.team_accounts : [];
  const retweetAccounts: string[] = Array.isArray(config.retweet_accounts) ? config.retweet_accounts : [];

  // ─── Per-account cooldown with team rotation ───
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  const { account: selectedAccount, allInCooldown, cooldownInfo } = await findAvailableAccount(
    supabase, teamAccounts, profileUsername, COOLDOWN_MS
  );

  if (allInCooldown) {
    console.log(`[auto-shill] ${cooldownInfo}`);
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "cooldown",
      meta: {
        name: `⏳ ${cooldownInfo}`,
        tweet_url: tweetUrl,
        profile: profileUsername,
        used_account: selectedAccount,
        team_size: teamAccounts.length || 1,
      },
    });
    return { ok: false, skipped: true, reason: cooldownInfo };
  }

  console.log(`[auto-shill] Selected account: @${selectedAccount} (team of ${teamAccounts.length || 1})`);

  // Dedup check (24h) — only for bot sources; human users always get a fresh reply
  if (isBot) {
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data: existing } = await supabase
      .from("activity_log").select("id")
      .eq("entity_type", "auto-shill").eq("action", "replied")
      .gte("created_at", oneDayAgo)
      .like("meta->>tweet_url", tweetUrl).limit(1);

    if (existing?.length) return { ok: false, skipped: true, reason: "Already replied in last 24h (bot dedup)" };
  }

  // Generate AI interruptor hook
  const hook = await generateInterruptorHook(LOVABLE_API_KEY);

  // Build full reply: interruptor hook + campaign URL (ALWAYS) + ticker + hashtags
  const tickerClean = ticker.replace(/^\$/, "");
  const hashtags = `#${tickerClean} #crypto`;
  const normalizedCampaignUrl = typeof campaignUrl === "string" ? campaignUrl.trim() : "";
  let fullReply = hook;
  if (normalizedCampaignUrl) fullReply += `\n\n${normalizedCampaignUrl}`;
  fullReply += `\n\n${ticker} ${hashtags}`;

  const targetTweetId = extractTweetId(tweetUrl);
  if (!targetTweetId) {
    const errorMsg = `Could not parse target tweet id from URL: ${tweetUrl}`;
    await sendTelegram(`🚨 *Auto-Shill FAILED*\n🔗 ${tweetUrl}\n❌ ${errorMsg}`);
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill",
      action: "failed",
      meta: {
        name: `❌ Reply failed: ${tweetUrl}`,
        tweet_url: tweetUrl,
        error: errorMsg,
        profile: profileUsername,
        used_account: selectedAccount,
        reply_text: fullReply.substring(0, 200),
      },
    });
    return { ok: false, error: errorMsg };
  }

  // Post reply via Upload-Post API — use the SELECTED team account
  // First attempt: direct reply. If 403 (reply-restricted), fallback to quote tweet.
  let uploadRes: Response;
  let uploadText: string;
  let uploadData: any = {};
  let usedQuoteFallback = false;

  // --- Attempt 1: Direct reply ---
  const params = new URLSearchParams();
  params.append("user", selectedAccount);
  params.append("platform[]", "x");
  params.append("title", fullReply);
  params.append("reply_to_id", targetTweetId);

  console.log(`[auto-shill] Upload-Post payload: user=${selectedAccount} (primary=${profileUsername}), platform=x, reply_to_id=${targetTweetId}, title_len=${fullReply.length}`);

  uploadRes = await fetch(`${API_BASE}/upload_text`, {
    method: "POST",
    headers: { "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  uploadText = await uploadRes.text();
  console.log(`[auto-shill] Upload-Post response (${uploadRes.status}): ${uploadText.substring(0, 500)}`);
  try { uploadData = JSON.parse(uploadText); } catch {}

  // Check if reply was blocked due to reply restrictions (403)
  const xResult1 = uploadData?.results?.x;
  const xError1 = String(xResult1?.error || "");
  const is403Reply = xError1.includes("403") || xError1.toLowerCase().includes("reply") && xError1.toLowerCase().includes("failed");
  const replyBlocked = (
    uploadData?.success === true &&
    xResult1?.success === false &&
    (xError1.includes("not allowed") || is403Reply)
  );

  // If this is a 403 reply ban, log a 24h ban for this account
  if (is403Reply) {
    console.log(`[auto-shill] 🚫 Account @${selectedAccount} hit 403 reply ban — entering 24h cooldown`);
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "reply_banned",
      meta: {
        name: `🚫 Reply banned (24h): @${selectedAccount}`,
        tweet_url: tweetUrl,
        profile: profileUsername,
        used_account: selectedAccount,
        error: xError1.substring(0, 300),
        ban_duration_hours: 24,
      },
    });
    await sendTelegram(`🚫 *Reply Ban Detected* (@${selectedAccount})\n🔗 ${tweetUrl}\n⏰ 24h cooldown activated\n❌ ${xError1.substring(0, 200)}`);
  }

  if (replyBlocked) {
    // --- Attempt 2: Quote tweet fallback ---
    console.log(`[auto-shill] Reply restricted — falling back to quote tweet for ${tweetUrl}`);
    usedQuoteFallback = true;

    const quoteText = `${fullReply}\n\n${tweetUrl}`;
    const quoteParams = new URLSearchParams();
    quoteParams.append("user", selectedAccount);
    quoteParams.append("platform[]", "x");
    quoteParams.append("title", quoteText);

    uploadRes = await fetch(`${API_BASE}/upload_text`, {
      method: "POST",
      headers: { "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: quoteParams.toString(),
    });

    uploadText = await uploadRes.text();
    console.log(`[auto-shill] Quote-tweet fallback response (${uploadRes.status}): ${uploadText.substring(0, 500)}`);
    uploadData = {};
    try { uploadData = JSON.parse(uploadText); } catch {}
  }

  if (!uploadRes.ok) {
    const errorMsg = `Upload failed (${uploadRes.status}): ${uploadText.substring(0, 200)}`;
    await sendTelegram(`🚨 *Auto-Shill FAILED* (@${selectedAccount})\n🔗 ${tweetUrl}\n❌ ${errorMsg}`);
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "failed",
      meta: { name: `❌ Reply failed: ${tweetUrl}`, tweet_url: tweetUrl, error: errorMsg, profile: profileUsername, used_account: selectedAccount, reply_text: fullReply.substring(0, 200) },
    });
    return { ok: false, error: errorMsg };
  }

  const requestId = uploadData?.request_id || uploadData?.data?.request_id || null;
  const jobId = uploadData?.job_id || uploadData?.data?.job_id || null;
  const providerStatus = String(uploadData?.status || uploadData?.results?.x?.status || "").toLowerCase();
  const xResult = uploadData?.results?.x;
  const confirmedReplyUrl = xResult?.url || null;
  const confirmedPostId = xResult?.post_id || null;
  const isProviderConfirmed = Boolean(
    uploadRes.ok &&
    uploadData?.success === true &&
    xResult?.success === true &&
    providerStatus === "completed" &&
    confirmedPostId &&
    confirmedReplyUrl
  );

  // ─── Async polling: if API handed off to background worker, poll for result ───
  const isAsyncHandoff = Boolean(
    uploadRes.ok &&
    uploadData?.success === true &&
    !xResult && // no platform results yet
    (requestId || jobId) &&
    String(uploadData?.message || "").toLowerCase().includes("background")
  );

  let finalUploadData = uploadData;
  let finalXResult = xResult;
  let finalConfirmedReplyUrl = confirmedReplyUrl;
  let finalConfirmedPostId = confirmedPostId;
  let finalProviderStatus = providerStatus;
  let polledSuccessfully = false;

  if (isAsyncHandoff && requestId) {
    console.log(`[auto-shill] Async handoff detected — polling status for request_id=${requestId}`);
    await sendTelegram(`⏳ *Async handoff* (@${selectedAccount})\n🔗 ${tweetUrl}\n🔄 Polling request_id: ${requestId}`);

    // Poll up to 6 times over ~60 seconds
    for (let attempt = 1; attempt <= 6; attempt++) {
      await new Promise(r => setTimeout(r, 10000)); // wait 10s between polls
      try {
        const statusRes = await fetch(
          `${API_BASE}/uploadposts/status?request_id=${requestId}`,
          { headers: { "Authorization": `Apikey ${UPLOAD_POST_API_KEY}` } }
        );
        const statusText = await statusRes.text();
        console.log(`[auto-shill] Poll attempt ${attempt} (${statusRes.status}): ${statusText.substring(0, 500)}`);

        let statusData: any = {};
        try { statusData = JSON.parse(statusText); } catch {}

        const pollResult = statusData?.results?.x || statusData?.data?.results?.x;
        const pollStatus = String(statusData?.status || pollResult?.status || "").toLowerCase();

        // Check for 403 reply ban in polled result
        const pollError = String(pollResult?.error || statusData?.error || "");
        const isPoll403 = pollError.includes("403") || (pollError.toLowerCase().includes("reply") && pollError.toLowerCase().includes("failed"));

        if (isPoll403) {
          console.log(`[auto-shill] 🚫 Poll revealed 403 reply ban for @${selectedAccount}`);
          await supabase.from("activity_log").insert({
            entity_type: "auto-shill", action: "reply_banned",
            meta: {
              name: `🚫 Reply banned (24h): @${selectedAccount}`,
              tweet_url: tweetUrl, profile: profileUsername, used_account: selectedAccount,
              error: pollError.substring(0, 300), ban_duration_hours: 24,
            },
          });
          await sendTelegram(`🚫 *Reply Ban Detected* (@${selectedAccount})\n🔗 ${tweetUrl}\n⏰ 24h cooldown activated`);
          // Fall through to quote-tweet fallback below
          break;
        }

        if (pollStatus === "completed" && pollResult?.success === true && pollResult?.post_id) {
          finalXResult = pollResult;
          finalConfirmedPostId = pollResult.post_id;
          finalConfirmedReplyUrl = pollResult.url || `https://x.com/${selectedAccount}/status/${pollResult.post_id}`;
          finalProviderStatus = "completed";
          polledSuccessfully = true;
          console.log(`[auto-shill] ✅ Async poll confirmed: post_id=${finalConfirmedPostId}`);
          await sendTelegram(`✅ *Async confirmed* (@${selectedAccount})\n🔗 ${finalConfirmedReplyUrl}`);
          break;
        }

        if (pollStatus === "failed") {
          console.log(`[auto-shill] ❌ Async poll returned failed: ${pollError.substring(0, 200)}`);
          break;
        }
        // Otherwise still pending, continue polling
      } catch (e) {
        console.error(`[auto-shill] Poll error attempt ${attempt}:`, e);
      }
    }
  }

  const isNowConfirmed = polledSuccessfully || isProviderConfirmed;

  if (!isNowConfirmed) {
    const errorMsg = `Upload not confirmed (${uploadRes.status}): ${uploadText.substring(0, 300)}`;
    // Check if this is a 403 reply ban in the not-confirmed path
    const xErr = String(finalXResult?.error || xResult?.error || "");
    const is403Ban = xErr.includes("403") || (xErr.toLowerCase().includes("reply") && xErr.toLowerCase().includes("failed"));
    if (is403Ban) {
      console.log(`[auto-shill] 🚫 Account @${selectedAccount} hit 403 reply ban (not-confirmed path) — 24h cooldown`);
      await supabase.from("activity_log").insert({
        entity_type: "auto-shill", action: "reply_banned",
        meta: {
          name: `🚫 Reply banned (24h): @${selectedAccount}`,
          tweet_url: tweetUrl,
          profile: profileUsername,
          used_account: selectedAccount,
          error: xErr.substring(0, 300),
          ban_duration_hours: 24,
        },
      });
      await sendTelegram(`🚫 *Reply Ban Detected* (@${selectedAccount})\n🔗 ${tweetUrl}\n⏰ 24h cooldown activated\n❌ ${xErr.substring(0, 200)}`);
    }
    await sendTelegram(`🚨 *Auto-Shill NOT CONFIRMED* (@${selectedAccount})\n🔗 ${tweetUrl}\n❌ ${errorMsg}`);
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "failed",
      meta: {
        name: `❌ Reply not confirmed: ${tweetUrl}`,
        tweet_url: tweetUrl,
        error: errorMsg,
        profile: profileUsername,
        used_account: selectedAccount,
        reply_text: fullReply.substring(0, 200),
        ticker,
        campaign_url: campaignUrl,
        request_id: requestId,
        job_id: jobId,
        provider_status: finalProviderStatus,
        provider_result: finalXResult || xResult || null,
      },
    });
    return { ok: false, error: errorMsg, request_id: requestId, job_id: jobId, provider_status: finalProviderStatus };
  }

  // Skip X reply-chain verification for quote tweets (they're standalone posts, not replies)
  if (!usedQuoteFallback) {
    const xVerification = await verifyReplyOnX(String(finalConfirmedPostId), tweetUrl, TWITTER_BEARER_TOKEN);
    if (!xVerification.verified) {
      const errorMsg = `Upload completed but X reply was not verified: ${xVerification.reason}`;
      await sendTelegram(`🚨 *Auto-Shill NOT VERIFIED ON X* (@${selectedAccount})\n🔗 ${tweetUrl}\n❌ ${errorMsg}`);
      await supabase.from("activity_log").insert({
        entity_type: "auto-shill",
        action: "failed",
        meta: {
          name: `❌ Reply not verified on X: ${tweetUrl}`,
          tweet_url: tweetUrl,
          error: errorMsg,
          profile: profileUsername,
          used_account: selectedAccount,
          reply_text: fullReply.substring(0, 200),
          ticker,
          campaign_url: campaignUrl,
          request_id: requestId,
          job_id: jobId,
          provider_status: finalProviderStatus,
          reply_post_id: finalConfirmedPostId,
          reply_url: finalConfirmedReplyUrl,
        },
      });
      return {
        ok: false,
        error: errorMsg,
        request_id: requestId,
        job_id: jobId,
        reply_post_id: finalConfirmedPostId,
        reply_url: finalConfirmedReplyUrl,
      };
    }
  }

  const replyType = usedQuoteFallback ? "quote" : "reply";
  const replyEmoji = usedQuoteFallback ? "💬" : "🗣️";

  await supabase.from("activity_log").insert({
    entity_type: "auto-shill", action: "replied",
    meta: {
      name: `${replyEmoji} Auto-${replyType}: ${tweetUrl}`,
      tweet_url: tweetUrl,
      profile: profileUsername,
      used_account: selectedAccount,
      reply_text: fullReply.substring(0, 300),
      ticker,
      campaign_url: campaignUrl,
      request_id: requestId,
      job_id: jobId,
      provider_status: finalProviderStatus,
      reply_post_id: finalConfirmedPostId,
      reply_url: finalConfirmedReplyUrl,
      reply_type: replyType,
    },
  });

  await sendTelegram(`${replyEmoji} *Auto-Shill ${usedQuoteFallback ? "Quote Tweet" : "Reply Confirmed"}* (@${selectedAccount})\n🔗 ${tweetUrl}\n✅ ${finalConfirmedReplyUrl}\n💰 ${ticker}`);

  // ─── Repost (quote-post the tweet URL) with selected repost accounts ───
  if (retweetAccounts.length > 0 && tweetUrl) {
    console.log(`[auto-shill] Reposting with ${retweetAccounts.length} account(s): ${retweetAccounts.join(', ')}`);
    const retweetResults: { account: string; success: boolean; error?: string }[] = [];

    for (const rtAccount of retweetAccounts) {
      try {
        const rtParams = new URLSearchParams();
        rtParams.append("user", rtAccount);
        rtParams.append("platform[]", "x");
        rtParams.append("title", tweetUrl);

        const rtRes = await fetch(`${API_BASE}/upload_text`, {
          method: "POST",
          headers: { "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: rtParams.toString(),
        });

        const rtText = await rtRes.text();
        console.log(`[auto-shill] Repost @${rtAccount} response (${rtRes.status}): ${rtText.substring(0, 300)}`);

        let rtData: any = {};
        try { rtData = JSON.parse(rtText); } catch {}

        const rtSuccess = rtRes.ok && rtData?.success === true;
        retweetResults.push({ account: rtAccount, success: rtSuccess, error: rtSuccess ? undefined : rtText.substring(0, 200) });
      } catch (e) {
        console.error(`[auto-shill] Repost error for @${rtAccount}:`, e);
        retweetResults.push({ account: rtAccount, success: false, error: String(e).substring(0, 200) });
      }
    }

    const successRTs = retweetResults.filter(r => r.success).map(r => r.account);
    const failedRTs = retweetResults.filter(r => !r.success);

    if (successRTs.length > 0) {
      await supabase.from("activity_log").insert({
        entity_type: "auto-shill", action: "retweeted",
        meta: {
          name: `🔁 Retweeted: ${tweetUrl}`,
          tweet_url: tweetUrl,
          profile: profileUsername,
          retweet_accounts: successRTs,
          retweet_count: successRTs.length,
        },
      });
      await sendTelegram(`🔁 *Retweet* (${successRTs.length} account${successRTs.length > 1 ? 's' : ''})\n🔗 ${tweetUrl}\n👤 ${successRTs.map(a => `@${a}`).join(', ')}`);
    }

    if (failedRTs.length > 0) {
      for (const fail of failedRTs) {
        await supabase.from("activity_log").insert({
          entity_type: "auto-shill", action: "failed",
          meta: {
            name: `❌ Retweet failed: @${fail.account}`,
            tweet_url: tweetUrl,
            profile: profileUsername,
            used_account: fail.account,
            error: `Retweet failed: ${fail.error}`,
          },
        });
      }
    }
  }

  return {
    ok: true,
    replied: true,
    tweet_url: tweetUrl,
    used_account: selectedAccount,
    request_id: requestId,
    job_id: jobId,
    reply_post_id: finalConfirmedPostId,
    reply_url: finalConfirmedReplyUrl,
    retweet_accounts: retweetAccounts,
  };
}
