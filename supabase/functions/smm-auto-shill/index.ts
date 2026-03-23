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

const X_API_BASE = "https://api.x.com/2";

/** Validate that an X/Twitter URL points to a real, accessible tweet */
async function validateXLink(url: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    // Extract tweet ID from URL
    const m = url.match(/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/);
    if (!m) return { valid: false, reason: "Could not extract tweet ID from URL" };

    // Use oembed endpoint (public, no auth required) to verify tweet exists
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (res.status === 404 || res.status === 403) {
      await res.text().catch(() => {});
      return { valid: false, reason: "Tweet not found or has been deleted" };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[auto-shill] oembed validation ${res.status}: ${body}`);
      // Don't block on API errors — allow through
      return { valid: true };
    }

    const data = await res.json().catch(() => null);
    if (!data || !data.html) {
      return { valid: false, reason: "Tweet does not exist or was deleted" };
    }

    return { valid: true };
  } catch (e) {
    console.error("[auto-shill] Link validation error:", e);
    // Don't block on network errors
    return { valid: true };
  }
}

/** Speed-check: enforce minimum time between click and verify.
 *  Returns null if OK, or an error Response if too fast. 
 *  ≤5s = warning (3 warnings → revoke auth). <15s = reject. */
async function speedCheck(
  supabase: ReturnType<typeof createClient>,
  discordUserId: string,
  discordUsername: string,
  clickCreatedAt: string | null,
  role: "shill" | "raid"
): Promise<Response | null> {
  if (!clickCreatedAt) return null;

  const elapsedMs = Date.now() - new Date(clickCreatedAt).getTime();
  const elapsedSec = elapsedMs / 1000;

  // ≤5 seconds — warn + potentially revoke
  if (elapsedSec <= 5) {
    // Get current warning count from site_configs
    const warningKey = `speed_warnings_${discordUserId}`;
    const { data: existing } = await supabase
      .from("site_configs")
      .select("content")
      .eq("site_id", "speed-warnings")
      .eq("section", warningKey)
      .maybeSingle();

    const currentCount = (existing?.content as any)?.count || 0;
    const newCount = currentCount + 1;

    await supabase.from("site_configs").upsert({
      site_id: "speed-warnings",
      section: warningKey,
      content: { count: newCount, last_warning: new Date().toISOString(), discord_username: discordUsername },
      is_published: false,
    }, { onConflict: "site_id,section" });

    // 3 warnings → revoke
    if (newCount >= 3) {
      if (role === "raid") {
        await supabase.from("raiders")
          .update({ status: "revoked" })
          .eq("discord_user_id", discordUserId);
      }
      // Also remove from shill assignments
      const { data: cfgRow } = await supabase
        .from("site_configs")
        .select("id, content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", "config")
        .maybeSingle();
      if (cfgRow?.content) {
        const cfg = cfgRow.content as any;
        if (cfg.discord_assignments && cfg.discord_assignments[discordUserId]) {
          delete cfg.discord_assignments[discordUserId];
          await supabase.from("site_configs")
            .update({ content: cfg })
            .eq("id", cfgRow.id);
        }
      }

      await supabase.from("activity_log").insert({
        entity_type: "speed-violation",
        action: "revoked",
        meta: {
          name: `🚨 ${discordUsername} authorization REVOKED (3 speed violations)`,
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          role,
          warning_count: newCount,
        },
      });

      return json({
        type: 4,
        data: {
          content: `🚨 **Authorization REVOKED.**\n\nYou've been warned 3 times for verifying too quickly (${elapsedSec.toFixed(1)}s). Your ${role} access has been revoked.\n\nContact an admin to appeal.`,
          flags: 64,
        },
      });
    }

    await supabase.from("activity_log").insert({
      entity_type: "speed-violation",
      action: "warned",
      meta: {
        name: `⚠️ ${discordUsername} speed warning ${newCount}/3`,
        discord_user_id: discordUserId,
        discord_username: discordUsername,
        role,
        elapsed_seconds: elapsedSec,
        warning_count: newCount,
      },
    });

    return json({
      type: 4,
      data: {
        content: `⚠️ **Speed Warning ${newCount}/3** — You verified in ${elapsedSec.toFixed(1)}s. That's suspiciously fast.\n\n⏰ You must wait at least **15 seconds** before verifying.\n🚨 **${3 - newCount} more warning(s)** before your authorization is revoked.`,
        flags: 64,
      },
    });
  }

  // <15 seconds — reject but no warning
  if (elapsedSec < 15) {
    return json({
      type: 4,
      data: {
        content: `⏰ **Too fast!** You verified in ${elapsedSec.toFixed(0)}s. Please wait at least **15 seconds** after clicking before verifying.\n\nTry again in a moment.`,
        flags: 64,
      },
    });
  }

  return null;
}

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

// ─── Role-based access: check if member has admin, shill-team, or raid-team roles ───
const TEAM_ROLE_IDS = [
  "1484998919816613989", // shill-team
  "1485113472642715819", // raid-team
];

