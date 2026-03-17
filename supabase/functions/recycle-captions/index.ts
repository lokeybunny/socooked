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
      const fallbackResults = items.map((item: any, i: number) => ({
        id: item.id,
        caption: varyCaptionFallback(item.caption, week_number, i),
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
1. Keeps the same core message but uses COMPLETELY DIFFERENT sentence structure, vocabulary, and opening hooks
2. CRITICAL: Every caption MUST start differently. NEVER reuse the same opening phrase (e.g. "Kick off your", "Start your", "Get your") across multiple captions in this batch
3. Vary tone across captions: mix conversational questions, bold statements, story snippets, one-word openers, emoji-led hooks, direct commands, and playful slang
4. MUST include at least 2 relevant hashtags inline or at the end
5. Keep captions concise (under 200 chars for TikTok, under 300 for others)
6. Vary the call-to-action style across posts — use different CTAs like: rate it, share, tag, save, comment, duet, stitch, repost, follow. Do NOT repeat the same CTA in this batch.

Here are examples of DIVERSE opening styles (use these as inspiration, don't copy verbatim):
- "This one hits different 🔥"
- "POV: you just discovered your new favorite track"
- "Name a better remix. I'll wait. 🎧"
- "Straight heat. No debate."
- "Y'all sleeping on this one fr 😤"
- "🎵 When the bass drops at 0:15..."
- "Real ones know."
- "Obsessed with this sound rn"
- "Tell me this doesn't go crazy 🔊"
- "Bet you can't listen just once"

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
          temperature: 1.1,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!geminiRes.ok) {
      console.error('[recycle-captions] Gemini error:', await geminiRes.text());
      const fallbackResults = items.map((item: any, i: number) => ({
        id: item.id,
        caption: varyCaptionFallback(item.caption, week_number, i),
        hashtags: enforceMinHashtags(item.hashtags || [], item.caption || '', platform),
      }));
      return new Response(JSON.stringify({ variations: fallbackResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let variations: any[];
    try {
      variations = JSON.parse(jsonStr);
    } catch {
      console.error('[recycle-captions] Failed to parse AI response:', rawText);
      variations = items.map((item: any, i: number) => ({
        id: item.id,
        caption: varyCaptionFallback(item.caption, week_number, i),
        hashtags: enforceMinHashtags(item.hashtags || [], item.caption || '', platform),
      }));
    }

    variations = variations.map((v: any) => ({
      ...v,
      caption: fixHandlePunctuation(v.caption || ''),
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
// Uses both weekNum AND item index to ensure every post in the same week gets a different style
function varyCaptionFallback(caption: string, weekNum: number, itemIndex: number): string {
  if (!caption) return caption;

  // 40 diverse opener templates — {0} is the cleaned caption
  const templates = [
    '🔥 {0}',
    'This one hits different 💯 {0}',
    '🎶 {0}',
    'POV: you just found your new favorite 🎧 {0}',
    'No skips. {0} ✨',
    'Y\'all sleeping on this fr 😤 {0}',
    '🔊 When the beat drops... {0}',
    'Real ones know. {0} 💎',
    'Obsessed rn 🎵 {0}',
    'Tell me this doesn\'t go crazy 🤯 {0}',
    'Bet you can\'t listen just once 🎤 {0}',
    'Straight heat 🔥 {0}',
    'On repeat all day 🔁 {0}',
    '⚡ {0}',
    'Name a better vibe. I\'ll wait. {0}',
    'The energy on this one 🙌 {0}',
    'Had to share this 💫 {0}',
    'Trust me on this one 🎯 {0}',
    'Goosebumps every time 😳 {0}',
    'Sound up for this 🔈 {0}',
    'Mood: {0} 💜',
    'Certified banger 💣 {0}',
    'Just vibes. Nothing else. {0} ☁️',
    'Play this LOUD 🔊 {0}',
    'New obsession unlocked 🔓 {0}',
    'Cannot stop replaying 🔄 {0}',
    'Pure fire from start to finish 🔥 {0}',
    'The one you didn\'t know you needed 💡 {0}',
    'Headphones ON for this one 🎧 {0}',
    'Weekend anthem right here 🎉 {0}',
    '🚀 {0}',
    'Feeling this on another level 📈 {0}',
    'Add this to every playlist 📋 {0}',
    'Late night vibes ✨ {0}',
    'How is nobody talking about this?! 👀 {0}',
    'The remix we all needed 🎶 {0}',
    'Dropped and immediately on repeat ♾️ {0}',
    'This track understood the assignment 📝 {0}',
    'Volume warning ⚠️ {0}',
    'Sending this to everyone I know 📲 {0}',
  ];

  const ctas = [
    'Share this with your crew!',
    'Tag someone who needs this 🔥',
    'Rate this below 🔥 or 💩',
    'Save this for later ✨',
    'Send to your bestie 💯',
    'Who else vibes with this? 🎶',
    'Double tap if you agree 💎',
    'Comment your thoughts below 👇',
    'Repost if this hits different 🎧',
    'This one\'s for the real ones 🙌',
    'Drop a 🔥 in the comments',
    'Stitch this with your reaction 🎬',
    'Follow for more heat 🔥',
    'Bookmark this one 📌',
    'Which part slaps hardest? 🤔',
    'Turn this into your ringtone fr 📱',
    'Link in bio — go stream 🎵',
    'Put this on your story 📸',
    'Duet this if you feel it 🎤',
    'Who are you sending this to? 👇',
  ];

  // Use a combined seed so each post in the same week gets a unique template+CTA
  const seed = (weekNum * 7 + itemIndex * 13) % templates.length;
  const ctaSeed = (weekNum * 11 + itemIndex * 17) % ctas.length;

  const template = templates[seed];
  const cta = ctas[ctaSeed];

  // Remove existing emojis from start
  const cleaned = caption.replace(/^[\p{Emoji}\s]+/u, '').trim();
  return `${template.replace('{0}', cleaned)}\n\n${cta}`;
}

// ─── Ensure at least 2 hashtags ───
function enforceMinHashtags(hashtags: string[], caption: string, platform: string): string[] {
  const cleaned = hashtags
    .map((h: string) => h.startsWith('#') ? h : `#${h}`)
    .filter((h: string) => h.length > 1);

  if (cleaned.length >= 2) return cleaned;

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

// ─── Fix handle punctuation so @tags stay clickable ───
function fixHandlePunctuation(text: string): string {
  // Remove period/comma immediately after known handles
  return text
    .replace(/@lamb\.wavvv?\./g, '@lamb.wavv ')
    .replace(/@oranjgoodman\./g, '@oranjgoodman ')
    .trim();
}
