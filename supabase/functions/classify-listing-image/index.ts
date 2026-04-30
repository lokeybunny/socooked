import { corsHeaders } from '@supabase/supabase-js/cors';

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

    const prompt = `Classify this real estate listing photo into EXACTLY ONE of these categories: ${allCats.join(', ')}. Respond ONLY with strict JSON: {"category":"<one of the categories>","confidence":<0..1>,"description":"<short 1-sentence description>"}. If unsure, use "Other" with low confidence.`;

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image_url } },
          ],
        }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      if (r.status === 429) return new Response(JSON.stringify({ error: 'Rate limit, try again shortly' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (r.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI ${r.status}: ${t}`);
    }
    const j = await r.json();
    let content = j?.choices?.[0]?.message?.content || '{}';
    if (typeof content !== 'string') content = JSON.stringify(content);
    const cleaned = content.replace(/```json|```/g, '').trim();
    let parsed: any = {};
    try { parsed = JSON.parse(cleaned); } catch { parsed = { category: 'Other', confidence: 0.3, description: '' }; }
    let cat = String(parsed.category || 'Other');
    if (!allCats.includes(cat)) cat = 'Other';
    const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));

    return new Response(JSON.stringify({
      category: cat,
      confidence: conf,
      description: String(parsed.description || ''),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
