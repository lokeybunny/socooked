import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const promptPreview = (job.prompt || "").slice(0, 300);
    const caption = `🎬 *AI Gen Complete* — \`${job.task_type}\`\n\n${promptPreview}\n\n[Download](${job.output_video_url})`;

    const results: any[] = [];
    for (const chat_id of chatIds) {
      // Try sendVideo first
      const videoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          video: job.output_video_url,
          caption,
          parse_mode: "Markdown",
          supports_streaming: true,
        }),
      });
      const videoJson = await videoRes.json().catch(() => ({}));
      results.push({ chat_id, method: "sendVideo", ok: videoJson?.ok });

      // Fallback to message with link if video upload fails (file too big, unreachable, etc.)
      if (!videoJson?.ok) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            text: `🎬 *AI Gen Complete* — \`${job.task_type}\`\n\n${promptPreview}\n\n[Download Video](${job.output_video_url})`,
            parse_mode: "Markdown",
            disable_web_page_preview: false,
          }),
        });
      }
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
