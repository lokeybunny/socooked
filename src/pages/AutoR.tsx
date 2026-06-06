import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
const supabase = supabaseClient as any;
import Hls from 'hls.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Activity, CheckCircle2, XCircle, Loader2, Trash2, RotateCcw, Square,
  Copy, Download, Play, Video, HardDrive, Timer, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

type Job = {
  id: string;
  job_id: string;
  recording_name: string | null;
  source_url: string;
  source_type: string;
  discord_server_name: string | null;
  discord_channel_name: string | null;
  status: string;
  stop_phrase: string;
  detected_phrase: string | null;
  token_name: string | null;
  contract_address: string | null;
  video_url: string | null;
  storage_path: string | null;
  browserbase_session_id: string | null;
  thumbnail_url: string | null;
  storage_size: number | null;
  duration_seconds: number | null;
  start_time: string | null;
  end_time: string | null;
  retry_count: number;
  last_error: string | null;
  created_at: string;
};

type EventRow = {
  id: string;
  job_id: string;
  event_type: string;
  message: string | null;
  created_at: string;
};

type Setting = {
  id: string;
  guild_id: string;
  guild_name: string | null;
  channel_id: string;
  channel_name: string | null;
  watch_enabled: boolean;
  stop_phrase: string;
  retry_enabled: boolean;
  max_retries: number;
  max_duration_minutes: number;
  auto_upload: boolean;
  url_patterns: string[];
};

const ACTIVE_STATUSES = new Set([
  'queued', 'detected', 'launching_browser', 'opening_url',
  'recording', 'waiting_for_stop_phrase', 'stop_phrase_detected',
  'stopping', 'processing', 'uploading', 'retrying',
]);

function callApi(path: string, init: RequestInit = {}) {
  const url = `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/autor-api${path}`;
  return supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    return fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    }).then(async (r) => {
      const text = await r.text();
      try { return { ok: r.ok, body: JSON.parse(text) }; }
      catch { return { ok: r.ok, body: text }; }
    });
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    queued: 'bg-muted text-muted-foreground',
    detected: 'bg-blue-500/15 text-blue-400',
    launching_browser: 'bg-blue-500/15 text-blue-400',
    opening_url: 'bg-blue-500/15 text-blue-400',
    recording: 'bg-emerald-500/20 text-emerald-400 animate-pulse',
    waiting_for_stop_phrase: 'bg-emerald-500/20 text-emerald-400',
    stop_phrase_detected: 'bg-amber-500/20 text-amber-400',
    stopping: 'bg-amber-500/20 text-amber-400',
    processing: 'bg-amber-500/20 text-amber-400',
    uploading: 'bg-amber-500/20 text-amber-400',
    retrying: 'bg-orange-500/20 text-orange-400',
    completed: 'bg-emerald-500/15 text-emerald-400',
    failed: 'bg-destructive/20 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  };
  return <Badge variant="outline" className={`${map[status] ?? 'bg-muted'} border-0 font-mono text-[10px] uppercase tracking-wider`}>{status.replace(/_/g, ' ')}</Badge>;
}

