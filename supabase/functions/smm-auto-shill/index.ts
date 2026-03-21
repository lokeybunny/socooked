import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret, x-signature-ed25519, x-signature-timestamp",
};

const API_BASE = "https://api.upload-post.com/api";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const BOT_SECRET = Deno.env.get("BOT_SECRET")!;
  const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY")!;
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "ingest";

  // ─── Discord Interactions endpoint ───
  if (action === "discord-interact" && req.method === "POST") {
    const sig = req.headers.get("x-signature-ed25519") || "";
    const timestamp = req.headers.get("x-signature-timestamp") || "";
    const rawBody = await req.text();

    // Look up public key from config
    const { data: allConfigs } = await supabase
      .from("site_configs")
      .select("content, section")
      .eq("site_id", "smm-auto-shill");

    let publicKey = "";
    let matchedProfile = "";
    for (const row of (allConfigs || [])) {
      const c = row.content as any;
      if (c?.discord_public_key) {
        publicKey = c.discord_public_key;
        matchedProfile = row.section;
        break;
      }
    }

    if (!publicKey) {
      console.error("[auto-shill] No Discord public key configured");
      return json({ error: "No Discord public key configured" }, 401);
    }

    const isValid = await verifyDiscordSignature(publicKey, sig, timestamp, rawBody);
    if (!isValid) {
      return json({ error: "Invalid request signature" }, 401);
    }

    const interaction = JSON.parse(rawBody);

    // PING → PONG (required for Discord endpoint verification)
    if (interaction.type === 1) {
      return json({ type: 1 });
    }

    // APPLICATION_COMMAND or MESSAGE_COMPONENT
    if (interaction.type === 2 || interaction.type === 3) {
      // Extract tweet URL from command options or message content
      let tweetUrl = "";
      const profileUsername = matchedProfile || "NysonBlack";

      if (interaction.data?.options) {
        const urlOption = interaction.data.options.find((o: any) => o.name === "url" || o.name === "tweet");
        if (urlOption) tweetUrl = urlOption.value;
      }

      // Also check resolved messages
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

      // Acknowledge immediately, process async
      const processPromise = processAutoShill(supabase, tweetUrl, profileUsername, SUPABASE_URL, ANON_KEY, UPLOAD_POST_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
      processPromise.catch(e => console.error("[auto-shill] Async process error:", e));

      return json({
        type: 4,
        data: { content: `🗣️ Auto-shilling tweet: ${tweetUrl}\n👤 Profile: ${profileUsername}` }
      });
    }

    return json({ type: 1 });
  }

  // ─── Auth: bot secret or anon key ───
  const botSecret = req.headers.get("x-bot-secret");
  const authHeader = req.headers.get("authorization") || "";
  const apikeyHeader = req.headers.get("apikey") || "";
  const isBot = botSecret === BOT_SECRET;
  const isAnon = (ANON_KEY && (authHeader.includes(ANON_KEY) || apikeyHeader === ANON_KEY));
  if (!isBot && !isAnon) return json({ error: "Unauthorized" }, 401);

  // ─── Telegram notify helper ───
  const sendTelegram = async (text: string) => {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
      });
    } catch (e) { console.error("[auto-shill] Telegram error:", e); }
  };

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

      return json({ config: data?.content || { enabled: false, reply_template: "", boost_preset_ids: [], discord_app_id: "", discord_public_key: "" } });
    }

    // ─── SAVE config ───
    if (action === "save-config") {
      const body = await req.json();
      const { profile_username, enabled, reply_template, boost_preset_ids, discord_app_id, discord_public_key } = body;
      const section = profile_username || "NysonBlack";

      await supabase.from("site_configs").upsert({
        site_id: "smm-auto-shill",
        section,
        content: { enabled, reply_template, boost_preset_ids: boost_preset_ids || [], discord_app_id: discord_app_id || "", discord_public_key: discord_public_key || "" },
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

    // ─── INGEST: bot sends tweet URL (webhook fallback) ───
    if (action === "ingest" && req.method === "POST") {
      const body = await req.json();
      const tweetUrl = body.tweet_url || body.url || body.content || "";
      const profileUsername = body.profile_username || body.profile || "NysonBlack";

      if (!tweetUrl || !tweetUrl.includes("x.com/") && !tweetUrl.includes("twitter.com/")) {
        return json({ error: "Invalid or missing tweet URL" }, 400);
      }

      const result = await processAutoShill(supabase, tweetUrl, profileUsername, SUPABASE_URL, ANON_KEY, UPLOAD_POST_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
      return json(result, result.ok ? 200 : 500);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[auto-shill] Fatal error:", err);
    await sendTelegram(`🚨 *Auto-Shill CRASH*\n❌ ${String(err)}`);
    return json({ error: String(err) }, 500);
  }
});

// ─── Shared processing logic ───
async function processAutoShill(
  supabase: any, tweetUrl: string, profileUsername: string,
  SUPABASE_URL: string, ANON_KEY: string, UPLOAD_POST_API_KEY: string,
  TELEGRAM_BOT_TOKEN: string, TELEGRAM_CHAT_ID: string
) {
  const sendTelegram = async (text: string) => {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
      });
    } catch (e) { console.error("[auto-shill] Telegram error:", e); }
  };

  console.log(`[auto-shill] Processing: ${tweetUrl} for ${profileUsername}`);

  const { data: configRow } = await supabase
    .from("site_configs").select("content")
    .eq("site_id", "smm-auto-shill").eq("section", profileUsername).single();

  const config = configRow?.content as any;
  if (!config?.enabled) return { ok: false, skipped: true, reason: "Auto-shill disabled" };

  const replyTemplate = config.reply_template || "";
  if (!replyTemplate.trim()) return { ok: false, error: "No reply template configured" };

  // Dedup check
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: existing } = await supabase
    .from("activity_log").select("id")
    .eq("entity_type", "auto-shill").gte("created_at", oneDayAgo)
    .like("meta->>tweet_url", tweetUrl).limit(1);

  if (existing?.length) return { ok: false, skipped: true, reason: "Already shilled" };

  // Post reply
  const replyText = replyTemplate
    .replace(/\{tweet_url\}/gi, tweetUrl)
    .replace(/\{timestamp\}/gi, new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));

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
      meta: { name: `❌ Auto-shill failed: ${tweetUrl}`, tweet_url: tweetUrl, error: errorMsg, profile: profileUsername },
    });
    return { ok: false, error: errorMsg };
  }

  const requestId = uploadData?.request_id || uploadData?.data?.request_id || null;
  const jobId = uploadData?.job_id || uploadData?.data?.job_id || null;

  // Auto-boost
  const boostPresetIds = config.boost_preset_ids || [];
  let boostResult: any = null;

  if (boostPresetIds.length > 0) {
    try {
      const { data: presets } = await supabase.from("smm_boost_presets").select("*").in("id", boostPresetIds);
      const allServices: any[] = [];
      for (const p of (presets || [])) {
        if (Array.isArray(p.services)) {
          for (const s of p.services) allServices.push({ service_id: s.service_id, service_name: s.service_name, quantity: s.quantity });
        }
      }
      if (allServices.length > 0) {
        const boostRes = await fetch(`${SUPABASE_URL}/functions/v1/darkside-smm?action=auto-boost`, {
          method: "POST",
          headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ link: tweetUrl, profile_username: profileUsername, platform: "twitter", services: allServices }),
        });
        boostResult = await boostRes.json().catch(() => null);
      }
    } catch (e) {
      console.error("[auto-shill] Boost error:", e);
      await sendTelegram(`⚠️ *Boost failed* (non-fatal)\n🔗 ${tweetUrl}\n❌ ${String(e)}`);
    }
  }

  // Log success
  await supabase.from("activity_log").insert({
    entity_type: "auto-shill", action: "shilled",
    meta: { name: `🗣️ Auto-shilled: ${tweetUrl}`, tweet_url: tweetUrl, profile: profileUsername, reply_text: replyText.substring(0, 200), request_id: requestId, job_id: jobId, boost_result: boostResult },
  });

  const boostLabel = boostPresetIds.length > 0 ? "✅ Boosted" : "⏭️ No boost";
  await sendTelegram(`🗣️ *Auto-Shill Fired*\n🔗 ${tweetUrl}\n👤 ${profileUsername}\n💬 ${replyText.substring(0, 100)}${replyText.length > 100 ? "..." : ""}\n${boostLabel}`);

  return { ok: true, shilled: true, tweet_url: tweetUrl, request_id: requestId, job_id: jobId, boost: boostResult };
}
