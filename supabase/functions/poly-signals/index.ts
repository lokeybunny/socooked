import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull top 5 hottest live markets
    const gamma = await fetch(
      "https://gamma-api.polymarket.com/markets?limit=5&active=true&closed=false&order=volume24hr&ascending=false"
    );
    const markets = await gamma.json();

    const compact = (markets ?? []).slice(0, 5).map((m: any) => ({
      slug: m.slug,
      question: m.question,
      volume24hr: m.volume24hr,
      liquidity: m.liquidity,
      outcomes: m.outcomes,
      outcomePrices: m.outcomePrices,
      endDate: m.endDate,
    }));

    const prompt = `You are PolyVibe's edge engine. Inner-circle, cocky, high-signal degen tone.
For each market below, output:
- title (short)
- market_slug
- edge_score (0-100, mismatch + conviction)
- probability_mismatch (string like "+18%" or "-12%")
- confidence (low/med/high)
- recommendation (BUY YES / BUY NO / FADE / SKIP)
- vibe (one cocky degen sentence)

Markets:
${JSON.stringify(compact, null, 2)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are PolyVibe's alpha edge engine. Output structured JSON only." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_signals",
            description: "Emit prediction-market edges",
            parameters: {
              type: "object",
              properties: {
                signals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      market_slug: { type: "string" },
                      edge_score: { type: "number" },
                      probability_mismatch: { type: "string" },
                      confidence: { type: "string", enum: ["low", "med", "high"] },
                      recommendation: { type: "string" },
                      vibe: { type: "string" },
                    },
                    required: ["title", "market_slug", "edge_score", "probability_mismatch", "confidence", "recommendation", "vibe"],
                  },
                },
              },
              required: ["signals"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_signals" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiRes.text();
      console.error("AI error:", aiRes.status, t);
      throw new Error("AI gateway error");
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : { signals: [] };
    const signals = args.signals ?? [];

    // Persist signals
    if (signals.length) {
      const rows = signals.map((s: any) => ({
        title: s.title,
        market_slug: s.market_slug,
        edge_score: s.edge_score,
        probability_mismatch: s.probability_mismatch,
        confidence: s.confidence,
        recommendation: s.recommendation,
        vibe: s.vibe,
        is_published: true,
      }));
      await supabase.from("poly_signals").insert(rows);
    }

    return new Response(JSON.stringify({ signals, count: signals.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("poly-signals error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
