import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ═══ 6 SEARCH LENSES ═══
const LENSES = [
  {
    id: 'A',
    name: 'Builders & Prototypes',
    emoji: '🔨',
    queries: [
      `"i built" (prototype OR demo OR launch OR shipped) min_faves:2`,
      `"i made" (device OR app OR tool OR gadget) min_faves:2`,
      `"working on" (prototype OR hardware OR invention) min_faves:2`,
      `"just shipped" (beta OR v1 OR demo) min_faves:2`,
      `"open sourced" (tool OR project OR repo) min_faves:2`,
    ],
  },
  {
    id: 'B',
    name: 'Why Doesn\'t This Exist?',
    emoji: '💡',
    queries: [
      `"why isn't there" (app OR device OR product) min_faves:2`,
      `"someone should make" (app OR device OR product) min_faves:2`,
      `"does this exist" (idea OR app OR tool) min_faves:2`,
      `"what if we" (app OR device OR product) min_faves:2`,
      `"idea:" (app OR tool OR device) min_faves:2`,
    ],
  },
  {
    id: 'C',
    name: 'Absurd Monetization',
    emoji: '🤡',
    queries: [
      `"dumb idea" (but OR actually) min_faves:2`,
      `"this is stupid" (but OR yet) min_faves:2`,
      `"cursed" (invention OR product OR idea) min_faves:2`,
      `"unhinged" (startup OR product) min_faves:2`,
      `"cash grab" (product OR app) min_faves:2`,
    ],
  },
  {
    id: 'D',
    name: 'Science Headline Bait',
    emoji: '🧬',
    queries: [
      `"researchers" (discover OR create OR invent) min_faves:3`,
      `"scientists" (discover OR create OR invent) min_faves:3`,
      `("new material" OR "new battery" OR "new robot") min_faves:3`,
      `"breakthrough" (device OR material OR method) min_faves:3`,
    ],
  },
  {
    id: 'E',
    name: 'Crypto-Adjacent Gimmicks',
    emoji: '⛓️',
    queries: [
      `"wallet" (new OR invented OR prototype) min_faves:2`,
      `"trading bot" (new OR built OR released) min_faves:2`,
      `"airdrop" (tool OR checker OR bot) min_faves:2`,
      `"onchain" (game OR app OR product) min_faves:2`,
      `"solana" (tool OR experiment OR prototype) min_faves:2`,
    ],
  },
  {
    id: 'F',
    name: 'Toilet Humor & Suggestive',
    emoji: '🚽',
    queries: [
      `"toilet" (invention OR device OR startup) min_faves:1`,
      `"poop" (device OR invention OR product) min_faves:1`,
      `"butt" (device OR invention) min_faves:1`,
      `"horny" (startup OR app OR invention) min_faves:1`,
      `"dating" (gimmick OR device OR experiment) min_faves:1`,
    ],
  },
];

// Auto-kill filters
const AUTO_KILL_PATTERNS = [
  /\b(trump|biden|maga|democrat|republican|election|congress|senator)\b/i,
  /\b(died|killed|shooting|massacre|funeral|r\.?i\.?p)\b/i,
  /\b(onlyfans|porn|xxx|nsfw|nude|naked)\b/i,
  /\b(doxx|doxxing|swat|harass)\b/i,
];

function shouldAutoKill(text: string): boolean {
  return AUTO_KILL_PATTERNS.some(p => p.test(text));
}

function extractNamePattern(name: string): string {
  const words = name.trim().split(/\s+/);
  const len = words.length;
  const hasAllCaps = words.some(w => w === w.toUpperCase() && w.length > 1);
  const hasNumber = /\d/.test(name);
  const avgWordLen = Math.round(words.reduce((s, w) => s + w.length, 0) / len);
  return `${len}w_${avgWordLen}avg${hasAllCaps ? '_caps' : ''}${hasNumber ? '_num' : ''}`;
}

