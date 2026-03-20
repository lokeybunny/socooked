import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * smm-post-inspector — Self-contained cron function that:
 * 1. Finds all calendar events stuck in "publishing" state
 * 2. Checks upload-post history for confirmation of success/failure
 * 3. Auto-finalizes successfully published posts (marks published-)
 * 4. Auto-fails stuck posts (>15 min) and reports to Telegram
 * 5. Reports any technical issues to Telegram
 *
 * Designed to run every 2 minutes via pg_cron, independently of smm-auto-publish.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://api.upload-post.com/api";
const PUBLISHED_PREFIX = "published-";
const PUBLISHING_PREFIX = "publishing|";
const FAILED_PREFIX = "failed|";
const STUCK_TIMEOUT_MS = 15 * 60 * 1000;
const HISTORY_LOOKBACK_MS = 36 * 60 * 60 * 1000;
const HISTORY_EARLY_BUFFER_MS = 12 * 60 * 60 * 1000;
const HISTORY_LIMIT = 100;
const MIN_MATCH_LENGTH = 32;

const SUCCESS_STATUSES = new Set(["success", "successful", "completed", "complete", "published", "posted", "done"]);
const FAILURE_STATUSES = new Set(["failed", "failure", "error", "rejected", "cancelled", "canceled", "expired"]);

const normalizeText = (v: unknown) =>
  String(v || "").toLowerCase().replace(/\[[^\]]+\]/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const asStr = (...vals: unknown[]) => {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
};

const inferPlatforms = (event: any, sourceId: string) => {
  const h = `${event?.title || ""} ${event?.description || ""} ${sourceId}`.toLowerCase();
  if (h.includes("[instagram]") || /(^|[-_])ig($|[-_])/.test(sourceId)) return ["instagram"];
  if (h.includes("[tiktok]") || /(^|[-_])tt($|[-_])/.test(sourceId) || /(^|[-_])tk($|[-_])/.test(sourceId)) return ["tiktok"];
  if (h.includes("instagram") && !h.includes("tiktok")) return ["instagram"];
  if (h.includes("tiktok") && !h.includes("instagram")) return ["tiktok"];
  return ["instagram", "tiktok"];
};

const parsePublishState = (sourceId: string | null, eventId: string) => {
  if (!sourceId) return { state: "ready" as const, originalSourceId: eventId };
  if (sourceId.startsWith(PUBLISHED_PREFIX)) return { state: "published" as const, originalSourceId: sourceId.slice(PUBLISHED_PREFIX.length) || eventId };

  for (const [prefix, state] of [[PUBLISHING_PREFIX, "publishing"], [FAILED_PREFIX, "failed"]] as const) {
    if (sourceId.startsWith(prefix)) {
      const [, trackingKey = "", trackingValue = "", ...rest] = sourceId.split("|");
      return { state, trackingKey, trackingValue, originalSourceId: rest.join("|") || eventId };
    }
  }
  return { state: "ready" as const, originalSourceId: sourceId };
};

const buildCandidates = (...vals: unknown[]) => {
  const out = new Set<string>();
  for (const v of vals) {
    const n = normalizeText(v);
    if (!n) continue;
    out.add(n);
    if (n.length >= MIN_MATCH_LENGTH) {
      out.add(n.slice(0, Math.min(n.length, 64)));
      out.add(n.slice(0, Math.min(n.length, 96)));
    }
  }
  return [...out].filter(c => c.length >= MIN_MATCH_LENGTH);
};

