import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const API_BASE = "https://api.upload-post.com/api";
const PUBLISHED_PREFIX = "published-";
const PUBLISHING_PREFIX = "publishing|";
const FAILED_PREFIX = "failed|";
const PENDING_NOT_FOUND_GRACE_MS = 30 * 60 * 1000;
const STUCK_PUBLISHING_TIMEOUT_MS = 15 * 60 * 1000;
const HISTORY_CONFIRMATION_LOOKBACK_MS = 36 * 60 * 60 * 1000;
const HISTORY_CONFIRMATION_EARLY_BUFFER_MS = 12 * 60 * 60 * 1000;
const HISTORY_LIMIT = 100;
const MIN_HISTORY_MATCH_LENGTH = 32;

const SUCCESS_STATUSES = new Set(["success", "successful", "completed", "complete", "published", "posted", "done"]);
const FAILURE_STATUSES = new Set(["failed", "failure", "error", "rejected", "cancelled", "canceled", "expired"]);
const PENDING_STATUSES = new Set(["pending", "queued", "processing", "in_progress", "in-progress", "uploading", "accepted", "scheduled", "running"]);
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

const asNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const normalizeComparableText = (value: unknown) => String(value || "")
  .toLowerCase()
  .replace(/\[[^\]]+\]/g, " ")
  .replace(/https?:\/\/\S+/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const buildComparableCandidates = (...values: unknown[]) => {
  const candidates = new Set<string>();

  for (const value of values) {
    const normalized = normalizeComparableText(value);
    if (!normalized) continue;

    candidates.add(normalized);
    if (normalized.length >= MIN_HISTORY_MATCH_LENGTH) {
      candidates.add(normalized.slice(0, Math.min(normalized.length, 64)));
      candidates.add(normalized.slice(0, Math.min(normalized.length, 96)));
    }
  }

  return [...candidates].filter((candidate) => candidate.length >= MIN_HISTORY_MATCH_LENGTH);
};

const comparableTextMatches = (entryText: unknown, candidates: string[]) => {
  const normalizedEntry = normalizeComparableText(entryText);
  if (!normalizedEntry) return false;

  return candidates.some((candidate) => {
    if (!candidate) return false;
    if (normalizedEntry === candidate) return true;
    if (normalizedEntry.includes(candidate)) return true;

    const comparisonSlice = normalizedEntry.slice(0, Math.min(normalizedEntry.length, 96));
    return comparisonSlice.length >= MIN_HISTORY_MATCH_LENGTH && candidate.includes(comparisonSlice);
  });
};

const parsePublishState = (sourceId: string | null, eventId: string) => {
  if (!sourceId) return { state: "ready" as const, originalSourceId: eventId };
  if (sourceId.startsWith(PUBLISHED_PREFIX)) {
    return { state: "published" as const, originalSourceId: sourceId.slice(PUBLISHED_PREFIX.length) || eventId };
  }

  const parseStructured = (prefix: string, state: "publishing" | "failed") => {
    if (!sourceId.startsWith(prefix)) return null;
    const [, trackingKey = "", trackingValue = "", ...rest] = sourceId.split("|");
    return {
      state,
      trackingKey: trackingKey || undefined,
      trackingValue: trackingValue || undefined,
      originalSourceId: rest.join("|") || eventId,
    } as const;
  };

  return parseStructured(PUBLISHING_PREFIX, "publishing")
    || parseStructured(FAILED_PREFIX, "failed")
    || { state: "ready" as const, originalSourceId: sourceId };
};

const buildStructuredSourceId = (
  prefix: typeof PUBLISHING_PREFIX | typeof FAILED_PREFIX,
  trackingKey: string,
  trackingValue: string,
  originalSourceId: string,
) => `${prefix}${trackingKey}|${trackingValue}|${originalSourceId}`;

const inferPlatforms = (event: any, originalSourceId: string) => {
  const title = String(event?.title || "").toLowerCase();
  const description = String(event?.description || "").toLowerCase();
  const source = String(originalSourceId || "").toLowerCase();
  const haystack = `${title} ${description} ${source}`;

  if (title.includes("[instagram]") || /(^|[-_])ig($|[-_])/.test(source)) return ["instagram"];
  if (title.includes("[tiktok]") || /(^|[-_])tt($|[-_])/.test(source) || /(^|[-_])tk($|[-_])/.test(source)) return ["tiktok"];
  if (haystack.includes("instagram") && !haystack.includes("tiktok")) return ["instagram"];
  if (haystack.includes("tiktok") && !haystack.includes("instagram")) return ["tiktok"];
  return ["instagram", "tiktok"];
};

const extractUploadOutcome = (payload: any) => {
  const requestId = asNonEmptyString(payload?.request_id, payload?.data?.request_id);
  const jobId = asNonEmptyString(payload?.job_id, payload?.data?.job_id);
  const postUrl = asNonEmptyString(payload?.post_url, payload?.data?.post_url, payload?.permalink, payload?.data?.permalink);
  const platformPostId = asNonEmptyString(payload?.platform_post_id, payload?.data?.platform_post_id);
  const errorMessage = asNonEmptyString(
    payload?.error_message,
    payload?.data?.error_message,
    payload?.message,
    payload?.data?.message,
    payload?.error,
    payload?.data?.error,
  );

  const statuses = [
    payload?.status,
    payload?.data?.status,
    payload?.upload_status,
    payload?.data?.upload_status,
    payload?.state,
    payload?.data?.state,
  ]
    .map(normalizeStatus)
    .filter(Boolean);

  const hasFailureSignal = payload?.success === false || statuses.some((status) => FAILURE_STATUSES.has(status));
  const hasPendingSignal = statuses.some((status) => PENDING_STATUSES.has(status));
  const hasSuccessStatus = statuses.some((status) => SUCCESS_STATUSES.has(status));
  const hasPlatformProof = Boolean(postUrl) || Boolean(platformPostId);

  if (hasFailureSignal) {
    return {
      state: "failed" as const,
      requestId,
      jobId,
      postUrl,
      platformPostId,
      error: errorMessage || statuses[0] || "Upload failed",
      rawStatus: statuses[0],
    };
  }

  if (hasSuccessStatus || hasPlatformProof) {
    return {
      state: hasPlatformProof ? "success" as const : "pending" as const,
      requestId,
      jobId,
      postUrl,
      platformPostId,
      rawStatus: statuses[0],
    };
  }

  return {
    state: hasPendingSignal || requestId || jobId ? "pending" as const : "unknown" as const,
    requestId,
    jobId,
    postUrl,
    platformPostId,
    error: errorMessage,
    rawStatus: statuses[0],
  };
};

const extractHistoryEntries = (payload: any) => {
  const candidates = [
    payload?.history,
    payload?.uploads,
    payload?.data?.history,
    payload?.data?.uploads,
    payload?.data,
    payload,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [] as any[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY");

  if (!UPLOAD_POST_API_KEY) {
    console.error("[smm-auto-publish] UPLOAD_POST_API_KEY not set");
    return json({ error: "UPLOAD_POST_API_KEY not configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const logActivity = async (action: string, meta: Record<string, unknown>) => {
    await supabase.from("activity_log").insert({ entity_type: "smm", action, meta });
  };

  const notifyFailure = async (title: string, error: string, extra: Record<string, unknown> = {}) => {
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
      method: "POST",
      headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        record: {
          id: crypto.randomUUID(),
          entity_type: "smm",
          entity_id: null,
          action: "failed",
          actor_id: null,
          meta: { name: `🚨 Auto-publish FAILED: ${title}`, error, ...extra },
          created_at: new Date().toISOString(),
        },
      }),
    });
  };

  const finalizePublishedEvent = async (
    event: any,
    originalSourceId: string,
    profileUsername: string,
    platforms: string[],
    outcome: ReturnType<typeof extractUploadOutcome>,
    mediaUrl: string,
    confirmationMeta: Record<string, unknown> = {},
  ) => {
    await supabase
      .from("calendar_events")
      .update({ source_id: `${PUBLISHED_PREFIX}${originalSourceId}` })
      .eq("id", event.id);

    await logActivity("auto_published", {
      name: `📤 Auto-published: ${event.title}`,
      profile: profileUsername,
      platforms,
      request_id: outcome.requestId,
      job_id: outcome.jobId,
      post_url: outcome.postUrl,
      status: outcome.rawStatus,
      ...confirmationMeta,
    });

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

      if (activeIds.length > 0) {
        const { data: activePresets } = await supabase
          .from("smm_boost_presets")
          .select("*")
          .in("id", activeIds);

        const allServices: { service_id: string; service_name: string; quantity: number }[] = [];
        for (const preset of (activePresets || [])) {
          const svcs = (preset as any).services;
          if (Array.isArray(svcs)) {
            for (const s of svcs) {
              allServices.push({ service_id: s.service_id, service_name: s.service_name, quantity: s.quantity });
            }
          }
        }

        if (allServices.length > 0) {
          const postUrl = outcome.postUrl || mediaUrl;
          if (postUrl && platforms.includes("instagram")) {
            const presetNames = (activePresets || []).map((p: any) => p.preset_name).join(", ");
            console.log(`[smm-auto-publish] Triggering auto-boost with ${activeIds.length} presets [${presetNames}]`);
            await fetch(`${SUPABASE_URL}/functions/v1/darkside-smm?action=auto-boost`, {
              method: "POST",
              headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ link: postUrl, profile_username: profileUsername, platform: "instagram", services: allServices }),
            });
          }
        }
      }
    } catch (boostErr) {
      console.error("[smm-auto-publish] Auto-boost error (non-fatal):", boostErr);
    }

    return json({
      ok: true,
      published: 1,
      title: event.title,
      request_id: outcome.requestId,
      job_id: outcome.jobId,
      post_url: outcome.postUrl,
    });
  };

  const extractEventPayload = (event: any) => {
    const mediaMatch = event.description?.match(/Media URL:\s*(https?:\/\/\S+)/i);
    const mediaUrl = mediaMatch?.[1]?.trim();
    const profileMatch = event.description?.match(/Profile:\s*(\S+)/i);
    const profileUsername = profileMatch?.[1] || "NysonBlack";

    let caption = event.description || event.title || "";
    caption = caption
      .replace(/Media URL:\s*https?:\/\/\S+/gi, "")
      .replace(/Profile:\s*\S+/gi, "")
      .replace(/Type:\s*\S+/gi, "")
      .replace(/Original Week.*\n?/gi, "")
      .replace(/Recycled from.*\n?/gi, "")
      .replace(/\[media_url:[^\]]*\]/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const isVideo = mediaUrl ? /\.(mp4|mov|webm|avi)(\?|$)/i.test(mediaUrl) : false;
    const parsedState = parsePublishState(event.source_id, event.id);
    const originalSourceId = parsedState.originalSourceId;
    const platforms = inferPlatforms(event, originalSourceId);

    return { mediaUrl, profileUsername, caption, isVideo, platforms, originalSourceId };
  };

  const fetchUploadHistory = async (profileUsername: string) => {
    const params = new URLSearchParams({ user: profileUsername, page: "1", limit: String(HISTORY_LIMIT) });
    const response = await fetch(`${API_BASE}/uploadposts/history?${params.toString()}`, {
      headers: { "Authorization": `Apikey ${UPLOAD_POST_API_KEY}` },
    });

    const text = await response.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch {}

    return {
      ok: response.ok,
      status: response.status,
      text,
      data,
      entries: extractHistoryEntries(data),
    };
  };

  const confirmEventFromHistory = async (event: any) => {
    const { profileUsername, caption, platforms, originalSourceId } = extractEventPayload(event);
    const titleCandidates = buildComparableCandidates(event.title, caption);
    const history = await fetchUploadHistory(profileUsername);

    if (!history.ok) {
      console.warn(`[smm-auto-publish] Upload history unavailable (${history.status}) for ${event.id}: ${history.text.substring(0, 250)}`);
      return {
        state: "history_unavailable" as const,
        profileUsername,
        platforms,
        originalSourceId,
        reason: `upload-history HTTP ${history.status}`,
      };
    }

    const eventStartMs = new Date(event.start_time || event.created_at || new Date().toISOString()).getTime();
    const cutoffMs = Math.max(
      Date.now() - HISTORY_CONFIRMATION_LOOKBACK_MS,
      Number.isFinite(eventStartMs) ? eventStartMs - HISTORY_CONFIRMATION_EARLY_BUFFER_MS : 0,
    );

    const matchingEntries = history.entries
      .map((entry: any) => {
        const platform = normalizeComparableText(entry?.platform);
        const profile = asNonEmptyString(entry?.profile_username, entry?.user, entry?.username);
        const entryText = asNonEmptyString(entry?.post_title, entry?.title, entry?.caption, entry?.message);
        const timestampRaw = asNonEmptyString(entry?.upload_timestamp, entry?.created_at, entry?.updated_at, entry?.timestamp);
        const timestampMs = timestampRaw ? new Date(timestampRaw).getTime() : Number.NaN;

        return { entry, platform, profile, entryText, timestampRaw, timestampMs };
      })
      .filter(({ platform, profile, entryText, timestampMs }) => {
        if (!platform || !platforms.includes(platform)) return false;
        if (profile && profile.toLowerCase() !== profileUsername.toLowerCase()) return false;
        if (!entryText || !comparableTextMatches(entryText, titleCandidates)) return false;
        if (Number.isFinite(timestampMs) && timestampMs < cutoffMs) return false;
        return true;
      })
      .sort((a, b) => (Number.isFinite(b.timestampMs) ? b.timestampMs : 0) - (Number.isFinite(a.timestampMs) ? a.timestampMs : 0));

    const perPlatform = new Map<string, { state: "success" | "failed" | "pending"; entry: any; error?: string }>();

    for (const platform of platforms) {
      const match = matchingEntries.find((candidate) => candidate.platform === platform);
      if (!match) continue;

      const normalizedEntryStatus = [
        match.entry?.status,
        match.entry?.upload_status,
        match.entry?.state,
      ].map(normalizeStatus).find(Boolean);

      const hasFailure = match.entry?.success === false
        || Boolean(asNonEmptyString(match.entry?.error_message, match.entry?.error_code, match.entry?.failure_stage))
        || Boolean(normalizedEntryStatus && FAILURE_STATUSES.has(normalizedEntryStatus));
      const hasSuccess = match.entry?.success === true
        && Boolean(asNonEmptyString(match.entry?.post_url, match.entry?.platform_post_id));

      if (hasFailure) {
        perPlatform.set(platform, {
          state: "failed",
          entry: match.entry,
          error: asNonEmptyString(match.entry?.error_message, match.entry?.error_code, match.entry?.failure_stage, normalizedEntryStatus) || "Provider history reported failure",
        });
        continue;
      }

      if (hasSuccess) {
        perPlatform.set(platform, { state: "success", entry: match.entry });
        continue;
      }

      perPlatform.set(platform, { state: "pending", entry: match.entry });
    }

    const successfulPlatforms = platforms.filter((platform) => perPlatform.get(platform)?.state === "success");
    const failedPlatforms = platforms.filter((platform) => perPlatform.get(platform)?.state === "failed");
    const pendingPlatforms = platforms.filter((platform) => !perPlatform.has(platform) || perPlatform.get(platform)?.state === "pending");

    if (successfulPlatforms.length === platforms.length) {
      const preferredProof = successfulPlatforms
        .map((platform) => perPlatform.get(platform)?.entry)
        .find((entry) => asNonEmptyString(entry?.post_url, entry?.platform_post_id));

      return {
        state: "confirmed_success" as const,
        profileUsername,
        platforms,
        originalSourceId,
        successfulPlatforms,
        failedPlatforms,
        pendingPlatforms,
        proof: {
          post_url: asNonEmptyString(preferredProof?.post_url),
          platform_post_id: asNonEmptyString(preferredProof?.platform_post_id),
          upload_timestamp: asNonEmptyString(preferredProof?.upload_timestamp, preferredProof?.created_at),
        },
      };
    }

    if (failedPlatforms.length > 0) {
      return {
        state: "confirmed_failure" as const,
        profileUsername,
        platforms,
        originalSourceId,
        successfulPlatforms,
        failedPlatforms,
        pendingPlatforms,
        error: failedPlatforms
          .map((platform) => `${platform}: ${perPlatform.get(platform)?.error || "failed"}`)
          .join(" | "),
      };
    }

    return {
      state: "not_confirmed" as const,
      profileUsername,
      platforms,
      originalSourceId,
      successfulPlatforms,
      failedPlatforms,
      pendingPlatforms,
      reason: matchingEntries.length > 0 ? "Awaiting successful provider history entries for all platforms" : "No matching provider history entries yet",
    };
  };

  const markPendingUpload = async (
    event: any,
    originalSourceId: string,
    trackingKey: string,
    trackingValue: string,
    meta: Record<string, unknown>,
  ) => {
    await supabase
      .from("calendar_events")
      .update({ source_id: buildStructuredSourceId(PUBLISHING_PREFIX, trackingKey, trackingValue, originalSourceId) })
      .eq("id", event.id);

    await logActivity("auto_publish_queued", meta);
  };

  const failEvent = async (
    event: any,
    originalSourceId: string,
    trackingKey: string,
    trackingValue: string,
    title: string,
    error: string,
    extra: Record<string, unknown> = {},
  ) => {
    await supabase
      .from("calendar_events")
      .update({ source_id: buildStructuredSourceId(FAILED_PREFIX, trackingKey, trackingValue, originalSourceId) })
      .eq("id", event.id);

    await notifyFailure(title, error, extra);
  };

  const queueUpload = async (event: any) => {
    const { mediaUrl, profileUsername, caption, isVideo, platforms, originalSourceId } = extractEventPayload(event);

    if (!mediaUrl) {
      console.log(`[smm-auto-publish] Skipping event ${event.id} — no media URL found`);
      await failEvent(event, originalSourceId, "event", event.id, event.title || event.id, "No media URL found in event description", { event_id: event.id });
      return json({ ok: false, published: 0, error: "No media URL found" }, 400);
    }

    const params = new URLSearchParams();
    params.append("user", profileUsername);
    platforms.forEach((platform) => params.append("platform[]", platform));
    params.append("title", caption);
    params.append("async_upload", "true");

    if (isVideo) {
      params.append("video", mediaUrl);
      if (platforms.includes("instagram")) {
        params.append("ig_post_type", "reels");
        params.append("share_to_feed", "true");
        const captionLower = caption.toLowerCase();
        const tags: string[] = [];
        if (captionLower.includes("lamb")) tags.push("@lamb.wavv");
        if (captionLower.includes("oranj") || captionLower.includes("orang")) tags.push("@oranjgoodman");
        if (tags.length > 0) params.append("user_tags", tags.join(", "));
      }
    } else {
      params.append("photos[]", mediaUrl);
    }

    const endpoint = isVideo ? "/upload" : "/upload_photos";
    console.log(`[smm-auto-publish] Queueing async upload: ${endpoint} for "${event.title?.substring(0, 60)}" on ${platforms.join(",")}`);

    const uploadRes = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const uploadText = await uploadRes.text();
    console.log(`[smm-auto-publish] Upload response (${uploadRes.status}):`, uploadText.substring(0, 500));

    let uploadData: any = {};
    try { uploadData = JSON.parse(uploadText); } catch {}

    if (!uploadRes.ok) {
      if (RETRYABLE_HTTP_STATUSES.has(uploadRes.status)) {
        await logActivity("auto_publish_retry_pending", {
          name: `🔁 Auto-publish retry pending: ${event.title}`,
          event_id: event.id,
          profile: profileUsername,
          platforms,
          status_code: uploadRes.status,
          provider_response: uploadText.substring(0, 300),
        });
        return json({
          ok: true,
          published: 0,
          pending: 1,
          retry: true,
          title: event.title,
          message: `Provider temporary error (HTTP ${uploadRes.status}); will retry automatically`,
        });
      }

      await failEvent(event, originalSourceId, "event", event.id, event.title || event.id, uploadText.substring(0, 300), {
        event_id: event.id,
        status_code: uploadRes.status,
      });
      return json({ ok: false, published: 0, error: uploadText.substring(0, 200) }, 500);
    }

    const outcome = extractUploadOutcome(uploadData);
    if (outcome.state === "failed") {
      await failEvent(
        event,
        originalSourceId,
        outcome.requestId ? "request_id" : outcome.jobId ? "job_id" : "event",
        outcome.requestId || outcome.jobId || event.id,
        event.title || event.id,
        outcome.error || "Upload provider rejected request",
        {
          event_id: event.id,
          request_id: outcome.requestId,
          job_id: outcome.jobId,
        },
      );
      return json({ ok: false, published: 0, error: outcome.error || "Provider rejected upload" }, 500);
    }

    const trackingKey = outcome.requestId ? "request_id" : outcome.jobId ? "job_id" : "event";
    const trackingValue = outcome.requestId || outcome.jobId || event.id;

    await markPendingUpload(event, originalSourceId, trackingKey, trackingValue, {
      name: `⏳ Auto-publish queued: ${event.title}`,
      profile: profileUsername,
      platforms,
      request_id: outcome.requestId,
      job_id: outcome.jobId,
    });

    const historyConfirmation = await confirmEventFromHistory(event);
    if (historyConfirmation.state === "confirmed_success") {
      return await finalizePublishedEvent(
        event,
        originalSourceId,
        profileUsername,
        platforms,
        {
          ...outcome,
          state: "success",
          postUrl: outcome.postUrl || historyConfirmation.proof.post_url,
          platformPostId: outcome.platformPostId || historyConfirmation.proof.platform_post_id,
        },
        mediaUrl,
        {
          confirmation_source: "upload_history",
          confirmed_platforms: historyConfirmation.successfulPlatforms,
          upload_timestamp: historyConfirmation.proof.upload_timestamp,
        },
      );
    }

    if (historyConfirmation.state === "confirmed_failure") {
      await failEvent(event, originalSourceId, trackingKey, trackingValue, event.title || event.id, historyConfirmation.error, {
        event_id: event.id,
        failed_platforms: historyConfirmation.failedPlatforms,
        successful_platforms: historyConfirmation.successfulPlatforms,
      });
      return json({ ok: false, published: 0, error: historyConfirmation.error }, 500);
    }

    return json({
      ok: true,
      published: 0,
      pending: 1,
      title: event.title,
      request_id: outcome.requestId,
      job_id: outcome.jobId,
      message: "Upload accepted and awaiting provider history confirmation",
    });
  };

  const pollPendingUpload = async (event: any) => {
    const parsedState = parsePublishState(event.source_id, event.id);
    if (parsedState.state !== "publishing" || !parsedState.trackingKey || !parsedState.trackingValue) {
      return json({ ok: true, published: 0, message: "No pending upload to poll" });
    }

    const { mediaUrl, profileUsername, platforms, originalSourceId } = extractEventPayload(event);
    const historyConfirmation = await confirmEventFromHistory(event);

    if (historyConfirmation.state === "confirmed_success") {
      return await finalizePublishedEvent(
        event,
        originalSourceId,
        profileUsername,
        platforms,
        {
          state: "success",
          requestId: parsedState.trackingKey === "request_id" ? parsedState.trackingValue : undefined,
          jobId: parsedState.trackingKey === "job_id" ? parsedState.trackingValue : undefined,
          postUrl: historyConfirmation.proof.post_url,
          platformPostId: historyConfirmation.proof.platform_post_id,
          rawStatus: "history_confirmed",
        },
        mediaUrl || "",
        {
          confirmation_source: "upload_history",
          confirmed_platforms: historyConfirmation.successfulPlatforms,
          upload_timestamp: historyConfirmation.proof.upload_timestamp,
        },
      );
    }

    if (historyConfirmation.state === "confirmed_failure") {
      await failEvent(event, originalSourceId, parsedState.trackingKey, parsedState.trackingValue, event.title || event.id, historyConfirmation.error, {
        event_id: event.id,
        failed_platforms: historyConfirmation.failedPlatforms,
        successful_platforms: historyConfirmation.successfulPlatforms,
      });
      return json({ ok: false, published: 0, error: historyConfirmation.error }, 500);
    }

    if (parsedState.trackingKey === "event") {
      return json({
        ok: true,
        published: 0,
        pending: 1,
        title: event.title,
        message: historyConfirmation.reason || "Awaiting provider history confirmation",
      });
    }

    const params = new URLSearchParams({ [parsedState.trackingKey]: parsedState.trackingValue });
    const statusRes = await fetch(`${API_BASE}/uploadposts/status?${params.toString()}`, {
      headers: { "Authorization": `Apikey ${UPLOAD_POST_API_KEY}` },
    });

    const statusText = await statusRes.text();
    console.log(`[smm-auto-publish] Status response (${statusRes.status}) for ${event.id}:`, statusText.substring(0, 500));

    let statusData: any = {};
    try { statusData = JSON.parse(statusText); } catch {}
    const outcome = extractUploadOutcome(statusData);

    if (statusRes.status === 404) {
      const ageMs = Date.now() - new Date(event.updated_at || event.created_at || new Date().toISOString()).getTime();
      if (ageMs < PENDING_NOT_FOUND_GRACE_MS) {
        return json({ ok: true, published: 0, pending: 1, title: event.title, message: "Upload request not visible yet" });
      }

      await failEvent(event, originalSourceId, parsedState.trackingKey, parsedState.trackingValue, event.title || event.id, "Upload request was not found after pending grace period", {
        event_id: event.id,
        request_id: outcome.requestId || parsedState.trackingValue,
        job_id: outcome.jobId,
      });
      return json({ ok: false, published: 0, error: "Upload request not found after grace period" }, 500);
    }

    if (!statusRes.ok) {
      return json({ ok: true, published: 0, pending: 1, title: event.title, message: `Provider status check returned HTTP ${statusRes.status}` });
    }

    if (outcome.state === "failed") {
      await failEvent(event, originalSourceId, parsedState.trackingKey, parsedState.trackingValue, event.title || event.id, outcome.error || "Upload provider reported failure", {
        event_id: event.id,
        request_id: outcome.requestId || parsedState.trackingValue,
        job_id: outcome.jobId,
        status: outcome.rawStatus,
      });
      return json({ ok: false, published: 0, error: outcome.error || "Provider reported failure" }, 500);
    }

    return json({
      ok: true,
      published: 0,
      pending: 1,
      title: event.title,
      request_id: outcome.requestId || parsedState.trackingValue,
      job_id: outcome.jobId,
      message: historyConfirmation.state === "history_unavailable"
        ? `Provider accepted upload; waiting for history recovery (${historyConfirmation.reason})`
        : `Upload status is ${outcome.rawStatus || "pending"}; waiting for provider history confirmation`,
    });
  };

  try {
    const reqBody = await req.json().catch(() => ({}));
    const catchUp = reqBody.catch_up === true;
    const forceAllToday = reqBody.force_all_today === true;

    const { data: pendingEvent, error: pendingError } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("category", "smm")
      .like("source_id", `${PUBLISHING_PREFIX}%`)
      .order("updated_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pendingError) {
      console.error("[smm-auto-publish] Pending query error:", pendingError);
      return json({ error: pendingError.message }, 500);
    }

    if (pendingEvent) {
      console.log(`[smm-auto-publish] Polling pending upload for event ${pendingEvent.id}`);
      return await pollPendingUpload(pendingEvent);
    }

    const now = new Date();
    const lookbackMs = (catchUp || forceAllToday) ? 24 * 60 * 60 * 1000 : 20 * 60 * 1000;
    const windowStart = new Date(now.getTime() - lookbackMs).toISOString();
    const windowEnd = forceAllToday
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)).toISOString()
      : new Date(now.getTime() + 2 * 60 * 1000).toISOString();

    console.log(`[smm-auto-publish] ${catchUp ? "CATCH-UP" : "Normal"} window: ${windowStart} → ${windowEnd}`);

    const { data: events, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("category", "smm")
      .gte("start_time", windowStart)
      .lte("start_time", windowEnd)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[smm-auto-publish] Query error:", error);
      return json({ error: error.message }, 500);
    }

    if (!events || events.length === 0) {
      console.log("[smm-auto-publish] No events due in window");
      return json({ ok: true, published: 0, message: "No events due" });
    }

    const unpublished = events.filter((event) => parsePublishState(event.source_id, event.id).state === "ready");

    if (unpublished.length === 0) {
      console.log("[smm-auto-publish] All due events already processed or pending");
      return json({ ok: true, published: 0, message: "All already processed or pending" });
    }

    console.log(`[smm-auto-publish] Found ${unpublished.length} ready events in window`);
    return await queueUpload(unpublished[0]);
  } catch (err) {
    console.error("[smm-auto-publish] Fatal error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});