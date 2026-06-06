// XITBOT @everyone relay
// Receives mirror messages (from Pebble webhook or any forwarder), detects
// @everyone / @here in a specific source channel, and re-broadcasts an
// @everyone ping as XITBOT to a destination channel.
//
// POST body (flexible — supports a few common mirror shapes):
// {
//   "content": "...",                  // message text (required-ish)
//   "channel_id": "1512253930917068913", // source channel id
//   "author": "username",              // optional, for context
//   "dest_channel_id": "...",          // optional override; defaults to SOURCE
//   "force": true                      // optional: skip @everyone detection
// }
//
// Also accepts Discord-shaped payloads with `mentions`, `mention_everyone`,
// nested `message: {...}`, or `embeds[0].description`.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_API = "https://discord.com/api/v10";
const SOURCE_CHANNEL_ID = "1512253930917068913";
const DEFAULT_DEST_CHANNEL_ID = SOURCE_CHANNEL_ID; // change later if needed
const ACTIVE_AUTOR_STATUSES = [
  "queued",
  "launching_browser",
  "recording",
  "waiting_for_stop_phrase",
  "stop_phrase_detected",
];

async function stopActiveAutoRJobs(channelId: string, sourceMessageId: string | undefined) {
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botSecret = Deno.env.get("BOT_SECRET");
  if (!supaUrl || !serviceKey || !botSecret) {
    return { skipped: true, reason: "AutoR env missing" };
  }

  const supabase = createClient(supaUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("recording_jobs")
    .select("job_id,status,discord_channel_id")
    .in("status", ACTIVE_AUTOR_STATUSES)
    .order("created_at", { ascending: false })
    .limit(10);

  if (channelId) query = query.eq("discord_channel_id", channelId);

  const { data: jobs, error } = await query;
  if (error) throw new Error(`AutoR lookup failed: ${error.message}`);
  if (!jobs?.length) return { stopped: [], count: 0 };

  const stopped: string[] = [];
  for (const job of jobs) {
    const res = await fetch(`${supaUrl}/functions/v1/autor-api/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": botSecret,
      },
      body: JSON.stringify({
        jobId: job.job_id,
        reason: "Discord stop phrase: all supply has been sold",
        discordMessageId: sourceMessageId ?? null,
      }),
    });
    if (!res.ok) {
      console.error("[xitbot-everyone-relay] AutoR stop failed", job.job_id, res.status, await res.text());
      continue;
    }
    stopped.push(job.job_id);
  }

  return { stopped, count: stopped.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("XITBOT_TOKEN");
    if (!token) {
      return json({ error: "XITBOT_TOKEN not configured" }, 500);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    // Normalize across common mirror shapes
    const msg = body.message ?? body;
    const content: string =
      msg.content ??
      msg.text ??
      msg.embeds?.[0]?.description ??
      body.content ??
      "";
    const channelId: string =
      msg.channel_id ?? msg.channelId ?? body.channel_id ?? "";
    const author: string =
      msg.author?.username ??
      msg.author?.name ??
      msg.username ??
      body.author ??
      "someone";

    const destChannelId: string =
      body.dest_channel_id ?? body.destChannelId ?? DEFAULT_DEST_CHANNEL_ID;

    // Filter: only act on the watched source channel (when one is provided)
    if (channelId && channelId !== SOURCE_CHANNEL_ID) {
      return json({ skipped: true, reason: "not source channel", channelId });
    }

    // Trigger phrase: "all supply has been sold" → delete source msg and broadcast @everyone
    const SOLD_OUT_RE = /all\s+supply\s+has\s+been\s+sold/i;
    const isSoldOut = SOLD_OUT_RE.test(content);

    // Trigger phrase: "chat is opened" → post VIP reminder w/ ticket + info buttons
    const CHAT_OPENED_RE = /chat\s+is\s+opened/i;
    const isChatOpened = CHAT_OPENED_RE.test(content);

    // Mirror ONLY when the message literally contains "@everyone".
    // Sold-out trigger still deletes the source msg but does not auto-mirror.
    const mentionEveryone: boolean = /@everyone\b/i.test(content);

    // Axiom link detection — extract Solana mint and post DexScreener embed
    // Examples:
    //   https://axiom.trade/t/<MINT>/...
    //   https://axiom.trade/meme/<MINT>
    //   https://axiom.trade/@user/<MINT>
    const AXIOM_RE = /https?:\/\/(?:www\.)?axiom\.trade\/[^\s]*?([1-9A-HJ-NP-Za-km-z]{32,44})/gi;
    const axiomMatches = [...String(content).matchAll(AXIOM_RE)];
    const axiomMints: string[] = [];
    for (const m of axiomMatches) {
      if (m[1] && !axiomMints.includes(m[1])) axiomMints.push(m[1]);
    }
    const hasAxiom = axiomMints.length > 0;

    if (!mentionEveryone && !isChatOpened && !hasAxiom && !isSoldOut) {
      return json({ skipped: true, reason: "no trigger detected" });
    }

    // If sold-out trigger, delete original message from source channel (best-effort)
    const sourceMessageId: string | undefined =
      msg.id ?? msg.message_id ?? body.message_id;
    let deleted = false;
    if (isSoldOut && sourceMessageId && channelId) {
      try {
        const delRes = await fetch(
          `${DISCORD_API}/channels/${channelId}/messages/${sourceMessageId}`,
          { method: "DELETE", headers: { Authorization: `Bot ${token}` } },
        );
        deleted = delRes.ok;
        if (!delRes.ok) {
          console.error(
            "[xitbot-everyone-relay] delete failed",
            delRes.status,
            await delRes.text(),
          );
        }
      } catch (e) {
        console.error("[xitbot-everyone-relay] delete error", e);
      }
    }

    const results: Record<string, unknown> = { destChannelId, author, deleted };

    if (isSoldOut) {
      try {
        results.autorStop = await stopActiveAutoRJobs(channelId, sourceMessageId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[xitbot-everyone-relay] AutoR sold-out stop error", msg);
        results.autorStopError = msg;
      }
    }

    // Mirror the original content verbatim (text-only) when @everyone-style trigger fired
    if (mentionEveryone) {
      let alert = String(content).slice(0, 2000);
      if (!/@everyone\b/i.test(alert)) {
        alert = `@everyone ${alert}`.slice(0, 2000);
      }
      if (!alert.trim()) alert = "@everyone";

      const res = await fetch(
        `${DISCORD_API}/channels/${destChannelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: alert,
            allowed_mentions: { parse: ["everyone"] },
          }),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        console.error("[xitbot-everyone-relay] discord error", res.status, text);
        return json(
          { error: "discord post failed", status: res.status, details: text },
          502,
        );
      }
      results.mirrored = true;
    }

    // VIP reminder w/ Open a Ticket + More Info link buttons
    if (isChatOpened) {
      const reminderRes = await fetch(
        `${DISCORD_API}/channels/${destChannelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content:
              "🔒 Reminder: this room is for **VIP members** only. If you're interested in launching rugs with our team, open a ticket below.",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Open a Ticket",
                    url: "https://discord.com/channels/1315100988478193684/1361454879138254988",
                  },
                  {
                    type: 2,
                    style: 5,
                    label: "More Info",
                    url: "https://discord.com/channels/1315100988478193684/1511280744012451861",
                  },
                ],
              },
            ],
          }),
        },
      );
      const rText = await reminderRes.text();
      if (!reminderRes.ok) {
        console.error(
          "[xitbot-everyone-relay] reminder post failed",
          reminderRes.status,
          rText,
        );
        return json(
          { error: "reminder post failed", status: reminderRes.status, details: rText },
          502,
        );
      }
      results.reminderPosted = true;
    }

    // Axiom link → fetch DexScreener pair data & post rich embed w/ chart links
    if (hasAxiom) {
      const embeds: any[] = [];
      const componentsRows: any[] = [];

      for (const mint of axiomMints.slice(0, 3)) {
        let name = mint.slice(0, 4) + "…" + mint.slice(-4);
        let symbol = "TOKEN";
        let priceUsd: string | null = null;
        let priceChange24h: number | null = null;
        let liquidityUsd: number | null = null;
        let fdv: number | null = null;
        let volume24h: number | null = null;
        let imageUrl: string | null = null;
        let pairUrl = `https://dexscreener.com/solana/${mint}`;

        try {
          const dsRes = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
          );
          if (dsRes.ok) {
            const dsData = await dsRes.json();
            const pairs = (dsData?.pairs ?? []) as any[];
            // Pick highest-liquidity Solana pair
            const sol = pairs
              .filter((p) => p.chainId === "solana")
              .sort(
                (a, b) =>
                  (b?.liquidity?.usd ?? 0) - (a?.liquidity?.usd ?? 0),
              );
            const best = sol[0] ?? pairs[0];
            if (best) {
              name = best?.baseToken?.name ?? name;
              symbol = best?.baseToken?.symbol ?? symbol;
              priceUsd = best?.priceUsd ?? null;
              priceChange24h = best?.priceChange?.h24 ?? null;
              liquidityUsd = best?.liquidity?.usd ?? null;
              fdv = best?.fdv ?? null;
              volume24h = best?.volume?.h24 ?? null;
              imageUrl =
                best?.info?.imageUrl ??
                `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png`;
              pairUrl = best?.url ?? pairUrl;
            }
          } else {
            await dsRes.text();
          }
        } catch (e) {
          console.error("[xitbot-everyone-relay] dexscreener error", e);
        }

        const fmtNum = (n: number | null) => {
          if (n == null || isNaN(n)) return "—";
          if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
          if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
          return `$${n.toFixed(2)}`;
        };
        const changeStr =
          priceChange24h == null
            ? "—"
            : `${priceChange24h >= 0 ? "🟢 +" : "🔴 "}${priceChange24h.toFixed(2)}%`;

        embeds.push({
          title: `${name} ($${symbol})`,
          url: pairUrl,
          color: priceChange24h != null && priceChange24h < 0 ? 0xef4444 : 0x00ff88,
          description: `📊 Axiom link detected — live chart below.\n\`${mint}\``,
          thumbnail: imageUrl ? { url: imageUrl } : undefined,
          fields: [
            { name: "Price", value: priceUsd ? `$${Number(priceUsd).toPrecision(4)}` : "—", inline: true },
            { name: "24h", value: changeStr, inline: true },
            { name: "Liquidity", value: fmtNum(liquidityUsd), inline: true },
            { name: "Volume 24h", value: fmtNum(volume24h), inline: true },
            { name: "FDV", value: fmtNum(fdv), inline: true },
            { name: "Chain", value: "Solana", inline: true },
          ],
          footer: { text: "DexScreener • powered by XITBOT" },
        });

        componentsRows.push({
          type: 1,
          components: [
            { type: 2, style: 5, label: `📈 ${symbol} Chart`, url: pairUrl },
            {
              type: 2,
              style: 5,
              label: "Pump.fun",
              url: `https://pump.fun/coin/${mint}`,
            },
            {
              type: 2,
              style: 5,
              label: "Axiom",
              url: `https://axiom.trade/t/${mint}`,
            },
          ],
        });
      }

      const axiomRes = await fetch(
        `${DISCORD_API}/channels/${destChannelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            embeds,
            components: componentsRows.slice(0, 5),
            allowed_mentions: { parse: [] },
          }),
        },
      );
      const aText = await axiomRes.text();
      if (!axiomRes.ok) {
        console.error(
          "[xitbot-everyone-relay] axiom embed failed",
          axiomRes.status,
          aText,
        );
      } else {
        results.axiomPosted = axiomMints;
      }

      // Fire AutoR recording jobs for each detected Axiom URL
      try {
        const supaUrl = Deno.env.get("SUPABASE_URL");
        const botSecret = Deno.env.get("BOT_SECRET");
        if (supaUrl && botSecret) {
          const axiomUrlRe = /https?:\/\/(?:www\.)?axiom\.trade\/[^\s<>"']+/gi;
          const axiomUrls = [...String(content).matchAll(axiomUrlRe)].map((m) => m[0]);
          const jobs: any[] = [];
          for (const u of axiomUrls.slice(0, 3)) {
            const r = await fetch(`${supaUrl}/functions/v1/autor-api/create`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-bot-secret": botSecret,
              },
              body: JSON.stringify({
                url: u,
                sourceType: "axiom",
                discordChannelId: channelId,
                discordMessageId: sourceMessageId,
                recordingName: `Axiom ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
              }),
            });
            const j = await r.json().catch(() => ({}));
            jobs.push(j);
            // Auto-launch cloud browser session for this job
            if (j?.jobId && !j?.duplicate) {
              fetch(`${supaUrl}/functions/v1/autor-browserbase-launch`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-bot-secret": botSecret },
                body: JSON.stringify({ jobId: j.jobId }),
              }).catch((e) => console.error("[xitbot] autor launch error", e));
            }
          }
          results.autorJobs = jobs;
        }
      } catch (e) {
        console.error("[xitbot-everyone-relay] autor create error", e);
      }
    }

    return json({ ok: true, ...results });
  } catch (err: any) {
    console.error("[xitbot-everyone-relay] error", err?.message || err);
    return json({ error: err?.message || "unknown" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
