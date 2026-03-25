import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_CHANNELS = ["1484998470103466156", "1485050868838564030"];
const TG_SHILL_LOUNGE = "-1002188568751";
const SHILLER_RATE = 0.05;
const RAIDER_RATE = 0.02;

const CHEERFUL_INTROS = [
  "🎉 Hourly Shill Report is IN!",
  "⚡ Time for your hourly earnings update!",
  "🔥 Another hour, another opportunity!",
  "💰 Cha-ching! Hourly stats are here!",
  "🚀 Hourly tweet tracker just dropped!",
  "🍌 Banana time! Here's your hourly report!",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    const tgBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!botToken) throw new Error("Missing DISCORD_BOT_TOKEN");
    if (!tgBotToken) throw new Error("Missing TELEGRAM_BOT_TOKEN");

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Calculate start of today in PST (midnight PST = 08:00 UTC)
    const pstNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const startOfDayPST = new Date(pstNow.getFullYear(), pstNow.getMonth(), pstNow.getDate());
    // Convert back to UTC: PST is UTC-7 (PDT) or UTC-8 (PST)
    const pstOffsetMs = now.getTime() - pstNow.getTime();
    const startOfDayUTC = new Date(startOfDayPST.getTime() + pstOffsetMs);

    // Count tweets detected in the last hour
    const { count: hourlyTweetCount } = await supabase
      .from("shill_post_analytics")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneHourAgo.toISOString());

    // Count tweets since midnight PST
    const { count: dailyTweetCount } = await supabase
      .from("shill_post_analytics")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfDayUTC.toISOString());

    // Count verified clicks in the last hour
    const { count: hourlyClickCount } = await supabase
      .from("shill_clicks")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneHourAgo.toISOString())
      .eq("status", "verified");

    // Count verified clicks today
    const { count: dailyClickCount } = await supabase
      .from("shill_clicks")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfDayUTC.toISOString())
      .eq("status", "verified");

    // Count ALL clicks today (any status)
    const { count: dailyAllClicks } = await supabase
      .from("shill_clicks")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfDayUTC.toISOString());

    // Get active shillers from smm-auto-shill config (discord_assignments map)
    const { data: shillConfigs } = await supabase
      .from("site_configs")
      .select("content")
      .eq("site_id", "smm-auto-shill");

    // Count unique discord assignments across all shill configs
    const allAssignments = new Set<string>();
    for (const cfg of shillConfigs || []) {
      const assignments = cfg.content?.discord_assignments;
      if (assignments && typeof assignments === "object") {
        Object.keys(assignments).forEach((k) => allAssignments.add(k));
      }
    }
    const activeShillerCount = allAssignments.size;

    const { count: activeRaiders } = await supabase
      .from("raiders")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    const tweetsThisHour = hourlyTweetCount || 0;
    const tweetsToday = dailyTweetCount || 0;
    const clicksThisHour = hourlyClickCount || 0;
    const clicksToday = dailyClickCount || 0;
    const totalClicksToday = dailyAllClicks || 0;
    const hoursElapsed = Math.max(1, Math.floor((now.getTime() - startOfDayUTC.getTime()) / (60 * 60 * 1000)));
    const hourlyAvg = tweetsToday > 0 ? (tweetsToday / hoursElapsed).toFixed(1) : "0";
    const raiderCount = activeRaiders || 0;

    // Earnings based on verified clicks × rate
    const hourlyEarnings = clicksThisHour * SHILLER_RATE;
    const dailyEarnings = clicksToday * SHILLER_RATE;

    // Pick a random cheerful intro
    const intro = CHEERFUL_INTROS[Math.floor(Math.random() * CHEERFUL_INTROS.length)];

    const pstTime = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    });

    // ── Discord Embed ──
    const embed = {
      title: `${intro}`,
      color: 0xf59e0b,
      fields: [
        {
          name: "📊 This Hour",
          value: `**${tweetsThisHour}** tweets • **${clicksThisHour}** verified clicks`,
          inline: true,
        },
        {
          name: "📈 Today's Stats",
          value: `**${tweetsToday}** tweets (${hourlyAvg}/hr)\n**${totalClicksToday}** clicks (${clicksToday} verified)`,
          inline: true,
        },
        {
          name: "👥 Active Team",
          value: `⚡ **${activeShillerCount}** Shillers\n🛡️ **${raiderCount}** Raiders`,
          inline: true,
        },
        {
          name: "💰 Verified Earnings",
          value: [
            `This Hour: **${clicksThisHour}** clicks × $0.05 = **$${hourlyEarnings.toFixed(2)}**`,
            `Today: **${clicksToday}** clicks × $0.05 = **$${dailyEarnings.toFixed(2)}**`,
            ``,
            `🤑 Every verified click = **$0.05** earned!`,
          ].join("\n"),
          inline: false,
        },
      ],
      footer: { text: `${pstTime} PST • Stats refresh every hour` },
    };

    // Send to Discord channels
    const discordResults = await Promise.all(
      DISCORD_CHANNELS.map(async (channelId) => {
        const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ embeds: [embed] }),
        });
        const ok = res.ok;
        if (!ok) console.error(`[hourly-report] Discord ${channelId} failed:`, await res.text());
        return { channelId, ok };
      })
    );

    // ── Telegram Message ──
    const tgMessage = [
      intro,
      "",
      `📊 *This Hour:* ${tweetsThisHour} tweets detected`,
      `📈 *Today's Average:* ${hourlyAvg} tweets/hour`,
      "",
      `👥 *Active Team:*`,
      `⚡ ${activeShillerCount} Shillers • 🛡️ ${raiderCount} Raiders`,
      "",
      `💰 *Potential Passive Income:*`,
      `This Hour: ${tweetsThisHour} links × $0.05 = *$${potentialEarnings.toFixed(2)}*`,
      `Today: ${tweetsToday} links × $0.05 = *$${dailyPotentialEarnings.toFixed(2)}*`,
      `🤑 Every link is *$0.05* waiting to be claimed!`,
      "",
      `🕐 ${pstTime} PST`,
    ].join("\n");

    const tgBody: any = {
      chat_id: TG_SHILL_LOUNGE,
      text: tgMessage,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💎 Join Discord & Start Earning",
              url: "https://discord.gg/socooked",
            },
          ],
        ],
      },
    };

    const tgRes = await fetch(
      `https://api.telegram.org/bot${tgBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tgBody),
      }
    );
    const tgOk = tgRes.ok;
    if (!tgOk) console.error("[hourly-report] TG failed:", await tgRes.text());

    return new Response(
      JSON.stringify({
        ok: true,
        tweets_this_hour: tweetsThisHour,
        hourly_avg: hourlyAvg,
        potential_earnings: potentialEarnings.toFixed(2),
        discord: discordResults,
        telegram: tgOk,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[hourly-report] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
