import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const API_BASE = "https://api.upload-post.com/api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const BOT_SECRET = Deno.env.get("BOT_SECRET")!;
  const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY")!;
  const DARKSIDE_KEY = Deno.env.get("DARKSIDE_SMM_API_KEY")!;
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "ingest";

  // ─── Auth: bot secret or anon key ───
  const botSecret = req.headers.get("x-bot-secret");
  const authHeader = req.headers.get("authorization") || "";
  const isBot = botSecret === BOT_SECRET;
  const isAnon = authHeader.includes(ANON_KEY);
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

      return json({ config: data?.content || { enabled: false, reply_template: "", boost_preset_ids: [] } });
    }

    // ─── SAVE config ───
    if (action === "save-config") {
      const body = await req.json();
      const { profile_username, enabled, reply_template, boost_preset_ids } = body;
      const section = profile_username || "NysonBlack";

      await supabase.from("site_configs").upsert({
        site_id: "smm-auto-shill",
        section,
        content: { enabled, reply_template, boost_preset_ids: boost_preset_ids || [] },
        is_published: true,
      }, { onConflict: "site_id,section" });

      return json({ ok: true });
    }

    // ─── GET shill log ───
    if (action === "log") {
      const profileUsername = url.searchParams.get("profile") || "NysonBlack";
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .eq("entity_type", "auto-shill")
        .order("created_at", { ascending: false })
        .limit(50);

      return json({ log: data || [] });
    }

    // ─── INGEST: Discord bot sends tweet URL ───
    if (action === "ingest" && req.method === "POST") {
      const body = await req.json();
      const tweetUrl = body.tweet_url || body.url || body.content || "";
      const profileUsername = body.profile_username || body.profile || "NysonBlack";

      if (!tweetUrl || !tweetUrl.includes("x.com/") && !tweetUrl.includes("twitter.com/")) {
        return json({ error: "Invalid or missing tweet URL" }, 400);
      }

      console.log(`[auto-shill] Received tweet: ${tweetUrl} for profile: ${profileUsername}`);

      // Check if auto-shill is enabled for this profile
      const { data: configRow } = await supabase
        .from("site_configs")
        .select("content")
        .eq("site_id", "smm-auto-shill")
        .eq("section", profileUsername)
        .single();

      const config = configRow?.content as { enabled?: boolean; reply_template?: string; boost_preset_ids?: string[] } | null;

      if (!config?.enabled) {
        console.log(`[auto-shill] Auto-shill disabled for ${profileUsername}, skipping`);
        return json({ ok: false, skipped: true, reason: "Auto-shill disabled for this profile" });
      }

      const replyTemplate = config.reply_template || "";
      if (!replyTemplate.trim()) {
        return json({ error: "No reply template configured" }, 400);
      }

      // Check for duplicate (same tweet URL in last 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("activity_log")
        .select("id")
        .eq("entity_type", "auto-shill")
        .gte("created_at", oneDayAgo)
        .like("meta->>tweet_url", tweetUrl)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`[auto-shill] Duplicate tweet, skipping: ${tweetUrl}`);
        return json({ ok: false, skipped: true, reason: "Already shilled this tweet" });
      }

      // ─── Step 1: Post reply via upload-post text endpoint ───
      const replyText = replyTemplate
        .replace(/\{tweet_url\}/gi, tweetUrl)
        .replace(/\{timestamp\}/gi, new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));

      const params = new URLSearchParams();
      params.append("user", profileUsername);
      params.append("platform[]", "twitter");
      params.append("title", replyText);
      params.append("comment_url", tweetUrl); // upload-post reply param
      params.append("async_upload", "true");

      console.log(`[auto-shill] Posting reply to ${tweetUrl}: "${replyText.substring(0, 80)}..."`);

      const uploadRes = await fetch(`${API_BASE}/upload_text`, {
        method: "POST",
        headers: {
          "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const uploadText = await uploadRes.text();
      console.log(`[auto-shill] Upload response (${uploadRes.status}):`, uploadText.substring(0, 500));

      let uploadData: any = {};
      try { uploadData = JSON.parse(uploadText); } catch {}

      if (!uploadRes.ok) {
        const errorMsg = `Auto-shill upload failed (HTTP ${uploadRes.status}): ${uploadText.substring(0, 200)}`;
        await sendTelegram(`🚨 *Auto-Shill FAILED*\n🔗 ${tweetUrl}\n❌ ${errorMsg}`);
        await supabase.from("activity_log").insert({
          entity_type: "auto-shill",
          action: "failed",
          meta: { name: `❌ Auto-shill failed: ${tweetUrl}`, tweet_url: tweetUrl, error: errorMsg, profile: profileUsername },
        });
        return json({ ok: false, error: errorMsg }, 500);
      }

      const requestId = uploadData?.request_id || uploadData?.data?.request_id || uploadData?.id || null;
      const jobId = uploadData?.job_id || uploadData?.data?.job_id || null;

      // ─── Step 2: Trigger darkside auto-boost ───
      const boostPresetIds = config.boost_preset_ids || [];
      let boostResult: any = null;

      if (boostPresetIds.length > 0) {
        try {
          const { data: presets } = await supabase
            .from("smm_boost_presets")
            .select("*")
            .in("id", boostPresetIds);

          const allServices: { service_id: string; service_name: string; quantity: number }[] = [];
          for (const preset of (presets || [])) {
            const svcs = (preset as any).services;
            if (Array.isArray(svcs)) {
              for (const s of svcs) {
                allServices.push({ service_id: s.service_id, service_name: s.service_name, quantity: s.quantity });
              }
            }
          }

          if (allServices.length > 0) {
            console.log(`[auto-shill] Triggering darkside boost with ${allServices.length} services`);
            const boostRes = await fetch(`${SUPABASE_URL}/functions/v1/darkside-smm?action=auto-boost`, {
              method: "POST",
              headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                link: tweetUrl,
                profile_username: profileUsername,
                platform: "twitter",
                services: allServices,
              }),
            });
            boostResult = await boostRes.json().catch(() => null);
          }
        } catch (boostErr) {
          console.error("[auto-shill] Boost error (non-fatal):", boostErr);
          await sendTelegram(`⚠️ *Auto-Shill boost failed* (non-fatal)\n🔗 ${tweetUrl}\n❌ ${String(boostErr)}`);
        }
      }

      // ─── Step 3: Log success ───
      await supabase.from("activity_log").insert({
        entity_type: "auto-shill",
        action: "shilled",
        meta: {
          name: `🗣️ Auto-shilled: ${tweetUrl}`,
          tweet_url: tweetUrl,
          profile: profileUsername,
          reply_text: replyText.substring(0, 200),
          request_id: requestId,
          job_id: jobId,
          boost_result: boostResult,
        },
      });

      // ─── Step 4: Report to Telegram ───
      const boostLabel = boostPresetIds.length > 0 ? "✅ Boosted" : "⏭️ No boost";
      await sendTelegram(
        `🗣️ *Auto-Shill Fired*\n` +
        `🔗 ${tweetUrl}\n` +
        `👤 ${profileUsername}\n` +
        `💬 ${replyText.substring(0, 100)}${replyText.length > 100 ? "..." : ""}\n` +
        `${boostLabel}`
      );

      return json({
        ok: true,
        shilled: true,
        tweet_url: tweetUrl,
        request_id: requestId,
        job_id: jobId,
        boost: boostResult,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[auto-shill] Fatal error:", err);
    await sendTelegram(`🚨 *Auto-Shill CRASH*\n❌ ${String(err)}`);
    return json({ error: String(err) }, 500);
  }
});
