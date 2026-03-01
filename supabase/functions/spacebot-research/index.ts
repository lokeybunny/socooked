import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEMORY_SITE_ID = "cortex-agent";
const MEMORY_SECTION = "search-memory";

// ── TIER THRESHOLDS ──
type Tier = "S" | "A" | "B" | null;

function getTweetTier(tw: { favorite_count: number; retweet_count: number; reply_count?: number }): Tier {
  const faves = tw.favorite_count || 0;
  const rts = tw.retweet_count || 0;
  const replies = tw.reply_count || 0;
  if (faves >= 2000 || replies >= 500 || rts >= 300) return "S";
  if (faves >= 800 && replies >= 150) return "A";
  if (faves >= 300) return "B";
  return null;
}

/** Check if content is within given hours (default 24) */
function isWithinHours(dateStr: string, hours = 24): boolean {
  if (!dateStr) return false;
  const created = new Date(dateStr).getTime();
  if (isNaN(created)) return false;
  return (Date.now() - created) < hours * 60 * 60 * 1000;
}

/** Retry helper — retries fn up to maxRetries times with exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.log(`${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
      console.log(`${label}: retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`${label} exhausted all retries`);
}

/** Scrape tweets via Apify Tweet Scraper V2 (apidojo/tweet-scraper) */
async function scrapeTweetsViaApify(apifyToken: string, searchTerms: string[], maxItems = 200): Promise<any[]> {
  return withRetry(async () => {
    const actorId = "apidojo~tweet-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const termsWithDate = searchTerms.map(q => {
      if (q.includes("since:")) return q;
      return `${q} since:${yesterday}`;
    });

    const input = {
      searchTerms: termsWithDate,
      maxItems,
      sort: "Latest",
      tweetLanguage: "en",
      includeSearchTerms: true,
    };

    console.log(`Apify: starting Tweet Scraper V2 with ${termsWithDate.length} queries, maxItems=${maxItems}`);
    const res = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.log(`Apify run failed (${res.status}): ${err.slice(0, 300)}`);
      throw new Error(`Apify request failed (${res.status})`);
    }

    const items: any[] = await res.json();
    console.log(`Apify: received ${items.length} tweet items`);

  return items
    .filter((item: any) => item.type === "tweet" && item.id)
    .map((tw: any) => {
      let media_url = "";
      if (tw.extendedEntities?.media?.length) {
        const img = tw.extendedEntities.media.find((m: any) => m.type === "photo");
        if (img) media_url = img.media_url_https || img.media_url || "";
        if (!media_url) {
          const vid = tw.extendedEntities.media.find((m: any) => m.type === "video" || m.type === "animated_gif");
          if (vid) media_url = vid.media_url_https || vid.media_url || vid.video_info?.variants?.[0]?.url || "";
        }
      }
      if (!media_url && tw.entities?.media?.length) {
        media_url = tw.entities.media[0].media_url_https || tw.entities.media[0].media_url || "";
      }
      // Detect gold/verified check
      const isBlueVerified = !!(tw.author?.isBlueVerified || tw.isBlueVerified);
      // Gold check = explicitly a business account (verifiedType === "Business") only
      const isGoldCheck = !!(tw.author?.verifiedType === "Business");
      return {
        id: tw.id,
        text: tw.text || tw.full_text || "",
        full_text: tw.text || tw.full_text || "",
        user: {
          screen_name: tw.author?.userName || "",
          profile_image_url_https: tw.author?.profilePicture || "",
        },
        favorite_count: tw.likeCount || 0,
        retweet_count: tw.retweetCount || 0,
        reply_count: tw.replyCount || 0,
        created_at: tw.createdAt || "",
        media_url,
        url: tw.url || `https://x.com/${tw.author?.userName || "i"}/status/${tw.id}`,
        is_blue_verified: isBlueVerified,
        gold_check: isGoldCheck,
      };
    });
  }, "Apify-Tweets", 3);
}



