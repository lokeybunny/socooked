import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sparkles, TrendingUp, Zap, Lock, Crown, ExternalLink, RefreshCw,
  Flame, Skull, Activity, Trophy, ArrowUpRight,
} from "lucide-react";

const REF_LINK = "https://polymarket.com/?ref=VIBECODER";
const REF_CTA = `Trade this edge on Polymarket → ${REF_LINK} (use code VIBECODER for fee discount)`;

type Market = {
  slug: string;
  question: string;
  volume24hr?: number;
  liquidity?: number;
  outcomes?: string;
  outcomePrices?: string;
  endDate?: string;
};

type Signal = {
  id: string;
  title: string;
  market_slug: string;
  edge_score: number;
  probability_mismatch: number | string;
  confidence: string;
  recommendation: string;
  vibe: string;
  created_at: string;
};

function parseArr(s?: string): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

export default function Poly() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState<string | null>(null);

  useEffect(() => {
    document.title = "PolyVibe InnerEdge — Alpha Signals";
  }, []);

  useEffect(() => {
    if (!user) { setIsMember(false); return; }
    supabase
      .from("poly_memberships")
      .select("expires_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsMember(!!data && new Date(data.expires_at) > new Date());
      });
  }, [user]);

  const loadMarkets = async () => {
    setMarketsLoading(true);
    const { data, error } = await supabase.functions.invoke("poly-markets", { body: {} });
    if (error) toast.error("Couldn't load markets");
    else setMarkets((data as any)?.markets ?? []);
    setMarketsLoading(false);
  };

  const loadSignals = async () => {
    setSignalsLoading(true);
    const { data } = await supabase
      .from("poly_signals")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(20);
    setSignals((data ?? []) as unknown as Signal[]);
    setSignalsLoading(false);
  };

  useEffect(() => { loadMarkets(); loadSignals(); }, []);

  const generateSignals = async () => {
    setGenerating(true);
    const { error } = await supabase.functions.invoke("poly-signals", { body: {} });
    if (error) toast.error("Signal engine misfired");
    else { toast.success("Fresh edges deployed"); loadSignals(); }
    setGenerating(false);
  };

  const buy = async (tier: "monthly" | "yearly") => {
    if (!user) { toast.error("Sign in first"); return; }
    setCreatingInvoice(tier);
    const { data, error } = await supabase.functions.invoke("poly-create-invoice", {
      body: { tier, user_id: user.id },
    });
    setCreatingInvoice(null);
    if (error || !data) { toast.error("Invoice failed"); return; }
    const url = (data as any).invoice_url;
    if ((data as any).stub) {
      toast.message("Stub invoice (NowPayments key not set yet)", { description: url });
    }
    window.open(url, "_blank");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* HERO */}
        <header className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-purple-950/40 via-background to-emerald-950/30 p-8 sm:p-12">
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
          </div>
          <div className="relative">
            <Badge className="mb-4 bg-primary/20 text-primary border-primary/40 hover:bg-primary/30">
              <Crown className="h-3 w-3 mr-1" /> INNER CIRCLE ONLY
            </Badge>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-4 bg-gradient-to-r from-foreground via-primary to-emerald-400 bg-clip-text text-transparent">
              PolyVibe InnerEdge
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-6">
              Alpha-only Polymarket signals. AI scans whale flow & probability mismatch.
              You print. Paid in SOL. Don't dilute the circle.
            </p>
            <div className="flex flex-wrap gap-3">
              {!isMember && (
                <>
                  <Button size="lg" onClick={() => buy("monthly")} disabled={creatingInvoice === "monthly"} className="bg-primary hover:bg-primary/90">
                    <Zap className="h-4 w-4 mr-2" />
                    {creatingInvoice === "monthly" ? "Spinning up…" : "Join Monthly · 0.8 SOL"}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => buy("yearly")} disabled={creatingInvoice === "yearly"}>
                    <Crown className="h-4 w-4 mr-2" />
                    {creatingInvoice === "yearly" ? "Spinning up…" : "Yearly · 4 SOL (save 40%)"}
                  </Button>
                </>
              )}
              {isMember && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 px-4 py-2 text-base">
                  <Crown className="h-4 w-4 mr-1.5" /> InnerEdge Member · Active
                </Badge>
              )}
            </div>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-card/50 border border-border">
            <TabsTrigger value="dashboard"><Sparkles className="h-4 w-4 mr-1.5" /> Signals</TabsTrigger>
            <TabsTrigger value="markets"><TrendingUp className="h-4 w-4 mr-1.5" /> Markets</TabsTrigger>
            <TabsTrigger value="pricing"><Crown className="h-4 w-4 mr-1.5" /> Pricing</TabsTrigger>
            <TabsTrigger value="referral"><Trophy className="h-4 w-4 mr-1.5" /> Referral</TabsTrigger>
          </TabsList>

          {/* SIGNALS */}
          <TabsContent value="dashboard" className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Flame className="h-6 w-6 text-primary" /> Live Edges
                </h2>
                <p className="text-sm text-muted-foreground">High-conviction probability mismatches, refreshed on demand.</p>
              </div>
              {isMember && (
                <Button onClick={generateSignals} disabled={generating} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
                  {generating ? "Scanning…" : "Generate Fresh"}
                </Button>
              )}
            </div>

            {!isMember ? (
              <Card className="border-primary/30 bg-card/50">
                <CardContent className="p-12 text-center space-y-4">
                  <Lock className="h-12 w-12 mx-auto text-primary" />
                  <h3 className="text-2xl font-bold">Signals are gated</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    InnerEdge members see real-time AI edges, whale flow, and degen vibe checks before the herd.
                  </p>
                  <Button onClick={() => setTab("pricing")} className="bg-primary hover:bg-primary/90">
                    <Crown className="h-4 w-4 mr-2" /> Unlock InnerEdge
                  </Button>
                </CardContent>
              </Card>
            ) : signalsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-44" />)}
              </div>
            ) : signals.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center space-y-3">
                  <Activity className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">No edges yet. Tap <strong>Generate Fresh</strong> to scan the markets.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {signals.map(s => (
                  <Card key={s.id} className="border-primary/20 bg-gradient-to-br from-card to-card/50 hover:border-primary/40 transition-all">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-base leading-snug">{s.title}</CardTitle>
                        <Badge
                          className={
                            s.edge_score >= 70 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : s.edge_score >= 40 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                                : "bg-muted/40 text-muted-foreground"
                          }
                        >
                          {s.edge_score}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline" className="border-primary/40 text-primary">{s.recommendation}</Badge>
                        <Badge variant="outline">{s.confidence}</Badge>
                        <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">{typeof s.probability_mismatch === "number" ? `${s.probability_mismatch > 0 ? "+" : ""}${s.probability_mismatch}%` : s.probability_mismatch}</Badge>
                      </div>
                      <p className="text-sm italic text-muted-foreground">"{s.vibe}"</p>
                      <a
                        href={`https://polymarket.com/event/${s.market_slug}?ref=VIBECODER`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        Trade on Polymarket <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </CardContent>
                  </Card>
                ))}
                <Card className="sm:col-span-2 border-primary/30 bg-primary/5">
                  <CardContent className="p-4 text-sm text-center text-muted-foreground">
                    🔗 {REF_CTA}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* MARKETS */}
          <TabsContent value="markets" className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-emerald-400" /> Live Polymarket
              </h2>
              <Button variant="outline" onClick={loadMarkets} disabled={marketsLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${marketsLoading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>

            {marketsLoading ? (
              <div className="grid gap-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : (
              <div className="grid gap-3">
                {markets.slice(0, 20).map((m) => {
                  const outcomes = parseArr(m.outcomes);
                  const prices = parseArr(m.outcomePrices);
                  return (
                    <Card key={m.slug} className="hover:border-primary/40 transition-all">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{m.question}</div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>Vol 24h: ${Math.round(Number(m.volume24hr ?? 0)).toLocaleString()}</span>
                            <span>Liq: ${Math.round(Number(m.liquidity ?? 0)).toLocaleString()}</span>
                          </div>
                          {outcomes.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {outcomes.map((o, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {o}: {Math.round(Number(prices[i] ?? 0) * 100)}¢
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <a
                          href={`https://polymarket.com/event/${m.slug}?ref=VIBECODER`}
                          target="_blank" rel="noreferrer"
                          className="shrink-0"
                        >
                          <Button variant="outline" size="sm">
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Trade
                          </Button>
                        </a>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* PRICING */}
          <TabsContent value="pricing" className="space-y-4 mt-6">
            <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
              <Card className="border-border bg-card/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Monthly
                    <Badge variant="outline">0.8 SOL</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">~$25 USD · 30 days</p>
                  <ul className="space-y-2">
                    <li>✅ All AI edge signals</li>
                    <li>✅ Live Polymarket scanner</li>
                    <li>✅ Discord InnerEdge role</li>
                    <li>✅ Daily digest</li>
                  </ul>
                  <Button className="w-full" onClick={() => buy("monthly")} disabled={creatingInvoice === "monthly"}>
                    {creatingInvoice === "monthly" ? "Spinning up…" : "Pay 0.8 SOL"}
                  </Button>
                </CardContent>
              </Card>
              <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-emerald-500/5 relative">
                <Badge className="absolute -top-2 right-4 bg-emerald-500 text-emerald-50">Best Value</Badge>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Yearly
                    <Badge className="bg-primary/20 text-primary border-primary/40">4 SOL</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">~$199 USD · 365 days · save 40%</p>
                  <ul className="space-y-2">
                    <li>✅ Everything in Monthly</li>
                    <li>✅ Priority signal access</li>
                    <li>✅ Portfolio scanner</li>
                    <li>✅ Custom edge requests</li>
                  </ul>
                  <Button className="w-full bg-primary hover:bg-primary/90" onClick={() => buy("yearly")} disabled={creatingInvoice === "yearly"}>
                    {creatingInvoice === "yearly" ? "Spinning up…" : "Pay 4 SOL"}
                  </Button>
                </CardContent>
              </Card>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Payments processed in SOL via NowPayments. Membership auto-activates on confirmation.
            </p>
          </TabsContent>

          {/* REFERRAL */}
          <TabsContent value="referral" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-emerald-400" /> Your Referral Link
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted rounded-md px-3 py-2 text-sm break-all">{REF_LINK}</code>
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(REF_LINK); toast.success("Copied"); }}>Copy</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use code <strong className="text-primary">VIBECODER</strong> for fee discounts on Polymarket.
                  Personalized stats coming soon — keep shipping.
                </p>
              </CardContent>
            </Card>

            {!user && !authLoading && (
              <Card className="border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="p-4 text-sm text-center">
                  <Skull className="h-5 w-5 mx-auto mb-2 text-yellow-400" />
                  Sign in to link your account & track payouts.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
