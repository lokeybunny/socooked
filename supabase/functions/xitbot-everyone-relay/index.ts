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

const DISCORD_API = "https://discord.com/api/v10";
const SOURCE_CHANNEL_ID = "1512253930917068913";
const DEFAULT_DEST_CHANNEL_ID = SOURCE_CHANNEL_ID; // change later if needed

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

    // Detect @everyone / @here — also honor explicit mention_everyone flag
    // or a `force` override for manual testing.
    const mentionEveryone: boolean =
      isSoldOut ||
      body.force === true ||
      msg.mention_everyone === true ||
      /@everyone\b/i.test(content) ||
      /@here\b/i.test(content);

    if (!mentionEveryone) {
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

    // Mirror the original content verbatim (text-only, no attachments).
    // Ensure @everyone is present so the broadcast actually pings.
    let alert = String(content).slice(0, 2000);
    if (!/@everyone\b/i.test(alert)) {
      alert = `@everyone ${alert}`.slice(0, 2000);
    }
    if (!alert.trim()) alert = "@everyone";

    // Post as XITBOT bot (text only — no embeds/attachments)
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

    return json({ ok: true, destChannelId, author, deleted });
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
