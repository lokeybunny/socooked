import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const MORALIS_API_KEY = Deno.env.get("MORALIS_API_KEY");
  const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!APIFY_TOKEN || !MORALIS_API_KEY || !GROK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing API keys" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const pushFinding = async (
    title: string,
    summary: string,
    sourceUrl: string,
    findingType: string,
    rawData: Record<string, unknown>,
    tags: string[]
  ) => {
    await supabase.from("research_findings").insert({
      title,
      summary,
      source_url: sourceUrl,
      finding_type: findingType,
      category: "x",
      status: "new",
      created_by: "spacebot",
      raw_data: rawData,
      tags,
    });
  };

  try {
    const cycleTs = new Date().toISOString();
    const stats: Record<string, number> = {};

    // ── STEP 1: Scrape tweets via Apify ─────────────────────────────────
    const searchPayload = {
      searchTerms:
        '("pump.fun" OR pumpfun OR "new memecoin" OR "launching now") (ai OR cat OR agent OR celebrity OR frog OR dog) min_faves:150',
      sort: "Latest",
      maxItems: 200,
      onlyVerifiedUsers: false,
      includeSearchTerms: true,
    };

    let tweets: any[] = [];
    try {
      const apifyRes = await fetch(
        `https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(searchPayload),
          signal: AbortSignal.timeout(120_000),
        }
      );
      if (apifyRes.ok) {
        tweets = await apifyRes.json();
      }
    } catch {
      // Apify timeout is common; continue with empty tweets
    }
    stats.tweets = tweets.length;

    // ── STEP 2: Moralis Pump.fun tokens ─────────────────────────────────
    const moralisHeaders = { "X-API-Key": MORALIS_API_KEY };
    const moralisBase =
      "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun";

    const [newRes, bondRes, gradRes] = await Promise.all([
      fetch(`${moralisBase}/new?limit=100`, { headers: moralisHeaders }),
      fetch(`${moralisBase}/bonding?limit=80`, { headers: moralisHeaders }),
      fetch(`${moralisBase}/graduated?limit=40`, { headers: moralisHeaders }),
    ]);

    const newTokens = newRes.ok ? await newRes.json() : [];
    const bondTokens = bondRes.ok ? await bondRes.json() : [];
    const gradTokens = gradRes.ok ? await gradRes.json() : [];

    // Merge + dedupe by address, take top 40
    const allTokensMap = new Map<string, any>();
    for (const t of [
      ...(Array.isArray(newTokens) ? newTokens : []),
      ...(Array.isArray(bondTokens) ? bondTokens : []),
      ...(Array.isArray(gradTokens) ? gradTokens : []),
    ]) {
      const addr =
        t.tokenAddress || t.address || t.mint || t.token_address || "";
      if (addr && !allTokensMap.has(addr)) allTokensMap.set(addr, t);
    }
    const allTokens = [...allTokensMap.values()].slice(0, 40);
    stats.tokens = allTokens.length;

    // ── STEP 3: DexScreener enrichment (batched, top 20) ────────────────
    const enriched: any[] = [];
    const addresses = allTokens
      .map(
        (t: any) =>
          t.tokenAddress || t.address || t.mint || t.token_address || ""
      )
      .filter(Boolean)
      .slice(0, 20);

    for (const addr of addresses) {
      try {
        const dexRes = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${addr}`
        );
        if (dexRes.ok) {
          const dexData = await dexRes.json();
          if (dexData.pairs?.length > 0) {
            const p = dexData.pairs[0];
            enriched.push({
              tokenAddress: addr,
              baseToken: p.baseToken,
              priceUsd: p.priceUsd,
              volume24h: p.volume?.h24 ?? 0,
              liquidity: p.liquidity?.usd ?? 0,
              txns24h_buys: p.txns?.h24?.buys ?? 0,
              txns24h_sells: p.txns?.h24?.sells ?? 0,
              priceChange1h: p.priceChange?.h1 ?? 0,
              priceChange24h: p.priceChange?.h24 ?? 0,
              mcap: p.marketCap ?? 0,
              url: p.url,
            });
          }
        }
      } catch {
        // skip
      }
      // Rate limit: ~5/sec
      await new Promise((r) => setTimeout(r, 220));
    }
    stats.enriched = enriched.length;

    // ── STEP 4: Match tweets to tokens ──────────────────────────────────
    const matched = enriched
      .map((tok) => {
        const name = (tok.baseToken?.name || "").toLowerCase();
        const sym = (tok.baseToken?.symbol || "").toLowerCase();
        const addr = tok.tokenAddress || "";

        const matchedTweets = tweets.filter((tw: any) => {
          const txt = (tw.full_text || tw.text || "").toLowerCase();
          return (
            (name.length > 2 && txt.includes(name)) ||
            (sym.length > 1 && txt.includes(sym)) ||
            txt.includes(addr.slice(0, 12))
          );
        });

        return {
          token: tok,
          matched_tweets: matchedTweets.slice(0, 5).map((tw: any) => ({
            text: tw.full_text || tw.text || "",
            user: tw.user?.screen_name || tw.author || "unknown",
            favorites: tw.favorite_count || tw.likes || 0,
          })),
          tweet_velocity: matchedTweets.length,
          total_engagement: matchedTweets.reduce(
            (sum: number, tw: any) =>
              sum +
              (tw.favorite_count || tw.likes || 0) +
              (tw.retweet_count || tw.retweets || 0),
            0
          ),
        };
      })
      .sort((a, b) => b.tweet_velocity - a.tweet_velocity)
      .slice(0, 15);

    stats.matches = matched.length;

    // ── STEP 5: Grok narrative analysis ─────────────────────────────────
    const topDataSummary = matched
      .slice(0, 10)
      .map(
        (m) =>
          `${m.token.baseToken?.symbol || "?"} | MCAP:$${m.token.mcap} | Vol:$${m.token.volume24h} | Δ1h:${m.token.priceChange1h}% | Tweets:${m.tweet_velocity} | Eng:${m.total_engagement}`
      )
      .join("\n");

    const userMsg = `CYCLE TIMESTAMP: ${cycleTs}
TWEET STATS: ${stats.tweets} tweets scraped
TOKEN STATS: ${stats.tokens} tokens from Moralis, ${stats.enriched} enriched
MATCHED CLUSTERS: ${stats.matches}

TOP MATCHED DATA:
${topDataSummary || "No matches found"}

Analyze these crypto narratives. Return ONLY valid JSON:
{"reasoning": "your analysis", "new_search_terms": ["query1", "query2"]}`;

    let reasoning = "No Grok analysis available";
    try {
      const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-4",
          temperature: 0.3,
          max_tokens: 2000,
          messages: [
            {
              role: "system",
              content:
                "You are spacebot, an autonomous Pump.fun narrative hunter. Analyze the data and return ONLY valid JSON: {\"reasoning\": \"...\", \"new_search_terms\": [\"query1\", \"query2\", \"query3\"]}",
            },
            { role: "user", content: userMsg },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (grokRes.ok) {
        const grokData = await grokRes.json();
        const content = grokData.choices?.[0]?.message?.content || "";
        try {
          const cleaned = content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          reasoning = parsed.reasoning || reasoning;
        } catch {
          reasoning = content.slice(0, 500) || reasoning;
        }
      }
    } catch {
      // Grok timeout
    }

    // ── STEP 6: Push findings ───────────────────────────────────────────
    // Push cycle report
    await pushFinding(
      `🧠 Cycle Report — ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      reasoning,
      "",
      "trend",
      { ...stats, reasoning },
      ["spacebot", "narrative", "cycle-report"]
    );

    // Push top tokens
    for (const m of matched.filter((m) => m.tweet_velocity > 0).slice(0, 8)) {
      const sym = m.token.baseToken?.symbol || "?";
      await pushFinding(
        `🪙 ${sym} — ${m.tweet_velocity} tweets, MCAP $${m.token.mcap}`,
        `$${sym} | MCAP: $${m.token.mcap} | Vol24h: $${m.token.volume24h} | Δ1h: ${m.token.priceChange1h}% | Δ24h: ${m.token.priceChange24h}% | Tweets: ${m.tweet_velocity} | Engagement: ${m.total_engagement}`,
        m.token.url || "",
        "lead",
        m.token,
        ["spacebot", "pump.fun", sym, m.token.tokenAddress || ""]
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        stats,
        reasoning: reasoning.slice(0, 200),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