function isTeamMember(interaction: any): boolean {
  const discordUser = interaction.member?.user || interaction.user || {};
  const discordUsername = discordUser.username || discordUser.global_name || "";

  // Admin bypass
  if (discordUsername === "warrenguru") return true;

  const memberRoleIds: string[] = interaction.member?.roles || [];
  return memberRoleIds.some(id => TEAM_ROLE_IDS.includes(id));
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

function isBotMessageExpired(trackedMessage: any, interactionMessage?: any) {
  // If tracked message exists, check its status/expires_at
  if (trackedMessage) {
    if (["expired", "cleaned"].includes(String(trackedMessage.action || ""))) {
      return true;
    }

    const meta = trackedMessage.meta as Record<string, unknown> | null;
    const expiresAt = typeof meta?.expires_at === "string"
      ? Date.parse(meta.expires_at)
      : Number.NaN;

    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return true;
  }

  // Fallback: check the Discord message timestamp (5 min expiry)
  if (interactionMessage?.timestamp) {
    const msgTime = Date.parse(interactionMessage.timestamp);
    if (Number.isFinite(msgTime) && (Date.now() - msgTime) >= 5 * 60 * 1000) {
      return true;
    }
  }

  return false;
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

/** Lazy cleanup: find expired raid messages and delete them from Discord */
async function cleanupExpiredRaidMessages(supabase: any, discordBotToken: string | null) {
  if (!discordBotToken) return;

  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: expired } = await supabase
      .from("activity_log")
      .select("id, meta")
      .eq("entity_type", "shill-bot-msg")
      .in("action", ["pending", "interacted"])
      .lt("created_at", fiveMinAgo)
      .limit(10);

    if (!expired || expired.length === 0) return;

    for (const row of expired) {
      const meta = row.meta as Record<string, unknown> | null;
      const expiresAt = typeof meta?.expires_at === "string" ? Date.parse(meta.expires_at) : Number.NaN;
      if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) continue;

      const channelId = typeof meta?.channel_id === "string" ? meta.channel_id : null;
      const botMessageId = typeof meta?.bot_message_id === "string" ? meta.bot_message_id : null;

      if (channelId && botMessageId) {
        try {
          await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${botMessageId}`, {
            method: "DELETE",
            headers: { Authorization: `Bot ${discordBotToken}` },
          });
        } catch (_) { /* ignore */ }
      }

      await supabase.from("activity_log").update({ action: "cleaned" }).eq("id", row.id);
    }
  } catch (e) {
    console.error("[auto-shill] Lazy cleanup error:", e);
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

  /** Fire-and-forget DM to a Discord user with copy text */
  const sendCopyDM = (userId: string, text: string) => {
    if (!DISCORD_BOT_TOKEN) return;
    (async () => {
      try {
        // 1. Open/get DM channel
        const dmCh = await fetch("https://discord.com/api/v10/users/@me/channels", {
          method: "POST",
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ recipient_id: userId }),
        });
        if (!dmCh.ok) { console.error("[DM] open channel failed", dmCh.status); return; }
        const { id: channelId } = await dmCh.json();
        // 2. Send the copy text
        await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content: `📋 **Copy this:**\n\`\`\`\n${text}\n\`\`\`` }),
        });
      } catch (e) { console.error("[DM] send failed", e); }
    })();
  };

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

    // Fire-and-forget: clean up expired raid messages on every interaction
    cleanupExpiredRaidMessages(supabase, DISCORD_BOT_TOKEN).catch(() => {});

    if (interaction.type === 2) {
      const commandName = interaction.data?.name || "";

      // ─── /help command — onboarding guide (ephemeral) ───
      if (commandName === "help") {
        const helpText = [
          "**Welcome to the Shill Team!** :rocket:",
          "",
           "**How it works:**",
           "1. Use `/authorize` to link your Discord to an X account",
           "2. Use `/wallet <address>` to set your Solana payout address",
           "3. Use `/payout` to request a withdrawal once you have verified earnings",
          "",
          "**Roles:**",
          ":zap: **Shiller** — Authorized to post from a linked X account. Earn per verified click.",
          ":shield: **Raider** — Use your secret code to raid tweets. Earn $0.02 per verified reply.",
          "",
           "**Commands:**",
           "`/help` — Show this guide",
           "`/authorize` — Link your Discord to an X account",
           "`/wallet <address>` — Set your Solana wallet",
           "`/balance` — Check your verified earnings balance",
           "`/payout` — Request a payout",
           "`/notify` — Toggle DM & Telegram notifications",
           "`/clean` — Delete bot messages (admin)",
          "",
          ":link: Full guide: https://warren.guru/shillteam",
        ].join("\n");

        return json({ type: 4, data: { content: helpText, flags: 64 } });
      }

      // ─── /raidhelp command — raider-specific onboarding (ephemeral) ───
      if (commandName === "raidhelp") {
        const raidHelpText = [
          "**Welcome, Raider!** :crossed_swords:",
          "",
          "**How raiding works:**",
          "1. An admin assigns you a **secret code** — this is your unique identifier",
          "2. When a raid alert drops, click **⚔️ Raid Now** or **📋 Copy Shill** on the embed",
          "3. Copy the shill text (it includes your `#secretcode` hashtag) and paste it as a reply on X",
          "4. Click **✅ Verify Raid** and paste your reply URL as proof",
          "5. Admins verify your submission — earn **$0.02 per verified raid**",
          "",
          "**Raider Commands:**",
          "`/raidhelp` — Show this guide",
          "`/wallet <address>` — Set your Solana wallet for payouts",
          "`/payout` — Request a payout for verified earnings",
          "",
          "**Buttons on raid alerts:**",
          "⚔️ **Raid Now** — Log the raid and get your hashtag",
          "📋 **Copy Shill** — Get pre-written shill text with your code baked in",
          "✅ **Verify Raid** — Submit your X reply URL as proof of work",
          "",
          "**Tips:**",
          "• Always include your `#secretcode` in the reply so we can verify it",
          "• Set your wallet early with `/wallet` so payouts are instant",
          "• Your secret code is entered once via a popup modal on first interaction",
          "",
          ":link: Full guide: https://warren.guru/shillteam",
        ].join("\n");

        return json({ type: 4, data: { content: raidHelpText, flags: 64 } });
      }

      // ─── /adminhelp command — admin-only quick reference (ephemeral) ───
      if (commandName === "adminhelp") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        if (discordUsername !== "warrenguru") {
          return json({ type: 4, data: { content: "❌ Only admins can use `/adminhelp`.", flags: 64 } });
        }

        const adminHelpText = [
          "🔧 **Admin Command Reference**",
          "",
          "**Worker Management:**",
          "`/authx <account>` — Manually add an X account for shiller assignment",
          "`/authx2 <username> <code>` — Create a raider with a secret code/hashtag",
          "`/authorizeshiller <user> <account>` — Authorize a user as a shiller",
          "`/authorizeraider <user>` — Authorize a user as a raider",
          "",
          "**Wallet & Payouts:**",
          "`/walletcrm <user> <address>` — Set a Solana wallet for any user (public)",
          "",
          "**Channel Management:**",
          "`/welcomeshill` — Post the welcome/onboarding embed for new members",
          "`/clean` — Delete all bot messages from the current channel",
          "",
          "**User Commands (also available to you):**",
          "`/help` — General onboarding guide",
          "`/raidhelp` — Raider-specific guide",
          "`/balance` — Check earnings breakdown",
          "`/payout` — Request a payout",
          "`/wallet <address>` — Set your own wallet",
          "`/notify` — Toggle DM & Telegram alerts",
          "`/shill <url>` — Auto-reply to a tweet via X",
          "`/authorize <account>` — Link Discord to an X account",
        ].join("\n");

        return json({ type: 4, data: { content: adminHelpText, flags: 64 } });
      }

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
        try {
          // Restrict to allowed channels only
          const allowedAuthorizeChannels = ["1484998470103466156", "1484830617966481512"];
          const channelId = interaction.channel_id || interaction.channel?.id;
          if (!channelId || !allowedAuthorizeChannels.includes(channelId)) {
            return json({ type: 4, data: { content: "❌ `/authorize` can only be used in the designated authorization channels.", flags: 64 } });
          }
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

          // Use CRM-only check (skip slow external API call) for faster response
          const { data: crmRows } = await supabase
            .from("outbound_accounts")
            .select("account_identifier")
            .eq("platform", "x")
            .eq("is_authorized", true);
          const allXAccounts: string[] = (crmRows || []).map((r: any) => r.account_identifier);

          // Also check config-based accounts as fallback
          const cfgAccounts = dedupeHandles([...(currentContent?.all_x_accounts || []), ...(currentContent?.team_accounts || [])]);
          const combinedAccounts = dedupeHandles([...allXAccounts, ...cfgAccounts]);

          // ── Guard: check if the X account is in the connected accounts list ──
          if (!combinedAccounts.includes(xAccount)) {
            const availableList = getAvailableAccounts(combinedAccounts, assignments);
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
        } catch (authErr) {
          console.error("[auto-shill] /authorize error:", authErr);
          return json({ type: 4, data: { content: "❌ Something went wrong during authorization. Please try again.", flags: 64 } });
        }
      }

      // ─── /authx command — admin-only manual account authorization ───
      if (commandName === "authx") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        // Admin gate — only @warrenguru
        if (discordUsername !== "warrenguru") {
          return json({ type: 4, data: { content: "❌ Only admins can use `/authx`.", flags: 64 } });
        }

        const accountOption = interaction.data?.options?.find((o: any) => o.name === "account");
        const rawAccount = accountOption?.value?.trim();
        if (!rawAccount) {
          return json({ type: 4, data: { content: "❌ Usage: `/authx account:@SomeHandle`", flags: 64 } });
        }
        const xAccount = rawAccount.replace(/^@/, "").trim();
        if (!xAccount) {
          return json({ type: 4, data: { content: "❌ Please provide a valid X handle.", flags: 64 } });
        }

        // Check if already exists in outbound_accounts
        const { data: existing } = await supabase
          .from("outbound_accounts")
          .select("id")
          .eq("platform", "x")
          .eq("account_identifier", xAccount)
          .maybeSingle();

        if (existing) {
          return json({ type: 4, data: { content: `ℹ️ \`@${xAccount}\` is already registered as an authorized account.`, flags: 64 } });
        }

        // Insert into outbound_accounts (manual entry)
        await supabase.from("outbound_accounts").insert({
          platform: "x",
          provider: "manual",
          account_identifier: xAccount,
          account_label: xAccount,
          is_authorized: true,
        });

        // Log for audit
        await supabase.from("activity_log").insert({
          entity_type: "shill-authorization",
          action: "admin-added",
          meta: {
            name: `🔧 Admin added @${xAccount} (manual)`,
            admin_username: discordUsername,
            x_account: xAccount,
            method: "authx",
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Account added!** \`@${xAccount}\` is now available for shiller assignment.\n\nTeam members can claim it with \`/authorize account:${xAccount}\``,
            flags: 64,
          },
        });
      }

      // ─── /authx2 command — admin-only: create raider with secret code ───
      if (commandName === "authx2") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        if (discordUsername !== "warrenguru") {
          return json({ type: 4, data: { content: "❌ Only admins can use `/authx2`.", flags: 64 } });
        }

        const usernameOption = interaction.data?.options?.find((o: any) => o.name === "username");
        const codeOption = interaction.data?.options?.find((o: any) => o.name === "code");
        const targetUsername = usernameOption?.value?.trim();
        const secretCode = codeOption?.value?.trim();

        if (!targetUsername || !secretCode) {
          return json({ type: 4, data: { content: "❌ Usage: `/authx2 username:discorduser code:storm42x`", flags: 64 } });
        }

        // Validate secret code format (alphanumeric, 3-30 chars)
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(secretCode)) {
          return json({ type: 4, data: { content: "❌ Secret code must be 3-30 alphanumeric characters (letters, numbers, underscores).", flags: 64 } });
        }

        // Check if code is already in use by another raider
        const { data: codeExists } = await supabase
          .from("raiders")
          .select("id, discord_username")
          .eq("secret_code", secretCode)
          .maybeSingle();

        if (codeExists) {
          return json({ type: 4, data: { content: `❌ Code \`${secretCode}\` is already assigned to \`${codeExists.discord_username}\`. Pick a unique code.`, flags: 64 } });
        }

        // Check if raider already exists by username
        const { data: existingRaider } = await supabase
          .from("raiders")
          .select("id, secret_code, discord_user_id")
          .eq("discord_username", targetUsername)
          .maybeSingle();

        if (existingRaider) {
          // Update existing raider with new secret code
          await supabase.from("raiders").update({
            secret_code: secretCode,
            status: "active",
            updated_at: new Date().toISOString(),
          }).eq("id", existingRaider.id);
        } else {
          // Create new raider record — discord_user_id will be filled when they first interact
          await supabase.from("raiders").insert({
            discord_user_id: `pending_${targetUsername}`,
            discord_username: targetUsername,
            secret_code: secretCode,
            status: "active",
          });
        }

        // Log for audit
        await supabase.from("activity_log").insert({
          entity_type: "shill-authorization",
          action: "admin-raider-created",
          meta: {
            name: `⚔️ Admin created raider ${targetUsername} → #${secretCode}`,
            admin_username: discordUsername,
            raider_username: targetUsername,
            secret_code: secretCode,
            method: "authx2",
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Raider created!**\n\n👤 \`${targetUsername}\`\n🔑 Code: \`${secretCode}\`\n#️⃣ Hashtag: \`#${secretCode}\`\n\nThey can now use this code with \`/raidauth\` or it will auto-apply when they interact in the raid channel.`,
            flags: 64,
          },
        });
      }

      // ─── /authorizeshiller command — admin authorizes a user as a shiller ───
      if (commandName === "authorizeshiller") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        if (discordUsername !== "warrenguru") {
          return json({ type: 4, data: { content: "❌ Only admins can use `/authorizeshiller`.", flags: 64 } });
        }

        const userIdOption = interaction.data?.options?.find((o: any) => o.name === "user");
        const accountOption = interaction.data?.options?.find((o: any) => o.name === "account");
        const targetUserId = userIdOption?.value?.trim();
        const xAccount = accountOption?.value?.replace(/^@/, "")?.trim();

        if (!targetUserId || !xAccount) {
          return json({ type: 4, data: { content: "❌ Usage: `/authorizeshiller user:<discord_user_id> account:<x_handle>`", flags: 64 } });
        }

        const profileUsername = matchedProfile || "NysonBlack";
        const { row: cfgRow, content: currentContent } = await loadShillConfig(supabase, profileUsername);
        const assignments: Record<string, string> = currentContent.discord_assignments || {};

        // Check if X account is already claimed by someone else
        const existingClaimant = Object.entries(assignments).find(([, acc]) => acc === xAccount);
        if (existingClaimant && existingClaimant[0] !== targetUserId) {
          return json({ type: 4, data: { content: `❌ \`@${xAccount}\` is already assigned to <@${existingClaimant[0]}>. Unassign them first.`, flags: 64 } });
        }

        // Check if target user already has a different account
        if (assignments[targetUserId] && assignments[targetUserId] !== xAccount) {
          return json({ type: 4, data: { content: `⚠️ <@${targetUserId}> is already assigned to \`@${assignments[targetUserId]}\`. Overwriting...`, flags: 64 } });
        }

        // Assign
        assignments[targetUserId] = xAccount;
        const discordUsernames: Record<string, string> = currentContent.discord_usernames || {};

        await supabase.from("site_configs").upsert({
          id: cfgRow?.id || undefined,
          site_id: "smm-auto-shill",
          section: profileUsername,
          content: { ...currentContent, discord_assignments: assignments, discord_usernames: discordUsernames },
        }, { onConflict: "id" });

        await supabase.from("activity_log").insert({
          entity_type: "shill-authorization",
          action: "admin-authorized-shiller",
          meta: {
            name: `🔧 Admin authorized <@${targetUserId}> → @${xAccount}`,
            admin_username: discordUsername,
            target_user_id: targetUserId,
            x_account: xAccount,
            profile: profileUsername,
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Shiller authorized!**\n\n👤 <@${targetUserId}> → \`@${xAccount}\`\n\nThey can now use shill buttons and earn per verified click.`,
            flags: 64,
          },
        });
      }

      // ─── /authorizeraider command — admin authorizes a user as a raider ───
      if (commandName === "authorizeraider") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        if (discordUsername !== "warrenguru") {
          return json({ type: 4, data: { content: "❌ Only admins can use `/authorizeraider`.", flags: 64 } });
        }

        const userIdOption = interaction.data?.options?.find((o: any) => o.name === "user");
        const targetUserId = userIdOption?.value?.trim();

        if (!targetUserId) {
          return json({ type: 4, data: { content: "❌ Usage: `/authorizeraider user:<discord_user_id>`", flags: 64 } });
        }

        // Check if already a raider
        const { data: existingRaider } = await supabase
          .from("raiders")
          .select("id, status")
          .eq("discord_user_id", targetUserId)
          .maybeSingle();

        if (existingRaider?.status === "active") {
          return json({ type: 4, data: { content: `ℹ️ <@${targetUserId}> is already an active raider.`, flags: 64 } });
        }

        if (existingRaider) {
          await supabase.from("raiders").update({
            status: "active",
            updated_at: new Date().toISOString(),
          }).eq("id", existingRaider.id);
        } else {
          await supabase.from("raiders").insert({
            discord_user_id: targetUserId,
            discord_username: `user_${targetUserId}`,
            status: "active",
          });
        }

        await supabase.from("activity_log").insert({
          entity_type: "shill-authorization",
          action: "admin-authorized-raider",
          meta: {
            name: `⚔️ Admin authorized raider <@${targetUserId}>`,
            admin_username: discordUsername,
            target_user_id: targetUserId,
            method: "authorizeraider",
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Raider authorized!**\n\n👤 <@${targetUserId}> is now an active raider.\n\nThey can interact with raid alerts and earn $0.02 per verified raid.`,
            flags: 64,
          },
        });
      }

      // ─── /walletcrm command — admin sets wallet for a user (public response) ───
      if (commandName === "walletcrm") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        if (discordUsername !== "warrenguru") {
          return json({ type: 4, data: { content: "❌ Only admins can use `/walletcrm`.", flags: 64 } });
        }

        const userIdOption = interaction.data?.options?.find((o: any) => o.name === "user");
        const walletOption = interaction.data?.options?.find((o: any) => o.name === "address");
        const targetUserId = userIdOption?.value?.trim();
        const walletAddress = walletOption?.value?.trim();

        if (!targetUserId || !walletAddress) {
          return json({ type: 4, data: { content: "❌ Usage: `/walletcrm user:<discord_user_id> address:<solana_wallet>`", flags: 64 } });
        }

        const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        if (!solanaRegex.test(walletAddress)) {
          return json({ type: 4, data: { content: "❌ That doesn't look like a valid Solana address.", flags: 64 } });
        }

        // Check if target is a raider
        const { data: existingRaider } = await supabase
          .from("raiders")
          .select("id")
          .eq("discord_user_id", targetUserId)
          .maybeSingle();

        if (existingRaider) {
          await supabase.from("raiders").update({
            solana_wallet: walletAddress,
            updated_at: new Date().toISOString(),
          }).eq("id", existingRaider.id);
        } else {
          // Upsert — covers shillers who may not have a raider row yet
          await supabase.from("raiders").upsert({
            discord_user_id: targetUserId,
            discord_username: `user_${targetUserId}`,
            solana_wallet: walletAddress,
            status: "active",
          }, { onConflict: "discord_user_id" });
        }

        await supabase.from("activity_log").insert({
          entity_type: "shill-payout",
          action: "admin-wallet-set",
          meta: {
            name: `🔧 Admin set wallet for <@${targetUserId}>`,
            admin_username: discordUsername,
            target_user_id: targetUserId,
            solana_wallet: walletAddress,
          },
        });

        // Public response (no flags: 64 = visible to everyone)
        return json({
          type: 4,
          data: {
            content: `✅ **Wallet stored!**\n\n👤 <@${targetUserId}>\n💰 Wallet: \`${walletAddress}\`\n\nThis wallet is now on file and tracked in the CRM.`,
          },
        });
      }

      // ─── /wallet command — set Solana wallet address ───
      if (commandName === "wallet") {
        try {
          const discordUser = interaction.member?.user || interaction.user || {};
          const discordUserId = discordUser.id || "unknown";
          const discordUsername = discordUser.username || discordUser.global_name || "unknown";
          const walletOption = interaction.data?.options?.find((o: any) => o.name === "address");
          const walletAddress = walletOption?.value?.trim();

          if (!walletAddress) {
            return json({ type: 4, data: { content: "❌ Please provide your Solana wallet address.\nUsage: `/wallet address:<your_solana_address>`", flags: 64 } });
          }

          const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
          if (!solanaRegex.test(walletAddress)) {
            return json({ type: 4, data: { content: "❌ That doesn't look like a valid Solana address. Please double-check and try again.", flags: 64 } });
          }

          // Check if user is an authorized raider or shiller
          const { data: existingRaider } = await supabase
            .from("raiders")
            .select("id, status, solana_wallet")
            .eq("discord_user_id", discordUserId)
            .limit(1);

          const isRaider = existingRaider?.length && existingRaider[0].status === "active";

          // Check if user is an authorized shiller (has a discord assignment)
          const { data: shillConfigs } = await supabase
            .from("site_configs")
            .select("content")
            .eq("site_id", "smm-auto-shill");
          
          let isShiller = false;
          for (const row of (shillConfigs || [])) {
            const assignments = (row.content as any)?.discord_assignments || {};
            if (assignments[discordUserId]) { isShiller = true; break; }
          }

          if (!isRaider && !isShiller) {
            return json({ type: 4, data: { content: "❌ **Access denied.** You must be an authorized shiller or raider to set a wallet.\n\nShillers: use `/authorize` first.\nRaiders: get your secret code from an admin.", flags: 64 } });
          }

          if (existingRaider?.length) {
            await supabase.from("raiders").update({
              solana_wallet: walletAddress,
              updated_at: new Date().toISOString(),
            }).eq("id", existingRaider[0].id);
          } else {
            // Upsert to handle potential race conditions
            await supabase.from("raiders").upsert({
              discord_user_id: discordUserId,
              discord_username: discordUsername,
              solana_wallet: walletAddress,
              status: "active",
              rate_per_click: 0.05,
            }, { onConflict: "discord_user_id" });
          }

          await supabase.from("activity_log").insert({
            entity_type: "shill-payout",
            action: "wallet-set",
            meta: {
              name: `💰 ${discordUsername} set wallet`,
              discord_user_id: discordUserId,
              solana_wallet: walletAddress,
            },
          });

          return json({ type: 4, data: {
            content: `✅ **Wallet saved!**\n\n💰 \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\`\n\nYour Solana wallet has been registered. Use \`/payout\` anytime to request your earnings.`,
            flags: 64,
          }});
        } catch (walletErr) {
          console.error("[auto-shill] /wallet error:", walletErr);
          return json({ type: 4, data: { content: "❌ Something went wrong saving your wallet. Please try again.", flags: 64 } });
        }
      }

      // ─── /payout command — auto-submit payout request (no args needed) ───
      if (commandName === "payout") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUserId = discordUser.id || "unknown";
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        // Payouts are only available on Fridays (UTC)
        const today = new Date();
        if (today.getUTCDay() !== 5) {
          return json({ type: 4, data: { content: "❌ **Payouts are only available on Fridays.**\n\nCome back on Friday to request your earnings!", flags: 64 } });
        }

        // Check if user is an authorized raider or shiller
        const { data: existingRaider } = await supabase
          .from("raiders")
          .select("id, solana_wallet, status, rate_per_click")
          .eq("discord_user_id", discordUserId)
          .limit(1);

        const { data: shillHistory } = await supabase
          .from("shill_clicks")
          .select("id")
          .eq("discord_user_id", discordUserId)
          .limit(1);

        const isRaider = existingRaider?.length && existingRaider[0].status === "active";
        const isShiller = (shillHistory?.length ?? 0) > 0;

        if (!isRaider && !isShiller) {
          return json({ type: 4, data: { content: "❌ **Access denied.** You must be an authorized shiller or raider to request a payout.\n\nIf you're a raider, make sure your secret code is registered. If you're a shiller, complete at least one shill first.", flags: 64 } });
        }

        // Check wallet is on file
        const walletAddress = existingRaider?.[0]?.solana_wallet;
        if (!walletAddress) {
          return json({ type: 4, data: {
            content: "❌ **No wallet on file.** Please set your Solana wallet first using:\n`/wallet address:<your_solana_address>`\n\nThen come back and use `/payout` to request your earnings.",
            flags: 64,
          }});
        }

        // Calculate verified balance
        const { data: verifiedClicks } = await supabase
          .from("shill_clicks")
          .select("id, click_type, rate")
          .eq("discord_user_id", discordUserId)
          .eq("status", "verified");

        const totalVerified = verifiedClicks?.length || 0;
        const totalOwed = (verifiedClicks || []).reduce((s: number, c: any) => s + Number(c.rate || 0), 0);

        if (totalOwed <= 0) {
          return json({ type: 4, data: {
            content: `📊 You currently have **$0.00** in verified earnings.\n\n🔐 Wallet on file: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\`\n\nKeep shilling/raiding — once your work is verified, come back and use \`/payout\` to cash out!`,
            flags: 64,
          }});
        }

        // Check for existing pending request
        const { data: existingRequest } = await supabase
          .from("payout_requests")
          .select("id")
          .eq("discord_user_id", discordUserId)
          .eq("status", "pending")
          .limit(1);

        if (existingRequest?.length) {
          return json({ type: 4, data: {
            content: `⏳ **You already have a pending payout request.**\n\n💰 Amount: **$${totalOwed.toFixed(2)}**\n🔐 Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\`\n\nPlease be patient — your request is in the admin queue. If you haven't received payment within **48 hours**, please open a support ticket in the Discord server.`,
            flags: 64,
          }});
        }

        const userType = isRaider ? "raider" : "shiller";

        // Auto-create payout request with all tracked data
        await supabase.from("payout_requests").insert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          user_type: userType,
          solana_wallet: walletAddress,
          amount_owed: totalOwed,
          verified_clicks: totalVerified,
          status: "pending",
        });

        await supabase.from("activity_log").insert({
          entity_type: "shill-payout",
          action: "requested",
          meta: {
            name: `📥 ${discordUsername} requested payout $${totalOwed.toFixed(2)}`,
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            solana_wallet: walletAddress,
            amount: totalOwed,
            user_type: userType,
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Payout request submitted!**\n\n💰 Amount: **$${totalOwed.toFixed(2)}** (${totalVerified} verified clicks)\n🔐 Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\`\n📋 Type: ${userType}\n\n⏳ **Please be patient** — admin will review and process your payout. If you haven't received payment within **48 hours**, please open a support ticket in the Discord server.`,
            flags: 64,
          },
        });
      }

      // ─── /balance command — check verified earnings ───
      if (commandName === "balance") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUserId = discordUser.id || "unknown";
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        // Check if user is a raider
        const { data: existingRaider } = await supabase
          .from("raiders")
          .select("id, solana_wallet, status")
          .eq("discord_user_id", discordUserId)
          .limit(1);

        const isRaider = existingRaider?.length && existingRaider[0].status === "active";

        // Check if user is an authorized shiller (has a discord assignment)
        const { data: shillConfigs } = await supabase
          .from("site_configs")
          .select("content")
          .eq("section", "config")
          .eq("site_id", "smm-auto-shill");

        let isShiller = false;
        for (const row of (shillConfigs || [])) {
          const assignments = (row.content as any)?.discord_assignments || {};
          if (assignments[discordUserId]) { isShiller = true; break; }
        }

        // Fallback: also check if they have shill-type clicks
        if (!isShiller) {
          const { data: shillHistory } = await supabase
            .from("shill_clicks")
            .select("id")
            .eq("discord_user_id", discordUserId)
            .eq("click_type", "shill")
            .limit(1);
          if ((shillHistory?.length ?? 0) > 0) isShiller = true;
        }

        if (!isRaider && !isShiller) {
          return json({ type: 4, data: { content: "❌ **No record found.** You must be an authorized shiller or raider to check your balance.", flags: 64 } });
        }

        // Get verified clicks
        const { data: verifiedClicks } = await supabase
          .from("shill_clicks")
          .select("id, click_type, rate")
          .eq("discord_user_id", discordUserId)
          .eq("status", "verified");

        // Get pending clicks
        const { data: pendingClicks } = await supabase
          .from("shill_clicks")
          .select("id, click_type, rate")
          .eq("discord_user_id", discordUserId)
          .eq("status", "clicked");

        const verifiedList = verifiedClicks || [];
        const pendingList = pendingClicks || [];

        // Split by click_type
        const shillVerified = verifiedList.filter((c: any) => c.click_type === "shill");
        const shillPending = pendingList.filter((c: any) => c.click_type === "shill");
        const raidVerified = verifiedList.filter((c: any) => c.click_type === "raid");
        const raidPending = pendingList.filter((c: any) => c.click_type === "raid");

        const sum = (arr: any[]) => arr.reduce((s: number, c: any) => s + Number(c.rate || 0), 0);

        const totalVerified = sum(verifiedList);
        const totalPending = sum(pendingList);

        const walletAddress = existingRaider?.[0]?.solana_wallet;
        const walletLine = walletAddress
          ? `🔐 Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``
          : "⚠️ No wallet set — use `/wallet <address>` to register one";

        const lines: string[] = [
          `📊 **Balance for ${discordUsername}**`,
          "",
        ];

        if (isShiller && isRaider) {
          lines.push("**🎯 Shiller**");
          lines.push(`  ✅ Verified: **$${sum(shillVerified).toFixed(2)}** (${shillVerified.length} clicks)`);
          lines.push(`  ⏳ Pending: **$${sum(shillPending).toFixed(2)}** (${shillPending.length} clicks)`);
          lines.push("");
          lines.push("**⚔️ Raider**");
          lines.push(`  ✅ Verified: **$${sum(raidVerified).toFixed(2)}** (${raidVerified.length} clicks)`);
          lines.push(`  ⏳ Pending: **$${sum(raidPending).toFixed(2)}** (${raidPending.length} clicks)`);
          lines.push("");
          lines.push(`💰 **Combined Total — Verified: $${totalVerified.toFixed(2)} | Pending: $${totalPending.toFixed(2)}**`);
        } else if (isRaider) {
          lines.push("**⚔️ Raider**");
          lines.push(`✅ Verified: **$${sum(raidVerified).toFixed(2)}** (${raidVerified.length} clicks)`);
          lines.push(`⏳ Pending: **$${sum(raidPending).toFixed(2)}** (${raidPending.length} clicks)`);
        } else {
          lines.push("**🎯 Shiller**");
          lines.push(`✅ Verified: **$${sum(shillVerified).toFixed(2)}** (${shillVerified.length} clicks)`);
          lines.push(`⏳ Pending: **$${sum(shillPending).toFixed(2)}** (${shillPending.length} clicks)`);
        }

        lines.push("");
        lines.push(walletLine);
        lines.push("");
        lines.push(totalVerified > 0 ? "💸 Use `/payout` on **Friday** to cash out your verified balance!" : "Keep shilling/raiding — your earnings will show up here!");

        return json({ type: 4, data: {
          content: lines.join("\n"),
          flags: 64,
        }});
      }

      // ─── /notify command — toggle notification preferences ───
      if (commandName === "notify") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUserId = discordUser.id || "unknown";
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        // Fetch current prefs
        const { data: existingPrefs } = await supabase
          .from("discord_notify_prefs")
          .select("*")
          .eq("discord_user_id", discordUserId)
          .maybeSingle();

        const currentDm = existingPrefs?.notify_discord_dm ?? false;
        const currentTg = existingPrefs?.notify_telegram ?? false;
        const currentTgUser = existingPrefs?.telegram_username ?? "";

        // Show a modal with toggle info and telegram username field
        return json({
          type: 9, // MODAL
          data: {
            custom_id: "notify_settings_submit",
            title: "🔔 Notification Settings",
            components: [
              {
                type: 1,
                components: [{
                  type: 4,
                  custom_id: "discord_dm_toggle",
                  label: "Discord DM notifications (yes/no)",
                  style: 1,
                  placeholder: "yes or no",
                  value: currentDm ? "yes" : "no",
                  required: true,
                  min_length: 2,
                  max_length: 3,
                }],
              },
              {
                type: 1,
                components: [{
                  type: 4,
                  custom_id: "telegram_toggle",
                  label: "Telegram notifications (yes/no)",
                  style: 1,
                  placeholder: "yes or no",
                  value: currentTg ? "yes" : "no",
                  required: true,
                  min_length: 2,
                  max_length: 3,
                }],
              },
              {
                type: 1,
                components: [{
                  type: 4,
                  custom_id: "telegram_username_input",
                  label: "Your Telegram @ (required for TG alerts)",
                  style: 1,
                  placeholder: "@yourtelegram",
                  value: currentTgUser || "",
                  required: false,
                  max_length: 100,
                }],
              },
            ],
          },
        });
      }

      // ─── /raidauth command — self-register as a raider (no code needed) ───
      if (commandName === "raidauth") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUserId = discordUser.id || "unknown";
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        // Check if already a raider
        const { data: existingRaider } = await supabase
          .from("raiders")
          .select("id, status")
          .eq("discord_user_id", discordUserId)
          .maybeSingle();

        if (existingRaider?.status === "active") {
          return json({ type: 4, data: {
            content: `✅ You're already registered as an active raider!\n\n📊 Status: active\n💰 Earn $0.02 per verified raid\n\nUse \`/wallet\` to set your payout address.`,
            flags: 64,
          }});
        }

        // Upsert raider record
        if (existingRaider) {
          await supabase.from("raiders").update({
            status: "active",
            discord_username: discordUsername,
            updated_at: new Date().toISOString(),
          }).eq("id", existingRaider.id);
        } else {
          await supabase.from("raiders").insert({
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            status: "active",
          });
        }

        // Log registration
        await supabase.from("activity_log").insert({
          entity_type: "raider-registration",
          action: "self-registered",
          meta: {
            name: `⚔️ ${discordUsername} self-registered as raider`,
            discord_user_id: discordUserId,
            discord_username: discordUsername,
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Welcome aboard, ${discordUsername}!** ⚔️\n\nYou're now registered as a raider.\n💰 Earn **$0.02** per verified raid\n📋 Click **⚔️ Raid Now** on raid alerts to get started\n🔗 Use \`/wallet <address>\` to set your Solana payout wallet`,
            flags: 64,
          },
        });
      }

      // ─── /welcomeshill command — admin-only public welcome message ───
      if (commandName === "welcomeshill") {
        const discordUser = interaction.member?.user || interaction.user || {};
        const discordUsername = discordUser.username || discordUser.global_name || "unknown";

        if (discordUsername !== "warrenguru") {
          return json({ type: 4, data: { content: "❌ Only admins can use `/welcomeshill`.", flags: 64 } });
        }

        const embedDescription = [
          "Thanks for opening a ticket — you're one step away from earning **SOL** for social media work. Here's everything you need to get started.",
          "",
          "**💰 How You Get Paid**",
          "• **Shillers** earn **$0.05** per verified post",
          "• **Raiders** earn **$0.02** per verified raid reply",
          "• Payments in **Solana (SOL)** direct to your wallet — **every Friday**",
          "",
          "**🚀 Shiller Setup**",
          "1. `/authorize account:<X_handle>` — link your X account",
          "2. `/wallet <solana_address>` — set your payout wallet",
          "3. `/shill <tweet_url>` — auto-reply to tweets",
          "4. Click **✅ Verify** on the embed to confirm & get paid",
          "",
          "**⚔️ Raider Setup**",
          "1. Get your **secret code** from an admin",
          "2. `/raidauth` — register with your code",
          "3. `/wallet <solana_address>` — set your payout wallet",
          "4. Click **⚔️ Raid Now** on raid alerts",
          "5. Paste as a reply on X → click **✅ Verify Raid** with your URL",
          "",
          "**📋 Commands**",
          "`/help` · `/raidhelp` · `/authorize` · `/raidauth`",
          "`/wallet` · `/balance` · `/payout` · `/notify`",
          "",
          "**📲 Stay in the Loop**",
          "Use `/notify` for Discord DM or Telegram alerts when opportunities drop.",
          "Use `/balance` anytime to check verified + pending earnings.",
          "",
          "🌍 We hire **internationally** — no middleman fees, no platform cuts.",
          "Already on Fiverr or Upwork? Get paid directly in SOL here.",
        ].join("\n");

        return json({
          type: 4,
          data: {
            embeds: [{
              title: "🎉 Welcome to the Shill Team!",
              description: embedDescription,
              color: 0x9945FF,
              footer: { text: "📖 Full guide: https://warren.guru/shillteam • ❓ Questions? Drop them here!" },
            }],
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
      const interactionChannelId = interaction.channel_id || interaction.channel?.id || "";

      // Extract tweet URL from the original message's embed
      let tweetUrl = "";
      const embeds = interaction.message?.embeds || [];
      if (embeds.length > 0) {
        const desc = embeds[0].description || "";
        const urlMatch = desc.match(/https?:\/\/(x\.com|twitter\.com)\/\S+/i);
        if (urlMatch) tweetUrl = urlMatch[0].replace(/\)$/, "");
      }

      // ── RAID CHANNEL BYPASS — channel 1485050868838564030 ──
      const RAID_CHANNEL_ID = "1485050868838564030";
      const isRaidChannel = interactionChannelId === RAID_CHANNEL_ID;

      if (isRaidChannel) {
        // Upsert raider record (auto-register on first click)
        await supabase.from("raiders").upsert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          status: "active",
        }, { onConflict: "discord_user_id" });

        // Check raider status
        const { data: raider } = await supabase
          .from("raiders")
          .select("secret_code, status, total_clicks")
          .eq("discord_user_id", discordUserId)
          .maybeSingle();

        if (raider && raider.status !== "active") {
          return json({
            type: 4,
            data: {
              content: `🚫 Your raider account is currently **${raider.status}**. Contact an admin.`,
              flags: 64,
            },
          });
        }

        const raiderSecretCode = raider?.secret_code || null;

        // ── Self-raid prevention: shillers cannot raid their own verified post ──
        let selfRaidMsgId: string | null = null;
        if (customId.startsWith("shill_now_")) selfRaidMsgId = customId.replace("shill_now_", "");
        else if (customId.startsWith("shill_copy")) selfRaidMsgId = customId.replace("shill_copy_", "");
        else if (customId.startsWith("raid_verify_")) selfRaidMsgId = customId.replace("raid_verify_", "");

        if (selfRaidMsgId) {
          const selfCheckMsg = await getTrackedBotMessage(supabase, selfRaidMsgId);
          const selfMeta = selfCheckMsg?.meta as any;
          if (selfMeta?.shiller_discord_user_id === discordUserId) {
            return json({
              type: 4,
              data: {
                content: "🚫 **You can't raid your own shill!** This tweet was verified by you. Let other raiders handle it.",
                flags: 64,
              },
            });
          }
        }

        // ─── RAID NOW button ───
        if (customId.startsWith("shill_now_")) {
          const discordMsgId = customId.replace("shill_now_", "") || null;

          const trackedMessage = await getTrackedBotMessage(supabase, discordMsgId);
          if (isBotMessageExpired(trackedMessage, interaction.message)) {
            await expireTrackedBotMessage(supabase, trackedMessage, DISCORD_BOT_TOKEN);
            return json({ type: 4, data: { content: "⏰ This raid alert has expired — find a new post.", flags: 64 } });
          }

          const cleanTweetUrl = (tweetUrl || "").replace(/[)\]}>]+$/, "");
          await supabase.from("shill_clicks").insert({
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            tweet_url: cleanTweetUrl || null,
            discord_msg_id: discordMsgId,
            source_tweet_url: cleanTweetUrl || null,
            status: "clicked",
            click_type: "raid",
            rate: 0.02,
            raider_secret_code: raiderSecretCode,
          });

          // Update raider stats
          // Update raider click count
          await supabase.from("raiders")
            .update({
              total_clicks: (raider as any).total_clicks ? (raider as any).total_clicks + 1 : 1,
              updated_at: new Date().toISOString(),
            })
            .eq("discord_user_id", discordUserId);

          if (discordMsgId) {
            await supabase.from("activity_log")
              .update({ action: "interacted" })
              .eq("entity_type", "shill-bot-msg")
              .eq("action", "pending")
              .like("meta->>discord_msg_id", discordMsgId);
          }

          const cleanTweetUrlDisplay = (tweetUrl || "").replace(/[)\]}>]+$/, "");
          return json({
            type: 4,
            data: {
              content: cleanTweetUrlDisplay
                ? `⚔️ **Go raid this tweet now!**\n${cleanTweetUrlDisplay}\n\n💡 Use **📋 Get Shill Copy** for ready-to-paste text.`
                : `⚔️ Raid logged for \`${discordUsername}\` — use 📋 Get Shill Copy for your post text.`,
              flags: 64,
            },
          });
        }

        // ─── Get Raid Copy button ───
        if (customId.startsWith("shill_copy")) {
          const discordMsgId = customId.replace("shill_copy_", "") || null;

          const cleanTweetUrl2 = (tweetUrl || "").replace(/[)\]}>]+$/, "");
          await supabase.from("shill_clicks").insert({
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            tweet_url: cleanTweetUrl2 || null,
            discord_msg_id: discordMsgId,
            source_tweet_url: cleanTweetUrl2 || null,
            status: "clicked",
            click_type: "raid",
            rate: 0.02,
            raider_secret_code: raiderSecretCode,
          });

          if (discordMsgId) {
            await supabase.from("activity_log")
              .update({ action: "interacted" })
              .eq("entity_type", "shill-bot-msg")
              .eq("action", "pending")
              .like("meta->>discord_msg_id", discordMsgId);
          }

          // Load shill config for copy text
          const raidProfileUsername = matchedProfile || "NysonBlack";
          const { content: raidCfg } = await loadShillConfig(supabase, raidProfileUsername);
          const campaignUrl = raidCfg?.campaign_url || "";
          const shillTicker = raidCfg?.ticker || "";

          if (!shillTicker) {
            return json({ type: 4, data: { content: "⚠️ No ticker configured in Auto Shill settings.", flags: 64 } });
          }

          const tickerClean = shillTicker.replace(/^\$/, "");
          // Raider's secret code is their unique hashtag
          const raidHashtag = `#${raiderSecretCode}`;

          const copyParts = [`${shillTicker}`, `#${tickerClean}`, `#repost`];
          // Insert raider's secret code hashtag at random position
          const insertIdx = Math.floor(Math.random() * (copyParts.length + 1));
          copyParts.splice(insertIdx, 0, raidHashtag);

          const copyText = copyParts.join(" ") + (campaignUrl ? `\n${campaignUrl}` : "");

          sendCopyDM(discordUserId, copyText);
          return json({
            type: 4,
            data: {
              content: `${copyText}`,
              flags: 64,
            },
          });
        }

        // ─── Verify Raid button — show modal to enter raid URL ───
        if (customId.startsWith("raid_verify_")) {
          const discordMsgId = customId.replace("raid_verify_", "") || null;

          return json({
            type: 9,
            data: {
              custom_id: `raid_verify_submit_${discordMsgId || "unknown"}`,
              title: "✅ Verify Your Raid",
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 4,
                      custom_id: "raid_url_input",
                      label: "Paste your raid reply URL",
                      style: 1,
                      placeholder: "https://x.com/yourhandle/status/123456...",
                      required: true,
                      min_length: 10,
                      max_length: 300,
                    },
                  ],
                },
              ],
            },
          });
        }

        // ─── Bad Link button (raid room) — raider flags a bad shill URL ───
        if (customId.startsWith("bad_link_")) {
          const discordMsgId = customId.replace("bad_link_", "") || null;

          return json({
            type: 9,
            data: {
              custom_id: `bad_link_confirm_${discordMsgId || "unknown"}`,
              title: "🚫 Report Bad Link",
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 4,
                      custom_id: "bad_link_confirm_input",
                      label: "Type YES to confirm this is a bad link",
                      style: 1,
                      placeholder: "YES",
                      required: true,
                      min_length: 2,
                      max_length: 10,
                    },
                  ],
                },
              ],
            },
          });
        }

        return json({ type: 4, data: { content: "❓ Unknown action.", flags: 64 } });
      }

      // ── Load config to check assignments (non-raid channels) ──
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
        if (isBotMessageExpired(trackedMessage, interaction.message)) {
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

        const cleanTweetUrlDisplay = (tweetUrl || "").replace(/[)\]}>]+$/, "");
        return json({
          type: 4,
          data: {
            content: cleanTweetUrlDisplay
              ? `🚀 **Go shill this tweet now!**\n${cleanTweetUrlDisplay}\n\n💡 Use **📋 Get Shill Copy** for ready-to-paste text.`
              : `🚀 Click recorded! Use **📋 Get Shill Copy** for your post text.`,
            flags: 64,
          },
        });
      }

      // ─── Get Shill Copy button ───
      if (customId.startsWith("shill_copy")) {
        const discordMsgId = customId.replace("shill_copy_", "") || null;

        const cleanTweetUrl2 = (tweetUrl || "").replace(/[)\]}>]+$/, "");
        await supabase.from("shill_clicks").insert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          tweet_url: cleanTweetUrl2 || null,
          discord_msg_id: discordMsgId,
          source_tweet_url: cleanTweetUrl2 || null,
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

        // ── Helper: pick N random unique items from array ──
        const pickRandom = <T>(arr: T[], n = 1): T[] => {
          const shuffled = [...arr].sort(() => Math.random() - 0.5);
          return shuffled.slice(0, Math.min(n, arr.length));
        };

        // ── RAID CHANNEL: random supportive comment with ticker, no link ──
        if (isRaidChannel) {
          const intros = [
            "", "yo ", "bro ", "ngl ", "fr ", "honestly ", "lowkey ", "no cap ", "deadass ",
            "listen ", "aye ", "real talk ", "facts ", "bruh ", "ok but ",
          ];
          const templates = [
            `{T} is the one`,
            `LFG {T}`,
            `{T} looking absolutely insane rn`,
            `bullish on {T}`,
            `{T} about to change lives`,
            `sleeping on {T} is crazy`,
            `{T} community is built different`,
            `imagine not holding {T} rn`,
            `{T} vibes are immaculate`,
            `{T} to the moon`,
            `this is why {T} hits different`,
            `{T} gang wya`,
            `{T} szn is here`,
            `can't stop won't stop {T}`,
            `{T} believers eating good`,
            `{T} is inevitable`,
            `the {T} chart speaks for itself`,
            `{T} fam we in here`,
            `{T} making moves silently`,
            `once you see {T} you can't unsee it`,
            `{T} is just getting started`,
            `{T} holders know what's up`,
            `{T} energy is unmatched`,
            `{T} built for this`,
            `love what {T} is doing`,
            `{T} different breed`,
            `{T} got that momentum`,
            `everybody sleeping on {T}`,
            `{T} about to flip everything`,
            `{T} is a movement not a moment`,
          ];
          const emojiPool = ["🔥", "🚀", "💎", "🐂", "🙌", "💰", "💪", "😂", "✨", "🌙", "💯", "🫡", "📈", "🏆", "🍽️", "🤝", "🤫", "👀", "⚡", "🎯", "😤", "🐐", "💸", "🤑", "🥇", "👑", "🦍", "💥", "🌊", "❤️‍🔥"];

          const intro = pickRandom(intros, 1)[0];
          const template = pickRandom(templates, 1)[0].replace("{T}", shillTicker);
          const emojis = pickRandom(emojiPool, 2 + Math.floor(Math.random() * 2)).join("");
          const randomComment = `${intro}${template} ${emojis}`;

          sendCopyDM(discordUserId, randomComment);
          return json({
            type: 4,
            data: {
              content: `${randomComment}`,
              flags: 64,
            },
          });
        }

        // ── SHILL CHANNEL: randomized copy with hashtags + campaign link ──
        const copyParts = [`${shillTicker}`, `#${tickerClean}`, `#repost`];
        if (userHashtag) {
          const insertIdx = Math.floor(Math.random() * (copyParts.length + 1));
          copyParts.splice(insertIdx, 0, userHashtag);
        }
        // Shuffle hashtag order so every click looks different
        for (let i = copyParts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copyParts[i], copyParts[j]] = [copyParts[j], copyParts[i]];
        }

        const shillEmojis = ["🔥", "🚀", "💎", "📈", "⚡", "💪", "✨", "🏆", "💯", "🌊"];
        const randomEmoji = shillEmojis[Math.floor(Math.random() * shillEmojis.length)];

        const copyText = `${randomEmoji} ` + copyParts.join(" ") +
          (campaignUrl ? `\n${campaignUrl}` : "");

        sendCopyDM(discordUserId, copyText);
        return json({
          type: 4,
          data: {
            content: `${copyText}`,
            flags: 64,
          },
        });
        }

        // ─── Verify button (shill room) — shiller submits their post URL ───
        if (customId.startsWith("shill_verify_")) {
          const discordMsgId = customId.replace("shill_verify_", "") || null;

          // Check the user has clicked at least one button (shill_now or shill_copy) first
          const { data: userClicks } = await supabase
            .from("shill_clicks")
            .select("id")
            .eq("discord_user_id", discordUserId)
            .eq("discord_msg_id", discordMsgId)
            .eq("status", "clicked")
            .limit(1);

          if (!userClicks?.length) {
            return json({ type: 4, data: { content: "❌ You need to click **🚀 SHILL NOW** or **📋 Get Shill Copy** first before verifying.", flags: 64 } });
          }

          return json({
            type: 9,
            data: {
              custom_id: `shill_verify_submit_${discordMsgId || "unknown"}`,
              title: "✅ Verify Your Shill",
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 4,
                      custom_id: "shill_verify_url_input",
                      label: "Paste the URL where you posted",
                      style: 1,
                      placeholder: "https://x.com/yourhandle/status/123456...",
                      required: true,
                      min_length: 10,
                      max_length: 300,
                    },
                  ],
                },
              ],
            },
          });
        }

        return json({ type: 4, data: { content: "❓ Unknown action.", flags: 64 } });
    }

    // ─── Modal submit (type 5) — raider secret code entry ───
    if (interaction.type === 5) {
      const customId = interaction.data?.custom_id || "";
      const discordUser = interaction.member?.user || interaction.user || {};
      const discordUserId = discordUser.id || "unknown";
      const discordUsername = discordUser.username || discordUser.global_name || "unknown";

      if (customId.startsWith("raider_code_submit_")) {
        // Extract the entered code from modal components
        const components = interaction.data?.components || [];
        let enteredCode = "";
        for (const row of components) {
          for (const comp of row.components || []) {
            if (comp.custom_id === "secret_code_input") {
              enteredCode = (comp.value || "").trim().replace(/^#/, "");
            }
          }
        }

        if (!enteredCode) {
          return json({ type: 4, data: { content: "❌ No code entered. Try again.", flags: 64 } });
        }

        // Validate: check if this code exists in any raider record (admin pre-generated it)
        // Or check site_configs for generated codes
        // For now, accept any non-empty code and assign it to the raider
        // Upsert raider with the secret code
        const { error: upsertErr } = await supabase.from("raiders").upsert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          secret_code: enteredCode,
        }, { onConflict: "discord_user_id" });

        if (upsertErr) {
          console.error("[auto-shill] Raider code upsert error:", upsertErr.message);
          return json({ type: 4, data: { content: "❌ Failed to save your code. Try again later.", flags: 64 } });
        }

        // Log registration
        await supabase.from("activity_log").insert({
          entity_type: "raider-registration",
          action: "code-submitted",
          meta: {
            name: `⚔️ ${discordUsername} registered with code #${enteredCode}`,
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            secret_code: enteredCode,
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Welcome aboard, ${discordUsername}!**\n\n🔑 Your raider code: \`#${enteredCode}\`\n⚔️ You're now ready to raid! Click the buttons on any alert to get started.\n💰 $0.02 per verified raid`,
            flags: 64,
          },
        });
      }

      // ─── Raid verify modal submit — user provides their raid reply URL ───
      if (customId.startsWith("raid_verify_submit_")) {
        const discordMsgId = customId.replace("raid_verify_submit_", "") || null;

        // Extract URL from modal
        const components = interaction.data?.components || [];
        let raidUrl = "";
        for (const row of components) {
          for (const comp of row.components || []) {
            if (comp.custom_id === "raid_url_input") {
              raidUrl = (comp.value || "").trim();
            }
          }
        }

        if (!raidUrl) {
          return json({ type: 4, data: { content: "❌ No URL provided. Try again.", flags: 64 } });
        }

        // Basic URL validation
        const isValidUrl = /https?:\/\/(x\.com|twitter\.com)\/\S+/i.test(raidUrl);
        if (!isValidUrl) {
          return json({ type: 4, data: { content: "❌ That doesn't look like a valid X/Twitter URL. Please paste the direct link to your reply.", flags: 64 } });
        }

        // Live link validation — check the tweet actually exists
        const raidLinkCheck = await validateXLink(raidUrl);
        if (!raidLinkCheck.valid) {
          return json({ type: 4, data: { content: `❌ **Broken link detected.** ${raidLinkCheck.reason || "The tweet doesn't exist or was deleted."}`, flags: 64 } });
        }

        // Get raider info
        const { data: raider } = await supabase
          .from("raiders")
          .select("secret_code, status, rate_per_click")
          .eq("discord_user_id", discordUserId)
          .maybeSingle();

        if (!raider || raider.status !== "active") {
          return json({ type: 4, data: { content: "🚫 Your raider account is not active. Contact an admin.", flags: 64 } });
        }

        // Extract the original tweet URL from the embed of the bot message
        // We'll store it from the interaction's message context
        let sourceTweetUrl = "";
        const embeds = interaction.message?.embeds || [];
        if (embeds.length > 0) {
          const desc = embeds[0].description || "";
          const urlMatch = desc.match(/https?:\/\/(x\.com|twitter\.com)\/\S+/i);
          if (urlMatch) sourceTweetUrl = urlMatch[0].replace(/[)\]}>]+$/, "");
        }

        // Check for duplicate verification with this exact URL
        const { data: existingVerify } = await supabase
          .from("shill_clicks")
          .select("id")
          .eq("discord_user_id", discordUserId)
          .eq("receipt_tweet_url", raidUrl)
          .limit(1);

        if (existingVerify?.length) {
          return json({ type: 4, data: { content: "⚠️ You've already submitted this URL for verification.", flags: 64 } });
        }

        // Speed check — find most recent raid click for this user on this message
        const { data: recentRaidClick } = await supabase
          .from("shill_clicks")
          .select("created_at")
          .eq("discord_user_id", discordUserId)
          .eq("click_type", "raid")
          .order("created_at", { ascending: false })
          .limit(1);

        // Also check shill click for same msg (they may have clicked shill_now first)
        const { data: recentShillClick } = await supabase
          .from("shill_clicks")
          .select("created_at")
          .eq("discord_user_id", discordUserId)
          .eq("discord_msg_id", discordMsgId !== "unknown" ? discordMsgId : null)
          .eq("click_type", "shill")
          .order("created_at", { ascending: false })
          .limit(1);

        const raidClickTime = recentRaidClick?.[0]?.created_at || recentShillClick?.[0]?.created_at || null;
        const raidSpeedResult = await speedCheck(supabase, discordUserId, discordUsername, raidClickTime, "raid");
        if (raidSpeedResult) return raidSpeedResult;

        // Insert verification record for admin auditing
        await supabase.from("shill_clicks").insert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          tweet_url: sourceTweetUrl || null,
          source_tweet_url: sourceTweetUrl || null,
          receipt_tweet_url: raidUrl,
          discord_msg_id: discordMsgId !== "unknown" ? discordMsgId : null,
          status: "pending_verification",
          click_type: "raid",
          rate: raider.rate_per_click || 0.02,
          raider_secret_code: raider.secret_code || null,
        });

        // Audit log
        await supabase.from("activity_log").insert({
          entity_type: "raid-verification",
          action: "submitted",
          meta: {
            name: `✅ ${discordUsername} submitted raid verification`,
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            raid_url: raidUrl,
            source_tweet_url: sourceTweetUrl,
            secret_code: raider.secret_code,
          },
        });

        return json({
          type: 4,
          data: {
            content: `✅ **Raid verification submitted!**\n\n🔗 Your reply: ${raidUrl}\n🔑 Code: \`#${raider.secret_code || "N/A"}\`\n\n⏳ An admin will review your raid before payout. Once verified, it will count toward your earnings.\n\n💡 Use \`/payout\` when you're ready to cash out verified work.`,
            flags: 64,
          },
        });
      }

      // ─── Shill verify modal submit — shiller provides their post URL (instant verification) ───
      if (customId.startsWith("shill_verify_submit_")) {
        const discordMsgId = customId.replace("shill_verify_submit_", "") || null;

        const components = interaction.data?.components || [];
        let verifyUrl = "";
        for (const row of components) {
          for (const comp of row.components || []) {
            if (comp.custom_id === "shill_verify_url_input") {
              verifyUrl = (comp.value || "").trim();
            }
          }
        }

        if (!verifyUrl) {
          return json({ type: 4, data: { content: "❌ No URL provided. Try again.", flags: 64 } });
        }

        const isValidUrl = /https?:\/\/(x\.com|twitter\.com)\/\S+/i.test(verifyUrl);
        if (!isValidUrl) {
          return json({ type: 4, data: { content: "❌ That doesn't look like a valid X/Twitter URL.", flags: 64 } });
        }

        // Live link validation — check the tweet actually exists
        const shillLinkCheck = await validateXLink(verifyUrl);
        if (!shillLinkCheck.valid) {
          return json({ type: 4, data: { content: `❌ **Broken link detected.** ${shillLinkCheck.reason || "The tweet doesn't exist or was deleted."}\n\nPlease submit a valid, live URL.`, flags: 64 } });
        }

        // Find this user's pending click for this message and verify it immediately
        const { data: pendingClick } = await supabase
          .from("shill_clicks")
          .select("id, created_at")
          .eq("discord_user_id", discordUserId)
          .eq("discord_msg_id", discordMsgId !== "unknown" ? discordMsgId : null)
          .eq("status", "clicked")
          .order("created_at", { ascending: false })
          .limit(1);

        if (!pendingClick?.length) {
          return json({ type: 4, data: { content: "❌ No pending shill click found. Click **🚀 SHILL NOW** first.", flags: 64 } });
        }

        // Speed check — must wait ≥15s after clicking SHILL NOW
        const shillSpeedResult = await speedCheck(supabase, discordUserId, discordUsername, pendingClick[0].created_at, "shill");
        if (shillSpeedResult) return shillSpeedResult;

        // Mark as verified immediately
        await supabase.from("shill_clicks").update({
          status: "verified",
          verified_at: new Date().toISOString(),
          receipt_tweet_url: verifyUrl,
        }).eq("id", pendingClick[0].id);

        // Audit log
        await supabase.from("activity_log").insert({
          entity_type: "shill-verification",
          action: "self-verified",
          meta: {
            name: `✅ ${discordUsername} self-verified shill`,
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            verify_url: verifyUrl,
            discord_msg_id: discordMsgId,
          },
        });

        // ── Forward the verified URL to the raid room as a new alert ──
        const RAID_REPLY_CHANNEL = "1485050868838564030";
        const DISCORD_BOT_TOKEN_ENV = Deno.env.get("DISCORD_BOT_TOKEN");

        if (DISCORD_BOT_TOKEN_ENV) {
          const expiresAtMs = Date.now() + 5 * 60 * 1000;
          const expiresAt = Math.floor(expiresAtMs / 1000);

          const raidEmbed = {
            title: "⚔️ New Raid Target — Verified Shill",
            description: `**Shilled by:** ${discordUsername}\n[Open Tweet](${verifyUrl})`,
            color: 0x00FF00,
            footer: { text: "⏱️ Auto-deletes in 5 minutes" },
            fields: [
              { name: "⏰ Expires", value: `<t:${expiresAt}:R>`, inline: true },
            ],
          };

          const raidMsgId = `sv_${Date.now()}`;
          const raidButtonRow = [
            { type: 2, style: 1, label: "⚔️ RAID NOW", custom_id: `shill_now_${raidMsgId}` },
            { type: 2, style: 3, label: "✅ Verify Raid", custom_id: `raid_verify_${raidMsgId}` },
            { type: 2, style: 4, label: "🚫 Bad Link", custom_id: `bad_link_${raidMsgId}` },
          ];

          try {
            const raidRes = await fetch(`https://discord.com/api/v10/channels/${RAID_REPLY_CHANNEL}/messages`, {
              method: "POST",
              headers: {
                Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                embeds: [raidEmbed],
                components: [{ type: 1, components: raidButtonRow }],
              }),
            });

            if (raidRes.ok) {
              const raidBotMsg = await raidRes.json();
              // Track for auto-cleanup
              await supabase.from("activity_log").insert({
                entity_type: "shill-bot-msg",
                action: "pending",
                meta: {
                  bot_message_id: raidBotMsg.id,
                  channel_id: RAID_REPLY_CHANNEL,
                  discord_msg_id: raidMsgId,
                  tweet_url: verifyUrl,
                  shiller_discord_user_id: discordUserId,
                  shiller_discord_username: discordUsername,
                  expires_at: new Date(expiresAtMs).toISOString(),
                },
              });
            } else {
              console.error("[auto-shill] Failed to forward to raid room:", await raidRes.text());
            }
          } catch (e) {
            console.error("[auto-shill] Raid room forward error:", e);
          }
        }

        return json({
          type: 4,
          data: {
            content: `✅ **Shill verified!** 💰\n\n🔗 Your post: ${verifyUrl}\n👤 \`${discordUsername}\`\n\n✅ Payment confirmed ($0.05)\n📡 Your link has been forwarded to the raid room for raiders to boost!`,
            flags: 64,
          },
        });
      }

      // ─── Bad Link confirmation modal submit — raider confirms bad link ───
      if (customId.startsWith("bad_link_confirm_")) {
        const discordMsgId = customId.replace("bad_link_confirm_", "") || null;

        const components = interaction.data?.components || [];
        let confirmValue = "";
        for (const row of components) {
          for (const comp of row.components || []) {
            if (comp.custom_id === "bad_link_confirm_input") {
              confirmValue = (comp.value || "").trim().toUpperCase();
            }
          }
        }

        if (confirmValue !== "YES") {
          return json({ type: 4, data: { content: "❌ Action cancelled. Type `YES` to confirm a bad link.", flags: 64 } });
        }

        // Get the tweet URL from the message embed
        let badTweetUrl = "";
        const embeds = interaction.message?.embeds || [];
        if (embeds.length > 0) {
          const desc = embeds[0].description || "";
          const urlMatch = desc.match(/https?:\/\/(x\.com|twitter\.com)\/\S+/i);
          if (urlMatch) badTweetUrl = urlMatch[0].replace(/[)\]}>]+$/, "");
        }

        // Find the shiller who verified this link (check the bot message tracker)
        let shillerUserId: string | null = null;
        let shillerUsername: string | null = null;

        if (discordMsgId) {
          const { data: trackedMsg } = await supabase
            .from("activity_log")
            .select("meta")
            .eq("entity_type", "shill-bot-msg")
            .contains("meta", { discord_msg_id: discordMsgId })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (trackedMsg) {
            const meta = trackedMsg.meta as any;
            shillerUserId = meta?.shiller_discord_user_id || null;
            shillerUsername = meta?.shiller_discord_username || null;
          }
        }

        // Also find by receipt_tweet_url match
        if (badTweetUrl) {
          const { data: verifiedClicks } = await supabase
            .from("shill_clicks")
            .select("id, discord_user_id, discord_username")
            .eq("receipt_tweet_url", badTweetUrl)
            .eq("status", "verified")
            .limit(10);

          if (verifiedClicks?.length) {
            // Unverify all matching verified clicks
            for (const click of verifiedClicks) {
              await supabase.from("shill_clicks").update({
                status: "flagged_bad",
                verified_at: null,
              }).eq("id", click.id);

              if (!shillerUserId) {
                shillerUserId = click.discord_user_id;
                shillerUsername = click.discord_username;
              }
            }
          }
        }

        // Also unverify by shiller user ID if we found one
        if (shillerUserId && discordMsgId) {
          await supabase.from("shill_clicks").update({
            status: "flagged_bad",
            verified_at: null,
          })
          .eq("discord_user_id", shillerUserId)
          .eq("receipt_tweet_url", badTweetUrl)
          .eq("status", "verified");
        }

        // Mark the bot message as expired/stopped
        if (discordMsgId) {
          await supabase.from("activity_log")
            .update({ action: "flagged_bad" })
            .eq("entity_type", "shill-bot-msg")
            .contains("meta", { discord_msg_id: discordMsgId });
        }

        // Delete the raid room bot message to stop the shill
        const DISCORD_BOT_TOKEN_ENV = Deno.env.get("DISCORD_BOT_TOKEN");
        if (DISCORD_BOT_TOKEN_ENV && interaction.message?.id && interaction.channel_id) {
          try {
            await fetch(`https://discord.com/api/v10/channels/${interaction.channel_id}/messages/${interaction.message.id}`, {
              method: "DELETE",
              headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}` },
            });
          } catch (e) {
            console.error("[auto-shill] Failed to delete bad link message:", e);
          }
        }

        // Audit log
        await supabase.from("activity_log").insert({
          entity_type: "shill-bad-link",
          action: "flagged",
          meta: {
            name: `🚫 ${discordUsername} flagged bad link`,
            flagged_by_discord_user_id: discordUserId,
            flagged_by_discord_username: discordUsername,
            shiller_discord_user_id: shillerUserId,
            shiller_discord_username: shillerUsername,
            bad_url: badTweetUrl,
            discord_msg_id: discordMsgId,
          },
        });

        const shillerNote = shillerUsername ? `\n👤 Shiller: \`${shillerUsername}\` — payment unverified` : "";

        return json({
          type: 4,
          data: {
            content: `🚫 **Bad link confirmed!**\n\n🔗 ${badTweetUrl || "Unknown URL"}${shillerNote}\n\n✅ Shill stopped and shiller's payment has been revoked.\n🙏 Thanks for keeping the team honest, \`${discordUsername}\`!`,
            flags: 64,
          },
        });
      }

      // ─── Notify settings modal submit ───
      if (customId === "notify_settings_submit") {
        const components = interaction.data?.components || [];
        let dmToggle = "no";
        let tgToggle = "no";
        let tgUsername = "";

        for (const row of components) {
          for (const comp of row.components || []) {
            if (comp.custom_id === "discord_dm_toggle") dmToggle = (comp.value || "no").trim().toLowerCase();
            if (comp.custom_id === "telegram_toggle") tgToggle = (comp.value || "no").trim().toLowerCase();
            if (comp.custom_id === "telegram_username_input") tgUsername = (comp.value || "").trim().replace(/^@/, "");
          }
        }

        const wantsDm = dmToggle === "yes" || dmToggle === "y";
        const wantsTg = tgToggle === "yes" || tgToggle === "y";

        // Require telegram username if telegram notifications enabled
        if (wantsTg && !tgUsername) {
          return json({ type: 4, data: { content: "❌ You must provide your Telegram @ username to enable Telegram notifications.", flags: 64 } });
        }

        const { error: upsertErr } = await supabase.from("discord_notify_prefs").upsert({
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          notify_discord_dm: wantsDm,
          notify_telegram: wantsTg,
          telegram_username: tgUsername || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "discord_user_id" });

        if (upsertErr) {
          console.error("[auto-shill] Notify prefs upsert error:", upsertErr.message);
          return json({ type: 4, data: { content: "❌ Failed to save notification preferences. Try again.", flags: 64 } });
        }

        const statusLines: string[] = [];
        statusLines.push(`📬 Discord DM: **${wantsDm ? "ON ✅" : "OFF ❌"}**`);
        statusLines.push(`📱 Telegram: **${wantsTg ? "ON ✅" : "OFF ❌"}**`);
        if (wantsTg && tgUsername) statusLines.push(`🔗 Telegram user: @${tgUsername}`);

        return json({
          type: 4,
          data: {
            content: `🔔 **Notification settings updated!**\n\n${statusLines.join("\n")}\n\nYou'll be notified when new shill/raid alerts drop.`,
            flags: 64,
          },
        });
      }

      return json({ type: 4, data: { content: "❓ Unknown modal.", flags: 64 } });
    }

    return json({ type: 1 });
  }

  // ─── CLEANUP EXPIRED raid messages (manual/cron trigger) ───
  if (action === "cleanup-expired") {
    const DISCORD_BOT_TOKEN_ENV = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!DISCORD_BOT_TOKEN_ENV) return json({ error: "DISCORD_BOT_TOKEN not set" }, 500);

    const { data: expired } = await supabase
      .from("activity_log")
      .select("id, meta")
      .eq("entity_type", "shill-bot-msg")
      .in("action", ["pending", "interacted"])
      .limit(50);

    let cleaned = 0;
    for (const row of expired || []) {
      const meta = row.meta as Record<string, unknown> | null;
      const expiresAt = typeof meta?.expires_at === "string" ? Date.parse(meta.expires_at) : Number.NaN;
      if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) continue;

      const channelId = typeof meta?.channel_id === "string" ? meta.channel_id : null;
      const botMessageId = typeof meta?.bot_message_id === "string" ? meta.bot_message_id : null;

      if (channelId && botMessageId) {
        try {
          await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${botMessageId}`, {
            method: "DELETE",
            headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}` },
          });
        } catch (_) { /* ignore */ }
      }

      await supabase.from("activity_log").update({ action: "cleaned" }).eq("id", row.id);
      cleaned++;
    }

    return json({ ok: true, cleaned });
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
        name: "help", description: "View all commands and how to get started", type: 1,
      },
      {
        name: "raidhelp", description: "Raider guide — how to raid, verify, and get paid", type: 1,
      },
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
      {
        name: "payout", description: "Request a payout for your verified earnings", type: 1,
      },
      {
        name: "wallet", description: "Set your Solana wallet address for payouts", type: 1,
        options: [{ name: "address", description: "Your Solana public address", type: 3, required: true }],
      },
      {
        name: "notify", description: "Toggle shill/raid notifications (Discord DM & Telegram)", type: 1,
      },
      {
        name: "balance", description: "Check your verified earnings balance", type: 1,
      },
      {
        name: "raidauth", description: "Register yourself as a raider (repost & like raids)", type: 1,
      },
      {
        name: "authx", description: "(Admin) Manually add an X account for shiller assignment", type: 1,
        options: [{ name: "account", description: "The X handle to add (e.g. @SomeHandle)", type: 3, required: true }],
      },
      {
        name: "authx2", description: "(Admin) Create a raider with a secret code/hashtag", type: 1,
        options: [
          { name: "username", description: "The raider's Discord username", type: 3, required: true },
          { name: "code", description: "Secret code (also used as their hashtag)", type: 3, required: true },
        ],
      },
      {
        name: "authorizeshiller", description: "(Admin) Authorize a user as a shiller on their behalf", type: 1,
        options: [
          { name: "user", description: "The Discord user ID to authorize", type: 3, required: true },
          { name: "account", description: "The X account to assign", type: 3, required: true, choices: accountChoices.length > 0 ? accountChoices : undefined },
        ],
      },
      {
        name: "authorizeraider", description: "(Admin) Authorize a user as a raider", type: 1,
        options: [
          { name: "user", description: "The Discord user ID to authorize", type: 3, required: true },
        ],
      },
      {
        name: "walletcrm", description: "(Admin) Set a Solana wallet for a user (public)", type: 1,
        options: [
          { name: "user", description: "The Discord user ID", type: 3, required: true },
          { name: "address", description: "Solana wallet address", type: 3, required: true },
        ],
      },
      {
        name: "welcomeshill", description: "(Admin) Post the welcome/onboarding guide for new shillers & raiders", type: 1,
      },
      {
        name: "adminhelp", description: "(Admin) Quick reference of all admin commands", type: 1,
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
    // ─── Friday payout reminder — posts to both channels ───
    if (action === "payout-reminder") {
      const DISCORD_BOT_TOKEN_ENV = Deno.env.get("DISCORD_BOT_TOKEN");
      if (!DISCORD_BOT_TOKEN_ENV) return json({ error: "Bot token not configured" }, 500);

      const SHILL_CHANNEL = "1484998470103466156";
      const RAID_CHANNEL = "1485050868838564030";

      const shillMsg = "🔔 **Payout Day!** Don't forget to request `/payout` today! @Shill-Team 💰";
      const raidMsg = "🔔 **Payout Day!** Don't forget to request `/payout` today! @Raid-Team 💰";

      const headers = { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}`, "Content-Type": "application/json" };
      const sendMsg = (channelId: string, content: string) =>
        fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST", headers, body: JSON.stringify({ content }),
        });

      const [r1, r2] = await Promise.all([
        sendMsg(SHILL_CHANNEL, shillMsg),
        sendMsg(RAID_CHANNEL, raidMsg),
      ]);

      return json({ ok: true, shill: r1.status, raid: r2.status });
    }

    // ─── Welcome new member: send help guide to onboarding channel ───
    if (action === "welcome-member") {
      const body = await req.json().catch(() => ({}));
      const { username, user_id } = body;
      const WELCOME_CHANNEL = "1484998470103466156";
      const RAID_CHANNEL = "1485050868838564030";
      const DISCORD_BOT_TOKEN_ENV = Deno.env.get("DISCORD_BOT_TOKEN");
      if (!DISCORD_BOT_TOKEN_ENV) return json({ error: "Bot token not configured" }, 500);

      const displayName = username || "new member";

      const welcomeText = [
        `**Welcome to the Shill Team, ${displayName}!** :rocket:`,
        "",
        "**How it works:**",
        "1. Use `/authorize` to link your Discord to an X account",
        "2. Use `/wallet <address>` to set your Solana payout address",
        "3. Use `/payout` to request a withdrawal once you have verified earnings",
        "",
        "**Roles:**",
        ":zap: **Shiller** — Authorized to post from a linked X account. Earn per verified click.",
        ":shield: **Raider** — Use your secret code to raid tweets. Earn $0.02 per verified reply.",
        "",
        "**Commands:**",
        "`/help` — Show this guide",
        "`/authorize` — Link your Discord to an X account",
        "`/wallet <address>` — Set your Solana wallet",
        "`/payout` — Request a payout",
        "`/clean` — Delete bot messages (admin)",
        "",
        ":link: Full guide: https://warren.guru/shillteam",
      ].join("\n");

      const raidWelcomeText = [
        `**Welcome, ${displayName}!** :crossed_swords: Ready to raid?`,
        "",
        "**How raiding works:**",
        "1. An admin assigns you a **secret code** — your unique identifier",
        "2. When a raid alert drops, click **⚔️ Raid Now** or **📋 Copy Shill**",
        "3. Paste the shill text (with your `#secretcode`) as a reply on X",
        "4. Click **✅ Verify Raid** and submit your reply URL as proof",
        "5. Earn **$0.02 per verified raid**",
        "",
        "**Commands:**",
        "`/raidhelp` — Show the full raider guide",
        "`/wallet <address>` — Set your Solana wallet",
        "`/payout` — Request a payout",
        "",
        ":link: Full guide: https://warren.guru/shillteam",
      ].join("\n");

      const headers = { Authorization: `Bot ${DISCORD_BOT_TOKEN_ENV}`, "Content-Type": "application/json" };
      const sendMsg = (channelId: string, content: string) =>
        fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST", headers, body: JSON.stringify({ content }),
        });

      const [res1, res2] = await Promise.all([
        sendMsg(WELCOME_CHANNEL, welcomeText),
        sendMsg(RAID_CHANNEL, raidWelcomeText),
      ]);

      const body1 = await res1.json().catch(() => ({}));
      const body2 = await res2.json().catch(() => ({}));
      return json({ ok: true, shill_channel: { status: res1.status, id: body1.id }, raid_channel: { status: res2.status, id: body2.id } });
    }

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