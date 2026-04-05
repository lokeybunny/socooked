const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM = "TokenkegQfeZyiNNt8cf7TbfHpvbR8e4H43B6v4Jm5d";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

async function rpcCall(body: unknown, retries = 4): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
    }
    try {
      const res = await fetch(SOLANA_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error?.code === 429) {
        console.warn(`RPC rate limited (attempt ${attempt + 1}/${retries}), backing off...`);
        continue;
      }
      return data;
    } catch (err) {
      console.error(`RPC fetch error (attempt ${attempt + 1}):`, err);
      if (attempt === retries - 1) throw err;
    }
  }
  return { error: { code: 429, message: "Rate limited after all retries" } };
}

async function getWalletBalance(wallet: string, tokenMint: string): Promise<{ balance: number; decimals: number }> {
  // Query BOTH token programs (SPL Token and Token-2022)
  for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    const data = await rpcCall({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        wallet,
        { programId },
        { encoding: "jsonParsed" },
      ],
    });

    if (data.error) {
      console.error(`RPC error for ${wallet} (program ${programId.slice(0,5)}):`, data.error);
      continue;
    }

    const accounts = data.result?.value || [];
    let totalBalance = 0;
    let decimals = 6;
    let found = false;

    for (const acct of accounts) {
      const info = acct.account.data.parsed.info;
      if (info.mint === tokenMint) {
        totalBalance += info.tokenAmount.uiAmount || 0;
        decimals = info.tokenAmount.decimals;
        found = true;
      }
    }

    if (found) {
      return { balance: totalBalance, decimals };
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

    // Process wallets sequentially with 1.5s gap to avoid rate limits
    for (let i = 0; i < wallets.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 800));

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
