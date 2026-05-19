import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type JobPayload = {
  task_type: string;
  prompt: string;
  negative_prompt?: string | null;
  settings_json?: Record<string, unknown> | null;
  input_image_url?: string | null;
  input_audio_url?: string | null;
  project_id?: string | null;
  subproject_id?: string | null;
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<T>((_, rej) => {
    timeoutId = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
};

const fetchWithTimeout = async (url: string, init: RequestInit, ms: number, label: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(`${label} timed out after ${ms}ms`), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const readUserIdFromJwt = (jwt: string): string | null => {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    if (!decoded?.sub || (decoded?.exp && decoded.exp * 1000 < Date.now())) return null;
    return decoded.sub;
  } catch {
    return null;
  }
};

const runBg = (fn: () => Promise<unknown>) => {
  try {
    // @ts-ignore EdgeRuntime is available in the hosted edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(fn().catch((e) => console.error("bg error:", e)));
    } else {
      fn().catch((e) => console.error("bg error:", e));
    }
  } catch (e) {
    console.error("runBg error:", e);
  }
};

const adminClient = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const normalizeSeedanceModel = (taskType: string, model: string, hasImage: boolean) => {
  if (taskType === "t2v" && model.includes("image-to-video") && !hasImage) {
    return model.replace("image-to-video", "text-to-video");
  }
  if ((taskType === "i2v" || taskType === "ti2v") && model.includes("text-to-video") && hasImage) {
    return model.replace("text-to-video", "image-to-video");
  }
  return model;
};

const isSeedanceRealPersonSafetyError = (message: string) =>
  /input image may contain real person/i.test(message) || /may contain real person/i.test(message);

const extractGeneratedImageUrl = (message: any): string | null => {
  const images = Array.isArray(message?.images) ? message.images : [];
  for (const img of images) {
    const url = img?.image_url?.url;
    if (typeof url === "string" && url) return url;
  }

  const content = Array.isArray(message?.content) ? message.content : [];
  for (const part of content) {
    const url = part?.image_url?.url;
    if (typeof url === "string" && url) return url;
  }

  return null;
};

async function persistGeneratedImage(admin: ReturnType<typeof adminClient>, imageUrl: string, userId: string | null | undefined, jobId: string) {
  if (!imageUrl.startsWith("data:")) return { url: imageUrl, path: null };

  const match = imageUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) throw new Error("Lovable AI returned an unsupported image format for the Seedance safety fix.");

  const mimeExt = match[1];
  const ext = mimeExt === "jpeg" ? "jpg" : mimeExt;
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  const path = `studio/seedance-safety/${userId || "system"}/${jobId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("content-uploads").upload(path, bytes, {
    contentType: `image/${mimeExt}`,
    upsert: true,
  });
  if (error) throw new Error(`Could not save Seedance safety-fixed reference: ${error.message}`);

  const { data } = admin.storage.from("content-uploads").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function removeHumanFromReference(admin: ReturnType<typeof adminClient>, sourceUrl: string, userId: string | null | undefined, jobId: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured for the Seedance safety fix.");

  const aiRes = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "Edit this reference image so it clears a video model safety filter: remove every visible real or realistic human/person from the shot, including faces, bodies, hands, reflections, and silhouettes. Naturally reconstruct the background/scene behind them. Preserve the original camera angle, architecture/location, lighting, aspect ratio, color style, and usable scene details. Do not add new people, text, logos, or watermarks.",
          },
          { type: "image_url", image_url: { url: sourceUrl } },
        ],
      }],
      modalities: ["image", "text"],
    }),
  }, 45000, "Lovable AI Seedance safety image edit");

  const aiText = await aiRes.text();
  let aiJson: any = {};
  try { aiJson = aiText ? JSON.parse(aiText) : {}; } catch { aiJson = { raw: aiText }; }

  if (!aiRes.ok) {
    const msg = aiJson?.error?.message || aiJson?.error || aiJson?.message || aiText;
    throw new Error(`Lovable AI safety image edit failed ${aiRes.status}: ${msg}`);
  }

  const editedUrl = extractGeneratedImageUrl(aiJson?.choices?.[0]?.message);
  if (!editedUrl) throw new Error("Lovable AI did not return an edited image for the Seedance safety fix.");
  return persistGeneratedImage(admin, editedUrl, userId, jobId);
}

async function buildSeedanceSafetyRetryPayload(
  admin: ReturnType<typeof adminClient>,
  jobId: string,
  payload: JobPayload,
  settings: Record<string, unknown>,
  refImages: string[],
  isImageToVideo: boolean,
  isRefToVideo: boolean,
): Promise<JobPayload | null> {
  if ((settings as any).seedance_real_person_clean_retry_attempted) return null;

  const sourceUrl = isRefToVideo ? refImages[0] : isImageToVideo ? payload.input_image_url : null;
  if (!sourceUrl) return null;

  await admin.from("generation_jobs").update({
    status: "provisioning",
    progress: 4,
    backend_logs: "Seedance blocked the reference as a possible real person. Auto-cleaning the main human reference with Lovable AI and retrying once.",
  }).eq("id", jobId);

  const cleaned = await removeHumanFromReference(admin, sourceUrl, (settings as any).user_id || null, jobId);
  const retrySettings: Record<string, unknown> = {
    ...settings,
    seedance_real_person_clean_retry_attempted: true,
    seedance_real_person_original_reference_url: sourceUrl,
    seedance_real_person_clean_reference_url: cleaned.url,
    seedance_real_person_clean_reference_path: cleaned.path,
  };

  const retryPayload: JobPayload = {
    ...payload,
    settings_json: retrySettings,
  };

  if (isRefToVideo) {
    retrySettings.reference_images_urls = [cleaned.url, ...refImages.slice(1)];
  } else if (isImageToVideo) {
    retryPayload.input_image_url = cleaned.url;
  }

  return retryPayload;
}

async function dispatchJob(jobId: string, payload: JobPayload) {
  const admin = adminClient();
  const settings = payload.settings_json || {};
  const provider = (settings.provider || "").toString().toLowerCase();

  if (provider === "seedance") {
    const atlasKey = Deno.env.get("ATLASCLOUD_API_KEY");
    if (!atlasKey) {
      await admin.from("generation_jobs").update({
        status: "failed",
        error_message: "Atlas Cloud API key is not configured, so this job could not be dispatched.",
      }).eq("id", jobId);
      return;
    }

    const requestedModel = (settings.seedance_model || "bytedance/seedance-2.0-fast/text-to-video").toString();
    const seedanceModel = normalizeSeedanceModel(payload.task_type, requestedModel, Boolean(payload.input_image_url));
    const isImageToVideo = seedanceModel.includes("image-to-video");
    const isRefToVideo = seedanceModel.includes("reference-to-video");

    if (isImageToVideo && !payload.input_image_url) {
      await admin.from("generation_jobs").update({
        status: "failed",
        error_message: `${seedanceModel} requires an input image. Switch to a text-to-video model or upload an image.`,
      }).eq("id", jobId);
      return;
    }

    const refImages = Array.isArray((settings as any).reference_images_urls) ? (settings as any).reference_images_urls as string[] : [];
    const refVideos = Array.isArray((settings as any).reference_videos_urls) ? (settings as any).reference_videos_urls as string[] : [];
    const refAudios = Array.isArray((settings as any).reference_audios_urls) ? (settings as any).reference_audios_urls as string[] : [];

    if (isRefToVideo && refImages.length === 0 && refVideos.length === 0) {
      await admin.from("generation_jobs").update({
        status: "failed",
        error_message: `${seedanceModel} requires at least one reference image or video.`,
      }).eq("id", jobId);
      return;
    }

    const seedancePayload: Record<string, unknown> = {
      model: seedanceModel,
      prompt: payload.prompt || "The scene comes alive with gentle motion and cinematic lighting",
      duration: Math.max(4, Math.min(15, Number(settings.duration) || 5)),
      resolution: settings.seedance_resolution || "480p",
      ratio: settings.seedance_ratio || settings.aspect_ratio || "adaptive",
      generate_audio: settings.generate_audio !== false,
      watermark: false,
    };
    if (isImageToVideo) {
      seedancePayload.image = payload.input_image_url;
      const lastFrame = (settings as any).last_frame_image_url;
      if (lastFrame) {
        seedancePayload.last_frame_image = lastFrame;
        seedancePayload.end_image = lastFrame;
      }
    }
    if (isRefToVideo) {
      if (refImages.length) seedancePayload.reference_images = refImages;
      if (refVideos.length) seedancePayload.reference_videos = refVideos;
      if (refAudios.length) seedancePayload.reference_audios = refAudios;
      if ((settings as any).return_last_frame) seedancePayload.return_last_frame = true;
    }

    try {
      await admin.from("generation_jobs").update({ status: "provisioning", progress: 3 }).eq("id", jobId);

      const sub = await fetchWithTimeout("https://api.atlascloud.ai/api/v1/model/generateVideo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${atlasKey}`,
        },
        body: JSON.stringify(seedancePayload),
      }, 20000, "Seedance submission");

      const subText = await sub.text();
      let subJson: any = {};
      try { subJson = subText ? JSON.parse(subText) : {}; } catch { subJson = { raw: subText }; }

      if (!sub.ok) {
        throw new Error(`Seedance API ${sub.status}: ${subJson?.error || subJson?.message || subText}`);
      }

      const predictionId = subJson?.data?.id || subJson?.id;
      if (!predictionId) {
        throw new Error(subJson?.error || subJson?.message || "Seedance: no prediction id returned");
      }

      await admin.from("generation_jobs").update({
        status: "running",
        worker_job_id: predictionId,
        progress: 8,
        settings_json: { ...settings, seedance_model: seedanceModel },
      }).eq("id", jobId);

      const deadline = Date.now() + 140 * 1000;
      let progress = 12;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        const pollRes = await fetchWithTimeout(
          `https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`,
          { headers: { Authorization: `Bearer ${atlasKey}` } },
          12000,
          "Seedance polling",
        );
        const pollText = await pollRes.text();
        let pollJson: any = {};
        try { pollJson = pollText ? JSON.parse(pollText) : {}; } catch { pollJson = { raw: pollText }; }
        const status = pollJson?.data?.status || pollJson?.status;

        if (status === "completed" || status === "succeeded") {
          const outputs: string[] = pollJson?.data?.outputs || pollJson?.outputs || [];
          await admin.from("generation_jobs").update({
            status: "completed",
            progress: 100,
            output_video_url: outputs[0] || pollJson?.data?.video_url || pollJson?.video_url || null,
            output_thumbnail_url: outputs[1] || pollJson?.data?.thumbnail_url || pollJson?.thumbnail_url || null,
          }).eq("id", jobId);
          return;
        }

        if (status === "failed" || status === "timeout" || status === "cancelled") {
          await admin.from("generation_jobs").update({
            status: "failed",
            error_message: pollJson?.data?.error || pollJson?.error || `Seedance status: ${status}`,
          }).eq("id", jobId);
          return;
        }

        progress = Math.min(progress + 4, 92);
        await admin.from("generation_jobs").update({ status: "running", progress }).eq("id", jobId);
      }

      await admin.from("generation_jobs").update({
        status: "running",
        progress: 92,
        backend_logs: "Seedance accepted the job. Polling stopped before the edge runtime limit; wait for provider completion or retry status later.",
      }).eq("id", jobId);
    } catch (e) {
      await admin.from("generation_jobs").update({
        status: "failed",
        error_message: `Seedance error: ${(e as Error).message}`,
      }).eq("id", jobId);
    }
    return;
  }

  const workerUrl = Deno.env.get("STUDIO_WORKER_URL");
  if (!workerUrl) {
    await admin.from("generation_jobs").update({
      status: "failed",
      error_message: "No generator is configured for this mode. Turn on Atlas Cloud Seedance for text/image video or configure a GPU worker.",
    }).eq("id", jobId);
    return;
  }

  try {
    await admin.from("generation_jobs").update({ status: "provisioning", progress: 2 }).eq("id", jobId);

    const workerPayload = {
      job_id: jobId,
      task_type: payload.task_type,
      prompt: payload.prompt,
      negative_prompt: payload.negative_prompt || null,
      settings,
      input_image_url: payload.input_image_url || null,
      input_audio_url: payload.input_audio_url || null,
      callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/studio-orchestrator/callback`,
    };

    const workerKey = Deno.env.get("STUDIO_WORKER_API_KEY");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (workerKey) headers.Authorization = `Bearer ${workerKey}`;

    const workerRes = await fetchWithTimeout(`${workerUrl}/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify(workerPayload),
    }, 12000, "worker submission");

    if (workerRes.ok) {
      const workerData = await workerRes.json();
      await admin.from("generation_jobs").update({
        worker_job_id: workerData.job_id || workerData.id || null,
        status: "provisioning",
        progress: 5,
      }).eq("id", jobId);
    } else {
      const errText = await workerRes.text();
      await admin.from("generation_jobs").update({
        status: "failed",
        error_message: `Worker error ${workerRes.status}: ${errText}`,
      }).eq("id", jobId);
    }
  } catch (workerErr) {
    await admin.from("generation_jobs").update({
      status: "failed",
      error_message: `Worker unreachable: ${(workerErr as Error).message}`,
    }).eq("id", jobId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.split("/studio-orchestrator")[1] || "";

  if (req.method === "POST" && path === "/callback") {
    const callbackKey = Deno.env.get("STUDIO_WORKER_API_KEY");
    if (callbackKey && req.headers.get("Authorization") !== `Bearer ${callbackKey}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { job_id, status, progress, output_video_url, output_thumbnail_url, logs, error_message } = body;
    if (!job_id) return json({ error: "job_id required" }, 400);

    const update: Record<string, unknown> = {};
    if (status) update.status = status;
    if (progress !== undefined) update.progress = progress;
    if (output_video_url) update.output_video_url = output_video_url;
    if (output_thumbnail_url) update.output_thumbnail_url = output_thumbnail_url;
    if (logs) update.backend_logs = logs;
    if (error_message) update.error_message = error_message;

    const { error } = await adminClient().from("generation_jobs").update(update).eq("id", job_id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const userId = readUserIdFromJwt(token);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  try {
    if (req.method === "POST" && (path === "" || path === "/")) {
      const body = await req.json();
      const payload: JobPayload = {
        task_type: body.task_type,
        prompt: body.prompt,
        negative_prompt: body.negative_prompt || null,
        settings_json: body.settings_json || {},
        input_image_url: body.input_image_url || null,
        input_audio_url: body.input_audio_url || null,
        project_id: body.project_id || null,
        subproject_id: body.subproject_id || null,
      };

      if (!payload.prompt || !payload.task_type) return json({ error: "prompt and task_type are required" }, 400);

      let job: any, insertErr: any;
      try {
        const res: any = await withTimeout(
          adminClient().from("generation_jobs").insert({
            user_id: userId,
            task_type: payload.task_type,
            prompt: payload.prompt,
            negative_prompt: payload.negative_prompt,
            settings_json: payload.settings_json,
            input_image_url: payload.input_image_url,
            input_audio_url: payload.input_audio_url,
            project_id: payload.project_id,
            subproject_id: payload.subproject_id,
            status: "queued",
            progress: 0,
          }).select().single(),
          15000,
          "insert generation_jobs",
        );
        job = res.data;
        insertErr = res.error;
      } catch (e) {
        return json({ error: (e as Error).message }, 504);
      }

      if (insertErr || !job) return json({ error: insertErr?.message || "insert failed" }, 500);

      runBg(() => dispatchJob(job.id, payload));
      return json({ job }, 202);
    }

    if (req.method === "POST" && path.startsWith("/cancel/")) {
      const jobId = path.replace("/cancel/", "");
      const { data: job } = await supabase.from("generation_jobs").select("worker_job_id, status").eq("id", jobId).single();
      if (!job) return json({ error: "Job not found" }, 404);
      const TERMINAL = ["completed", "failed", "cancelled", "timeout"];
      if (TERMINAL.includes(job.status)) {
        // Idempotent: already in a terminal state — nothing to cancel.
        return json({ ok: true, already: job.status });
      }

      const workerUrl = Deno.env.get("STUDIO_WORKER_URL");
      if (workerUrl && job.worker_job_id) {
        try {
          const workerKey = Deno.env.get("STUDIO_WORKER_API_KEY");
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (workerKey) headers.Authorization = `Bearer ${workerKey}`;
          await fetchWithTimeout(`${workerUrl}/jobs/${job.worker_job_id}/cancel`, { method: "POST", headers }, 8000, "worker cancel");
        } catch (_) { /* best effort */ }
      }

      await supabase.from("generation_jobs").update({ status: "cancelled" }).eq("id", jobId);
      return json({ ok: true });
    }

    if (req.method === "POST" && path.startsWith("/retry/")) {
      const jobId = path.replace("/retry/", "");
      const { data: job } = await supabase.from("generation_jobs").select("*").eq("id", jobId).single();
      if (!job) return json({ error: "Job not found" }, 404);

      const payload: JobPayload = {
        task_type: job.task_type,
        prompt: job.prompt,
        negative_prompt: job.negative_prompt,
        settings_json: (job.settings_json as Record<string, unknown>) || {},
        input_image_url: job.input_image_url,
        input_audio_url: job.input_audio_url,
      };

      await supabase.from("generation_jobs").update({
        status: "queued",
        progress: 0,
        error_message: null,
        backend_logs: null,
        worker_job_id: null,
        output_video_url: null,
        output_thumbnail_url: null,
      }).eq("id", jobId);

      runBg(() => dispatchJob(jobId, payload));
      return json({ ok: true });
    }

    if (req.method === "POST" && path.startsWith("/refresh/")) {
      const jobId = path.replace("/refresh/", "");
      const admin = adminClient();
      const { data: job } = await admin.from("generation_jobs").select("*").eq("id", jobId).single();
      if (!job) return json({ error: "Job not found" }, 404);
      if (["completed", "failed", "cancelled"].includes(job.status)) {
        return json({ ok: true, already: job.status });
      }
      if (!job.worker_job_id) return json({ error: "No worker_job_id to poll" }, 400);

      const settings = (job.settings_json as Record<string, unknown>) || {};
      const provider = (settings.provider || "").toString().toLowerCase();
      if (provider !== "seedance") return json({ error: "Refresh only supported for seedance" }, 400);

      const atlasKey = Deno.env.get("ATLASCLOUD_API_KEY");
      if (!atlasKey) return json({ error: "ATLASCLOUD_API_KEY missing" }, 500);

      try {
        const pollRes = await fetchWithTimeout(
          `https://api.atlascloud.ai/api/v1/model/prediction/${job.worker_job_id}`,
          { headers: { Authorization: `Bearer ${atlasKey}` } },
          12000,
          "Seedance refresh",
        );
        const pollText = await pollRes.text();
        let pollJson: any = {};
        try { pollJson = pollText ? JSON.parse(pollText) : {}; } catch { pollJson = { raw: pollText }; }
        const status = pollJson?.data?.status || pollJson?.status;

        if (status === "completed" || status === "succeeded") {
          const outputs: string[] = pollJson?.data?.outputs || pollJson?.outputs || [];
          await admin.from("generation_jobs").update({
            status: "completed",
            progress: 100,
            output_video_url: outputs[0] || pollJson?.data?.video_url || pollJson?.video_url || null,
            output_thumbnail_url: outputs[1] || pollJson?.data?.thumbnail_url || pollJson?.thumbnail_url || null,
          }).eq("id", jobId);
          return json({ ok: true, status: "completed" });
        }
        if (status === "failed" || status === "timeout" || status === "cancelled") {
          await admin.from("generation_jobs").update({
            status: "failed",
            error_message: pollJson?.data?.error || pollJson?.error || `Seedance status: ${status}`,
          }).eq("id", jobId);
          return json({ ok: true, status: "failed" });
        }
        return json({ ok: true, status: status || "pending", provider_response: pollJson });
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("Studio orchestrator error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
