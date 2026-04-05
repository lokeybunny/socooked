const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const POOL_ADDRESS = "EPHW3pF79SD7DBssRMX9wC1btisJFKnG7VnDwg7mjX4i";
const GECKO_BASE = "https://api.geckoterminal.com/api/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const timeframe = url.searchParams.get("timeframe") || "hour";
    const limit = Math.min(Number(url.searchParams.get("limit") || "200"), 1000);

    // Also fetch current token info from DexScreener
    const [ohlcvRes, dexRes] = await Promise.all([
      fetch(
        `${GECKO_BASE}/networks/solana/pools/${POOL_ADDRESS}/ohlcv/${timeframe}?aggregate=1&limit=${limit}`,
        { headers: { Accept: "application/json" } }
      ),
      fetch(
        `https://api.dexscreener.com/latest/dex/pairs/solana/${POOL_ADDRESS}`,
        { headers: { Accept: "application/json" } }
      ),
    ]);

    if (!ohlcvRes.ok) {
      throw new Error(`GeckoTerminal error [${ohlcvRes.status}]: ${await ohlcvRes.text()}`);
    }

    const ohlcvData = await ohlcvRes.json();
    const ohlcvList: number[][] = ohlcvData?.data?.attributes?.ohlcv_list ?? [];

    // Format: [timestamp, open, high, low, close, volume]
    const candles = ohlcvList
      .map(([ts, o, h, l, c, v]) => ({
        timestamp: ts * 1000,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
      }))
      .reverse(); // oldest first

    let pairInfo = null;
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pair = dexData?.pair || dexData?.pairs?.[0];
      if (pair) {
        pairInfo = {
          name: pair.baseToken?.name,
          symbol: pair.baseToken?.symbol,
          priceUsd: pair.priceUsd,
          priceNative: pair.priceNative,
          marketCap: pair.marketCap || pair.fdv,
          liquidity: pair.liquidity?.usd,
          priceChange: pair.priceChange,
          volume24h: pair.volume?.h24,
          imageUrl: pair.info?.imageUrl,
        };
      }
    }

    return new Response(
      JSON.stringify({ candles, pairInfo }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("crypto-chart error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
