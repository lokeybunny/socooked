import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEMORY_SITE_ID = "cortex-agent";
const MEMORY_SECTION = "search-memory";

// ── Animal/pet/justice keywords for TikTok filtering ──
const TIKTOK_ANIMAL_KEYWORDS = [
  "cat", "dog", "pet", "kitten", "puppy", "hamster", "rabbit", "bird", "parrot",
  "squirrel", "raccoon", "duck", "frog", "turtle", "fish", "monkey", "bear",
  "died", "death", "dead", "rip", "put down", "euthanize", "rescue", "saved",
  "justice", "abuse", "neglect", "missing", "found", "viral", "hero",
  "heartbreaking", "crying", "tears", "emotional", "tragic", "tragedy",
];

const TIKTOK_EXCLUDE_KEYWORDS = [
  "dance", "tutorial", "makeup", "recipe", "cooking", "workout", "fitness",
  "sponsored", "ad", "brand deal", "gifted", "partnership",
];

/** Scrape tweets via Apify Tweet Scraper V2 (apidojo/tweet-scraper) */
async function scrapeTweetsViaApify(apifyToken: string, searchTerms: string[], maxItems = 200): Promise<any[]> {
  const actorId = "apidojo~tweet-scraper";
  const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

  const input = {
    searchTerms,
    maxItems,
    sort: "Latest",
    tweetLanguage: "en",
    includeSearchTerms: true,
  };

  console.log(`Apify: starting Tweet Scraper V2 with ${searchTerms.length} queries, maxItems=${maxItems}`);
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
      }
      if (!media_url && tw.entities?.media?.length) {
        media_url = tw.entities.media[0].media_url_https || tw.entities.media[0].media_url || "";
      }
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
        created_at: tw.createdAt || "",
        media_url,
        url: tw.url || `https://x.com/${tw.author?.userName || "i"}/status/${tw.id}`,
      };
    });
}

/** Scrape TikTok via Apify clockworks/tiktok-scraper */
async function scrapeTikTokViaApify(
  apifyToken: string,
  searchQueries: string[],
  hashtags: string[],
  maxResults = 30,
): Promise<any[]> {
  const actorId = "clockworks~tiktok-scraper";
  const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

  const input: Record<string, any> = {
    resultsPerPage: maxResults,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadAvatars: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadMusicCovers: false,
    scrapeRelatedVideos: false,
    excludePinnedPosts: false,
    proxyCountryCode: "None",
    profileScrapeSections: ["videos"],
    profileSorting: "latest",
    searchSection: "",
    maxProfilesPerQuery: 5,
  };

  // Use search queries (primary) + hashtags
  if (searchQueries.length > 0) {
    input.searchQueries = searchQueries;
  }
  if (hashtags.length > 0) {
    input.hashtags = hashtags;
  }

  console.log(`Apify TikTok: starting with ${searchQueries.length} searches, ${hashtags.length} hashtags, max=${maxResults}`);
  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(180_000), // 3 min timeout — TikTok scraper can be slow
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.log(`Apify TikTok run failed (${res.status}): ${err.slice(0, 300)}`);
    throw new Error(`Apify TikTok request failed (${res.status})`);
  }

  const items: any[] = await res.json();
  console.log(`Apify TikTok: received ${items.length} items`);

  // Normalize TikTok output
  return items.map((v: any) => ({
    id: v.id || "",
    text: v.text || "",
    playCount: v.playCount || 0,
    diggCount: v.diggCount || 0,
    shareCount: v.shareCount || 0,
    commentCount: v.commentCount || 0,
    collectCount: v.collectCount || 0,
    createTimeISO: v.createTimeISO || "",
    webVideoUrl: v.webVideoUrl || "",
    authorName: v.authorMeta?.name || "",
    authorNickName: v.authorMeta?.nickName || "",
    authorFans: v.authorMeta?.fans || 0,
    authorVerified: v.authorMeta?.verified || false,
    coverUrl: v.videoMeta?.coverUrl || "",
    duration: v.videoMeta?.duration || 0,
    hashtags: (v.hashtags || []).map((h: any) => h.name || h),
    isAd: v.isAd || false,
    isSponsored: v.isSponsored || false,
    musicName: v.musicMeta?.musicName || "",
    searchQuery: v.searchQuery || "",
  }));
}

