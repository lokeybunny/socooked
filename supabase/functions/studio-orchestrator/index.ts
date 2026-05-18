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

    if (isImageToVideo && !payload.input_image_url) {
      await admin.from("generation_jobs").update({
        status: "failed",
        error_message: `${seedanceModel} requires an input image. Switch to a text-to-video model or upload an image.`,
      }).eq("id", jobId);
      return;
    }

    const seedancePayload: Record<string, unknown> = {
      model: seedanceModel,
      prompt: payload.prompt || "The scene comes alive with gentle motion and cinematic lighting",
      duration: Math.max(4, Math.min(15, Number(settings.duration) || 5)),
      resolution: settings.seedance_resolution || "720p",
      ratio: settings.seedance_ratio || settings.aspect_ratio || "adaptive",
      generate_audio: settings.generate_audio !== false,
      watermark: false,
    };
    if (isImageToVideo) seedancePayload.image = payload.input_image_url;

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
      if (job.status !== "queued" && job.status !== "provisioning") {
        return json({ error: "Can only cancel queued/provisioning jobs" }, 400);
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

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("Studio orchestrator error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
