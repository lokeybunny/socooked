import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript } = await req.json();
    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Transcript must be at least 20 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const systemPrompt = `You are Script AI — a conversation intelligence analyst for a creative agency CRM. You receive raw transcripts of phone calls, meetings, or conversations.

Your job is to extract structured data from the transcript and return it as a JSON tool call. Be thorough but concise.

Rules:
- Extract ALL people mentioned with their names, emails, phone numbers if available
- Identify project ideas, services discussed, or scope of work
- Find any deadlines, dates, or timelines mentioned
- Detect budget/pricing discussions
- Summarize the conversation in 2-3 sentences
- List action items or next steps
- Suggest which business category fits: digital-services, brick-and-mortar, digital-ecommerce, food-and-beverage, mobile-services, or other
- If a potential new customer is detected, flag them with available contact info`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this transcript:\n\n${transcript}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "transcript_analysis",
            description: "Return structured analysis of a conversation transcript",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "2-3 sentence summary of the conversation" },
                people: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      email: { type: "string" },
                      phone: { type: "string" },
                      role: { type: "string", description: "Their role or relationship (e.g. potential client, business owner)" },
                      is_new_customer: { type: "boolean" },
                    },
                    required: ["name"],
                    additionalProperties: false,
                  },
                },
                project_ideas: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      estimated_value: { type: "string" },
                    },
                    required: ["title"],
                    additionalProperties: false,
                  },
                },
                deadlines: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string" },
                      date: { type: "string" },
                    },
                    required: ["description"],
                    additionalProperties: false,
                  },
                },
                action_items: {
                  type: "array",
                  items: { type: "string" },
                },
                suggested_category: {
                  type: "string",
                  enum: ["digital-services", "brick-and-mortar", "digital-ecommerce", "food-and-beverage", "mobile-services", "other"],
                },
                suggested_services: {
                  type: "array",
                  items: { type: "string" },
                  description: "Services discussed (e.g. website redesign, social media management)",
                },
                budget_mentioned: { type: "string", description: "Any budget or pricing discussed" },
              },
              required: ["summary", "people", "project_ideas", "action_items", "suggested_category"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "transcript_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No analysis returned");

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("script-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
