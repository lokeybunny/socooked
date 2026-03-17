import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "No API key" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch all SMM calendar events ordered by date
  const { data: events, error } = await supabase
    .from("calendar_events")
    .select("id, title, description, start_time")
    .eq("source", "smm")
    .order("start_time", { ascending: true });

  if (error || !events) {
    return new Response(JSON.stringify({ error: error?.message || "No events" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`Total SMM events: ${events.length}`);

  // Find duplicates: keep first occurrence, mark rest as needing new captions
  const seenTitles = new Set<string>();
  const duplicates: typeof events = [];

  for (const ev of events) {
    const key = ev.title?.trim().toLowerCase() || "";
    if (seenTitles.has(key)) {
      duplicates.push(ev);
    } else {
      seenTitles.add(key);
    }
  }

  console.log(`Duplicates to fix: ${duplicates.length}`);

  if (duplicates.length === 0) {
    return new Response(JSON.stringify({ message: "No duplicates found", fixed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Collect ALL existing captions (including ones we'll generate) to avoid collisions
  const allCaptions = new Set<string>();
  for (const ev of events) {
    allCaptions.add(ev.title?.trim().toLowerCase() || "");
  }

  // Process in batches of 10
  const BATCH_SIZE = 10;
  let fixed = 0;
  const errors: string[] = [];

  for (let i = 0; i < duplicates.length; i += BATCH_SIZE) {
    const batch = duplicates.slice(i, i + BATCH_SIZE);

    // Generate unique captions for this batch
    const prompt = `You are a social media caption writer for a Drake music fan page on Instagram.

Generate ${batch.length} COMPLETELY UNIQUE Instagram captions about Drake music. Each must be different from ALL others.

Rules:
- Each caption should be 1-2 sentences about sharing/vibing to Drake music
- Include 1-2 relevant emojis
- Vary the tone: some hype, some chill, some nostalgic, some party vibes
- Include a call-to-action (tag, share, comment, save, etc.)
- Do NOT repeat any phrases across captions
- Keep the ♻️ [INSTAGRAM] prefix on each
- Each caption must be COMPLETELY different in wording - no two should share the same structure

IMPORTANT: Do NOT use any of these existing captions (they already exist):
${[...allCaptions].slice(0, 50).join("\n")}

Return ONLY a JSON array of strings, each being one caption. Example:
["♻️ [INSTAGRAM] caption one here", "♻️ [INSTAGRAM] caption two here"]`;

    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 1.2,
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error(`AI error batch ${i}: ${aiResp.status} ${errText}`);
        errors.push(`Batch ${i}: AI ${aiResp.status}`);
        // Wait before retrying
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      const aiData = await aiResp.json();
      let content = aiData.choices?.[0]?.message?.content || "";

      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error(`No JSON found in AI response for batch ${i}`);
        errors.push(`Batch ${i}: No JSON in response`);
        continue;
      }

      const captions: string[] = JSON.parse(jsonMatch[0]);

      // Update each duplicate with its new unique caption
      for (let j = 0; j < batch.length && j < captions.length; j++) {
        let newCaption = captions[j];

        // Ensure uniqueness
        let attempt = 0;
        while (allCaptions.has(newCaption.trim().toLowerCase()) && attempt < 3) {
          newCaption = newCaption.replace(/[🎵🎶🎧🔊💯🙌👀💎✨🎤]/, ["🌊", "⚡", "🫡", "🏆", "💿", "🎙️"][attempt] || "🔥");
          attempt++;
        }

        allCaptions.add(newCaption.trim().toLowerCase());

        // Build new description from old description but swap the caption line
        const oldDesc = batch[j].description || "";
        const newDesc = oldDesc.replace(
          /(?:♻️ \[INSTAGRAM\]|💯|🎶|🎵|🎧|🔊|🙌|👀|💎|✨|🎤).+/,
          newCaption
        ) || newCaption;

        const { error: updateErr } = await supabase
          .from("calendar_events")
          .update({ title: newCaption, description: newDesc, updated_at: new Date().toISOString() })
          .eq("id", batch[j].id);

        if (updateErr) {
          console.error(`Update error ${batch[j].id}: ${updateErr.message}`);
          errors.push(`Update ${batch[j].id}: ${updateErr.message}`);
        } else {
          fixed++;
        }
      }
    } catch (e) {
      console.error(`Batch ${i} exception: ${e}`);
      errors.push(`Batch ${i}: ${e}`);
    }

    // Rate limit pause between batches
    if (i + BATCH_SIZE < duplicates.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return new Response(
    JSON.stringify({ message: `Fixed ${fixed}/${duplicates.length} duplicates`, fixed, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
