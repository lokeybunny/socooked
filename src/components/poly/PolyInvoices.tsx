import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, RefreshCw, CheckCircle2, Clock, XCircle, Crown, Copy } from "lucide-react";
import { toast } from "sonner";

type Payment = {
  id: string;
  order_id: string;
  nowpayments_invoice_id: string | null;
  tier: string;
  amount_sol: number;
  amount_usd: number | null;
  status: string;
  pay_address: string | null;
  invoice_url: string | null;
  qr_code_url: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type Membership = {
  role: string;
  tier: string | null;
  started_at: string;
  expires_at: string;
  last_payment_id: string | null;
};

const PAID_STATES = ["confirmed", "finished", "sending"];
const PENDING_STATES = ["pending", "waiting", "confirming", "partially_paid"];
const FAILED_STATES = ["failed", "expired", "refunded"];

function statusMeta(s: string) {
  if (PAID_STATES.includes(s)) return { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40", icon: CheckCircle2, label: s };
  if (PENDING_STATES.includes(s)) return { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", icon: Clock, label: s };
  if (FAILED_STATES.includes(s)) return { color: "bg-rose-500/20 text-rose-400 border-rose-500/40", icon: XCircle, label: s };
  return { color: "bg-muted/40 text-muted-foreground", icon: Clock, label: s };
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function PolyInvoices() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: pays }, { data: mem }] = await Promise.all([
      supabase.from("poly_payments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("poly_memberships").select("role,tier,started_at,expires_at,last_payment_id").eq("user_id", user.id).maybeSingle(),
    ]);
    setPayments((pays ?? []) as unknown as Payment[]);
    setMembership((mem ?? null) as unknown as Membership | null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const latest = payments[0] ?? null;
  const memberActive = membership && new Date(membership.expires_at) > new Date();

  if (!user) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Sign in to view your invoices and membership status.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Membership status */}
      <Card className={memberActive ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card/50"}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Crown className={`h-5 w-5 ${memberActive ? "text-emerald-400" : "text-muted-foreground"}`} />
              Membership Status
            </span>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {memberActive ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">State</span>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tier</span>
                <span className="font-medium capitalize">{membership?.tier ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Activated</span>
                <span>{fmtDate(membership?.started_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">{fmtDate(membership?.expires_at)}</span>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">State</span>
                <Badge className="bg-muted/40 text-muted-foreground">Inactive</Badge>
              </div>
              {latest && PENDING_STATES.includes(latest.status) ? (
                <p className="text-muted-foreground">
                  Latest invoice is <strong className="text-yellow-400">{latest.status}</strong>. Membership activates automatically once payment confirms on-chain (usually 1–5 minutes after broadcast).
                </p>
              ) : (
                <p className="text-muted-foreground">No active membership. Pay an invoice from the Pricing tab to unlock InnerEdge.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latest invoice */}
      {latest && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Latest Invoice</span>
              {(() => {
                const m = statusMeta(latest.status);
                const I = m.icon;
                return (
                  <Badge className={m.color}>
                    <I className="h-3 w-3 mr-1" /> {m.label}
                  </Badge>
                );
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Order ID</div>
                <code className="text-xs break-all">{latest.order_id}</code>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Tier</div>
                <div className="capitalize font-medium">{latest.tier}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Amount</div>
                <div className="font-medium">
                  {latest.amount_sol} SOL{latest.amount_usd ? ` · ~$${latest.amount_usd}` : ""}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Created</div>
                <div>{fmtDate(latest.created_at)}</div>
              </div>
              {latest.expires_at && (
                <div>
                  <div className="text-xs text-muted-foreground">Invoice expires</div>
                  <div>{fmtDate(latest.expires_at)}</div>
                </div>
              )}
              {latest.nowpayments_invoice_id && (
                <div>
                  <div className="text-xs text-muted-foreground">NowPayments ID</div>
                  <code className="text-xs">{latest.nowpayments_invoice_id}</code>
                </div>
              )}
            </div>

            {latest.pay_address && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
                <div className="text-xs text-muted-foreground">Pay address (SOL)</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs break-all">{latest.pay_address}</code>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { navigator.clipboard.writeText(latest.pay_address!); toast.success("Copied"); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {latest.invoice_url && (
                <a href={latest.invoice_url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Invoice
                  </Button>
                </a>
              )}
              {latest.qr_code_url && (
                <a href={latest.qr_code_url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> QR Code
                  </Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No invoices yet.</p>
          ) : (
            <div className="space-y-2">
              {payments.map(p => {
                const m = statusMeta(p.status);
                const I = m.icon;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/30 p-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium capitalize">{p.tier} · {p.amount_sol} SOL</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(p.created_at)}</div>
                    </div>
                    <Badge className={m.color}>
                      <I className="h-3 w-3 mr-1" /> {m.label}
                    </Badge>
                    {p.invoice_url && (
                      <a href={p.invoice_url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
