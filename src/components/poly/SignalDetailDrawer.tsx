import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, Sparkles, RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Signal = {
  id: string;
  title: string;
  market_slug: string;
  market_question?: string | null;
  market_url?: string | null;
  edge_score: number;
  market_probability?: number | null;
  edge_probability?: number | null;
  probability_mismatch: number | string;
  confidence: string;
  risk_level?: string | null;
  suggested_size?: string | null;
  recommendation: string;
  vibe: string;
  outcome?: string | null;
  raw?: any;
  created_at: string;
};

type RelatedMarket = {
  slug: string;
  question: string;
  volume24hr?: number;
};

interface Props {
  signal: Signal | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isMember: boolean;
}

export function SignalDetailDrawer({ signal, open, onOpenChange, isMember }: Props) {
  const [related, setRelated] = useState<RelatedMarket[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const reasoning: string = useMemo(() => {
    const r = signal?.raw ?? {};
    return r.reasoning || r.analysis || r.explanation || signal?.vibe || "No detailed reasoning recorded.";
  }, [signal]);

  const factors: { label: string; weight: number | string }[] = useMemo(() => {
    const r = signal?.raw ?? {};
    if (Array.isArray(r.factors)) {
      return r.factors.map((f: any) => ({
        label: f.label ?? f.name ?? String(f),
        weight: f.weight ?? f.impact ?? "—",
      }));
    }
    return [];
  }, [signal]);

  useEffect(() => {
    if (!open || !signal) return;
    setRelatedLoading(true);
    supabase.functions
      .invoke("poly-markets", { body: { search: signal.title.split(" ").slice(0, 3).join(" ") } })
      .then(({ data }) => {
        const all: RelatedMarket[] = (data as any)?.markets ?? [];
        setRelated(all.filter(m => m.slug !== signal.market_slug).slice(0, 5));
      })
      .catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
  }, [open, signal]);

  const requestFollowUp = async () => {
    if (!signal) return;
    setRequesting(true);
    const { error } = await supabase.functions.invoke("poly-signals", {
      body: { focus_slug: signal.market_slug, parent_signal_id: signal.id },
    });
    setRequesting(false);
    if (error) toast.error("Follow-up edge failed");
    else {
      toast.success("Follow-up edge queued");
      onOpenChange(false);
    }
  };

  if (!signal) return null;

  const mismatchNum = typeof signal.probability_mismatch === "number"
    ? signal.probability_mismatch
    : parseFloat(String(signal.probability_mismatch)) || 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <div className="mx-auto w-full max-w-3xl overflow-y-auto px-4 sm:px-6 pb-2">
          <DrawerHeader className="px-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <DrawerTitle className="text-xl leading-tight">{signal.title}</DrawerTitle>
                <DrawerDescription className="mt-1">
                  {signal.market_question ?? signal.market_slug}
                </DrawerDescription>
              </div>
              <Badge
                className={
                  signal.edge_score >= 70 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                    : signal.edge_score >= 40 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                      : "bg-muted/40 text-muted-foreground"
                }
              >
                Edge {signal.edge_score}
              </Badge>
            </div>
          </DrawerHeader>

          <div className="space-y-6">
            {/* Tags */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-primary/40 text-primary">{signal.recommendation}</Badge>
              <Badge variant="outline">Confidence: {signal.confidence}</Badge>
              {signal.risk_level && <Badge variant="outline">Risk: {signal.risk_level}</Badge>}
              {signal.suggested_size && <Badge variant="outline">Size: {signal.suggested_size}</Badge>}
              {signal.outcome && <Badge variant="outline">Outcome: {signal.outcome}</Badge>}
            </div>

            {/* Probability Mismatch Breakdown */}
            <section className="rounded-xl border border-primary/20 bg-card/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" /> Probability Mismatch
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Market</div>
                  <div className="text-lg font-bold">
                    {signal.market_probability != null ? `${signal.market_probability}%` : "—"}
                  </div>
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                  <div className="text-xs text-muted-foreground">Our Edge</div>
                  <div className="text-lg font-bold text-primary">
                    {signal.edge_probability != null ? `${signal.edge_probability}%` : "—"}
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-3">
                  <div className="text-xs text-muted-foreground">Mismatch</div>
                  <div className={`text-lg font-bold ${mismatchNum > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {mismatchNum > 0 ? "+" : ""}{mismatchNum}%
                  </div>
                </div>
              </div>
              {factors.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-xs font-medium text-muted-foreground">Contributing factors</div>
                  {factors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-foreground/80">{f.label}</span>
                      <Badge variant="outline" className="text-xs">{String(f.weight)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Full Reasoning */}
            <section className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Full Reasoning
              </div>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{reasoning}</p>
              {signal.vibe && (
                <p className="text-sm italic text-muted-foreground border-l-2 border-primary/40 pl-3 mt-2">
                  "{signal.vibe}"
                </p>
              )}
            </section>

            {/* Related Markets */}
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-emerald-400" /> Related Markets
              </div>
              {relatedLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : related.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No related markets found.</p>
              ) : (
                <div className="space-y-2">
                  {related.map(m => (
                    <a
                      key={m.slug}
                      href={`https://polymarket.com/event/${m.slug}?ref=VIBECODER`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/30 hover:border-primary/40 hover:bg-card/60 transition-all p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.question}</div>
                        {m.volume24hr != null && (
                          <div className="text-xs text-muted-foreground">
                            Vol 24h: ${Math.round(Number(m.volume24hr)).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-primary shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </section>

            {!isMember && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                Follow-up edge requests are members-only.
              </div>
            )}
          </div>

          <DrawerFooter className="px-0 pt-6 flex-row gap-2">
            <a
              href={signal.market_url ?? `https://polymarket.com/event/${signal.market_slug}?ref=VIBECODER`}
              target="_blank" rel="noreferrer"
              className="flex-1"
            >
              <Button variant="outline" className="w-full">
                Trade on Polymarket <ArrowUpRight className="h-4 w-4 ml-1.5" />
              </Button>
            </a>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90"
              onClick={requestFollowUp}
              disabled={!isMember || requesting}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${requesting ? "animate-spin" : ""}`} />
              {requesting ? "Queuing…" : "Request Follow-up Edge"}
            </Button>
            <DrawerClose asChild>
              <Button variant="ghost">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
