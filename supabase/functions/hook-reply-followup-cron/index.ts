// hook-reply-followup-cron
// Runs on a schedule. Sends the 72-hour Instagram follow-up via VoidFix
// (powerdial-sms) for any thread whose followup_send_at has passed.
// Re-checks DND list as a safety net before sending.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FOLLOWUP_BODY =
  "Hey — just checking, did you get a chance to follow us on Instagram? If not, mind giving us a follow so we can keep in touch?";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const nowIso = new Date().toISOString();

  const { data: due, error } = await sb
    .from("hook_reply_threads")
    .select("id, phone, phone_last10, followup_send_at")
    .eq("status", "followup_scheduled")
    .lte("followup_send_at", nowIso)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let skipped_dnd = 0;
  let failed = 0;
  const results: any[] = [];

  for (const t of due || []) {
    // Safety net: re-check DND
    const { data: dnd } = await sb
      .from("sms_dnd_list")
      .select("id")
      .eq("phone_last10", t.phone_last10)
      .limit(1);

    if (dnd && dnd[0]) {
      await sb
        .from("hook_reply_threads")
        .update({ status: "dnd", dnd_reason: "dnd_at_send_time" })
        .eq("id", t.id);
      skipped_dnd++;
      results.push({ id: t.id, action: "skipped_dnd" });
      continue;
    }

    // Send via powerdial-sms (VoidFix)
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          action: "send",
          to: t.phone,
          body: FOLLOWUP_BODY,
          source: "hook-reply-followup",
          metadata: {
            source: "hook-reply-followup",
            hook_reply_thread_id: t.id,
          },
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.ok) {
        await sb
          .from("hook_reply_threads")
          .update({
            status: "followup_sent",
            followup_sent_at: new Date().toISOString(),
            meta: { followup_send_external_id: data?.id || null },
          })
          .eq("id", t.id);
        sent++;
        results.push({ id: t.id, action: "sent" });
      } else {
        failed++;
        results.push({ id: t.id, action: "failed", error: data?.error || `http_${resp.status}` });
      }
    } catch (e) {
      failed++;
      results.push({ id: t.id, action: "failed", error: String((e as any)?.message || e) });
    }

    // Throttle a bit
    await new Promise((r) => setTimeout(r, 400));
  }

  return new Response(
    JSON.stringify({ ok: true, considered: due?.length || 0, sent, skipped_dnd, failed, results }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
