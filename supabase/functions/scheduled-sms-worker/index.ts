import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const nowIso = new Date().toISOString();
  const { data: due } = await svc
    .from("scheduled_sms_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(50);

  const results: any[] = [];
  for (const job of due || []) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
        body: JSON.stringify({ action: "send", to: job.to_phone, body: job.body, customer_id: job.customer_id || null }),
      });
      const text = await r.text();
      const ok = r.ok;
      await svc.from("scheduled_sms_jobs").update({
        status: ok ? "sent" : "failed",
        sent_at: ok ? new Date().toISOString() : null,
        attempts: (job.attempts || 0) + 1,
        last_error: ok ? null : text.slice(0, 500),
      }).eq("id", job.id);
      results.push({ id: job.id, ok, status: r.status });
    } catch (e: any) {
      await svc.from("scheduled_sms_jobs").update({
        status: "failed",
        attempts: (job.attempts || 0) + 1,
        last_error: e?.message || String(e),
      }).eq("id", job.id);
      results.push({ id: job.id, ok: false, error: e?.message });
    }
  }
  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
