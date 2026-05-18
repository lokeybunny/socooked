import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const telegramPost = async (token: string, method: string, body: Record<string, unknown>) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: Boolean(json?.ok), status: res.status, description: json?.description || null };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = body.job_id || body.record?.id;
    if (!jobId) {
      return new Response(JSON.stringify({ error: "missing job_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return new Response(JSON.stringify({ error: "telegram not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job, error } = await admin
      .from("generation_jobs")
      .select("id, task_type, prompt, status, output_video_url, output_thumbnail_url, settings_json, meta:settings_json")
      .eq("id", jobId)
      .maybeSingle();

    if (error || !job) {
      return new Response(JSON.stringify({ error: error?.message || "job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status !== "completed" || !job.output_video_url) {
      return new Response(JSON.stringify({ skipped: true, reason: "not completed or no output" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: skip if already delivered
    const sent = (job.settings_json as any)?.telegram_delivered_at;
    if (sent && !body.force) {
      return new Response(JSON.stringify({ skipped: true, reason: "already delivered" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatIds = String(TELEGRAM_CHAT_ID).split(",").map((s) => s.trim()).filter(Boolean);
    const promptPreview = (job.prompt || "").replace(/\s+/g, " ").trim().slice(0, 260);
    const caption = `🎬 AI Gen Complete — ${job.task_type}\n\n${promptPreview}`.slice(0, 900);

    const results: any[] = [];
    for (const chat_id of chatIds) {
      const videoJson = await telegramPost(TELEGRAM_BOT_TOKEN, "sendVideo", {
        chat_id,
        video: job.output_video_url,
        caption,
        supports_streaming: true,
      });
      results.push({ chat_id, method: "sendVideo", ...videoJson });

      if (!videoJson.ok) {
        const documentJson = await telegramPost(TELEGRAM_BOT_TOKEN, "sendDocument", {
          chat_id,
          document: job.output_video_url,
          caption,
        });
        results.push({ chat_id, method: "sendDocument", ...documentJson });
      }

      if (!results.some((result) => result.chat_id === chat_id && result.ok)) {
        const messageJson = await telegramPost(TELEGRAM_BOT_TOKEN, "sendMessage", {
          chat_id,
          text: `${caption}\n\nDownload Video: ${job.output_video_url}`,
          disable_web_page_preview: false,
        });
        results.push({ chat_id, method: "sendMessage", ...messageJson });
      }
    }

    if (!results.some((result) => result.ok)) {
      console.error("studio-telegram-deliver failed", JSON.stringify(results));
      return new Response(JSON.stringify({ error: "telegram send failed", results }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark delivered
    const newSettings = { ...(job.settings_json as any || {}), telegram_delivered_at: new Date().toISOString() };
    await admin.from("generation_jobs").update({ settings_json: newSettings }).eq("id", jobId);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
