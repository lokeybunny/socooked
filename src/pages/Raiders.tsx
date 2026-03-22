import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, RefreshCw, Shield, DollarSign, Hash, Users, Wand2, Copy, Check, DoorOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

/** Generate a random secret code like "storm42", "bolt7x", etc. */
function generateSecretCode(): string {
  const words = [
    "alpha", "bolt", "storm", "viper", "blaze", "frost", "nova", "shadow",
    "raven", "titan", "cobra", "surge", "flash", "ghost", "iron", "onyx",
    "pulse", "apex", "claw", "drift", "eagle", "fang", "grit", "hawk",
    "jade", "kite", "lynx", "mars", "nuke", "orion", "pike", "raid",
  ];
  const word = words[Math.floor(Math.random() * words.length)];
  const suffix = Math.floor(Math.random() * 99) + 1;
  const extra = Math.random() > 0.5 ? "x" : "";
  return `${word}${suffix}${extra}`;
}

interface Raider {
  id: string;
  discord_user_id: string;
  discord_username: string;
  secret_code: string | null;
  status: string;
  rate_per_click: number;
  total_clicks: number;
  total_earned: number;
  created_at: string;
  updated_at: string;
}

export default function Raiders() {
  const { user } = useAuth();
  const [raiders, setRaiders] = useState<Raider[]>([]);
  const [raidClicks, setRaidClicks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRaider, setEditRaider] = useState<Raider | null>(null);
  const [secretCodeInput, setSecretCodeInput] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleGenerateCodes = (count: number) => {
    const existing = new Set([
      ...raiders.map((r) => r.secret_code).filter(Boolean),
      ...generatedCodes,
    ]);
    const codes: string[] = [];
    let attempts = 0;
    while (codes.length < count && attempts < 200) {
      const code = generateSecretCode();
      if (!existing.has(code)) {
        codes.push(code);
        existing.add(code);
      }
      attempts++;
    }
    setGeneratedCodes((prev) => [...codes, ...prev]);
    toast.success(`Generated ${codes.length} secret codes`);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(`#${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast.success(`Copied #${code}`);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: raiderData }, { data: clickData }] = await Promise.all([
      supabase
        .from("raiders")
        .select("*")
        .order("total_clicks", { ascending: false }),
      supabase
        .from("shill_clicks")
        .select("*")
        .eq("click_type", "raid")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setRaiders((raiderData as any[]) || []);
    setRaidClicks(clickData || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  
  const handleAssignCode = async () => {
    if (!editRaider || !secretCodeInput.trim()) return;

    const code = secretCodeInput.trim().replace(/^#/, "");
    const { error } = await supabase
      .from("raiders")
      .update({ secret_code: code, updated_at: new Date().toISOString() })
      .eq("id", editRaider.id);

    if (error) {
      toast.error("Failed to assign code: " + error.message);
    } else {
      toast.success(`Code #${code} assigned to ${editRaider.discord_username}`);
      setEditRaider(null);
      setSecretCodeInput("");
      fetchData();
    }
  };

  const handleToggleStatus = async (raider: Raider) => {
    const newStatus = raider.status === "active" ? "suspended" : "active";
    const { error } = await supabase
      .from("raiders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", raider.id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`${raider.discord_username} ${newStatus}`);
      fetchData();
    }
  };

  const totalPending = raidClicks.filter((c) => c.status === "clicked").length;
  const totalVerified = raidClicks.filter((c) => c.status === "verified").length;
  const totalOwed = totalPending * 0.02;
  const totalVerifiedPaid = totalVerified * 0.02;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          {user ? (
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <DoorOpen className="h-5 w-5" />
            </Link>
          ) : (
            <DoorOpen className="h-5 w-5 text-muted-foreground/40 cursor-not-allowed" />
          )}
          <Link
            to="/shillers"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Shillers
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Raiders
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage raid team members, assign secret codes, track clicks
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="rounded-lg border border-border p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-3xl font-bold text-foreground">{raiders.length}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Raiders</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <Hash className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-3xl font-bold text-foreground">{totalPending}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <Shield className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-3xl font-bold text-foreground">{totalVerified}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Verified</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
            <p className="text-3xl font-bold text-foreground">${totalOwed.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending Owed</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-3xl font-bold text-foreground text-green-500">${totalVerifiedPaid.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Verified Paid</p>
          </div>
        </div>

        {/* Secret Code Generator */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                Secret Code Generator
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate unique hashtag codes to assign to raiders
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleGenerateCodes(1)}>
                Generate 1
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleGenerateCodes(5)}>
                Generate 5
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleGenerateCodes(10)}>
                Generate 10
              </Button>
            </div>
          </div>
          {generatedCodes.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                {generatedCodes.map((code) => (
                  <button
                    key={code}
                    onClick={() => handleCopyCode(code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors font-mono text-sm text-foreground"
                  >
                    #{code}
                    {copiedCode === code ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Raiders Table */}
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Discord User</TableHead>
                <TableHead>Secret Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Earned</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {raiders.map((raider) => (
                <TableRow key={raider.id}>
                  <TableCell className="font-medium">{raider.discord_username}</TableCell>
                  <TableCell>
                    {raider.secret_code ? (
                      <Badge variant="outline" className="font-mono">
                        #{raider.secret_code}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">Not assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={raider.status === "active" ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {raider.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{raider.total_clicks}</TableCell>
                  <TableCell className="text-right font-mono">${raider.rate_per_click}</TableCell>
                  <TableCell className="text-right font-mono">
                    ${(raider.total_clicks * raider.rate_per_click).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(raider.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditRaider(raider);
                          setSecretCodeInput(raider.secret_code || "");
                        }}
                      >
                        <Hash className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(raider)}
                      >
                        <Shield className={`h-3.5 w-3.5 ${raider.status === "active" ? "text-green-500" : "text-destructive"}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {raiders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No raiders registered yet. They'll appear here when they click buttons in the raid channel.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Recent Raid Clicks */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Recent Raid Clicks</h2>
          <ScrollArea className="h-[300px] rounded-lg border border-border">
            <div className="p-3 space-y-1.5">
              {raidClicks.map((click) => (
                <div
                  key={click.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">
                        {click.discord_username}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${click.status === "verified" ? "border-green-500/30 text-green-500" : "border-yellow-500/30 text-yellow-500"}`}
                      >
                        {click.status === "verified" ? "verified" : "pending"}
                      </Badge>
                      {click.raider_secret_code && (
                        <Badge variant="secondary" className="text-[9px] font-mono">
                          #{click.raider_secret_code}
                        </Badge>
                      )}
                    </div>
                    {click.tweet_url && (
                      <a
                        href={click.tweet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate block"
                      >
                        {click.tweet_url.replace(/https?:\/\/(x\.com|twitter\.com)\//, "")}
                      </a>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                    $0.02
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(click.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
              {raidClicks.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No raid clicks yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Assign Secret Code Dialog */}
        <Dialog open={!!editRaider} onOpenChange={(open) => !open && setEditRaider(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Assign Secret Code — {editRaider?.discord_username}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                This code becomes the raider's unique hashtag (e.g. <code>#alpha7</code>).
                It's injected into their shill copy and used to verify their posts on X.
              </p>
              <Input
                placeholder="e.g. alpha7"
                value={secretCodeInput}
                onChange={(e) => setSecretCodeInput(e.target.value)}
                className="font-mono"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRaider(null)}>
                Cancel
              </Button>
              <Button onClick={handleAssignCode} disabled={!secretCodeInput.trim()}>
                Assign Code
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
