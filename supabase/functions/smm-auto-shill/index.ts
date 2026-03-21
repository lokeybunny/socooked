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

function normalizeXHandle(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, " ");
}

function dedupeHandles(values: unknown[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeXHandle(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function normalizeXLabel(value: unknown, fallback: string): string {
  const label = String(value || "").trim();
  return label || fallback;
}

function dedupeAccountChoices(accounts: Array<{ handle: string; label: string }>): Array<{ handle: string; label: string }> {
  const seen = new Set<string>();
  const output: Array<{ handle: string; label: string }> = [];

  for (const account of accounts) {
    const handle = normalizeXHandle(account.handle);
    if (!handle) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ handle, label: normalizeXLabel(account.label, handle) });
  }

  return output;
}

function extractXHandlesFromProfiles(profiles: any[]): string[] {
  return dedupeHandles(
    profiles.flatMap((profile: any) => {
      const connectedPlatforms = Array.isArray(profile?.connected_platforms) ? profile.connected_platforms : [];
      const socialAccounts = profile?.social_accounts || {};
      const twitterSocial = socialAccounts.twitter || socialAccounts.x || null;

      const handlesFromPlatforms = connectedPlatforms
        .filter((cp: any) => (cp?.platform === "twitter" || cp?.platform === "x") && cp?.connected)
        .flatMap((cp: any) => [cp?.handle, cp?.username, cp?.account_username, cp?.screen_name, cp?.display_name, cp?.name]);

      const handlesFromSocial = twitterSocial
        ? [
            twitterSocial?.handle,
            twitterSocial?.username,
            twitterSocial?.account_username,
            twitterSocial?.screen_name,
            twitterSocial?.display_name,
            twitterSocial?.name,
          ]
        : [];

      return [...handlesFromPlatforms, ...handlesFromSocial];
    }),
  );
}

function extractXAccountChoicesFromProfiles(profiles: any[]): Array<{ handle: string; label: string }> {
  return dedupeAccountChoices(
    profiles.flatMap((profile: any) => {
      const connectedPlatforms = Array.isArray(profile?.connected_platforms) ? profile.connected_platforms : [];
      const socialAccounts = profile?.social_accounts || {};
      const twitterSocial = socialAccounts.twitter || socialAccounts.x || null;

      const platformChoices = connectedPlatforms
        .filter((cp: any) => (cp?.platform === "twitter" || cp?.platform === "x") && cp?.connected)
        .map((cp: any) => ({
          handle: cp?.handle || cp?.username || cp?.account_username || cp?.screen_name || cp?.display_name,
          label: cp?.display_name || cp?.name || cp?.handle || cp?.username,
        }));

      const socialChoice = twitterSocial
        ? [{
            handle: twitterSocial?.handle || twitterSocial?.username || twitterSocial?.account_username || twitterSocial?.screen_name || twitterSocial?.display_name,
            label: twitterSocial?.display_name || twitterSocial?.name || twitterSocial?.handle || twitterSocial?.username,
          }]
        : [];

      return [...platformChoices, ...socialChoice];
    }),
  );
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

// ─── Load full shill config for a profile ───
async function loadShillConfig(supabase: any, profileUsername: string) {
  const { data: cfgRow } = await supabase
    .from("site_configs").select("id, content")
    .eq("site_id", "smm-auto-shill").eq("section", profileUsername).maybeSingle();
  return { row: cfgRow, content: (cfgRow?.content as any) || {} };
}

async function resolveDiscordGuildId(
  discordBotToken: string,
  cfg: any,
  explicitGuildId?: string,
): Promise<string> {
  const providedGuildId = explicitGuildId?.trim() || cfg?.discord_guild_id?.trim() || "";
  if (providedGuildId) return providedGuildId;

  const candidateChannelId = String(
    cfg?.discord_reply_channel_id || cfg?.discord_listen_channel_id || cfg?.discord_channel_id || "",
  ).trim();
  if (!candidateChannelId) return "";

  try {
    const channelRes = await fetch(`https://discord.com/api/v10/channels/${candidateChannelId}`, {
      headers: { Authorization: `Bot ${discordBotToken}` },
    });

    if (!channelRes.ok) {
      console.error("[auto-shill] Failed to resolve guild from channel:", channelRes.status, await channelRes.text());
      return "";
    }

    const channelData = await channelRes.json();
    return String(channelData?.guild_id || "").trim();
  } catch (error) {
    console.error("[auto-shill] Guild resolution error:", error);
    return "";
  }
}

// ─── Load ALL X accounts from Upload Post API (all brand profiles) ───
async function loadAllXAccountsFromProvider(): Promise<Array<{ handle: string; label: string }>> {
  const API_KEY = Deno.env.get("UPLOAD_POST_API_KEY") || Deno.env.get("DARKSIDE_SMM_API_KEY") || "";
  if (!API_KEY) {
    console.error("[auto-shill] No Upload Post API key available");
    return [];
  }

  try {
    const res = await fetch(`${API_BASE}/uploadposts/users`, {
      headers: { Authorization: `Apikey ${API_KEY}` },
    });
    if (!res.ok) {
      console.error("[auto-shill] Upload Post users fetch failed:", res.status);
      return [];
    }

    const data = await res.json();
    const profiles = data?.profiles || data?.users || data || [];
    if (!Array.isArray(profiles)) return [];

    return extractXAccountChoicesFromProfiles(profiles);
  } catch (e) {
    console.error("[auto-shill] Error fetching Upload Post users:", e);
    return [];
  }
}

// ─── Sync provider accounts into outbound_accounts CRM table ───
async function syncProviderAccountsToCrm(supabase: any, providerAccounts: Array<{ handle: string; label: string }>) {
  for (const account of providerAccounts) {
    const handle = normalizeXHandle(account.handle);
    if (!handle) continue;

    const { data: existing } = await supabase
      .from("outbound_accounts")
      .select("id")
      .eq("platform", "x")
      .eq("account_identifier", handle)
      .maybeSingle();

    if (!existing) {
      await supabase.from("outbound_accounts").insert({
        platform: "x",
        provider: "upload-post",
        account_identifier: handle,
        account_label: account.label || handle,
        is_authorized: true,
      });
      console.log(`[auto-shill] Synced new X account to CRM: @${handle}`);
    }
  }
}

// ─── Load X accounts: provider-first, CRM as backup ───
async function loadAllXAccounts(supabase: any): Promise<Array<{ handle: string; label: string }>> {
  const providerAccounts = await loadAllXAccountsFromProvider();

  if (providerAccounts.length > 0) {
    await syncProviderAccountsToCrm(supabase, providerAccounts);
  }

  const { data: crmRows } = await supabase
    .from("outbound_accounts")
    .select("account_identifier, account_label")
    .eq("platform", "x")
    .eq("is_authorized", true)
    .order("created_at", { ascending: true });

  const crmAccounts = (crmRows || []).map((row: any) => ({
    handle: row?.account_identifier,
    label: row?.account_label || row?.account_identifier,
  }));

  return dedupeAccountChoices([...providerAccounts, ...crmAccounts]);
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

async function getTrackedBotMessage(supabase: any, discordMsgId: string | null) {
  if (!discordMsgId) return null;

  const { data, error } = await supabase
    .from("activity_log")
    .select("id, action, meta, created_at")
    .eq("entity_type", "shill-bot-msg")
    .contains("meta", { discord_msg_id: discordMsgId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[auto-shill] Failed to load tracked bot message:", error.message);
    return null;
  }

  return data;
}

function isBotMessageExpired(trackedMessage: any) {
  if (!trackedMessage) return false;

  if (["expired", "cleaned"].includes(String(trackedMessage.action || ""))) {
    return true;
  }

  const meta = trackedMessage.meta as Record<string, unknown> | null;
  const expiresAt = typeof meta?.expires_at === "string"
    ? Date.parse(meta.expires_at)
    : Number.NaN;

  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function expireTrackedBotMessage(supabase: any, trackedMessage: any, discordBotToken?: string | null) {
  if (!trackedMessage) return;

  const meta = trackedMessage.meta as Record<string, unknown> | null;
  const channelId = typeof meta?.channel_id === "string" ? meta.channel_id : null;
  const botMessageId = typeof meta?.bot_message_id === "string" ? meta.bot_message_id : null;

  if (channelId && botMessageId && discordBotToken) {
    try {
      const deleteRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${botMessageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bot ${discordBotToken}` },
      });

      if (!deleteRes.ok && deleteRes.status !== 404) {
        console.error("[auto-shill] Failed to delete expired bot message:", deleteRes.status, await deleteRes.text());
      }
    } catch (error) {
      console.error("[auto-shill] Error deleting expired bot message:", error);
    }
  }

  const nextAction = channelId && botMessageId ? "cleaned" : "expired";
  await supabase
    .from("activity_log")
    .update({ action: nextAction })
    .eq("id", trackedMessage.id);
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

// ─── Helper: check if discord user is assigned by admin ───
function isUserAssigned(discordAssignments: Record<string, string>, discordUserId: string): boolean {
  return !!discordAssignments[discordUserId];
}

// ─── Helper: get available X accounts (not yet claimed) ───
function getAvailableAccounts(
  teamAccounts: string[],
  discordAssignments: Record<string, string>,
): string[] {
  const claimedAccounts = new Set(Object.values(discordAssignments));
  return teamAccounts.filter(a => !claimedAccounts.has(a));
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
  const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");

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

        const cleanupPromise = (async () => {
          try {
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

      // ─── /authorize command — link Discord user to X account ───
      if (commandName === "authorize") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUserId = discordUser.id || "unknown";
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";
        const xAccountOption = interaction.data?.options?.find((o: any) => o.name === "account");
        const xAccount = xAccountOption?.value?.replace(/^@/, "")?.trim();

        if (!xAccount) {
          return json({ type: 4, data: { content: "❌ Please provide an X account name. Usage: `/authorize account:NysonBlack`", flags: 64 } });
        }

        const profileUsername = matchedProfile || "NysonBlack";
        const { row: cfgRow, content: currentContent } = await loadShillConfig(supabase, profileUsername);

        const assignments: Record<string, string> = currentContent.discord_assignments || {};
        const crmAccounts = await loadAllXAccounts(supabase);
        const allXAccounts: string[] = crmAccounts.map((account) => account.handle);

        // ── Guard: check if the X account is in the connected accounts list ──
        if (!allXAccounts.includes(xAccount)) {
          const availableList = getAvailableAccounts(allXAccounts, assignments);
          const availableText = availableList.length > 0
            ? `\n\n📋 **Available accounts:**\n${availableList.map(a => `• \`@${a}\``).join("\n")}`
            : "\n\n⚠️ No accounts are currently available.";
          return json({ type: 4, data: { content: `❌ \`@${xAccount}\` is not a connected X account.${availableText}`, flags: 64 } });
        }

        // ── Guard: 1 user per 1 X account — check if already claimed ──
        const existingClaimant = Object.entries(assignments).find(([, acc]) => acc === xAccount);
        if (existingClaimant && existingClaimant[0] !== discordUserId) {
          return json({ type: 4, data: { content: `❌ \`@${xAccount}\` is already assigned to another team member. Pick a different account.`, flags: 64 } });
        }

        // ── Guard: user already assigned to a different account ──
        if (assignments[discordUserId] && assignments[discordUserId] !== xAccount) {
          return json({ type: 4, data: { content: `❌ You are already assigned to \`@${assignments[discordUserId]}\`. Only an admin can change your assignment.`, flags: 64 } });
        }

        // ── Guard: user already assigned to this account ──
        if (assignments[discordUserId] === xAccount) {
          return json({ type: 4, data: { content: `ℹ️ You are already authorized for \`@${xAccount}\`.`, flags: 64 } });
        }

        // Assign
        assignments[discordUserId] = xAccount;
        const discordUsernames: Record<string, string> = currentContent.discord_usernames || {};
        discordUsernames[discordUserId] = discordUsername;

        await supabase.from("site_configs").upsert({
          id: cfgRow?.id || undefined,
          site_id: "smm-auto-shill",
          section: profileUsername,
          content: { ...currentContent, discord_assignments: assignments, discord_usernames: discordUsernames },
        }, { onConflict: "id" });

        // Log authorization for audit
        await supabase.from("activity_log").insert({
          entity_type: "shill-authorization",
          action: "authorized",
          meta: {
            name: `🔑 ${discordUsername} → @${xAccount}`,
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            x_account: xAccount,
            profile: profileUsername,
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Authorized!** \`${discordUsername}\` → \`@${xAccount}\`\n\nYou'll get the hashtag assigned to this account when you click 📋 Get Shill Copy.`,
            flags: 64,
          },
        });
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

      // ── Load config to check assignments ──
      const profileUsername = matchedProfile || "NysonBlack";
      const { content: shillCfg } = await loadShillConfig(supabase, profileUsername);
      const discordAssignments: Record<string, string> = shillCfg.discord_assignments || {};

      // ── Guard: only assigned users can interact ──
      if (!isUserAssigned(discordAssignments, discordUserId)) {
        // Show available accounts they can claim
        const crmAccounts = await loadAllXAccounts(supabase);
        const allXAccounts: string[] = crmAccounts.map((account) => account.handle);
        const available = getAvailableAccounts(allXAccounts, discordAssignments);
        const availText = available.length > 0
          ? `\n\n📋 Available accounts:\n${available.map(a => `• \`@${a}\``).join("\n")}\n\nUse \`/authorize account:<name>\` to claim one.`
          : "\n\n⚠️ No accounts available right now. Ask an admin.";
        return json({
          type: 4,
          data: {
            content: `🚫 You're not assigned to any X account yet.${availText}`,
            flags: 64,
          },
        });
      }

      // ─── SHILL NOW button — record click + give URL ───
      if (customId.startsWith("shill_now_")) {
        const discordMsgId = customId.replace("shill_now_", "") || null;

        const trackedMessage = await getTrackedBotMessage(supabase, discordMsgId);
        if (isBotMessageExpired(trackedMessage)) {
          await expireTrackedBotMessage(supabase, trackedMessage, DISCORD_BOT_TOKEN);

          return json({
            type: 4,
            data: {
              content: "⏰ This shill alert has expired — find a new post.",
              flags: 64,
            },
          });
        }

        const cleanTweetUrl = (tweetUrl || "").replace(/[)\]}>]+$/, "");
        await supabase.from("shill_clicks").insert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          tweet_url: cleanTweetUrl || null,
          discord_msg_id: discordMsgId,
          source_tweet_url: cleanTweetUrl || null,
          status: "clicked",
        });

        if (discordMsgId) {
          await supabase.from("activity_log")
            .update({ action: "interacted" })
            .eq("entity_type", "shill-bot-msg")
            .eq("action", "pending")
            .like("meta->>discord_msg_id", discordMsgId);
        }

        return json({
          type: 4,
          data: {
            content: `🚀 **Go shill this tweet now!**\n${tweetUrl}\n\n✅ Job started for \`${discordUsername}\` (→ @${discordAssignments[discordUserId]})\n💰 Payment pending — post your RT receipt to confirm $0.05`,
            flags: 64,
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
          source_tweet_url: tweetUrl || null,
          status: "clicked",
        });

        if (discordMsgId) {
          await supabase.from("activity_log")
            .update({ action: "interacted" })
            .eq("entity_type", "shill-bot-msg")
            .eq("action", "pending")
            .like("meta->>discord_msg_id", discordMsgId);
        }

        const cfg = shillCfg;
        const campaignUrl = cfg?.campaign_url || "";
        const shillTicker = cfg?.ticker || "";
        const accountHashtags: Record<string, string> = cfg?.account_hashtags || {};

        if (!shillTicker) {
          return json({ type: 4, data: { content: "⚠️ No ticker configured in Auto Shill settings.", flags: 64 } });
        }

        const tickerClean = shillTicker.replace(/^\$/, "");

        // Get this user's assigned account hashtag
        const assignedXAccount = discordAssignments[discordUserId] || "";
        let userHashtag = "";
        if (assignedXAccount && accountHashtags[assignedXAccount]) {
          userHashtag = `#${accountHashtags[assignedXAccount].replace(/^#/, "")}`;
        } else {
          const availableHashtags = Object.values(accountHashtags).filter(Boolean);
          userHashtag = availableHashtags.length > 0
            ? `#${availableHashtags[Math.floor(Math.random() * availableHashtags.length)].replace(/^#/, "")}`
            : "";
        }

        const copyParts = [`${shillTicker}`, `#${tickerClean}`, `#repost`];
        if (userHashtag) {
          const insertIdx = Math.floor(Math.random() * (copyParts.length + 1));
          copyParts.splice(insertIdx, 0, userHashtag);
        }

        const copyText = copyParts.join(" ") +
          (campaignUrl ? `\n${campaignUrl}` : "");

        return json({
          type: 4,
          data: {
            content: `📋 **Shill Copy — paste this as your reply:**\n\`\`\`\n${copyText}\n\`\`\`\n🔑 Posting as \`@${assignedXAccount}\``,
            flags: 64,
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

    const { row: cfgRow, content: cfg } = await loadShillConfig(supabase, profileUsername);
    const appId = cfg?.discord_app_id;
    if (!appId) return json({ error: "No discord_app_id configured" }, 400);

    const DISCORD_BOT_TOKEN_ENV = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!DISCORD_BOT_TOKEN_ENV) return json({ error: "DISCORD_BOT_TOKEN not set" }, 500);

    const guildId = await resolveDiscordGuildId(
      DISCORD_BOT_TOKEN_ENV,
      cfg,
      body.guild_id || urlObj.searchParams.get("guild_id") || "",
    );

    // Build autocomplete choices from all connected X accounts
    const crmAccounts = await loadAllXAccounts(supabase);
    let accountChoiceRecords: Array<{ handle: string; label: string }> = crmAccounts;
    let allXAccounts: string[] = crmAccounts.map((account) => account.handle);

    if (accountChoiceRecords.length === 0) {
      allXAccounts = dedupeHandles([...(cfg?.all_x_accounts || []), ...(cfg?.team_accounts || [])]);
      accountChoiceRecords = dedupeAccountChoices(allXAccounts.map((handle) => ({ handle, label: handle })));
    }

    const accountChoices = accountChoiceRecords.slice(0, 25).map(({ handle, label }) => ({ name: `@${label}`, value: handle }));

    const commands = [
      {
        name: "shill", description: "Auto-reply to a tweet via X", type: 1,
        options: [{ name: "url", description: "The X/Twitter tweet URL", type: 3, required: true }],
      },
      {
        name: "clean", description: "Delete all bot shill messages from this channel", type: 1,
      },
      {
        name: "authorize", description: "Link your Discord account to an X account for shilling", type: 1,
        options: [{
          name: "account",
          description: "The X account to claim",
          type: 3,
          required: true,
          choices: accountChoices.length > 0 ? accountChoices : undefined,
        }],
      },
    ];

    const registerTargets = [
      {
        scope: "global",
        url: `https://discord.com/api/v10/applications/${appId}/commands`,
      },
      ...(guildId ? [{
        scope: "guild",
        url: `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
      }] : []),
    ];

    const results = [];
    for (const target of registerTargets) {
      const res = await fetch(target.url, {
        method: "PUT",
        headers: { "Authorization": `Bot ${DISCORD_BOT_TOKEN_ENV}`, "Content-Type": "application/json" },
        body: JSON.stringify(commands),
      });

      const responseText = await res.text();
      let data: unknown = responseText;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = responseText;
      }

      results.push({ scope: target.scope, status: res.status, data });
    }

    if (guildId && cfgRow?.id) {
      await supabase.from("site_configs").update({
        content: {
          ...cfg,
          discord_guild_id: guildId,
          all_x_accounts: allXAccounts,
        },
      }).eq("id", cfgRow.id);
    }

    return json({ ok: true, results });
  }

  // ─── Admin unassign endpoint ───
  if (action === "admin-unassign" && req.method === "POST") {
    const botSecret = req.headers.get("x-bot-secret");
    const authHeader = req.headers.get("authorization") || "";
    const apikeyHeader = req.headers.get("apikey") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const validKeys = [ANON_KEY, FALLBACK_ANON_KEY, SERVICE_KEY].filter(Boolean);
    const isAuthed = validKeys.some(k => apikeyHeader === k || bearerToken === k) || botSecret === BOT_SECRET;
    if (!isAuthed) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { profile_username, discord_user_id } = body;
    const section = profile_username || "NysonBlack";

    const { row: cfgRow, content: currentContent } = await loadShillConfig(supabase, section);
    const assignments: Record<string, string> = { ...(currentContent.discord_assignments || {}) };
    const removedAccount = assignments[discord_user_id] || "unknown";

    delete assignments[discord_user_id];

    await supabase.from("site_configs").upsert({
      id: cfgRow?.id || undefined,
      site_id: "smm-auto-shill",
      section,
      content: { ...currentContent, discord_assignments: assignments },
    }, { onConflict: "id" });

    // Audit log
    await supabase.from("activity_log").insert({
      entity_type: "shill-authorization",
      action: "unassigned",
      meta: {
        name: `🔓 Admin removed ${discord_user_id} from @${removedAccount}`,
        discord_user_id,
        x_account: removedAccount,
        profile: section,
      },
    });

    return json({ ok: true, removed: discord_user_id, account: removedAccount });
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

      const meRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}` },
      });
      const me = await meRes.json();
      const botUserId = me.id;

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
          await new Promise(r => setTimeout(r, 500));
        }
      }

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
        .from("site_configs").select("id, content")
        .eq("site_id", "smm-auto-shill").eq("section", profileUsername).single();

      const content = (data?.content as any) || {};
      const assignments: Record<string, string> = content.discord_assignments || {};
      const usernames: Record<string, string> = content.discord_usernames || {};

      // Auto-backfill missing usernames from activity_log
      const missingIds = Object.keys(assignments).filter(id => !usernames[id]);
      if (missingIds.length > 0) {
        const { data: logs } = await supabase
          .from("activity_log")
          .select("meta")
          .eq("entity_type", "shill-authorization")
          .eq("action", "authorized")
          .order("created_at", { ascending: false })
          .limit(500);

        for (const log of logs || []) {
          const meta = log.meta as any;
          if (meta?.discord_user_id && meta?.discord_username && !usernames[meta.discord_user_id]) {
            usernames[meta.discord_user_id] = meta.discord_username;
          }
        }

        // Persist backfilled usernames
        if (data?.id) {
          await supabase.from("site_configs").update({
            content: { ...content, discord_usernames: usernames },
          }).eq("id", data.id);
        }
      }

      return json({
        config: {
          ...content,
          discord_usernames: usernames,
        }
      });
    }

    // ─── GET authorization audit log ───
    if (action === "auth-log") {
      const { data } = await supabase
        .from("activity_log")
        .select("id, action, meta, created_at")
        .eq("entity_type", "shill-authorization")
        .order("created_at", { ascending: false })
        .limit(100);

      return json({ log: data || [] });
    }

    // ─── SAVE campaign config ───
    if (action === "save-config") {
      const body = await req.json();
      const { profile_username, enabled, campaign_url, ticker, discord_app_id, discord_public_key, discord_channel_id, discord_listen_channel_id, discord_reply_channel_id, discord_guild_id, team_accounts, retweet_accounts, account_hashtags, all_x_accounts } = body;
      const section = profile_username || "NysonBlack";

      // Preserve fields that aren't sent from the save
      const { data: existingRow } = await supabase
        .from("site_configs").select("content")
        .eq("site_id", "smm-auto-shill").eq("section", section).maybeSingle();
      const existingContent = existingRow?.content as any;

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
          discord_listen_channel_id: discord_listen_channel_id || existingContent?.discord_listen_channel_id || "",
          discord_reply_channel_id: discord_reply_channel_id || existingContent?.discord_reply_channel_id || "",
          discord_guild_id: discord_guild_id || existingContent?.discord_guild_id || "",
          team_accounts: Array.isArray(team_accounts) ? team_accounts : [],
          retweet_accounts: Array.isArray(retweet_accounts) ? retweet_accounts : [],
          account_hashtags: account_hashtags || existingContent?.account_hashtags || {},
          all_x_accounts: Array.isArray(all_x_accounts) ? all_x_accounts : existingContent?.all_x_accounts || [],
          discord_assignments: existingContent?.discord_assignments || {},
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
  const BAN_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const { data: recentActivity } = await supabase
    .from("activity_log")
    .select("*")
    .eq("entity_type", "auto-shill")
    .in("action", ["replied", "failed", "reply_banned"])
    .order("created_at", { ascending: false })
    .limit(200);

  const cooldownMap: Record<string, { until: number; reason: string }> = {};

  for (const entry of recentActivity || []) {
    const account = (entry.meta as any)?.used_account;
    if (!account || !accounts.includes(account)) continue;
    if (cooldownMap[account]) continue;

    const activityTime = new Date(entry.created_at).getTime();

    if (entry.action === "reply_banned") {
      const banEnd = activityTime + BAN_MS;
      if (banEnd > now) {
        cooldownMap[account] = { until: banEnd, reason: "Reply banned (24h)" };
        continue;
      }
    }

    if (entry.action === "replied" || entry.action === "failed") {
      const cdEnd = activityTime + COOLDOWN_MS;
      if (cdEnd > now) {
        cooldownMap[account] = { until: cdEnd, reason: "Cooldown (5m)" };
      }
    }
  }

  for (const account of accounts) {
    if (!cooldownMap[account]) {
      return { account, allInCooldown: false, cooldownInfo: "" };
    }
  }

  const soonest = accounts.reduce((best, acc) => {
    const cd = cooldownMap[acc];
    if (!cd) return acc;
    if (!best) return acc;
    return (cd.until < (cooldownMap[best]?.until || Infinity)) ? acc : best;
  }, accounts[0]);

  const remaining = cooldownMap[soonest]
    ? Math.ceil((cooldownMap[soonest].until - now) / 1000)
    : 0;

  return {
    account: soonest,
    allInCooldown: true,
    cooldownInfo: `${soonest}: ${cooldownMap[soonest]?.reason} (${remaining}s remaining)`,
  };
}

async function processAutoShill(
  supabase: any,
  tweetUrl: string,
  profileUsername: string,
  UPLOAD_POST_API_KEY: string,
  LOVABLE_API_KEY: string,
  TWITTER_BEARER_TOKEN: string | undefined,
  sendTelegram: (text: string) => Promise<void>,
  isBot: boolean,
) {
  const COOLDOWN_MS = 5 * 60 * 1000;

  const { data: shillConfigs } = await supabase
    .from("site_configs").select("content, section")
    .eq("site_id", "smm-auto-shill");

  const matchedConfig = shillConfigs?.find((r: any) => r.section === profileUsername);
  const fallbackConfig = shillConfigs?.find((r: any) => (r.content as any)?.enabled);
  const cfg = (matchedConfig?.content || fallbackConfig?.content) as any;

  if (!cfg || !cfg.enabled) {
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "skipped",
      meta: { name: `⏭️ Auto-shill disabled`, tweet_url: tweetUrl, profile: profileUsername },
    });
    return { ok: true, skipped: true, reason: "Auto-shill disabled for this profile" };
  }

  const ticker = cfg.ticker || "";
  const campaignUrl = cfg.campaign_url || "";
  const teamAccounts: string[] = cfg.team_accounts || [];
  const retweetAccounts: string[] = cfg.retweet_accounts || [];

  const { account, allInCooldown, cooldownInfo } = await findAvailableAccount(
    supabase, teamAccounts, profileUsername, COOLDOWN_MS
  );

  if (allInCooldown) {
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "cooldown",
      meta: { name: `⏳ All accounts in cooldown`, tweet_url: tweetUrl, profile: profileUsername, cooldownInfo },
    });
    await sendTelegram(`⏳ *All accounts in cooldown*\n🔗 ${tweetUrl}\n⏱ ${cooldownInfo}`);
    return { ok: true, skipped: true, reason: `All accounts in cooldown: ${cooldownInfo}` };
  }

  let replyText = "";
  try {
    const hook = await generateInterruptorHook(LOVABLE_API_KEY);
    const tickerClean = ticker.replace(/^\$/, "");
    replyText = `${hook}\n\n${ticker} #${tickerClean} #repost${campaignUrl ? `\n${campaignUrl}` : ""}`;
  } catch (e) {
    console.error("[auto-shill] Failed to generate reply:", e);
    const tickerClean = ticker.replace(/^\$/, "");
    replyText = `Nobody's gonna say it… so I will.\n\n${ticker} #${tickerClean} #repost${campaignUrl ? `\n${campaignUrl}` : ""}`;
  }

  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "failed",
      meta: { name: `❌ Invalid tweet URL`, tweet_url: tweetUrl, profile: profileUsername, error: "Could not extract tweet ID" },
    });
    return { ok: false, error: "Could not extract tweet ID from URL" };
  }

  console.log(`[auto-shill] Replying to ${tweetUrl} with account @${account}`);

  try {
    const apiPayload = {
      socialMediaPlatform: "twitter",
      type: "text",
      text: replyText,
      username: account,
      options: {
        replyTweetId: tweetId,
      },
    };

    const postRes = await fetch(`${API_BASE}/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${UPLOAD_POST_API_KEY}`,
      },
      body: JSON.stringify(apiPayload),
    });

    const postText = await postRes.text();
    console.log(`[auto-shill] Upload-Post response (${postRes.status}): ${postText.substring(0, 500)}`);

    let postData: any;
    try { postData = JSON.parse(postText); } catch { postData = { raw: postText }; }

    if (!postRes.ok) {
      const is403 = postRes.status === 403 || postText.includes("403");
      const isReplyBan = is403 || postText.toLowerCase().includes("reply") || postText.toLowerCase().includes("spam");

      if (isReplyBan) {
        await supabase.from("activity_log").insert({
          entity_type: "auto-shill", action: "reply_banned",
          meta: {
            name: `🚫 @${account} — Reply banned (403)`,
            tweet_url: tweetUrl, profile: profileUsername,
            used_account: account, error: postText.substring(0, 300),
          },
        });
        await sendTelegram(`🚫 *Reply Ban Detected*\n👤 @${account}\n🔗 ${tweetUrl}\n❌ ${postText.substring(0, 200)}\n⏱ 24h cooldown applied`);
      } else {
        await supabase.from("activity_log").insert({
          entity_type: "auto-shill", action: "failed",
          meta: {
            name: `❌ Reply failed (${postRes.status})`,
            tweet_url: tweetUrl, profile: profileUsername,
            used_account: account, error: postText.substring(0, 300),
          },
        });
        await sendTelegram(`❌ *Reply Failed*\n👤 @${account}\n🔗 ${tweetUrl}\n⚠️ ${postText.substring(0, 200)}`);
      }
      return { ok: false, error: postText.substring(0, 200) };
    }

    const postedPostId = postData?.data?.id || postData?.postId || postData?.id;
    let verificationResult = null;

    if (postedPostId && TWITTER_BEARER_TOKEN) {
      await new Promise(r => setTimeout(r, 3000));
      verificationResult = await verifyReplyOnX(postedPostId, tweetUrl, TWITTER_BEARER_TOKEN);
      console.log(`[auto-shill] X verification:`, JSON.stringify(verificationResult));
    }

    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "replied",
      meta: {
        name: `✅ Replied via @${account}`,
        tweet_url: tweetUrl, profile: profileUsername,
        used_account: account, reply_text: replyText.substring(0, 300),
        post_id: postedPostId || null,
        verified: verificationResult?.verified || false,
        verify_reason: verificationResult?.reason || null,
      },
    });

    const verifyEmoji = verificationResult?.verified ? "✅" : verificationResult ? "⚠️" : "❓";
    const verifyNote = verificationResult?.verified
      ? "Verified on X ✅"
      : verificationResult?.reason
        ? `Unverified: ${verificationResult.reason}`
        : "Verification skipped";

    await sendTelegram(
      `✅ *Auto-Shill Reply Sent!*\n👤 @${account}\n🔗 ${tweetUrl}\n💬 ${replyText.substring(0, 150)}\n${verifyEmoji} ${verifyNote}`
    );

    // Retweet with designated accounts (async, don't block)
    if (retweetAccounts.length > 0) {
      const retweetPromise = (async () => {
        const retweetedWith: string[] = [];
        for (const rtAccount of retweetAccounts) {
          try {
            const rtRes = await fetch(`${API_BASE}/post`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${UPLOAD_POST_API_KEY}`,
              },
              body: JSON.stringify({
                socialMediaPlatform: "twitter",
                type: "retweet",
                username: rtAccount,
                options: { retweetTweetId: tweetId },
              }),
            });

            if (rtRes.ok) {
              retweetedWith.push(rtAccount);
            } else {
              console.error(`[auto-shill] Retweet failed for @${rtAccount}:`, await rtRes.text());
            }
          } catch (e) {
            console.error(`[auto-shill] Retweet error for @${rtAccount}:`, e);
          }
        }

        if (retweetedWith.length > 0) {
          await supabase.from("activity_log").insert({
            entity_type: "auto-shill", action: "retweeted",
            meta: {
              name: `🔁 Retweeted by ${retweetedWith.map(a => `@${a}`).join(", ")}`,
              tweet_url: tweetUrl, profile: profileUsername,
              retweet_accounts: retweetedWith,
            },
          });
          await sendTelegram(`🔁 *Retweeted*\n${retweetedWith.map(a => `@${a}`).join(", ")}\n🔗 ${tweetUrl}`);
        }
      })();
      retweetPromise.catch(e => console.error("[auto-shill] Retweet batch error:", e));
    }

    return {
      ok: true,
      account,
      reply_text: replyText,
      post_id: postedPostId,
      verified: verificationResult?.verified || false,
    };
  } catch (err) {
    console.error("[auto-shill] Process error:", err);
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "failed",
      meta: { name: `❌ Exception: ${String(err)}`, tweet_url: tweetUrl, profile: profileUsername, used_account: account, error: String(err) },
    });
    await sendTelegram(`❌ *Auto-Shill Error*\n👤 @${account}\n🔗 ${tweetUrl}\n⚠️ ${String(err)}`);
    return { ok: false, error: String(err) };
  }
}