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
    .from("site_configs")
    .select("content, section")
    .eq("site_id", "smm-auto-shill")
    .eq("section", normalizedProfile)
    .maybeSingle();

  const exactContent = exactRow?.content as any;
  if (exactContent?.discord_public_key) {
    return {
      profileUsername: exactRow?.section || normalizedProfile,
      publicKey: String(exactContent.discord_public_key),
    };
  }

  const { data: allConfigs } = await supabase
    .from("site_configs")
    .select("content, section")
    .eq("site_id", "smm-auto-shill")
    .order("section", { ascending: true });

  for (const row of allConfigs || []) {
    const content = row.content as any;
    if (content?.discord_public_key) {
      return {
        profileUsername: row.section || normalizedProfile,
        publicKey: String(content.discord_public_key),
      };
    }
  }

  return {
    profileUsername: normalizedProfile,
    publicKey: FALLBACK_DISCORD_PUBLIC_KEY,
  };
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || FALLBACK_ANON_KEY;
  const BOT_SECRET = Deno.env.get("BOT_SECRET")!;
  const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY")!;
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const sendTelegram = makeSendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "ingest";

  // ─── Discord Interactions endpoint ───
  if (action === "discord-interact" && req.method === "POST") {
    const sig = req.headers.get("x-signature-ed25519") || "";
    const timestamp = req.headers.get("x-signature-timestamp") || "";
    const rawBody = await req.text();

    const requestedProfile = url.searchParams.get("profile") || url.searchParams.get("section");
    const { publicKey, profileUsername: matchedProfile } = await resolveDiscordConfig(supabase, requestedProfile);

    const isValid = verifyDiscordSignature(publicKey, sig, timestamp, rawBody);
    if (!isValid) {
      return json({ error: "Invalid request signature" }, 401);
    }

    const interaction = JSON.parse(rawBody);

    // PING → PONG
    if (interaction.type === 1) {
      return json({ type: 1 });
    }

    // APPLICATION_COMMAND or MESSAGE_COMPONENT
    if (interaction.type === 2 || interaction.type === 3) {
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
        return json({
          type: 4,
          data: { content: "❌ No tweet URL found. Provide a valid X/Twitter link.", flags: 64 }
        });
      }

      const processPromise = processAutoShill(supabase, tweetUrl, profileUsername, UPLOAD_POST_API_KEY, sendTelegram);
      processPromise.catch(e => console.error("[auto-shill] Async process error:", e));

      return json({
        type: 4,
        data: { content: `🗣️ Auto-replying to: ${tweetUrl}\n👤 Profile: ${profileUsername}` }
      });
    }

    return json({ type: 1 });
  }

  // ─── REGISTER slash commands (no auth needed — uses Discord Bot Token) ───
  if (action === "register-commands" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const profileUsername = body.profile || url.searchParams.get("profile") || "NysonBlack";

    const { data: cfgRow } = await supabase
      .from("site_configs").select("content")
      .eq("site_id", "smm-auto-shill").eq("section", profileUsername).single();

    const cfg = cfgRow?.content as any;
    const appId = cfg?.discord_app_id;
    if (!appId) return json({ error: "No discord_app_id configured for this profile" }, 400);

    const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!DISCORD_BOT_TOKEN) return json({ error: "DISCORD_BOT_TOKEN secret not set" }, 500);

    const guildId = body.guild_id || url.searchParams.get("guild_id") || "";

    const commands = [
      {
        name: "shill",
        description: "Auto-reply to a tweet via X",
        type: 1,
        options: [
          { name: "url", description: "The X/Twitter tweet URL to reply to", type: 3, required: true },
        ],
      },
    ];

    const registerUrl = guildId
      ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${appId}/commands`;

    const results = [];
    for (const cmd of commands) {
      const res = await fetch(registerUrl, {
        method: "POST",
        headers: { "Authorization": `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      });
      const data = await res.json();
      results.push({ command: cmd.name, status: res.status, data });
    }

    return json({ ok: true, results });
  }

  // ─── Auth: bot secret or anon key ───
  const botSecret = req.headers.get("x-bot-secret");
  const authHeader = req.headers.get("authorization") || "";
  const apikeyHeader = req.headers.get("apikey") || "";
  const isBot = botSecret === BOT_SECRET;
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isAnon = Boolean(ANON_KEY) && (apikeyHeader === ANON_KEY || bearerToken === ANON_KEY || authHeader.includes(ANON_KEY));
  if (!isBot && !isAnon) return json({ error: "Unauthorized" }, 401);

  try {
    // ─── GET config ───
    if (action === "get-config") {
      const profileUsername = url.searchParams.get("profile") || "NysonBlack";
      const { data } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", profileUsername)
        .single();

      return json({ config: data?.content || { enabled: false, reply_template: "", discord_app_id: "", discord_public_key: "" } });
    }

    // ─── SAVE config ───
    if (action === "save-config") {
      const body = await req.json();
      const { profile_username, enabled, reply_template, discord_app_id, discord_public_key } = body;
      const section = profile_username || "NysonBlack";

      await supabase.from("site_configs").upsert({
        site_id: "smm-auto-shill",
        section,
        content: { enabled, reply_template, discord_app_id: discord_app_id || "", discord_public_key: discord_public_key || "" },
        is_published: true,
      }, { onConflict: "site_id,section" });

      return json({ ok: true });
    }

    // ─── GET shill log ───
    if (action === "log") {
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .eq("entity_type", "auto-shill")
        .order("created_at", { ascending: false })
        .limit(50);

      return json({ log: data || [] });
    }

    // ─── INGEST: other bot sends tweet URL via webhook ───
    if (action === "ingest" && req.method === "POST") {
      const body = await req.json();
      const tweetUrl = body.tweet_url || body.url || body.content || "";
      const profileUsername = body.profile_username || body.profile || "NysonBlack";

      if (!tweetUrl || (!tweetUrl.includes("x.com/") && !tweetUrl.includes("twitter.com/"))) {
        return json({ error: "Invalid or missing tweet URL" }, 400);
      }

      const result = await processAutoShill(supabase, tweetUrl, profileUsername, UPLOAD_POST_API_KEY, sendTelegram);
      return json(result, result.ok ? 200 : 500);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[auto-shill] Fatal error:", err);
    await sendTelegram(`🚨 *Auto-Shill CRASH*\n❌ ${String(err)}`);
    return json({ error: String(err) }, 500);
  }
});

