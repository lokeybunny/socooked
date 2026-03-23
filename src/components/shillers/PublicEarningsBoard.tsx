import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Wallet, Users, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

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

  // Payout request state
  const [payoutDiscordId, setPayoutDiscordId] = useState("");
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

  const handlePayoutRequest = async () => {
    if (!payoutDiscordId.trim()) {
      toast.error("Enter your Discord User ID to request a payout.");
      return;
    }
    if (!isFriday()) {
      toast.error("Payout requests are only available on Fridays (UTC).");
      return;
    }

    setPayoutSubmitting(true);
    try {
      const uid = payoutDiscordId.trim();

      // Find the user in our data
      const match = rows.find((r) => r.discord_user_id === uid);
      if (!match) {
        toast.error("Discord User ID not found. Make sure you're using your numeric Discord ID.");
        setPayoutSubmitting(false);
        return;
      }
      if (match.verified_amount <= 0) {
        toast.error("No verified earnings to request a payout for.");
        setPayoutSubmitting(false);
        return;
      }
      if (!match.solana_wallet) {
        toast.error("No wallet on file. Ask admin to set your wallet via /walletcrm or use /wallet in Discord.");
        setPayoutSubmitting(false);
        return;
      }

      // Check for existing pending payout
      const { data: existing } = await supabase
        .from("payout_requests")
        .select("id")
        .eq("discord_user_id", uid)
        .eq("status", "pending")
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error("You already have a pending payout request.");
        setPayoutSubmitting(false);
        return;
      }

      // Determine user_type
      const userType = match.role === "both" ? "shiller" : match.role;

      // Submit payout request
      const { error } = await supabase.from("payout_requests").insert({
        discord_user_id: uid,
        discord_username: match.discord_username,
        user_type: userType,
        solana_wallet: match.solana_wallet,
        verified_clicks: match.verified_clicks,
        amount_owed: match.verified_amount,
        status: "pending",
      });

      if (error) throw error;

      toast.success(`Payout request submitted! $${match.verified_amount.toFixed(2)} → ${shortWallet(match.solana_wallet)}`);
      setPayoutDiscordId("");
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

      {/* Friday Payout Request */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Request Payout</h3>
          {isFriday() ? (
            <Badge variant="default" className="text-[10px] bg-green-600">OPEN</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Fridays Only</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Enter your Discord User ID to request a payout to your designated wallet. Payouts are processed on Fridays only.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Your Discord User ID (numeric)"
            value={payoutDiscordId}
            onChange={(e) => setPayoutDiscordId(e.target.value)}
            className="font-mono text-sm"
            disabled={!isFriday() || payoutSubmitting}
          />
          <Button
            onClick={handlePayoutRequest}
            disabled={!isFriday() || payoutSubmitting || !payoutDiscordId.trim()}
            size="sm"
            className="shrink-0"
          >
            {payoutSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
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
              <TableRow key={row.discord_user_id}>
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
