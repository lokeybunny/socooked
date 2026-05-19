const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RefImage { url: string; label?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json() as {
      intent?: string;
      images?: RefImage[];
      audio_base64?: string;
      audio_mime?: string;
      mode?: 'transcribe' | 'prompt';
    };

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    // -------- TRANSCRIBE MODE --------
    if (body.mode === 'transcribe') {
      if (!body.audio_base64 || !body.audio_mime) {
        return new Response(JSON.stringify({ error: 'audio_base64 + audio_mime required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Transcribe this audio verbatim. Return only the spoken text, no commentary, no punctuation cleanup beyond natural sentences.' },
              { type: 'input_audio', input_audio: { data: body.audio_base64, format: body.audio_mime.includes('webm') ? 'webm' : body.audio_mime.includes('mp4') ? 'mp4' : 'wav' } },
            ],
          }],
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        console.error('[transcribe] AI error', r.status, t);
        if (r.status === 429) return new Response(JSON.stringify({ error: 'Rate limit, try again shortly' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (r.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        throw new Error(`AI ${r.status}`);
      }
      const j = await r.json();
      const transcript = String(j?.choices?.[0]?.message?.content || '').trim();
      return new Response(JSON.stringify({ transcript }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // -------- PROMPT BUILD MODE --------
    const intent = (body.intent || '').trim();
    const images = Array.isArray(body.images) ? body.images : [];
    if (!intent && images.length === 0) {
      return new Response(JSON.stringify({ error: 'intent or images required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const system = `You are a cinematic prompt engineer for Seedance / Wan2.2 AI video generation. Craft ONE detailed, single-paragraph cinematic shot prompt (no markdown, no lists, no headings, no quotation marks, max ~180 words).

RULES:
- Reference uploaded images by their EXACT label, e.g. "image 1", "image 2", etc. Use these labels in-line within the action description.
- Describe the action chronologically (opening frame → mid → end).
- Include camera POV, camera movement, lens feel, lighting, mood, and ambient details inferred from the reference images.
- Preserve real architecture / faces / wardrobe from references — do NOT reinvent locations or people.
- If the user mentions dialogue, embed it in quotes inside the paragraph.
- End with a brief closing-frame note.
- Output ONLY the final prompt paragraph. No preamble, no explanation.`;

    const userContent: any[] = [
      { type: 'text', text: `USER INTENT (their description of the shot they want):\n${intent || '(none — infer from images)'}\n\nReference images follow. Their labels are image 1, image 2, ... in the order provided.` },
    ];
    for (let i = 0; i < images.length; i++) {
      userContent.push({ type: 'text', text: `--- image ${i + 1} ---` });
      userContent.push({ type: 'image_url', image_url: { url: images[i].url } });
    }

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('[prompt-guide] AI error', r.status, t);
      if (r.status === 429) return new Response(JSON.stringify({ error: 'Rate limit, try again shortly' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (r.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI ${r.status}`);
    }

    const j = await r.json();
    let prompt = String(j?.choices?.[0]?.message?.content || '').trim();
    // strip wrapping quotes / markdown fences
    prompt = prompt.replace(/^```[a-z]*\s*|\s*```$/gi, '').replace(/^["']|["']$/g, '').trim();

    return new Response(JSON.stringify({ prompt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[studio-prompt-guide] fatal', e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
