import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { audio_base64, file_name, customer_id, phone_number, drive_url } =
      await req.json();

    if (!audio_base64) throw new Error("audio_base64 is required");

    // Use AI to transcribe by sending audio as context
    const prompt = `You are a transcription assistant. Below is the base64-encoded audio file named "${file_name || "audio"}".

Please transcribe the audio content accurately. Then provide a brief 1-2 sentence summary.

Return ONLY valid JSON in this exact format, nothing else:
{"transcript": "full transcription text here", "summary": "brief summary here"}

Audio (base64): ${audio_base64.substring(0, 500000)}`;

    const aiRes = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI API error: ${errText}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let transcript = raw;
    let summary = "";
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      transcript = parsed.transcript || raw;
      summary = parsed.summary || "";
    } catch {
      // If parsing fails, use raw text as transcript
    }

    // Save to transcriptions table
    const { data: inserted, error: insertErr } = await supabase
      .from("transcriptions")
      .insert({
        source_id: drive_url || `upload_${Date.now()}`,
        source_type: "audio_upload",
        transcript,
        summary,
        customer_id: customer_id || null,
        phone_from: phone_number || null,
        direction: "inbound",
        occurred_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) throw new Error(`DB insert error: ${insertErr.message}`);

    return new Response(
      JSON.stringify({ success: true, transcription: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Transcribe audio error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
