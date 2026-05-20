// Lightweight prompt builder: takes one idea + movie config, returns N
// cinematic prompts (one per sub-scene per master) that the user can copy
// into ChatGPT / Seedance / any external storyboard generator.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  idea: string;
  masterCount?: number;     // how many master scenes (default 6)
  subsPerScene?: number;    // 2 | 3 | 4 (default 3)
  durationSec?: number;     // 5 | 10 | 15 (default 10)
  aspect?: string;          // '16:9' default
  style?: string;           // optional style note
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const idea = (body.idea || '').trim();
    if (!idea) {
      return new Response(JSON.stringify({ error: 'idea is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    const masterCount = Math.max(1, Math.min(12, body.masterCount ?? 6));
    const subsPerScene = Math.max(1, Math.min(4, body.subsPerScene ?? 3));
    const durationSec = body.durationSec ?? 10;
    const aspect = body.aspect ?? '16:9';
    const style = (body.style || '').trim();

    const system = `You are a cinematic prompt engineer. The user gives ONE idea.
You will break it into ${masterCount} master scenes, each with ${subsPerScene} sub-beats.
EACH sub-beat must be a complete, standalone ${durationSec}-second cinematic shot prompt that someone can paste into Seedance / Wan2.2 / ChatGPT to generate a storyboard panel or short clip.

Rules per prompt:
- One paragraph, ~80-140 words, no markdown, no lists, no quotes.
- Include camera POV, movement, lens feel, lighting, wardrobe, mood, environment.
- Maintain continuity (wardrobe, characters, location) across all sub-beats of the same master scene AND across master scenes — same characters, same world.
- Aspect ratio: ${aspect}.
${style ? `- Stylistic direction: ${style}` : ''}
- Each master scene tells one story beat; sub-beats A→${String.fromCharCode(64 + subsPerScene)} form a mini A-to-Z arc within that scene.`;

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `IDEA:\n${idea}\n\nGenerate the full storyboard prompt set now.` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'storyboard_prompts',
            description: 'Return the structured storyboard prompt set',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Overall film title' },
                logline: { type: 'string', description: '1-sentence logline' },
                scenes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      number: { type: 'number' },
                      title: { type: 'string' },
                      summary: { type: 'string' },
                      subs: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            beat: { type: 'string', description: 'A, B, C or D label' },
                            prompt: { type: 'string', description: 'Full cinematic shot prompt' },
                          },
                          required: ['beat', 'prompt'],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ['number', 'title', 'summary', 'subs'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['title', 'logline', 'scenes'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'storyboard_prompts' } },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('[prompt-builder] AI error', r.status, t);
      if (r.status === 429) return new Response(JSON.stringify({ error: 'Rate limit, try again shortly' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (r.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI ${r.status}`);
    }

    const j = await r.json();
    const call = j?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error('No structured output');
    const parsed = JSON.parse(call.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[studio-prompt-builder] fatal', e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
