import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Navigate, Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw, Shield, DollarSign, Hash, Users, Wand2, Copy, Check,
  Settings, Activity, HardHat, Pencil, Trash2, Plus, Save, ExternalLink, Trophy, Banknote, Receipt, Inbox, CheckCircle2, XCircle, Clock, RotateCcw, Zap, TrendingUp,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import TopPostsSection from "@/components/shillers/TopPostsSection";
import ViralityTab from "@/components/shillers/ViralityTab";

/* ─── Types ─── */
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
  solana_wallet: string | null;
}

interface OutboundAccount {
  id: string;
  account_label: string;
  account_identifier: string;
  platform: string;
  provider: string;
  is_authorized: boolean;
  auto_send_enabled: boolean;
  daily_limit: number;
  created_at: string;
}

/* ─── Helpers ─── */
function generateSecretCode(): string {
  const words = [
    "alpha","bolt","storm","viper","blaze","frost","nova","shadow",
    "raven","titan","cobra","surge","flash","ghost","iron","onyx",
    "pulse","apex","claw","drift","eagle","fang","grit","hawk",
  ];
  const word = words[Math.floor(Math.random() * words.length)];
  const suffix = Math.floor(Math.random() * 99) + 1;
  const extra = Math.random() > 0.5 ? "x" : "";
  return `${word}${suffix}${extra}`;
}

/* ─── Payout Dialog ─── */
interface PayoutTarget {
  discord_user_id: string;
  discord_username: string;
  amount: number;
  verified_clicks: number;
  payout_type: "shill" | "raid";
  solana_wallet: string | null;
}

