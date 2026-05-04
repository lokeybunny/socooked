import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, PhoneCall, Send, Settings, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = {
  phone_number: string;
  phone_e164: string;
  phone_type: string | null;
  status: "new" | "duplicate" | "queued";
  pulled_at?: string;
};

const SETTINGS_KEY = "batchleads_settings_v1";

type Settings = {
  default_location: string;
  default_radius: number;
  max_pull_size: number;
  suppression_enabled: boolean;
};

const defaultSettings: Settings = {
  default_location: "Las Vegas, NV",
  default_radius: 25,
  max_pull_size: 50,
  suppression_enabled: true,
};

export default function BatchLeadsPuller() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return defaultSettings;
  });

  const [location, setLocation] = useState(settings.default_location);
  const [radius, setRadius] = useState(settings.default_radius);
  const [maxResults, setMaxResults] = useState(settings.default_pull_size ?? settings.max_pull_size);
  const [pulling, setPulling] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [pullsCount, setPullsCount] = useState(0);

  function saveSettings(next: Settings) {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    toast.success("Settings saved");
  }

  async function loadStats() {
    const [{ count: q }, { count: p }] = await Promise.all([
      supabase.from("outbound_call_queue").select("*", { count: "exact", head: true }),
      supabase.from("batchleads_phone_pulls").select("*", { count: "exact", head: true }),
    ]);
    setQueueCount(q || 0);
    setPullsCount(p || 0);
  }

  useEffect(() => { loadStats(); }, []);

  async function pull() {
    const cap = Math.min(50, settings.max_pull_size || 50);
    const requested = Math.min(maxResults, cap);
    if (!location.trim()) { toast.error("Enter a location"); return; }

    setPulling(true);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("batchleads-pull-phones", {
        body: { location: location.trim(), radius_miles: radius, max_results: requested },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Pull failed");

      const results: Row[] = (data?.results || []).map((r: Row) => ({ ...r, pulled_at: new Date().toISOString() }));
      setRows(results);
      // auto-select all "new" ones
      setSelected(new Set(results.filter((r) => r.status === "new").map((r) => r.phone_e164)));
      toast.success(`Pulled ${results.length} numbers — ${data?.new_count || 0} new, ${data?.duplicate_count || 0} duplicates`);
      await loadStats();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Pull failed: ${msg}`);
    } finally {
      setPulling(false);
    }
  }

  async function sendToQueue() {
    const toAdd = rows.filter((r) => selected.has(r.phone_e164) && r.status !== "queued");
    if (!toAdd.length) { toast.error("Nothing selected"); return; }
    setQueuing(true);
    try {
      const phones = toAdd.map((r) => r.phone_e164);

      // Suppression checks (optional)
      let suppressed = new Set<string>();
      if (settings.suppression_enabled) {
        const { data: existingQueue } = await supabase
          .from("outbound_call_queue")
          .select("phone_e164")
          .in("phone_e164", phones);
        for (const e of existingQueue || []) suppressed.add(e.phone_e164);
      }

      const fresh = phones.filter((p) => !suppressed.has(p));
      let added = 0;
      if (fresh.length) {
        const { error } = await supabase
          .from("outbound_call_queue")
          .insert(fresh.map((p) => ({
            phone_e164: p,
            source: "batchleads",
            campaign_status: "pending",
          })));
        if (error && !error.message.includes("duplicate")) throw error;
        added = fresh.length;
      }
      const skipped = phones.length - added;

      // mark rows as queued
      setRows((prev) => prev.map((r) => selected.has(r.phone_e164) ? { ...r, status: "queued" } : r));
      setSelected(new Set());
      toast.success(`${added} phone numbers added to call queue. ${skipped} duplicates skipped.`);
      await loadStats();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Queue failed: ${msg}`);
    } finally {
      setQueuing(false);
    }
  }

  function toggleAll() {
    const eligible = rows.filter((r) => r.status === "new").map((r) => r.phone_e164);
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible));
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">BatchLeads Phone Puller</h1>
          <p className="text-sm text-muted-foreground">Pull real estate lead phone numbers and push them to the call queue</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{pullsCount} total pulled</Badge>
          <Badge variant="outline">{queueCount} in queue</Badge>
          <Button variant="ghost" size="sm" onClick={loadStats}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings((v) => !v)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showSettings && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Settings</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Default Location</label>
              <input
                className="w-full px-3 py-2 text-sm rounded-md border bg-background mt-1"
                value={settings.default_location}
                onChange={(e) => setSettings({ ...settings, default_location: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Default Radius (miles)</label>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm rounded-md border bg-background mt-1"
                value={settings.default_radius}
                onChange={(e) => setSettings({ ...settings, default_radius: Math.max(1, Math.min(100, Number(e.target.value) || 25)) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max Pull Size (cap 50)</label>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm rounded-md border bg-background mt-1"
                value={settings.max_pull_size}
                onChange={(e) => setSettings({ ...settings, max_pull_size: Math.max(1, Math.min(50, Number(e.target.value) || 50)) })}
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Checkbox
                id="suppression"
                checked={settings.suppression_enabled}
                onCheckedChange={(v) => setSettings({ ...settings, suppression_enabled: !!v })}
              />
              <label htmlFor="suppression" className="text-sm">Enable suppression (skip already-queued numbers)</label>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSettings(defaultSettings)}>Reset</Button>
              <Button size="sm" onClick={() => saveSettings(settings)}>Save Settings</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="w-5 h-5 text-primary" />
            Pull Phone Numbers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Location (city, state, or zip)</label>
              <input
                className="w-full px-3 py-2 text-sm rounded-md border bg-background mt-1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Las Vegas, NV"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Radius (miles)</label>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm rounded-md border bg-background mt-1"
                value={radius}
                onChange={(e) => setRadius(Math.max(1, Math.min(100, Number(e.target.value) || 25)))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max Results (cap 50)</label>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm rounded-md border bg-background mt-1"
                value={maxResults}
                onChange={(e) => setMaxResults(Math.max(1, Math.min(50, Number(e.target.value) || 50)))}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={pull} disabled={pulling}>
              {pulling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PhoneCall className="w-4 h-4 mr-2" />}
              Pull Phone Numbers
            </Button>
            <Button onClick={sendToQueue} disabled={queuing || selected.size === 0} variant="secondary">
              {queuing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send to Call Queue ({selected.size})
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Results ({rows.length})</span>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selected.size > 0 ? "Clear" : "Select All New"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 w-10"></th>
                    <th className="text-left p-3">Phone</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Source</th>
                    <th className="text-left p-3">Pulled At</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.phone_e164} className="border-t border-border">
                      <td className="p-3">
                        <Checkbox
                          checked={selected.has(r.phone_e164)}
                          disabled={r.status === "queued" || r.status === "duplicate"}
                          onCheckedChange={(v) => {
                            const next = new Set(selected);
                            if (v) next.add(r.phone_e164); else next.delete(r.phone_e164);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="p-3 font-mono">{r.phone_e164}</td>
                      <td className="p-3">{r.phone_type || "—"}</td>
                      <td className="p-3 text-muted-foreground">BatchLeads</td>
                      <td className="p-3 text-muted-foreground">{r.pulled_at ? new Date(r.pulled_at).toLocaleString() : "—"}</td>
                      <td className="p-3">
                        <Badge variant={
                          r.status === "new" ? "default" :
                          r.status === "queued" ? "secondary" : "outline"
                        }>{r.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
