import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, Eye, Clock, TrendingDown, Globe, Smartphone, Monitor, Tablet, Activity, RefreshCw, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Range = "24h" | "7d" | "30d";

const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function fmtDuration(s: number) {
  if (!s) return "0s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export default function Analytics() {
  const [range, setRange] = useState<Range>("24h");
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [pageviews, setPageviews] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [liveActivity, setLiveActivity] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - RANGE_HOURS[range] * 3600 * 1000).toISOString();
    const [s, p, e] = await Promise.all([
      supabase.from("analytics_sessions").select("*").gte("started_at", since).order("started_at", { ascending: false }).limit(2000),
      supabase.from("analytics_pageviews").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      supabase.from("analytics_events").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    ]);
    setSessions(s.data || []);
    setPageviews(p.data || []);
    setEvents(e.data || []);
    // Live: active in last 2 min
    const liveSince = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: live } = await supabase.from("analytics_sessions").select("*").gte("last_seen_at", liveSince).order("last_seen_at", { ascending: false });
    setLiveCount(live?.length || 0);
    const { data: recent } = await supabase.from("analytics_pageviews").select("*").order("created_at", { ascending: false }).limit(20);
    setLiveActivity(recent || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [range]);

  // Realtime subscription for new pageviews
  useEffect(() => {
    const ch = supabase
      .channel("analytics-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "analytics_pageviews" }, (payload) => {
        setLiveActivity((prev) => [payload.new, ...prev].slice(0, 20));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stats = useMemo(() => {
    const uniqueVisitors = new Set(sessions.map((s) => s.visitor_id)).size;
    const totalSessions = sessions.length;
    const totalPV = pageviews.length;
    const bounces = sessions.filter((s) => s.is_bounce).length;
    const bounceRate = totalSessions ? Math.round((bounces / totalSessions) * 100) : 0;
    const avgDur = totalSessions ? Math.round(sessions.reduce((a, s) => a + (s.duration_seconds || 0), 0) / totalSessions) : 0;
    return { uniqueVisitors, totalSessions, totalPV, bounceRate, avgDur, totalEvents: events.length };
  }, [sessions, pageviews, events]);

  const timeSeries = useMemo(() => {
    const buckets = new Map<string, { time: string; visitors: number; pageviews: number }>();
    const bucketSize = range === "24h" ? 3600 * 1000 : 24 * 3600 * 1000;
    sessions.forEach((s) => {
      const t = new Date(Math.floor(new Date(s.started_at).getTime() / bucketSize) * bucketSize);
      const key = t.toISOString();
      const label = range === "24h" ? t.toLocaleTimeString([], { hour: "2-digit" }) : t.toLocaleDateString([], { month: "short", day: "numeric" });
      const cur = buckets.get(key) || { time: label, visitors: 0, pageviews: 0 };
      cur.visitors += 1;
      buckets.set(key, cur);
    });
    pageviews.forEach((p) => {
      const t = new Date(Math.floor(new Date(p.created_at).getTime() / bucketSize) * bucketSize);
      const key = t.toISOString();
      const label = range === "24h" ? t.toLocaleTimeString([], { hour: "2-digit" }) : t.toLocaleDateString([], { month: "short", day: "numeric" });
      const cur = buckets.get(key) || { time: label, visitors: 0, pageviews: 0 };
      cur.pageviews += 1;
      buckets.set(key, cur);
    });
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [sessions, pageviews, range]);

  const topPages = useMemo(() => {
    const counts = new Map<string, number>();
    pageviews.forEach((p) => counts.set(p.path, (counts.get(p.path) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, views]) => ({ path, views }));
  }, [pageviews]);

  const topReferrers = useMemo(() => {
    const counts = new Map<string, number>();
    sessions.forEach((s) => {
      const r = s.referrer_domain || "(direct)";
      counts.set(r, (counts.get(r) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([source, count]) => ({ source, count }));
  }, [sessions]);

  const deviceData = useMemo(() => {
    const counts = { mobile: 0, desktop: 0, tablet: 0 };
    sessions.forEach((s) => {
      const d = (s.device_type as keyof typeof counts) || "desktop";
      if (d in counts) counts[d]++;
    });
    return [
      { name: "Mobile", value: counts.mobile },
      { name: "Desktop", value: counts.desktop },
      { name: "Tablet", value: counts.tablet },
    ].filter((d) => d.value > 0);
  }, [sessions]);

  const geoData = useMemo(() => {
    const counts = new Map<string, number>();
    sessions.forEach((s) => {
      const c = s.country || "Unknown";
      counts.set(c, (counts.get(c) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([country, count]) => ({ country, count }));
  }, [sessions]);

  async function sendDiscordNow() {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("analytics-discord-report");
      if (error) throw error;
      toast.success("Report sent to Discord");
    } catch (e: any) {
      toast.error("Failed: " + (e?.message || String(e)));
    } finally {
      setSending(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time visitor behavior across all public landing pages.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold">{liveCount} live now</span>
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={sendDiscordNow} disabled={sending}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send Report
            </Button>
          </div>
        </div>

        {/* Range tabs */}
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="24h">Last 24h</TabsTrigger>
            <TabsTrigger value="7d">Last 7 days</TabsTrigger>
            <TabsTrigger value="30d">Last 30 days</TabsTrigger>
          </TabsList>

          <TabsContent value={range} className="space-y-6 mt-6">
            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard icon={Users} label="Visitors" value={stats.uniqueVisitors} color="text-blue-500" />
              <MetricCard icon={Activity} label="Sessions" value={stats.totalSessions} color="text-emerald-500" />
              <MetricCard icon={Eye} label="Pageviews" value={stats.totalPV} color="text-violet-500" />
              <MetricCard icon={Clock} label="Avg. Duration" value={fmtDuration(stats.avgDur)} color="text-amber-500" />
              <MetricCard icon={TrendingDown} label="Bounce Rate" value={`${stats.bounceRate}%`} color="text-rose-500" />
              <MetricCard icon={Activity} label="Events" value={stats.totalEvents} color="text-cyan-500" />
            </div>

            {/* Traffic chart */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Traffic over time</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                    <Legend />
                    <Line type="monotone" dataKey="visitors" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Visitors" />
                    <Line type="monotone" dataKey="pageviews" stroke="#10b981" strokeWidth={2} dot={false} name="Pageviews" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top pages */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Top pages</h3>
                {topPages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pageviews yet.</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topPages} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis type="category" dataKey="path" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={120} />
                        <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                        <Bar dataKey="views" fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Devices */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Devices</h3>
                {deviceData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No device data yet.</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={deviceData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={(e) => `${e.name}: ${e.value}`}>
                          {deviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Top referrers */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Top sources</h3>
                {topReferrers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No traffic sources yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topReferrers.map((r) => (
                      <div key={r.source} className="flex justify-between items-center py-1.5 border-b border-border/50">
                        <span className="text-sm">{r.source}</span>
                        <Badge variant="secondary">{r.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Geo */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Globe className="h-4 w-4" /> Top countries</h3>
                {geoData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No geo data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {geoData.map((g) => (
                      <div key={g.country} className="flex justify-between items-center py-1.5 border-b border-border/50">
                        <span className="text-sm">{g.country}</span>
                        <Badge variant="secondary">{g.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Live activity feed */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-emerald-500" />
                Live activity feed
              </h3>
              {liveActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-auto">
                  {liveActivity.map((a, i) => (
                    <div key={a.id || i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40">
                      <div className="flex items-center gap-2 min-w-0">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono text-xs truncate">{a.path}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Recent sessions */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Recent sessions</h3>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="py-2">Started</th>
                        <th>Landing</th>
                        <th>Exit</th>
                        <th>Location</th>
                        <th>Device</th>
                        <th>Pages</th>
                        <th>Duration</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.slice(0, 50).map((s) => (
                        <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30">
                          <td className="py-2 text-xs whitespace-nowrap">{formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}</td>
                          <td className="font-mono text-xs">{s.landing_path}</td>
                          <td className="font-mono text-xs">{s.exit_path || "—"}</td>
                          <td className="text-xs">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</td>
                          <td className="text-xs">
                            {s.device_type === "mobile" ? <Smartphone className="h-3.5 w-3.5 inline" /> :
                              s.device_type === "tablet" ? <Tablet className="h-3.5 w-3.5 inline" /> :
                                <Monitor className="h-3.5 w-3.5 inline" />} {s.browser}
                          </td>
                          <td className="text-xs">{s.page_views_count}</td>
                          <td className="text-xs">{fmtDuration(s.duration_seconds || 0)}</td>
                          <td className="text-xs">{s.referrer_domain || "(direct)"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) {
  return (
    <Card className="p-4">
      <div className={`p-1.5 rounded-lg bg-muted w-fit ${color} mb-2`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Card>
  );
}
