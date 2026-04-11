import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.3/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub as string;

  const url = new URL(req.url);
  const path = url.pathname.split("/studio-orchestrator")[1] || "";

  try {
    // POST / — submit a new generation job
    if (req.method === "POST" && (path === "" || path === "/")) {
      const body = await req.json();
      const { task_type, prompt, negative_prompt, settings_json, input_image_url, input_audio_url } = body;

      if (!prompt || !task_type) {
        return new Response(JSON.stringify({ error: "prompt and task_type are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create job record
      const { data: job, error: insertErr } = await supabase
        .from("generation_jobs")
        .insert({
          user_id: userId,
          task_type,
          prompt,
          negative_prompt: negative_prompt || null,
          settings_json: settings_json || {},
          input_image_url: input_image_url || null,
          input_audio_url: input_audio_url || null,
          status: "queued",
          progress: 0,
        })
        .select()
        .single();

      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Forward to GPU worker if configured
      const workerUrl = Deno.env.get("STUDIO_WORKER_URL");
      const workerKey = Deno.env.get("STUDIO_WORKER_API_KEY");

      if (workerUrl) {
        try {
          const workerPayload = {
            job_id: job.id,
            task_type,
            prompt,
            negative_prompt,
            settings: settings_json || {},
            input_image_url: input_image_url || null,
            input_audio_url: input_audio_url || null,
            callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/studio-orchestrator/callback`,
          };

          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (workerKey) headers["Authorization"] = `Bearer ${workerKey}`;

          const workerRes = await fetch(`${workerUrl}/jobs`, {
            method: "POST",
            headers,
            body: JSON.stringify(workerPayload),
          });

          if (workerRes.ok) {
            const workerData = await workerRes.json();
            // Update job with worker_job_id
            const adminClient = createClient(
              Deno.env.get("SUPABASE_URL")!,
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
            );
            await adminClient
              .from("generation_jobs")
              .update({
                worker_job_id: workerData.job_id || workerData.id || null,
                status: "provisioning",
              })
              .eq("id", job.id);
          } else {
            const errText = await workerRes.text();
            const adminClient = createClient(
              Deno.env.get("SUPABASE_URL")!,
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
            );
            await adminClient
              .from("generation_jobs")
              .update({
                status: "failed",
                error_message: `Worker error ${workerRes.status}: ${errText}`,
              })
              .eq("id", job.id);
          }
        } catch (workerErr) {
          console.error("Worker submission error:", workerErr);
          const adminClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );
          await adminClient
            .from("generation_jobs")
            .update({
              status: "failed",
              error_message: `Worker unreachable: ${(workerErr as Error).message}`,
            })
            .eq("id", job.id);
        }
      }

      return new Response(JSON.stringify({ job }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /callback — worker callback to update job status
    if (req.method === "POST" && path === "/callback") {
      const body = await req.json();
      const { job_id, status, progress, output_video_url, output_thumbnail_url, logs, error_message } = body;

      if (!job_id) {
        return new Response(JSON.stringify({ error: "job_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const update: Record<string, unknown> = {};
      if (status) update.status = status;
      if (progress !== undefined) update.progress = progress;
      if (output_video_url) update.output_video_url = output_video_url;
      if (output_thumbnail_url) update.output_thumbnail_url = output_thumbnail_url;
      if (logs) update.backend_logs = logs;
      if (error_message) update.error_message = error_message;

      const { error: updateErr } = await adminClient
        .from("generation_jobs")
        .update(update)
        .eq("id", job_id);

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /cancel/:jobId
    if (req.method === "POST" && path.startsWith("/cancel/")) {
      const jobId = path.replace("/cancel/", "");
      
      const { data: job } = await supabase
        .from("generation_jobs")
        .select("worker_job_id, status")
        .eq("id", jobId)
        .single();

      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (job.status !== "queued" && job.status !== "provisioning") {
        return new Response(JSON.stringify({ error: "Can only cancel queued/provisioning jobs" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try to cancel on worker
      const workerUrl = Deno.env.get("STUDIO_WORKER_URL");
      if (workerUrl && job.worker_job_id) {
        try {
          const workerKey = Deno.env.get("STUDIO_WORKER_API_KEY");
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (workerKey) headers["Authorization"] = `Bearer ${workerKey}`;
          await fetch(`${workerUrl}/jobs/${job.worker_job_id}/cancel`, { method: "POST", headers });
        } catch (_) { /* best effort */ }
      }

      await supabase
        .from("generation_jobs")
        .update({ status: "cancelled" })
        .eq("id", jobId);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /retry/:jobId
    if (req.method === "POST" && path.startsWith("/retry/")) {
      const jobId = path.replace("/retry/", "");
      
      const { data: job } = await supabase
        .from("generation_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reset job
      await supabase
        .from("generation_jobs")
        .update({
          status: "queued",
          progress: 0,
          error_message: null,
          backend_logs: null,
          worker_job_id: null,
          output_video_url: null,
          output_thumbnail_url: null,
        })
        .eq("id", jobId);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Studio orchestrator error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
