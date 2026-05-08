import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!DEEPGRAM_API_KEY) throw new Error("DEEPGRAM_API_KEY not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    if (!audioFile) throw new Error("audio file is required");

    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || "audio/mpeg";

    // 1) Deepgram with diarization
    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&diarize=true&utterances=true&punctuate=true&detect_language=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": mimeType,
        },
        body: audioBytes,
      },
    );

    if (!dgRes.ok) {
      const t = await dgRes.text();
      console.error("Deepgram error:", t);
      throw new Error(`Deepgram failed: ${dgRes.status}`);
    }

    const dgData = await dgRes.json();
    const rawTranscript: string =
      dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    if (!rawTranscript.trim()) throw new Error("No speech detected in audio");

    const utterances: any[] = dgData.results?.utterances || [];
    const speakerSet = new Set<number>();
    const segments = utterances.map((u) => {
      speakerSet.add(u.speaker);
      return {
        speaker: u.speaker,
        speaker_label: `Voice ${u.speaker + 1}`,
        start: u.start,
        end: u.end,
        text: u.transcript,
        confidence: u.confidence,
      };
    });

    const formattedTranscript = segments.length
      ? segments.map((s) => `[Voice ${s.speaker + 1}] ${s.text}`).join("\n")
      : rawTranscript;

    const duration = dgData.metadata?.duration
      ? Math.round(dgData.metadata.duration)
      : null;
    const detectedLanguage =
      dgData.results?.channels?.[0]?.detected_language || "en";

    // 2) Gemini analysis via Lovable AI Gateway
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an expert conversation analyst for a video production agency. Analyze the diarized transcript and return structured insights. Identify the most likely role of each voice. Pay special attention to extracting EVERYTHING the client wants for their video — vision, style, references, mood, edits, colors, music, pacing, must-haves, must-avoids, deliverables, deadlines. Be exhaustive and specific. Then craft a ready-to-paste ChatGPT prompt that another AI can use to generate concrete video edit prompts in real time.",
          },
          {
            role: "user",
            content: `Diarized transcript (${segments.length} segments, ${speakerSet.size} voices detected):\n\n${formattedTranscript}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "conversation_analysis",
              description: "Return structured analysis of the conversation",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "2-4 sentence summary" },
                  conversation_type: {
                    type: "string",
                    description:
                      "e.g., sales call, support call, interview, meeting, casual chat",
                  },
                  voices: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        voice_label: {
                          type: "string",
                          description: "e.g., Voice 1, Voice 2",
                        },
                        identified_role: {
                          type: "string",
                          description:
                            "Most likely role (e.g., Sales Agent, Prospect)",
                        },
                        tone: { type: "string" },
                        talk_share_estimate_pct: { type: "number" },
                        key_points: { type: "array", items: { type: "string" } },
                      },
                      required: ["voice_label", "identified_role"],
                      additionalProperties: false,
                    },
                  },
                  sentiment: {
                    type: "string",
                    enum: ["positive", "neutral", "negative", "mixed"],
                  },
                  key_topics: { type: "array", items: { type: "string" } },
                  action_items: { type: "array", items: { type: "string" } },
                  questions_asked: { type: "array", items: { type: "string" } },
                  objections_or_concerns: {
                    type: "array",
                    items: { type: "string" },
                  },
                  next_steps: { type: "array", items: { type: "string" } },
                  highlights: {
                    type: "array",
                    items: { type: "string" },
                    description: "Notable quotes or moments",
                  },
                },
                required: [
                  "summary",
                  "conversation_type",
                  "voices",
                  "sentiment",
                  "key_topics",
                  "action_items",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "conversation_analysis" },
        },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit reached. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Add funds in Settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      throw new Error("AI analysis failed");
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const analysis = toolCall ? JSON.parse(toolCall.function.arguments) : null;

    return new Response(
      JSON.stringify({
        filename: audioFile.name,
        duration_seconds: duration,
        detected_language: detectedLanguage,
        voice_count: speakerSet.size,
        transcript: formattedTranscript,
        raw_transcript: rawTranscript,
        segments,
        analysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("transcribe-analyze error:", e);
    return new Response(
      JSON.stringify({ error: e?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
