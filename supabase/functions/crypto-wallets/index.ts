const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://rpc.ankr.com/solana",
  "https://api.mainnet-beta.solana.com",
];

let rpcCursor = 0;
function nextRpc(): string {
  const rpc = RPCS[rpcCursor % RPCS.length];
  rpcCursor++;
  return rpc;
}

async function rpcCallWithFallback(body: string, label: string): Promise<any> {
  const startRpc = nextRpc();
  const tried = new Set<string>();

  // Try starting RPC, then fallback to others
  const tryOrder = [startRpc, ...RPCS.filter(r => r !== startRpc)];
  for (const rpc of tryOrder) {
    if (tried.has(rpc)) continue;
    tried.add(rpc);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.error?.code === 429) {
        console.warn(`Rate limited: ${rpc} for ${label}`);
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      if (data.error) continue;
      return data;
    } catch {
      continue;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const wallets: string[] = body.wallets || [];
    const tokenMint: string = body.token_mint || "7oXNE1dbpHUp6dn1JF8pRgCtzfCy4P2FuBneWjZHpump";

    if (!wallets.length) {
      return new Response(
        JSON.stringify({ error: "No wallet addresses provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Process wallets in pairs (token + sol) sequentially, rotating RPCs
    const results: { wallet: string; balance: number; rawAmount: string; decimals: number; solBalance: number }[] = [];

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      const tag = wallet.slice(0, 8);

      // Small delay between wallets to avoid burst rate limits
      if (i > 0) await new Promise(r => setTimeout(r, 150));

      // Fetch token balance and SOL balance in parallel (2 calls to different RPCs)
      const [tokenData, solData] = await Promise.all([
        rpcCallWithFallback(
          JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "getTokenAccountsByOwner",
            params: [wallet, { mint: tokenMint }, { encoding: "jsonParsed" }],
          }),
          tag
        ),
        rpcCallWithFallback(
          JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getBalance", params: [wallet] }),
          tag
        ),
      ]);

      let balance = 0, decimals = 6;
      if (tokenData) {
        for (const acct of (tokenData.result?.value || [])) {
          const info = acct.account.data.parsed.info;
          balance += info.tokenAmount.uiAmount || 0;
          decimals = info.tokenAmount.decimals;
        }
      }
      const solBalance = solData ? (solData.result?.value || 0) / 1e9 : 0;

      results.push({
        wallet, balance,
        rawAmount: String(Math.round(balance * Math.pow(10, decimals))),
        decimals, solBalance,
      });
    }

    // Token price from DexScreener
    let tokenPrice = 0, priceNative = 0, marketCap = 0;
    try {
      const dexRes = await fetch("https://api.dexscreener.com/latest/dex/pairs/solana/EPHW3pF79SD7DBssRMX9wC1btisJFKnG7VnDwg7mjX4i");
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        const pair = dexData?.pair || dexData?.pairs?.[0];
        if (pair) {
          tokenPrice = Number(pair.priceUsd) || 0;
          priceNative = Number(pair.priceNative) || 0;
          marketCap = pair.marketCap || pair.fdv || 0;
        }
      }
    } catch {}

    const solPriceUsd = priceNative > 0 ? tokenPrice / priceNative : 0;
    const totalTokens = results.reduce((s, r) => s + r.balance, 0);
    const totalNativeSol = results.reduce((s, r) => s + r.solBalance, 0);
    const tokenHoldingValueSol = totalTokens * priceNative;
    const tokenHoldingValueUsd = totalTokens * tokenPrice;
    const nativeSolValueUsd = totalNativeSol * solPriceUsd;

    return new Response(JSON.stringify({
      wallets: results,
      totals: {
        totalTokens,
        holdingPct: (totalTokens / 1_000_000_000) * 100,
        holdingValueUsd: tokenHoldingValueUsd + nativeSolValueUsd,
        holdingValueSol: tokenHoldingValueSol + totalNativeSol,
        tokenHoldingValueSol,
        tokenHoldingValueUsd,
        nativeSolBalance: totalNativeSol,
        nativeSolValueUsd,
        tokenPrice, priceNative, marketCap, solPriceUsd,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
