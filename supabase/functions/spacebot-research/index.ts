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
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!APIFY_TOKEN || !MORALIS_API_KEY || !GROK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing API keys" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // SSE streaming response
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
          category: "x", status: "new", created_by: "spacebot",
          raw_data: rawData, tags,
        });
      };

      try {
        const stats: Record<string, number> = {};

        // ── STEP 1: Scrape tweets via Apify ─────────────────────────────
        send("progress", { step: 1, label: "Scraping tweets via Apify", status: "running", detail: "Sending search query to tweet scraper..." });

        const searchPayload = {
          searchTerms: '("pump.fun" OR pumpfun OR "new memecoin" OR "launching now") (ai OR cat OR agent OR celebrity OR frog OR dog) min_faves:150',
          sort: "Latest", maxItems: 200, onlyVerifiedUsers: false, includeSearchTerms: true,
        };

        let tweets: any[] = [];
        try {
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(searchPayload), signal: AbortSignal.timeout(120_000) }
          );
          if (apifyRes.ok) tweets = await apifyRes.json();
        } catch { /* timeout ok */ }
        stats.tweets = tweets.length;
        send("progress", { step: 1, label: "Scraping tweets via Apify", status: "done", detail: `Scraped ${tweets.length} tweets` });

        // ── STEP 2: Moralis Pump.fun tokens ─────────────────────────────
        send("progress", { step: 2, label: "Fetching Pump.fun tokens via Moralis", status: "running", detail: "Pulling new, bonding & graduated tokens..." });

        const moralisHeaders = { "X-API-Key": MORALIS_API_KEY };
        const moralisBase = "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun";

        const [newRes, bondRes, gradRes] = await Promise.all([
          fetch(`${moralisBase}/new?limit=100`, { headers: moralisHeaders }),
          fetch(`${moralisBase}/bonding?limit=80`, { headers: moralisHeaders }),
          fetch(`${moralisBase}/graduated?limit=40`, { headers: moralisHeaders }),
        ]);

        const newTokens = newRes.ok ? await newRes.json() : [];
        const bondTokens = bondRes.ok ? await bondRes.json() : [];
        const gradTokens = gradRes.ok ? await gradRes.json() : [];

        const allTokensMap = new Map<string, any>();
        for (const t of [...(Array.isArray(newTokens) ? newTokens : []), ...(Array.isArray(bondTokens) ? bondTokens : []), ...(Array.isArray(gradTokens) ? gradTokens : [])]) {
          const addr = t.tokenAddress || t.address || t.mint || t.token_address || "";
          if (addr && !allTokensMap.has(addr)) allTokensMap.set(addr, t);
        }
        const allTokens = [...allTokensMap.values()].slice(0, 40);
        stats.tokens = allTokens.length;
        send("progress", { step: 2, label: "Fetching Pump.fun tokens via Moralis", status: "done", detail: `Found ${allTokens.length} unique tokens (${Array.isArray(newTokens) ? newTokens.length : 0} new, ${Array.isArray(bondTokens) ? bondTokens.length : 0} bonding, ${Array.isArray(gradTokens) ? gradTokens.length : 0} graduated)` });

        // ── STEP 3: DexScreener enrichment ──────────────────────────────
        const addresses = allTokens.map((t: any) => t.tokenAddress || t.address || t.mint || t.token_address || "").filter(Boolean).slice(0, 20);
        send("progress", { step: 3, label: "Enriching tokens via DexScreener", status: "running", detail: `Enriching ${addresses.length} tokens with market data...` });

        const enriched: any[] = [];
        for (let i = 0; i < addresses.length; i++) {
          const addr = addresses[i];
          try {
            const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
            if (dexRes.ok) {
              const dexData = await dexRes.json();
              if (dexData.pairs?.length > 0) {
                const p = dexData.pairs[0];
                enriched.push({
                  tokenAddress: addr, baseToken: p.baseToken, priceUsd: p.priceUsd,
                  volume24h: p.volume?.h24 ?? 0, liquidity: p.liquidity?.usd ?? 0,
                  txns24h_buys: p.txns?.h24?.buys ?? 0, txns24h_sells: p.txns?.h24?.sells ?? 0,
                  priceChange1h: p.priceChange?.h1 ?? 0, priceChange24h: p.priceChange?.h24 ?? 0,
                  mcap: p.marketCap ?? 0, url: p.url,
                });
              }
            }
          } catch { /* skip */ }
          if ((i + 1) % 5 === 0) {
            send("progress", { step: 3, label: "Enriching tokens via DexScreener", status: "running", detail: `Enriched ${i + 1}/${addresses.length} tokens (${enriched.length} with pairs)...` });
          }
          await new Promise((r) => setTimeout(r, 220));
        }
        stats.enriched = enriched.length;
        send("progress", { step: 3, label: "Enriching tokens via DexScreener", status: "done", detail: `Enriched ${enriched.length} tokens with market data` });

        // ── STEP 4: Match tweets to tokens ──────────────────────────────
        send("progress", { step: 4, label: "Matching tweets to tokens", status: "running", detail: "Cross-referencing tweet mentions with token data..." });

        const matched = enriched.map((tok) => {
          const name = (tok.baseToken?.name || "").toLowerCase();
          const sym = (tok.baseToken?.symbol || "").toLowerCase();
          const addr = tok.tokenAddress || "";
          const matchedTweets = tweets.filter((tw: any) => {
            const txt = (tw.full_text || tw.text || "").toLowerCase();
            return (name.length > 2 && txt.includes(name)) || (sym.length > 1 && txt.includes(sym)) || txt.includes(addr.slice(0, 12));
          });
          return {
            token: tok,
            matched_tweets: matchedTweets.slice(0, 5).map((tw: any) => ({ text: tw.full_text || tw.text || "", user: tw.user?.screen_name || tw.author || "unknown", favorites: tw.favorite_count || tw.likes || 0 })),
            tweet_velocity: matchedTweets.length,
            total_engagement: matchedTweets.reduce((sum: number, tw: any) => sum + (tw.favorite_count || tw.likes || 0) + (tw.retweet_count || tw.retweets || 0), 0),
          };
        }).sort((a, b) => b.tweet_velocity - a.tweet_velocity).slice(0, 15);

        stats.matches = matched.filter(m => m.tweet_velocity > 0).length;
        send("progress", { step: 4, label: "Matching tweets to tokens", status: "done", detail: `Found ${stats.matches} token-tweet clusters` });

        // ── STEP 5: Grok narrative analysis ─────────────────────────────
        send("progress", { step: 5, label: "Analyzing narratives via Grok", status: "running", detail: "Sending enriched data to grok-4 for analysis..." });

        const topDataSummary = matched.slice(0, 10).map((m) =>
          `${m.token.baseToken?.symbol || "?"} | MCAP:$${m.token.mcap} | Vol:$${m.token.volume24h} | Δ1h:${m.token.priceChange1h}% | Tweets:${m.tweet_velocity} | Eng:${m.total_engagement}`
        ).join("\n");

        const userMsg = `CYCLE TIMESTAMP: ${new Date().toISOString()}\nTWEET STATS: ${stats.tweets} tweets scraped\nTOKEN STATS: ${stats.tokens} tokens from Moralis, ${stats.enriched} enriched\nMATCHED CLUSTERS: ${stats.matches}\n\nTOP MATCHED DATA:\n${topDataSummary || "No matches found"}\n\nAnalyze these crypto narratives. Return ONLY valid JSON:\n{"reasoning": "your analysis", "new_search_terms": ["query1", "query2"]}`;

        let reasoning = "No Grok analysis available";
        try {
          const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROK_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "grok-4", temperature: 0.3, max_tokens: 2000,
              messages: [
                { role: "system", content: "You are spacebot, an autonomous Pump.fun narrative hunter. Analyze the data and return ONLY valid JSON: {\"reasoning\": \"...\", \"new_search_terms\": [\"query1\", \"query2\", \"query3\"]}" },
                { role: "user", content: userMsg },
              ],
            }),
            signal: AbortSignal.timeout(60_000),
          });
          if (grokRes.ok) {
            const grokData = await grokRes.json();
            const content = grokData.choices?.[0]?.message?.content || "";
            try {
              const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
              const parsed = JSON.parse(cleaned);
              reasoning = parsed.reasoning || reasoning;
            } catch { reasoning = content.slice(0, 500) || reasoning; }
          }
        } catch { /* timeout */ }
        send("progress", { step: 5, label: "Analyzing narratives via Grok", status: "done", detail: reasoning.slice(0, 120) + "..." });

        // ── STEP 6: Push findings ───────────────────────────────────────
        send("progress", { step: 6, label: "Pushing findings to database", status: "running", detail: "Saving cycle report and token findings..." });

        await pushFinding(
          `🧠 Cycle Report — ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
          reasoning, "", "trend", { ...stats, reasoning }, ["spacebot", "narrative", "cycle-report"]
        );

        const tokensToPost = matched.filter((m) => m.tweet_velocity > 0).slice(0, 8);
        for (const m of tokensToPost) {
          const sym = m.token.baseToken?.symbol || "?";
          await pushFinding(
            `🪙 ${sym} — ${m.tweet_velocity} tweets, MCAP $${m.token.mcap}`,
            `$${sym} | MCAP: $${m.token.mcap} | Vol24h: $${m.token.volume24h} | Δ1h: ${m.token.priceChange1h}% | Δ24h: ${m.token.priceChange24h}% | Tweets: ${m.tweet_velocity} | Engagement: ${m.total_engagement}`,
            m.token.url || "", "lead", m.token, ["spacebot", "pump.fun", sym, m.token.tokenAddress || ""]
          );
        }

        send("progress", { step: 6, label: "Pushing findings to database", status: "done", detail: `Pushed 1 cycle report + ${tokensToPost.length} token findings` });

        // Final result
        send("complete", { success: true, stats, reasoning: reasoning.slice(0, 200) });
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
