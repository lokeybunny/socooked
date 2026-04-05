const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
];

async function getWalletBalance(wallet: string, tokenMint: string): Promise<{ balance: number; decimals: number }> {
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1,
    method: "getTokenAccountsByOwner",
    params: [wallet, { mint: tokenMint }, { encoding: "jsonParsed" }],
  });

  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      if (data.error?.code === 429) {
        console.warn(`${rpc} rate limited for ${wallet.slice(0,8)}, trying next`);
        continue;
      }
      if (data.error) {
        console.warn(`${rpc} error for ${wallet.slice(0,8)}:`, data.error.message);
        continue;
      }
      const accounts = data.result?.value || [];
      let totalBalance = 0;
      let decimals = 6;
      for (const acct of accounts) {
        const info = acct.account.data.parsed.info;
        totalBalance += info.tokenAmount.uiAmount || 0;
        decimals = info.tokenAmount.decimals;
      }
      return { balance: totalBalance, decimals };
    } catch (err) {
      console.warn(`${rpc} fetch failed for ${wallet.slice(0,8)}:`, err);
    }
  }
  return { balance: 0, decimals: 6 };
}

/** Also fetch native SOL balance for a wallet */
async function getNativeSolBalance(wallet: string): Promise<number> {
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1,
    method: "getBalance",
    params: [wallet],
  });

  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      if (data.error?.code === 429) continue;
      if (data.error) continue;
      return (data.result?.value || 0) / 1e9; // lamports to SOL
    } catch {
      continue;
    }
  }
  return 0;
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

    // Batch wallets in groups of 3 with 300ms delay between batches
    const results: { wallet: string; balance: number; rawAmount: string; decimals: number; solBalance: number }[] = [];
    const BATCH_SIZE = 3;
    for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
      if (i > 0) await new Promise(r => setTimeout(r, 300));
      const batch = wallets.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (wallet) => {
          const [{ balance, decimals }, solBalance] = await Promise.all([
            getWalletBalance(wallet, tokenMint),
            getNativeSolBalance(wallet),
          ]);
          return {
            wallet, balance,
            rawAmount: String(Math.round(balance * Math.pow(10, decimals))),
            decimals,
            solBalance,
          };
        })
      );
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

    // SOL price from DexScreener (SOL/USD)
    let solPriceUsd = 0;
    try {
      const solRes = await fetch("https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112");
      if (solRes.ok) {
        const solData = await solRes.json();
        const pair = solData?.pairs?.[0];
        if (pair) {
          solPriceUsd = Number(pair.priceUsd) || 0;
        }
      }
    } catch {}

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
