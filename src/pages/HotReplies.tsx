import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Phone, RefreshCw, Settings, Flame, AlertTriangle, Ban, PhoneOff, DollarSign, PhoneCall, Clock, Loader2, ArrowUpDown, MessageSquare, ThumbsUp, ThumbsDown, HelpCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";

// Triage classification — buckets already-called/texted leads into Interested / Not Interested / Maybe
const INTERESTED_CLASSES = new Set(["HOT_POSITIVE", "WARM_INTERESTED", "PRICING_QUESTION", "CALLBACK_REQUEST"]);
const NOT_INTERESTED_CLASSES = new Set(["NEGATIVE", "OPT_OUT", "WRONG_NUMBER", "AUTO_REPLY"]);
const INTERESTED_STATUSES = new Set(["interested", "follow_up", "appointment", "proposal", "closed"]);
const NOT_INTERESTED_STATUSES = new Set(["not_interested"]);

function triageBucket(r: { ai_classification: string | null; call_status: string; is_opt_out: boolean; triage_override?: string | null }): 'interested' | 'not_interested' | 'maybe' {
  if (r.triage_override === 'interested' || r.triage_override === 'not_interested' || r.triage_override === 'maybe') return r.triage_override;
  if (r.is_opt_out || NOT_INTERESTED_CLASSES.has(r.ai_classification || "") || NOT_INTERESTED_STATUSES.has(r.call_status)) return 'not_interested';
  if (INTERESTED_CLASSES.has(r.ai_classification || "") || INTERESTED_STATUSES.has(r.call_status)) return 'interested';
  return 'maybe';
}
import SmsThreadPopup from "@/components/phone/SmsThreadPopup";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import WarmWelcomeCampaignPanel from "@/components/hot-replies/WarmWelcomeCampaignPanel";
import WarmWelcomeBucketCounter from "@/components/sms/WarmWelcomeBucketCounter";
import GlobalApiCooldownPanel from "@/components/sms/GlobalApiCooldownPanel";

function dialViaTwilio(phone: string, navigate: (p: string) => void) {
  // Mirror CampaignManualDialer protocol — open the in-browser Twilio keypad on /phone
  navigate("/phone");
  // Give the page a tick to mount the keypad before dispatching the dial event
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("twilio:dial", { detail: { phone } }));
  }, 400);
}

async function copyPhoneToClipboard(phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  const e164 = digits.length === 10 ? `+1${digits}` : digits.length ? `+${digits}` : phone;
  try {
    await navigator.clipboard.writeText(e164);
    toast.success(`Copied ${e164}`);
  } catch {
    toast.error("Could not copy number");
  }
}

type Reply = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  reply_text: string;
  campaign_name: string | null;
  source: string | null;
  original_date: string | null;
  original_time: string | null;
  imported_at: string;
  ai_classification: string | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  is_hot: boolean;
  is_opt_out: boolean;
  call_status: string;
  notes: string | null;
  triage_override?: string | null;
};

const HOT_CLASSES = ["HOT_POSITIVE", "WARM_INTERESTED", "PRICING_QUESTION", "CALLBACK_REQUEST", "NEEDS_REVIEW"];

const CALL_STATUSES = [
  { value: "not_called", label: "Not Called" },
  { value: "no_answer", label: "Called - No Answer" },
  { value: "interested", label: "Called - Interested" },
  { value: "follow_up", label: "Called - Needs Follow-Up" },
  { value: "not_interested", label: "Called - Not Interested" },
  { value: "appointment", label: "Booked Appointment" },
  { value: "proposal", label: "Proposal Sent" },
  { value: "closed", label: "Closed" },
];

