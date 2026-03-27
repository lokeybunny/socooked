import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";

// Channels to notify workers
const NOTIFY_CHANNELS = [
  "1484998470103466156", // shill lounge
  "1485050868838564030", // raid lounge
];

const PAUSE_MESSAGE =
  "🛑 **Campaign Temporarily Paused**\n\n" +
  "The campaign has been paused by an admin to make improvements and add more content.\n\n" +
  "⏳ **Please revisit later** to begin work once the campaign is back online.\n" +
  "❓ If you have questions, please open a support ticket.\n\n" +
  "_This is an automated notification — you'll be notified again in 45 minutes if the campaign is still paused._";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const discordBotToken = Deno.env.get("DISCORD_BOT_TOKEN")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if campaign is still paused
    const { data: pauseCfg } = await supabase
      .from("site_configs")
      .select("content")
      .eq("site_id", "smm-auto-shill")
      .eq("section", "campaign-pause")
      .maybeSingle();

    const content = (pauseCfg?.content as any) || {};
    if (!content.paused) {
      return new Response(JSON.stringify({ skipped: true, reason: "campaign not paused" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check 45-minute throttle
    const now = Date.now();
    const lastNotify = content.last_notify_at ? new Date(content.last_notify_at).getTime() : 0;
    const FORTY_FIVE_MIN = 45 * 60 * 1000;

    // If called from cron, enforce throttle. If called with action=notify (manual), skip throttle.
    let body: any = {};
    try { body = await req.json(); } catch {}
    const isManual = body?.action === "notify";

    if (!isManual && lastNotify && (now - lastNotify) < FORTY_FIVE_MIN) {
      return new Response(JSON.stringify({ skipped: true, reason: "throttled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send notifications to both channels
    const results: string[] = [];
    for (const channelId of NOTIFY_CHANNELS) {
      try {
        const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${discordBotToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: PAUSE_MESSAGE }),
        });
        if (res.ok) {
          results.push(`${channelId}: sent`);
        } else {
          const errText = await res.text();
          results.push(`${channelId}: failed (${res.status}) ${errText}`);
          console.error(`[campaign-pause-notify] Failed to send to ${channelId}: ${errText}`);
        }
      } catch (e) {
        results.push(`${channelId}: error`);
        console.error(`[campaign-pause-notify] Error sending to ${channelId}:`, e);
      }
    }

    // Update last_notify_at
    await supabase.from("site_configs").upsert({
      site_id: "smm-auto-shill",
      section: "campaign-pause",
      content: { ...content, last_notify_at: new Date().toISOString() },
    }, { onConflict: "site_id,section" });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[campaign-pause-notify] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
