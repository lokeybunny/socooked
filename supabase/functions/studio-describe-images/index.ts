const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { images } = await req.json() as { images: { url: string; label?: string }[] };
    if (!Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: 'images[] required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    const prompt = `Describe this reference image for a cinematic AI video prompt in 4-10 words. Be concrete and visual (e.g. "woman in driveway", "front patio of home", "character reference - bald man portrait"). Respond with only the short description, no prefix, no punctuation at the end.`;

    const out: { index: number; description: string }[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: img.url } },
              ],
            }],
          }),
        });
        if (!r.ok) {
          const t = await r.text();
          console.error('[describe] AI error', r.status, t);
          out.push({ index: i, description: img.label || 'reference image' });
          continue;
        }
        const j = await r.json();
        let content = j?.choices?.[0]?.message?.content ?? '';
        if (typeof content !== 'string') content = String(content);
        out.push({ index: i, description: content.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '') || 'reference image' });
      } catch (e) {
        console.error('[describe] item error', i, e);
        out.push({ index: i, description: img.label || 'reference image' });
      }
    }

    return new Response(JSON.stringify({ descriptions: out }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[describe] fatal', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
