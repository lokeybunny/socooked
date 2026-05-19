// Removes furniture & interior design from a property photo using Lovable AI (Nano Banana 2)
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageDataUrl } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'imageDataUrl required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const prompt = `TASK 1 — Classify the room: identify what kind of space this is. Reply on the very first line with exactly: ROOM: <LABEL>  where LABEL is ONE concise uppercase tag like KITCHEN, BEDROOM, MASTER_BEDROOM, BATHROOM, LIVING_ROOM, DINING_ROOM, OFFICE, GARAGE, HALLWAY, LAUNDRY, CLOSET, ENTRYWAY, BASEMENT, ATTIC, EXTERIOR_FRONT, EXTERIOR_BACK, BACKYARD, PATIO, POOL, GARDEN, DRIVEWAY, BALCONY, STAIRCASE.

TASK 2 — Photo-realistically remove ALL furniture, rugs, art, decor, plants, curtains, electronics, and personal belongings from the photo. Leave the room completely empty as if staged for sale. Preserve the original architecture exactly: walls, windows, doors, flooring material, ceiling, fixtures, lighting, paint color, camera angle, perspective, lens, and natural lighting must remain identical. The result must look like a real listing photo of an unfurnished/vacant room — no artifacts, no warping, no added objects. Restore flooring and wall surfaces behind removed items realistically. For exterior shots, remove vehicles, patio furniture, toys, hoses, and personal items but keep landscaping and structures.`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-image-preview',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        }],
        modalities: ['image', 'text'],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error('AI gateway error', resp.status, t);
      if (resp.status === 429) return new Response(JSON.stringify({ error: 'Rate limited, try again shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ error: 'AI gateway error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await resp.json();
    const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textContent = (data?.choices?.[0]?.message?.content || '') as string;
    const roomMatch = /ROOM:\s*([A-Z_][A-Z0-9_ ]*)/i.exec(textContent);
    const roomType = roomMatch ? roomMatch[1].trim().toUpperCase().replace(/\s+/g, '_') : null;
    if (!url) {
      console.error('No image returned', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: 'No image returned', roomType }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ imageDataUrl: url, roomType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('empty-room error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
