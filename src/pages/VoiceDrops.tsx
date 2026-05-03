import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Upload, Settings as SettingsIcon, Eye, Pause, Download, Phone, MessageSquare } from "lucide-react";

type Campaign = {
  id: string;
  campaign_name: string;
  leadsrain_campaign_id: string | null;
  leadsrain_list_id: string | null;
  campaign_cid: string | null;
  business_line_1: string | null;
  twilio_number: string | null;
  status: string;
  total_leads: number;
  drops_sent: number;
  estimated_delivered: number;
  callbacks_count: number;
  missed_calls_count: number;
  answered_calls_count: number;
  sms_replies_sent_count: number;
  conversion_rate: number;
  created_at: string;
  last_synced_at: string | null;
  sound_file_url: string | null;
  notes: string | null;
};

type Settings = {
  user_id?: string;
  business_line_1: string | null;
  twilio_forward_number: string | null;
  verizon_forward_number: string | null;
  default_campaign_cid: string | null;
  default_missed_call_sms: string;
  voidfix_enabled: boolean;
  attribution_window_hours: number;
};

const DEFAULT_SMS = "Currently in a meeting, talk with you soon. In the meanwhile, check my work out on IG: https://instagram.com/w4rr3nGURU";

export default function VoiceDrops() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("campaigns");
  const [newOpen, setNewOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({
    business_line_1: "", twilio_forward_number: "", verizon_forward_number: "",
    default_campaign_cid: "", default_missed_call_sms: DEFAULT_SMS,
    voidfix_enabled: true, attribution_window_hours: 72,
  });

  const loadAll = async () => {
    setLoading(true);
    const { data: cs } = await supabase
      .from("voice_drop_campaigns" as any)
      .select("*").order("created_at", { ascending: false });
    setCampaigns((cs as any) || []);
    if (user) {
      const { data: s } = await supabase
        .from("voice_drop_settings" as any).select("*").eq("user_id", user.id).maybeSingle();
      if (s) setSettings(s as any);
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [user?.id]);

  const totals = useMemo(() => {
    const t = (k: keyof Campaign) => campaigns.reduce((a, c) => a + (Number(c[k] as any) || 0), 0);
    const drops = t("drops_sent");
    const cbs = t("callbacks_count");
    return {
      campaigns: campaigns.length,
      active: campaigns.filter(c => c.status === "active").length,
      leads: t("total_leads"),
      drops,
      delivered: t("estimated_delivered"),
      callbacks: cbs,
      missed: t("missed_calls_count"),
      answered: t("answered_calls_count"),
      sms: t("sms_replies_sent_count"),
      conv: drops > 0 ? `${((cbs / drops) * 100).toFixed(1)}%` : "0%",
    };
  }, [campaigns]);

  const syncAll = async () => {
    toast.loading("Syncing campaigns...", { id: "sync" });
    for (const c of campaigns) {
      await supabase.functions.invoke("leadsrain-sync-campaign", { body: { campaign_id: c.id } });
    }
    toast.success("Sync complete", { id: "sync" });
    loadAll();
  };

  const syncOne = async (id: string) => {
    toast.loading("Syncing...", { id });
    const { error } = await supabase.functions.invoke("leadsrain-sync-campaign", { body: { campaign_id: id } });
    if (error) toast.error(error.message, { id });
    else toast.success("Synced", { id });
    loadAll();
  };

  const archive = async (id: string) => {
    await supabase.from("voice_drop_campaigns" as any).update({ status: "archived" }).eq("id", id);
    loadAll();
  };

  const exportReport = (c: Campaign) => {
    const rows = [
      ["Campaign", c.campaign_name],
      ["LeadsRain ID", c.leadsrain_campaign_id || ""],
      ["Caller ID", c.campaign_cid || ""],
      ["Status", c.status],
      ["Leads", c.total_leads],
      ["Drops", c.drops_sent],
      ["Estimated Delivered", c.estimated_delivered],
      ["Callbacks", c.callbacks_count],
      ["Missed", c.missed_calls_count],
      ["Answered", c.answered_calls_count],
      ["SMS Replies", c.sms_replies_sent_count],
      ["Conversion", `${(c.conversion_rate * 100).toFixed(1)}%`],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${c.campaign_name}-report.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const saveSettings = async () => {
    if (!user) return;
    const { error } = await supabase.from("voice_drop_settings" as any).upsert({ ...settings, user_id: user.id });
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  };

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Voice Drops</h1>
          <p className="text-muted-foreground max-w-2xl mt-1">
            Launch and track LeadsRain ringless voicemail campaigns. Caller ID routes through Business Line 1,
            callbacks are logged through Twilio, and missed-call SMS replies are sent through VoidFix.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4" /> New Campaign</Button>
          <Button variant="outline" onClick={syncAll}><RefreshCw className="w-4 h-4" /> Sync LeadsRain Data</Button>
          <Button variant="outline" onClick={() => setUploadOpen(true)}><Upload className="w-4 h-4" /> Upload Leads</Button>
          <Button variant="outline" onClick={() => setTab("settings")}><SettingsIcon className="w-4 h-4" /> Settings</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Campaigns" value={totals.campaigns} />
        <Stat label="Active" value={totals.active} />
        <Stat label="Leads Uploaded" value={totals.leads} />
        <Stat label="Drops Sent" value={totals.drops} />
        <Stat label="Est. Delivered" value={totals.delivered} />
        <Stat label="Callbacks" value={totals.callbacks} />
        <Stat label="Missed Calls" value={totals.missed} />
        <Stat label="Answered" value={totals.answered} />
        <Stat label="SMS Replies" value={totals.sms} />
        <Stat label="Conversion" value={totals.conv} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
              ) : campaigns.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No campaigns yet. Create your first one.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>LR ID</TableHead>
                      <TableHead>Caller ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Drops</TableHead>
                      <TableHead>Est. Delivered</TableHead>
                      <TableHead>Callbacks</TableHead>
                      <TableHead>Missed</TableHead>
                      <TableHead>Answered</TableHead>
                      <TableHead>SMS</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Sync</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.campaign_name}</TableCell>
                        <TableCell className="text-xs">{c.leadsrain_campaign_id || "—"}</TableCell>
                        <TableCell>{c.campaign_cid || "—"}</TableCell>
                        <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                        <TableCell>{c.total_leads}</TableCell>
                        <TableCell>{c.drops_sent}</TableCell>
                        <TableCell>{c.estimated_delivered}</TableCell>
                        <TableCell>{c.callbacks_count}</TableCell>
                        <TableCell>{c.missed_calls_count}</TableCell>
                        <TableCell>{c.answered_calls_count}</TableCell>
                        <TableCell>{c.sms_replies_sent_count}</TableCell>
                        <TableCell className="text-xs">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs">{c.last_synced_at ? new Date(c.last_synced_at).toLocaleString() : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => setDetailId(c.id)}><Eye className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => syncOne(c.id)}><RefreshCw className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => archive(c.id)}><Pause className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => exportReport(c)}><Download className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader><CardTitle>Voice Drops Settings</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <Field label="Business Line 1 (caller ID)" v={settings.business_line_1 || ""} onChange={v => setSettings(s => ({ ...s, business_line_1: v }))} />
              <Field label="Twilio Forward Number" v={settings.twilio_forward_number || ""} onChange={v => setSettings(s => ({ ...s, twilio_forward_number: v }))} />
              <Field label="Verizon Final Forward Number" v={settings.verizon_forward_number || ""} onChange={v => setSettings(s => ({ ...s, verizon_forward_number: v }))} />
              <Field label="Default campaign_cid" v={settings.default_campaign_cid || ""} onChange={v => setSettings(s => ({ ...s, default_campaign_cid: v }))} />
              <div className="md:col-span-2">
                <Label>Default Missed-Call SMS</Label>
                <textarea className="w-full mt-1 p-2 border rounded-md bg-background min-h-[80px]" value={settings.default_missed_call_sms} onChange={e => setSettings(s => ({ ...s, default_missed_call_sms: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="vfx" checked={settings.voidfix_enabled} onChange={e => setSettings(s => ({ ...s, voidfix_enabled: e.target.checked }))} />
                <Label htmlFor="vfx">Enable VoidFix missed-call auto-reply</Label>
              </div>
              <Field label="Attribution window (hours)" type="number" v={String(settings.attribution_window_hours)} onChange={v => setSettings(s => ({ ...s, attribution_window_hours: Number(v) || 72 }))} />
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={saveSettings}>Save Settings</Button>
                <Button variant="outline" onClick={async () => {
                  const { data, error } = await supabase.functions.invoke("leadsrain-test-connection", { body: {} });
                  if (error) toast.error(error.message); else toast.success(data?.message || "OK");
                }}>Test LeadsRain</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NewCampaignDialog open={newOpen} onOpenChange={setNewOpen} settings={settings} onCreated={loadAll} />
      <UploadLeadsDialog open={uploadOpen} onOpenChange={setUploadOpen} campaigns={campaigns} onUploaded={loadAll} />
      <CampaignDetailDialog campaignId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </CardContent></Card>
  );
}

function Field({ label, v, onChange, type = "text" }: { label: string; v: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={v} onChange={e => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}

function NewCampaignDialog({ open, onOpenChange, settings, onCreated }: { open: boolean; onOpenChange: (b: boolean) => void; settings: Settings; onCreated: () => void }) {
  const [form, setForm] = useState({
    campaign_name: "", campaign_cid: "", sound_file_url: "",
    business_line_1: "", twilio_number: "", verizon_forward_number: "",
    call_time_id: "1", notes: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        campaign_cid: f.campaign_cid || settings.default_campaign_cid || "",
        business_line_1: f.business_line_1 || settings.business_line_1 || "",
        twilio_number: f.twilio_number || settings.twilio_forward_number || "",
        verizon_forward_number: f.verizon_forward_number || settings.verizon_forward_number || "",
      }));
    }
  }, [open]);

  const submit = async () => {
    if (!form.campaign_name || !form.campaign_cid) { toast.error("Name and Caller ID required"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("leadsrain-create-campaign", { body: form });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Campaign created");
    onOpenChange(false);
    setForm({ campaign_name: "", campaign_cid: "", sound_file_url: "", business_line_1: "", twilio_number: "", verizon_forward_number: "", call_time_id: "1", notes: "" });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Voice Drop Campaign</DialogTitle></DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Campaign Name" v={form.campaign_name} onChange={v => setForm(f => ({ ...f, campaign_name: v }))} />
          <Field label="Business Line 1 / Caller ID (campaign_cid)" v={form.campaign_cid} onChange={v => setForm(f => ({ ...f, campaign_cid: v }))} />
          <Field label="Business Line 1 Number" v={form.business_line_1} onChange={v => setForm(f => ({ ...f, business_line_1: v }))} />
          <Field label="Twilio Forward Number" v={form.twilio_number} onChange={v => setForm(f => ({ ...f, twilio_number: v }))} />
          <Field label="Verizon Forward Number" v={form.verizon_forward_number} onChange={v => setForm(f => ({ ...f, verizon_forward_number: v }))} />
          <Field label="Call Time ID" v={form.call_time_id} onChange={v => setForm(f => ({ ...f, call_time_id: v }))} />
          <div className="md:col-span-2">
            <Field label="Sound File URL" v={form.sound_file_url} onChange={v => setForm(f => ({ ...f, sound_file_url: v }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <textarea className="w-full mt-1 p-2 border rounded-md bg-background" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadLeadsDialog({ open, onOpenChange, campaigns, onUploaded }: { open: boolean; onOpenChange: (b: boolean) => void; campaigns: Campaign[]; onUploaded: () => void }) {
  const [campaignId, setCampaignId] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);

  const parseCsv = (txt: string) => {
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const cells = line.split(",");
      const obj: any = {};
      headers.forEach((h, i) => obj[h] = (cells[i] || "").trim());
      return obj;
    });
  };

  const submit = async () => {
    if (!campaignId) { toast.error("Pick a campaign"); return; }
    const leads = parseCsv(csv);
    if (leads.length === 0) { toast.error("No leads in CSV"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("leadsrain-bulk-upload-leads", { body: { campaign_id: campaignId, leads } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const ok = (data?.results || []).filter((r: any) => r.ok).length;
    toast.success(`Uploaded ${ok}/${leads.length} leads`);
    onOpenChange(false); setCsv(""); onUploaded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Upload Leads (CSV)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Campaign</Label>
            <select className="w-full mt-1 p-2 border rounded-md bg-background" value={campaignId} onChange={e => setCampaignId(e.target.value)}>
              <option value="">— Select —</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
            </select>
          </div>
          <div>
            <Label>CSV (header row required: phone_number, first_name, last_name, email, address, city, state, zip)</Label>
            <textarea className="w-full mt-1 p-2 border rounded-md bg-background min-h-[180px] font-mono text-xs" value={csv} onChange={e => setCsv(e.target.value)} placeholder="phone_number,first_name,last_name,email&#10;7025550100,John,Doe,john@x.com" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Upload</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDetailDialog({ campaignId, onClose }: { campaignId: string | null; onClose: () => void }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!campaignId) return;
    (async () => {
      const { data: c } = await supabase.from("voice_drop_campaigns" as any).select("*").eq("id", campaignId).single();
      const { data: ev } = await supabase.from("voice_drop_events" as any).select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(200);
      const { data: ld } = await supabase.from("voice_drop_leads" as any).select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(200);
      setCampaign(c as any); setEvents((ev as any) || []); setLeads((ld as any) || []);
    })();
  }, [campaignId]);

  const filterEv = (t: string) => events.filter(e => e.event_type === t);

  return (
    <Dialog open={!!campaignId} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{campaign?.campaign_name || "Campaign"}</DialogTitle></DialogHeader>
        {!campaign ? <Loader2 className="w-6 h-6 animate-spin" /> : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger>
              <TabsTrigger value="callbacks">Callbacks ({filterEv("callback_received").length})</TabsTrigger>
              <TabsTrigger value="missed">Missed ({filterEv("missed_call").length})</TabsTrigger>
              <TabsTrigger value="answered">Answered ({filterEv("answered_call").length})</TabsTrigger>
              <TabsTrigger value="sms">SMS ({filterEv("sms_auto_reply_sent").length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <Stat label="Drops" value={campaign.drops_sent} />
                <Stat label="Est. Delivered" value={campaign.estimated_delivered} />
                <Stat label="Callbacks" value={campaign.callbacks_count} />
                <Stat label="Missed" value={campaign.missed_calls_count} />
                <Stat label="Answered" value={campaign.answered_calls_count} />
                <Stat label="SMS Replies" value={campaign.sms_replies_sent_count} />
                <Stat label="Conversion" value={`${(campaign.conversion_rate * 100).toFixed(1)}%`} />
                <Stat label="Leads" value={campaign.total_leads} />
              </div>
            </TabsContent>

            <TabsContent value="leads">
              <SimpleTable rows={leads} cols={["phone_number","first_name","last_name","leadsrain_upload_status","error_message","created_at"]} />
            </TabsContent>

            {["callback_received","missed_call","answered_call","sms_auto_reply_sent"].map((t, i) => {
              const tabName = ["callbacks","missed","answered","sms"][i];
              const rows = filterEv(t);
              return (
                <TabsContent key={t} value={tabName}>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Phone</TableHead><TableHead>Time</TableHead><TableHead>Source</TableHead><TableHead>Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {rows.map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{r.phone_number}</TableCell>
                          <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{r.event_source}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => window.open(`tel:+1${r.phone_number}`)}><Phone className="w-4 h-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => window.open(`sms:+1${r.phone_number}`)}><MessageSquare className="w-4 h-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No events</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SimpleTable({ rows, cols }: { rows: any[]; cols: string[] }) {
  return (
    <Table>
      <TableHeader><TableRow>{cols.map(c => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={r.id || i}>
            {cols.map(c => <TableCell key={c} className="text-xs">{c === "created_at" ? new Date(r[c]).toLocaleString() : (r[c] ?? "")}</TableCell>)}
          </TableRow>
        ))}
        {rows.length === 0 && <TableRow><TableCell colSpan={cols.length} className="text-center text-muted-foreground">None</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}