function PayoutDialog({ target, onClose, onPaid }: { target: PayoutTarget | null; onClose: () => void; onPaid: () => void }) {
  const { user } = useAuth();
  const [solanaAddress, setSolanaAddress] = useState(target?.solana_wallet || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSolanaAddress(target?.solana_wallet || ""); }, [target]);

  if (!target) return null;

  const handlePay = async () => {
    const addr = solanaAddress.trim();
    if (!addr) { toast.error("Enter the Solscan transaction URL"); return; }
    const solscanRegex = /^https:\/\/solscan\.io\/tx\/[A-Za-z0-9]+/;
    if (!solscanRegex.test(addr)) { toast.error("Please enter a valid Solscan URL (e.g. https://solscan.io/tx/...)"); return; }

    setSaving(true);

    const { error } = await supabase.from("shill_payouts").insert({
      discord_user_id: target.discord_user_id,
      discord_username: target.discord_username,
      payout_type: target.payout_type,
      amount: target.amount,
      verified_clicks: target.verified_clicks,
      solana_wallet: addr,
      paid_by: user?.id || null,
    });

    if (error) { toast.error(error.message); setSaving(false); return; }

    await supabase.from("shill_clicks").update({ status: "paid" })
      .eq("discord_user_id", target.discord_user_id)
      .eq("status", "verified")
      .eq("click_type", target.payout_type);

    await supabase.from("activity_log").insert({
      entity_type: "shill-payout",
      action: "paid",
      actor_id: user?.id || null,
      meta: {
        name: `💸 Paid @${target.discord_username} $${target.amount.toFixed(2)}`,
        discord_user_id: target.discord_user_id,
        payout_type: target.payout_type,
        amount: target.amount,
        solana_wallet: addr,
      },
    });

    toast.success(`Paid $${target.amount.toFixed(2)} to @${target.discord_username}`);
    setSaving(false);
    onClose();
    onPaid();
  };

  return (
    <Dialog open={!!target} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-primary" /> Pay @{target.discord_username}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Type</span><Badge variant="outline">{target.payout_type}</Badge></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Verified Clicks</span><span className="font-mono">{target.verified_clicks}</span></div>
            <div className="flex justify-between text-sm font-bold"><span className="text-muted-foreground">Amount Owed</span><span className="font-mono text-primary">${target.amount.toFixed(2)}</span></div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Solscan Transaction URL (receipt)</label>
            <Input placeholder="https://solscan.io/tx/..." value={solanaAddress}
              onChange={e => setSolanaAddress(e.target.value)} className="font-mono" />
            <p className="text-[10px] text-muted-foreground mt-1">Paste the Solscan link for this transaction as a payment receipt.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePay} disabled={saving || !solanaAddress.trim()}>
            <Banknote className="h-4 w-4 mr-1.5" /> {saving ? "Processing…" : "Confirm Paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Campaign Tab ─── */
const SHILL_FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smm-auto-shill`;
const shillHeaders = {
  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'Content-Type': 'application/json',
};

function CampaignTab() {
  const [config, setConfig] = useState({
    enabled: false, campaign_url: '', ticker: '',
    discord_app_id: '', discord_public_key: '',
    discord_channel_id: '', discord_listen_channel_id: '', discord_reply_channel_id: '',
    team_accounts: [] as string[], retweet_accounts: [] as string[],
    account_hashtags: {} as Record<string, string>,
    discord_assignments: {} as Record<string, string>,
    discord_usernames: {} as Record<string, string>,
  });
  const [feed, setFeed] = useState<{ id: string; action: string; meta: any; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const profileUsername = 'NysonBlack';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, feedRes] = await Promise.all([
        fetch(`${SHILL_FUNC_URL}?action=get-config&profile=${profileUsername}`, { headers: shillHeaders }).then(r => r.json()),
        fetch(`${SHILL_FUNC_URL}?action=feed&profile=${profileUsername}`, { headers: shillHeaders }).then(r => r.json()),
      ]);
      if (configRes?.config) {
        setConfig(prev => ({
          ...prev, ...configRes.config,
          team_accounts: configRes.config.team_accounts || [],
          retweet_accounts: configRes.config.retweet_accounts || [],
          account_hashtags: configRes.config.account_hashtags || {},
          discord_assignments: configRes.config.discord_assignments || {},
          discord_usernames: configRes.config.discord_usernames || {},
        }));
      }
      if (feedRes?.feed) setFeed(feedRes.feed);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${SHILL_FUNC_URL}?action=save-config`, {
        method: 'POST', headers: shillHeaders,
        body: JSON.stringify({ profile_username: profileUsername, ...config }),
      });
      toast.success('Campaign config saved');
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  const receivedCount = feed.filter(e => e.action === 'received').length;
  const repliedCount = feed.filter(e => e.action === 'replied').length;
  const failedCount = feed.filter(e => e.action === 'failed').length;
  const cooldownCount = feed.filter(e => e.action === 'cooldown').length;
  const retweetedCount = feed.filter(e => e.action === 'retweeted').length;

  if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Auto Shill Campaign
          </h2>
          <Badge variant={config.enabled ? "default" : "secondary"} className="text-[10px]">{config.enabled ? "ENABLED" : "DISABLED"}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}><Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm font-medium">Enable Auto Shill</span>
            <Switch checked={config.enabled} onCheckedChange={(v) => setConfig(prev => ({ ...prev, enabled: v }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Ticker</label>
            <Input value={config.ticker} onChange={(e) => setConfig(prev => ({ ...prev, ticker: e.target.value }))} placeholder="e.g. $whitehouse" className="h-8 text-sm font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Campaign URL</label>
            <Input value={config.campaign_url} onChange={(e) => setConfig(prev => ({ ...prev, campaign_url: e.target.value }))} placeholder="https://x.com/community/post/..." className="h-8 text-sm font-mono" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Listen Channel ID</label>
            <Input value={config.discord_listen_channel_id || config.discord_channel_id} onChange={(e) => setConfig(prev => ({ ...prev, discord_listen_channel_id: e.target.value }))} className="h-8 text-sm font-mono" />
            <p className="text-[10px] text-muted-foreground">Channel where users paste X links.</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Reply Channel ID</label>
            <Input value={config.discord_reply_channel_id || config.discord_channel_id} onChange={(e) => setConfig(prev => ({ ...prev, discord_reply_channel_id: e.target.value }))} className="h-8 text-sm font-mono" />
            <p className="text-[10px] text-muted-foreground">Channel where SHILL NOW alerts post.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {feed.length > 0 && (
        <div className="grid grid-cols-5 gap-2 rounded-md border border-border p-3 bg-muted/30">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{receivedCount}</p>
            <p className="text-[10px] text-muted-foreground">Received</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-green-500">{repliedCount}</p>
            <p className="text-[10px] text-muted-foreground">Replied</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-500">{retweetedCount}</p>
            <p className="text-[10px] text-muted-foreground">Retweeted</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-destructive">{failedCount}</p>
            <p className="text-[10px] text-muted-foreground">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-yellow-500">{cooldownCount}</p>
            <p className="text-[10px] text-muted-foreground">Cooldown</p>
          </div>
        </div>
      )}

      {/* Discord Bot Advanced */}
      <details className="rounded-md border border-border p-3 bg-muted/30">
        <summary className="text-xs font-semibold text-primary cursor-pointer">Discord Bot Settings (Advanced)</summary>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Application ID</label>
            <Input value={config.discord_app_id} onChange={(e) => setConfig(prev => ({ ...prev, discord_app_id: e.target.value }))} className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Public Key</label>
            <Input value={config.discord_public_key} onChange={(e) => setConfig(prev => ({ ...prev, discord_public_key: e.target.value }))} className="h-7 text-xs font-mono" />
          </div>
        </div>
      </details>
    </div>
  );
}

/* ---- MAIN PAGE ---- */
export default function ShillCRM() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("raiders");

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-5 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <HardHat className="h-6 w-6 text-primary" />
              Shill CRM
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage raiders, shiller accounts, rates & workflow settings
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/shillers">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Public Board
              </Button>
            </Link>
            <Link to="/shillers/raiders">
              <Button variant="outline" size="sm">
                <Shield className="h-4 w-4 mr-1.5" /> Raiders Board
              </Button>
            </Link>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="bg-muted/40 flex-wrap">
            <TabsTrigger value="raiders" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Raiders</TabsTrigger>
            <TabsTrigger value="shillers" className="gap-1.5"><HardHat className="h-3.5 w-3.5" /> Shillers</TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5"><Inbox className="h-3.5 w-3.5" /> Requests</TabsTrigger>
            <TabsTrigger value="payouts" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> Payouts</TabsTrigger>
            <TabsTrigger value="accounts" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Accounts</TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Activity</TabsTrigger>
            <TabsTrigger value="virality" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Virality</TabsTrigger>
            <TabsTrigger value="top-posts" className="gap-1.5"><Trophy className="h-3.5 w-3.5" /> Top Posts</TabsTrigger>
            <TabsTrigger value="campaign" className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Campaign</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="raiders"><RaidersTab /></TabsContent>
          <TabsContent value="shillers"><ShillersTab /></TabsContent>
          <TabsContent value="requests"><PayoutRequestsTab /></TabsContent>
          <TabsContent value="payouts"><PayoutsTab /></TabsContent>
          <TabsContent value="accounts"><AccountsTab /></TabsContent>
          <TabsContent value="activity"><ActivityTab /></TabsContent>
          <TabsContent value="virality"><ViralityTab /></TabsContent>
          <TabsContent value="top-posts"><TopPostsSection /></TabsContent>
          <TabsContent value="campaign"><CampaignTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   RAIDERS TAB
   ═══════════════════════════════════════════════════════════ */
function RaidersTab() {
  const [raiders, setRaiders] = useState<Raider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRaider, setEditRaider] = useState<Raider | null>(null);
  const [editFields, setEditFields] = useState({ secret_code: "", rate_per_click: "", status: "" });
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<PayoutTarget | null>(null);

  const [verifiedMap, setVerifiedMap] = useState<Map<string, { verified: number; pending: number }>>(new Map());
  const [badLinkMap, setBadLinkMap] = useState<Map<string, number>>(new Map());

  const fetchRaiders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("raiders").select("*").order("total_clicks", { ascending: false });
    setRaiders((data as Raider[]) || []);

    // Fetch verified/pending counts from shill_clicks for raids
    const { data: raidClicks } = await supabase
      .from("shill_clicks")
      .select("discord_user_id, status")
      .eq("click_type", "raid");

    const vMap = new Map<string, { verified: number; pending: number }>();
    for (const c of raidClicks || []) {
      const entry = vMap.get(c.discord_user_id) || { verified: 0, pending: 0 };
      if (c.status === "verified") entry.verified++;
      else if (c.status === "clicked") entry.pending++;
      vMap.set(c.discord_user_id, entry);
    }
    setVerifiedMap(vMap);

    // Fetch bad link flags from activity_log
    const { data: badLinks } = await supabase
      .from("activity_log")
      .select("meta")
      .eq("entity_type", "shill-bad-link")
      .eq("action", "flagged");

    const bMap = new Map<string, number>();
    for (const bl of badLinks || []) {
      const meta = bl.meta as any;
      const uid = meta?.shiller_discord_user_id;
      if (uid) bMap.set(uid, (bMap.get(uid) || 0) + 1);
    }
    setBadLinkMap(bMap);

    setLoading(false);
  }, []);

  useEffect(() => { fetchRaiders(); }, [fetchRaiders]);

  const handleGenerateCodes = (count: number) => {
    const existing = new Set([...raiders.map(r => r.secret_code).filter(Boolean), ...generatedCodes]);
    const codes: string[] = [];
    let attempts = 0;
    while (codes.length < count && attempts < 200) {
      const code = generateSecretCode();
      if (!existing.has(code)) { codes.push(code); existing.add(code); }
      attempts++;
    }
    setGeneratedCodes(prev => [...codes, ...prev]);
    toast.success(`Generated ${codes.length} codes`);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(`#${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast.success(`Copied #${code}`);
  };

  const openEdit = (r: Raider) => {
    setEditRaider(r);
    setEditFields({
      secret_code: r.secret_code || "",
      rate_per_click: String(r.rate_per_click),
      status: r.status,
    });
  };

  const handleSaveRaider = async () => {
    if (!editRaider) return;
    const { error } = await supabase.from("raiders").update({
      secret_code: editFields.secret_code.trim().replace(/^#/, "") || null,
      rate_per_click: parseFloat(editFields.rate_per_click) || 0.02,
      status: editFields.status,
      updated_at: new Date().toISOString(),
    }).eq("id", editRaider.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Updated ${editRaider.discord_username}`);
    setEditRaider(null);
    fetchRaiders();
  };

  const handleDeleteRaider = async (r: Raider) => {
    if (!confirm(`Delete raider ${r.discord_username}? This cannot be undone.`)) return;
    const { error } = await supabase.from("raiders").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Raider deleted"); fetchRaiders(); }
  };

  const handleResetRaiderEarnings = async (r: Raider) => {
    if (!confirm(`Reset all earnings & pending clicks for ${r.discord_username} to $0? This cannot be undone.`)) return;
    // Delete all raid clicks (verified + unverified pending)
    const { error } = await supabase.from("shill_clicks").delete()
      .eq("discord_user_id", r.discord_user_id)
      .eq("click_type", "raid");
    if (error) { toast.error(error.message); return; }
    // Remove pending payout requests for this user
    await supabase.from("payout_requests").delete()
      .eq("discord_user_id", r.discord_user_id)
      .eq("status", "pending");
    toast.success(`Cleared all clicks & payouts for ${r.discord_username}`);
    fetchRaiders();
  };

  const totalVerifiedEarned = raiders.reduce((s, r) => {
    const v = verifiedMap.get(r.discord_user_id);
    return s + (v?.verified || 0) * r.rate_per_click;
  }, 0);
  const totalPendingRaids = raiders.reduce((s, r) => {
    const v = verifiedMap.get(r.discord_user_id);
    return s + (v?.pending || 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={Users} label="Raiders" value={raiders.length} />
        <StatCard icon={Hash} label="Active" value={raiders.filter(r => r.status === "active").length} color="text-green-500" />
        <StatCard icon={DollarSign} label="Verified Owed" value={`$${totalVerifiedEarned.toFixed(2)}`} color="text-primary" />
        <StatCard icon={Shield} label="Pending Raids" value={totalPendingRaids} color="text-yellow-500" />
      </div>

      {/* Code generator */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Code Generator</span>
          </div>
          <div className="flex gap-2">
            {[1, 5, 10].map(n => (
              <Button key={n} variant="outline" size="sm" onClick={() => handleGenerateCodes(n)}>+{n}</Button>
            ))}
          </div>
        </div>
        {generatedCodes.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {generatedCodes.map(code => (
                <button key={code} onClick={() => handleCopyCode(code)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors font-mono text-sm text-foreground">
                  #{code}
                  {copiedCode === code ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Discord User</TableHead>
              <TableHead>Secret Code</TableHead>
              <TableHead>Solana Wallet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Verified</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">🚫 Flags</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Owed</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {raiders.map(r => {
              const v = verifiedMap.get(r.discord_user_id) || { verified: 0, pending: 0 };
              const flags = badLinkMap.get(r.discord_user_id) || 0;
              return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.discord_username}</TableCell>
                <TableCell>
                  {r.secret_code
                    ? <Badge variant="outline" className="font-mono">#{r.secret_code}</Badge>
                    : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell>
                  {r.solana_wallet
                    ? <span className="font-mono text-xs text-foreground">{r.solana_wallet.slice(0, 4)}...{r.solana_wallet.slice(-4)}</span>
                    : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "default" : "destructive"} className="text-xs">{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{v.verified}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{v.pending}</TableCell>
                <TableCell className="text-right font-mono">
                  {flags > 0
                    ? <Badge variant="destructive" className="text-xs">{flags}</Badge>
                    : <span className="text-muted-foreground">0</span>}
                </TableCell>
                <TableCell className="text-right font-mono">${r.rate_per_click}</TableCell>
                <TableCell className="text-right font-mono">${(v.verified * r.rate_per_click).toFixed(2)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {v.verified > 0 && (
                      <Button variant="ghost" size="sm" className="text-primary" onClick={() => setPayTarget({
                        discord_user_id: r.discord_user_id,
                        discord_username: r.discord_username,
                        amount: v.verified * r.rate_per_click,
                        verified_clicks: v.verified,
                        payout_type: "raid",
                        solana_wallet: r.solana_wallet,
                      })}><Banknote className="h-3.5 w-3.5" /></Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    {(v.verified > 0 || v.pending > 0) && (
                      <Button variant="ghost" size="sm" title="Reset earnings" onClick={() => handleResetRaiderEarnings(r)}><RotateCcw className="h-3.5 w-3.5 text-yellow-500" /></Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteRaider(r)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
            {raiders.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">No raiders yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Refresh */}
      <Button variant="outline" size="sm" onClick={fetchRaiders} disabled={loading}>
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
      </Button>

      {/* Edit Dialog */}
      <Dialog open={!!editRaider} onOpenChange={open => !open && setEditRaider(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Raider — {editRaider?.discord_username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Secret Code</label>
              <Input placeholder="e.g. alpha7" value={editFields.secret_code}
                onChange={e => setEditFields(f => ({ ...f, secret_code: e.target.value }))} className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Rate per Click ($)</label>
              <Input type="number" step="0.01" value={editFields.rate_per_click}
                onChange={e => setEditFields(f => ({ ...f, rate_per_click: e.target.value }))} className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <div className="flex gap-2">
                {["active", "suspended"].map(s => (
                  <Button key={s} variant={editFields.status === s ? "default" : "outline"} size="sm"
                    onClick={() => setEditFields(f => ({ ...f, status: s }))}>{s}</Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRaider(null)}>Cancel</Button>
            <Button onClick={handleSaveRaider}><Save className="h-4 w-4 mr-1.5" /> Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayoutDialog target={payTarget} onClose={() => setPayTarget(null)} onPaid={fetchRaiders} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHILLERS TAB (aggregated from shill_clicks + outbound_accounts)
   ═══════════════════════════════════════════════════════════ */
interface ShillerRow {
  discord_user_id: string;
  discord_username: string;
  total_shills: number;
  verified_shills: number;
  verified_earned: number;
  pending_count: number;
  last_active: string;
  x_handle: string | null;
  solana_wallet: string | null;
  status: string;
}

function ShillersTab() {
  const [shillers, setShillers] = useState<ShillerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editShiller, setEditShiller] = useState<ShillerRow | null>(null);
  const [editFields, setEditFields] = useState({ x_handle: "", solana_wallet: "", status: "active" });
  const [payTarget, setPayTarget] = useState<PayoutTarget | null>(null);

  const fetchShillers = useCallback(async () => {
    setLoading(true);

    // Fetch clicks, raiders, and authorized shiller assignments in parallel
    const [clicksRes, raidersRes, configsRes] = await Promise.all([
      supabase
        .from("shill_clicks")
        .select("discord_user_id, discord_username, rate, created_at, click_type, status")
        .eq("click_type", "shill")
        .order("created_at", { ascending: false }),
      supabase.from("raiders").select("discord_user_id, solana_wallet, status"),
      supabase.from("site_configs").select("content").eq("section", "config").eq("site_id", "smm-auto-shill"),
    ]);

    const clicks = clicksRes.data || [];
    const raiderMap = new Map((raidersRes.data || []).map(r => [r.discord_user_id, r]));

    // Extract authorized shillers from site_configs discord_assignments
    const authorizedShillers = new Map<string, { discord_username: string; x_handle: string | null }>();
    for (const row of (configsRes.data || [])) {
      const assignments = (row.content as any)?.discord_assignments || {};
      for (const [userId, assignment] of Object.entries(assignments)) {
        const a = assignment as any;
        authorizedShillers.set(userId, {
          discord_username: a.discord_username || a.handle || userId,
          x_handle: a.handle || a.x_handle || null,
        });
      }
    }

    const map = new Map<string, ShillerRow>();

    // Seed with authorized shillers first (so they show even with 0 clicks)
    for (const [userId, info] of authorizedShillers) {
      const raider = raiderMap.get(userId);
      map.set(userId, {
        discord_user_id: userId,
        discord_username: info.discord_username,
        total_shills: 0,
        verified_shills: 0,
        verified_earned: 0,
        pending_count: 0,
        last_active: new Date().toISOString(),
        x_handle: info.x_handle,
        solana_wallet: raider?.solana_wallet || null,
        status: raider?.status || "active",
      });
    }

    // Aggregate clicks
    for (const c of clicks) {
      const existing = map.get(c.discord_user_id);
      const raider = raiderMap.get(c.discord_user_id);
      const isVerified = c.status === "verified";
      const rate = Number(c.rate || 0.05);

      if (existing) {
        existing.total_shills++;
        if (isVerified) { existing.verified_shills++; existing.verified_earned += rate; }
        else if (c.status === "clicked") existing.pending_count++;
        if (c.created_at > existing.last_active) existing.last_active = c.created_at;
      } else {
        map.set(c.discord_user_id, {
          discord_user_id: c.discord_user_id,
          discord_username: c.discord_username,
          total_shills: 1,
          verified_shills: isVerified ? 1 : 0,
          verified_earned: isVerified ? rate : 0,
          pending_count: c.status === "clicked" ? 1 : 0,
          last_active: c.created_at,
          x_handle: null,
          solana_wallet: raider?.solana_wallet || null,
          status: raider?.status || "active",
        });
      }
    }

    setShillers(Array.from(map.values()).sort((a, b) => b.verified_shills - a.verified_shills));
    setLoading(false);
  }, []);

  useEffect(() => { fetchShillers(); }, [fetchShillers]);

  const openEdit = (s: ShillerRow) => {
    setEditShiller(s);
    setEditFields({
      x_handle: s.x_handle || "",
      solana_wallet: s.solana_wallet || "",
      status: s.status,
    });
  };

  const handleSave = async () => {
    if (!editShiller) return;
    // Upsert into raiders table to persist shiller details
    const { data: existing } = await supabase
      .from("raiders")
      .select("id")
      .eq("discord_user_id", editShiller.discord_user_id)
      .maybeSingle();

    if (existing) {
      await supabase.from("raiders").update({
        solana_wallet: editFields.solana_wallet.trim() || null,
        status: editFields.status,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("raiders").insert({
        discord_user_id: editShiller.discord_user_id,
        discord_username: editShiller.discord_username,
        solana_wallet: editFields.solana_wallet.trim() || null,
        status: editFields.status,
        rate_per_click: 0.05,
      });
    }

    toast.success(`Updated ${editShiller.discord_username}`);
    setEditShiller(null);
    fetchShillers();
  };

  const handleResetShillerEarnings = async (s: ShillerRow) => {
    if (!confirm(`Clear all earnings & pending clicks for ${s.discord_username}? This cannot be undone.`)) return;
    // Delete all shill clicks (verified + unverified pending)
    const { error } = await supabase.from("shill_clicks").delete()
      .eq("discord_user_id", s.discord_user_id)
      .eq("click_type", "shill");
    if (error) { toast.error(error.message); return; }
    // Remove pending payout requests for this user
    await supabase.from("payout_requests").delete()
      .eq("discord_user_id", s.discord_user_id)
      .eq("status", "pending");
    toast.success(`Cleared all clicks & payouts for ${s.discord_username}`);
    fetchShillers();
  };

  const totalVerifiedEarned = shillers.reduce((s, sh) => s + sh.verified_earned, 0);
  const totalPending = shillers.reduce((s, sh) => s + sh.pending_count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={HardHat} label="Shillers" value={shillers.length} />
        <StatCard icon={Activity} label="Verified Shills" value={shillers.reduce((s, sh) => s + sh.verified_shills, 0)} />
        <StatCard icon={DollarSign} label="Verified Owed" value={`$${totalVerifiedEarned.toFixed(2)}`} color="text-primary" />
        <StatCard icon={Users} label="Pending" value={totalPending} color="text-yellow-500" />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Discord User</TableHead>
              <TableHead>Solana Wallet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Verified</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Owed</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shillers.map(s => (
              <TableRow key={s.discord_user_id}>
                <TableCell className="font-medium">@{s.discord_username}</TableCell>
                <TableCell>
                  {s.solana_wallet
                    ? <span className="font-mono text-xs text-foreground">{s.solana_wallet.slice(0, 4)}...{s.solana_wallet.slice(-4)}</span>
                    : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "default" : "destructive"} className="text-xs">{s.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{s.verified_shills}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{s.pending_count}</TableCell>
                <TableCell className="text-right font-mono">${s.verified_earned.toFixed(2)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(s.last_active), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {s.verified_earned > 0 && (
                      <Button variant="ghost" size="sm" className="text-primary" onClick={() => setPayTarget({
                        discord_user_id: s.discord_user_id,
                        discord_username: s.discord_username,
                        amount: s.verified_earned,
                        verified_clicks: s.verified_shills,
                        payout_type: "shill",
                        solana_wallet: s.solana_wallet,
                      })}><Banknote className="h-3.5 w-3.5" /></Button>
                    )}
                    {(s.verified_earned > 0 || s.pending_count > 0) && (
                      <Button variant="ghost" size="sm" title="Reset earnings" onClick={() => handleResetShillerEarnings(s)}><RotateCcw className="h-3.5 w-3.5 text-yellow-500" /></Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {shillers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No shillers yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Button variant="outline" size="sm" onClick={fetchShillers} disabled={loading}>
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
      </Button>

      {/* Edit Dialog */}
      <Dialog open={!!editShiller} onOpenChange={open => !open && setEditShiller(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shiller — @{editShiller?.discord_username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Solana Wallet</label>
              <Input placeholder="Solana public address" value={editFields.solana_wallet}
                onChange={e => setEditFields(f => ({ ...f, solana_wallet: e.target.value }))} className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <div className="flex gap-2">
                {["active", "suspended"].map(s => (
                  <Button key={s} variant={editFields.status === s ? "default" : "outline"} size="sm"
                    onClick={() => setEditFields(f => ({ ...f, status: s }))}>{s}</Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditShiller(null)}>Cancel</Button>
            <Button onClick={handleSave}><Save className="h-4 w-4 mr-1.5" /> Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayoutDialog target={payTarget} onClose={() => setPayTarget(null)} onPaid={fetchShillers} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAYOUT REQUESTS TAB (user-initiated /payout requests)
   ═══════════════════════════════════════════════════════════ */
function PayoutRequestsTab() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<PayoutTarget | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("payout_requests").select("*").order("created_at", { ascending: false }).limit(500);
    setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const pendingRequests = requests.filter(r => r.status === "pending");
  const processedRequests = requests.filter(r => r.status !== "pending");
  const totalPendingAmount = pendingRequests.reduce((s, r) => s + Number(r.amount_owed), 0);

  const handleApproveAndPay = (req: any) => {
    setPayTarget({
      discord_user_id: req.discord_user_id,
      discord_username: req.discord_username,
      amount: Number(req.amount_owed),
      verified_clicks: req.verified_clicks,
      payout_type: req.user_type === "raider" ? "raid" : "shill",
      solana_wallet: req.solana_wallet,
    });
  };

  const handleReject = async (req: any) => {
    if (!confirm(`Reject payout request from @${req.discord_username}?`)) return;
    const { error } = await supabase.from("payout_requests").update({
      status: "rejected",
      processed_by: user?.id || null,
      processed_at: new Date().toISOString(),
      admin_notes: "Rejected by admin",
    }).eq("id", req.id);
    if (error) toast.error(error.message);
    else { toast.success("Request rejected"); fetchRequests(); }
  };

  const handlePaidCallback = async () => {
    // Mark all pending requests for this user as processed
    if (payTarget) {
      await supabase.from("payout_requests").update({
        status: "processed",
        processed_by: user?.id || null,
        processed_at: new Date().toISOString(),
      }).eq("discord_user_id", payTarget.discord_user_id).eq("status", "pending");
    }
    fetchRequests();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={Inbox} label="Pending" value={pendingRequests.length} color="text-yellow-500" />
        <StatCard icon={DollarSign} label="Pending Total" value={`$${totalPendingAmount.toFixed(2)}`} color="text-primary" />
        <StatCard icon={CheckCircle2} label="Processed" value={processedRequests.filter(r => r.status === "processed").length} color="text-green-500" />
        <StatCard icon={XCircle} label="Rejected" value={processedRequests.filter(r => r.status === "rejected").length} color="text-destructive" />
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-500" /> Pending Payout Requests
          </h3>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">@{r.discord_username}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.user_type}</Badge></TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">${Number(r.amount_owed).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{r.verified_clicks}</TableCell>
                    <TableCell className="font-mono text-xs">{r.solana_wallet?.slice(0, 6)}...{r.solana_wallet?.slice(-4)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleApproveAndPay(r)}>
                          <Banknote className="h-3.5 w-3.5 mr-1" /> Pay
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleReject(r)}>
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {pendingRequests.length === 0 && (
        <div className="rounded-lg border border-border p-12 text-center text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No pending payout requests</p>
          <p className="text-xs mt-1">Users can request payouts via <code>/payout</code> in Discord</p>
        </div>
      )}

      {/* Processed History */}
      {processedRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Previous Requests</h3>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Processed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedRequests.slice(0, 50).map(r => (
                  <TableRow key={r.id} className="opacity-70">
                    <TableCell className="font-medium">@{r.discord_username}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.user_type}</Badge></TableCell>
                    <TableCell className="text-right font-mono">${Number(r.amount_owed).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "processed" ? "default" : "destructive"} className="text-xs">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.solana_wallet?.slice(0, 6)}...{r.solana_wallet?.slice(-4)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.processed_at ? format(new Date(r.processed_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
      </Button>

      <PayoutDialog target={payTarget} onClose={() => setPayTarget(null)} onPaid={handlePaidCallback} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAYOUTS TAB (shill_payouts history)
   ═══════════════════════════════════════════════════════════ */
function PayoutsTab() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("shill_payouts").select("*").order("created_at", { ascending: false }).limit(500);
    setPayouts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  const totalPaid = payouts.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Receipt} label="Total Payouts" value={payouts.length} />
        <StatCard icon={DollarSign} label="Total Paid" value={`$${totalPaid.toFixed(2)}`} color="text-primary" />
        <StatCard icon={Users} label="Unique Users" value={new Set(payouts.map(p => p.discord_user_id)).size} />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead>Solana Wallet</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">@{p.discord_username}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{p.payout_type}</Badge></TableCell>
                <TableCell className="text-right font-mono">${Number(p.amount).toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono">{p.verified_clicks}</TableCell>
                <TableCell className="font-mono text-xs">{p.solana_wallet?.slice(0, 6)}...{p.solana_wallet?.slice(-4)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d, yyyy h:mm a")}</TableCell>
              </TableRow>
            ))}
            {payouts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No payouts recorded yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Button variant="outline" size="sm" onClick={fetchPayouts} disabled={loading}>
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
      </Button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACCOUNTS TAB (outbound_accounts)
   ═══════════════════════════════════════════════════════════ */
function AccountsTab() {
  const [accounts, setAccounts] = useState<OutboundAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editAcct, setEditAcct] = useState<OutboundAccount | null>(null);
  const [editFields, setEditFields] = useState({ account_label: "", daily_limit: "", auto_send_enabled: false, is_authorized: false });

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("outbound_accounts").select("*").order("created_at", { ascending: false });
    setAccounts((data as OutboundAccount[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const openEdit = (a: OutboundAccount) => {
    setEditAcct(a);
    setEditFields({
      account_label: a.account_label,
      daily_limit: String(a.daily_limit),
      auto_send_enabled: a.auto_send_enabled,
      is_authorized: a.is_authorized,
    });
  };

  const handleSave = async () => {
    if (!editAcct) return;
    const { error } = await supabase.from("outbound_accounts").update({
      account_label: editFields.account_label,
      daily_limit: parseInt(editFields.daily_limit) || 25,
      auto_send_enabled: editFields.auto_send_enabled,
      is_authorized: editFields.is_authorized,
    }).eq("id", editAcct.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Account updated");
    setEditAcct(null);
    fetch();
  };

  const handleDelete = async (a: OutboundAccount) => {
    if (!confirm(`Remove ${a.account_label}?`)) return;
    const { error } = await supabase.from("outbound_accounts").delete().eq("id", a.id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); fetch(); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Users} label="Total Accounts" value={accounts.length} />
        <StatCard icon={Shield} label="Authorized" value={accounts.filter(a => a.is_authorized).length} color="text-green-500" />
        <StatCard icon={Activity} label="Auto-Send On" value={accounts.filter(a => a.auto_send_enabled).length} color="text-primary" />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Identifier</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Authorized</TableHead>
              <TableHead>Auto-Send</TableHead>
              <TableHead className="text-right">Daily Limit</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map(a => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.account_label}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.account_identifier}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{a.platform}</Badge></TableCell>
                <TableCell>{a.is_authorized ? <Badge className="text-xs bg-green-500/10 text-green-500 border-green-500/20">Yes</Badge> : <Badge variant="destructive" className="text-xs">No</Badge>}</TableCell>
                <TableCell>{a.auto_send_enabled ? <Badge className="text-xs bg-primary/10 text-primary border-primary/20">On</Badge> : <span className="text-xs text-muted-foreground">Off</span>}</TableCell>
                <TableCell className="text-right font-mono">{a.daily_limit}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(a)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No accounts configured.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Button variant="outline" size="sm" onClick={fetch} disabled={loading}>
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
      </Button>

      {/* Edit Dialog */}
      <Dialog open={!!editAcct} onOpenChange={open => !open && setEditAcct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Account — {editAcct?.account_label}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
              <Input value={editFields.account_label} onChange={e => setEditFields(f => ({ ...f, account_label: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Daily Limit</label>
              <Input type="number" value={editFields.daily_limit} onChange={e => setEditFields(f => ({ ...f, daily_limit: e.target.value }))} className="font-mono" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">Authorized</label>
              <Switch checked={editFields.is_authorized} onCheckedChange={v => setEditFields(f => ({ ...f, is_authorized: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">Auto-Send</label>
              <Switch checked={editFields.auto_send_enabled} onCheckedChange={v => setEditFields(f => ({ ...f, auto_send_enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAcct(null)}>Cancel</Button>
            <Button onClick={handleSave}><Save className="h-4 w-4 mr-1.5" /> Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACTIVITY TAB (recent shill_clicks)
   ═══════════════════════════════════════════════════════════ */
function ActivityTab() {
  const [clicks, setClicks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("shill_clicks").select("*").order("created_at", { ascending: false }).limit(300);
    setClicks(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const shills = clicks.filter(c => c.click_type === "shill");
  const raids = clicks.filter(c => c.click_type === "raid");
  const pendingCount = clicks.filter(c => c.status === "clicked").length;
  const verifiedCount = clicks.filter(c => c.status === "verified").length;

  const handleVerify = async (id: string) => {
    const { error } = await supabase.from("shill_clicks").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Verified"); fetch(); }
  };

  const handleReject = async (id: string) => {
    const { error } = await supabase.from("shill_clicks").update({ status: "rejected" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Rejected"); fetch(); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={Activity} label="Total Clicks" value={clicks.length} />
        <StatCard icon={HardHat} label="Shills" value={shills.length} />
        <StatCard icon={Shield} label="Raids" value={raids.length} />
        <StatCard icon={DollarSign} label="Pending" value={pendingCount} color="text-yellow-500" />
      </div>

      <ScrollArea className="h-[500px] rounded-lg border border-border">
        <div className="p-3 space-y-1.5">
          {clicks.map(click => (
            <div key={click.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{click.discord_username}</span>
                  <Badge variant="outline" className="text-[9px]">{click.click_type}</Badge>
                  <Badge variant={click.status === "verified" ? "default" : "outline"}
                    className={`text-[9px] ${click.status === "verified" ? "bg-green-500/10 text-green-500 border-green-500/20" : click.status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/20" : "border-yellow-500/30 text-yellow-500"}`}>
                    {click.status}
                  </Badge>
                  {click.raider_secret_code && (
                    <Badge variant="secondary" className="text-[9px] font-mono">#{click.raider_secret_code}</Badge>
                  )}
                </div>
                {click.tweet_url && (
                  <a href={click.tweet_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate block">
                    {click.tweet_url.replace(/https?:\/\/(x\.com|twitter\.com)\//, "")}
                  </a>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">${click.rate}</span>
              {click.status === "clicked" && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-green-500" onClick={() => handleVerify(click.id)}>✓</Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-destructive" onClick={() => handleReject(click.id)}>✗</Button>
                </div>
              )}
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(click.created_at), { addSuffix: true })}
              </span>
            </div>
          ))}
          {clicks.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No activity yet.</div>
          )}
        </div>
      </ScrollArea>

      <Button variant="outline" size="sm" onClick={fetch} disabled={loading}>
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
      </Button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS TAB (reply_engine_settings for shill config)
   ═══════════════════════════════════════════════════════════ */
function SettingsTab() {
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("reply_engine_settings").select("*").eq("key", "shill_config").single();
    if (data) setConfig((data.value as Record<string, any>) || {});
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("reply_engine_settings").update({ value: config, updated_at: new Date().toISOString() }).eq("key", "shill_config");
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  };

  const updateField = (key: string, val: any) => setConfig(prev => ({ ...prev, [key]: val }));

  if (loading) return <div className="text-muted-foreground text-sm py-12 text-center">Loading settings…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-lg border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Shill Workflow Configuration</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-foreground">Enabled</label>
            <Switch checked={!!config.enabled} onCheckedChange={v => updateField("enabled", v)} />
          </div>
          <Separator />
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Campaign URL</label>
            <Input value={config.campaign_url || ""} onChange={e => updateField("campaign_url", e.target.value)} placeholder="https://pump.fun/..." />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ticker</label>
            <Input value={config.ticker || ""} onChange={e => updateField("ticker", e.target.value)} placeholder="$TICKER" className="font-mono" />
          </div>
          <Separator />
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Discord Channel ID (shill alerts)</label>
            <Input value={config.discord_channel_id || ""} onChange={e => updateField("discord_channel_id", e.target.value)} className="font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Discord Listen Channel ID</label>
            <Input value={config.discord_listen_channel_id || ""} onChange={e => updateField("discord_listen_channel_id", e.target.value)} className="font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Discord Reply/Verification Channel ID</label>
            <Input value={config.discord_reply_channel_id || ""} onChange={e => updateField("discord_reply_channel_id", e.target.value)} className="font-mono" />
          </div>
          <Separator />
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Shill Rate ($/click)</label>
            <Input type="number" step="0.01" value={config.shill_rate ?? "0.05"} onChange={e => updateField("shill_rate", e.target.value)} className="font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Raid Rate ($/click)</label>
            <Input type="number" step="0.01" value={config.raid_rate ?? "0.02"} onChange={e => updateField("raid_rate", e.target.value)} className="font-mono" />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  );
}

/* ─── Shared stat card ─── */
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-border p-4 text-center">
      <Icon className={`h-5 w-5 mx-auto mb-1 ${color || "text-primary"}`} />
      <p className={`text-2xl font-bold ${color || "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}
