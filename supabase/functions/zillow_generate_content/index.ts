// Generate a content storyline (scenes + AI prompts) from a property's tagged images.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { property_id, format = "reel" } = await req.json();
    if (!property_id) {
      return new Response(JSON.stringify({ error: "property_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prop } = await sb.from("properties").select("*").eq("id", property_id).single();
    const { data: imgs } = await sb.from("property_images").select("*").eq("property_id", property_id).order("position");
    if (!prop || !imgs?.length) throw new Error("Property or images missing");

    const grouped: Record<string, any[]> = {};
    for (const i of imgs) {
      const k = i.room_type || "other";
      (grouped[k] ||= []).push({ url: i.image_url, tag: i.ai_tag });
    }

    const summary = Object.entries(grouped).map(([k, v]) => `${k} (${v.length})`).join(", ");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a real-estate short-form content director. Output strict JSON: {\"hook\":\"...\",\"scenes\":[{\"order\":1,\"room\":\"\",\"caption\":\"\",\"image_prompt\":\"\",\"voiceover\":\"\"}],\"cta\":\"\"}. 6-9 scenes. Storyline arc: Couple buys home → kids grow up → lifestyle moments. Tie to actual rooms available.",
          },
          {
            role: "user",
            content: `Property: ${prop.address || prop.zillow_url}. Beds ${prop.beds ?? "?"}, baths ${prop.baths ?? "?"}, ${prop.sqft ?? "?"} sqft, $${prop.price ?? "?"}. Available rooms with image counts: ${summary}. Format: ${format}.`,
          },
        ],
      }),
    });

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    const storyline = match ? JSON.parse(match[0]) : { hook: "", scenes: [], cta: "" };

    return new Response(JSON.stringify({ success: true, storyline, grouped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