const textMatches = (entry: unknown, candidates: string[]) => {
  const n = normalizeText(entry);
  if (!n) return false;
  return candidates.some(c => n === c || n.includes(c) || (n.length >= MIN_MATCH_LENGTH && c.includes(n.slice(0, Math.min(n.length, 96)))));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY");
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const sendTelegram = async (text: string) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn("[inspector] Telegram not configured, skipping notification");
      return;
    }
    try {
      // Also notify via the existing telegram-notify function for dynamic chat resolution
      await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
        method: "POST",
        headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          record: {
            id: crypto.randomUUID(),
            entity_type: "smm_inspector",
            entity_id: null,
            action: "report",
            actor_id: null,
            meta: { message: text },
            created_at: new Date().toISOString(),
          },
        }),
      });
    } catch (e) {
      console.error("[inspector] Telegram notify failed:", e);
    }
  };

  try {
    if (!UPLOAD_POST_API_KEY) {
      const msg = "🔧 *Post Inspector*: UPLOAD_POST_API_KEY not configured — cannot verify posts.";
      console.error(msg);
      await sendTelegram(msg);
      return json({ error: "UPLOAD_POST_API_KEY not set" }, 500);
    }

    // 1. Find all events in "publishing" state
    const { data: pendingEvents, error: queryErr } = await supabase
      .from("calendar_events")
      .select("*")
      .in("category", ["smm", "artist-campaign"])
      .like("source_id", `${PUBLISHING_PREFIX}%`)
      .order("updated_at", { ascending: true });

    if (queryErr) {
      const msg = `🔧 *Post Inspector ERROR*: DB query failed — ${queryErr.message}`;
      console.error(msg);
      await sendTelegram(msg);
      return json({ error: queryErr.message }, 500);
    }

    if (!pendingEvents || pendingEvents.length === 0) {
      console.log("[inspector] No processing posts found — all clear");
      return json({ ok: true, inspected: 0, finalized: 0, failed: 0, message: "No processing posts" });
    }

    console.log(`[inspector] Found ${pendingEvents.length} processing post(s) to inspect`);

    // 2. Fetch upload history once (shared across all events)
    const profiles = [...new Set(pendingEvents.map(e => {
      const m = e.description?.match(/Profile:\s*(\S+)/i);
      return m?.[1] || "NysonBlack";
    }))];

    const historyByProfile = new Map<string, any[]>();
    for (const profile of profiles) {
      try {
        const params = new URLSearchParams({ user: profile, page: "1", limit: String(HISTORY_LIMIT) });
        const res = await fetch(`${API_BASE}/uploadposts/history?${params}`, {
          headers: { "Authorization": `Apikey ${UPLOAD_POST_API_KEY}` },
        });
        if (res.ok) {
          const data = await res.json();
          const entries = Array.isArray(data?.history) ? data.history : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          historyByProfile.set(profile, entries);
          console.log(`[inspector] Fetched ${entries.length} history entries for ${profile}`);
        } else {
          console.warn(`[inspector] History fetch failed for ${profile}: HTTP ${res.status}`);
          historyByProfile.set(profile, []);
        }
      } catch (e) {
        console.error(`[inspector] History fetch error for ${profile}:`, e);
        historyByProfile.set(profile, []);
      }
    }

    // 3. Process each pending event
    let finalized = 0;
    let failed = 0;
    let stillPending = 0;
    const report: string[] = [];

    for (const event of pendingEvents) {
      const parsed = parsePublishState(event.source_id, event.id);
      if (parsed.state !== "publishing") continue;

      const profileMatch = event.description?.match(/Profile:\s*(\S+)/i);
      const profileUsername = profileMatch?.[1] || "NysonBlack";
      const platforms = inferPlatforms(event, parsed.originalSourceId);
      const ageMs = Date.now() - new Date(event.updated_at || event.created_at).getTime();
      const ageMin = Math.round(ageMs / 60000);

      // Clean caption for matching
      let caption = event.description || event.title || "";
      caption = caption
        .replace(/Media URL:\s*https?:\/\/\S+/gi, "")
        .replace(/Profile:\s*\S+/gi, "")
        .replace(/Type:\s*\S+/gi, "")
        .replace(/Original Week.*\n?/gi, "")
        .replace(/Recycled from.*\n?/gi, "")
        .replace(/\[media_url:[^\]]*\]/gi, "")
        .trim();

      const titleCandidates = buildCandidates(event.title, caption);
      const history = historyByProfile.get(profileUsername) || [];

      // Look for matching history entries
      const eventStartMs = new Date(event.start_time || event.created_at).getTime();
      const cutoffMs = Math.max(Date.now() - HISTORY_LOOKBACK_MS, eventStartMs - HISTORY_EARLY_BUFFER_MS);

      let foundSuccess = false;
      let foundFailure = false;
      let failureReason = "";
      let postUrl = "";
      let platformPostId = "";

      for (const entry of history) {
        const entryPlatform = normalizeText(entry?.platform);
        if (!entryPlatform || !platforms.includes(entryPlatform)) continue;

        const entryText = asStr(entry?.post_title, entry?.title, entry?.caption, entry?.message);
        if (!entryText || !textMatches(entryText, titleCandidates)) continue;

        const ts = asStr(entry?.upload_timestamp, entry?.created_at, entry?.updated_at, entry?.timestamp);
        const tsMs = ts ? new Date(ts).getTime() : NaN;
        if (Number.isFinite(tsMs) && tsMs < cutoffMs) continue;

        // Check success/failure
        const hasProof = Boolean(asStr(entry?.post_url, entry?.platform_post_id));
        const entrySuccess = entry?.success === true && hasProof;
        const entryFailed = entry?.success === false ||
          Boolean(asStr(entry?.error_message, entry?.error_code, entry?.failure_stage));

        if (entrySuccess) {
          foundSuccess = true;
          postUrl = asStr(entry?.post_url) || "";
          platformPostId = asStr(entry?.platform_post_id) || "";
          break;
        }

        if (entryFailed) {
          foundFailure = true;
          failureReason = asStr(entry?.error_message, entry?.error_code, entry?.failure_stage) || "Provider reported failure";
        }
      }

      if (foundSuccess) {
        // ✅ Finalize as published
        await supabase
          .from("calendar_events")
          .update({ source_id: `${PUBLISHED_PREFIX}${parsed.originalSourceId}` })
          .eq("id", event.id);

        await supabase.from("activity_log").insert({
          entity_type: "smm",
          action: "inspector_finalized",
          meta: {
            name: `✅ Inspector confirmed: ${event.title}`,
            profile: profileUsername,
            platforms,
            post_url: postUrl,
            platform_post_id: platformPostId,
            age_minutes: ageMin,
          },
        });

        finalized++;
        report.push(`✅ ${event.title?.substring(0, 40)} → published (${ageMin}min)`);

        // Trigger auto-boost if configured
        try {
          const { data: boostConfig } = await supabase
            .from("site_configs")
            .select("content")
            .eq("site_id", "smm-boost")
            .eq("section", `auto-boost-${profileUsername}`)
            .single();

          const config = boostConfig?.content as { enabled?: boolean; preset_ids?: string[]; preset_id?: string } | null;
          const activeIds: string[] = config?.enabled
            ? (config.preset_ids && Array.isArray(config.preset_ids) ? config.preset_ids : config.preset_id ? [config.preset_id] : [])
            : [];

          if (activeIds.length > 0 && postUrl && platforms.includes("instagram")) {
            const { data: presets } = await supabase.from("smm_boost_presets").select("*").in("id", activeIds);
            const allSvcs: any[] = [];
            for (const p of (presets || [])) {
              if (Array.isArray((p as any).services)) allSvcs.push(...(p as any).services);
            }
            if (allSvcs.length > 0) {
              await fetch(`${SUPABASE_URL}/functions/v1/darkside-smm?action=auto-boost`, {
                method: "POST",
                headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ link: postUrl, profile_username: profileUsername, platform: "instagram", services: allSvcs }),
              });
            }
          }
        } catch (boostErr) {
          console.error("[inspector] Auto-boost error (non-fatal):", boostErr);
        }

        continue;
      }

      if (foundFailure) {
        // ❌ Mark as failed
        const failSourceId = `${FAILED_PREFIX}${parsed.trackingKey || "event"}|${parsed.trackingValue || event.id}|${parsed.originalSourceId}`;
        await supabase.from("calendar_events").update({ source_id: failSourceId }).eq("id", event.id);

        await supabase.from("activity_log").insert({
          entity_type: "smm",
          action: "inspector_failed",
          meta: {
            name: `❌ Inspector detected failure: ${event.title}`,
            profile: profileUsername,
            platforms,
            error: failureReason,
            age_minutes: ageMin,
          },
        });

        failed++;
        report.push(`❌ ${event.title?.substring(0, 40)} → failed: ${failureReason.substring(0, 60)}`);

        await sendTelegram(
          `🚨 *Post Inspector — FAILURE*\n` +
          `📄 ${event.title?.substring(0, 50)}\n` +
          `👤 ${profileUsername}\n` +
          `📱 ${platforms.join(", ")}\n` +
          `⏱ Age: ${ageMin}min\n` +
          `💬 ${failureReason.substring(0, 100)}`
        );
        continue;
      }

      // ⏳ Still pending — check if stuck
      if (ageMs > STUCK_TIMEOUT_MS) {
        // Reset to ready so auto-publish can retry
        await supabase.from("calendar_events").update({ source_id: parsed.originalSourceId }).eq("id", event.id);

        await supabase.from("activity_log").insert({
          entity_type: "smm",
          action: "inspector_stuck_reset",
          meta: {
            name: `🔄 Inspector reset stuck post: ${event.title}`,
            profile: profileUsername,
            platforms,
            age_minutes: ageMin,
          },
        });

        failed++;
        report.push(`🔄 ${event.title?.substring(0, 40)} → stuck ${ageMin}min, reset to retry`);

        await sendTelegram(
          `⚠️ *Post Inspector — STUCK RESET*\n` +
          `📄 ${event.title?.substring(0, 50)}\n` +
          `👤 ${profileUsername}\n` +
          `📱 ${platforms.join(", ")}\n` +
          `⏱ Stuck for ${ageMin}min — reset to retry`
        );
        continue;
      }

      stillPending++;
    }

    // Send summary to Telegram if any actions were taken
    if (finalized > 0 || failed > 0) {
      const summary =
        `📋 *Post Inspector Report*\n` +
        `✅ Finalized: ${finalized}\n` +
        `❌ Failed/Reset: ${failed}\n` +
        `⏳ Still pending: ${stillPending}\n\n` +
        report.join("\n");

      await sendTelegram(summary);
    }

    console.log(`[inspector] Done: ${finalized} finalized, ${failed} failed, ${stillPending} pending`);
    return json({ ok: true, inspected: pendingEvents.length, finalized, failed, still_pending: stillPending, report });

  } catch (err) {
    const msg = `🔧 *Post Inspector CRASH*: ${(err as Error).message}`;
    console.error(msg, err);
    await sendTelegram(msg);
    return json({ error: (err as Error).message }, 500);
  }
});
