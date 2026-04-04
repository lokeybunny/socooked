import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find overdue prospects (next_followup_at <= now, not dead/active)
    const { data: overdue } = await sb
      .from("videography_prospects")
      .select("id, business_name, contact_name, phone, pipeline_stage, next_followup_at, last_contacted_at")
      .lte("next_followup_at", new Date().toISOString())
      .not("pipeline_stage", "in", '("dead","active")')
      .order("next_followup_at", { ascending: true });

    if (!overdue || overdue.length === 0) {
      return new Response(JSON.stringify({ ok: true, reminders: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create activity_log entries for in-app notifications
    const logEntries = overdue.map((p: any) => ({
      entity_type: "videography_prospect",
      entity_id: p.id,
      action: "followup_due",
      meta: {
        name: p.business_name,
        contact: p.contact_name || "No contact set",
        message: `📹 Follow up with ${p.business_name}${p.contact_name ? ` (${p.contact_name})` : ""} — ${p.phone || "no phone"}`,
      },
    }));

    await sb.from("activity_log").insert(logEntries);

    // Send Telegram notification
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const lines = overdue.map((p: any, i: number) =>
        `${i + 1}. <b>${p.business_name}</b>${p.contact_name ? ` — ${p.contact_name}` : ""}${p.phone ? ` | ${p.phone}` : ""}`
      );

      const text = `📹 <b>Videography Followup Reminder</b>\n\n${lines.join("\n")}\n\n${overdue.length} business${overdue.length > 1 ? "es" : ""} need followup today.`;

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
        }),
      });
    }

    // Bump next_followup_at by 7 days so they don't fire again until next week
    for (const p of overdue) {
      await sb.from("videography_prospects").update({
        next_followup_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }).eq("id", p.id);
    }

    console.log(`[videography-followup] Sent ${overdue.length} reminders`);

    return new Response(JSON.stringify({ ok: true, reminders: overdue.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("videography-followup error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
