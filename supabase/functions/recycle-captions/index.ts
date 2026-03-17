import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items, week_number, total_weeks, platform, brand_context } = await req.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'items array required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GEMINI_KEY) {
      // Fallback: just vary captions manually without AI
      const fallbackResults = items.map((item: any) => ({
        id: item.id,
        caption: varyCaptionFallback(item.caption, week_number),
        hashtags: enforceMinHashtags(item.hashtags || [], item.caption || '', platform),
      }));
      return new Response(JSON.stringify({ variations: fallbackResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const brandInfo = brand_context
      ? `Brand context: niche="${brand_context.niche || 'general'}", voice="${brand_context.voice || 'casual'}", audience="${brand_context.audience || 'general'}".`
      : '';

    const itemDescriptions = items.map((item: any, i: number) =>
      `Post ${i + 1} (id: "${item.id}"):\n  Original caption: "${item.caption || ''}"\n  Original hashtags: ${JSON.stringify(item.hashtags || [])}\n  Media type: ${item.type || 'video'}`
    ).join('\n\n');

    const prompt = `You are a social media content strategist. I'm recycling content for week ${week_number} of ${total_weeks} on ${platform || 'social media'}.

${brandInfo}

Below are the original posts. For each post, generate a FRESH caption variation that:
1. Keeps the same vibe/energy but uses different wording, emojis, and hooks
2. Feels organic and not repetitive — as if written fresh for this week
3. MUST include at least 2 relevant hashtags inline or at the end
4. Keep captions concise (under 200 chars for TikTok, under 300 for others)
5. Vary the call-to-action style (tag a friend, share, save, comment, etc.)

${itemDescriptions}

Respond ONLY with valid JSON array, no markdown, no code fences:
[
  { "id": "post-id", "caption": "varied caption text", "hashtags": ["#Tag1", "#Tag2", "#Tag3"] },
  ...
]`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!geminiRes.ok) {
      console.error('[recycle-captions] Gemini error:', await geminiRes.text());
      // Fallback
      const fallbackResults = items.map((item: any) => ({
        id: item.id,
        caption: varyCaptionFallback(item.caption, week_number),
        hashtags: enforceMinHashtags(item.hashtags || [], item.caption || '', platform),
      }));
      return new Response(JSON.stringify({ variations: fallbackResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response (strip markdown fences if present)
    const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let variations: any[];
    try {
      variations = JSON.parse(jsonStr);
    } catch {
      console.error('[recycle-captions] Failed to parse AI response:', rawText);
      variations = items.map((item: any) => ({
        id: item.id,
        caption: varyCaptionFallback(item.caption, week_number),
        hashtags: enforceMinHashtags(item.hashtags || [], item.caption || '', platform),
      }));
    }

    // Enforce minimum 2 hashtags on every variation
    variations = variations.map((v: any) => ({
      ...v,
      hashtags: enforceMinHashtags(v.hashtags || [], v.caption || '', platform),
    }));

    return new Response(JSON.stringify({ variations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('[recycle-captions] Error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Fallback caption variation (no AI) ───
function varyCaptionFallback(caption: string, weekNum: number): string {
  if (!caption) return caption;
  const hooks = [
    '🔥 ', '💯 ', '🎶 ', '✨ ', '🎧 ', '💎 ', '🔊 ', '🎵 ', '⚡ ', '🙌 ',
    '👀 ', '🎤 ', '💫 ', '🌟 ', '🚀 ', '❤️ ', '😤 ', '🤯 ', '💪 ', '🎯 ',
  ];
  const ctas = [
    'Share this with your crew!',
    'Tag someone who needs this 🔥',
    'Drop a 🔥 if you feel it',
    'Save this for later ✨',
    'Send to your bestie 💯',
    'Who else vibes with this? 🎶',
    'Double tap if you agree 💎',
    'Comment your thoughts below 👇',
    'Repost if this hits different 🎧',
    'This one\'s for the real ones 🙌',
  ];
  const hook = hooks[weekNum % hooks.length];
  const cta = ctas[weekNum % ctas.length];
  // Remove existing emojis from start
  const cleaned = caption.replace(/^[\p{Emoji}\s]+/u, '').trim();
  return `${hook}${cleaned}\n\n${cta}`;
}

// ─── Ensure at least 2 hashtags ───
function enforceMinHashtags(hashtags: string[], caption: string, platform: string): string[] {
  const cleaned = hashtags
    .map((h: string) => h.startsWith('#') ? h : `#${h}`)
    .filter((h: string) => h.length > 1);

  if (cleaned.length >= 2) return cleaned;

  // Generate fallback hashtags based on platform and content
  const fallbacks: Record<string, string[]> = {
    tiktok: ['#FYP', '#ForYouPage', '#Viral', '#Music', '#Trending', '#MusicVibes'],
    instagram: ['#Explore', '#InstaMusic', '#Vibes', '#MusicLovers', '#Share'],
    facebook: ['#Music', '#Share', '#NewMusic', '#Vibes', '#Listen'],
    x: ['#Music', '#NowPlaying', '#NewMusic', '#Vibes'],
  };

  const pool = fallbacks[platform] || fallbacks.instagram;
  while (cleaned.length < 2) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!cleaned.includes(pick)) cleaned.push(pick);
  }

  return cleaned;
}
