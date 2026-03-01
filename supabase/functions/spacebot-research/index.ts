import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEMORY_SITE_ID = "cortex-agent";
const MEMORY_SECTION = "search-memory";

/** OAuth 2.0 Client Credentials → Bearer token for X API v2 */
async function getXBearerToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  // Try api.x.com first, fallback to api.twitter.com
  for (const base of ["https://api.x.com", "https://api.twitter.com"]) {
    try {
      const res = await fetch(`${base}/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (res.ok) {
        const data = await res.json();
        return data.access_token;
      }
      const err = await res.text().catch(() => "");
      console.log(`X OAuth2 via ${base} failed (${res.status}): ${err.slice(0, 300)}`);
    } catch (e: any) {
      console.log(`X OAuth2 via ${base} error: ${e.message}`);
    }
  }
  throw new Error("X OAuth2 token failed on both api.x.com and api.twitter.com");
}

/** Search recent tweets via X API v2 */
async function searchTweets(bearer: string, query: string, maxResults = 100): Promise<any[]> {
  // X free tier only returns tweets from the last 7 days; restrict to 24h for freshness
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(maxResults, 100)),
    start_time: since,
    "tweet.fields": "public_metrics,created_at,author_id,entities,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "username,profile_image_url",
    "media.fields": "url,preview_image_url,type",
  });
  const url = `https://api.x.com/2/tweets/search/recent?${params}`;
  console.log(`X search query: "${query}" → ${url.slice(0, 120)}...`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const bodyText = await res.text();
  console.log(`X search response (${res.status}): ${bodyText.slice(0, 500)}`);
  if (!res.ok) {
    if (res.status === 429 || bodyText.includes("Rate limit") || bodyText.includes("CreditsDepleted") || bodyText.includes("Too Many Requests") || bodyText.includes("usage cap")) {
      throw new Error("CREDITS_DEPLETED");
    }
    // X Free tier returns 403 for search endpoint — need Basic ($100/mo) or higher
    if (res.status === 403) {
      throw new Error("CREDITS_DEPLETED");
    }
    return [];
  }
  let json: any;
  try { json = JSON.parse(bodyText); } catch { return []; }
  // X sometimes returns 200 with errors array instead of data
  if (json.errors?.length && !json.data?.length) {
    console.log(`X API returned errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
    const errMsg = JSON.stringify(json.errors);
    if (errMsg.includes("usage") || errMsg.includes("cap") || errMsg.includes("forbidden") || errMsg.includes("not authorized")) {
      throw new Error("CREDITS_DEPLETED");
    }
    return [];
  }
  // Map users by author_id for easy lookup
  const usersMap = new Map<string, any>();
  for (const u of json.includes?.users || []) {
    usersMap.set(u.id, u);
  }
  // Map media by media_key
  const mediaMap = new Map<string, any>();
  for (const m of json.includes?.media || []) {
    mediaMap.set(m.media_key, m);
  }
  return (json.data || []).map((tw: any) => {
    const user = usersMap.get(tw.author_id) || {};
    // Get first image media URL from attachments
    let media_url = "";
    if (tw.attachments?.media_keys?.length) {
      for (const mk of tw.attachments.media_keys) {
        const media = mediaMap.get(mk);
        if (media) {
          media_url = media.url || media.preview_image_url || "";
          if (media_url) break;
        }
      }
    }
    return {
      id: tw.id,
      text: tw.text,
      full_text: tw.text,
      user: { screen_name: user.username || "", profile_image_url_https: user.profile_image_url || "" },
      favorite_count: tw.public_metrics?.like_count || 0,
      retweet_count: tw.public_metrics?.retweet_count || 0,
      created_at: tw.created_at,
      media_url,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TWITTER_BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN");
  const TWITTER_CLIENT_ID = Deno.env.get("TWITTER_CLIENT_ID");
  const TWITTER_CLIENT_SECRET = Deno.env.get("TWITTER_CLIENT_SECRET");
  const MORALIS_API_KEY = Deno.env.get("MORALIS_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const hasTwitterCreds = TWITTER_BEARER_TOKEN || (TWITTER_CLIENT_ID && TWITTER_CLIENT_SECRET);
  if (!hasTwitterCreds || !MORALIS_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing API keys (need TWITTER_BEARER_TOKEN or TWITTER_CLIENT_ID+SECRET, plus MORALIS_API_KEY)" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing LOVABLE_API_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = async (event: string, data: Record<string, unknown>) => {
    try {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch { /* stream closed */ }
  };

  // Run pipeline in background, return stream immediately
  (async () => {

      const pushFinding = async (
        title: string, summary: string, sourceUrl: string,
        findingType: string, rawData: Record<string, unknown>, tags: string[]
      ) => {
        await supabase.from("research_findings").insert({
          title, summary, source_url: sourceUrl, finding_type: findingType,
          category: "x", status: "new", created_by: "cortex",
          raw_data: rawData, tags,
        });
      };

      try {
        const stats: Record<string, number> = {};

        // ── STEP 0: Load persistent memory ───
        send("progress", { step: 0, label: "Loading Cortex memory", status: "running", detail: "Reading persistent search terms & past winning narratives..." });

        let memory: { search_terms: string[]; past_wins: string[]; last_cycle: string | null } = {
          search_terms: [
            '("pump.fun" OR pumpfun OR "new memecoin") (ai OR cat OR agent OR celebrity OR frog OR dog OR political)',
            '("solana memecoin" OR "$SOL" OR "pump fun") (launch OR moon OR 100x OR narrative)',
            '("pump.fun" OR pumpfun) (trending OR viral OR breaking)',
          ],
          past_wins: [],
          last_cycle: null,
        };

        try {
          const { data: memRow } = await supabase
            .from("site_configs")
            .select("content")
            .eq("site_id", MEMORY_SITE_ID)
            .eq("section", MEMORY_SECTION)
            .maybeSingle();
          if (memRow?.content) {
            const saved = memRow.content as any;
            if (saved.search_terms?.length) memory.search_terms = saved.search_terms;
            if (saved.past_wins?.length) memory.past_wins = saved.past_wins;
            memory.last_cycle = saved.last_cycle || null;
          }
        } catch { /* first run */ }

        send("progress", { step: 0, label: "Loading Cortex memory", status: "done", detail: `Loaded ${memory.search_terms.length} search queries, ${memory.past_wins.length} past wins` });

        // ── STEP 1: Get X API Bearer token ────────────
        send("progress", { step: 1, label: "Authenticating with X API", status: "running", detail: "Acquiring bearer token..." });

        let xBearer: string;
        try {
          if (TWITTER_BEARER_TOKEN) {
            xBearer = TWITTER_BEARER_TOKEN;
          } else {
            xBearer = await getXBearerToken(TWITTER_CLIENT_ID!, TWITTER_CLIENT_SECRET!);
          }
        } catch (e: any) {
          await send("progress", { step: 1, label: "Authenticating with X API", status: "error", detail: e.message });
          await send("error", { message: `X auth failed: ${e.message}` });
          try { await writer.close(); } catch { /* already closed */ }
          return;
        }
        send("progress", { step: 1, label: "Authenticating with X API", status: "done", detail: TWITTER_BEARER_TOKEN ? "Using direct Bearer Token ✓" : "OAuth2 Bearer token acquired ✓" });

        // ── STEP 2: Search tweets via X API v2 ──────────────────────
        send("progress", { step: 2, label: "Searching X/Twitter via API v2", status: "running", detail: `Sending ${memory.search_terms.length} search queries...` });

        let tweets: any[] = [];
        let creditsDepleted = false;
        for (const query of memory.search_terms) {
          try {
            const results = await searchTweets(xBearer, query, 100);
            tweets.push(...results);
          } catch (e: any) {
            console.log(`Search query failed: ${e.message}`);
            if (e.message === "CREDITS_DEPLETED") {
              creditsDepleted = true;
              break;
            }
          }
          // Rate limit courtesy
          await new Promise((r) => setTimeout(r, 1000));
        }
        // Deduplicate by tweet id
        const seenIds = new Set<string>();
        tweets = tweets.filter(tw => {
          if (seenIds.has(tw.id)) return false;
          seenIds.add(tw.id);
          return true;
        });
        stats.tweets = tweets.length;
        // Detect soft credit depletion: if we ran queries but got 0 tweets, X API is likely throttled
        if (!creditsDepleted && tweets.length === 0 && memory.search_terms.length > 0) {
          creditsDepleted = true;
        }
        (stats as any).credits_depleted = creditsDepleted;
        if (creditsDepleted) {
          send("warning", { type: "credits_depleted", message: "X API returned 0 tweets — your API credits may be depleted or rate-limited. Narrative cards will not have 'View on X' links this cycle. Token & DexScreener data is unaffected." });
        }
        send("progress", { step: 2, label: "Searching X/Twitter via API v2", status: creditsDepleted ? "warning" : "done", detail: creditsDepleted ? `⚠️ X API returned 0 tweets — credits likely depleted` : `Found ${tweets.length} unique tweets from X` });

        // ── STEP 3: Moralis Pump.fun tokens ─────────────────────────
        send("progress", { step: 3, label: "Fetching Pump.fun tokens via Moralis", status: "running", detail: "Pulling new (100), bonding (100) & graduated (50) tokens..." });

        const moralisHeaders = { "X-API-Key": MORALIS_API_KEY! };
        const moralisBase = "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun";

        const [newRes, bondRes, gradRes] = await Promise.all([
          fetch(`${moralisBase}/new?limit=100`, { headers: moralisHeaders }),
          fetch(`${moralisBase}/bonding?limit=100`, { headers: moralisHeaders }),
          fetch(`${moralisBase}/graduated?limit=50`, { headers: moralisHeaders }),
        ]);

        const extractTokens = (data: any): any[] => {
          if (Array.isArray(data)) return data;
          if (data?.result && Array.isArray(data.result)) return data.result;
          if (data?.tokens && Array.isArray(data.tokens)) return data.tokens;
          if (data?.data && Array.isArray(data.data)) return data.data;
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            for (const key of Object.keys(data)) {
              if (Array.isArray(data[key]) && data[key].length > 0 && typeof data[key][0] === 'object') {
                return data[key];
              }
            }
          }
          return [];
        };

        let newTokensRaw: any[] = [];
        let bondTokensRaw: any[] = [];
        let gradTokensRaw: any[] = [];

        try { if (newRes.ok) newTokensRaw = extractTokens(await newRes.json()); else await newRes.text(); } catch {}
        try { if (bondRes.ok) bondTokensRaw = extractTokens(await bondRes.json()); else await bondRes.text(); } catch {}
        try { if (gradRes.ok) gradTokensRaw = extractTokens(await gradRes.json()); else await gradRes.text(); } catch {}

        const allTokensMap = new Map<string, any>();
        const getAddr = (t: any) => t.tokenAddress || t.address || t.mint || t.token_address || t.contractAddress || "";
        const tagStage = (tokens: any[], stage: string) => {
          for (const t of tokens) {
            const addr = getAddr(t);
            if (addr && !allTokensMap.has(addr)) allTokensMap.set(addr, { ...t, _stage: stage });
          }
        };
        tagStage(newTokensRaw, "new");
        tagStage(bondTokensRaw, "bonding");
        tagStage(gradTokensRaw, "graduated");

        const allTokens = [...allTokensMap.values()].slice(0, 60);
        stats.tokens = allTokens.length;
        stats.new_tokens = newTokensRaw.length;
        stats.bonding_tokens = bondTokensRaw.length;
        stats.graduated_tokens = gradTokensRaw.length;
        send("progress", { step: 3, label: "Fetching Pump.fun tokens via Moralis", status: "done", detail: `${stats.tokens} unique tokens (${stats.new_tokens} new, ${stats.bonding_tokens} bonding, ${stats.graduated_tokens} graduated)` });

        // ── STEP 4: DexScreener enrichment ──────────────────────────
        const addresses = allTokens.map(getAddr).filter(Boolean).slice(0, 30);
        send("progress", { step: 4, label: "DexScreener performance validation", status: "running", detail: `Enriching ${addresses.length} tokens...` });

        const enriched: any[] = [];
        for (let i = 0; i < addresses.length; i++) {
          try {
            const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addresses[i]}`);
            if (dexRes.ok) {
              const dexData = await dexRes.json();
              if (dexData.pairs?.length > 0) {
                const p = dexData.pairs[0];
                enriched.push({
                  tokenAddress: addresses[i],
                  baseToken: p.baseToken,
                  priceUsd: p.priceUsd,
                  volume24h: p.volume?.h24 ?? 0,
                  liquidity: p.liquidity?.usd ?? 0,
                  txns24h_buys: p.txns?.h24?.buys ?? 0,
                  txns24h_sells: p.txns?.h24?.sells ?? 0,
                  priceChange5m: p.priceChange?.m5 ?? 0,
                  priceChange1h: p.priceChange?.h1 ?? 0,
                  priceChange6h: p.priceChange?.h6 ?? 0,
                  priceChange24h: p.priceChange?.h24 ?? 0,
                  mcap: p.marketCap ?? 0,
                  pairAddress: p.pairAddress ?? "",
                  url: p.url,
                  stage: allTokensMap.get(addresses[i])?._stage || "unknown",
                });
              }
            } else { await dexRes.text(); }
          } catch {}
          if ((i + 1) % 5 === 0) {
            send("progress", { step: 4, label: "DexScreener performance validation", status: "running", detail: `${i + 1}/${addresses.length} enriched (${enriched.length} with live pairs)` });
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        stats.enriched = enriched.length;
        send("progress", { step: 4, label: "DexScreener performance validation", status: "done", detail: `${enriched.length} tokens validated with on-chain metrics` });

        // ── STEP 5: Match tweets to tokens ───────────────────────────
        send("progress", { step: 5, label: "Cross-referencing tweets ↔ tokens", status: "running", detail: "Clustering narratives..." });

        const matched = enriched.map((tok) => {
          const name = (tok.baseToken?.name || "").toLowerCase();
          const sym = (tok.baseToken?.symbol || "").toLowerCase();
          const addr = tok.tokenAddress || "";
          const matchedTweets = tweets.filter((tw: any) => {
            const txt = (tw.full_text || tw.text || "").toLowerCase();
            return (name.length > 2 && txt.includes(name)) || (sym.length > 1 && txt.includes(sym)) || txt.includes(addr.slice(0, 12));
          });
          const getLikes = (tw: any) => tw.favorite_count || tw.likeCount || 0;
          const getRTs = (tw: any) => tw.retweet_count || tw.retweetCount || 0;
          const getUser = (tw: any) => tw.user?.screen_name || tw.author?.userName || "unknown";
          const getTweetUrl = (tw: any) => tw.url || (tw.id ? `https://x.com/i/status/${tw.id}` : "");
          const getProfilePic = (tw: any) => tw.user?.profile_image_url_https || "";
          const getMediaUrl = (tw: any) => tw.media_url || "";
          return {
            token: tok,
            matched_tweets: matchedTweets.slice(0, 8).map((tw: any) => ({
              text: (tw.full_text || tw.text || "").slice(0, 280),
              user: getUser(tw),
              favorites: getLikes(tw),
              retweets: getRTs(tw),
              url: getTweetUrl(tw),
              profile_pic: getProfilePic(tw),
              media_url: getMediaUrl(tw),
            })),
            tweet_velocity: matchedTweets.length,
            total_engagement: matchedTweets.reduce((sum: number, tw: any) => sum + getLikes(tw) + getRTs(tw), 0),
          };
        }).sort((a, b) => b.total_engagement - a.total_engagement || b.tweet_velocity - a.tweet_velocity);

        stats.matches = matched.filter(m => m.tweet_velocity > 0).length;
        send("progress", { step: 5, label: "Cross-referencing tweets ↔ tokens", status: "done", detail: `${stats.matches} token-tweet narrative clusters identified` });

        // ── STEP 6: Lovable AI Chain-of-Thought analysis ────
        send("progress", { step: 6, label: "Cortex reasoning engine (Lovable AI)", status: "running", detail: "Running Chain-of-Thought narrative analysis..." });

        const top15 = matched.slice(0, 15);
        // Build a lookup of all scraped tweets with media for post-processing
        const allTweetsWithMedia = tweets.filter((tw: any) => tw.media_url);
        const topSummary = top15.map((m, i) => {
          const mediaTweets = m.matched_tweets.filter((tw: any) => tw.media_url).map((tw: any) => tw.media_url).slice(0, 2);
          return `${i + 1}. ${m.token.baseToken?.symbol || "?"} (${m.token.baseToken?.name || "?"}) | Stage: ${m.token.stage} | MCAP: $${m.token.mcap} | Vol24h: $${m.token.volume24h} | Liq: $${m.token.liquidity} | Δ5m: ${m.token.priceChange5m}% | Δ1h: ${m.token.priceChange1h}% | Δ6h: ${m.token.priceChange6h}% | Δ24h: ${m.token.priceChange24h}% | Buys: ${m.token.txns24h_buys} | Sells: ${m.token.txns24h_sells} | Tweets: ${m.tweet_velocity} | Engagement: ${m.total_engagement} | Top tweet: "${m.matched_tweets[0]?.text?.slice(0, 120) || 'none'}"${mediaTweets.length ? ` | Media: ${mediaTweets.join(', ')}` : ''}`;
        }).join("\n");

        const tweetThemes = tweets.slice(0, 50).map((tw: any) => (tw.full_text || tw.text || "").slice(0, 200)).join("\n---\n");

        const systemPrompt = `You are Cortex — a senior data analyst specializing in Solana memecoin narratives on Pump.fun.

YOUR MISSION: Analyze LIVE Solana data from the last 24 hours and produce a deployment-ready analyst report. Each narrative you identify must be cross-referenced against real, live token data from Pump.fun/DexScreener to validate it's actually trending RIGHT NOW on Solana.

CRITICAL: Only use data from TODAY. Every recommendation must be backed by:
1. Live on-chain Solana data (Pump.fun tokens, DexScreener metrics)
2. Real X/Twitter posts from the last 24 hours proving the narrative exists
3. A clear 1-10 NARRATIVE RATING with specific justification

NARRATIVE RATING (1-10):
- 10: Untokenized viral narrative exploding on CT right now. Zero competition. Massive engagement. Deploy immediately.
- 8-9: Strong emerging narrative with proven engagement. 1-2 early tokens but clear room for a better deploy.
- 6-7: Solid theme, moderate engagement, some competition but still has a window.
- 4-5: Narrative exists but crowding fast or engagement plateauing.
- 1-3: Dead/dying, too late, or too niche. Skip.

WHAT MAKES A 10/10 NARRATIVE:
- A cultural moment (celebrity tweet, breaking news, viral meme) that crypto Twitter noticed but hasn't fully tokenized
- High tweet velocity + engagement with few or no matching tokens on Pump.fun
- Broad enough that a well-named token captures the whole theme
- Timing: 1-4 hour window before the narrative gets flooded

DEPLOYMENT FIELDS (for each narrative, provide Pump.fun-ready fields):
- Name: The token name you'd use on Pump.fun
- Symbol: The ticker (3-5 chars, all caps)
- Description: A short Pump.fun description (1-2 sentences, catchy, memetic)
- Twitter/X: The source tweet URL proving this narrative
- Website: Suggested website name if applicable (optional)

PAST WINNING PATTERNS:
${memory.past_wins.length > 0 ? memory.past_wins.slice(-10).join("\n") : "No history yet — first cycle."}

Return ONLY valid JSON (no markdown, no backticks):
{
  "chain_of_thought": "Step-by-step reasoning analyzing today's Solana landscape, what's trending, what's missing",
  "top_narratives": [
    {
      "name": "Pump.fun token name",
      "symbol": "TICKER",
      "description": "Pump.fun token description — catchy, memetic, 1-2 sentences",
      "narrative_rating": 9,
      "rating_justification": "Specific data-backed reason for this exact rating — cite tweet engagement numbers, token counts, timing",
      "tweet_sources": [
        {"user": "@handle", "text": "exact tweet text proving narrative", "url": "https://x.com/...", "engagement": "5.2K likes, 1.1K RTs", "media_url": "image URL from tweet if available"}
      ],
      "on_chain_evidence": "What the DexScreener/Moralis data shows — existing tokens in this niche, their volume, whether they're pumping or dumping",
      "competition": "None / 1-2 early tokens / Crowded",
      "deploy_window": "NOW / 1-2h / 2-4h / Closing",
      "risk": "One sentence on what could kill this narrative",
      "website": "optional suggested website",
      "twitter_source_url": "primary tweet URL"
    }
  ],
  "new_search_terms": ["3 evolved X search queries for next cycle"],
  "reasoning_summary": "2-3 sentence analyst brief: today's Solana narrative landscape + top pick with rating justification"
}`;

        const userMsg = `CYCLE: ${new Date().toISOString()}
SCRAPED: ${stats.tweets} tweets | ${stats.tokens} tokens (${stats.new_tokens} new, ${stats.bonding_tokens} bonding, ${stats.graduated_tokens} graduated) | ${stats.enriched} enriched | ${stats.matches} clusters

=== EXISTING TOKENS ON PUMP.FUN (DO NOT RECOMMEND THESE — find narratives BEYOND these) ===
${topSummary || "No existing tokens matched tweets"}

=== RAW CT CHATTER (find untokenized narratives hiding in here) ===
${tweetThemes.slice(0, 3000) || "No tweets"}

Warren is about to wake up. Find the narratives he should bundle-deploy FIRST. Score them 1-10. Include the X post sources. Be ruthless.`;

        let aiResult: any = null;
        let reasoning = "No AI analysis available";
        try {
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              temperature: 0.3,
              max_tokens: 4000,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMsg },
              ],
            }),
            signal: AbortSignal.timeout(120_000),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content || "";
            console.log(`AI response length: ${content.length}`);
            try {
              const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
              const jsonStart = cleaned.indexOf("{");
              const jsonEnd = cleaned.lastIndexOf("}");
              if (jsonStart >= 0 && jsonEnd > jsonStart) {
                aiResult = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
                reasoning = aiResult.reasoning_summary || aiResult.chain_of_thought?.slice(0, 500) || content.slice(0, 500);
              } else {
                reasoning = content.slice(0, 500);
              }
            } catch (parseErr: any) {
              reasoning = content.slice(0, 500) || reasoning;
              console.log(`AI JSON parse error: ${parseErr.message}`);
            }
          } else {
            const errBody = await aiRes.text().catch(() => "");
            console.log(`AI gateway failed: ${aiRes.status} — ${errBody.slice(0, 300)}`);
            if (aiRes.status === 429) reasoning = "Rate limited — try again shortly";
            if (aiRes.status === 402) reasoning = "Credits exhausted — add funds in Lovable settings";
          }
        } catch { /* timeout */ }

        send("progress", { step: 6, label: "Cortex reasoning engine (Lovable AI)", status: "done", detail: aiResult ? `Identified ${aiResult.top_narratives?.length || 0} top narratives` : "Analysis complete (raw)" });

        // ── STEP 7: Self-evolution — update memory ──────────────────
        send("progress", { step: 7, label: "Self-evolution — updating memory", status: "running", detail: "Saving new search terms + winning patterns..." });

        if (aiResult?.new_search_terms?.length) {
          memory.search_terms = aiResult.new_search_terms.slice(0, 5);
        }
        if (aiResult?.top_narratives?.length) {
          const wins = aiResult.top_narratives
            .filter((n: any) => (n.narrative_rating ?? n.bundle_score ?? 0) >= 7)
            .map((n: any) => `[${new Date().toISOString().split("T")[0]}] ${n.name} ($${n.symbol || '?'}) (${n.narrative_rating ?? n.bundle_score}/10) — ${(n.rating_justification || n.why_bundle || '').slice(0, 100)}`);
          memory.past_wins = [...memory.past_wins, ...wins].slice(-30);
        }
        memory.last_cycle = new Date().toISOString();

        const { data: existing } = await supabase
          .from("site_configs")
          .select("id")
          .eq("site_id", MEMORY_SITE_ID)
          .eq("section", MEMORY_SECTION)
          .maybeSingle();

        if (existing) {
          await supabase.from("site_configs").update({ content: memory as any, updated_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
          await supabase.from("site_configs").insert({ site_id: MEMORY_SITE_ID, section: MEMORY_SECTION, content: memory as any, is_published: false });
        }

        send("progress", { step: 7, label: "Self-evolution — updating memory", status: "done", detail: `Saved ${memory.search_terms.length} evolved queries + ${memory.past_wins.length} past wins` });

        // ── STEP 8: Push findings ───────────────────────────────────
        send("progress", { step: 8, label: "Saving findings to database", status: "running", detail: "Pushing cycle report + token findings..." });

        const cycleTitle = `🧠 Cortex Cycle — ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
        await pushFinding(
          cycleTitle,
          reasoning,
          "",
          "trend",
          { ...stats, reasoning, top_narratives: aiResult?.top_narratives || [], chain_of_thought: aiResult?.chain_of_thought || "" },
          ["cortex", "narrative", "cycle-report"]
        );

        // Post-process: if no tweets were actually scraped, strip AI-hallucinated tweet_sources
        const hadRealTweets = tweets.length > 0;
        const narrativesToPost = (aiResult?.top_narratives?.slice(0, 8) || []).map((n: any) => {
          if (!hadRealTweets) {
            // No real tweets scraped — remove all fake sources the AI hallucinated
            n.tweet_sources = [];
            n.twitter_source_url = "";
            n.media_url = "";
            return n;
          }
          if (n.tweet_sources?.length) {
            const usedTweetIds = new Set<string>();
            n.tweet_sources = n.tweet_sources.map((src: any) => {
              // Try to find matching scraped tweet by username or text overlap
              let scraped = tweets.find((tw: any) => {
                if (usedTweetIds.has(tw.id)) return false;
                const screen = tw.user?.screen_name || "";
                const srcUser = (src.user || "").replace("@", "");
                if (screen && srcUser && screen.toLowerCase() === srcUser.toLowerCase()) return true;
                const twText = (tw.full_text || tw.text || "").toLowerCase();
                const srcText = (src.text || "").toLowerCase().slice(0, 40);
                return srcText.length > 10 && twText.includes(srcText);
              });
              // Fallback: find ANY unused scraped tweet from the same narrative cluster
              if (!scraped) {
                const clusterMatch = matched.find(m => {
                  const sym = (m.token.baseToken?.symbol || "").toLowerCase();
                  return sym && (n.symbol || "").toLowerCase() === sym;
                });
                if (clusterMatch) {
                  scraped = clusterMatch.matched_tweets.find((tw: any) => tw.id && !usedTweetIds.has(tw.id));
                }
              }
              // Last resort: grab any unused scraped tweet
              if (!scraped) {
                scraped = tweets.find((tw: any) => tw.id && tw.user?.screen_name && !usedTweetIds.has(tw.id));
              }
              if (scraped?.id && scraped?.user?.screen_name) {
                usedTweetIds.add(scraped.id);
                src = { ...src, url: `https://x.com/${scraped.user.screen_name}/status/${scraped.id}`, user: `@${scraped.user.screen_name}` };
                if (scraped.text || scraped.full_text) {
                  src = { ...src, text: scraped.full_text || scraped.text };
                }
                const likes = scraped.favorite_count || 0;
                const rts = scraped.retweet_count || 0;
                if (likes || rts) {
                  src = { ...src, engagement: `${likes >= 1000 ? (likes/1000).toFixed(1) + 'K' : likes} likes, ${rts >= 1000 ? (rts/1000).toFixed(1) + 'K' : rts} RTs` };
                }
              }
              if (!src.media_url && scraped?.media_url) {
                src = { ...src, media_url: scraped.media_url };
              }
              return src;
            });
            // Only keep sources that matched a real scraped tweet (have a real x.com status URL)
            n.tweet_sources = n.tweet_sources.filter((s: any) => s.url && s.url.includes("x.com/") && s.url.includes("/status/"));
            if (!n.media_url) {
              n.media_url = n.tweet_sources.find((s: any) => s.media_url)?.media_url || "";
            }
          }
          // Override twitter_source_url with real URL from tweet_sources if available
          if (n.tweet_sources?.length) {
            const realUrl = n.tweet_sources.find((s: any) => s.url && s.url.includes("x.com/") && s.url.includes("/status/"))?.url;
            if (realUrl) n.twitter_source_url = realUrl;
          } else {
            n.twitter_source_url = "";
          }
          return n;
        });
        for (const n of narrativesToPost) {
          const rating = n.narrative_rating ?? n.bundle_score ?? 0;
          const sources = n.tweet_sources?.map((s: any) => s.url).filter(Boolean) || [];
          await pushFinding(
            `📊 ${n.name} ($${n.symbol || '?'}) — ${rating}/10`,
            `${n.rating_justification || n.why_bundle || n.description || ''} | Window: ${n.deploy_window} | Competition: ${n.competition}`,
            n.twitter_source_url || sources[0] || "",
            "trend",
            { ...n, type: "narrative_report" },
            ["cortex", "narrative", `rating-${rating}`, n.symbol?.toLowerCase()].filter(Boolean) as string[]
          );
        }

        stats.findings_pushed = 1 + narrativesToPost.length;
        send("progress", { step: 8, label: "Saving findings to database", status: "done", detail: `Pushed 1 cycle report + ${narrativesToPost.length} narrative findings` });

        // ── Send final result ───────────────────────────────────────
        const topTweets = matched
          .flatMap(m => m.matched_tweets.map((tw: any) => ({ ...tw, token_symbol: m.token.baseToken?.symbol || "?" })))
          .sort((a: any, b: any) => (b.favorites + b.retweets) - (a.favorites + a.retweets))
          .slice(0, 12);

        await send("complete", {
          success: true,
          stats,
          top_narratives: aiResult?.top_narratives || [],
          reasoning: reasoning.slice(0, 800),
          chain_of_thought: aiResult?.chain_of_thought?.slice(0, 1000) || "",
          evolved_queries: memory.search_terms,
          top_tweets: topTweets,
        });
      } catch (err: any) {
        await send("error", { message: err.message || "Unknown error" });
      } finally {
        try { await writer.close(); } catch { /* already closed */ }
      }
  })();

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
