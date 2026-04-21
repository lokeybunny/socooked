// 4-hour traffic report posted to the same Discord channel as funnel notifications
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1496195405199835388/TSjesn8TtD3RV6TJtcWXT7UyfXJ4mkmo3jFRXhUbaC_bIhj5lBsXPn0CUWTVYiSjM__F";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // Sessions in last 4h
    const { data: sessions } = await supabase
      .from("analytics_sessions")
      .select("id, visitor_id, landing_path, country, city, device_type, referrer_domain, page_views_count, duration_seconds, is_bounce, started_at")
      .gte("started_at", since);

    // Pageviews in last 4h
    const { data: pageviews } = await supabase
      .from("analytics_pageviews")
      .select("path")
      .gte("created_at", since);

    const totalSessions = sessions?.length || 0;
    const uniqueVisitors = new Set(sessions?.map((s) => s.visitor_id)).size;
    const totalPageviews = pageviews?.length || 0;
    const bounces = sessions?.filter((s) => s.is_bounce).length || 0;
    const bounceRate = totalSessions ? Math.round((bounces / totalSessions) * 100) : 0;
    const avgDuration = totalSessions
      ? Math.round((sessions!.reduce((a, s) => a + (s.duration_seconds || 0), 0) / totalSessions))
      : 0;

    // Top pages
    const pageCounts = new Map<string, number>();
    pageviews?.forEach((p) => pageCounts.set(p.path, (pageCounts.get(p.path) || 0) + 1));
    const topPages = [...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Top referrers
    const refCounts = new Map<string, number>();
    sessions?.forEach((s) => {
      const r = s.referrer_domain || "(direct)";
      refCounts.set(r, (refCounts.get(r) || 0) + 1);
    });
    const topRefs = [...refCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Top countries
    const countryCounts = new Map<string, number>();
    sessions?.forEach((s) => {
      const c = s.country || "Unknown";
      countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
    });
    const topCountries = [...countryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Devices
    const deviceCounts = { mobile: 0, desktop: 0, tablet: 0 };
    sessions?.forEach((s) => {
      const d = (s.device_type as keyof typeof deviceCounts) || "desktop";
      if (d in deviceCounts) deviceCounts[d]++;
    });

    const formatDuration = (s: number) => {
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}m ${r}s`;
    };

    const topPageLines = topPages.length
      ? topPages.map(([p, c], i) => `\`${i + 1}.\` **${p}** — ${c} views`).join("\n")
      : "_No pageviews_";

    const topRefLines = topRefs.length
      ? topRefs.map(([r, c]) => `• ${r} — ${c}`).join("\n")
      : "_No referrers_";

    const topCountryLines = topCountries.length
      ? topCountries.map(([c, n]) => `• ${c} — ${n}`).join("\n")
      : "_No data_";

    const embed = {
      title: "📊 4-Hour Traffic Report",
      description: `Activity for the last **4 hours** across all landing pages.`,
      color: totalSessions > 0 ? 0x10b981 : 0x6b7280,
      fields: [
        { name: "👥 Visitors", value: `**${uniqueVisitors}** unique\n${totalSessions} sessions`, inline: true },
        { name: "📄 Pageviews", value: `**${totalPageviews}**`, inline: true },
        { name: "⏱️ Avg Duration", value: `**${formatDuration(avgDuration)}**`, inline: true },
        { name: "📉 Bounce Rate", value: `**${bounceRate}%**`, inline: true },
        { name: "📱 Devices", value: `Mobile: ${deviceCounts.mobile}\nDesktop: ${deviceCounts.desktop}\nTablet: ${deviceCounts.tablet}`, inline: true },
        { name: "🌍 Top Countries", value: topCountryLines, inline: true },
        { name: "🔥 Top Pages", value: topPageLines, inline: false },
        { name: "🔗 Top Sources", value: topRefLines, inline: false },
      ],
      footer: { text: "Warren Guru Analytics" },
      timestamp: new Date().toISOString(),
    };

    const dashUrl = "https://stu25.com/analytics";
    const payload = {
      content: totalSessions === 0 ? "🔕 No traffic in the last 4 hours." : null,
      embeds: [embed],
      components: [],
    };
    // Add markdown link to dashboard
    embed.fields.push({ name: "📈 Full Dashboard", value: `[Open Analytics](${dashUrl})`, inline: false });

    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("Discord error", res.status, t);
      return new Response(JSON.stringify({ error: t }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ ok: true, totalSessions, uniqueVisitors, totalPageviews }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("report error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
