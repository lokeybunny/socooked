const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNNt8cf7TbfHpvbR8e4H43B6v4Jm5d"; // SPL Token Program

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

    // Query each wallet's token accounts for the specific mint
    const results: {
      wallet: string;
      balance: number;
      rawAmount: string;
      decimals: number;
    }[] = [];

    for (const wallet of wallets) {
      try {
        const rpcRes = await fetch(SOLANA_RPC, {
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
          console.error(`RPC error for ${wallet}:`, rpcData.error);
          results.push({ wallet, balance: 0, rawAmount: "0", decimals: 0 });
          continue;
        }

        const accounts: TokenAccountInfo[] = rpcData.result?.value || [];
        let totalBalance = 0;
        let decimals = 6;

        for (const acct of accounts) {
          const info = acct.account.data.parsed.info;
          totalBalance += info.tokenAmount.uiAmount || 0;
          decimals = info.tokenAmount.decimals;
        }

        results.push({
          wallet,
          balance: totalBalance,
          rawAmount: String(Math.round(totalBalance * Math.pow(10, decimals))),
          decimals,
        });
      } catch (err) {
        console.error(`Error fetching wallet ${wallet}:`, err);
        results.push({ wallet, balance: 0, rawAmount: "0", decimals: 0 });
      }
    }

    // Also fetch current token price from DexScreener
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