function fmtDuration(s: number | null | undefined) {
  if (!s || s <= 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtSize(b: number | null | undefined) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function LiveTimer({ start }: { start: string | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);
  if (!start) return <span className="text-muted-foreground">—</span>;
  const secs = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
  return <span className="font-mono text-emerald-400">{fmtDuration(secs)}{tick ? '' : ''}</span>;
}

function ReplayPlayer({ job }: { job: Job }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const replayUrl = job.video_url || (job.browserbase_session_id
    ? `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/autor-api/replay/${job.browserbase_session_id}/0`
    : '');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !replayUrl) return;

    if (job.video_url || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = replayUrl;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(replayUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }, [job.video_url, replayUrl]);

  if (!replayUrl) {
    return <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Play className="h-12 w-12" /></div>;
  }

  return <video ref={videoRef} controls playsInline muted poster={job.thumbnail_url ?? undefined} className="w-full h-full object-contain" />;
}

export default function AutoR() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  const loadAll = async () => {
    const [j, e, s] = await Promise.all([
      supabase.from('recording_jobs').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('recording_events').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('recording_settings').select('*').order('created_at', { ascending: false }),
    ]);
    setJobs((j.data ?? []) as Job[]);
    setEvents((e.data ?? []) as EventRow[]);
    setSettings((s.data ?? []) as Setting[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel('autor-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recording_jobs' }, () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recording_events' }, () => loadAll())
      .subscribe();
    const poll = setInterval(loadAll, 10_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, []);

  const active = useMemo(() => jobs.filter((j) => ACTIVE_STATUSES.has(j.status)), [jobs]);
  const completed = useMemo(() => jobs.filter((j) => j.status === 'completed'), [jobs]);
  const failed = useMemo(() => jobs.filter((j) => j.status === 'failed'), [jobs]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = jobs.filter((j) => j.created_at.startsWith(today)).length;
    const storage = jobs.reduce((sum, j) => sum + (j.storage_size ?? 0), 0);
    const completedDurations = completed.map((j) => j.duration_seconds ?? 0).filter((d) => d > 0);
    const avgDuration = completedDurations.length ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length : 0;
    const finished = completed.length + failed.length;
    const successRate = finished ? (completed.length / finished) * 100 : 0;
    return { todayCount, storage, avgDuration, successRate };
  }, [jobs, completed, failed]);

  const stop = async (jobId: string) => {
    const r = await callApi('/stop', { method: 'POST', body: JSON.stringify({ jobId, reason: 'Manual from dashboard' }) });
    if (r.ok) { toast.success('Stop requested'); loadAll(); }
    else toast.error('Failed to stop');
  };
  const retry = async (jobId: string) => {
    const r = await callApi('/retry', { method: 'POST', body: JSON.stringify({ jobId }) });
    if (r.ok) { toast.success('Retry queued'); loadAll(); }
    else toast.error('Failed to retry');
  };
  const del = async (jobId: string) => {
    if (!confirm('Delete recording permanently?')) return;
    const r = await callApi(`/${jobId}`, { method: 'DELETE' });
    if (r.ok) { toast.success('Deleted'); loadAll(); }
    else toast.error('Failed to delete');
  };
  const download = async (j: Job) => {
    try {
      let url = j.video_url || '';
      const filename = `${(j.recording_name || j.job_id).replace(/[^\w.-]+/g, '_')}.mp4`;
      if (j.storage_path) {
        const { data, error } = await supabase.storage
          .from('autor-recordings')
          .createSignedUrl(j.storage_path, 60 * 60, { download: filename });
        if (error) throw error;
        url = data.signedUrl;
      }
      if (!url) { toast.error('No recording file available'); return; }
      // Fetch as blob to force download (handles cross-origin)
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast.success('Download started');
    } catch (e: any) {
      toast.error(`Download failed: ${e.message || e}`);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Video className="h-6 w-6 text-emerald-400" />
              AutoR
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-normal ml-2">Auto Recordings</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Discord-triggered browser recordings · stop phrase: <code className="text-emerald-400">"all supply has been sold"</code>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/70 italic">
          Legal: Only record pages, streams, or sessions you have permission to record.
        </p>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
            <TabsTrigger value="failed">Failed ({failed.length})</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard icon={Activity} label="Today" value={String(stats.todayCount)} color="text-blue-400" />
              <StatCard icon={Video} label="Recording" value={String(active.filter(j => j.status === 'recording' || j.status === 'waiting_for_stop_phrase').length)} color="text-emerald-400" />
              <StatCard icon={CheckCircle2} label="Completed" value={String(completed.length)} color="text-emerald-400" />
              <StatCard icon={XCircle} label="Failed" value={String(failed.length)} color="text-destructive" />
              <StatCard icon={HardDrive} label="Storage" value={fmtSize(stats.storage)} color="text-amber-400" />
              <StatCard icon={Timer} label="Avg Duration" value={fmtDuration(Math.round(stats.avgDuration))} color="text-purple-400" />
              <StatCard icon={TrendingUp} label="Success" value={`${stats.successRate.toFixed(0)}%`} color="text-emerald-400" />
            </div>

            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
              <div className="space-y-1 max-h-80 overflow-auto">
                {events.slice(0, 30).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-muted-foreground font-mono">{new Date(e.created_at).toLocaleTimeString()}</span>
                    <span className="text-emerald-400 font-mono">{e.event_type}</span>
                    <span className="text-foreground/80 truncate flex-1">{e.message}</span>
                    <span className="text-muted-foreground/60 font-mono text-[10px]">{e.job_id.slice(0, 12)}</span>
                  </div>
                ))}
                {events.length === 0 && <p className="text-xs text-muted-foreground">No events yet.</p>}
              </div>
            </div>
          </TabsContent>

          {/* ACTIVE */}
          <TabsContent value="active" className="mt-4">
            <div className="glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recording</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Stop Phrase</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium">{j.recording_name ?? j.job_id}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        <a href={j.source_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{j.source_url}</a>
                      </TableCell>
                      <TableCell className="text-xs">{j.discord_server_name ? `${j.discord_server_name} / ` : ''}{j.discord_channel_name ?? '—'}</TableCell>
                      <TableCell>{statusBadge(j.status)}</TableCell>
                      <TableCell><LiveTimer start={j.start_time} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">"{j.stop_phrase}"</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{j.start_time ? new Date(j.start_time).toLocaleTimeString() : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => stop(j.job_id)}>
                          <Square className="h-3.5 w-3.5 mr-1" />Stop
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {active.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No active recordings.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* COMPLETED */}
          <TabsContent value="completed" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completed.map((j) => (
                <div key={j.id} className="glass-card overflow-hidden group">
                  <div className="aspect-video bg-black relative">
                    <ReplayPlayer job={j} />
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{j.recording_name ?? j.job_id}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(j.created_at).toLocaleString()}</p>
                      </div>
                      {statusBadge(j.status)}
                    </div>
                    {j.token_name && <p className="text-xs"><span className="text-muted-foreground">Token:</span> <span className="text-emerald-400">{j.token_name}</span></p>}
                    {j.contract_address && (
                      <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1 truncate">
                        {j.contract_address}
                        <button onClick={() => { navigator.clipboard.writeText(j.contract_address!); toast.success('Copied'); }}><Copy className="h-3 w-3" /></button>
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span><Timer className="h-3 w-3 inline mr-1" />{fmtDuration(j.duration_seconds)}</span>
                      <span><HardDrive className="h-3 w-3 inline mr-1" />{fmtSize(j.storage_size)}</span>
                      <span className="truncate">{j.discord_channel_name}</span>
                    </div>
                    <div className="flex items-center gap-1 pt-1 border-t border-border/30">
                      {(j.video_url || j.storage_path) && (
                        <button onClick={() => download(j)} className="text-xs px-2 py-1 rounded hover:bg-accent flex items-center gap-1">
                          <Download className="h-3 w-3" />Download
                        </button>
                      )}
                      <button onClick={() => { navigator.clipboard.writeText(j.source_url); toast.success('URL copied'); }} className="text-xs px-2 py-1 rounded hover:bg-accent flex items-center gap-1">
                        <Copy className="h-3 w-3" />URL
                      </button>
                      <button onClick={() => del(j.job_id)} className="text-xs px-2 py-1 rounded hover:bg-destructive/15 text-destructive ml-auto flex items-center gap-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {completed.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">No completed recordings yet.</p>}
            </div>
          </TabsContent>

          {/* FAILED */}
          <TabsContent value="failed" className="mt-4">
            <div className="glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recording</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failed.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium">
                        <div>{j.recording_name ?? j.job_id}</div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[260px]">{j.source_url}</div>
                      </TableCell>
                      <TableCell className="text-xs text-destructive max-w-[300px] truncate" title={j.last_error ?? ''}>
                        <AlertTriangle className="h-3 w-3 inline mr-1" />{j.last_error ?? 'Unknown error'}
                      </TableCell>
                      <TableCell className="text-xs">{j.retry_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => retry(j.job_id)}><RotateCcw className="h-3.5 w-3.5 mr-1" />Retry</Button>
                        <Button size="sm" variant="ghost" onClick={() => del(j.job_id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {failed.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No failed recordings.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* LOGS */}
          <TabsContent value="logs" className="mt-4">
            <div className="glass-card p-4 max-h-[600px] overflow-auto font-mono text-xs">
              {events.map((e) => (
                <div key={e.id} className="py-1 border-b border-border/20 last:border-0 flex gap-3">
                  <span className="text-muted-foreground/60 shrink-0">{new Date(e.created_at).toLocaleString()}</span>
                  <span className="text-emerald-400 shrink-0">{e.event_type}</span>
                  <span className="text-muted-foreground shrink-0">[{e.job_id.slice(0, 16)}]</span>
                  <span className="text-foreground/80">{e.message}</span>
                </div>
              ))}
              {events.length === 0 && <p className="text-muted-foreground">No events.</p>}
            </div>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="mt-4 space-y-4">
            <SettingsPanel settings={settings} onReload={loadAll} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="metric-card">
      <div className={`p-2 rounded-lg bg-muted ${color} w-fit mb-2`}><Icon className="h-4 w-4" /></div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function SettingsPanel({ settings, onReload }: { settings: Setting[]; onReload: () => void }) {
  const [form, setForm] = useState({
    guild_id: '', guild_name: '', channel_id: '', channel_name: '',
    stop_phrase: 'all supply has been sold',
    max_duration_minutes: 120, max_retries: 3,
    url_patterns: 'axiom.trade',
  });

  const save = async () => {
    if (!form.guild_id || !form.channel_id) { toast.error('Guild + Channel ID required'); return; }
    const { error } = await supabase.from('recording_settings').upsert({
      guild_id: form.guild_id,
      guild_name: form.guild_name || null,
      channel_id: form.channel_id,
      channel_name: form.channel_name || null,
      stop_phrase: form.stop_phrase,
      max_duration_minutes: form.max_duration_minutes,
      max_retries: form.max_retries,
      url_patterns: form.url_patterns.split(',').map(s => s.trim()).filter(Boolean),
      watch_enabled: true,
      retry_enabled: true,
      auto_upload: true,
    }, { onConflict: 'guild_id,channel_id' });
    if (error) toast.error(error.message);
    else { toast.success('Saved'); onReload(); }
  };

  const toggleWatch = async (s: Setting) => {
    await supabase.from('recording_settings').update({ watch_enabled: !s.watch_enabled }).eq('id', s.id);
    onReload();
  };
  const remove = async (id: string) => {
    if (!confirm('Remove this channel watch?')) return;
    await supabase.from('recording_settings').delete().eq('id', id);
    onReload();
  };

  return (
    <>
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold mb-3">Add Discord Channel Watch</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Guild ID *</Label><Input value={form.guild_id} onChange={(e) => setForm({ ...form, guild_id: e.target.value })} placeholder="123456789..." /></div>
          <div><Label>Guild Name</Label><Input value={form.guild_name} onChange={(e) => setForm({ ...form, guild_name: e.target.value })} placeholder="My Server" /></div>
          <div><Label>Channel ID *</Label><Input value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value })} placeholder="987654321..." /></div>
          <div><Label>Channel Name</Label><Input value={form.channel_name} onChange={(e) => setForm({ ...form, channel_name: e.target.value })} placeholder="#alpha-calls" /></div>
          <div className="md:col-span-2"><Label>Stop Phrase</Label><Input value={form.stop_phrase} onChange={(e) => setForm({ ...form, stop_phrase: e.target.value })} /></div>
          <div><Label>Max Duration (min)</Label><Input type="number" value={form.max_duration_minutes} onChange={(e) => setForm({ ...form, max_duration_minutes: Number(e.target.value) })} /></div>
          <div><Label>Max Retries</Label><Input type="number" value={form.max_retries} onChange={(e) => setForm({ ...form, max_retries: Number(e.target.value) })} /></div>
          <div className="md:col-span-2"><Label>URL Patterns (comma separated)</Label><Input value={form.url_patterns} onChange={(e) => setForm({ ...form, url_patterns: e.target.value })} placeholder="axiom.trade, dexscreener.com" /></div>
        </div>
        <Button className="mt-3" onClick={save}>Save Watch</Button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guild</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Stop Phrase</TableHead>
              <TableHead>Max Min</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead>Patterns</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settings.map((s) => (
              <TableRow key={s.id}>
                <TableCell><div>{s.guild_name ?? '—'}</div><div className="text-[10px] font-mono text-muted-foreground">{s.guild_id}</div></TableCell>
                <TableCell><div>{s.channel_name ?? '—'}</div><div className="text-[10px] font-mono text-muted-foreground">{s.channel_id}</div></TableCell>
                <TableCell className="font-mono text-xs">"{s.stop_phrase}"</TableCell>
                <TableCell>{s.max_duration_minutes}</TableCell>
                <TableCell>{s.max_retries}</TableCell>
                <TableCell className="text-xs">{s.url_patterns?.join(', ')}</TableCell>
                <TableCell>
                  <button onClick={() => toggleWatch(s)} className={`text-xs px-2 py-1 rounded ${s.watch_enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                    {s.watch_enabled ? 'ON' : 'OFF'}
                  </button>
                </TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
            {settings.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No watches configured.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <div className="glass-card p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">Recorder Service Integration</p>
        <p>Self-hosted recorder (Discord.js + Playwright + Xvfb + FFmpeg) calls these endpoints with header <code className="text-emerald-400">x-bot-secret: $BOT_SECRET</code>:</p>
        <ul className="space-y-1 ml-4 list-disc">
          <li><code>POST /functions/v1/autor-api/create</code> — when bot detects an Axiom URL</li>
          <li><code>POST /functions/v1/autor-api/update-status</code> — push status / video_url / events</li>
          <li><code>GET  /functions/v1/autor-api/status/:jobId</code> — poll job state (e.g. stop requests)</li>
        </ul>
        <p>Upload finished MP4 to the public <code>autor-recordings</code> storage bucket, then post the public URL via update-status.</p>
      </div>
    </>
  );
}
