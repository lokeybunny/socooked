import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const customerName = formData.get("customer_name") as string || "Unknown";
    const customerId = formData.get("customer_id") as string || null;

    if (!audioFile) throw new Error("audio file is required");

    // Convert audio to base64 for the AI model
    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    let base64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < audioBytes.length; i += chunkSize) {
      const chunk = audioBytes.subarray(i, Math.min(i + chunkSize, audioBytes.length));
      base64 += String.fromCharCode(...chunk);
    }
    base64 = btoa(base64);

    // Determine MIME type
    const mimeType = audioFile.type || "audio/mpeg";

    // Use Gemini Flash for audio transcription (it supports audio natively)
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcribe the following audio file completely and accurately. Output ONLY the transcript text, nothing else. No headers, no labels, no explanations. Just the spoken words exactly as they are.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 16000,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI transcription error:", errText);
      throw new Error(`AI transcription failed: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const transcript = aiData.choices?.[0]?.message?.content || "";

    if (!transcript.trim()) {
      throw new Error("No transcript generated. The audio may be too short or unclear.");
    }

    // Generate a summary
    const summaryRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "user",
            content: `Summarize this call/voicemail transcript in 2-3 sentences. Focus on the key points, action items, and who was involved:\n\n${transcript}`,
          },
        ],
        max_tokens: 500,
      }),
    });

    let summary = "";
    if (summaryRes.ok) {
      const summaryData = await summaryRes.json();
      summary = summaryData.choices?.[0]?.message?.content || "";
    }

    // Store in transcriptions table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const now = new Date().toISOString();

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/transcriptions`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        source_id: `upload_${Date.now()}`,
        source_type: "manual_upload",
        transcript,
        summary,
        customer_id: customerId || null,
        occurred_at: now,
      }),
    });

    let transcriptionRecord = null;
    if (insertRes.ok) {
      const records = await insertRes.json();
      transcriptionRecord = records?.[0] || null;
    } else {
      console.error("Failed to save transcription:", await insertRes.text());
    }

    return new Response(
      JSON.stringify({
        transcript,
        summary,
        transcription_id: transcriptionRecord?.id || null,
        filename: audioFile.name,
        customer_name: customerName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Transcribe error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
