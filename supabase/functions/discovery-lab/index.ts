import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATEGORIES = [
  "Literal Shitcoin","Toilet Tech","Bodily Function Monetization","Degenerate Dating","Tokenized Embarrassment",
  "Crypto-Physical Hybrid","AI Gone Too Far","Fake Utility Meme","Anti-VC Rebellion","Rug Parody",
  "What If This Was A Coin","Absurd Startup Pitch","Crypto Religion Satire","Productivity Coin Parody","Attention Economy Exploit",
  "Adult Humor Non-Explicit","Meme-as-a-Service","Reverse Psychology Coin","Self-Aware Scam","Crypto Gym Bro",
  "TradFi Mockery","Government Satire","Dating App Tokenomics","OnlyFans Token Parody","Bodily Sensor Crypto",
  "Gambling Degeneracy","Community Cult","Anti-Influencer Token","Influencer Parody","Launchpad Mockery",
  "AI Waifu Coin","Internet Drama Coin","Tech Bro Satire","Beta Male Alpha Meme","Masculinity/Femininity Satire",
  "NFT Trauma Coin","Built This in 2 Hours","Hardware Blockchain Joke","Failed Startup Resurrection","Emotional Damage Coin",
  "Therapy But Tokenized","Meme Political Satire","Zero Utility Pride","We Are Exit Liquidity","Burn Mechanism Parody",
  "Gas Fee Joke","On-Chain Toilet Economics","Degenerate Yield Farming","Micro-Transaction Absurdity","Viral Phrase Coin",
  "Body Enhancement Satire","Web2 vs Web3 War","Public Humiliation Token","Meme Competition Coin","Lifestyle Satire",
  "Hyper-Niche Community","Anti-Work Coin","Productivity Shaming","Crypto Detox Parody","Doom Collapse Meme"
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { max_degeneracy = false } = await req.json().catch(() => ({}));
    const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN');
    if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not configured');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Discovery-focused search queries
    const baseQueries = [
      `("just built" OR "what if someone made" OR "prototype" OR "I invented" OR "startup idea") ("crypto" OR "token" OR "solana" OR "coin") min_faves:5`,
      `("working on" OR "launching soon" OR "side project") ("web3" OR "memecoin" OR "shitcoin" OR "degenerate") min_faves:3`,
      `("tokenized" OR "on-chain" OR "mint" OR "pump") ("absurd" OR "stupid" OR "genius" OR "weird" OR "cursed") min_faves:3`,
    ];

    const degenQueries = [
      `("toilet" OR "poop" OR "fart" OR "dating app" OR "adult") ("crypto" OR "token" OR "coin" OR "mint") min_faves:2`,
      `("embarrassing" OR "stupid idea" OR "cursed" OR "degen") ("built" OR "made" OR "launching" OR "token") min_faves:3`,
      `("onlyfans" OR "gym bro" OR "therapy" OR "waifu") ("coin" OR "token" OR "crypto" OR "solana") min_faves:2`,
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
            body: JSON.stringify({ searchTerms: [query], maxTweets: 15, sort: 'Latest', tweetLanguage: 'en' }),
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
    }).slice(0, 25);

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

    const systemPrompt = `You are the MEME INTELLIGENCE LAB — a Pre-Viral Narrative Weaponization Engine for Solana PumpFun coin launches.

You identify narrative asymmetry and convert overlooked absurdity into liquidity ignition events.

NARRATIVE CATEGORIES (classify each discovery into 2-4):
${CATEGORIES.map((c, i) => `${i+1}. ${c}`).join('\n')}

DETECTION CRITERIA:
1. Meme Repeatability (1-10): Can this become a format?
2. Tribal Identity Potential (1-10): Will holders form an identity?
3. Narrative Simplicity (1-10): Explainable in 8 words?
4. Screenshot-Worthiness (1-10): Would people screenshot & share?
5. Shock Value (1-10): Does it make you double-take?
6. Degen Humor Intensity (1-10): How hard do degens laugh?
7. Community Nickname Potential (1-10): Natural holder identity?
8. Phase 1 Pump Velocity (1-10): How fast can this catch fire?
9. Exit Narrative Flexibility (1-10): Multiple exit ramps available?

SCORING: 🚀 LIQUIDITY IGNITION SCORE (0-100) weighted by all 9 criteria above.

For each viable discovery, generate:
- coin_name (sticky + viral), ticker (3-5 letters), tagline
- categories (array of 2-4 category names from list above)
- lore_origin (2-3 sentences)
- enemy_narrative (what this coin opposes)
- community_name (what holders call themselves)
- bio_description (X profile bio)
- pumpfun_description
- psychological_hook
- launch_thread (full thread, use \\n for line breaks)
- viral_first_post
- phase1_pump_script (first 24h strategy)
- engagement_farming_replies (array of 10 reply-bait tweets)
- whale_bait_framing (why whales would ape)
- exit_liquidity_narrative (backup exit plan)
- why_stupid_but_runs (thesis)

SELF-IMPROVEMENT: Before finalizing each narrative, evaluate:
1. Is the coin name forgettable? If yes, make it stickier.
2. Is the lore weak? Strengthen it.
3. Is the tagline lacking punch? Sharpen it.
4. Would degens instantly "get it"? If not, simplify.
5. Is it screenshot-worthy? If not, add shock factor.

POST-LAUNCH SIMULATION: For each, add:
- pump_probability (0-100): Would this actually pump?
- failure_risk: Why it might fail
- amplification_tweak: One change that makes it run harder

${max_degeneracy ? 'MAXIMUM DEGENERACY INTELLIGENCE ACTIVE: Heavily weight bodily humor, adult satire, zero utility pride, self-aware scam memes, toilet+crypto hybrids, dating tokenomics, and embarrassing monetization.' : ''}

OUTPUT: Return ONLY valid JSON array. Each element has all fields above plus original_tweet_index (0-based), liquidity_ignition_score (0-100), and all 9 criteria scores as score_repeatability, score_tribal, score_simplicity, score_screenshot, score_shock, score_degen_humor, score_community_nickname, score_pump_velocity, score_exit_flexibility.

Only include tweets scoring 45+ liquidity_ignition_score. If none qualify, return [].`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `TWEETS:\n${JSON.stringify(tweetData, null, 2)}` },
        ],
        temperature: 0.9,
        max_tokens: 12000,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limited — try again in a moment' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted — top up in Settings' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await aiRes.text();
      throw new Error(`AI error ${aiRes.status}: ${errText.slice(0, 200)}`);
    }

    const aiData = await aiRes.json();
    const rawText = aiData.choices?.[0]?.message?.content || '[]';

    let discoveries: any[];
    try {
      discoveries = JSON.parse(rawText);
      if (!Array.isArray(discoveries)) discoveries = [discoveries];
    } catch {
      const match = rawText.match(/\[[\s\S]*\]/);
      discoveries = match ? JSON.parse(match[0]) : [];
    }

    // Enrich with tweet data
    const enriched = discoveries.map((d: any, i: number) => {
      const tweetIdx = d.original_tweet_index ?? i;
      const tweet = tweetData[tweetIdx] || tweetData[0];
      return {
        id: crypto.randomUUID(),
        original_tweet: tweet,
        categories: d.categories || [],
        liquidity_ignition_score: d.liquidity_ignition_score || 50,
        coin_name: d.coin_name || 'UNKNOWN',
        ticker: d.ticker || 'UNK',
        tagline: d.tagline || '',
        lore_origin: d.lore_origin || '',
        enemy_narrative: d.enemy_narrative || '',
        community_name: d.community_name || '',
        bio_description: d.bio_description || '',
        pumpfun_description: d.pumpfun_description || '',
        psychological_hook: d.psychological_hook || '',
        launch_thread: d.launch_thread || '',
        viral_first_post: d.viral_first_post || '',
        phase1_pump_script: d.phase1_pump_script || '',
        engagement_farming_replies: d.engagement_farming_replies || [],
        whale_bait_framing: d.whale_bait_framing || '',
        exit_liquidity_narrative: d.exit_liquidity_narrative || '',
        why_stupid_but_runs: d.why_stupid_but_runs || '',
        pump_probability: d.pump_probability || 50,
        failure_risk: d.failure_risk || '',
        amplification_tweak: d.amplification_tweak || '',
        score_repeatability: d.score_repeatability || 5,
        score_tribal: d.score_tribal || 5,
        score_simplicity: d.score_simplicity || 5,
        score_screenshot: d.score_screenshot || 5,
        score_shock: d.score_shock || 5,
        score_degen_humor: d.score_degen_humor || 5,
        score_community_nickname: d.score_community_nickname || 5,
        score_pump_velocity: d.score_pump_velocity || 5,
        score_exit_flexibility: d.score_exit_flexibility || 5,
      };
    }).sort((a: any, b: any) => b.liquidity_ignition_score - a.liquidity_ignition_score);

    return new Response(JSON.stringify({ success: true, discoveries: enriched, tweets_scanned: uniqueTweets.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('discovery-lab error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
