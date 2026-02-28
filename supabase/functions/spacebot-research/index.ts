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
  const res = await fetch("https://api.x.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`X OAuth2 token failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

/** Search recent tweets via X API v2 */
async function searchTweets(bearer: string, query: string, maxResults = 100): Promise<any[]> {
  // X free tier only returns tweets from the last 7 days; restrict to 24h for freshness
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(maxResults, 100)),
    start_time: since,
    "tweet.fields": "public_metrics,created_at,author_id,entities",
    expansions: "author_id",
    "user.fields": "username,profile_image_url",
  });
  const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.log(`X search failed (${res.status}): ${err.slice(0, 200)}`);
    return [];
  }
  const json = await res.json();
  // Map users by author_id for easy lookup
  const usersMap = new Map<string, any>();
  for (const u of json.includes?.users || []) {
    usersMap.set(u.id, u);
  }
  return (json.data || []).map((tw: any) => {
    const user = usersMap.get(tw.author_id) || {};
    return {
      id: tw.id,
      text: tw.text,
      full_text: tw.text,
      user: { screen_name: user.username || "", profile_image_url_https: user.profile_image_url || "" },
      favorite_count: tw.public_metrics?.like_count || 0,
      retweet_count: tw.public_metrics?.retweet_count || 0,
      created_at: tw.created_at,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TWITTER_CLIENT_ID = Deno.env.get("TWITTER_CLIENT_ID");
  const TWITTER_CLIENT_SECRET = Deno.env.get("TWITTER_CLIENT_SECRET");
  const MORALIS_API_KEY = Deno.env.get("MORALIS_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET || !MORALIS_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing API keys (TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, MORALIS_API_KEY)" }),
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
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

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

        // ── STEP 1: Authenticate with X API via OAuth 2.0 ────────────
        send("progress", { step: 1, label: "Authenticating with X API (OAuth 2.0)", status: "running", detail: "Getting bearer token via Client Credentials..." });

        let xBearer: string;
        try {
          xBearer = await getXBearerToken(TWITTER_CLIENT_ID!, TWITTER_CLIENT_SECRET!);
        } catch (e: any) {
          send("progress", { step: 1, label: "Authenticating with X API (OAuth 2.0)", status: "error", detail: e.message });
          send("error", { message: `X OAuth2 auth failed: ${e.message}` });
          controller.close();
          return;
        }
        send("progress", { step: 1, label: "Authenticating with X API (OAuth 2.0)", status: "done", detail: "Bearer token acquired ✓" });

        // ── STEP 2: Search tweets via X API v2 ──────────────────────
        send("progress", { step: 2, label: "Searching X/Twitter via API v2", status: "running", detail: `Sending ${memory.search_terms.length} search queries...` });

        let tweets: any[] = [];
        for (const query of memory.search_terms) {
          try {
            const results = await searchTweets(xBearer, query, 100);
            tweets.push(...results);
          } catch (e: any) {
            console.log(`Search query failed: ${e.message}`);
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
        send("progress", { step: 2, label: "Searching X/Twitter via API v2", status: "done", detail: `Found ${tweets.length} unique tweets from X` });

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
          return {
            token: tok,
            matched_tweets: matchedTweets.slice(0, 8).map((tw: any) => ({
              text: (tw.full_text || tw.text || "").slice(0, 280),
              user: getUser(tw),
              favorites: getLikes(tw),
              retweets: getRTs(tw),
              url: getTweetUrl(tw),
              profile_pic: getProfilePic(tw),
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
        const topSummary = top15.map((m, i) =>
          `${i + 1}. ${m.token.baseToken?.symbol || "?"} (${m.token.baseToken?.name || "?"}) | Stage: ${m.token.stage} | MCAP: $${m.token.mcap} | Vol24h: $${m.token.volume24h} | Liq: $${m.token.liquidity} | Δ5m: ${m.token.priceChange5m}% | Δ1h: ${m.token.priceChange1h}% | Δ6h: ${m.token.priceChange6h}% | Δ24h: ${m.token.priceChange24h}% | Buys: ${m.token.txns24h_buys} | Sells: ${m.token.txns24h_sells} | Tweets: ${m.tweet_velocity} | Engagement: ${m.total_engagement} | Top tweet: "${m.matched_tweets[0]?.text?.slice(0, 120) || 'none'}"`
        ).join("\n");

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
        {"user": "@handle", "text": "exact tweet text proving narrative", "url": "https://x.com/...", "engagement": "5.2K likes, 1.1K RTs"}
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

        const narrativesToPost = aiResult?.top_narratives?.slice(0, 8) || [];
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

        send("complete", {
          success: true,
          stats,
          top_narratives: aiResult?.top_narratives || [],
          reasoning: reasoning.slice(0, 800),
          chain_of_thought: aiResult?.chain_of_thought?.slice(0, 1000) || "",
          evolved_queries: memory.search_terms,
          top_tweets: topTweets,
        });
      } catch (err: any) {
        send("error", { message: err.message || "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
