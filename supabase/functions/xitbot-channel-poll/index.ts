// Polls Discord channel 1512253930917068913 for new messages using XITBOT
// and forwards each new message to the xitbot-everyone-relay function so the
// existing trigger logic (@everyone mirror, "all supply has been sold",
// "chat is opened" VIP reminder) fires automatically without needing an
// external webhook.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_API = "https://discord.com/api/v10";
const SOURCE_CHANNEL_ID = "1512253930917068913";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("XITBOT_TOKEN");
    if (!token) return json({ error: "XITBOT_TOKEN not configured" }, 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve bot identity so we skip our own messages (avoid feedback loops)
    let botUserId: string | null = null;
    try {
      const me = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bot ${token}` },
      });
      if (me.ok) botUserId = (await me.json())?.id ?? null;
    } catch (_) { /* ignore */ }

    // Load last_message_id from state table
    const { data: state } = await supabase
      .from("xitbot_poll_state")
      .select("last_message_id")
      .eq("channel_id", SOURCE_CHANNEL_ID)
      .maybeSingle();

    const lastMessageId: string | null = state?.last_message_id ?? null;

    let url = `${DISCORD_API}/channels/${SOURCE_CHANNEL_ID}/messages?limit=50`;
    if (lastMessageId) url += `&after=${lastMessageId}`;

    let res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });

    // Stale ID → reset to fetch newest 5
    if (lastMessageId && !res.ok) {
      console.warn(`[xitbot-channel-poll] stale last_message_id, resetting`);
      res = await fetch(
        `${DISCORD_API}/channels/${SOURCE_CHANNEL_ID}/messages?limit=5`,
        { headers: { Authorization: `Bot ${token}` } },
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `[xitbot-channel-poll] fetch failed ${res.status}: ${errText}`,
      );
      return json({ error: "discord fetch failed", status: res.status }, 502);
    }

    const messages: any[] = await res.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ ok: true, processed: 0 });
    }

    // Sort oldest → newest so we process in order
    messages.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let newestId = lastMessageId;
    let processed = 0;
    const relayUrl = `${SUPABASE_URL}/functions/v1/xitbot-everyone-relay`;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    for (const m of messages) {
      if (!newestId || BigInt(m.id) > BigInt(newestId)) newestId = m.id;

      // Skip our own bot messages (mirrored/reminder posts)
      if (botUserId && m.author?.id === botUserId) continue;
      // Skip non-default & non-reply messages (system msgs, joins, etc.)
      if (m.type !== 0 && m.type !== 19) continue;

      try {
        const relayRes = await fetch(relayUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            id: m.id,
            channel_id: SOURCE_CHANNEL_ID,
            content: m.content ?? "",
            author: m.author?.username ?? "user",
            mention_everyone: !!m.mention_everyone,
          }),
        });
        const txt = await relayRes.text();
        if (!relayRes.ok) {
          console.error(
            `[xitbot-channel-poll] relay failed ${relayRes.status}: ${txt}`,
          );
        } else {
          processed++;
        }
      } catch (e) {
        console.error("[xitbot-channel-poll] relay error", e);
      }
    }

    // Persist newest id
    if (newestId && newestId !== lastMessageId) {
      await supabase
        .from("xitbot_poll_state")
        .upsert(
          {
            channel_id: SOURCE_CHANNEL_ID,
            last_message_id: newestId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "channel_id" },
        );
    }

    return json({ ok: true, processed, newestId });
  } catch (err: any) {
    console.error("[xitbot-channel-poll] error", err?.message || err);
    return json({ error: err?.message || "unknown" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
