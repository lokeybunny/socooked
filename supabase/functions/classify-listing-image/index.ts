const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORIES = [
  'Kitchen','Living Room','Bedroom','Bathroom','Garage','Backyard','Front Exterior',
  'Aerial Drone','Dining Room','Laundry Room','Hallway','Office','Pool','Patio',
  'ADU / Casita','Closet','Stairs','Entryway','Other'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { image_url, custom_categories } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const allCats = Array.from(new Set([...CATEGORIES, ...((custom_categories as string[]) || [])]));
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    console.log('[classify] image_url:', image_url);

    const prompt = `You are classifying a real estate listing photo. Pick EXACTLY ONE category from this list: ${allCats.join(', ')}.

Rules:
- Look carefully at the image and identify the room or area shown.
- Use "Aerial Drone" only for overhead/sky shots.
- Use "Front Exterior" for street-facing house views; "Backyard" for rear yards.
- Only use "Other" if the image truly does not match any category.

Respond with ONLY strict JSON, no markdown:
{"category":"<one exact category name from the list>","confidence":<number 0..1>,"description":"<one short sentence describing what's shown>"}`;

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image_url } },
          ],
        }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('[classify] AI error', r.status, t);
      if (r.status === 429) return new Response(JSON.stringify({ error: 'Rate limit, try again shortly' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (r.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI ${r.status}: ${t}`);
    }
    const j = await r.json();
    let content = j?.choices?.[0]?.message?.content ?? '';
    if (typeof content !== 'string') content = JSON.stringify(content);
    console.log('[classify] raw content:', content);

    // Strip markdown fences and try to extract JSON object
    let cleaned = content.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    let parsed: any = {};
    try { parsed = JSON.parse(cleaned); } catch (e) {
      console.error('[classify] JSON parse failed for:', cleaned);
      parsed = { category: 'Other', confidence: 0.3, description: '' };
    }

    let cat = String(parsed.category || 'Other').trim();
    // Case-insensitive match against allowed categories
    const matchCat = allCats.find(c => c.toLowerCase() === cat.toLowerCase());
    cat = matchCat || 'Other';

    const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
    console.log('[classify] result:', cat, conf);

    return new Response(JSON.stringify({
      category: cat,
      confidence: conf,
      description: String(parsed.description || ''),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[classify] fatal:', e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || 'error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
