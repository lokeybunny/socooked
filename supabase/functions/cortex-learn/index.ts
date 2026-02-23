import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: bot secret only
  const botSecret = req.headers.get("x-bot-secret");
  const expectedSecret = Deno.env.get("BOT_SECRET");
  if (!botSecret || botSecret !== expectedSecret) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Fetch recent webhook_events (last 7 days, bot actions)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error: eventsErr } = await supabase
      .from("webhook_events")
      .select("event_type, payload, created_at")
      .eq("source", "spacebot")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500);

    if (eventsErr) throw eventsErr;

    // 2. Build usage analytics
    const endpointCounts: Record<string, number> = {};
    const endpointSequences: string[] = [];
    const errorPatterns: string[] = [];

    for (const event of events || []) {
      const ep = event.event_type;
      endpointCounts[ep] = (endpointCounts[ep] || 0) + 1;
      endpointSequences.push(ep);

      // Detect potential mistakes: delete right after create on same entity
      const payload = event.payload as Record<string, unknown>;
      if (ep.includes("delete") && payload?.id) {
        errorPatterns.push(`Quick delete after action on ${ep}`);
      }
    }

    // Sort by frequency
    const topEndpoints = Object.entries(endpointCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // 3. Fetch current soul
    const { data: currentSoul } = await supabase
      .from("site_configs")
      .select("content, version")
      .eq("site_id", "cortex")
      .eq("section", "soul")
      .single();

    const currentVersion = currentSoul?.version || 1;
    const currentContent = currentSoul?.content as Record<string, unknown> | null;
    const currentPrompt = (currentContent?.prompt as string) || "";

    // 4. Send to AI for analysis
    const analysisPrompt = `You are analyzing CRM API usage patterns for CORTEX (an AI bot agent that manages a creative agency CRM).

## Current Soul Prompt (v${currentVersion})
${currentPrompt.slice(0, 2000)}...

## Last 7 Days API Usage (${events?.length || 0} total calls)

### Top Endpoints by Frequency
${topEndpoints.map(([ep, count]) => `- ${ep}: ${count} calls`).join("\n")}

### Recent Action Sequence (last 50)
${endpointSequences.slice(0, 50).join(" → ")}

### Potential Error Patterns
${errorPatterns.length > 0 ? errorPatterns.slice(0, 10).join("\n") : "None detected"}

## Your Task
Based on these usage patterns, generate a concise "LEARNED OPTIMIZATIONS" section (max 500 words) that should be APPENDED to the existing soul prompt. Include:

1. **Frequently Used Workflows** — common sequences the bot should optimize for (e.g. "lead → deal → project is a common flow, batch these")
2. **Underused Endpoints** — suggest the bot leverage these more
3. **Efficiency Tips** — based on patterns (e.g. "always check search before creating duplicates")
4. **Error Prevention** — any anti-patterns detected

Output ONLY the "LEARNED OPTIMIZATIONS" section text, no preamble.`;

    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterKey) throw new Error("OPENROUTER_API_KEY not configured");

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: analysisPrompt }],
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI API error: ${aiResponse.status} — ${errText}`);
    }

    const aiData = await aiResponse.json();
    const learnedSection = aiData.choices?.[0]?.message?.content || "";

    if (!learnedSection.trim()) {
      return new Response(JSON.stringify({
        success: true,
        data: { message: "No actionable insights generated", events_analyzed: events?.length || 0 },
        api_version: "v1",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5. Update the soul with learned optimizations appended
    const newVersion = currentVersion + 1;
    const learnedTimestamp = new Date().toISOString();
    const updatedPrompt = currentPrompt.replace(
      /\n## LEARNED OPTIMIZATIONS[\s\S]*$/,
      ""
    ) + `\n\n## LEARNED OPTIMIZATIONS (auto-generated ${learnedTimestamp}, v${newVersion})\n\n${learnedSection}`;

    const { error: updateErr } = await supabase
      .from("site_configs")
      .update({
        content: { ...(currentContent || {}), prompt: updatedPrompt },
        version: newVersion,
        updated_at: learnedTimestamp,
      })
      .eq("site_id", "cortex")
      .eq("section", "soul");

    if (updateErr) throw updateErr;

    // 6. Log the learning event
    await supabase.from("activity_log").insert({
      entity_type: "site_config",
      entity_id: null,
      action: "cortex_learned",
      meta: {
        name: `Soul v${newVersion}`,
        events_analyzed: events?.length || 0,
        top_endpoints: topEndpoints.slice(0, 5),
      },
    });

    return new Response(JSON.stringify({
      success: true,
      data: {
        message: `Soul updated to v${newVersion}`,
        events_analyzed: events?.length || 0,
        top_endpoints: topEndpoints.slice(0, 10),
        learned_section_preview: learnedSection.slice(0, 300) + "...",
      },
      api_version: "v1",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || "Internal error",
      api_version: "v1",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
