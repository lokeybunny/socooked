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
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);
...
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