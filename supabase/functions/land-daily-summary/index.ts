import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return new Response(
        JSON.stringify({ error: "Telegram not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    // Get today's call queue
    const { data: calls } = await supabase
      .from("lw_call_queue")
      .select("*")
      .eq("queue_date", today)
      .eq("status", "pending")
      .order("call_priority", { ascending: true });

    // Get stats
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [buyersRes, sellersRes, dealsRes, runsRes] = await Promise.all([
      supabase.from("lw_buyers").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("lw_sellers").select("id", { count: "exact", head: true }),
      supabase.from("lw_deals").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
      supabase.from("lw_ingestion_runs").select("credits_used").gte("created_at", monthStart.toISOString()),
    ]);

    const apiSpend = (runsRes.data || []).reduce(
      (sum: number, r: any) => sum + (r.credits_used || 0),
      0
    );

    const callCount = calls?.length || 0;

    // Build message
    let msg = `🏗 <b>WHOLESALE DAILY BRIEF</b>\n`;
    msg += `📅 ${today}\n\n`;

    msg += `📊 <b>Pipeline Stats</b>\n`;
    msg += `├ Active Buyers: ${buyersRes.count || 0}\n`;
    msg += `├ Seller Leads: ${sellersRes.count || 0}\n`;
    msg += `├ Deals (Month): ${dealsRes.count || 0}\n`;
    msg += `└ API Spend: $${apiSpend.toFixed(2)}\n\n`;

    if (callCount === 0) {
      msg += `📞 <b>Call Queue:</b> Empty — no calls today\n`;
    } else {
      msg += `📞 <b>Call Queue:</b> ${callCount} calls\n\n`;

      // Show top 5
      const top = (calls || []).slice(0, 5);
      for (const call of top) {
        const emoji = call.motivation_score >= 70 ? "🔥" : call.motivation_score >= 40 ? "🟡" : "⚪";
        msg += `${emoji} <b>#${call.call_priority}</b> ${call.owner_name || "Unknown"}\n`;
        msg += `   📍 ${call.property_address || "—"}\n`;
        msg += `   📱 ${call.owner_phone}\n`;
        msg += `   💡 ${call.reason}\n\n`;
      }

      if (callCount > 5) {
        msg += `<i>...and ${callCount - 5} more</i>\n`;
      }
    }

    msg += `\n🔗 <a href="https://socooked.lovable.app/wholesale">Open Wholesale Dashboard</a>`;

    // Send via Telegram
    const tgResp = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: msg,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    const tgResult = await tgResp.json();

    return new Response(
      JSON.stringify({
        ok: true,
        calls_queued: callCount,
        telegram_sent: tgResult.ok,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("land-daily-summary error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