/** STRICT 24-HOUR VIRAL FILTER for Tweets */
function applyStrictTweetFilter(tweets: any[]): any[] {
  return tweets.filter((tw) => {
    // AGE FILTER
    if (!isWithinHours(tw.created_at, 24)) return false;
    // VIRALITY THRESHOLD
    const tier = getTweetTier(tw);
    if (!tier) return false;
    return true;
  });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const MORALIS_API_KEY = Deno.env.get("MORALIS_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!APIFY_TOKEN || !MORALIS_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing API keys (need APIFY_TOKEN + MORALIS_API_KEY)" }),
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

  // Parse request body for source selection
  let sources: string[] = ["x"]; // default: X only
  try {
    const body = await req.json();
    if (body?.sources?.length) sources = body.sources;
  } catch { /* no body = X */ }
  const runX = sources.includes("x");

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = async (event: string, data: Record<string, unknown>) => {
    try {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch { /* stream closed */ }
  };

  (async () => {
      const pushFinding = async (
        title: string, summary: string, sourceUrl: string,
        findingType: string, rawData: Record<string, unknown>, tags: string[]
      ) => {
        // Dedup: skip if a finding with same symbol OR same name already exists (for narrative reports)
        const symbol = (rawData as any)?.symbol;
        const narrativeName = (rawData as any)?.name;
        if ((rawData as any)?.type === "narrative_report") {
          // Check by symbol
          if (symbol) {
            const { data: existing } = await supabase
              .from("research_findings")
              .select("id")
              .eq("category", "x")
              .neq("status", "drafted")
              .contains("raw_data", { symbol })
              .limit(1);
            if (existing && existing.length > 0) {
              console.log(`Dedup: skipping duplicate X finding for symbol ${symbol}`);
              return;
            }
          }
          // Check by name (catches symbol variations like $TICKER vs TICKER)
          if (narrativeName) {
            const { data: existing2 } = await supabase
              .from("research_findings")
              .select("id")
              .eq("category", "x")
              .neq("status", "drafted")
              .contains("raw_data", { name: narrativeName })
              .limit(1);
            if (existing2 && existing2.length > 0) {
              console.log(`Dedup: skipping duplicate X finding for name ${narrativeName}`);
              return;
            }
          }
          // Check by media_url / thumbnail to catch visually identical posts
          const mediaUrl = (rawData as any)?.media_url || (rawData as any)?.tweet_sources?.[0]?.media_url;
          if (mediaUrl) {
            const { data: existing3 } = await supabase
              .from("research_findings")
              .select("id")
              .eq("category", "x")
              .neq("status", "drafted")
              .contains("raw_data", { media_url: mediaUrl })
              .limit(1);
            if (existing3 && existing3.length > 0) {
              console.log(`Dedup: skipping duplicate X finding with same media_url`);
              return;
            }
          }
        }
        // Dedup: skip cycle reports if one already exists in the last hour
        if (findingType === "trend" && tags.includes("cycle-report")) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: recentCycle } = await supabase
            .from("research_findings")
            .select("id")
            .eq("category", "x")
            .eq("finding_type", "trend")
            .gte("created_at", oneHourAgo)
            .contains("tags", ["cycle-report"])
            .limit(1);
          if (recentCycle && recentCycle.length > 0) {
            console.log("Dedup: skipping duplicate cycle report (one exists in last hour)");
            return;
          }
        }

        await supabase.from("research_findings").insert({
          title, summary, source_url: sourceUrl, finding_type: findingType,
          category: "x", status: "new", created_by: "cortex",
          raw_data: rawData, tags,
        });
      };

      try {
        const stats: Record<string, number> = {};

        // ── STEP 0: Load persistent memory ───
        send("progress", { step: 0, label: "Loading NarrativeEdge memory", status: "running", detail: "Reading persistent search terms & past winning narratives..." });

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

        send("progress", { step: 0, label: "Loading NarrativeEdge memory", status: "done", detail: `Loaded ${memory.search_terms.length} X queries, ${memory.past_wins.length} past wins` });

        // ── STEP 1: Scrape X/Twitter ──
        if (runX) send("progress", { step: 1, label: "Scraping X/Twitter via Apify (apidojo/tweet-scraper)", status: "running", detail: `Launching with ${memory.search_terms.length} queries + auto since:24h...` });

        let tweets: any[] = [];
        let apifyError = false;

        if (runX) {
          try {
            tweets = await scrapeTweetsViaApify(APIFY_TOKEN!, memory.search_terms, 300);
            send("progress", { step: 1, label: "Scraping X/Twitter via Apify", status: "done", detail: `✓ ${tweets.length} tweets scraped (with retry)` });
          } catch (err: any) {
            apifyError = true;
            console.log(`Apify tweet scrape failed after retries: ${err.message}`);
            send("progress", { step: 1, label: "Scraping X/Twitter via Apify", status: "error", detail: `✗ Failed after 3 retries: ${err.message}` });
          }
        }

        // ABORT if scraper failed — can't generate without data
        if (apifyError) {
          send("error", { message: "Apify scraper failed after 3 retries. Cannot generate without data. Try again later." });
          await writer.close();
          return;
        }

        // Deduplicate tweets by id
        const seenIds = new Set<string>();
        tweets = tweets.filter(tw => {
          if (!tw.id || seenIds.has(tw.id)) return false;
          seenIds.add(tw.id);
          return true;
        });
        stats.tweets_raw = tweets.length;

        // ── APPLY STRICT 24-HOUR FILTERS ──
        send("progress", { step: 1.7, label: "Applying STRICT 24h viral filters", status: "running", detail: "Enforcing age, virality tiers..." });

        const filteredTweets = applyStrictTweetFilter(tweets);
        stats.tweets_filtered = filteredTweets.length;
        stats.tweets_discarded = tweets.length - filteredTweets.length;

        const tieredTweets = filteredTweets.map(tw => ({
          ...tw,
          tier: getTweetTier(tw),
        })).sort((a, b) => {
          const tierOrder = { S: 0, A: 1, B: 2 };
          const ta = tierOrder[a.tier as keyof typeof tierOrder] ?? 3;
          const tb = tierOrder[b.tier as keyof typeof tierOrder] ?? 3;
          if (ta !== tb) return ta - tb;
          return (b.favorite_count + b.retweet_count) - (a.favorite_count + a.retweet_count);
        });

        tweets = tieredTweets;
        stats.tweets = tweets.length;

        const tweetTierCounts = { S: 0, A: 0, B: 0 };
        tweets.forEach((tw: any) => { if (tw.tier) tweetTierCounts[tw.tier as keyof typeof tweetTierCounts]++; });

        send("progress", { step: 1.7, label: "Applying STRICT 24h viral filters", status: "done",
          detail: `X: ${stats.tweets_raw}→${stats.tweets} passed (S:${tweetTierCounts.S} A:${tweetTierCounts.A} B:${tweetTierCounts.B})` });

        if (tweets.length === 0) {
          console.log("Apify returned 0 qualifying tweets in last 24h — no viral content matching filters.");
        }

        // ── STEP 2 ──
        send("progress", { step: 2, label: "Source deduplication & normalization", status: "done", detail: `${tweets.length} tweets ready` });

        // ── STEP 3: Moralis Pump.fun tokens ──
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

        // ── STEP 4: DexScreener enrichment ──
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
                  pairCreatedAt: p.pairCreatedAt || "",
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

        // ── STEP 5: Cross-reference ──
        send("progress", { step: 5, label: "Cross-referencing X ↔ tokens", status: "running", detail: "Matching tweets to tokens..." });

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
              tier: tw.tier,
            })),
            tweet_velocity: matchedTweets.length,
            total_engagement: matchedTweets.reduce((sum: number, tw: any) => sum + getLikes(tw) + getRTs(tw), 0),
          };
        }).sort((a, b) => b.total_engagement - a.total_engagement || b.tweet_velocity - a.tweet_velocity);

        stats.matches = matched.filter(m => m.tweet_velocity > 0).length;
        send("progress", { step: 5, label: "Cross-referencing X ↔ tokens", status: "done", detail: `${stats.matches} token-tweet clusters found` });

        // ── STEP 6: NarrativeEdge AI analysis ──
        send("progress", { step: 6, label: "NarrativeEdge AI (Lovable AI)", status: "running", detail: "Running ruthless narrative classification with strict 24h data..." });

        const top15 = matched.slice(0, 15);
        const topSummary = top15.map((m, i) => {
          return `${i + 1}. ${m.token.baseToken?.symbol || "?"} (${m.token.baseToken?.name || "?"}) | Stage: ${m.token.stage} | MCAP: $${m.token.mcap} | Vol24h: $${m.token.volume24h} | Liq: $${m.token.liquidity} | Δ5m: ${m.token.priceChange5m}% | Δ1h: ${m.token.priceChange1h}% | Δ6h: ${m.token.priceChange6h}% | Δ24h: ${m.token.priceChange24h}% | Buys: ${m.token.txns24h_buys} | Sells: ${m.token.txns24h_sells} | Tweets: ${m.tweet_velocity} | Engagement: ${m.total_engagement} | Top tweet: "${m.matched_tweets[0]?.text?.slice(0, 120) || 'none'}" [${m.matched_tweets[0]?.tier || '-'}]`;
        }).join("\n");

        const tweetThemes = tweets.slice(0, 50).map((tw: any) => `[${tw.tier}] ${(tw.full_text || tw.text || "").slice(0, 200)}`).join("\n---\n");

        const systemPrompt = `You are NarrativeEdge AI — the cold, ruthless, self-evolving narrative sniper for a veteran pump.fun deployer. Your single goal: turn raw Apify tweets + Moralis new/bonding/graduated tokens + DexScreener enrichment into lethal, categorized narrative clusters that print before normies even wake up.

STRICT RULES ENFORCED THIS CYCLE:
- ALL data has been pre-filtered to ≤24 HOURS OLD ONLY
- ALL tweets passed Tier S/A/B virality thresholds (S: 2K+ faves, A: 800+ faves, B: 300+ faves)

MANDATORY CATEGORIES (classify EVERY cluster):
1. Justice/Tragedy — animal death, human death, political assassination, "put down", injustice outrage
2. Exchange Tribute — Coinbase listing, Binance, Raydium, any CEX news
3. Celebrity/Endorsement — verified account launches or mentions personal coin
4. Political/Event-Driven — elections, Trump/Musk news, scandals
5. Absurd/Viral Humor — fart, goatseus, sigma, stunts, livestream meta
6. AI/Bot Narrative — Truth Terminal style, GOAT-style autonomous agents
7. Meta/Infrastructure — pump.fun itself, streamers, dev drama
8. Revenge/Drama — rug revenge, "dev rugged me", suicide stream copycats
9. Any new category you discover

PAST WINNING PATTERNS:
${memory.past_wins.length > 0 ? memory.past_wins.slice(-15).join("\n") : "No history yet — first cycle."}

Return ONLY valid JSON (no markdown, no backticks):
{
  "chain_of_thought": "Ruthless step-by-step reasoning. Include tier analysis.",
  "top_narratives": [
    {
      "narrative_type": "Justice/Tragedy",
      "source_platform": "x",
      "tier": "S" | "A" | "B",
      "name": "Pump.fun token name",
      "symbol": "TICKER",
      "description": "Pump.fun description — catchy, memetic, 1-2 sentences",
      "image_gen_prompt": "Grok Imagine prompt: cute sad [animal] justice PNUT style, cinematic, viral meme, Solana logo subtle",
      "narrative_rating": 9,
      "pump_potential": "Expected multiple from current MC",
      "trigger_tweets": [{"user": "@handle", "text": "tweet text", "url": "https://x.com/...", "engagement": "5.2K likes, 1.1K RTs", "velocity": "3K likes in 2h", "media_url": "", "tier": "S"}],
      "matched_tokens": [{"ca": "address", "name": "name", "symbol": "SYM", "mc": 15000, "age": "2h", "buy_sell_ratio": "3.2:1"}],
      "historical_comp": "Similar to PNUT squirrel justice — 92% hit 10x within 4h",
      "risk": "clean dev / obvious rug / sniped already",
      "action": "Deploy now | Buy bonding under 30k | Watch | Fade | Too late",
      "deploy_window": "NOW / 1-2h / 2-4h / Closing",
      "competition": "None / 1-2 early tokens / Crowded",
      "next_search_queries": ["3 refined queries"],
      "twitter_source_url": "primary tweet URL"
    }
  ],
  "new_search_terms": ["5 evolved X search queries"],
  "category_stats": {},
  "reasoning_summary": "2-3 sentence brief with tier breakdown"
}

RULES:
- Never moralize. Only "this prints" or "this is a slow rug".
- Tier S narratives MUST be rated 8+ automatically.
- image_gen_prompt MUST be Grok Imagine optimized.`;

        const userMsg = `CYCLE: ${new Date().toISOString()}
STRICT 24H FILTER ACTIVE — Only Tier S/A/B content shown below.

SCRAPED: ${stats.tweets} tweets (S:${tweetTierCounts.S} A:${tweetTierCounts.A} B:${tweetTierCounts.B}) | ${stats.tokens} tokens | ${stats.enriched} enriched | ${stats.matches} clusters

=== LIVE PUMP.FUN TOKENS ===
${topSummary || "No tokens matched"}

=== VIRAL X CHATTER (24h, Tier S/A/B only) ===
${tweetThemes.slice(0, 3000) || "No qualifying tweets"}

Classify. Rate. Include tiers. What prints RIGHT NOW?`;

        let aiResult: any = null;
        let reasoning = "No AI analysis available";
        try {
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              temperature: 0.3,
              max_tokens: 5000,
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

        send("progress", { step: 6, label: "NarrativeEdge AI (Lovable AI)", status: "done", detail: aiResult ? `Classified ${aiResult.top_narratives?.length || 0} narrative clusters` : "Analysis complete (raw)" });

        // ── STEP 7: Self-evolution ──
        send("progress", { step: 7, label: "NarrativeEdge memory evolution", status: "running", detail: "Saving evolved queries..." });

        if (aiResult?.new_search_terms?.length) {
          memory.search_terms = aiResult.new_search_terms.slice(0, 7);
        }
        if (aiResult?.top_narratives?.length) {
          const perNarrativeQueries = aiResult.top_narratives
            .flatMap((n: any) => n.next_search_queries || [])
            .filter(Boolean)
            .slice(0, 5);
          if (perNarrativeQueries.length) {
            const combined = [...new Set([...memory.search_terms, ...perNarrativeQueries])];
            memory.search_terms = combined.slice(0, 7);
          }
          const wins = aiResult.top_narratives
            .filter((n: any) => (n.narrative_rating ?? 0) >= 7)
            .map((n: any) => `[${new Date().toISOString().split("T")[0]}] [${n.narrative_type || 'Uncat'}] [${n.source_platform || 'x'}] [${n.tier || '?'}] ${n.name} ($${n.symbol || '?'}) (${n.narrative_rating}/10) — ${(n.action || n.pump_potential || '').slice(0, 80)}`);
          memory.past_wins = [...memory.past_wins, ...wins].slice(-40);
        }
        if (aiResult?.category_stats) {
          (memory as any).category_stats = aiResult.category_stats;
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

        send("progress", { step: 7, label: "NarrativeEdge memory evolution", status: "done", detail: `Saved ${memory.search_terms.length} X queries + ${memory.past_wins.length} past wins` });

        // ── STEP 8: Push findings ──
        send("progress", { step: 8, label: "Saving findings to database", status: "running", detail: "Pushing narrative findings..." });

        // No cycle report — narratives are added directly to the feed

        // Post-process narratives
        const hadRealTweets = tweets.length > 0;
        const narrativesToPost = (aiResult?.top_narratives?.slice(0, 10) || []).map((n: any) => {
          if (n.trigger_tweets?.length && !n.tweet_sources?.length) {
            n.tweet_sources = n.trigger_tweets;
          }
          if (!hadRealTweets) {
            n.tweet_sources = [];
            n.trigger_tweets = [];
            n.twitter_source_url = "";
            n.media_url = "";
          } else if (n.tweet_sources?.length) {
            const usedTweetIds = new Set<string>();
            n.tweet_sources = n.tweet_sources.map((src: any) => {
              let scraped = tweets.find((tw: any) => {
                if (usedTweetIds.has(tw.id)) return false;
                const screen = tw.user?.screen_name || "";
                const srcUser = (src.user || "").replace("@", "");
                if (screen && srcUser && screen.toLowerCase() === srcUser.toLowerCase()) return true;
                const twText = (tw.full_text || tw.text || "").toLowerCase();
                const srcText = (src.text || "").toLowerCase().slice(0, 40);
                return srcText.length > 10 && twText.includes(srcText);
              });
              if (!scraped) {
                const clusterMatch = matched.find(m => {
                  const sym = (m.token.baseToken?.symbol || "").toLowerCase();
                  return sym && (n.symbol || "").toLowerCase() === sym;
                });
                if (clusterMatch) {
                  scraped = clusterMatch.matched_tweets.find((tw: any) => tw.id && !usedTweetIds.has(tw.id));
                }
              }
              if (!scraped) {
                scraped = tweets.find((tw: any) => tw.id && tw.user?.screen_name && !usedTweetIds.has(tw.id));
              }
              if (scraped?.id && scraped?.user?.screen_name) {
                usedTweetIds.add(scraped.id);
                const tweetUrl = scraped.url || `https://x.com/${scraped.user.screen_name}/status/${scraped.id}`;
                src = { ...src, url: tweetUrl, user: `@${scraped.user.screen_name}`, tier: scraped.tier };
                if (scraped.text || scraped.full_text) {
                  src = { ...src, text: scraped.full_text || scraped.text };
                }
                const likes = scraped.favorite_count || 0;
                const rts = scraped.retweet_count || 0;
                if (likes || rts) {
                  src = { ...src, engagement: `${likes >= 1000 ? (likes/1000).toFixed(1) + 'K' : likes} likes, ${rts >= 1000 ? (rts/1000).toFixed(1) + 'K' : rts} RTs` };
                }
              }
              // Carry over gold check and media from scraped tweet
              if (scraped?.gold_check) src = { ...src, gold_check: true };
              if (scraped?.is_blue_verified) src = { ...src, is_blue_verified: true };
              if (!src.media_url && scraped?.media_url) {
                src = { ...src, media_url: scraped.media_url };
              }
              return src;
            });
            n.tweet_sources = n.tweet_sources.filter((s: any) => s.url && s.url.includes("x.com/") && s.url.includes("/status/"));
            if (!n.media_url) {
              n.media_url = n.tweet_sources.find((s: any) => s.media_url)?.media_url || "";
            }
          }
          if (n.tweet_sources?.length) {
            const realUrl = n.tweet_sources.find((s: any) => s.url && s.url.includes("x.com/") && s.url.includes("/status/"))?.url;
            if (realUrl) n.twitter_source_url = realUrl;
          } else if (hadRealTweets) {
            n.twitter_source_url = "";
          }
          return n;
        });

        for (const n of narrativesToPost) {
          const rating = n.narrative_rating ?? 0;
          const category = n.narrative_type || "Uncategorized";
          const platform = n.source_platform || "x";
          const tier = n.tier || "?";
          const platformBadge = "𝕏";
          const sources = n.trigger_tweets?.map((s: any) => s.url).filter(Boolean) || n.tweet_sources?.map((s: any) => s.url).filter(Boolean) || [];
          await pushFinding(
            `${platformBadge} [${tier}] [${category}] ${n.name} ($${n.symbol || '?'}) — ${rating}/10`,
            `${n.action || ''} | ${n.pump_potential || ''} | ${n.historical_comp || ''} | Risk: ${n.risk || '?'} | Window: ${n.deploy_window} | Competition: ${n.competition}`,
            n.twitter_source_url || sources[0] || "",
            "trend",
            { ...n, type: "narrative_report" },
            ["cortex", "narrative", `rating-${rating}`, `tier-${tier}`, `src-${platform}`, n.symbol?.toLowerCase()].filter(Boolean) as string[]
          );
        }

        stats.findings_pushed = narrativesToPost.length;
        send("progress", { step: 8, label: "Saving findings to database", status: "done", detail: `Added ${narrativesToPost.length} narratives to feed` });

        // ── Send final result ──
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
          
          tier_counts: { tweets: tweetTierCounts },
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
