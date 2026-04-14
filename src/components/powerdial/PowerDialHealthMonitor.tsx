import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw, Loader2,
  Wrench, XCircle, Clock, Zap, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type LogEntry = {
  id: string;
  ts: Date;
  level: 'info' | 'warn' | 'error' | 'fix';
  message: string;
};

type QueueHealth = {
  stuck_dialing: number;
  orphaned_calls: number;
  campaign_stalled: boolean;
  queue_gap: boolean;
};

interface Props {
  campaignId: string;
  campaignStatus: string;
  settings?: any;
}

export default function PowerDialHealthMonitor({ campaignId, campaignStatus, settings }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<QueueHealth>({ stuck_dialing: 0, orphaned_calls: 0, campaign_stalled: false, queue_gap: false });
  const [checking, setChecking] = useState(false);
  const [autoFix, setAutoFix] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev.slice(-200), { id: crypto.randomUUID(), ts: new Date(), level, message }]);
  }, []);

  // Health check: detect stuck items, stalled campaigns, orphaned calls
  const runHealthCheck = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const now = new Date();

      // 1) Check for queue items stuck in "dialing" for > 3 minutes
      const threeMinAgo = new Date(now.getTime() - 3 * 60 * 1000).toISOString();
      const { data: stuckItems } = await supabase
        .from('powerdial_queue')
        .select('id, phone, contact_name, updated_at')
        .eq('campaign_id', campaignId)
        .eq('status', 'dialing')
        .lt('updated_at', threeMinAgo) as any;
      const stuckItemsList = (stuckItems as any[]) || [];

      // 2) Check if campaign is "running" but no items are dialing or pending
      const { count: rawDialingCount } = await supabase
        .from('powerdial_queue')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'dialing');
      const dialingCount = rawDialingCount || 0;

      const { count: rawPendingCount } = await supabase
        .from('powerdial_queue')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'pending');
      const pendingCount = rawPendingCount || 0;

      const isRunning = campaignStatus === 'running';
      const stalled = isRunning && (dialingCount || 0) === 0 && (pendingCount || 0) > 0;
      const completed = isRunning && (dialingCount || 0) === 0 && (pendingCount || 0) === 0;

      // 3) Check for recent call log errors (last 5 min)
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const { data: recentErrors } = await supabase
        .from('powerdial_call_logs')
        .select('id, phone, last_status')
        .eq('campaign_id', campaignId)
        .eq('last_status', 'failed')
        .gte('created_at', fiveMinAgo);

      const errorCount = recentErrors?.length || 0;

      const newHealth: QueueHealth = {
        stuck_dialing: stuckCount,
        orphaned_calls: errorCount,
        campaign_stalled: stalled,
        queue_gap: false,
      };
      setHealth(newHealth);

      // Log findings
      if (stuckCount > 0) {
        addLog('warn', `⚠ ${stuckCount} item(s) stuck in "dialing" for 3+ min`);
      }
      if (errorCount > 0) {
        addLog('warn', `⚠ ${errorCount} call failure(s) in last 5 min`);
      }
      if (stalled) {
        addLog('warn', `⚠ Campaign stalled — running but nothing dialing with ${pendingCount} pending`);
      }
      if (completed) {
        addLog('info', `✓ All queue items processed — campaign may auto-complete`);
      }

      // AUTO-FIX: unstick dialing items
      if (autoFix && stuckCount > 0 && stuckItems) {
        addLog('fix', `🔧 Auto-fixing ${stuckCount} stuck item(s) → resetting to pending`);
        for (const item of stuckItems) {
          await supabase.from('powerdial_queue').update({ status: 'pending', last_result: 'auto_reset' }).eq('id', item.id);
          addLog('fix', `  → Reset ${item.contact_name || item.phone} to pending`);
        }
        toast.info(`Auto-fixed ${stuckCount} stuck queue item(s)`);
      }

      // AUTO-FIX: re-advance stalled campaign
      if (autoFix && stalled && isRunning) {
        addLog('fix', '🔧 Auto-advancing stalled campaign…');
        try {
          const { data, error } = await supabase.functions.invoke('powerdial-engine', {
            body: { action: 'advance', campaign_id: campaignId },
          });
          if (error) {
            addLog('error', `✗ Advance failed: ${error.message}`);
          } else {
            addLog('fix', `✓ Campaign re-advanced: ${data?.dialed ? 'dialing next' : data?.reason || 'ok'}`);
          }
        } catch (e: any) {
          addLog('error', `✗ Advance error: ${e.message}`);
        }
      }

      if (stuckCount === 0 && errorCount === 0 && !stalled) {
        addLog('info', '✓ Health check passed — pipeline healthy');
      }
    } catch (err: any) {
      addLog('error', `✗ Health check failed: ${err.message}`);
    } finally {
      setChecking(false);
    }
  }, [campaignId, campaignStatus, checking, autoFix, addLog]);

  // Auto-poll every 30s when campaign is running
  useEffect(() => {
    if (campaignStatus === 'running') {
      intervalRef.current = setInterval(runHealthCheck, 30_000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [campaignStatus, runHealthCheck]);

  // Realtime queue error tracking
  useEffect(() => {
    const channel = supabase
      .channel(`pd-health-${campaignId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'powerdial_queue',
        filter: `campaign_id=eq.${campaignId}`,
      }, (payload: any) => {
        const item = payload.new;
        if (item?.status === 'failed') {
          addLog('error', `✗ Call failed: ${item.contact_name || item.phone} — ${item.last_result || 'unknown'}`);
        } else if (item?.status === 'completed' && item?.last_result === 'human') {
          addLog('info', `☎ Human detected: ${item.contact_name || item.phone}`);
        } else if (item?.status === 'completed' && item?.last_result === 'machine') {
          addLog('info', `📠 Machine: ${item.contact_name || item.phone}`);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'powerdial_campaigns',
        filter: `id=eq.${campaignId}`,
      }, (payload: any) => {
        const c = payload.new;
        if (c?.status === 'completed') addLog('info', '🏁 Campaign completed');
        if (c?.status === 'stopped') addLog('warn', '⏹ Campaign stopped');
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId, addLog]);

  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  const hasIssues = health.stuck_dialing > 0 || health.orphaned_calls > 0 || health.campaign_stalled;
  const StatusIcon = checking ? Loader2 : hasIssues ? AlertTriangle : Activity;
  const statusColor = hasIssues ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="border border-border/50 rounded-lg bg-card/50 mt-6">
      {/* Header bar */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 h-11 text-xs font-mono hover:bg-muted/30 transition-colors rounded-t-lg"
      >
        <StatusIcon className={cn('h-3.5 w-3.5', checking && 'animate-spin', statusColor)} />
        <span className="font-semibold text-foreground/80">Pipeline Monitor</span>
        <span className="text-muted-foreground/60">—</span>
        <span className="text-muted-foreground/60 truncate">
          {campaignStatus === 'running' ? 'live · auto-polling 30s' : campaignStatus}
        </span>

        {hasIssues && (
          <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/40 text-amber-400 px-1.5 py-0">
            {health.stuck_dialing + health.orphaned_calls + (health.campaign_stalled ? 1 : 0)} issue(s)
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          {autoFix && (
            <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-400 px-1.5 py-0">
              <Wrench className="h-2.5 w-2.5 mr-0.5" /> auto-fix
            </Badge>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20">
            <Button
              size="sm"
              variant="ghost"
              onClick={runHealthCheck}
              disabled={checking}
              className="h-7 text-xs"
            >
              {checking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Run Check
            </Button>
            <Button
              size="sm"
              variant={autoFix ? 'default' : 'outline'}
              onClick={() => setAutoFix(f => !f)}
              className={cn('h-7 text-xs', autoFix && 'bg-purple-500 hover:bg-purple-600 text-white')}
            >
              <Wrench className="h-3 w-3 mr-1" />
              Auto-Fix {autoFix ? 'ON' : 'OFF'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLogs([])}
              className="h-7 text-xs ml-auto"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>

          {/* Health summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2">
            <HealthCard label="Stuck Calls" value={health.stuck_dialing} ok={health.stuck_dialing === 0} />
            <HealthCard label="Recent Failures" value={health.orphaned_calls} ok={health.orphaned_calls === 0} />
            <HealthCard label="Pipeline" value={health.campaign_stalled ? 'STALLED' : 'OK'} ok={!health.campaign_stalled} />
            <HealthCard label="Auto-Fix" value={autoFix ? 'ACTIVE' : 'OFF'} ok={autoFix} />
          </div>

          {/* Log stream */}
          <div ref={scrollRef} className="max-h-56 overflow-y-auto px-4 py-2 font-mono text-[11px] space-y-0.5">
            {logs.length === 0 && (
              <p className="text-muted-foreground/50 italic py-4 text-center">No events yet — click "Run Check" or wait for auto-poll</p>
            )}
            {logs.map(log => (
              <div key={log.id} className={cn(
                'leading-5 whitespace-pre-wrap break-all',
                log.level === 'info' && 'text-muted-foreground',
                log.level === 'warn' && 'text-amber-400',
                log.level === 'error' && 'text-red-400',
                log.level === 'fix' && 'text-purple-400',
              )}>
                <span className="text-muted-foreground/40 mr-2">
                  {log.ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {log.level === 'fix' && <Wrench className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.level === 'error' && <XCircle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.level === 'warn' && <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.level === 'info' && <CheckCircle2 className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthCard({ label, value, ok }: { label: string; value: number | string; ok: boolean }) {
  return (
    <div className={cn(
      'rounded-md px-3 py-1.5 text-center border',
      ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/10'
    )}>
      <p className={cn('text-sm font-bold', ok ? 'text-emerald-400' : 'text-amber-400')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
