import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw, Plus, Power, X, Building2, Users, Phone, ListChecks } from "lucide-react";

type Stat = { agents: number; mobiles: number; today: number; listings: number; running: number };

export default function AgentFlow() {
  const [stats, setStats] = useState<Stat>({ agents: 0, mobiles: 0, today: 0, listings: 0, running: 0 });
  const [listings, setListings] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [validated, setValidated] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLoc, setNewLoc] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [running, setRunning] = useState(false);

  const csvUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agentflow-generate-csv`;

  const refresh = async () => {
    setLoading(true);
    const today = new Date(); today.setHours(0,0,0,0);
    const [a, m, t, l, j, ll, vl, locs, ag] = await Promise.all([
      supabase.from("af_agents").select("*", { count: "exact", head: true }),
      supabase.from("af_agent_contacts").select("*", { count: "exact", head: true }).eq("is_valid", true).eq("phone_type", "mobile"),
      supabase.from("af_agent_contacts").select("*", { count: "exact", head: true }).eq("is_valid", true).eq("phone_type", "mobile").gte("validated_at", today.toISOString()),
      supabase.from("af_listings").select("*", { count: "exact", head: true }),
      supabase.from("af_scrape_jobs").select("*", { count: "exact", head: true }).eq("status", "running"),
      supabase.from("af_listings").select("*").order("scraped_at", { ascending: false }).limit(100),
      supabase.from("af_agent_contacts").select("phone, validated_at, af_agents(name, brokerage, city)").eq("is_valid", true).eq("phone_type", "mobile").order("validated_at", { ascending: false }).limit(200),
      supabase.from("target_locations").select("*").order("priority", { ascending: false }),
      supabase.from("af_agents").select("*, af_agent_contacts(phone, is_valid, phone_type)").order("created_at", { ascending: false }).limit(200),
    ]);
    setStats({
      agents: a.count || 0, mobiles: m.count || 0, today: t.count || 0,
      listings: l.count || 0, running: j.count || 0,
    });
    setListings(ll.data || []);
    setValidated(vl.data || []);
    setLocations(locs.data || []);
    setAgents(ag.data || []);
    const { data: jobsData } = await supabase.from("af_scrape_jobs").select("*").order("started_at", { ascending: false }).limit(50);
    setJobs(jobsData || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const r = await fetch(csvUrl);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `agentflow-mobiles-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (e: any) { toast.error(e?.message || "Download failed"); }
    setDownloading(false);
  };

  const runNow = async () => {
    setRunning(true);
    const { error } = await supabase.functions.invoke("agentflow-cron-tick");
    if (error) toast.error(error.message); else toast.success("Scrape cycle triggered");
    setRunning(false);
    setTimeout(refresh, 1500);
  };

  const addLocation = async () => {
    const v = newLoc.trim(); if (!v) return;
    const { error } = await supabase.from("target_locations").insert({ location: v, priority: 5 });
    if (error) toast.error(error.message); else { setNewLoc(""); toast.success("Added"); refresh(); }
  };
  const toggleLoc = async (id: string, is_active: boolean) => {
    await supabase.from("target_locations").update({ is_active: !is_active }).eq("id", id);
    refresh();
  };
  const removeLoc = async (id: string) => {
    await supabase.from("target_locations").delete().eq("id", id); refresh();
  };

  const progress = useMemo(() => Math.min(100, (stats.today / 3000) * 100), [stats.today]);

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">AgentFlow Engine</h1>
          <p className="text-muted-foreground mt-1">Autonomous Zillow agent lead generation. Runs 24/7. Target: ≥3,000 validated mobiles/day.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
          <Button variant="secondary" onClick={runNow} disabled={running}>{running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Power className="w-4 h-4 mr-2" />}Run Now</Button>
        </div>
      </div>

      {/* Hero CSV download */}
      <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-blue-500/5 to-transparent">
        <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-sm uppercase tracking-wider text-emerald-400 font-semibold">Today's Export</div>
            <div className="text-3xl font-bold mt-1">{stats.today.toLocaleString()} validated mobiles today</div>
            <div className="text-sm text-muted-foreground mt-1">{stats.mobiles.toLocaleString()} total in database • Goal 3,000/day</div>
            <div className="w-full bg-muted h-2 rounded-full mt-3 overflow-hidden max-w-md">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <Button size="lg" onClick={downloadCsv} disabled={downloading} className="h-16 px-8 text-lg bg-gradient-to-r from-emerald-500 to-blue-500 hover:opacity-90">
            {downloading ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <Download className="w-6 h-6 mr-2" />}
            Download Today's CSV
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<Users className="w-4 h-4" />} label="Total Agents" value={stats.agents} />
        <StatCard icon={<Phone className="w-4 h-4" />} label="Valid Mobiles" value={stats.mobiles} />
        <StatCard icon={<Phone className="w-4 h-4" />} label="Today" value={stats.today} highlight />
        <StatCard icon={<Building2 className="w-4 h-4" />} label="Listings" value={stats.listings} />
        <StatCard icon={<ListChecks className="w-4 h-4" />} label="Running Jobs" value={stats.running} />
      </div>

      <Tabs defaultValue="listings">
        <TabsList>
          <TabsTrigger value="listings">Live Listings</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="validated">Validated Leads</TabsTrigger>
          <TabsTrigger value="jobs">Scrape Jobs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="listings">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table><TableHeader><TableRow>
              <TableHead>Address</TableHead><TableHead>City</TableHead><TableHead>State</TableHead>
              <TableHead>Zip</TableHead><TableHead>Price</TableHead><TableHead>Scraped</TableHead>
            </TableRow></TableHeader><TableBody>
              {listings.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium"><a href={l.listing_url} target="_blank" rel="noreferrer" className="hover:underline">{l.address}</a></TableCell>
                  <TableCell>{l.city}</TableCell><TableCell>{l.state}</TableCell><TableCell>{l.zip}</TableCell>
                  <TableCell>{l.price ? `$${Number(l.price).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-xs">{new Date(l.scraped_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="agents">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table><TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Brokerage</TableHead><TableHead>City</TableHead>
              <TableHead>Phones</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader><TableBody>
              {agents.map((a: any) => {
                const ct = a.af_agent_contacts || [];
                const validMobile = ct.find((c: any) => c.is_valid && c.phone_type === "mobile");
                return (<TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.brokerage || "—"}</TableCell><TableCell>{a.city || "—"}</TableCell>
                  <TableCell>{ct.length}</TableCell>
                  <TableCell>{validMobile ? <Badge className="bg-emerald-500/20 text-emerald-300">Mobile ✓</Badge> : <Badge variant="secondary">Pending</Badge>}</TableCell>
                </TableRow>);
              })}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="validated">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table><TableHeader><TableRow>
              <TableHead>Agent</TableHead><TableHead>Brokerage</TableHead><TableHead>City</TableHead>
              <TableHead>Phone</TableHead><TableHead>Validated</TableHead>
            </TableRow></TableHeader><TableBody>
              {validated.map((v: any, i: number) => (
                <TableRow key={i}>
                  <TableCell>{v.af_agents?.name}</TableCell>
                  <TableCell>{v.af_agents?.brokerage}</TableCell>
                  <TableCell>{v.af_agents?.city}</TableCell>
                  <TableCell className="font-mono">{v.phone}</TableCell>
                  <TableCell className="text-xs">{v.validated_at && new Date(v.validated_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table><TableHeader><TableRow>
              <TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Pages</TableHead>
              <TableHead>New Listings</TableHead><TableHead>New Agents</TableHead><TableHead>Started</TableHead><TableHead>Error</TableHead>
            </TableRow></TableHeader><TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>{j.target_location}</TableCell>
                  <TableCell><Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge></TableCell>
                  <TableCell>{j.pages_scraped}</TableCell><TableCell>{j.new_listings}</TableCell><TableCell>{j.new_agents}</TableCell>
                  <TableCell className="text-xs">{new Date(j.started_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-destructive truncate max-w-xs">{j.error_log}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card><CardHeader><CardTitle>Target Locations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="e.g. Las Vegas, NV or 90210" value={newLoc} onChange={e => setNewLoc(e.target.value)} onKeyDown={e => e.key === "Enter" && addLocation()} />
              <Button onClick={addLocation}><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {locations.map((l) => (
                <Badge key={l.id} variant={l.is_active ? "default" : "secondary"} className="gap-2 cursor-pointer" onClick={() => toggleLoc(l.id, l.is_active)}>
                  {l.location}
                  <button onClick={(e) => { e.stopPropagation(); removeLoc(l.id); }}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Click a location to toggle active. ZenRows + Twilio Lookup keys are configured server-side.</p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-emerald-500/40 bg-emerald-500/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}