/** Filter TikTok videos for animal/pet/justice narratives */
function filterAnimalViralTikToks(videos: any[]): any[] {
  return videos.filter((v) => {
    // Exclude ads and sponsored
    if (v.isAd || v.isSponsored) return false;

    const text = (v.text || "").toLowerCase();
    const tags = (v.hashtags || []).map((h: string) => h.toLowerCase()).join(" ");
    const combined = `${text} ${tags}`;

    // Must match at least one animal/justice keyword
    const hasAnimalKeyword = TIKTOK_ANIMAL_KEYWORDS.some((kw) => combined.includes(kw));
    if (!hasAnimalKeyword) return false;

    // Exclude dance/tutorial/ad content
    const isExcluded = TIKTOK_EXCLUDE_KEYWORDS.some((kw) => combined.includes(kw));
    if (isExcluded) return false;

    return true;
  });
}

/** Score TikTok video for narrative potential */
function scoreTikTokVideo(v: any): number {
  let score = 0;
  // Play count scoring
  if (v.playCount > 10_000_000) score += 10;
  else if (v.playCount > 5_000_000) score += 8;
  else if (v.playCount > 1_000_000) score += 6;
  else if (v.playCount > 500_000) score += 4;
  else if (v.playCount > 100_000) score += 2;

  // Engagement ratio
  const engagementRate = v.playCount > 0 ? (v.diggCount + v.shareCount + v.commentCount) / v.playCount : 0;
  if (engagementRate > 0.1) score += 4;
  else if (engagementRate > 0.05) score += 2;

  // Share count (virality indicator)
  if (v.shareCount > 50_000) score += 4;
  else if (v.shareCount > 10_000) score += 2;

  // Recency bonus
  if (v.createTimeISO) {
    const age = Date.now() - new Date(v.createTimeISO).getTime();
    if (age < 6 * 3600_000) score += 4; // < 6h
    else if (age < 24 * 3600_000) score += 2; // < 24h
  }

  // Justice/tragedy keyword bonus
  const text = (v.text || "").toLowerCase();
  const justiceKeywords = ["died", "death", "dead", "rip", "put down", "justice", "abuse", "rescue", "heartbreaking", "tragic"];
  const justiceHits = justiceKeywords.filter((kw) => text.includes(kw)).length;
  score += justiceHits * 2;

  return Math.min(score, 20);
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
        send("progress", { step: 0, label: "Loading NarrativeEdge memory", status: "running", detail: "Reading persistent search terms & past winning narratives..." });

        let memory: { search_terms: string[]; tiktok_queries: string[]; tiktok_hashtags: string[]; past_wins: string[]; last_cycle: string | null } = {
          search_terms: [
            '("pump.fun" OR pumpfun OR "new memecoin") (ai OR cat OR agent OR celebrity OR frog OR dog OR political)',
            '("solana memecoin" OR "$SOL" OR "pump fun") (launch OR moon OR 100x OR narrative)',
            '("pump.fun" OR pumpfun) (trending OR viral OR breaking)',
          ],
          tiktok_queries: [
            "cat died", "dog put down", "justice for pet", "my cat died",
            "viral animal rescue", "rip my dog", "animal abuse justice",
          ],
          tiktok_hashtags: [
            "catsoftiktok", "dogsoftiktok", "petjustice", "animaltragedy",
            "restinpeace", "petloss", "animalrescue", "viralpet",
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
            if (saved.tiktok_queries?.length) memory.tiktok_queries = saved.tiktok_queries;
            if (saved.tiktok_hashtags?.length) memory.tiktok_hashtags = saved.tiktok_hashtags;
            if (saved.past_wins?.length) memory.past_wins = saved.past_wins;
            memory.last_cycle = saved.last_cycle || null;
          }
        } catch { /* first run */ }

        send("progress", { step: 0, label: "Loading NarrativeEdge memory", status: "done", detail: `Loaded ${memory.search_terms.length} X queries, ${memory.tiktok_queries.length} TikTok queries, ${memory.past_wins.length} past wins` });

        // ── STEP 1: Scrape tweets via Apify Tweet Scraper V2 ────────────
        // ── STEP 1.5: Scrape TikTok via Apify clockworks/tiktok-scraper ──
        // Run BOTH in parallel for speed
        send("progress", { step: 1, label: "Scraping X/Twitter via Apify", status: "running", detail: `Launching Tweet Scraper V2 with ${memory.search_terms.length} queries...` });
        send("progress", { step: 1.5, label: "Scraping TikTok via Apify", status: "running", detail: `Launching TikTok Scraper with ${memory.tiktok_queries.length} searches + ${memory.tiktok_hashtags.length} hashtags...` });

        let tweets: any[] = [];
        let tiktokVideos: any[] = [];
        let apifyError = false;
        let tiktokError = false;

        const [tweetResult, tiktokResult] = await Promise.allSettled([
          scrapeTweetsViaApify(APIFY_TOKEN!, memory.search_terms, 200),
          scrapeTikTokViaApify(APIFY_TOKEN!, memory.tiktok_queries, memory.tiktok_hashtags, 50),
        ]);

        if (tweetResult.status === "fulfilled") {
          tweets = tweetResult.value;
        } else {
          apifyError = true;
          console.log(`Apify tweet scrape failed: ${tweetResult.reason}`);
          send("progress", { step: 1, label: "Scraping X/Twitter via Apify", status: "warning", detail: `⚠️ Apify scrape failed: ${tweetResult.reason}` });
        }

        if (tiktokResult.status === "fulfilled") {
          tiktokVideos = tiktokResult.value;
        } else {
          tiktokError = true;
          console.log(`Apify TikTok scrape failed: ${tiktokResult.reason}`);
          send("progress", { step: 1.5, label: "Scraping TikTok via Apify", status: "warning", detail: `⚠️ TikTok scrape failed: ${tiktokResult.reason}` });
        }

        // Deduplicate tweets by id
        const seenIds = new Set<string>();
        tweets = tweets.filter(tw => {
          if (!tw.id || seenIds.has(tw.id)) return false;
          seenIds.add(tw.id);
          return true;
        });
        stats.tweets = tweets.length;

        // Filter & score TikTok videos
        const filteredTikToks = filterAnimalViralTikToks(tiktokVideos);
        const scoredTikToks = filteredTikToks
          .map((v) => ({ ...v, narrativeScore: scoreTikTokVideo(v) }))
          .sort((a, b) => b.narrativeScore - a.narrativeScore || b.playCount - a.playCount)
          .slice(0, 20);

        stats.tiktok_raw = tiktokVideos.length;
        stats.tiktok_filtered = filteredTikToks.length;
        stats.tiktok_top = scoredTikToks.length;

        if (tweets.length === 0 && !apifyError) {
          send("warning", { type: "credits_depleted", message: "Apify returned 0 tweets — search queries may be too narrow or Apify credits depleted." });
        }
        send("progress", { step: 1, label: "Scraping X/Twitter via Apify", status: apifyError ? "warning" : "done", detail: apifyError ? `⚠️ Apify failed — continuing with token data only` : `Found ${tweets.length} unique tweets via Apify` });
        send("progress", { step: 1.5, label: "Scraping TikTok via Apify", status: tiktokError ? "warning" : "done", detail: tiktokError ? `⚠️ TikTok scrape failed` : `Found ${tiktokVideos.length} raw → ${filteredTikToks.length} animal/justice → Top ${scoredTikToks.length} scored` });

        // ── STEP 2: Combined dedup ──────────────────────
        send("progress", { step: 2, label: "Source deduplication & normalization", status: "done", detail: `${tweets.length} tweets + ${scoredTikToks.length} TikTok videos ready for cross-referencing` });

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

        // ── STEP 5: Cross-reference tweets + TikTok to tokens ─────
        send("progress", { step: 5, label: "Cross-referencing X + TikTok ↔ tokens", status: "running", detail: "Clustering multi-platform narratives..." });

        // Check if any TikTok videos match existing tokens
        const tiktokTokenMatches: Record<string, any[]> = {};
        for (const v of scoredTikToks) {
          const vText = (v.text || "").toLowerCase();
          const vTags = (v.hashtags || []).join(" ").toLowerCase();
          const combined = `${vText} ${vTags}`;
          for (const tok of enriched) {
            const name = (tok.baseToken?.name || "").toLowerCase();
            const sym = (tok.baseToken?.symbol || "").toLowerCase();
            if ((name.length > 2 && combined.includes(name)) || (sym.length > 1 && combined.includes(sym))) {
              if (!tiktokTokenMatches[tok.tokenAddress]) tiktokTokenMatches[tok.tokenAddress] = [];
              tiktokTokenMatches[tok.tokenAddress].push(v);
            }
          }
        }

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

          const matchedTikToks = tiktokTokenMatches[addr] || [];

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
            matched_tiktoks: matchedTikToks.slice(0, 3).map((v: any) => ({
              text: (v.text || "").slice(0, 200),
              playCount: v.playCount,
              diggCount: v.diggCount,
              shareCount: v.shareCount,
              webVideoUrl: v.webVideoUrl,
              authorName: v.authorName,
              narrativeScore: v.narrativeScore,
            })),
            tweet_velocity: matchedTweets.length,
            tiktok_velocity: matchedTikToks.length,
            total_engagement: matchedTweets.reduce((sum: number, tw: any) => sum + getLikes(tw) + getRTs(tw), 0)
              + matchedTikToks.reduce((sum: number, v: any) => sum + (v.playCount || 0) / 1000, 0),
          };
        }).sort((a, b) => b.total_engagement - a.total_engagement || b.tweet_velocity - a.tweet_velocity);

        stats.matches = matched.filter(m => m.tweet_velocity > 0 || m.tiktok_velocity > 0).length;
        stats.cross_platform = matched.filter(m => m.tweet_velocity > 0 && m.tiktok_velocity > 0).length;
        send("progress", { step: 5, label: "Cross-referencing X + TikTok ↔ tokens", status: "done", detail: `${stats.matches} narrative clusters (${stats.cross_platform} cross-platform)` });

        // ── STEP 6: NarrativeEdge AI analysis ────
        send("progress", { step: 6, label: "NarrativeEdge AI (Lovable AI)", status: "running", detail: "Running ruthless narrative classification with TikTok data..." });

        const top15 = matched.slice(0, 15);
        const allTweetsWithMedia = tweets.filter((tw: any) => tw.media_url);
        const topSummary = top15.map((m, i) => {
          const mediaTweets = m.matched_tweets.filter((tw: any) => tw.media_url).map((tw: any) => tw.media_url).slice(0, 2);
          const tiktokInfo = m.matched_tiktoks.length > 0
            ? ` | TikTok: ${m.matched_tiktoks.map((v: any) => `${(v.playCount / 1000).toFixed(0)}K plays`).join(", ")}`
            : "";
          return `${i + 1}. ${m.token.baseToken?.symbol || "?"} (${m.token.baseToken?.name || "?"}) | Stage: ${m.token.stage} | MCAP: $${m.token.mcap} | Vol24h: $${m.token.volume24h} | Liq: $${m.token.liquidity} | Δ5m: ${m.token.priceChange5m}% | Δ1h: ${m.token.priceChange1h}% | Δ6h: ${m.token.priceChange6h}% | Δ24h: ${m.token.priceChange24h}% | Buys: ${m.token.txns24h_buys} | Sells: ${m.token.txns24h_sells} | Tweets: ${m.tweet_velocity} | Engagement: ${m.total_engagement} | Top tweet: "${m.matched_tweets[0]?.text?.slice(0, 120) || 'none'}"${mediaTweets.length ? ` | Media: ${mediaTweets.join(', ')}` : ''}${tiktokInfo}`;
        }).join("\n");

        const tweetThemes = tweets.slice(0, 50).map((tw: any) => (tw.full_text || tw.text || "").slice(0, 200)).join("\n---\n");

        // Build TikTok viral animal summary for AI
        const tiktokSummary = scoredTikToks.slice(0, 10).map((v, i) => {
          const tokenMatch = Object.entries(tiktokTokenMatches).find(([_, vids]) => vids.some((vid: any) => vid.id === v.id));
          const tokenized = tokenMatch ? `YES (${tokenMatch[0].slice(0, 12)}...)` : "NO — LAUNCH OPPORTUNITY";
          return `TT${i + 1}. "${(v.text || "").slice(0, 150)}" | ${(v.playCount / 1000).toFixed(0)}K plays | ${(v.diggCount / 1000).toFixed(0)}K likes | ${(v.shareCount / 1000).toFixed(0)}K shares | Score: ${v.narrativeScore}/20 | @${v.authorName} | ${v.webVideoUrl} | Tokenized: ${tokenized}`;
        }).join("\n");

        const systemPrompt = `You are NarrativeEdge AI — the cold, ruthless, self-evolving narrative sniper for a veteran pump.fun deployer. Your single goal: turn raw Apify tweets + TikTok viral animal/pet/justice videos + Moralis new/bonding/graduated tokens + DexScreener enrichment into lethal, categorized narrative clusters that print before normies even wake up.

NEW: You now have TikTok data. TikTok viral animal/pet/death/justice videos are GOLD for pump.fun narratives — these trend 6-36h before hitting X/Solana. If a TikTok video has >500K plays about a dead/rescued animal and NO matching token exists — that's a LAUNCH NOW opportunity.

MANDATORY CATEGORIES (classify EVERY cluster into one):
1. Justice/Tragedy — animal death, human death, political assassination, "put down", injustice outrage. Highest historical success rate (PNUT, squirrel meta). 
2. Exchange Tribute — Coinbase listing, Binance, Raydium, any CEX news. Launch tribute token instantly.
3. Celebrity/Endorsement — verified account launches or mentions personal coin.
4. Political/Event-Driven — elections, Trump/Musk news, scandals.
5. Absurd/Viral Humor — fart, goatseus, sigma, stunts, livestream meta.
6. AI/Bot Narrative — Truth Terminal style, GOAT-style autonomous agents.
7. Meta/Infrastructure — pump.fun itself, streamers, dev drama.
8. Revenge/Drama — rug revenge, "dev rugged me", suicide stream copycats.
9. TikTok Viral Pet — viral TikTok animal that hasn't been tokenized yet. LAUNCH FIRST.
10. Cross-Platform Justice — narrative trending on BOTH X and TikTok simultaneously. HIGHEST CONVICTION.
11. Any new category you discover — add it and classify it.

PAST WINNING PATTERNS:
${memory.past_wins.length > 0 ? memory.past_wins.slice(-15).join("\n") : "No history yet — first cycle."}

Return ONLY valid JSON (no markdown, no backticks):
{
  "chain_of_thought": "Ruthless step-by-step reasoning: what's printing, what's dead, what normies haven't found yet. Include TikTok analysis.",
  "top_narratives": [
    {
      "narrative_type": "Justice/Tragedy",
      "source_platform": "x" | "tiktok" | "cross-platform",
      "name": "Pump.fun token name",
      "symbol": "TICKER",
      "description": "Pump.fun description — catchy, memetic, 1-2 sentences",
      "image_gen_prompt": "Grok Imagine prompt: cute sad [animal] justice PNUT style, cinematic, viral meme, Solana logo subtle",
      "narrative_rating": 9,
      "pump_potential": "Expected multiple from current MC (e.g. 20-50x from 15k MC)",
      "trigger_tweets": [
        {"user": "@handle", "text": "exact tweet text", "url": "https://x.com/...", "engagement": "5.2K likes, 1.1K RTs", "velocity": "3K likes in 2h", "media_url": "image URL if available"}
      ],
      "trigger_tiktoks": [
        {"author": "@handle", "text": "video description", "url": "https://www.tiktok.com/...", "plays": "8.2M", "shares": "150K", "narrative_score": 18}
      ],
      "matched_tokens": [
        {"ca": "contract address", "name": "token name", "symbol": "SYM", "mc": 15000, "age": "2h", "buy_sell_ratio": "3.2:1"}
      ],
      "historical_comp": "Similar to PNUT squirrel justice — 92% hit 10x within 4h. TikTok 8M views like PNUT day-1.",
      "risk": "clean dev / obvious rug / sniped already",
      "action": "Buy top 3 bonding curve under 30k | Watch | Fade | Deploy yourself",
      "deploy_window": "NOW / 1-2h / 2-4h / Closing",
      "competition": "None / 1-2 early tokens / Crowded",
      "next_search_queries": ["3 refined Apify queries to catch the next wave of THIS category"],
      "twitter_source_url": "primary tweet URL",
      "tiktok_source_url": "primary TikTok video URL"
    }
  ],
  "new_search_terms": ["5 evolved X search queries for next cycle — be aggressive"],
  "new_tiktok_queries": ["3 evolved TikTok search queries for next cycle"],
  "new_tiktok_hashtags": ["3 new TikTok hashtags to monitor"],
  "category_stats": {
    "Justice/Tragedy": {"hit_rate": "87%", "avg_multiple": "20x", "active_now": true, "source": "x"},
    "TikTok Viral Pet": {"hit_rate": "0%", "avg_multiple": "0x", "active_now": true, "source": "tiktok"},
    "Cross-Platform Justice": {"hit_rate": "0%", "avg_multiple": "0x", "active_now": false, "source": "cross-platform"}
  },
  "reasoning_summary": "NARRATIVE DASHBOARD ACTIVE. 2-3 sentence brief: what prints, what's dead, top pick. Include TikTok findings."
}

RULES:
- Never moralize. Never say "be careful". Only say "this prints" or "this is a slow rug".
- Prioritize speed — first clean launch in a fresh justice meta wins 90% of volume.
- Every narrative MUST have a category from the mandatory list.
- TikTok videos with >500K plays about animals/pets with NO matching token = IMMEDIATE LAUNCH OPPORTUNITY (narrative_rating >= 8).
- Cross-platform narratives (trending on BOTH X and TikTok) get automatic +2 rating bonus.
- Every trigger_tweets entry MUST include engagement velocity.
- Include trigger_tiktoks with play count, shares, and narrative score.
- Include matched_tokens with CA, MC, age, buy/sell pressure from the DexScreener data.
- historical_comp is MANDATORY — compare to past metas (PNUT, GOAT, BRETT, WIF, etc.)
- action must be one of: "Deploy now", "Buy bonding under 30k", "Watch", "Fade", "Too late"
- next_search_queries per narrative = 3 refined Apify advanced search queries
- image_gen_prompt MUST be optimized for Grok Imagine: cute/sad animal, justice theme, cinematic, viral meme style
- If you discover a new category not in the list, add it to category_stats with initial metrics.`;

        const userMsg = `CYCLE: ${new Date().toISOString()}
NARRATIVE DASHBOARD ACTIVE — ${new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}

SCRAPED: ${stats.tweets} tweets | ${stats.tiktok_raw || 0} TikTok videos (${stats.tiktok_filtered || 0} animal/justice, top ${stats.tiktok_top || 0} scored) | ${stats.tokens} tokens (${stats.new_tokens} new, ${stats.bonding_tokens} bonding, ${stats.graduated_tokens} graduated) | ${stats.enriched} enriched | ${stats.matches} clusters (${stats.cross_platform} cross-platform)

=== LIVE PUMP.FUN TOKENS (cross-reference these — which narratives are they riding?) ===
${topSummary || "No existing tokens matched tweets"}

=== RAW CT CHATTER (find untokenized narratives hiding in here — categorize EVERY cluster) ===
${tweetThemes.slice(0, 3000) || "No tweets"}

=== TIKTOK VIRAL ANIMAL RADAR (these are PRE-SOLANA — if not tokenized, LAUNCH NOW) ===
${tiktokSummary || "No TikTok animal/justice videos found this cycle"}

Classify every cluster. Rate ruthlessly. Include CAs and engagement velocity. Flag untokenized TikTok viral pets. What prints RIGHT NOW?`;

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

        send("progress", { step: 6, label: "NarrativeEdge AI (Lovable AI)", status: "done", detail: aiResult ? `Classified ${aiResult.top_narratives?.length || 0} narrative clusters (X + TikTok)` : "Analysis complete (raw)" });

        // ── STEP 7: Self-evolution — update memory ──
        send("progress", { step: 7, label: "NarrativeEdge memory evolution", status: "running", detail: "Saving category stats + evolved queries + TikTok queries..." });

        if (aiResult?.new_search_terms?.length) {
          memory.search_terms = aiResult.new_search_terms.slice(0, 7);
        }
        if (aiResult?.new_tiktok_queries?.length) {
          memory.tiktok_queries = [...new Set([...memory.tiktok_queries, ...aiResult.new_tiktok_queries])].slice(0, 10);
        }
        if (aiResult?.new_tiktok_hashtags?.length) {
          memory.tiktok_hashtags = [...new Set([...memory.tiktok_hashtags, ...aiResult.new_tiktok_hashtags])].slice(0, 12);
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
            .map((n: any) => `[${new Date().toISOString().split("T")[0]}] [${n.narrative_type || 'Uncat'}] [${n.source_platform || 'x'}] ${n.name} ($${n.symbol || '?'}) (${n.narrative_rating}/10) — ${(n.action || n.pump_potential || '').slice(0, 80)}`);
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

        send("progress", { step: 7, label: "NarrativeEdge memory evolution", status: "done", detail: `Saved ${memory.search_terms.length} X queries + ${memory.tiktok_queries.length} TikTok queries + ${memory.past_wins.length} past wins` });

        // ── STEP 8: Push findings ───────────────────────────────────
        send("progress", { step: 8, label: "Saving findings to database", status: "running", detail: "Pushing cycle report + narrative findings..." });

        const cycleTitle = `🎯 NarrativeEdge Cycle — ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
        await pushFinding(
          cycleTitle,
          reasoning,
          "",
          "trend",
          {
            ...stats,
            reasoning,
            top_narratives: aiResult?.top_narratives || [],
            chain_of_thought: aiResult?.chain_of_thought || "",
            category_stats: aiResult?.category_stats || {},
            tiktok_radar: scoredTikToks.slice(0, 10),
          },
          ["narrativeedge", "cycle-report"]
        );

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
                src = { ...src, url: tweetUrl, user: `@${scraped.user.screen_name}` };
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
          const platformBadge = platform === "cross-platform" ? "🔀" : platform === "tiktok" ? "🎵" : "𝕏";
          const action = n.action || "";
          const sources = n.trigger_tweets?.map((s: any) => s.url).filter(Boolean) || n.tweet_sources?.map((s: any) => s.url).filter(Boolean) || [];
          await pushFinding(
            `${platformBadge} [${category}] ${n.name} ($${n.symbol || '?'}) — ${rating}/10`,
            `${action} | ${n.pump_potential || ''} | ${n.historical_comp || ''} | Risk: ${n.risk || '?'} | Window: ${n.deploy_window} | Competition: ${n.competition}`,
            n.twitter_source_url || n.tiktok_source_url || sources[0] || "",
            "trend",
            { ...n, type: "narrative_report" },
            ["cortex", "narrative", `rating-${rating}`, `src-${platform}`, n.symbol?.toLowerCase()].filter(Boolean) as string[]
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
          evolved_tiktok_queries: memory.tiktok_queries,
          top_tweets: topTweets,
          tiktok_radar: scoredTikToks.slice(0, 10),
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
