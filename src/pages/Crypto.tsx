import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

/* ── token + position config ── */
const TOKEN_ADDRESS = "7oXNE1dbpHUp6dn1JF8pRgCtzfCy4P2FuBneWjZHpump";
const POSITION = {
  holdingPct: 0.72,
  initialBagSol: 64.91,
  holdingSol: 15.14,
  initialPnlSol: -49.73,
  entryMcap: 888_000,
};

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

/* ── chart config ── */
const chartConfig: ChartConfig = {
  close: { label: "Price", color: "hsl(var(--primary))" },
  mcap: { label: "Market Cap", color: "hsl(var(--accent))" },
};

/* ── format helpers ── */
const fmtMcap = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtSol = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} SOL`;
const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export default function Crypto() {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [pairInfo, setPairInfo] = useState<PairInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleIdx, setVisibleIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── fetch real data ── */
  const fetchData = useCallback(async () => {
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── auto-refresh every 60s ── */
  useEffect(() => {
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  /* ── simulation playback ── */
  const visibleData = candles.slice(0, visibleIdx);
  const currentCandle = visibleData[visibleData.length - 1];
  const entryCandle = candles[0];

  // PNL: based on entry mcap vs current mcap
  const SUPPLY = 1_000_000_000;
  const entryPrice = entryCandle?.close || 1;
  const currentPrice = currentCandle?.close || entryPrice;
  const currentMcapSim = currentPrice * SUPPLY;
  const mcapChangePct = ((currentMcapSim - POSITION.entryMcap) / POSITION.entryMcap) * 100;
  const holdingValue = POSITION.initialBagSol * (currentMcapSim / POSITION.entryMcap);
  const pnlSol = holdingValue - POSITION.initialBagSol;
  const priceChangePct = mcapChangePct;
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
    volume: c.volume,
  }));

  const prices = visibleData.map((d) => d.close);
  const minPrice = prices.length ? Math.min(...prices) * 0.95 : 0;
  const maxPrice = prices.length ? Math.max(...prices) * 1.05 : 1;

  /* ── live mcap from DexScreener or simulated ── */
  const liveMcap = pairInfo?.marketCap || 0;
  const displayMcap =
    visibleIdx >= candles.length && liveMcap > 0
      ? liveMcap
      : currentCandle
      ? Math.round(currentCandle.close * 1_000_000_000) // rough supply estimate
      : 0;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {pairInfo?.imageUrl && (
              <img
                src={pairInfo.imageUrl}
                alt={pairInfo.symbol}
                className="h-10 w-10 rounded-full"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                {pairInfo?.name || "Crypto"}{" "}
                {pairInfo?.symbol && (
                  <Badge variant="outline" className="text-xs">
                    ${pairInfo.symbol}
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all">
                {TOKEN_ADDRESS}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  `https://gmgn.ai/sol/token/${TOKEN_ADDRESS}`,
                  "_blank"
                )
              }
            >
              <ExternalLink className="h-4 w-4 mr-1" /> GMGN
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  `https://dexscreener.com/solana/${TOKEN_ADDRESS}`,
                  "_blank"
                )
              }
            >
              <ExternalLink className="h-4 w-4 mr-1" /> DexScreener
            </Button>
          </div>
        </div>

        {/* Live Price */}
        {pairInfo && (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-3xl font-bold text-foreground">
              ${Number(pairInfo.priceUsd).toFixed(6)}
            </span>
            <span className="text-lg text-muted-foreground">
              {Number(pairInfo.priceNative).toFixed(8)} SOL
            </span>
            {pairInfo.priceChange?.h24 != null && (
              <Badge
                variant="outline"
                className={cn(
                  "text-sm",
                  pairInfo.priceChange.h24 >= 0
                    ? "border-green-500/30 text-green-500"
                    : "border-red-500/30 text-red-500"
                )}
              >
                {fmtPct(pairInfo.priceChange.h24)} 24h
              </Badge>
            )}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Percent className="h-3.5 w-3.5" /> Holdings
              </div>
              <p className="text-xl font-bold text-foreground">
                {POSITION.holdingPct}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> Holding Value
              </div>
              <p className="text-xl font-bold text-foreground">
                {visibleIdx < candles.length ? holdingValue.toFixed(2) : POSITION.holdingSol.toFixed(2)} SOL
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                {isProfit ? (
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                )}
                PNL (SOL)
              </div>
              <p
                className={cn(
                  "text-xl font-bold",
                  isProfit ? "text-green-500" : "text-red-500"
                )}
              >
                {fmtSol(pnlSol)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                {isProfit ? (
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                )}
                PNL (%)
              </div>
              <p
                className={cn(
                  "text-xl font-bold",
                  isProfit ? "text-green-500" : "text-red-500"
                )}
              >
                {fmtPct(priceChangePct)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Market Cap + Liquidity */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Market Cap</p>
              <p className="text-2xl font-bold text-foreground">
                {displayMcap > 0 ? fmtMcap(displayMcap) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Liquidity</p>
              <p className="text-2xl font-bold text-foreground">
                {pairInfo?.liquidity ? fmtMcap(pairInfo.liquidity) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">24h Volume</p>
              <p className="text-2xl font-bold text-foreground">
                {pairInfo?.volume24h ? fmtMcap(pairInfo.volume24h) : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">
                Price Chart — Real Data (GeckoTerminal)
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startSimulation}
                  disabled={candles.length === 0}
                >
                  <Play className="h-4 w-4 mr-1" /> Simulate
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPlaying((p) => !p)}
                  disabled={candles.length === 0}
                >
                  {playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={reset}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {visibleIdx} / {candles.length}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && candles.length === 0 ? (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading chart data…
              </div>
            ) : candles.length === 0 ? (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                No chart data available
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={
                          isProfit
                            ? "hsl(142, 76%, 36%)"
                            : "hsl(0, 84%, 60%)"
                        }
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="100%"
                        stopColor={
                          isProfit
                            ? "hsl(142, 76%, 36%)"
                            : "hsl(0, 84%, 60%)"
                        }
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border/30"
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10 }}
                    interval={Math.max(Math.floor(chartData.length / 8), 1)}
                  />
                  <YAxis
                    yAxisId="price"
                    domain={[minPrice, maxPrice]}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `$${v.toFixed(6)}`}
                    width={80}
                  />
                  <YAxis
                    yAxisId="mcap"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => fmtMcap(v)}
                    width={70}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === "close")
                            return (
                              <span className="font-mono">
                                ${Number(value).toFixed(8)}
                              </span>
                            );
                          if (name === "mcap")
                            return <span>{fmtMcap(Number(value))}</span>;
                          return <span>{String(value)}</span>;
                        }}
                      />
                    }
                  />
                  <ReferenceLine
                    yAxisId="mcap"
                    y={POSITION.entryMcap}
                    stroke="hsl(45, 93%, 47%)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Entry ${fmtMcap(POSITION.entryMcap)}`,
                      fill: "hsl(45, 93%, 47%)",
                      fontSize: 10,
                    }}
                  />
                  <Area
                    yAxisId="price"
                    type="monotone"
                    dataKey="close"
                    stroke={
                      isProfit
                        ? "hsl(142, 76%, 36%)"
                        : "hsl(0, 84%, 60%)"
                    }
                    strokeWidth={2}
                    fill="url(#priceGrad)"
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="mcap"
                    type="monotone"
                    dataKey="mcap"
                    stroke="hsl(var(--accent-foreground))"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    fill="none"
                    isAnimationActive={false}
                  />
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
                  <span className="font-mono text-foreground text-xs">
                    {TOKEN_ADDRESS.slice(0, 8)}…{TOKEN_ADDRESS.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Holdings %</span>
                  <span className="text-foreground font-medium">
                    {POSITION.holdingPct}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry Price</span>
                  <span className="text-foreground font-mono">
                    ${entryPrice.toFixed(8)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Price</span>
                  <span className="text-foreground font-mono">
                    ${currentPrice.toFixed(8)}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Initial Bag</span>
                  <span className="text-foreground font-medium">
                    {POSITION.initialBagSol} SOL
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Value</span>
                  <span className="text-foreground font-medium">
                    {holdingValue.toFixed(2)} SOL
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Simulated PNL
                  </span>
                  <span
                    className={cn(
                      "font-bold",
                      isProfit ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {fmtSol(pnlSol)} ({fmtPct(priceChangePct)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Market Cap</span>
                  <span className="text-foreground font-medium">
                    {displayMcap > 0 ? fmtMcap(displayMcap) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
