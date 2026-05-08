// Analyze a batch of emails (text-only) and return the same shape Transcribe uses.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailIn {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body?: string;
  snippet?: string;
}

function stripHtml(s: string): string {
  return (s || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const { emails, keyword, customer } = (await req.json()) as {
      emails: EmailIn[];
      keyword?: string;
      customer?: string;
    };
    if (!emails?.length) {
      return new Response(JSON.stringify({ error: "No emails provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formatted = emails
      .map((e, i) => {
        const body = stripHtml(e.body || e.snippet || "").slice(0, 4000);
        return `── EMAIL ${i + 1} ──\nDate: ${e.date || ""}\nFrom: ${e.from || ""}\nTo: ${e.to || ""}\nSubject: ${e.subject || ""}\n\n${body}`;
      })
      .join("\n\n");

    const transcript = formatted;

    const sys = `You analyze a thread of EMAILS (not audio). Return ONLY valid JSON (no markdown) matching:
{
  "summary": string,
  "conversation_type": string,
  "voices": [{"voice_label": string, "identified_role": string, "tone": string, "key_points": string[]}],
  "sentiment": "positive"|"neutral"|"negative"|"mixed",
  "key_topics": string[],
  "action_items": string[],
  "questions_asked": string[],
  "objections_or_concerns": string[],
  "next_steps": string[],
  "highlights": string[],
  "client_wants": string[],
  "property_details": {"address": string, "asking_price": string, "condition": string, "timeline": string, "motivation": string, "notes": string},
  "chatgpt_prompt": string
}
Use "N/A" for unknown fields. Treat each unique email address as a separate "voice".`;

    const user = `Keyword/property focus: ${keyword || "(none)"}\nClient filter: ${customer || "(none)"}\n\n${formatted}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${txt.slice(0, 500)}`);
    }
    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || "{}";
    let analysis: any = {};
    try {
      analysis = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      analysis = m ? JSON.parse(m[0]) : {};
    }

    const result = {
      filename: `Email thread${keyword ? ` — ${keyword}` : ""}${customer ? ` (${customer})` : ""}`,
      duration_seconds: null,
      detected_language: "en",
      voice_count: Array.isArray(analysis.voices) ? analysis.voices.length : 0,
      transcript,
      raw_transcript: transcript,
      segments: [],
      analysis,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("email-analyze error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
