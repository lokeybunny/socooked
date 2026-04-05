const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOLANA_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
];

interface TokenAccountInfo {
  pubkey: string;
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          owner: string;
          tokenAmount: {
            amount: string;
            decimals: number;
            uiAmount: number;
            uiAmountString: string;
          };
        };
      };
    };
  };
}

async function fetchWithRetry(wallet: string, tokenMint: string, retries = 3): Promise<{ balance: number; decimals: number }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    // Rotate through RPCs on each attempt
    const rpc = SOLANA_RPCS[attempt % SOLANA_RPCS.length];
    try {
      const rpcRes = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [
            wallet,
            { mint: tokenMint },
            { encoding: "jsonParsed" },
          ],
        }),
      });

      const rpcData = await rpcRes.json();

      if (rpcData.error) {
        // Rate limited — wait and retry
        if (rpcData.error.code === 429) {
          console.warn(`RPC rate limited for ${wallet} on attempt ${attempt + 1}, retrying...`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        console.error(`RPC error for ${wallet}:`, rpcData.error);
        return { balance: 0, decimals: 6 };
      }

      const accounts: TokenAccountInfo[] = rpcData.result?.value || [];
      let totalBalance = 0;
      let decimals = 6;

      for (const acct of accounts) {
        const info = acct.account.data.parsed.info;
        totalBalance += info.tokenAmount.uiAmount || 0;
        decimals = info.tokenAmount.decimals;
      }

      return { balance: totalBalance, decimals };
    } catch (err) {
      console.error(`Attempt ${attempt + 1} error for ${wallet}:`, err);
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  return { balance: 0, decimals: 6 };
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

    // Stagger requests with small delays to avoid rate limiting
    for (let i = 0; i < wallets.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 400));
      const wallet = wallets[i];
      const { balance, decimals } = await fetchWithRetry(wallet, tokenMint);
      results.push({
        wallet,
        balance,
        rawAmount: String(Math.round(balance * Math.pow(10, decimals))),
        decimals,
      });
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
