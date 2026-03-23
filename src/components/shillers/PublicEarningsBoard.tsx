import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Wallet, Users, RefreshCw, Send, Search, X, ExternalLink, Receipt, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";

function maskUsername(name: string): string {
  if (name.length <= 3) return name + "****";
  return name.slice(0, 3) + "****";
}

function shortWallet(addr: string | null): string {
  if (!addr) return "—";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function isFriday(): boolean {
  return new Date().getUTCDay() === 5;
}

interface EarningsRow {
  discord_user_id: string;
  discord_username: string;
  solana_wallet: string | null;
  verified_amount: number;
  verified_clicks: number;
  pending_amount: number;
  pending_clicks: number;
  role: "shiller" | "raider" | "both";
}

interface Props {
  roleFilter?: "shiller" | "raider" | "all";
}

export default function PublicEarningsBoard({ roleFilter = "all" }: Props) {
  const [rows, setRows] = useState<EarningsRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Wallet lookup state
  const [walletSearch, setWalletSearch] = useState("");
  const [foundUser, setFoundUser] = useState<EarningsRow | null>(null);
  const [searched, setSearched] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);

  // Payout request state
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);

  const fetchEarnings = async () => {
    setLoading(true);

    const { data: clicks } = await supabase
      .from("shill_clicks")
      .select("discord_user_id, discord_username, click_type, status, rate");

    const { data: raiders } = await supabase
      .from("raiders")
      .select("discord_user_id, discord_username, solana_wallet, status")
      .eq("status", "active");

    const { data: configs } = await supabase
      .from("site_configs")
      .select("content")
      .eq("site_id", "smm-auto-shill");

    const shillerUserIds = new Set<string>();
    for (const row of configs || []) {
      const assignments = (row.content as any)?.discord_assignments || {};
      Object.keys(assignments).forEach((uid) => shillerUserIds.add(uid));
    }

    const raiderMap = new Map<string, { wallet: string | null; username: string }>();
    for (const r of raiders || []) {
      raiderMap.set(r.discord_user_id, { wallet: r.solana_wallet, username: r.discord_username });
    }

    const userMap = new Map<string, EarningsRow>();

    for (const click of clicks || []) {
      const uid = click.discord_user_id;
      if (!userMap.has(uid)) {
        const raiderInfo = raiderMap.get(uid);
        const isShiller = shillerUserIds.has(uid);
        const isRaider = raiderMap.has(uid);
        userMap.set(uid, {
          discord_user_id: uid,
          discord_username: click.discord_username || raiderInfo?.username || uid,
          solana_wallet: raiderInfo?.wallet || null,
          verified_amount: 0, verified_clicks: 0,
          pending_amount: 0, pending_clicks: 0,
          role: isShiller && isRaider ? "both" : isShiller ? "shiller" : "raider",
        });
      }
      const entry = userMap.get(uid)!;
      const rate = Number(click.rate || 0);
      if (click.status === "verified") {
        entry.verified_amount += rate;
        entry.verified_clicks += 1;
      } else if (click.status === "clicked") {
        entry.pending_amount += rate;
        entry.pending_clicks += 1;
      }
    }

    for (const [uid, info] of raiderMap) {
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          discord_user_id: uid, discord_username: info.username,
          solana_wallet: info.wallet,
          verified_amount: 0, verified_clicks: 0,
          pending_amount: 0, pending_clicks: 0,
          role: shillerUserIds.has(uid) ? "both" : "raider",
        });
      }
    }

    for (const uid of shillerUserIds) {
      if (!userMap.has(uid)) {
        const raiderInfo = raiderMap.get(uid);
        userMap.set(uid, {
          discord_user_id: uid,
          discord_username: raiderInfo?.username || `user_${uid.slice(-4)}`,
          solana_wallet: raiderInfo?.wallet || null,
          verified_amount: 0, verified_clicks: 0,
          pending_amount: 0, pending_clicks: 0,
          role: raiderMap.has(uid) ? "both" : "shiller",
        });
      }
    }

    let result = Array.from(userMap.values());
    if (roleFilter === "shiller") {
      result = result.filter((r) => r.role === "shiller" || r.role === "both");
    } else if (roleFilter === "raider") {
      result = result.filter((r) => r.role === "raider" || r.role === "both");
    }
    result.sort((a, b) => b.verified_amount - a.verified_amount || b.pending_amount - a.pending_amount);
    setRows(result);
    setLoading(false);
  };

  useEffect(() => {
    fetchEarnings();
    const channel = supabase
      .channel("public-earnings-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "shill_clicks" }, () => fetchEarnings())
      .on("postgres_changes", { event: "*", schema: "public", table: "raiders" }, () => fetchEarnings())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roleFilter]);

  const totalVerified = rows.reduce((s, r) => s + r.verified_amount, 0);
  const totalPending = rows.reduce((s, r) => s + r.pending_amount, 0);

  const handleWalletLookup = async () => {
    const query = walletSearch.trim();
    if (!query) {
      toast.error("Enter your Solana wallet address to look up your info.");
      return;
    }
    const match = rows.find((r) => r.solana_wallet && r.solana_wallet.toLowerCase() === query.toLowerCase());
    setSearched(true);
    setFoundUser(match || null);
    setPaymentHistory([]);

    if (!match) {
      toast.error("No account found with that wallet address. Make sure your wallet is registered via /wallet or /walletcrm in Discord.");
      return;
    }

    // Fetch payment history from shill_payouts
    const { data: payouts } = await supabase
      .from("shill_payouts")
      .select("id, amount, payout_type, verified_clicks, solana_wallet, solana_tx_address, created_at")
      .eq("discord_user_id", match.discord_user_id)
      .order("created_at", { ascending: false });

    setPaymentHistory(payouts || []);
  };

  const clearSearch = () => {
    setWalletSearch("");
    setFoundUser(null);
    setSearched(false);
    setPaymentHistory([]);
  };

  const handlePayoutRequest = async () => {
    if (!foundUser) {
      toast.error("Look up your wallet first to request a payout.");
      return;
    }
    if (!isFriday()) {
      toast.error("Payout requests are only available on Fridays (UTC).");
      return;
    }

    setPayoutSubmitting(true);
    try {
      if (foundUser.verified_amount <= 0) {
        toast.error("No verified earnings to request a payout for.");
        setPayoutSubmitting(false);
        return;
      }
      if (!foundUser.solana_wallet) {
        toast.error("No wallet on file.");
        setPayoutSubmitting(false);
        return;
      }

      const { data: existing } = await supabase
        .from("payout_requests")
        .select("id")
        .eq("discord_user_id", foundUser.discord_user_id)
        .eq("status", "pending")
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error("You already have a pending payout request.");
        setPayoutSubmitting(false);
        return;
      }

      const userType = foundUser.role === "both" ? "shiller" : foundUser.role;

      const { error } = await supabase.from("payout_requests").insert({
        discord_user_id: foundUser.discord_user_id,
        discord_username: foundUser.discord_username,
        user_type: userType,
        solana_wallet: foundUser.solana_wallet,
        verified_clicks: foundUser.verified_clicks,
        amount_owed: foundUser.verified_amount,
        status: "pending",
      });

      if (error) throw error;

      toast.success(`Payout request submitted! $${foundUser.verified_amount.toFixed(2)} → ${shortWallet(foundUser.solana_wallet)}`);
      clearSearch();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payout request.");
    } finally {
      setPayoutSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-500" />
          Live Earnings Board
        </h2>
        <Button variant="outline" size="sm" onClick={fetchEarnings} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3 text-center">
          <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-bold text-foreground">{rows.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Workers</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <DollarSign className="h-4 w-4 mx-auto mb-1 text-green-500" />
          <p className="text-2xl font-bold text-green-500">${totalVerified.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Verified</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <DollarSign className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
          <p className="text-2xl font-bold text-yellow-500">${totalPending.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</p>
        </div>
      </div>

      {/* Wallet Lookup + Payout Section */}
      <div className="rounded-lg border border-border p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Find Your Earnings</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter your Solana wallet address to view your personal earnings and request payouts on Fridays.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Your Solana wallet address"
            value={walletSearch}
            onChange={(e) => setWalletSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleWalletLookup()}
            className="font-mono text-sm"
          />
          {searched ? (
            <Button variant="ghost" size="sm" onClick={clearSearch} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
          <Button onClick={handleWalletLookup} size="sm" className="shrink-0">
            <Search className="h-3.5 w-3.5 mr-1.5" />
            Look Up
          </Button>
        </div>

        {/* Found user card */}
        {foundUser && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                Your Account
              </h4>
              <Badge
                variant={foundUser.role === "shiller" ? "default" : foundUser.role === "raider" ? "secondary" : "outline"}
                className="text-[10px]"
              >
                {foundUser.role === "both" ? "shiller + raider" : foundUser.role}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-lg font-bold text-green-500">${foundUser.verified_amount.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Verified</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-yellow-500">${foundUser.pending_amount.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Pending</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{foundUser.verified_clicks}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Verified Clicks</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{foundUser.pending_clicks}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Pending Clicks</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <Wallet className="h-3 w-3" />
              {foundUser.solana_wallet}
            </div>

            {/* Payout button */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handlePayoutRequest}
                disabled={!isFriday() || payoutSubmitting || foundUser.verified_amount <= 0}
                size="sm"
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {payoutSubmitting ? "Submitting..." : "Request Payout"}
              </Button>
              {isFriday() ? (
                <Badge variant="default" className="text-[10px] bg-green-600">PAYOUTS OPEN</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Payouts open on Fridays (UTC)</span>
              )}
            </div>

            {/* Payment History */}
            {paymentHistory.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h5 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-primary" />
                  Payment History ({paymentHistory.length})
                </h5>
                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs text-right">Clicks</TableHead>
                        <TableHead className="text-xs">Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentHistory.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(p.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{p.payout_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold text-green-500">
                            ${Number(p.amount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{p.verified_clicks}</TableCell>
                          <TableCell>
                            {p.solana_tx_address ? (
                              <a
                                href={p.solana_tx_address}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Solscan
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Total paid: ${paymentHistory.reduce((s, p) => s + Number(p.amount), 0).toFixed(2)}
                </p>
              </div>
            )}

            {paymentHistory.length === 0 && (
              <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1">
                <Receipt className="h-3 w-3" /> No payment history yet.
              </p>
            )}
          </div>
        )}

        {searched && !foundUser && (
          <p className="text-sm text-destructive mt-1">
            No account found for that wallet. Make sure it's registered via <code className="bg-muted px-1 rounded">/wallet</code> or <code className="bg-muted px-1 rounded">/walletcrm</code> in Discord.
          </p>
        )}
      </div>

      {/* Earnings table */}
      <ScrollArea className="h-[400px] rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead className="text-right">Verified</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Total Clicks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.discord_user_id}
                className={foundUser?.discord_user_id === row.discord_user_id ? "bg-primary/10 border-l-2 border-l-primary" : ""}
              >
                <TableCell className="font-medium font-mono text-sm">
                  {maskUsername(row.discord_username)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={row.role === "shiller" ? "default" : row.role === "raider" ? "secondary" : "outline"}
                    className="text-[10px]"
                  >
                    {row.role === "both" ? "shiller + raider" : row.role}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.solana_wallet ? (
                    <span className="flex items-center gap-1">
                      <Wallet className="h-3 w-3" />
                      {shortWallet(row.solana_wallet)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">not set</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-green-500 font-semibold">
                  ${row.verified_amount.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono text-yellow-500">
                  ${row.pending_amount.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {row.verified_clicks + row.pending_clicks}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No earnings data yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
