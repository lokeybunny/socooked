import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEMORY_SITE_ID = "cortex-agent";
const MEMORY_SECTION = "search-memory";

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
      JSON.stringify({ error: "Missing API keys (APIFY_TOKEN, MORALIS_API_KEY, GROK_API_KEY)" }),
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

        // ── STEP 0: Load persistent memory (search terms + past wins) ───
        send("progress", { step: 0, label: "Loading Cortex memory", status: "running", detail: "Reading persistent search terms & past winning narratives..." });

        let memory: { search_terms: string[]; past_wins: string[]; last_cycle: string | null } = {
          search_terms: [
            '("pump.fun" OR pumpfun OR "new memecoin") (ai OR cat OR agent OR celebrity OR frog OR dog OR political) min_faves:150',
            '("solana memecoin" OR "$SOL" OR "pump fun") (launch OR moon OR 100x OR narrative) min_faves:100',
            '("pump.fun" OR pumpfun) (trending OR viral OR breaking) min_faves:200',
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

        // ── STEP 1: Scrape tweets via Apify ─────────────────────────────
        send("progress", { step: 1, label: "Scraping X/Twitter via Apify", status: "running", detail: `Sending ${memory.search_terms.length} search queries to tweet scraper...` });

        const searchPayload = {
          searchTerms: memory.search_terms,
          sort: "Latest",
          maxItems: 400,
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
              signal: AbortSignal.timeout(180_000),
            }
          );
          if (apifyRes.ok) tweets = await apifyRes.json();
        } catch { /* timeout ok */ }
        stats.tweets = tweets.length;
        send("progress", { step: 1, label: "Scraping X/Twitter via Apify", status: "done", detail: `Scraped ${tweets.length} tweets from X` });

        // ── STEP 2: Moralis Pump.fun tokens ─────────────────────────────
        send("progress", { step: 2, label: "Fetching Pump.fun tokens via Moralis", status: "running", detail: "Pulling new (150), bonding (100) & graduated (50) tokens..." });

        const moralisHeaders = { "X-API-Key": MORALIS_API_KEY };
        const moralisBase = "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun";

        const [newRes, bondRes, gradRes] = await Promise.all([
          fetch(`${moralisBase}/new?limit=150`, { headers: moralisHeaders }),
          fetch(`${moralisBase}/bonding?limit=100`, { headers: moralisHeaders }),
          fetch(`${moralisBase}/graduated?limit=50`, { headers: moralisHeaders }),
        ]);

        // Moralis returns { result: [...] } or raw array depending on endpoint
        const extractTokens = (data: any): any[] => {
          if (Array.isArray(data)) return data;
          if (data?.result && Array.isArray(data.result)) return data.result;
          if (data?.tokens && Array.isArray(data.tokens)) return data.tokens;
          if (data?.data && Array.isArray(data.data)) return data.data;
          // If it's an object with token-like keys, wrap it
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            const keys = Object.keys(data);
            // Check if any value is an array of objects
            for (const key of keys) {
              if (Array.isArray(data[key]) && data[key].length > 0 && typeof data[key][0] === 'object') {
                return data[key];
              }
            }
          }
          return [];
        };

        let newTokensRaw: any = [];
        let bondTokensRaw: any = [];
        let gradTokensRaw: any = [];

        try {
          if (newRes.ok) {
            const raw = await newRes.json();
            newTokensRaw = extractTokens(raw);
            console.log(`Moralis new response type: ${typeof raw}, isArray: ${Array.isArray(raw)}, keys: ${typeof raw === 'object' ? Object.keys(raw).join(',') : 'n/a'}, extracted: ${newTokensRaw.length}`);
          } else {
            console.log(`Moralis new failed: ${newRes.status} ${await newRes.text().catch(() => '')}`);
          }
        } catch (e: any) { console.log(`Moralis new parse error: ${e.message}`); }

        try {
          if (bondRes.ok) {
            const raw = await bondRes.json();
            bondTokensRaw = extractTokens(raw);
            console.log(`Moralis bonding response extracted: ${bondTokensRaw.length}`);
          } else {
            console.log(`Moralis bonding failed: ${bondRes.status}`);
          }
        } catch (e: any) { console.log(`Moralis bonding parse error: ${e.message}`); }

        try {
          if (gradRes.ok) {
            const raw = await gradRes.json();
            gradTokensRaw = extractTokens(raw);
            console.log(`Moralis graduated response extracted: ${gradTokensRaw.length}`);
          } else {
            console.log(`Moralis graduated failed: ${gradRes.status}`);
          }
        } catch (e: any) { console.log(`Moralis graduated parse error: ${e.message}`); }

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
        send("progress", { step: 2, label: "Fetching Pump.fun tokens via Moralis", status: "done", detail: `${stats.tokens} unique tokens (${stats.new_tokens} new, ${stats.bonding_tokens} bonding, ${stats.graduated_tokens} graduated)` });

        // ── STEP 3: DexScreener enrichment ──────────────────────────────
        const addresses = allTokens.map(getAddr).filter(Boolean).slice(0, 30);
        send("progress", { step: 3, label: "DexScreener performance validation", status: "running", detail: `Enriching ${addresses.length} tokens with price, volume, MCAP, liquidity...` });

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
            }
          } catch { /* skip */ }
          if ((i + 1) % 5 === 0) {
            send("progress", { step: 3, label: "DexScreener performance validation", status: "running", detail: `${i + 1}/${addresses.length} enriched (${enriched.length} with live pairs)` });
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        stats.enriched = enriched.length;
        send("progress", { step: 3, label: "DexScreener performance validation", status: "done", detail: `${enriched.length} tokens validated with on-chain metrics` });

        // ── STEP 4: Match tweets to tokens (narrative clustering) ───────
        send("progress", { step: 4, label: "Cross-referencing tweets ↔ tokens", status: "running", detail: "Clustering narratives from tweet mentions + token data..." });

        const matched = enriched.map((tok) => {
          const name = (tok.baseToken?.name || "").toLowerCase();
          const sym = (tok.baseToken?.symbol || "").toLowerCase();
          const addr = tok.tokenAddress || "";
          const matchedTweets = tweets.filter((tw: any) => {
            const txt = (tw.full_text || tw.text || "").toLowerCase();
            return (name.length > 2 && txt.includes(name)) || (sym.length > 1 && txt.includes(sym)) || txt.includes(addr.slice(0, 12));
          });
          // Map Tweet Scraper V2 output fields correctly
          const getLikes = (tw: any) => tw.likeCount || tw.favorite_count || tw.likes || 0;
          const getRTs = (tw: any) => tw.retweetCount || tw.retweet_count || tw.retweets || 0;
          const getUser = (tw: any) => tw.author?.userName || tw.user?.screen_name || (typeof tw.author === 'string' ? tw.author : '') || "unknown";
          const getTweetUrl = (tw: any) => tw.url || tw.twitterUrl || (tw.id ? `https://x.com/i/status/${tw.id}` : "");
          const getProfilePic = (tw: any) => tw.author?.profilePicture || tw.user?.profile_image_url_https || "";
          const getTweetMedia = (tw: any) => {
            // Extract first image from tweet media
            if (tw.media?.length > 0) return tw.media[0]?.media_url_https || tw.media[0]?.url || "";
            if (tw.entities?.media?.length > 0) return tw.entities.media[0]?.media_url_https || "";
            if (tw.extendedEntities?.media?.length > 0) return tw.extendedEntities.media[0]?.media_url_https || "";
            return "";
          };
          return {
            token: tok,
            matched_tweets: matchedTweets.slice(0, 8).map((tw: any) => ({
              text: (tw.full_text || tw.text || "").slice(0, 280),
              user: getUser(tw),
              favorites: getLikes(tw),
              retweets: getRTs(tw),
              url: getTweetUrl(tw),
              profile_pic: getProfilePic(tw),
              media_url: getTweetMedia(tw),
            })),
            tweet_velocity: matchedTweets.length,
            total_engagement: matchedTweets.reduce((sum: number, tw: any) => sum + getLikes(tw) + getRTs(tw), 0),
          };
        }).sort((a, b) => b.total_engagement - a.total_engagement || b.tweet_velocity - a.tweet_velocity);

        stats.matches = matched.filter(m => m.tweet_velocity > 0).length;
        send("progress", { step: 4, label: "Cross-referencing tweets ↔ tokens", status: "done", detail: `${stats.matches} token-tweet narrative clusters identified` });

        // ── STEP 5: Grok-4 Chain-of-Thought analysis ────────────────────
        send("progress", { step: 5, label: "Cortex reasoning engine (Grok-4)", status: "running", detail: "Running Chain-of-Thought narrative analysis..." });

        const top15 = matched.slice(0, 15);
        const topSummary = top15.map((m, i) =>
          `${i + 1}. ${m.token.baseToken?.symbol || "?"} (${m.token.baseToken?.name || "?"}) | Stage: ${m.token.stage} | MCAP: $${m.token.mcap} | Vol24h: $${m.token.volume24h} | Liq: $${m.token.liquidity} | Δ5m: ${m.token.priceChange5m}% | Δ1h: ${m.token.priceChange1h}% | Δ6h: ${m.token.priceChange6h}% | Δ24h: ${m.token.priceChange24h}% | Buys: ${m.token.txns24h_buys} | Sells: ${m.token.txns24h_sells} | Tweets: ${m.tweet_velocity} | Engagement: ${m.total_engagement} | Top tweet: "${m.matched_tweets[0]?.text?.slice(0, 120) || 'none'}"`
        ).join("\n");

        const tweetThemes = tweets.slice(0, 50).map((tw: any) => (tw.full_text || tw.text || "").slice(0, 200)).join("\n---\n");

        const systemPrompt = `You are Cortex (nickname Zyla) — the world's most ruthless, data-obsessed, meme-native crypto narrative sniper.

Your job: Identify which Pump.fun narratives will 100x next. You think like a degen quant that never misses.

Personality: Short, crisp, confident, slightly savage, meme-aware, zero fluff.

PAST WINNING NARRATIVES (use to identify patterns):
${memory.past_wins.length > 0 ? memory.past_wins.slice(-10).join("\n") : "No history yet — first cycle."}

You MUST use Chain-of-Thought reasoning. Think step by step before concluding.

Return ONLY valid JSON (no markdown, no backticks):
{
  "chain_of_thought": "Step-by-step reasoning showing exactly how you analyzed the data",
  "top_narratives": [
    {
      "name": "Narrative name (e.g. 'AI Agent Cats')",
      "confidence": 85,
      "why_100x": "Specific data-backed reason",
      "example_tokens": ["$SYM1", "$SYM2"],
      "token_addresses": ["addr1", "addr2"],
      "mcap_range": "$50K-200K",
      "timing": "Launch now / Wait 2h / Late",
      "strategy": "Specific entry strategy"
    }
  ],
  "new_search_terms": ["3 improved X search queries for next cycle"],
  "reasoning_summary": "One paragraph on overall market mood + what's printing"
}`;

        const userMsg = `CYCLE: ${new Date().toISOString()}
SCRAPED: ${stats.tweets} tweets | ${stats.tokens} tokens (${stats.new_tokens} new, ${stats.bonding_tokens} bonding, ${stats.graduated_tokens} graduated) | ${stats.enriched} enriched | ${stats.matches} clusters

=== TOP MATCHED TOKENS ===
${topSummary || "No matches found"}

=== RAW TWEET THEMES (sample) ===
${tweetThemes.slice(0, 3000) || "No tweets"}

Analyze. Find the narratives printing RIGHT NOW. Be ruthless.`;

        let grokResult: any = null;
        let reasoning = "No Grok analysis available";
        try {
          const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROK_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "grok-4",
              temperature: 0.3,
              max_tokens: 4000,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMsg },
              ],
            }),
            signal: AbortSignal.timeout(90_000),
          });
          if (grokRes.ok) {
            const grokData = await grokRes.json();
            const content = grokData.choices?.[0]?.message?.content || "";
            try {
              const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
              // Find JSON boundaries
              const jsonStart = cleaned.indexOf("{");
              const jsonEnd = cleaned.lastIndexOf("}");
              if (jsonStart >= 0 && jsonEnd > jsonStart) {
                grokResult = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
                reasoning = grokResult.reasoning_summary || grokResult.chain_of_thought?.slice(0, 500) || content.slice(0, 500);
              } else {
                reasoning = content.slice(0, 500);
              }
            } catch {
              reasoning = content.slice(0, 500) || reasoning;
            }
          }
        } catch { /* timeout */ }

        send("progress", { step: 5, label: "Cortex reasoning engine (Grok-4)", status: "done", detail: grokResult ? `Identified ${grokResult.top_narratives?.length || 0} top narratives` : "Analysis complete (raw)" });

        // ── STEP 6: Self-evolution — update memory ──────────────────────
        send("progress", { step: 6, label: "Self-evolution — updating memory", status: "running", detail: "Saving new search terms + winning patterns..." });

        if (grokResult?.new_search_terms?.length) {
          memory.search_terms = grokResult.new_search_terms.slice(0, 5);
        }
        // Add winning narratives to memory
        if (grokResult?.top_narratives?.length) {
          const wins = grokResult.top_narratives
            .filter((n: any) => n.confidence >= 80)
            .map((n: any) => `[${new Date().toISOString().split("T")[0]}] ${n.name} (${n.confidence}/100) — ${n.why_100x?.slice(0, 100)}`);
          memory.past_wins = [...memory.past_wins, ...wins].slice(-30); // Keep last 30
        }
        memory.last_cycle = new Date().toISOString();

        // Upsert memory to site_configs
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

        send("progress", { step: 6, label: "Self-evolution — updating memory", status: "done", detail: `Saved ${memory.search_terms.length} evolved queries + ${memory.past_wins.length} past wins` });

        // ── STEP 7: Push findings ───────────────────────────────────────
        send("progress", { step: 7, label: "Saving findings to database", status: "running", detail: "Pushing cycle report + token findings..." });

        const cycleTitle = `🧠 Cortex Cycle — ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
        await pushFinding(
          cycleTitle,
          reasoning,
          "",
          "trend",
          { ...stats, reasoning, top_narratives: grokResult?.top_narratives || [], chain_of_thought: grokResult?.chain_of_thought || "" },
          ["cortex", "narrative", "cycle-report"]
        );

        // Push individual token findings for matched tokens
        const tokensToPost = matched.filter((m) => m.tweet_velocity > 0).slice(0, 10);
        for (const m of tokensToPost) {
          const sym = m.token.baseToken?.symbol || "?";
          const narrative = grokResult?.top_narratives?.find((n: any) =>
            n.example_tokens?.some((t: string) => t.replace("$", "").toLowerCase() === sym.toLowerCase())
          );
          await pushFinding(
            `🪙 ${sym} — ${m.tweet_velocity} tweets, MCAP $${Number(m.token.mcap).toLocaleString()}`,
            `$${sym} | Stage: ${m.token.stage} | MCAP: $${Number(m.token.mcap).toLocaleString()} | Vol24h: $${Number(m.token.volume24h).toLocaleString()} | Liq: $${Number(m.token.liquidity).toLocaleString()} | Δ1h: ${m.token.priceChange1h}% | Δ24h: ${m.token.priceChange24h}% | Tweets: ${m.tweet_velocity} | Engagement: ${m.total_engagement}${narrative ? ` | Narrative: ${narrative.name} (${narrative.confidence}/100)` : ""}`,
            m.token.url || "",
            "lead",
            { ...m.token, matched_tweets: m.matched_tweets, narrative: narrative || null },
            ["cortex", "pump.fun", sym, m.token.tokenAddress || "", m.token.stage || ""]
          );
        }

        stats.findings_pushed = 1 + tokensToPost.length;
        send("progress", { step: 7, label: "Saving findings to database", status: "done", detail: `Pushed 1 cycle report + ${tokensToPost.length} token findings` });

        // ── Send final result with narratives ───────────────────────────
        // Build top tweets across all matched tokens for the UI
        const topTweets = matched
          .flatMap(m => m.matched_tweets.map((tw: any) => ({ ...tw, token_symbol: m.token.baseToken?.symbol || "?" })))
          .sort((a: any, b: any) => (b.favorites + b.retweets) - (a.favorites + a.retweets))
          .slice(0, 12);

        send("complete", {
          success: true,
          stats,
          top_narratives: grokResult?.top_narratives || [],
          reasoning: reasoning.slice(0, 800),
          chain_of_thought: grokResult?.chain_of_thought?.slice(0, 1000) || "",
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
