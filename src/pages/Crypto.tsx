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
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── token config ── */
const TOKEN = {
  name: "7oXNE1dbpHUp6dn1JF8pRgCtzfCy4P2FuBneWjZHpump",
  symbol: "SOL Token",
  holdingPct: 0.72,
  initialPnlPct: -77,
  initialPnlSol: -49.72,
  holdingSol: 15.17,
  entryMcap: 100_000, // simulated entry mcap
};

/* ── generate realistic price history ── */
function generatePriceHistory(points: number): { time: string; price: number; mcap: number }[] {
  const data: { time: string; price: number; mcap: number }[] = [];
  let price = 0.00012; // starting price
  const supply = 1_000_000_000;

  for (let i = 0; i < points; i++) {
    const hour = i;
    const dayLabel = `${Math.floor(hour / 24)}d ${hour % 24}h`;

    // Simulate volatility — crypto-style random walk
    const trend = Math.sin(i / 20) * 0.03;
    const noise = (Math.random() - 0.48) * 0.08;
    const spike = Math.random() > 0.95 ? (Math.random() - 0.3) * 0.25 : 0;
    price = Math.max(price * (1 + trend + noise + spike), 0.000001);

    const mcap = price * supply;
    data.push({ time: dayLabel, price: +price.toFixed(8), mcap: Math.round(mcap) });
  }
  return data;
}

const FULL_HISTORY = generatePriceHistory(200);

/* ── chart config ── */
const chartConfig: ChartConfig = {
  price: { label: "Price", color: "hsl(var(--primary))" },
  mcap: { label: "Market Cap", color: "hsl(var(--accent))" },
};

/* ── format helpers ── */
const fmtMcap = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v}`;
};

const fmtSol = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} SOL`;
const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export default function Crypto() {
  const [visibleIdx, setVisibleIdx] = useState(60); // show first 60 points
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const visibleData = FULL_HISTORY.slice(0, visibleIdx);
  const currentPoint = visibleData[visibleData.length - 1];
  const entryPoint = FULL_HISTORY[0];

  /* ── simulation PNL calc ── */
  const priceChange = currentPoint
    ? (currentPoint.price - entryPoint.price) / entryPoint.price
    : 0;
  const holdingValue = TOKEN.holdingSol * (1 + priceChange);
  const pnlSol = holdingValue - TOKEN.holdingSol;
  const pnlPct = priceChange * 100;
  const isProfit = pnlSol >= 0;

  /* ── play/pause simulation ── */
  const tick = useCallback(() => {
    setVisibleIdx((prev) => {
      if (prev >= FULL_HISTORY.length) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, []);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(tick, 300);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, tick]);

  const reset = () => {
    setPlaying(false);
    setVisibleIdx(60);
  };

  /* ── price range for chart ── */
  const prices = visibleData.map((d) => d.price);
  const minPrice = Math.min(...prices) * 0.9;
  const maxPrice = Math.max(...prices) * 1.1;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Crypto Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1 font-mono break-all">
              {TOKEN.name}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                `https://pump.fun/coin/${TOKEN.name}`,
                "_blank"
              )
            }
          >
            <ExternalLink className="h-4 w-4 mr-1" /> View on Pump.fun
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Percent className="h-3.5 w-3.5" /> Holdings
              </div>
              <p className="text-xl font-bold text-foreground">
                {TOKEN.holdingPct}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> Holding Value
              </div>
              <p className="text-xl font-bold text-foreground">
                {holdingValue.toFixed(2)} SOL
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
                {fmtPct(pnlPct)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Market Cap */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Current Market Cap</p>
                <p className="text-2xl font-bold text-foreground">
                  {currentPoint ? fmtMcap(currentPoint.mcap) : "—"}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-sm",
                  isProfit
                    ? "border-green-500/30 text-green-500"
                    : "border-red-500/30 text-red-500"
                )}
              >
                {isProfit ? "PROFIT" : "LOSS"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Price Chart (Simulation)</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPlaying((p) => !p)}
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
                  {visibleIdx} / {FULL_HISTORY.length}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[350px] w-full">
              <AreaChart data={visibleData}>
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
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  interval={Math.max(Math.floor(visibleData.length / 8), 1)}
                />
                <YAxis
                  domain={[minPrice, maxPrice]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.toFixed(6)}
                  width={70}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        if (name === "price")
                          return (
                            <span className="font-mono">
                              ${Number(value).toFixed(8)}
                            </span>
                          );
                        return <span>{fmtMcap(Number(value))}</span>;
                      }}
                    />
                  }
                />
                <ReferenceLine
                  y={entryPoint.price}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{ value: "Entry", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={isProfit ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
                  strokeWidth={2}
                  fill="url(#priceGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Simulation Log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Position Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Token</span>
                  <span className="font-mono text-foreground text-xs break-all max-w-[200px] text-right">
                    {TOKEN.name.slice(0, 12)}…{TOKEN.name.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Holdings %</span>
                  <span className="text-foreground font-medium">{TOKEN.holdingPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry Price</span>
                  <span className="text-foreground font-mono">${entryPoint.price.toFixed(8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Price</span>
                  <span className="text-foreground font-mono">
                    ${currentPoint?.price.toFixed(8) ?? "—"}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Initial Investment</span>
                  <span className="text-foreground font-medium">{TOKEN.holdingSol} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Value</span>
                  <span className="text-foreground font-medium">{holdingValue.toFixed(2)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PNL</span>
                  <span className={cn("font-bold", isProfit ? "text-green-500" : "text-red-500")}>
                    {fmtSol(pnlSol)} ({fmtPct(pnlPct)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Market Cap</span>
                  <span className="text-foreground font-medium">
                    {currentPoint ? fmtMcap(currentPoint.mcap) : "—"}
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
