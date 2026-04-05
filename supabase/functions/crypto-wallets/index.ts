const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
  "https://rpc.ankr.com/solana",
];

async function rpcCall(body: string, preferredIdx: number): Promise<any> {
  // Try preferred RPC first, then others
  const order = [preferredIdx, ...Array.from({ length: RPCS.length }, (_, i) => i).filter(i => i !== preferredIdx)];
  for (const idx of order) {
    try {
      const res = await fetch(RPCS[idx], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      if (data.error?.code === 429) continue;
      if (data.error) continue;
      return data;
    } catch {
      continue;
    }
  }
  return null;
}

async function getWalletTokenBalance(wallet: string, tokenMint: string, rpcIdx: number): Promise<{ balance: number; decimals: number }> {
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1,
    method: "getTokenAccountsByOwner",
    params: [wallet, { mint: tokenMint }, { encoding: "jsonParsed" }],
  });
  const data = await rpcCall(body, rpcIdx);
  if (!data) return { balance: 0, decimals: 6 };
  const accounts = data.result?.value || [];
  let totalBalance = 0;
  let decimals = 6;
  for (const acct of accounts) {
    const info = acct.account.data.parsed.info;
    totalBalance += info.tokenAmount.uiAmount || 0;
    decimals = info.tokenAmount.decimals;
  }
  return { balance: totalBalance, decimals };
}

async function getNativeSolBalance(wallet: string, rpcIdx: number): Promise<number> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet] });
  const data = await rpcCall(body, rpcIdx);
  if (!data) return 0;
  return (data.result?.value || 0) / 1e9;
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

    // Fetch all wallet balances in parallel, distributing across RPCs via round-robin
    const allPromises = wallets.map((wallet, i) => {
      const rpcIdx = i % RPCS.length;
      return Promise.all([
        getWalletTokenBalance(wallet, tokenMint, rpcIdx),
        getNativeSolBalance(wallet, rpcIdx),
      ]).then(([{ balance, decimals }, solBalance]) => ({
        wallet, balance,
        rawAmount: String(Math.round(balance * Math.pow(10, decimals))),
        decimals, solBalance,
      }));
    });

    const results = await Promise.all(allPromises);

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

    // Derive SOL price from token pair data (tokenPriceUsd / tokenPriceSol = solPriceUsd)
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
