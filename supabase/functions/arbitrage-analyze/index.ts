import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { item_id } = await req.json();
    if (!item_id) {
      return new Response(JSON.stringify({ error: "item_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: item, error: fetchErr } = await supabase
      .from("arbitrage_items")
      .select("*")
      .eq("id", item_id)
      .single();

    if (fetchErr || !item) {
      return new Response(JSON.stringify({ error: "Item not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = item.nobg_image_url || item.original_image_url;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "No image available to analyze" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert product identifier for a pawn shop arbitrage business. You analyze images of items to determine:
1. The exact product name (brand, model, specific name)
2. A concise marketplace description suitable for OfferUp/Facebook Marketplace (2-3 sentences, highlight key features, condition-friendly language)
3. Estimated retail/resale value range

Return your analysis as a JSON tool call.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this item and write a marketplace listing description for it." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "item_analysis",
            description: "Return structured analysis of a pawn shop item",
            parameters: {
              type: "object",
              properties: {
                item_name: { type: "string", description: "Product name with brand/model (e.g. 'Sony WH-1000XM5 Wireless Headphones')" },
                description: { type: "string", description: "2-3 sentence marketplace listing description, friendly and professional" },
                estimated_value_low: { type: "number", description: "Low end of estimated resale value in USD" },
                estimated_value_high: { type: "number", description: "High end of estimated resale value in USD" },
                category: { type: "string", description: "Product category (e.g. Electronics, Jewelry, Tools, Sporting Goods)" },
              },
              required: ["item_name", "description"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "item_analysis" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No analysis returned");

    const analysis = JSON.parse(toolCall.function.arguments);

    // Update item with AI results and move to researching
    const updates: Record<string, unknown> = {
      item_name: analysis.item_name,
      condition_notes: analysis.description,
      status: "researching",
      meta: {
        ...(item.meta || {}),
        ai_analysis: analysis,
        analyzed_at: new Date().toISOString(),
      },
    };

    const { error: updateErr } = await supabase
      .from("arbitrage_items")
      .update(updates)
      .eq("id", item_id);

    if (updateErr) throw new Error(updateErr.message);

    return new Response(JSON.stringify({ success: true, analysis, item_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("arbitrage-analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
