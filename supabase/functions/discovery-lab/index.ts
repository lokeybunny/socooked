import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { max_degeneracy = false } = await req.json().catch(() => ({}));
    const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN');
    if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not configured');

    // Build discovery-focused search queries
    const baseQueries = [
      `("just built" OR "what if someone made" OR "prototype" OR "I invented" OR "startup idea") ("crypto" OR "token" OR "solana" OR "coin") min_faves:5`,
      `("working on" OR "launching soon" OR "side project") ("web3" OR "memecoin" OR "shitcoin" OR "degenerate") min_faves:3`,
    ];

    const degenQueries = [
      `("toilet" OR "poop" OR "fart" OR "dating app" OR "adult") ("crypto" OR "token" OR "coin" OR "mint") min_faves:2`,
      `("embarrassing" OR "stupid idea" OR "cursed" OR "degen") ("built" OR "made" OR "launching" OR "token") min_faves:3`,
    ];

    const queries = max_degeneracy ? [...baseQueries, ...degenQueries] : baseQueries;

    // Scrape X via Apify
    const allTweets: any[] = [];
    for (const query of queries) {
      try {
        const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              searchTerms: [query],
              maxTweets: 15,
              sort: 'Latest',
              tweetLanguage: 'en',
            }),
          }
        );
        if (apifyRes.ok) {
          const tweets = await apifyRes.json();
          allTweets.push(...(Array.isArray(tweets) ? tweets : []));
        }
      } catch { /* skip failed query */ }
    }

    if (allTweets.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No tweets found from X scrape' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduplicate
    const seen = new Set<string>();
    const uniqueTweets = allTweets.filter(t => {
      const key = t.id || t.url || t.text?.slice(0, 80);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter: under 48h, under 500 likes
    const now = Date.now();
    const filtered = uniqueTweets.filter(t => {
      const likes = t.likeCount ?? t.likes ?? t.favoriteCount ?? 0;
      if (likes > 500) return false;
      const createdAt = t.createdAt ? new Date(t.createdAt).getTime() : 0;
      if (createdAt && (now - createdAt) > 48 * 60 * 60 * 1000) return false;
      return true;
    }).slice(0, 20);

    if (filtered.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No qualifying tweets (under 48h, under 500 likes)' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format for AI
    const tweetData = filtered.map(t => ({
      text: (t.text || t.full_text || '').slice(0, 300),
      user: t.author?.userName || t.user?.screen_name || 'unknown',
      likes: t.likeCount ?? t.likes ?? 0,
      replies: t.replyCount ?? t.replies ?? 0,
      url: t.url || `https://x.com/${t.author?.userName || 'x'}/status/${t.id || ''}`,
      media_url: t.media?.[0]?.url || t.entities?.media?.[0]?.media_url_https || '',
      created_at: t.createdAt || '',
    }));

    // Use Gemini for narrative weaponization
    const GEMINI_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GEMINI_KEY) throw new Error('GOOGLE_GEMINI_API_KEY not configured');

    const systemPrompt = `You are the DISCOVERY LAB AI — a Pre-Viral Narrative Weaponization Engine for Solana Pump.fun coin launches.

You receive raw X/Twitter posts about absurd inventions, weird startups, toilet humor, degen ideas, and sexually funny (non-explicit) concepts.

YOUR TASK: For each viable discovery, WEAPONIZE it into a full Pump.fun launch package.

DETECTION CRITERIA:
1. Meme Friction (1-10): Does this make people uncomfortable but amused?
2. Monetization Absurdity (1-10): Is the revenue model ridiculous but possible?
3. Narrative Elasticity (1-10): Can this stretch into lore, jokes, catchphrases, meme formats?
4. PumpFun Viability (1-10): Can this narrative be explained in 8 words or less?

ABSURDITY TAGS: toilet, sexy, tech, monetize, parody

For each discovery, generate ALL of this:
- coin_name, ticker (3-5 letters), tagline
- lore_origin (2-3 sentences)
- villain (what this coin fights)
- community_identity (what holders call themselves)
- bio_description (for X profile)
- pumpfun_description
- psychological_hook
- launch_thread (full thread text, use \\n for line breaks)
- viral_first_post
- phase1_strategy
- tweet_angles (array of 10 angles)
- reply_farming (strategy)
- narrative_stacking (angle)
- exit_narrative
- why_stupid_but_runs (thesis)

SCORING:
virality_index (0-100) based on cultural tension, shock factor, degen humor, repeatability, pump potential.

${max_degeneracy ? 'MAXIMUM DEGENERACY MODE ACTIVE: Prioritize toilet economics, body humor, dating/token hybrids, embarrassing monetization, meme shock plays.' : ''}

OUTPUT: Return ONLY valid JSON array. No markdown. Each element has all fields above plus original_tweet_index (0-based), absurdity_tag, meme_friction, monetization_absurdity, narrative_elasticity, pumpfun_viability, virality_index.

Only include tweets that score 50+ virality_index. If none qualify, return empty array [].`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nTWEETS:\n${JSON.stringify(tweetData, null, 2)}` }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 8000, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini API error: ${err.slice(0, 200)}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    let discoveries: any[];
    try {
      discoveries = JSON.parse(rawText);
      if (!Array.isArray(discoveries)) discoveries = [discoveries];
    } catch {
      // Try to extract JSON from text
      const match = rawText.match(/\[[\s\S]*\]/);
      discoveries = match ? JSON.parse(match[0]) : [];
    }

    // Attach original tweet data and generate IDs
    const enriched = discoveries.map((d: any, i: number) => {
      const tweetIdx = d.original_tweet_index ?? i;
      const tweet = tweetData[tweetIdx] || tweetData[0];
      return {
        id: crypto.randomUUID(),
        original_tweet: tweet,
        absurdity_tag: d.absurdity_tag || 'parody',
        virality_index: d.virality_index || 50,
        coin_name: d.coin_name || 'UNKNOWN',
        ticker: d.ticker || 'UNK',
        tagline: d.tagline || '',
        lore_origin: d.lore_origin || '',
        villain: d.villain || '',
        community_identity: d.community_identity || '',
        bio_description: d.bio_description || '',
        pumpfun_description: d.pumpfun_description || '',
        psychological_hook: d.psychological_hook || '',
        launch_thread: d.launch_thread || '',
        viral_first_post: d.viral_first_post || '',
        phase1_strategy: d.phase1_strategy || '',
        tweet_angles: d.tweet_angles || [],
        reply_farming: d.reply_farming || '',
        narrative_stacking: d.narrative_stacking || '',
        exit_narrative: d.exit_narrative || '',
        why_stupid_but_runs: d.why_stupid_but_runs || '',
        meme_friction: d.meme_friction || 5,
        monetization_absurdity: d.monetization_absurdity || 5,
        narrative_elasticity: d.narrative_elasticity || 5,
        pumpfun_viability: d.pumpfun_viability || 5,
      };
    }).sort((a: any, b: any) => b.virality_index - a.virality_index);

    return new Response(JSON.stringify({ success: true, discoveries: enriched, tweets_scanned: uniqueTweets.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
