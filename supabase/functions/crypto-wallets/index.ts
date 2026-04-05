const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

async function rpcCall(body: unknown): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
    try {
      const res = await fetch(SOLANA_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error?.code === 429) {
        console.warn(`Rate limited attempt ${attempt + 1}/4`);
        continue;
      }
      return data;
    } catch (err) {
      console.error(`RPC fetch error attempt ${attempt + 1}:`, err);
    }
  }
  return { result: { value: [] } };
}

async function getWalletBalance(wallet: string, tokenMint: string): Promise<{ balance: number; decimals: number }> {
  // Use { mint } filter — works across both SPL Token and Token-2022
  const data = await rpcCall({
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [wallet, { mint: tokenMint }, { encoding: "jsonParsed" }],
  });

  if (data.error) {
    console.error(`RPC error for ${wallet}:`, data.error);
    return { balance: 0, decimals: 6 };
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

    const results: {
      wallet: string;
      balance: number;
      rawAmount: string;
      decimals: number;
    }[] = [];

    // Process sequentially with 1s gaps to avoid rate limits
    for (let i = 0; i < wallets.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000));

      const wallet = wallets[i];
      try {
        const { balance, decimals } = await getWalletBalance(wallet, tokenMint);
        results.push({
          wallet,
          balance,
          rawAmount: String(Math.round(balance * Math.pow(10, decimals))),
          decimals,
        });
      } catch (err) {
        console.error(`Error fetching wallet ${wallet}:`, err);
        results.push({ wallet, balance: 0, rawAmount: "0", decimals: 0 });
      }
    }

    // Fetch current token price from DexScreener
    const POOL = "EPHW3pF79SD7DBssRMX9wC1btisJFKnG7VnDwg7mjX4i";
    let tokenPrice = 0;
    let priceNative = 0;
    let marketCap = 0;

    try {
      const dexRes = await fetch(
        `https://api.dexscreener.com/latest/dex/pairs/solana/${POOL}`
      );
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

    const totalTokens = results.reduce((sum, r) => sum + r.balance, 0);
    const totalSupply = 1_000_000_000;
    const holdingPct = (totalTokens / totalSupply) * 100;
    const holdingValueUsd = totalTokens * tokenPrice;
    const holdingValueSol = totalTokens * priceNative;

    return new Response(
      JSON.stringify({
        wallets: results,
        totals: {
          totalTokens,
          holdingPct,
          holdingValueUsd,
          holdingValueSol,
          tokenPrice,
          priceNative,
          marketCap,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("crypto-wallets error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
