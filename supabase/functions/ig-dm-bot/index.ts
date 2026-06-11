// Autonomous IG DM qualification bot.
// Uses Lovable AI (Gemini) to generate replies that qualify music-artist leads
// and drive them to a phone call.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are an Instagram DM concierge for a content/music marketing team that helps independent artists go viral.

Your sole objective: get the artist on a phone call with our team. We start every real conversation on the phone before web meetings or a shoot day.

Our offer (only mention pieces that are relevant, never dump it all at once):
- We help artists make 1–2 songs go viral.
- We shoot a month's worth of short-form content in a SINGLE day.
- We edit it and auto-post it on their behalf across platforms.
- We build a custom package + presentation, usually delivered on the phone or in person.

Qualification criteria (you must read between the lines):
1. Are they serious about music as a real career (not a hobby)?
2. Do they have a real budget? (We do NOT work for free. Don't quote prices — surface budget reality.)
3. Are they passionate and ready to actually shoot / show up?
4. Do they want growth / virality vs. just compliments?

Conversation style:
- Sound like a real person texting on IG. Lowercase ok. Short. 1–3 sentences max.
- One question at a time. Be curious, not salesy.
- Mirror their energy. No emojis unless they use them.
- Never send links unless they explicitly ask.
- Never reveal you are an AI. If asked, say you're on the team.
- If they ghost-ask "who is this" — say you're with the team that helps artists shoot a month of content in a day.

Phone numbers (only share when they agree to a call or ask how to reach us):
- Cell: (480) 220-0405
- Office: (702) 701-6192

Disqualify (politely wind down, don't push):
- Asking for free work, collabs only, bots/spam, clearly under-budget, not actually an artist, rude.

Decision flow each turn:
- If unqualified or unclear → ask ONE qualifying question (their music goals, what they've tried, are they ready to invest in a real push, etc.).
- If qualified and warm → invite the call. Examples: "what's the best number to reach you at?" or "got 10 min today for a quick call? i can text you from our line."
- If they share a number or say yes to a call → confirm and drop both numbers so they can call us too.
- If they want details first → give ONE concrete teaser (e.g., "we shoot a full month of content in a day and post it for you") then pivot back to the call.

You MUST respond with STRICT JSON only — no prose, no markdown fences:
{
  "reply": "the message to send, 1–3 short sentences",
  "stage": "qualifying" | "warming" | "ready_for_call" | "call_booked" | "disqualified",
  "qualified": true | false,
  "should_send": true | false,
  "score": 0-100,
  "checklist": {
    "serious_artist": true | false,
    "has_budget": true | false,
    "wants_virality": true | false,
    "ready_to_invest": true | false,
    "agreed_to_call": true | false
  },
  "evidence": {
    "serious_artist": [{ "message_id": "<id from transcript>", "quote": "short verbatim snippet from that LEAD message" }],
    "has_budget": [ ... ],
    "wants_virality": [ ... ],
    "ready_to_invest": [ ... ],
    "agreed_to_call": [ ... ]
  },
  "next_action": "ask_qualifier" | "tease_offer" | "ask_for_call" | "share_numbers" | "wind_down",
  "reason": "1 short sentence on why this reply"
}
Evidence rules:
- For every checklist item set to TRUE, include 1–3 evidence entries pointing to the specific LEAD message that proved it.
- Use the exact message_id shown in the transcript (format: id=<id>). Quote ≤120 chars verbatim.
- For checklist items set to FALSE, return an empty array for that key.
- Only cite LEAD messages, never ME messages.

Scoring guide:
- 0-20: cold / off-topic / probably spam → next_action = "wind_down" or "ask_qualifier"
- 21-50: curious but unqualified → "ask_qualifier"
- 51-75: showing real interest or budget signal → "tease_offer" or "ask_for_call"
- 76-100: warm, ready for a call, or already agreed → "ask_for_call" or "share_numbers"
A checklist item is true only when the lead has CLEARLY signaled it in the thread — never assume.
Set should_send = false only if the inbound is unsafe, abusive, spam, or you genuinely have nothing useful to say.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const { messages, other_username, mode } = body as {
      messages: Array<{ id?: string; direction: "inbound" | "outbound"; text: string; created_time?: string | null }>;
      other_username?: string;
      mode?: "reply" | "opener";
    };

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOpener = mode === "opener";

    // Build transcript for the model
    const recent = messages.slice(-30);
    const lastInbound = [...recent].reverse().find((m) => m.direction === "inbound");
    if (!isOpener && !lastInbound) {
      return new Response(
        JSON.stringify({ reply: "", stage: "qualifying", qualified: false, should_send: false, reason: "no inbound message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transcriptText = recent.length
      ? recent
          .map((m: any) => `${m.direction === "inbound" ? "LEAD" : "ME"} [id=${m.id || "n/a"}]: ${m.text || "(no text)"}`)
          .join("\n")
      : "(no prior messages)";

    const userContent = isOpener
      ? `Instagram DM thread with @${other_username || "lead"}.\n` +
        `Transcript (oldest → newest). Each line is "ROLE [id=<id>]: text":\n` +
        transcriptText +
        `\n\nThis is a COLD OPENER. The lead has not replied yet (or we're re-engaging after silence). ` +
        `Write a casual, low-pressure first message (1–2 short sentences, lowercase ok, no emojis, no links, no pitch) ` +
        `that sounds like a real person checking in — e.g. "hey, just wanted to check in with you" style. ` +
        `Do NOT mention services, prices, or the offer yet — just open the conversation. ` +
        `Return the strict JSON described in the system prompt. Set should_send = true, stage = "qualifying", ` +
        `next_action = "ask_qualifier", and leave checklist items false with empty evidence arrays.`
      : `Instagram DM thread with @${other_username || "lead"}.\n` +
        `Transcript (oldest → newest). Each line is "ROLE [id=<id>]: text":\n` +
        transcriptText +
        `\n\nGenerate the next reply as the strict JSON described in the system prompt. ` +
        `For every TRUE checklist item include evidence entries citing the exact id from the transcript.`;

    const chatMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: chatMessages,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace billing." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error ${aiRes.status}: ${errText}`);
    }

    const aiJson = await aiRes.json();
    const content: string = aiJson?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {
      // Try to salvage JSON from a fenced or noisy response
      const match = content.match(/\{[\s\S]*\}/);
      if (match) { try { parsed = JSON.parse(match[0]); } catch { /* ignore */ } }
    }

    const cl = parsed.checklist || {};
    const ev = parsed.evidence || {};
    const cleanEvidence = (k: string) => {
      const list = Array.isArray(ev[k]) ? ev[k] : [];
      return list
        .filter((e: any) => e && (e.message_id || e.quote))
        .slice(0, 3)
        .map((e: any) => ({
          message_id: String(e.message_id || "").trim() || null,
          quote: String(e.quote || "").trim().slice(0, 160),
        }));
    };
    const scoreNum = Number(parsed.score);
    const out = {
      reply: String(parsed.reply || "").trim(),
      stage: parsed.stage || "qualifying",
      qualified: !!parsed.qualified,
      should_send: parsed.should_send !== false && !!String(parsed.reply || "").trim(),
      score: Number.isFinite(scoreNum) ? Math.max(0, Math.min(100, Math.round(scoreNum))) : 0,
      checklist: {
        serious_artist: !!cl.serious_artist,
        has_budget: !!cl.has_budget,
        wants_virality: !!cl.wants_virality,
        ready_to_invest: !!cl.ready_to_invest,
        agreed_to_call: !!cl.agreed_to_call,
      },
      evidence: {
        serious_artist: cleanEvidence("serious_artist"),
        has_budget: cleanEvidence("has_budget"),
        wants_virality: cleanEvidence("wants_virality"),
        ready_to_invest: cleanEvidence("ready_to_invest"),
        agreed_to_call: cleanEvidence("agreed_to_call"),
      },
      next_action: parsed.next_action || "ask_qualifier",
      reason: parsed.reason || "",
    };

    return new Response(JSON.stringify({ success: true, ...out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ig-dm-bot error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
