import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Percent,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

/* ── token config ── */
const TOKEN_ADDRESS = "7oXNE1dbpHUp6dn1JF8pRgCtzfCy4P2FuBneWjZHpump";
const ENTRY_MCAP = 888_000;
const INITIAL_BAG_SOL = 65.91;
const SUPPLY = 1_000_000_000;

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PairInfo {
  name: string;
  symbol: string;
  priceUsd: string;
  priceNative: string;
  marketCap: number;
  liquidity: number;
  priceChange: Record<string, number>;
  volume24h: number;
  imageUrl?: string;
}

interface WalletRow {
  id: string;
  wallet_address: string;
  label: string | null;
  is_active: boolean;
}

interface WalletBalance {
  wallet: string;
  balance: number;
}

interface WalletTotals {
  totalTokens: number;
  holdingPct: number;
  holdingValueUsd: number;
  holdingValueSol: number;
  tokenPrice: number;
  priceNative: number;
  marketCap: number;
}

const chartConfig: ChartConfig = {
  close: { label: "Price", color: "hsl(var(--primary))" },
  mcap: { label: "Market Cap", color: "hsl(var(--accent))" },
};

const fmtMcap = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtSol = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} SOL`;
const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/** Extract wallet address from a Solscan URL or plain address */
function parseWalletInput(input: string): string {
  const trimmed = input.trim();
  // Match solscan.io/account/<address>
  const solscanMatch = trimmed.match(/solscan\.io\/account\/([A-Za-z0-9]{32,44})/);
  if (solscanMatch) return solscanMatch[1];
  // Plain Solana address
  if (/^[A-Za-z0-9]{32,44}$/.test(trimmed)) return trimmed;
  return trimmed;
}

export default function Crypto() {
  const { user } = useAuth();

  /* ── chart state ── */
  const [candles, setCandles] = useState<Candle[]>([]);
  const [pairInfo, setPairInfo] = useState<PairInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleIdx, setVisibleIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── wallet state ── */
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [walletBalances, setWalletBalances] = useState<WalletBalance[]>([]);
  const [walletTotals, setWalletTotals] = useState<WalletTotals | null>(null);
  const [newWalletInput, setNewWalletInput] = useState("");
  const [newWalletLabel, setNewWalletLabel] = useState("");
  const [addingWallet, setAddingWallet] = useState(false);
  const [fetchingBalances, setFetchingBalances] = useState(false);

  /* ── fetch chart data ── */
  const fetchChart = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crypto-chart", {
        body: { timeframe: "hour", limit: 200 },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.error) throw new Error(parsed.error);
      setCandles(parsed.candles || []);
      setPairInfo(parsed.pairInfo || null);
      setVisibleIdx(parsed.candles?.length || 0);
    } catch (err: any) {
      console.error("Failed to fetch chart:", err);
      toast.error("Failed to load chart data");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── fetch wallets from DB ── */
  const fetchWallets = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("crypto_wallets")
      .select("id, wallet_address, label, is_active")
      .eq("token_address", TOKEN_ADDRESS)
      .eq("is_active", true)
      .order("created_at");
    setWallets((data as WalletRow[]) || []);
  }, [user]);

  /* ── fetch on-chain balances ── */
  const fetchBalances = useCallback(async () => {
    if (!wallets.length) {
      setWalletBalances([]);
      setWalletTotals(null);
      return;
    }
    setFetchingBalances(true);
    try {
      const { data, error } = await supabase.functions.invoke("crypto-wallets", {
        body: {
          wallets: wallets.map((w) => w.wallet_address),
          token_mint: TOKEN_ADDRESS,
        },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      setWalletBalances(parsed.wallets || []);
      setWalletTotals(parsed.totals || null);
    } catch (err: any) {
      console.error("Failed to fetch balances:", err);
      toast.error("Failed to fetch wallet balances");
    } finally {
      setFetchingBalances(false);
    }
  }, [wallets]);

  useEffect(() => {
    fetchChart();
    fetchWallets();
  }, [fetchChart, fetchWallets]);

  useEffect(() => {
    if (wallets.length > 0) fetchBalances();
  }, [wallets, fetchBalances]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      fetchChart();
      if (wallets.length > 0) fetchBalances();
    }, 60_000);
    return () => clearInterval(id);
  }, [fetchChart, fetchBalances, wallets.length]);

  /* ── add wallet ── */
  const handleAddWallet = async () => {
    if (!user || !newWalletInput.trim()) return;
    const address = parseWalletInput(newWalletInput);
    if (address.length < 32) {
      toast.error("Invalid wallet address or Solscan URL");
      return;
    }
    setAddingWallet(true);
    try {
      const { error } = await supabase.from("crypto_wallets").insert({
        user_id: user.id,
        wallet_address: address,
        label: newWalletLabel.trim() || null,
        token_address: TOKEN_ADDRESS,
      });
      if (error) {
        if (error.code === "23505") toast.error("Wallet already added");
        else throw error;
      } else {
        toast.success("Wallet added");
        setNewWalletInput("");
        setNewWalletLabel("");
        fetchWallets();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to add wallet");
    } finally {
      setAddingWallet(false);
    }
  };

  /* ── remove wallet ── */
  const handleRemoveWallet = async (id: string) => {
    await supabase.from("crypto_wallets").delete().eq("id", id);
    toast.success("Wallet removed");
    fetchWallets();
  };

  /* ── simulation / PNL ── */
  const visibleData = candles.slice(0, visibleIdx);
  const currentCandle = visibleData[visibleData.length - 1];
  const entryCandle = candles[0];
  const entryPrice = entryCandle?.close || 1;
  const currentPrice = currentCandle?.close || entryPrice;
  const currentMcapSim = currentPrice * SUPPLY;
  const isSimulating = visibleIdx < candles.length;

  // Use real wallet data when available and not simulating
  const realHoldingSol = walletTotals?.holdingValueSol ?? 0;
  const realHoldingPct = walletTotals?.holdingPct ?? 0;
  const hasWalletData = wallets.length > 0 && walletTotals != null;

  const holdingValue = isSimulating
    ? INITIAL_BAG_SOL * (currentMcapSim / ENTRY_MCAP)
    : hasWalletData
    ? realHoldingSol
    : 0;

  const pnlSol = holdingValue - INITIAL_BAG_SOL;
  const priceChangePct = isSimulating
    ? ((currentMcapSim - ENTRY_MCAP) / ENTRY_MCAP) * 100
    : hasWalletData
    ? ((realHoldingSol - INITIAL_BAG_SOL) / INITIAL_BAG_SOL) * 100
    : 0;
  const isProfit = pnlSol >= 0;

  const tick = useCallback(() => {
    setVisibleIdx((prev) => {
      if (prev >= candles.length) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [candles.length]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(tick, 200);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, tick]);

  const startSimulation = () => {
    setVisibleIdx(1);
    setPlaying(true);
  };
  const reset = () => {
    setPlaying(false);
    setVisibleIdx(candles.length);
  };

  /* ── chart data ── */
  const chartData = visibleData.map((c) => ({
    time: format(new Date(c.timestamp), "MMM d HH:mm"),
    close: c.close,
    mcap: Math.round(c.close * SUPPLY),
  }));
  const prices = visibleData.map((d) => d.close);
  const minPrice = prices.length ? Math.min(...prices) * 0.95 : 0;
  const maxPrice = prices.length ? Math.max(...prices) * 1.05 : 1;
  const liveMcap = pairInfo?.marketCap || 0;
  const displayMcap =
    visibleIdx >= candles.length && liveMcap > 0
      ? liveMcap
      : currentCandle
      ? Math.round(currentCandle.close * SUPPLY)
      : 0;

  const displayHoldingPct = hasWalletData ? realHoldingPct : 0;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {pairInfo?.imageUrl && (
              <img src={pairInfo.imageUrl} alt={pairInfo.symbol} className="h-10 w-10 rounded-full" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                {pairInfo?.name || "Crypto"}{" "}
                {pairInfo?.symbol && <Badge variant="outline" className="text-xs">${pairInfo.symbol}</Badge>}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all">{TOKEN_ADDRESS}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { fetchChart(); if (wallets.length) fetchBalances(); }} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(`https://gmgn.ai/sol/token/${TOKEN_ADDRESS}`, "_blank")}>
              <ExternalLink className="h-4 w-4 mr-1" /> GMGN
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(`https://dexscreener.com/solana/${TOKEN_ADDRESS}`, "_blank")}>
              <ExternalLink className="h-4 w-4 mr-1" /> DexScreener
            </Button>
          </div>
        </div>

        {/* Live Price */}
        {pairInfo && (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-3xl font-bold text-foreground">${Number(pairInfo.priceUsd).toFixed(6)}</span>
            <span className="text-lg text-muted-foreground">{Number(pairInfo.priceNative).toFixed(8)} SOL</span>
            {pairInfo.priceChange?.h24 != null && (
              <Badge variant="outline" className={cn("text-sm", pairInfo.priceChange.h24 >= 0 ? "border-green-500/30 text-green-500" : "border-red-500/30 text-red-500")}>
                {fmtPct(pairInfo.priceChange.h24)} 24h
              </Badge>
            )}
          </div>
        )}

        {/* Wallet Management */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> My Wallets
              {fetchingBalances && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add wallet form */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Solscan URL or Wallet Address</Label>
                <Input
                  placeholder="https://solscan.io/account/... or wallet address"
                  value={newWalletInput}
                  onChange={(e) => setNewWalletInput(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="w-full sm:w-36">
                <Label className="text-xs text-muted-foreground">Label (optional)</Label>
                <Input
                  placeholder="e.g. Main"
                  value={newWalletLabel}
                  onChange={(e) => setNewWalletLabel(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddWallet} disabled={addingWallet || !newWalletInput.trim()} size="sm">
                  {addingWallet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Add
                </Button>
              </div>
            </div>

            {/* Wallet list */}
            {wallets.length > 0 && (
              <div className="space-y-2">
                {wallets.map((w) => {
                  const bal = walletBalances.find((b) => b.wallet === w.wallet_address);
                  return (
                    <div key={w.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {w.label && <Badge variant="secondary" className="text-xs">{w.label}</Badge>}
                          <a
                            href={`https://solscan.io/account/${w.wallet_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-primary hover:underline truncate"
                          >
                            {w.wallet_address.slice(0, 8)}…{w.wallet_address.slice(-6)}
                          </a>
                        </div>
                        {bal && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {bal.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveWallet(w.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                })}

                {/* Totals */}
                {walletTotals && (
                  <div className="border-t pt-2 mt-2 flex flex-wrap gap-4 text-sm">
                    <span className="text-muted-foreground">
                      Total: <span className="text-foreground font-medium">{walletTotals.totalTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> tokens
                    </span>
                    <span className="text-muted-foreground">
                      Holdings: <span className="text-foreground font-medium">{walletTotals.holdingPct.toFixed(4)}%</span>
                    </span>
                    <span className="text-muted-foreground">
                      Value: <span className="text-foreground font-medium">{walletTotals.holdingValueSol.toFixed(2)} SOL</span>
                      {" "}(${walletTotals.holdingValueUsd.toFixed(2)})
                    </span>
                  </div>
                )}
              </div>
            )}

            {wallets.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add your wallet addresses or Solscan URLs to track real on-chain holdings and PNL.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Percent className="h-3.5 w-3.5" /> Holdings
              </div>
              <p className="text-xl font-bold text-foreground">
                {displayHoldingPct > 0 ? `${displayHoldingPct.toFixed(4)}%` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> Holding Value
              </div>
              <p className="text-xl font-bold text-foreground">
                {holdingValue > 0 ? `${holdingValue.toFixed(2)} SOL` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                {isProfit ? <TrendingUp className="h-3.5 w-3.5 text-green-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                PNL (SOL)
              </div>
              <p className={cn("text-xl font-bold", hasWalletData || isSimulating ? (isProfit ? "text-green-500" : "text-red-500") : "text-foreground")}>
                {hasWalletData || isSimulating ? fmtSol(pnlSol) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                {isProfit ? <TrendingUp className="h-3.5 w-3.5 text-green-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                PNL (%)
              </div>
              <p className={cn("text-xl font-bold", hasWalletData || isSimulating ? (isProfit ? "text-green-500" : "text-red-500") : "text-foreground")}>
                {hasWalletData || isSimulating ? fmtPct(priceChangePct) : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Market Cap + Liquidity */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Market Cap</p>
              <p className="text-2xl font-bold text-foreground">{displayMcap > 0 ? fmtMcap(displayMcap) : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Liquidity</p>
              <p className="text-2xl font-bold text-foreground">{pairInfo?.liquidity ? fmtMcap(pairInfo.liquidity) : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">24h Volume</p>
              <p className="text-2xl font-bold text-foreground">{pairInfo?.volume24h ? fmtMcap(pairInfo.volume24h) : "—"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Price Chart — Real Data</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startSimulation} disabled={candles.length === 0}>
                  <Play className="h-4 w-4 mr-1" /> Simulate
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPlaying((p) => !p)} disabled={candles.length === 0}>
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={reset}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">{visibleIdx} / {candles.length}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && candles.length === 0 ? (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading chart data…
              </div>
            ) : candles.length === 0 ? (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">No chart data available</div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isProfit ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={isProfit ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={Math.max(Math.floor(chartData.length / 8), 1)} />
                  <YAxis yAxisId="price" domain={[minPrice, maxPrice]} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(6)}`} width={80} />
                  <YAxis yAxisId="mcap" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtMcap(v)} width={70} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === "close") return <span className="font-mono">${Number(value).toFixed(8)}</span>;
                          if (name === "mcap") return <span>{fmtMcap(Number(value))}</span>;
                          return <span>{String(value)}</span>;
                        }}
                      />
                    }
                  />
                  <ReferenceLine yAxisId="mcap" y={ENTRY_MCAP} stroke="hsl(45, 93%, 47%)" strokeDasharray="4 4" label={{ value: `Entry ${fmtMcap(ENTRY_MCAP)}`, fill: "hsl(45, 93%, 47%)", fontSize: 10 }} />
                  <Area yAxisId="price" type="monotone" dataKey="close" stroke={isProfit ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} strokeWidth={2} fill="url(#priceGrad)" isAnimationActive={false} />
                  <Area yAxisId="mcap" type="monotone" dataKey="mcap" stroke="hsl(var(--accent-foreground))" strokeWidth={1} strokeDasharray="3 3" fill="none" isAnimationActive={false} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Position Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Position Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Token</span>
                  <span className="font-mono text-foreground text-xs">{TOKEN_ADDRESS.slice(0, 8)}…{TOKEN_ADDRESS.slice(-4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Holdings %</span>
                  <span className="text-foreground font-medium">{displayHoldingPct > 0 ? `${displayHoldingPct.toFixed(4)}%` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry Mcap</span>
                  <span className="text-foreground font-mono">{fmtMcap(ENTRY_MCAP)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Mcap</span>
                  <span className="text-foreground font-mono">{displayMcap > 0 ? fmtMcap(displayMcap) : "—"}</span>
                </div>
              </div>
              <div className="space-y-2">
              <div className="flex justify-between">
                  <span className="text-muted-foreground">Initial Bag</span>
                  <span className="text-foreground font-medium">{INITIAL_BAG_SOL} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Value</span>
                  <span className={cn("font-medium", hasWalletData ? (isProfit ? "text-green-500" : "text-red-500") : "text-foreground")}>
                    {hasWalletData ? `${holdingValue.toFixed(2)} SOL ($${walletTotals!.holdingValueUsd.toFixed(2)})` : isSimulating ? `${holdingValue.toFixed(2)} SOL` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PNL</span>
                  <span className={cn("font-bold", hasWalletData || isSimulating ? (isProfit ? "text-green-500" : "text-red-500") : "text-foreground")}>
                    {hasWalletData || isSimulating ? `${fmtSol(pnlSol)} (${fmtPct(priceChangePct)})` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wallets</span>
                  <span className="text-foreground font-medium">{wallets.length} tracked</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
