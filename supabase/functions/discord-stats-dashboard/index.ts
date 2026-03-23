import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const DISCORD_API = "https://discord.com/api/v10";
const STATS_CHANNEL = "1485192984789127310";
const SITE_URL = "https://socooked.lovable.app";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!botToken) throw new Error("Missing DISCORD_BOT_TOKEN");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Fetch shiller data (outbound_accounts + shill_clicks + assignments) ──
    const { data: accounts } = await supabase
      .from("outbound_accounts")
      .select("account_label, account_identifier, is_authorized")
      .order("account_label");

    const { data: shillClicks } = await supabase
      .from("shill_clicks")
      .select("discord_username, click_type, status, rate")
      .in("click_type", ["shill"]);

    // Fetch assigned shillers from config so we show all workers, even those with 0 clicks
    const { data: assignmentConfig } = await supabase
      .from("site_configs")
      .select("content")
      .eq("site_id", "smm-auto-shill")
      .eq("section", "NysonBlack")
      .maybeSingle();

    const { data: raidClicks } = await supabase
      .from("shill_clicks")
      .select("discord_username, click_type, status, rate, raider_secret_code")
      .in("click_type", ["raid"]);

    // ── Fetch raider data ──
    const { data: raiders } = await supabase
      .from("raiders")
      .select("discord_username, status, total_clicks, total_earned, solana_wallet, secret_code")
      .eq("status", "active")
      .order("total_earned", { ascending: false });

    // ── Fetch payout requests ──
    const { data: payouts } = await supabase
      .from("payout_requests")
      .select("discord_username, amount_owed, status, user_type")
      .eq("status", "pending");

    // ── Aggregate shiller stats ──
    // Seed from discord_assignments so all assigned shillers appear even with 0 clicks
    const shillerStats: Record<string, { verified: number; pending: number; flagged: number; earned: number; xAccount: string }> = {};
    const assignments = assignmentConfig?.content?.discord_assignments || {};
    const usernames = assignmentConfig?.content?.discord_usernames || {};
    for (const [discordId, xAccount] of Object.entries(assignments)) {
      const name = usernames[discordId] || String(discordId).replace(/<@!?/, "").replace(/>$/, "");
      if (!shillerStats[name]) shillerStats[name] = { verified: 0, pending: 0, flagged: 0, earned: 0, xAccount: String(xAccount) };
    }

    for (const c of shillClicks || []) {
      const name = c.discord_username || "unknown";
      if (!shillerStats[name]) shillerStats[name] = { verified: 0, pending: 0, flagged: 0, earned: 0, xAccount: "" };
      if (c.status === "verified") {
        shillerStats[name].verified++;
        shillerStats[name].earned += Number(c.rate || 0.05);
      } else if (c.status === "flagged_bad") {
        shillerStats[name].flagged++;
      } else {
        shillerStats[name].pending++;
      }
    }

    // ── Aggregate raider stats from clicks ──
    const raiderClickStats: Record<string, { verified: number; pending: number; earned: number }> = {};
    for (const c of raidClicks || []) {
      const name = c.discord_username || "unknown";
      if (!raiderClickStats[name]) raiderClickStats[name] = { verified: 0, pending: 0, earned: 0 };
      if (c.status === "verified") {
        raiderClickStats[name].verified++;
        raiderClickStats[name].earned += Number(c.rate || 0.02);
      } else {
        raiderClickStats[name].pending++;
      }
    }

    // ── Build totals ──
    const totalShillerEarned = Object.values(shillerStats).reduce((s, v) => s + v.earned, 0);
    const totalShillerVerified = Object.values(shillerStats).reduce((s, v) => s + v.verified, 0);
    const totalRaiderEarned = Object.values(raiderClickStats).reduce((s, v) => s + v.earned, 0);
    const totalRaiderVerified = Object.values(raiderClickStats).reduce((s, v) => s + v.verified, 0);
    const totalPendingPayouts = (payouts || []).reduce((s, p) => s + Number(p.amount_owed), 0);
    const activeAccounts = (accounts || []).filter(a => a.is_authorized).length;

    // ── Format shiller leaderboard ──
    const shillerEntries = Object.entries(shillerStats)
      .sort((a, b) => b[1].earned - a[1].earned)
      .slice(0, 10);
    
    let shillerBoard = "";
    if (shillerEntries.length === 0) {
      shillerBoard = "*No shiller activity yet*";
    } else {
      shillerBoard = shillerEntries.map(([name, s], i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`${i + 1}.\``;
        const flag = s.flagged > 0 ? ` ⚠️${s.flagged}` : "";
        // Mask X username: show first 3 chars + ****
        const xTag = s.xAccount ? ` (@${s.xAccount.slice(0, 3)}****)` : "";
        return `${medal} **${name}**${xTag} — ✅ ${s.verified} | 💰 $${s.earned.toFixed(2)}${flag}`;
      }).join("\n");
    }

    // ── Format raider leaderboard ──
    const activeRaiders = raiders || [];
    let raiderBoard = "";
    if (activeRaiders.length === 0) {
      raiderBoard = "*No active raiders yet*";
    } else {
      raiderBoard = activeRaiders.slice(0, 10).map((r, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`${i + 1}.\``;
        const clickData = raiderClickStats[r.discord_username];
        const verifiedClicks = clickData?.verified || r.total_clicks || 0;
        const earned = clickData?.earned || Number(r.total_earned) || 0;
        const wallet = r.solana_wallet ? "🔗" : "❌";
        return `${medal} **${r.discord_username}** — ✅ ${verifiedClicks} | 💰 $${earned.toFixed(2)} | ${wallet}`;
      }).join("\n");
    }

    // ── Format X accounts ──
    const accountList = (accounts || []).slice(0, 8).map(a => {
      const status = a.is_authorized ? "🟢" : "🔴";
      return `${status} @${a.account_identifier}`;
    }).join(" • ");

    // ── Pending payouts ──
    let payoutText = "No pending payouts";
    if (payouts && payouts.length > 0) {
      payoutText = payouts.slice(0, 5).map(p =>
        `• **${p.discord_username}** (${p.user_type}) — $${Number(p.amount_owed).toFixed(2)}`
      ).join("\n");
    }

    // ── Build Discord embeds ──
    const now = new Date();
    const embeds = [
      {
        title: "📊 Shill Team — Live Dashboard",
        description: `Real-time stats for **Shillers** and **Raiders**.\nUpdated: <t:${Math.floor(now.getTime() / 1000)}:R>`,
        color: 0x6366f1,
        fields: [
          {
            name: "💎 Overview",
            value: [
              `🔑 **${activeAccounts}** X Accounts Active`,
              `⚡ **${Object.keys(shillerStats).length}** Active Shillers`,
              `🛡️ **${activeRaiders.length}** Active Raiders`,
              `💰 **$${(totalShillerEarned + totalRaiderEarned).toFixed(2)}** Total Earned`,
            ].join("\n"),
            inline: false,
          },
          {
            name: "─── X Accounts ───",
            value: accountList || "*No accounts configured*",
            inline: false,
          },
        ],
        thumbnail: { url: "https://socooked.lovable.app/placeholder.svg" },
      },
      {
        title: "⚡ Shiller Leaderboard",
        description: `Earn **$0.05** per verified click\n\n${shillerBoard}`,
        color: 0xeab308,
        fields: [
          {
            name: "📈 Shiller Totals",
            value: `✅ **${totalShillerVerified}** Verified Clicks\n💰 **$${totalShillerEarned.toFixed(2)}** Earned`,
            inline: true,
          },
        ],
        footer: { text: "Use /authorize to link your X account • /shill to post" },
      },
      {
        title: "🛡️ Raider Leaderboard",
        description: `Earn **$0.02** per verified click\n\n${raiderBoard}`,
        color: 0x22c55e,
        fields: [
          {
            name: "📈 Raider Totals",
            value: `✅ **${totalRaiderVerified}** Verified Clicks\n💰 **$${totalRaiderEarned.toFixed(2)}** Earned`,
            inline: true,
          },
        ],
        footer: { text: "Copy shill text + your #code • Paste on X • Verify with ✅ button" },
      },
      {
        title: "💸 Payouts & Info",
        description: [
          `**Pending Payouts:**\n${payoutText}`,
          "",
          "**How It Works:**",
          "🔹 Shillers earn **$0.05/click** — linked to an X account",
          "🔹 Raiders earn **$0.02/click** — copy-paste shill text",
          "🔹 Payouts every **Friday** in **SOL** 🤑",
          "🔹 Use `/wallet` to set your Solana address",
          "🔹 Use `/balance` to check earnings",
          "🔹 Use `/notify` to get alerts on the go 📱",
          "",
          "💡 *Earn anywhere — Discord DMs & Telegram alerts!*",
        ].join("\n"),
        color: 0x8b5cf6,
        fields: [
          {
            name: "🔗 Live Dashboards",
            value: `[Shiller Board](${SITE_URL}/shillers) • [Raider Board](${SITE_URL}/shillers/raiders) • [Join Info](${SITE_URL}/shill-team)`,
            inline: false,
          },
        ],
        footer: { text: "socooked.lovable.app • Stats update on refresh" },
      },
    ];

    // ── Check for existing pinned stats message to edit, or create new ──
    const siteConfigKey = "discord-stats-dashboard";
    const { data: existingConfig } = await supabase
      .from("site_configs")
      .select("content")
      .eq("site_id", siteConfigKey)
      .eq("section", "message_ids")
      .maybeSingle();

    const messageIds: string[] = existingConfig?.content?.message_ids || [];

    // Delete old messages
    for (const msgId of messageIds) {
      try {
        await fetch(`${DISCORD_API}/channels/${STATS_CHANNEL}/messages/${msgId}`, {
          method: "DELETE",
          headers: { Authorization: `Bot ${botToken}` },
        });
      } catch (_) { /* ignore if already deleted */ }
    }

    // Send new embeds (2 per message due to Discord limits)
    const newMessageIds: string[] = [];

    // Message 1: Overview + Shiller
    const msg1Res = await fetch(`${DISCORD_API}/channels/${STATS_CHANNEL}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embeds[0], embeds[1]] }),
    });
    if (msg1Res.ok) {
      const msg1 = await msg1Res.json();
      newMessageIds.push(msg1.id);
    } else {
      console.error("[stats-dashboard] msg1 failed:", await msg1Res.text());
    }

    // Message 2: Raider + Payouts
    const msg2Res = await fetch(`${DISCORD_API}/channels/${STATS_CHANNEL}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embeds[2], embeds[3]] }),
    });
    if (msg2Res.ok) {
      const msg2 = await msg2Res.json();
      newMessageIds.push(msg2.id);
    } else {
      console.error("[stats-dashboard] msg2 failed:", await msg2Res.text());
    }

    // Save message IDs for future updates
    await supabase
      .from("site_configs")
      .upsert({
        site_id: siteConfigKey,
        section: "message_ids",
        content: { message_ids: newMessageIds, last_updated: now.toISOString() },
      }, { onConflict: "site_id,section" });

    return new Response(JSON.stringify({
      ok: true,
      messages_sent: newMessageIds.length,
      stats: {
        shillers: Object.keys(shillerStats).length,
        raiders: activeRaiders.length,
        total_earned: (totalShillerEarned + totalRaiderEarned).toFixed(2),
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[stats-dashboard] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
