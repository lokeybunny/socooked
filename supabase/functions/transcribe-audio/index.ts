import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CATEGORIES = [
  "digital-services", "brick-and-mortar", "digital-ecommerce",
  "food-and-beverage", "mobile-services", "other",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
    if (!DEEPGRAM_API_KEY) throw new Error("DEEPGRAM_API_KEY not configured");

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const customerName = formData.get("customer_name") as string || "Unknown";
    const customerId = formData.get("customer_id") as string || null;
    const sourceType = formData.get("source_type") as string || "manual_upload";
    const rawCategory = formData.get("category") as string || null;

    // Normalize category
    const category = rawCategory && VALID_CATEGORIES.includes(rawCategory) ? rawCategory : "other";

    if (!audioFile) throw new Error("audio file is required");

    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || "audio/mpeg";

    // Transcribe via Deepgram (nova-3 model, with diarization + punctuation + utterances)
    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&diarize=true&utterances=true&punctuate=true",
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": mimeType,
        },
        body: audioBytes,
      }
    );

    if (!dgRes.ok) {
      const errText = await dgRes.text();
      console.error("Deepgram error:", errText);
      throw new Error(`Deepgram transcription failed: ${dgRes.status}`);
    }

    const dgData = await dgRes.json();
    const transcript = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    if (!transcript.trim()) {
      throw new Error("No transcript generated. The audio may be too short or unclear.");
    }

    // Build a diarized transcript if utterances are available
    let formattedTranscript = transcript;
    const utterances = dgData.results?.utterances;
    if (utterances && utterances.length > 0) {
      formattedTranscript = utterances
        .map((u: any) => `[Speaker ${u.speaker}] ${u.transcript}`)
        .join("\n");
    }

    // Generate a simple summary from the first few sentences
    const sentences = transcript.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
    const summary = sentences.slice(0, 3).join(". ").trim() + (sentences.length > 3 ? "..." : "");

    // Store in transcriptions table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const now = new Date().toISOString();

    const duration = dgData.metadata?.duration ? Math.round(dgData.metadata.duration) : null;

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
        source_type: sourceType,
        transcript: formattedTranscript,
        summary,
        customer_id: customerId || null,
        occurred_at: now,
        duration_seconds: duration,
        category,
      }),
    });

    let transcriptionRecord = null;
    if (insertRes.ok) {
      const records = await insertRes.json();
      transcriptionRecord = records?.[0] || null;
    } else {
      console.error("Failed to save transcription:", await insertRes.text());
    }

    // Create a conversation_thread for the customer so data lives on their profile
    let threadRecord = null;
    if (customerId) {
      const threadChannel = "call";
      const threadSummary = `[${sourceType === "voicemail" ? "Voicemail" : "Call"}] ${summary || "Audio transcription"}`;

      const threadRes = await fetch(`${supabaseUrl}/rest/v1/conversation_threads`, {
        method: "POST",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify({
          customer_id: customerId,
          channel: threadChannel,
          category,
          status: "open",
          summary: threadSummary,
          raw_transcript: formattedTranscript,
        }),
      });

      if (threadRes.ok) {
        const threadRecords = await threadRes.json();
        threadRecord = threadRecords?.[0] || null;
      } else {
        console.error("Failed to create thread:", await threadRes.text());
      }

      // Also update the customer's category if not already set
      const custCheckRes = await fetch(
        `${supabaseUrl}/rest/v1/customers?id=eq.${customerId}&select=category`,
        {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
          },
        }
      );
      if (custCheckRes.ok) {
        const custData = await custCheckRes.json();
        if (custData?.[0] && !custData[0].category) {
          await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${customerId}`, {
            method: "PATCH",
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ category }),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        transcript: formattedTranscript,
        summary,
        transcription_id: transcriptionRecord?.id || null,
        thread_id: threadRecord?.id || null,
        filename: audioFile.name,
        customer_name: customerName,
        duration_seconds: duration,
        category,
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
