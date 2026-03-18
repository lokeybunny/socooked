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

const SUCCESS_STATUSES = new Set(["success", "successful", "completed", "complete", "published", "posted", "done"]);
const FAILURE_STATUSES = new Set(["failed", "failure", "error", "rejected", "cancelled", "canceled", "expired"]);
const PENDING_STATUSES = new Set(["pending", "queued", "processing", "in_progress", "in-progress", "uploading", "accepted", "scheduled", "running"]);

const asNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

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

  const hasSuccessSignal = payload?.success === true || payload?.data?.success === true || Boolean(postUrl) || Boolean(platformPostId);
  const hasFailureSignal = payload?.success === false || statuses.some((status) => FAILURE_STATUSES.has(status));
  const hasPendingSignal = statuses.some((status) => PENDING_STATUSES.has(status));
  const hasSuccessStatus = statuses.some((status) => SUCCESS_STATUSES.has(status));

  if (hasFailureSignal) {
    return {
      state: "failed" as const,
      requestId,
      jobId,
      postUrl,
      error: errorMessage || statuses[0] || "Upload failed",
      rawStatus: statuses[0],
    };
  }

  if (hasSuccessStatus || hasSuccessSignal) {
    if (postUrl || platformPostId || hasSuccessStatus) {
      return {
        state: "success" as const,
        requestId,
        jobId,
        postUrl,
        rawStatus: statuses[0],
      };
    }
  }

  return {
    state: hasPendingSignal || requestId || jobId ? "pending" as const : "unknown" as const,
    requestId,
    jobId,
    postUrl,
    error: errorMessage,
    rawStatus: statuses[0],
  };
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

  const queueUpload = async (event: any) => {
    const { mediaUrl, profileUsername, caption, isVideo, platforms, originalSourceId } = extractEventPayload(event);

    if (!mediaUrl) {
      console.log(`[smm-auto-publish] Skipping event ${event.id} — no media URL found`);
      await notifyFailure(event.title || event.id, "No media URL found in event description", { event_id: event.id });
      await supabase.from("calendar_events").update({ source_id: buildStructuredSourceId(FAILED_PREFIX, "event", event.id, originalSourceId) }).eq("id", event.id);
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
      await notifyFailure(event.title || event.id, uploadText.substring(0, 300), { event_id: event.id, status_code: uploadRes.status });
      await supabase.from("calendar_events").update({ source_id: buildStructuredSourceId(FAILED_PREFIX, "event", event.id, originalSourceId) }).eq("id", event.id);
      return json({ ok: false, published: 0, error: uploadText.substring(0, 200) }, 500);
    }

    const outcome = extractUploadOutcome(uploadData);
    if (outcome.state === "failed") {
      await notifyFailure(event.title || event.id, outcome.error || "Upload provider rejected request", {
        event_id: event.id,
        request_id: outcome.requestId,
        job_id: outcome.jobId,
      });
      await supabase
        .from("calendar_events")
        .update({ source_id: buildStructuredSourceId(FAILED_PREFIX, outcome.requestId ? "request_id" : outcome.jobId ? "job_id" : "event", outcome.requestId || outcome.jobId || event.id, originalSourceId) })
        .eq("id", event.id);
      return json({ ok: false, published: 0, error: outcome.error || "Provider rejected upload" }, 500);
    }

    if (outcome.state === "success") {
      return await finalizePublishedEvent(event, originalSourceId, profileUsername, platforms, outcome, mediaUrl);
    }

    const trackingKey = outcome.requestId ? "request_id" : outcome.jobId ? "job_id" : null;
    const trackingValue = outcome.requestId || outcome.jobId;

    if (!trackingKey || !trackingValue) {
      await notifyFailure(event.title || event.id, "Upload accepted without request_id/job_id tracking token", { event_id: event.id });
      await supabase.from("calendar_events").update({ source_id: buildStructuredSourceId(FAILED_PREFIX, "event", event.id, originalSourceId) }).eq("id", event.id);
      return json({ ok: false, published: 0, error: "Upload accepted without tracking token" }, 500);
    }

    await supabase
      .from("calendar_events")
      .update({ source_id: buildStructuredSourceId(PUBLISHING_PREFIX, trackingKey, trackingValue, originalSourceId) })
      .eq("id", event.id);

    await logActivity("auto_publish_queued", {
      name: `⏳ Auto-publish queued: ${event.title}`,
      profile: profileUsername,
      platforms,
      request_id: outcome.requestId,
      job_id: outcome.jobId,
    });

    return json({
      ok: true,
      published: 0,
      pending: 1,
      title: event.title,
      request_id: outcome.requestId,
      job_id: outcome.jobId,
      message: "Upload accepted and awaiting provider completion",
    });
  };

  const pollPendingUpload = async (event: any) => {
    const parsedState = parsePublishState(event.source_id, event.id);
    if (parsedState.state !== "publishing" || !parsedState.trackingKey || !parsedState.trackingValue) {
      return json({ ok: true, published: 0, message: "No pending upload to poll" });
    }

    const { mediaUrl, profileUsername, platforms, originalSourceId } = extractEventPayload(event);
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

      await supabase
        .from("calendar_events")
        .update({ source_id: buildStructuredSourceId(FAILED_PREFIX, parsedState.trackingKey, parsedState.trackingValue, originalSourceId) })
        .eq("id", event.id);
      await notifyFailure(event.title || event.id, "Upload request was not found after pending grace period", {
        event_id: event.id,
        request_id: outcome.requestId || parsedState.trackingValue,
        job_id: outcome.jobId,
      });
      return json({ ok: false, published: 0, error: "Upload request not found after grace period" }, 500);
    }

    if (!statusRes.ok) {
      return json({ ok: true, published: 0, pending: 1, title: event.title, message: `Provider status check returned HTTP ${statusRes.status}` });
    }

    if (outcome.state === "success") {
      return await finalizePublishedEvent(event, originalSourceId, profileUsername, platforms, outcome, mediaUrl || "");
    }

    if (outcome.state === "failed") {
      await supabase
        .from("calendar_events")
        .update({ source_id: buildStructuredSourceId(FAILED_PREFIX, parsedState.trackingKey, parsedState.trackingValue, originalSourceId) })
        .eq("id", event.id);
      await notifyFailure(event.title || event.id, outcome.error || "Upload provider reported failure", {
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
      message: `Upload still pending${outcome.rawStatus ? ` (${outcome.rawStatus})` : ""}`,
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