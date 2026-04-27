import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  Activity, RefreshCw, Loader2, ChevronDown, ChevronUp, Stethoscope,
  PhoneCall, Clock, Webhook, Zap, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  campaignId: string;
}

type EngineEvent = {
  ts: Date;
  action: string;
  result: string;
  detail?: string;
};

type Diagnostics = {
  liveStatus: string;
  scheduleStatus: string | null;
  pendingCount: number;
  dialingCount: number;
  completedCount: number;
  failedCount: number;
  lastQueueUpdate: Date | null;
  lastQueueItem: { phone: string; status: string; last_result: string | null } | null;
  lastCallLog: { phone: string; twilio_status: string | null; amd_result: string | null; disposition: string | null; created_at: Date } | null;
  lastWebhookAt: Date | null;
  lastDialedAt: Date | null;
  campaignUpdatedAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  // Decision signals
  isRunning: boolean;
  stalled: boolean;
  completed: boolean;
  shouldAutoAdvance: boolean;
  shouldStop: boolean;
  decisionReason: string;
};

const fmtTime = (d: Date | null) => {
  if (!d) return '—';
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s ago`;
  return d.toLocaleTimeString('en-US', { hour12: false });
};

export default function PowerDialStallDiagnostics({ campaignId }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [engineEvents, setEngineEvents] = useState<EngineEvent[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: campaign },
        { count: pendingCount },
        { count: dialingCount },
        { data: lastQueue },
        { data: lastLog },
      ] = await Promise.all([
        supabase
          .from('powerdial_campaigns')
          .select('status, schedule_status, completed_count, failed_count, started_at, ended_at, updated_at')
          .eq('id', campaignId)
          .maybeSingle(),
        supabase
          .from('powerdial_queue')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('status', 'pending'),
        supabase
          .from('powerdial_queue')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('status', 'dialing'),
        supabase
          .from('powerdial_queue')
          .select('phone, status, last_result, updated_at, last_dialed_at')
          .eq('campaign_id', campaignId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('powerdial_call_logs')
          .select('phone, twilio_status, amd_result, disposition, created_at, updated_at')
          .eq('campaign_id', campaignId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const c: any = campaign || {};
      const lq: any = lastQueue || null;
      const ll: any = lastLog || null;

      const liveStatus = String(c.status || 'unknown');
      const isRunning = liveStatus === 'running';
      const dCount = dialingCount || 0;
      const pCount = pendingCount || 0;
      const stalled = isRunning && dCount === 0 && pCount > 0;
      const completed = isRunning && dCount === 0 && pCount === 0;
      const shouldAutoAdvance = stalled;
      const shouldStop = completed || liveStatus === 'stopped' || liveStatus === 'completed';

      let decisionReason = '';
      if (!isRunning) decisionReason = `Campaign is "${liveStatus}" — health monitor will not auto-advance`;
      else if (completed) decisionReason = 'No pending or dialing items — campaign will auto-complete';
      else if (stalled) decisionReason = `Stalled: ${pCount} pending but 0 dialing — auto-advance triggered`;
      else if (dCount > 0) decisionReason = `Healthy: ${dCount} dialing, ${pCount} pending`;
      else decisionReason = 'No active activity';

      setDiag({
        liveStatus,
        scheduleStatus: c.schedule_status || null,
        pendingCount: pCount,
        dialingCount: dCount,
        completedCount: c.completed_count || 0,
        failedCount: c.failed_count || 0,
        lastQueueUpdate: lq?.updated_at ? new Date(lq.updated_at) : null,
        lastQueueItem: lq ? { phone: lq.phone, status: lq.status, last_result: lq.last_result } : null,
        lastCallLog: ll ? {
          phone: ll.phone,
          twilio_status: ll.twilio_status,
          amd_result: ll.amd_result,
          disposition: ll.disposition,
          created_at: new Date(ll.updated_at || ll.created_at),
        } : null,
        lastWebhookAt: ll?.updated_at ? new Date(ll.updated_at) : null,
        lastDialedAt: lq?.last_dialed_at ? new Date(lq.last_dialed_at) : null,
        campaignUpdatedAt: c.updated_at ? new Date(c.updated_at) : null,
        startedAt: c.started_at ? new Date(c.started_at) : null,
        endedAt: c.ended_at ? new Date(c.ended_at) : null,
        isRunning,
        stalled,
        completed,
        shouldAutoAdvance,
        shouldStop,
        decisionReason,
      });
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // Capture engine invocations by patching console (lightweight) — actually subscribe to global event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setEngineEvents(prev => [
        { ts: new Date(), action: detail.action || 'unknown', result: detail.result || 'ok', detail: detail.detail },
        ...prev.slice(0, 19),
      ]);
    };
    window.addEventListener('powerdial:engine', handler as EventListener);
    return () => window.removeEventListener('powerdial:engine', handler as EventListener);
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  const decisionColor = !diag ? 'text-muted-foreground'
    : diag.stalled ? 'text-amber-400'
    : diag.completed ? 'text-blue-400'
    : diag.isRunning ? 'text-emerald-400'
    : 'text-muted-foreground';

  return (
    <div className="border border-border/50 rounded-lg bg-card/50 mt-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 h-11 text-xs font-mono hover:bg-muted/30 transition-colors rounded-t-lg"
      >
        <Stethoscope className={cn('h-3.5 w-3.5', decisionColor)} />
        <span className="font-semibold text-foreground/80">Stall Diagnostics</span>
        <span className="text-muted-foreground/60">—</span>
        <span className={cn('truncate', decisionColor)}>
          {diag?.decisionReason || 'loading…'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {diag?.shouldAutoAdvance && (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 px-1.5 py-0">
              <Zap className="h-2.5 w-2.5 mr-0.5" /> auto-advance
            </Badge>
          )}
          {diag?.shouldStop && (
            <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400 px-1.5 py-0">
              stop
            </Badge>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20">
            <Button size="sm" variant="ghost" onClick={refresh} disabled={loading} className="h-7 text-xs">
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Refresh
            </Button>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">auto-refresh every 5s</span>
          </div>

          {diag && (
            <>
              {/* Decision reasoning */}
              <div className={cn(
                'mx-4 mt-3 mb-2 px-3 py-2 rounded-md border text-xs font-mono',
                diag.stalled ? 'border-amber-500/30 bg-amber-500/5 text-amber-300' :
                diag.completed ? 'border-blue-500/30 bg-blue-500/5 text-blue-300' :
                diag.isRunning ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' :
                'border-border/40 bg-muted/20 text-muted-foreground'
              )}>
                <div className="flex items-center gap-2 mb-1 text-[11px] font-semibold uppercase tracking-wider opacity-80">
                  {diag.stalled ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  Monitor Decision
                </div>
                <div className="text-[12px]">{diag.decisionReason}</div>
              </div>

              {/* Live signals grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2">
                <Stat label="Live Status" value={diag.liveStatus.toUpperCase()} highlight={diag.isRunning ? 'good' : 'neutral'} />
                <Stat label="Pending" value={diag.pendingCount} highlight={diag.pendingCount > 0 && diag.dialingCount === 0 && diag.isRunning ? 'warn' : 'neutral'} />
                <Stat label="Dialing" value={diag.dialingCount} highlight={diag.dialingCount > 0 ? 'good' : (diag.isRunning && diag.pendingCount > 0 ? 'warn' : 'neutral')} />
                <Stat label="Schedule" value={diag.scheduleStatus || 'none'} highlight="neutral" />
                <Stat label="Completed" value={diag.completedCount} highlight="neutral" />
                <Stat label="Failed" value={diag.failedCount} highlight={diag.failedCount > 0 ? 'warn' : 'neutral'} />
                <Stat label="Started" value={diag.startedAt ? fmtTime(diag.startedAt) : '—'} highlight="neutral" />
                <Stat label="Ended" value={diag.endedAt ? fmtTime(diag.endedAt) : '—'} highlight="neutral" />
              </div>

              {/* Last events */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-4 pb-3">
                <EventCard
                  icon={<PhoneCall className="h-3 w-3" />}
                  title="Last Queue Update"
                  time={diag.lastQueueUpdate}
                  body={diag.lastQueueItem
                    ? `${diag.lastQueueItem.phone} → ${diag.lastQueueItem.status}${diag.lastQueueItem.last_result ? ` (${diag.lastQueueItem.last_result})` : ''}`
                    : 'no queue events'}
                />
                <EventCard
                  icon={<Webhook className="h-3 w-3" />}
                  title="Last Webhook / Call Log"
                  time={diag.lastWebhookAt}
                  body={diag.lastCallLog
                    ? `${diag.lastCallLog.phone} · twilio:${diag.lastCallLog.twilio_status || '—'} · amd:${diag.lastCallLog.amd_result || '—'} · ${diag.lastCallLog.disposition || 'no disposition'}`
                    : 'no webhook events recorded'}
                />
                <EventCard
                  icon={<Clock className="h-3 w-3" />}
                  title="Last Dial Attempt"
                  time={diag.lastDialedAt}
                  body={diag.lastDialedAt ? 'Twilio call placed from queue' : 'no dial attempts yet'}
                />
                <EventCard
                  icon={<Activity className="h-3 w-3" />}
                  title="Campaign Row Updated"
                  time={diag.campaignUpdatedAt}
                  body={`status changed to ${diag.liveStatus}`}
                />
              </div>

              {/* Engine event log */}
              <div className="px-4 pb-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1 flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Engine Invocations (this session)
                </div>
                <div className="max-h-32 overflow-y-auto font-mono text-[11px] space-y-0.5 border border-border/30 rounded-md p-2 bg-muted/10">
                  {engineEvents.length === 0 && (
                    <p className="text-muted-foreground/50 italic text-center py-2">
                      No engine actions captured yet — invocations will appear here as health monitor or user actions trigger them.
                    </p>
                  )}
                  {engineEvents.map((ev, i) => (
                    <div key={i} className="leading-5">
                      <span className="text-muted-foreground/40 mr-2">
                        {ev.ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="text-purple-400">{ev.action}</span>
                      <span className="text-muted-foreground/60"> → </span>
                      <span className="text-foreground/80">{ev.result}</span>
                      {ev.detail && <span className="text-muted-foreground/50 ml-1">· {ev.detail}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight: 'good' | 'warn' | 'neutral' }) {
  return (
    <div className={cn(
      'rounded-md px-3 py-1.5 text-center border',
      highlight === 'good' && 'border-emerald-500/20 bg-emerald-500/5',
      highlight === 'warn' && 'border-amber-500/30 bg-amber-500/10',
      highlight === 'neutral' && 'border-border/40 bg-muted/10',
    )}>
      <p className={cn(
        'text-sm font-bold font-mono',
        highlight === 'good' && 'text-emerald-400',
        highlight === 'warn' && 'text-amber-400',
        highlight === 'neutral' && 'text-foreground/80',
      )}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function EventCard({ icon, title, time, body }: { icon: React.ReactNode; title: string; time: Date | null; body: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-muted-foreground/50 font-mono normal-case tracking-normal">{fmtTime(time)}</span>
      </div>
      <div className="text-[11px] font-mono text-foreground/80 break-all">{body}</div>
    </div>
  );
}