const CLASS_COLORS: Record<string, string> = {
  HOT_POSITIVE: "bg-red-500/15 text-red-500 border-red-500/30",
  WARM_INTERESTED: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  PRICING_QUESTION: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  CALLBACK_REQUEST: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  NEEDS_REVIEW: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  NEGATIVE: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  OPT_OUT: "bg-red-700/20 text-red-700 border-red-700/30",
  WRONG_NUMBER: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  AUTO_REPLY: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

export default function HotReplies() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("hot");
  const [triageTab, setTriageTab] = useState<'interested' | 'not_interested' | 'maybe'>('interested');
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<'latest' | 'earliest'>(() => {
    try { return (localStorage.getItem('hot-replies-sort-dir') as 'latest' | 'earliest') || 'latest'; } catch { return 'latest'; }
  });
  const [selected, setSelected] = useState<Reply | null>(null);
  const [smsThread, setSmsThread] = useState<{ phone: string; name: string | null; replyText: string | null; replyAt: string | null } | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [noteList, setNoteList] = useState<any[]>([]);
  const [callPicker, setCallPicker] = useState<{ phone: string; lead?: Reply | null } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("hot_reply_imports").select("*").order("imported_at", { ascending: false }).limit(1000);
    setRows((data as Reply[]) || []);
    const { data: s } = await supabase.from("hot_reply_sync_settings").select("*").limit(1).maybeSingle();
    if (s) {
      setSheetUrl(s.google_sheet_url || "");
      setSheetName(s.sheet_name || "Sheet1");
      setLastSync(s.last_sync_at);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    try { localStorage.setItem('hot-replies-sort-dir', sortDir); } catch {}
  }, [sortDir]);

  const sync = async () => {
    if (!sheetUrl) { toast.error("Add a Google Sheet URL first"); setSettingsOpen(true); return; }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("hot-replies-sync", {
        body: { sheet_url: sheetUrl, sheet_name: sheetName },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Synced — ${data.imported} imported, ${data.skipped} skipped`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally { setSyncing(false); }
  };

  const saveSettings = async () => {
    const { data: existing } = await supabase.from("hot_reply_sync_settings").select("id").limit(1).maybeSingle();
    if (existing) {
      await supabase.from("hot_reply_sync_settings").update({ google_sheet_url: sheetUrl, sheet_name: sheetName }).eq("id", existing.id);
    } else {
      await supabase.from("hot_reply_sync_settings").insert({ google_sheet_url: sheetUrl, sheet_name: sheetName });
    }
    toast.success("Settings saved");
    setSettingsOpen(false);
  };

  // Auto-sync on load if a URL is configured
  useEffect(() => {
    if (sheetUrl && !lastSync) { sync(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetUrl]);

  const isToday = (iso?: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  // original_date arrives as "M/D/YYYY" from the sheet
  const isOriginalToday = (orig?: string | null) => {
    if (!orig) return false;
    const m = orig.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return false;
    const now = new Date();
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += 2000;
    return parseInt(m[1], 10) === now.getMonth() + 1
      && parseInt(m[2], 10) === now.getDate()
      && yr === now.getFullYear();
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const hot = rows.filter(r => r.is_hot && !r.is_opt_out && r.call_status === "not_called" && isOriginalToday(r.original_date)).length;
    const pricing = rows.filter(r => r.ai_classification === "PRICING_QUESTION" && r.call_status === "not_called").length;
    const callback = rows.filter(r => r.ai_classification === "CALLBACK_REQUEST" && r.call_status === "not_called").length;
    const optOut = rows.filter(r => r.is_opt_out && r.call_status === "not_called").length;
    const notCalled = rows.filter(r => r.is_hot && !r.is_opt_out && r.call_status === "not_called").length;
    const today = new Date().toISOString().slice(0, 10);
    const calledToday = rows.filter(r => r.call_status !== "not_called" && r.imported_at?.slice(0, 10) === today).length;
    return { total, hot, pricing, callback, optOut, notCalled, calledToday };
  }, [rows]);

  const campaigns = useMemo(() => {
    const set = new Set(rows.map(r => r.campaign_name).filter(Boolean) as string[]);
    return ["all", ...Array.from(set)];
  }, [rows]);

  const calledRows = useMemo(() => rows.filter(r => r.call_status !== "not_called"), [rows]);
  const triageCounts = useMemo(() => {
    const c = { interested: 0, not_interested: 0, maybe: 0 };
    calledRows.forEach(r => { c[triageBucket(r)]++; });
    return c;
  }, [calledRows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "triage") {
      list = calledRows.filter(r => triageBucket(r) === triageTab);
    } else if (filter === "called") {
      list = list.filter(r => r.call_status !== "not_called");
    } else {
      list = list.filter(r => r.call_status === "not_called");
      if (filter === "hot") list = list.filter(r => r.is_hot && !r.is_opt_out && isOriginalToday(r.original_date));
      else if (filter === "needs_review") list = list.filter(r => r.ai_classification === "NEEDS_REVIEW");
      else if (filter === "pricing") list = list.filter(r => r.ai_classification === "PRICING_QUESTION");
      else if (filter === "callback") list = list.filter(r => r.ai_classification === "CALLBACK_REQUEST");
      else if (filter === "not_called") list = list.filter(r => r.is_hot && !r.is_opt_out);
      else if (filter === "opt_outs") list = list.filter(r => r.is_opt_out);
    }
    if (campaignFilter !== "all") list = list.filter(r => r.campaign_name === campaignFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.phone || "").toLowerCase().includes(q) ||
        (r.reply_text || "").toLowerCase().includes(q) ||
        (`${r.first_name || ""} ${r.last_name || ""}`).toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const da = new Date(a.imported_at).getTime();
      const db = new Date(b.imported_at).getTime();
      return sortDir === 'latest' ? db - da : da - db;
    });
    return list;
  }, [rows, calledRows, filter, triageTab, campaignFilter, search, sortDir]);

  const openLead = async (r: Reply) => {
    setSelected(r);
    setNoteInput("");
    const { data } = await supabase.from("hot_reply_notes").select("*").eq("hot_reply_id", r.id).order("created_at", { ascending: false });
    setNoteList(data || []);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("hot_reply_imports").update({ call_status: status }).eq("id", id);
    setRows(prev => prev.map(r => r.id === id ? { ...r, call_status: status } : r));
    if (selected?.id === id) setSelected({ ...selected, call_status: status });
    toast.success("Status updated");
  };

  const removeFromHot = async (id: string) => {
    await supabase.from("hot_reply_imports").update({ is_hot: false }).eq("id", id);
    setRows(prev => prev.map(r => r.id === id ? { ...r, is_hot: false } : r));
    toast.success("Removed from Hot Replies");
  };

  const setTriage = async (id: string, bucket: 'interested' | 'not_interested' | 'maybe') => {
    const { error } = await supabase.from("hot_reply_imports").update({ triage_override: bucket } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, triage_override: bucket } : r));
    toast.success(`Moved to ${bucket.replace('_', ' ')}`);
  };

  const addNote = async () => {
    if (!selected || !noteInput.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: n } = await supabase.from("hot_reply_notes").insert({
      hot_reply_id: selected.id, note: noteInput.trim(), created_by: user?.id ?? null,
    }).select().single();
    if (n) setNoteList(prev => [n, ...prev]);
    setNoteInput("");
  };

  const fmtPhone = (p: string) => {
    const d = String(p || "").replace(/\D/g, "").replace(/^1/, "");
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
  };

  const callableList = useMemo(
    () => rows.filter(r => r.is_hot && !r.is_opt_out && r.call_status === "not_called"),
    [rows]
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Flame className="text-orange-500" /> Hot Replies</h1>
            <p className="text-sm text-muted-foreground">
              AI-classified replies from your campaigns. {lastSync && <>Last sync: {format(new Date(lastSync), "PPp")}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <WarmWelcomeBucketCounter />
            <Button onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync Now
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings /> Settings</Button>
          </div>
        </div>

        {/* Global VoidFix API cooldown — caps are 50 NEW contacts/day per API across ALL campaigns */}
        <GlobalApiCooldownPanel />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <StatCard icon={<Phone />} label="Total" value={stats.total} />
          <StatCard icon={<Flame className="text-red-500" />} label="Hot" value={stats.hot} accent />
          <StatCard icon={<DollarSign />} label="Pricing" value={stats.pricing} />
          <StatCard icon={<PhoneCall />} label="Callback" value={stats.callback} />
          <StatCard icon={<Ban className="text-red-700" />} label="Opt-Outs" value={stats.optOut} />
          <StatCard icon={<PhoneOff />} label="Not Called/Texted" value={stats.notCalled} />
          <StatCard icon={<Clock />} label="Today" value={stats.calledToday} />
        </div>

        {/* Warm Welcome Campaign — audits device, sends iMessage/SMS to current filtered contacts */}
        <WarmWelcomeCampaignPanel
          contacts={filtered.map(r => ({
            hot_reply_id: r.id,
            phone: r.phone,
            name: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
            reply_text: r.reply_text,
            reply_at: r.imported_at,
          }))}
        />

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hot">🔥 Hot Only ({stats.hot})</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="pricing">Pricing Questions</SelectItem>
                <SelectItem value="callback">Callback Requests</SelectItem>
                <SelectItem value="not_called">Not Called/Texted Yet</SelectItem>
                <SelectItem value="called">Already Called/Texted</SelectItem>
                <SelectItem value="triage">🧭 Triage (Called) — Interest Buckets</SelectItem>
                <SelectItem value="opt_outs">Opt-Outs (do not call)</SelectItem>
                <SelectItem value="all">All Replies</SelectItem>
              </SelectContent>
            </Select>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Campaign" /></SelectTrigger>
              <SelectContent>
                {campaigns.map(c => <SelectItem key={c} value={c}>{c === "all" ? "All Campaigns" : c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="w-64" placeholder="Search name, phone, or text…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="ml-auto text-sm text-muted-foreground">
              Callable list: <span className="font-semibold text-foreground">{callableList.length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Triage sub-tabs — only when "Triage" is selected, divides already-called/texted into interest buckets */}
        {filter === "triage" && (
          <Card>
            <CardContent className="p-3">
              <Tabs value={triageTab} onValueChange={(v) => setTriageTab(v as any)}>
                <TabsList className="grid w-full max-w-xl grid-cols-3">
                  <TabsTrigger value="interested" className="gap-2">
                    <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />
                    Interested
                    <Badge variant="outline" className="ml-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">{triageCounts.interested}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="maybe" className="gap-2">
                    <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                    Maybe
                    <Badge variant="outline" className="ml-1 bg-amber-500/10 text-amber-500 border-amber-500/30">{triageCounts.maybe}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="not_interested" className="gap-2">
                    <ThumbsDown className="h-3.5 w-3.5 text-zinc-500" />
                    Not Interested
                    <Badge variant="outline" className="ml-1 bg-zinc-500/10 text-zinc-500 border-zinc-500/30">{triageCounts.not_interested}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="mt-2 text-xs text-muted-foreground">
                {triageTab === 'interested' && 'Anyone remotely interested — positive replies, pricing questions, callback requests, and leads marked interested/follow-up/appointment/proposal/closed.'}
                {triageTab === 'maybe' && 'AI could not confidently classify these — review manually and re-bucket.'}
                {triageTab === 'not_interested' && 'Negative replies, opt-outs, wrong numbers, auto-replies, and leads marked not interested.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                No replies match your filter. {!sheetUrl && <Button variant="link" onClick={() => setSettingsOpen(true)}>Connect a Google Sheet</Button>}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Reply</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Conf</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => setSortDir(prev => prev === 'latest' ? 'earliest' : 'latest')}>
                      <span className="inline-flex items-center gap-1">When <ArrowUpDown className="h-3 w-3" /></span>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id} className={r.is_opt_out ? "bg-red-500/5" : ""}>
                      <TableCell>
                        <div className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                        <div className="text-xs text-muted-foreground">{fmtPhone(r.phone)}</div>
                      </TableCell>
                      <TableCell className="max-w-md"><div className="text-sm whitespace-pre-wrap break-words">{r.reply_text}</div></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={CLASS_COLORS[r.ai_classification || ""] || ""}>
                          {r.ai_classification || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.ai_confidence != null ? `${Math.round(r.ai_confidence * 100)}%` : "—"}</TableCell>
                      <TableCell className="text-xs">{r.campaign_name || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.original_date || format(new Date(r.imported_at), "MMM d")}
                        {r.original_time && <span className="text-muted-foreground"> {r.original_time}</span>}
                      </TableCell>
                      <TableCell className="text-xs">{CALL_STATUSES.find(s => s.value === r.call_status)?.label || r.call_status}</TableCell>
                      <TableCell className="text-right">
                        {r.is_opt_out ? (
                          <Badge variant="outline" className="bg-red-700/20 text-red-700 border-red-700/30"><Ban className="mr-1 h-3 w-3" /> DO NOT CALL</Badge>
                        ) : (
                          <div className="flex justify-end gap-1 flex-wrap">
                            <Button size="sm" variant="default" onClick={() => copyPhoneToClipboard(r.phone)}>
                              <Phone className="h-3 w-3" /> Call
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                              onClick={() => setSmsThread({ phone: r.phone, name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null, replyText: r.reply_text || null, replyAt: r.imported_at || null })}
                              title="View SMS thread"
                            >
                              <MessageSquare className="h-3 w-3" /> Text
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openLead(r)}>Open</Button>
                            {filter === "triage" && (
                              <Select value={triageBucket(r)} onValueChange={(v) => setTriage(r.id, v as any)}>
                                <SelectTrigger className="h-8 w-[130px] text-xs" title="Move to bucket"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="interested">👍 Interested</SelectItem>
                                  <SelectItem value="maybe">❓ Maybe</SelectItem>
                                  <SelectItem value="not_interested">👎 Not Interested</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Settings drawer */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Hot Replies Settings</SheetTitle>
            <SheetDescription>Connect a Google Sheet to auto-import replies. The sheet must be shared as "Anyone with the link can view".</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Google Sheet URL</Label>
              <Input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
            </div>
            <div>
              <Label>Sheet/Tab name</Label>
              <Input value={sheetName} onChange={e => setSheetName(e.target.value)} placeholder="Sheet1" />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded">
              Expected columns: Date, Time, First Name, Last Name, Phone Number, Reply Text, Campaign Name, Source, Status.
              Phone Number and Reply Text are required.
            </div>
            <div className="flex gap-2">
              <Button onClick={saveSettings} className="flex-1">Save</Button>
              <Button variant="outline" onClick={sync} disabled={syncing || !sheetUrl}>
                {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync Now
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Lead detail drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{[selected.first_name, selected.last_name].filter(Boolean).join(" ") || fmtPhone(selected.phone)}</SheetTitle>
                <SheetDescription>{fmtPhone(selected.phone)} • {selected.campaign_name || "No campaign"}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 mt-6">
                <div>
                  <Label className="text-xs text-muted-foreground">Reply</Label>
                  <div className="mt-1 p-3 bg-muted/30 rounded text-sm">{selected.reply_text}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={CLASS_COLORS[selected.ai_classification || ""] || ""}>
                    {selected.ai_classification || "—"}
                  </Badge>
                  {selected.ai_confidence != null && <span className="text-xs text-muted-foreground">{Math.round(selected.ai_confidence * 100)}% confidence</span>}
                </div>
                {selected.ai_reason && (
                  <div>
                    <Label className="text-xs text-muted-foreground">AI reason</Label>
                    <div className="mt-1 text-sm">{selected.ai_reason}</div>
                  </div>
                )}
                {selected.is_opt_out && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-600 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> This contact opted out. Do not call or message.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button disabled={selected.is_opt_out} onClick={() => copyPhoneToClipboard(selected.phone)}>
                    <Phone /> Call Now
                  </Button>
                  <Select value={selected.call_status} onValueChange={(v) => updateStatus(selected.id, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CALL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => updateStatus(selected.id, "follow_up")}>Move to Follow-Up</Button>
                  <Button variant="outline" onClick={() => updateStatus(selected.id, "not_interested")}>Mark Not Interested</Button>
                  <Button variant="outline" onClick={() => removeFromHot(selected.id)} className="col-span-2">Remove from Hot Replies</Button>
                </div>
                <div>
                  <Label>Add note</Label>
                  <Textarea value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="What happened on the call…" />
                  <Button size="sm" onClick={addNote} className="mt-2">Save note</Button>
                </div>
                <div className="space-y-2">
                  {noteList.map(n => (
                    <div key={n.id} className="text-sm p-2 bg-muted/30 rounded">
                      <div>{n.note}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(n.created_at), "PPp")}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* SMS thread popup */}
      {smsThread && (
        <SmsThreadPopup
          open={!!smsThread}
          onOpenChange={(o) => !o && setSmsThread(null)}
          phone={smsThread.phone}
          contactName={smsThread.name}
          seedReplyText={smsThread.replyText}
          seedReplyAt={smsThread.replyAt}
        />
      )}

      {/* Call provider picker — choose between RingCentral and Vapi (Twilio in-browser) */}
      <AlertDialog open={!!callPicker} onOpenChange={(o) => !o && setCallPicker(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Place call with…</AlertDialogTitle>
            <AlertDialogDescription>
              Choose which phone system to use to call{" "}
              <span className="font-mono text-foreground">{callPicker?.phone}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="h-auto flex-col gap-1 py-4"
              onClick={() => {
                if (!callPicker) return;
                if (callPicker.lead) openLead(callPicker.lead);
                dialViaRingCentral(callPicker.phone);
                setCallPicker(null);
              }}
            >
              <PhoneCall className="h-5 w-5" />
              <span className="font-semibold">RingCentral</span>
              <span className="text-[10px] text-muted-foreground">Opens RingCentral app</span>
            </Button>
            <Button
              className="h-auto flex-col gap-1 py-4"
              onClick={() => {
                if (!callPicker) return;
                if (callPicker.lead) openLead(callPicker.lead);
                dialViaTwilio(callPicker.phone, navigate);
                setCallPicker(null);
              }}
            >
              <Phone className="h-5 w-5" />
              <span className="font-semibold">Vapi Phone</span>
              <span className="text-[10px] opacity-80">In-browser dialer</span>
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <Card className={accent ? "border-red-500/30" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{icon} {label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
