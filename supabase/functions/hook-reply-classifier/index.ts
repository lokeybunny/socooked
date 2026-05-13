// hook-reply-classifier
// Called when a new inbound SMS arrives. Looks up open hook_reply_threads
// for the phone, classifies sentiment, and either:
//   - moves the number to DND (negative)
//   - schedules a 72-hour Instagram follow-up (positive/neutral)
//
// POST { phone, body, message_id?, message_created_at? }
// v1.0.1 — force redeploy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const NEGATIVE_KEYWORDS = [
  "stop", "stopall", "unsubscribe", "cancel", "end", "quit",
  "lose my number", "loose my number", "remove me", "remove my number",
  "don't text", "dont text", "do not text", "don't message", "dont message",
  "do not message", "leave me alone", "f off", "fuck off", "f u", "fuck you",
  "wrong number", "not interested", "no thanks", "no thank you",
];

function last10(raw: string | null | undefined) {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "").slice(-10);
}

function isNegativeKeywordHit(body: string): { hit: boolean; reason?: string } {
  const lower = (body || "").toLowerCase().trim();
  if (!lower) return { hit: false };
  // Whole-word "stop"/"end"/"quit"/"cancel" check
  for (const kw of NEGATIVE_KEYWORDS) {
    if (kw.includes(" ")) {
      if (lower.includes(kw)) return { hit: true, reason: kw };
    } else {
      const re = new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`, "i");
      if (re.test(lower)) return { hit: true, reason: kw };
    }
  }
  return { hit: false };
}

async function classifyWithAI(body: string): Promise<"positive" | "neutral" | "negative"> {
  if (!LOVABLE_API_KEY) return "neutral";
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You classify SMS replies. Return STRICT JSON only with one field 'sentiment' set to 'positive', 'neutral', or 'negative'. " +
              "Negative = anyone asking to stop, opt out, expressing anger, hostility, or wanting to be left alone. " +
              "Positive = engaged, interested, or replying constructively (e.g. asking questions, agreeing). " +
              "Neutral = ambiguous, short replies (ok, sure, who is this) without negativity.",
          },
          { role: "user", content: `Reply text:\n\n${body}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_sentiment",
              description: "Record the sentiment classification.",
              parameters: {
                type: "object",
                properties: {
                  sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                },
                required: ["sentiment"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_sentiment" } },
      }),
    });
    if (!resp.ok) return "neutral";
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return "neutral";
    const parsed = JSON.parse(args);
    const s = String(parsed?.sentiment || "").toLowerCase();
    if (s === "positive" || s === "negative" || s === "neutral") return s;
    return "neutral";
  } catch (e) {
    console.error("[hook-reply-classifier] AI error", e);
    return "neutral";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let payload: any = {};
  try { payload = await req.json(); } catch { return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }); }

  const phone = String(payload?.phone || "").trim();
  const body = String(payload?.body || "").trim();
  const messageId = payload?.message_id ? String(payload.message_id) : null;
  const messageCreatedAt = payload?.message_created_at ? new Date(payload.message_created_at) : new Date();

  const phone10 = last10(phone);
  if (!phone10 || phone10.length !== 10) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_phone" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  if (!body) {
    return new Response(JSON.stringify({ ok: true, skipped: "empty_body" }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Find an open hook reply thread waiting for this phone
  const { data: openThreads } = await sb
    .from("hook_reply_threads")
    .select("*")
    .eq("phone_last10", phone10)
    .eq("status", "awaiting_reply")
    .order("created_at", { ascending: false })
    .limit(1);

  const thread = openThreads?.[0];
  if (!thread) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_open_hook_thread" }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Step 1 — keyword check
  const kw = isNegativeKeywordHit(body);
  let sentiment: "positive" | "neutral" | "negative";
  let reason: string | null = null;

  if (kw.hit) {
    sentiment = "negative";
    reason = `keyword:${kw.reason}`;
  } else {
    sentiment = await classifyWithAI(body);
  }

  if (sentiment === "negative") {
    // Move to DND
    await sb.from("sms_dnd_list").upsert(
      {
        phone: phone,
        phone_last10: phone10,
        reason: reason || "ai:negative",
        source: "hook_reply",
        original_message_body: body,
      },
      { onConflict: "phone_last10" },
    );

    await sb
      .from("hook_reply_threads")
      .update({
        sentiment: "negative",
        status: "dnd",
        dnd_reason: reason || "ai:negative",
        inbound_message_id: messageId,
        inbound_body: body,
        inbound_at: messageCreatedAt.toISOString(),
      })
      .eq("id", thread.id);

    return new Response(JSON.stringify({ ok: true, action: "dnd", reason: reason || "ai:negative" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Special branch: voidfix first-time auto-reply ("Busy in a meeting…can I send my IG reel?")
  // → on positive reply, send the IG link immediately and close the thread.
  const threadSource = (thread as any)?.meta?.source || "";
  if (threadSource === "voidfix-first-time-auto-reply" && sentiment === "positive") {
    const igMessage = "https://instagram.com/@W4RR3NGuru";
    try {
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({
          action: "send",
          to: phone,
          body: igMessage,
          source: "voidfix-first-reply-ig-followup",
        }),
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      await sb
        .from("hook_reply_threads")
        .update({
          sentiment: "positive",
          status: "completed",
          followup_send_at: null,
          inbound_message_id: messageId,
          inbound_body: body,
          inbound_at: messageCreatedAt.toISOString(),
          meta: { ...(thread as any).meta, ig_followup_sent_at: new Date().toISOString(), ig_send_ok: !!sendJson?.ok },
        })
        .eq("id", thread.id);
      return new Response(JSON.stringify({ ok: true, action: "ig_link_sent", send: sendJson }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[hook-reply-classifier] IG send error", e);
    }
  }

  // Positive or neutral → schedule 72h follow-up (default behavior)
  const followupAt = new Date(messageCreatedAt.getTime() + 72 * 60 * 60 * 1000);

  await sb
    .from("hook_reply_threads")
    .update({
      sentiment,
      status: "followup_scheduled",
      followup_send_at: followupAt.toISOString(),
      inbound_message_id: messageId,
      inbound_body: body,
      inbound_at: messageCreatedAt.toISOString(),
    })
    .eq("id", thread.id);

  return new Response(
    JSON.stringify({ ok: true, action: "scheduled", sentiment, followup_send_at: followupAt.toISOString() }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