// ─── Process: reply to tweet via Upload-Post API ───
async function processAutoShill(
  supabase: any, tweetUrl: string, profileUsername: string,
  UPLOAD_POST_API_KEY: string, sendTelegram: (text: string) => Promise<void>
) {
  console.log(`[auto-shill] Processing: ${tweetUrl} for ${profileUsername}`);

  const { data: configRow } = await supabase
    .from("site_configs").select("content")
    .eq("site_id", "smm-auto-shill").eq("section", profileUsername).single();

  const config = configRow?.content as any;
  if (!config?.enabled) return { ok: false, skipped: true, reason: "Auto-shill disabled" };

  const replyTemplate = config.reply_template || "";
  if (!replyTemplate.trim()) return { ok: false, error: "No reply template configured" };

  // Dedup check (24h)
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: existing } = await supabase
    .from("activity_log").select("id")
    .eq("entity_type", "auto-shill").gte("created_at", oneDayAgo)
    .like("meta->>tweet_url", tweetUrl).limit(1);

  if (existing?.length) return { ok: false, skipped: true, reason: "Already replied" };

  // Build reply text
  const replyText = replyTemplate
    .replace(/\{tweet_url\}/gi, tweetUrl)
    .replace(/\{timestamp\}/gi, new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));

  // Post reply via Upload-Post API
  const params = new URLSearchParams();
  params.append("user", profileUsername);
  params.append("platform[]", "twitter");
  params.append("title", replyText);
  params.append("comment_url", tweetUrl);
  params.append("async_upload", "true");

  const uploadRes = await fetch(`${API_BASE}/upload_text`, {
    method: "POST",
    headers: { "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const uploadText = await uploadRes.text();
  let uploadData: any = {};
  try { uploadData = JSON.parse(uploadText); } catch {}

  if (!uploadRes.ok) {
    const errorMsg = `Upload failed (${uploadRes.status}): ${uploadText.substring(0, 200)}`;
    await sendTelegram(`🚨 *Auto-Shill FAILED*\n🔗 ${tweetUrl}\n❌ ${errorMsg}`);
    await supabase.from("activity_log").insert({
      entity_type: "auto-shill", action: "failed",
      meta: { name: `❌ Reply failed: ${tweetUrl}`, tweet_url: tweetUrl, error: errorMsg, profile: profileUsername },
    });
    return { ok: false, error: errorMsg };
  }

  const requestId = uploadData?.request_id || uploadData?.data?.request_id || null;
  const jobId = uploadData?.job_id || uploadData?.data?.job_id || null;

  // Log success
  await supabase.from("activity_log").insert({
    entity_type: "auto-shill", action: "replied",
    meta: { name: `🗣️ Auto-replied: ${tweetUrl}`, tweet_url: tweetUrl, profile: profileUsername, reply_text: replyText.substring(0, 200), request_id: requestId, job_id: jobId },
  });

  await sendTelegram(`🗣️ *Auto-Reply Sent*\n🔗 ${tweetUrl}\n👤 ${profileUsername}\n💬 ${replyText.substring(0, 100)}${replyText.length > 100 ? "..." : ""}`);

  return { ok: true, replied: true, tweet_url: tweetUrl, request_id: requestId, job_id: jobId };
}