// Pick 2-3 lenses per run, rotating based on time
function pickLenses(maxDegen: boolean): typeof LENSES[number][] {
  const hour = new Date().getUTCHours();
  const rotation = Math.floor(hour / 4) % 6; // changes every 4 hours
  const picks = [
    LENSES[rotation % 6],
    LENSES[(rotation + 1) % 6],
    LENSES[(rotation + 2) % 6],
  ];
  // In max degen mode, always include Lens F
  if (maxDegen && !picks.find(l => l.id === 'F')) {
    picks[2] = LENSES[5]; // replace 3rd with F
  }
  return picks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { max_degeneracy = false } = await req.json().catch(() => ({}));
    const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN');
    if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not configured');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ═══ NARRATIVE EVOLUTION ENGINE ═══
    const { data: topPerformers } = await sb
      .from('narrative_evolution')
      .select('coin_name, ticker, tagline, categories, liquidity_ignition_score, coin_name_pattern, category_blend_key, score_repeatability, score_tribal, score_simplicity, score_shock, score_degen_humor')
      .eq('is_top_performer', true)
      .order('liquidity_ignition_score', { ascending: false })
      .limit(15);

    let evolutionContext = '';
    if (topPerformers && topPerformers.length > 0) {
      const blendCounts: Record<string, number> = {};
      const namePatterns: Record<string, number> = {};
      const avgScores = { repeatability: 0, tribal: 0, simplicity: 0, shock: 0, degen: 0 };
      for (const tp of topPerformers) {
        const blend = tp.category_blend_key || (tp.categories || []).sort().join('+');
        blendCounts[blend] = (blendCounts[blend] || 0) + 1;
        if (tp.coin_name_pattern) namePatterns[tp.coin_name_pattern] = (namePatterns[tp.coin_name_pattern] || 0) + 1;
        avgScores.repeatability += tp.score_repeatability || 0;
        avgScores.tribal += tp.score_tribal || 0;
        avgScores.simplicity += tp.score_simplicity || 0;
        avgScores.shock += tp.score_shock || 0;
        avgScores.degen += tp.score_degen_humor || 0;
      }
      const n = topPerformers.length;
      const topBlends = Object.entries(blendCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topPatterns = Object.entries(namePatterns).sort((a, b) => b[1] - a[1]).slice(0, 3);
      evolutionContext = `
═══ NARRATIVE EVOLUTION ENGINE — LEARNED INTELLIGENCE ═══
${n} top-performing narratives in memory.
TOP CATEGORY BLENDS: ${topBlends.map(([k, v]) => `${k} (${v}x)`).join(', ')}
TOP NAME PATTERNS: ${topPatterns.map(([k, v]) => `"${k}" (${v}x)`).join(', ')}
AVG SCORES: Repeat ${(avgScores.repeatability / n).toFixed(1)} | Tribal ${(avgScores.tribal / n).toFixed(1)} | Simple ${(avgScores.simplicity / n).toFixed(1)} | Shock ${(avgScores.shock / n).toFixed(1)} | Degen ${(avgScores.degen / n).toFixed(1)}
EXAMPLES: ${topPerformers.slice(0, 3).map(tp => `${tp.coin_name} ($${tp.ticker}) — "${tp.tagline}" [${tp.liquidity_ignition_score}]`).join(' | ')}
Each generation MUST exceed these scores. More absurd. More concise. More cult-like.
═══════════════════════════════════════════════════════`;
    }

    // ═══ ROTATING LENS SELECTION ═══
    const activeLenses = pickLenses(max_degeneracy);
    const lensIds = activeLenses.map(l => l.id);
    const allQueries = activeLenses.flatMap(l => l.queries);
    console.log(`[lenses] Active: ${activeLenses.map(l => `${l.emoji} ${l.name}`).join(', ')}`);

    // ═══ X SCRAPING ═══
    const allTweets: any[] = [];
    for (const query of allQueries) {
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
      } catch { /* skip */ }
    }

    if (allTweets.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No tweets found from X scrape', lenses_used: lensIds }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const seen = new Set<string>();
    const uniqueTweets = allTweets.filter(t => {
      const key = t.id || t.url || t.text?.slice(0, 80);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const now = Date.now();
    const filtered = uniqueTweets.filter(t => {
      const text = t.text || t.full_text || '';
      // Auto-kill filter
      if (shouldAutoKill(text)) return false;
      const likes = t.likeCount ?? t.likes ?? t.favoriteCount ?? 0;
      if (likes > 500) return false;
      const createdAt = t.createdAt ? new Date(t.createdAt).getTime() : 0;
      if (createdAt && (now - createdAt) > 48 * 60 * 60 * 1000) return false;
      return true;
    }).slice(0, 30);

    if (filtered.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No qualifying tweets after filters', lenses_used: lensIds }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tweetData = filtered.map(t => ({
      text: (t.text || t.full_text || '').slice(0, 300),
      user: t.author?.userName || t.user?.screen_name || 'unknown',
      likes: t.likeCount ?? t.likes ?? 0,
      replies: t.replyCount ?? t.replies ?? 0,
      url: t.url || `https://x.com/${t.author?.userName || 'x'}/status/${t.id || ''}`,
      media_url: t.media?.[0]?.url || t.entities?.media?.[0]?.media_url_https || '',
      created_at: t.createdAt || '',
    }));

    // ═══ AI GENERATION ═══
    const systemPrompt = `You are the MEME INTELLIGENCE LAB — a Pre-Viral Narrative Weaponization Engine for Solana PumpFun coin launches.

${evolutionContext}

ACTIVE SEARCH LENSES THIS RUN: ${activeLenses.map(l => `${l.emoji} ${l.name}`).join(', ')}

NARRATIVE CATEGORIES (classify each into 2-4):
${CATEGORIES.map((c, i) => `${i+1}. ${c}`).join('\n')}

PUMPFUN DEPLOY SCORE (0-100) — use this exact weighting:
+25 Novelty ("I've never heard this concept")
+20 Meme potential (punchline-able name)
+15 Visual potential (can you thumbnail it?)
+15 Community hook (clear tribe: gamers, gym, devs, moms, degenerates)
+10 Copy/paste lore (can you write 3 tweets instantly?)
+10 Token symbolism (easy ticker + mascot)
+5 Proof signal (prototype/demo/photo/link)

AUTO-KILL (score 0, exclude from output):
- Political ragebait
- Tragedy/death news
- Explicit sexual content
- Doxxing/harassment

ALSO SCORE these sub-criteria (1-10 each):
score_repeatability, score_tribal, score_simplicity, score_screenshot, score_shock, score_degen_humor, score_community_nickname, score_pump_velocity, score_exit_flexibility

For each viable discovery generate ALL of these:
- coin_name (sticky + viral), ticker (3-5 letters), tagline
- categories (array of 2-4 category names)
- lore_origin (EXACTLY 2 sentences max)
- enemy_narrative, community_name, bio_description, pumpfun_description
- psychological_hook, launch_thread (use \\n), viral_first_post
- phase1_pump_script, engagement_farming_replies (array of 10)
- whale_bait_framing, exit_liquidity_narrative, why_stupid_but_runs
- pump_probability (0-100), failure_risk, amplification_tweak

SELF-IMPROVEMENT PROTOCOL (MANDATORY):
Before finalizing EACH narrative:
1. Is coin name forgettable? → Make stickier
2. Is lore > 2 sentences? → Cut ruthlessly
3. Can the meme be explained in 8 words? → Simplify
4. Would degens screenshot this? → If no, increase shock
5. Is tagline AI-sounding? → Rewrite with raw energy
6. Is community name forced? → Make it organic
7. Is this culturally sharp? → Sharpen until it cuts
If ANY fails, REWRITE before output.

${max_degeneracy ? 'MAXIMUM DEGENERACY ACTIVE: Weight bodily humor, adult satire, zero utility pride, self-aware scam memes, toilet+crypto hybrids heavily.' : ''}

OUTPUT: Valid JSON array only. Each element has all fields above plus original_tweet_index (0-based), liquidity_ignition_score (0-100 using PumpFun Deploy Score formula).
Only include tweets scoring 40+. If none qualify, return [].`;

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
      if (aiRes.status === 429) return new Response(JSON.stringify({ success: false, error: 'Rate limited — try again in a moment' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted — top up in Settings' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    const batchId = crypto.randomUUID();

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

    // ═══ NARRATIVE EVOLUTION: Store ═══
    if (enriched.length > 0) {
      const rows = enriched.map((d: any) => ({
        coin_name: d.coin_name,
        ticker: d.ticker,
        tagline: d.tagline,
        categories: d.categories,
        liquidity_ignition_score: d.liquidity_ignition_score,
        score_repeatability: d.score_repeatability,
        score_tribal: d.score_tribal,
        score_simplicity: d.score_simplicity,
        score_screenshot: d.score_screenshot,
        score_shock: d.score_shock,
        score_degen_humor: d.score_degen_humor,
        score_community_nickname: d.score_community_nickname,
        score_pump_velocity: d.score_pump_velocity,
        score_exit_flexibility: d.score_exit_flexibility,
        pump_probability: d.pump_probability,
        lore_origin: d.lore_origin,
        coin_name_pattern: extractNamePattern(d.coin_name),
        category_blend_key: (d.categories || []).sort().join('+'),
        generation_batch: batchId,
        is_top_performer: d.liquidity_ignition_score >= 70,
      }));

      await sb.from('narrative_evolution').insert(rows).then(({ error }) => {
        if (error) console.error('Evolution store error:', error.message);
        else console.log(`[evolution] Stored ${rows.length} narratives, ${rows.filter(r => r.is_top_performer).length} top performers`);
      });
    }

    return new Response(JSON.stringify({
      success: true,
      discoveries: enriched,
      tweets_scanned: uniqueTweets.length,
      tweets_after_filter: filtered.length,
      evolution_active: !!(topPerformers && topPerformers.length > 0),
      top_performers_learned: topPerformers?.length || 0,
      lenses_used: activeLenses.map(l => ({ id: l.id, name: l.name, emoji: l.emoji })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('discovery-lab error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
