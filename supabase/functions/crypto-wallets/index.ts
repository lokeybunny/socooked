const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://rpc.ankr.com/solana",
  "https://api.mainnet-beta.solana.com",
];

async function rpcCall(body: string, walletHint: string): Promise<any> {
  for (const rpc of RPCS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.error?.code === 429) {
        console.warn(`${rpc} rate limited for ${walletHint.slice(0,8)}`);
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

    // Process wallets in batches of 4, with 200ms between batches
    const BATCH = 4;
    const results: { wallet: string; balance: number; rawAmount: string; decimals: number; solBalance: number }[] = [];
    
    for (let i = 0; i < wallets.length; i += BATCH) {
      if (i > 0) await new Promise(r => setTimeout(r, 200));
      const batch = wallets.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (wallet) => {
        // Token balance
        const tokenBody = JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "getTokenAccountsByOwner",
          params: [wallet, { mint: tokenMint }, { encoding: "jsonParsed" }],
        });
        const tokenData = await rpcCall(tokenBody, wallet);
        let balance = 0, decimals = 6;
        if (tokenData) {
          for (const acct of (tokenData.result?.value || [])) {
            const info = acct.account.data.parsed.info;
            balance += info.tokenAmount.uiAmount || 0;
            decimals = info.tokenAmount.decimals;
          }
        }

        // Native SOL balance
        const solBody = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getBalance", params: [wallet] });
        const solData = await rpcCall(solBody, wallet);
        const solBalance = solData ? (solData.result?.value || 0) / 1e9 : 0;

        return {
          wallet, balance,
          rawAmount: String(Math.round(balance * Math.pow(10, decimals))),
          decimals, solBalance,
        };
      }));
      results.push(...batchResults);
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
