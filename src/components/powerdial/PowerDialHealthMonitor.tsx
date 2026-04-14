import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw, Loader2,
  Wrench, XCircle, ChevronDown, ChevronUp, Trash2, Brain,
  ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type LogEntry = {
  id: string;
  ts: Date;
  level: 'info' | 'warn' | 'error' | 'fix' | 'ai';
  message: string;
};

type QueueHealth = {
  stuck_dialing: number;
  orphaned_calls: number;
  campaign_stalled: boolean;
  ai_analyzed: number;
};

interface Props {
  campaignId: string;
  campaignStatus: string;
  settings?: any;
}

export default function PowerDialHealthMonitor({ campaignId, campaignStatus, settings }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<QueueHealth>({ stuck_dialing: 0, orphaned_calls: 0, campaign_stalled: false, ai_analyzed: 0 });
  const [checking, setChecking] = useState(false);
  const [autoFix, setAutoFix] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyzedRef = useRef<Set<string>>(new Set());

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev.slice(-200), { id: crypto.randomUUID(), ts: new Date(), level, message }]);
  }, []);

  // AI sentiment analysis for human-answered calls with transcripts
  const analyzeTranscripts = useCallback(async () => {
    // Fetch human call logs with transcripts that haven't been AI-analyzed yet
    const logsQuery: any = supabase
      .from('powerdial_call_logs')
      .select('id, phone, contact_name, transcript, amd_result, ai_sentiment, queue_item_id')
      .eq('campaign_id', campaignId)
      .eq('amd_result', 'human');
    const { data: humanLogs } = await logsQuery.not('transcript', 'is', null).is('ai_sentiment', null).limit(10);

    if (!humanLogs?.length) return 0;

    let analyzed = 0;
    for (const log of humanLogs) {
      if (analyzedRef.current.has(log.id)) continue;
      analyzedRef.current.add(log.id);

      const transcript = (log.transcript || '').trim();
      if (transcript.length < 20) {
        // Too short to analyze meaningfully
        await supabase.from('powerdial_call_logs').update({ ai_sentiment: 'unknown' } as any).eq('id', log.id);
        addLog('ai', `⏭ ${log.contact_name || log.phone} — transcript too short, skipped`);
        continue;
      }

      try {
        addLog('ai', `🧠 Analyzing: ${log.contact_name || log.phone}…`);

        const { data: aiResult, error: aiErr } = await supabase.functions.invoke('ai-assistant', {
          body: {
            prompt: `You are a sales call sentiment analyzer. Analyze this cold call transcript and determine if the person being called is INTERESTED or NOT INTERESTED in the service being offered.

Reply with ONLY a JSON object, no other text:
{"sentiment": "positive" | "negative" | "neutral", "confidence": 0-100, "reason": "one sentence explanation", "interested": true | false}

Rules:
- "positive" = person expressed interest, asked questions about the service, wanted more info, agreed to a meeting/callback
- "negative" = person said no, hung up, was hostile, asked to be removed, not interested
- "neutral" = unclear, short call, voicemail left, inconclusive

TRANSCRIPT:
${transcript.slice(0, 3000)}`,
            model: 'google/gemini-2.5-flash',
          },
        });

        if (aiErr) {
          addLog('error', `✗ AI error for ${log.contact_name || log.phone}: ${aiErr.message}`);
          continue;
        }

        // Parse AI response
        let sentiment = 'unknown';
        let interested = false;
        let reason = '';
        let confidence = 0;

        try {
          const responseText = typeof aiResult === 'string' ? aiResult : (aiResult?.message || aiResult?.response || JSON.stringify(aiResult));
          const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            sentiment = parsed.sentiment || 'unknown';
            interested = Boolean(parsed.interested);
            reason = parsed.reason || '';
            confidence = parsed.confidence || 0;
          }
        } catch {
          addLog('warn', `⚠ Could not parse AI response for ${log.contact_name || log.phone}`);
          sentiment = 'unknown';
        }

        // Update the call log with AI analysis
        await supabase.from('powerdial_call_logs').update({
          ai_sentiment: sentiment,
          ai_reason: reason,
          ai_interested: interested,
        } as any).eq('id', log.id);

        // Log the result
        const icon = sentiment === 'positive' ? '👍' : sentiment === 'negative' ? '👎' : '❓';
        addLog('ai', `${icon} ${log.contact_name || log.phone}: ${sentiment.toUpperCase()} (${confidence}%) — ${reason}`);

        // If interested, ensure the customer is tagged and promoted for funnels
        if (interested && sentiment === 'positive') {
          addLog('fix', `📊 Promoting ${log.contact_name || log.phone} to funnel pipeline as interested`);

          // Find the customer linked to this queue item and tag them
          if (log.queue_item_id) {
            const { data: queueItem } = await supabase
              .from('powerdial_queue')
              .select('customer_id, phone')
              .eq('id', log.queue_item_id)
              .single();

            if (queueItem?.customer_id) {
              const { data: customer } = await supabase
                .from('customers')
                .select('id, tags, status')
                .eq('id', queueItem.customer_id)
                .single();

              if (customer) {
                const existingTags = (customer.tags || []) as string[];
                const newTags = [...new Set([...existingTags, 'power_dialed', 'ai_interested'])];
                await supabase.from('customers').update({
                  tags: newTags,
                  status: customer.status === 'lead' ? 'prospect' : customer.status,
                }).eq('id', customer.id);
                addLog('fix', `  → Tagged customer & promoted to prospect`);
              }
            }
          }
        } else if (sentiment === 'negative') {
          // Tag as not interested for funnel filtering
          if (log.queue_item_id) {
            const { data: queueItem } = await supabase
              .from('powerdial_queue')
              .select('customer_id')
              .eq('id', log.queue_item_id)
              .single();

            if (queueItem?.customer_id) {
              const { data: customer } = await supabase
                .from('customers')
                .select('id, tags')
                .eq('id', queueItem.customer_id)
                .single();

              if (customer) {
                const existingTags = (customer.tags || []) as string[];
                const newTags = [...new Set([...existingTags, 'power_dialed', 'ai_not_interested'])];
                await supabase.from('customers').update({ tags: newTags }).eq('id', customer.id);
                addLog('info', `  → Tagged as not interested`);
              }
            }
          }
        }

        analyzed++;
      } catch (e: any) {
        addLog('error', `✗ Analysis failed for ${log.contact_name || log.phone}: ${e.message}`);
      }
    }
    return analyzed;
  }, [campaignId, addLog]);

  // Health check: detect stuck items, stalled campaigns, orphaned calls + AI analysis
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
      const stuckCount = stuckItemsList.length;

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
      const stalled = isRunning && dialingCount === 0 && pendingCount > 0;
      const completed = isRunning && dialingCount === 0 && pendingCount === 0;

      // 3) Check for recent call log errors (last 5 min)
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const errQuery: any = supabase
        .from('powerdial_call_logs')
        .select('id, phone, last_status')
        .eq('campaign_id', campaignId);
      const { data: recentErrors } = await errQuery.eq('last_status', 'failed').gte('created_at', fiveMinAgo);
      const errorCount = recentErrors?.length || 0;

      // Log findings
      if (stuckCount > 0) addLog('warn', `⚠ ${stuckCount} item(s) stuck in "dialing" for 3+ min`);
      if (errorCount > 0) addLog('warn', `⚠ ${errorCount} call failure(s) in last 5 min`);
      if (stalled) addLog('warn', `⚠ Campaign stalled — running but nothing dialing with ${pendingCount} pending`);
      if (completed) addLog('info', `✓ All queue items processed — campaign may auto-complete`);

      // AUTO-FIX: unstick dialing items
      if (autoFix && stuckCount > 0) {
        addLog('fix', `🔧 Auto-fixing ${stuckCount} stuck item(s) → resetting to pending`);
        for (const item of stuckItemsList) {
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

      // 4) AI transcript analysis for human calls
      const aiAnalyzed = await analyzeTranscripts();

      const newHealth: QueueHealth = {
        stuck_dialing: stuckCount,
        orphaned_calls: errorCount,
        campaign_stalled: stalled,
        ai_analyzed: aiAnalyzed || 0,
      };
      setHealth(newHealth);

      if (stuckCount === 0 && errorCount === 0 && !stalled) {
        addLog('info', `✓ Health check passed — pipeline healthy${aiAnalyzed ? ` · ${aiAnalyzed} transcript(s) analyzed` : ''}`);
      }
    } catch (err: any) {
      addLog('error', `✗ Health check failed: ${err.message}`);
    } finally {
      setChecking(false);
    }
  }, [campaignId, campaignStatus, checking, autoFix, addLog, analyzeTranscripts]);

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
          addLog('info', `☎ Human detected: ${item.contact_name || item.phone} — will analyze transcript shortly`);
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
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 h-11 text-xs font-mono hover:bg-muted/30 transition-colors rounded-t-lg"
      >
        <StatusIcon className={cn('h-3.5 w-3.5', checking && 'animate-spin', statusColor)} />
        <span className="font-semibold text-foreground/80">Pipeline Monitor</span>
        <span className="text-muted-foreground/60">—</span>
        <span className="text-muted-foreground/60 truncate">
          {campaignStatus === 'running' ? 'live · auto-polling 30s · AI analysis' : campaignStatus}
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
          <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400 px-1.5 py-0">
            <Brain className="h-2.5 w-2.5 mr-0.5" /> AI
          </Badge>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20">
            <Button size="sm" variant="ghost" onClick={runHealthCheck} disabled={checking} className="h-7 text-xs">
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
              onClick={() => analyzeTranscripts().then(n => n && toast.info(`Analyzed ${n} transcript(s)`))}
              disabled={checking}
              className="h-7 text-xs"
            >
              <Brain className="h-3 w-3 mr-1" /> Analyze Now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLogs([])} className="h-7 text-xs ml-auto">
              <Trash2 className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 py-2">
            <HealthCard label="Stuck Calls" value={health.stuck_dialing} ok={health.stuck_dialing === 0} />
            <HealthCard label="Recent Failures" value={health.orphaned_calls} ok={health.orphaned_calls === 0} />
            <HealthCard label="Pipeline" value={health.campaign_stalled ? 'STALLED' : 'OK'} ok={!health.campaign_stalled} />
            <HealthCard label="Auto-Fix" value={autoFix ? 'ACTIVE' : 'OFF'} ok={autoFix} />
            <HealthCard label="AI Analyzed" value={health.ai_analyzed} ok={true} icon="brain" />
          </div>

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
                log.level === 'ai' && 'text-blue-400',
              )}>
                <span className="text-muted-foreground/40 mr-2">
                  {log.ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {log.level === 'fix' && <Wrench className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.level === 'error' && <XCircle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.level === 'warn' && <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.level === 'info' && <CheckCircle2 className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.level === 'ai' && <Brain className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthCard({ label, value, ok, icon }: { label: string; value: number | string; ok: boolean; icon?: string }) {
  return (
    <div className={cn(
      'rounded-md px-3 py-1.5 text-center border',
      ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/10',
      icon === 'brain' && 'border-blue-500/20 bg-blue-500/5',
    )}>
      <p className={cn('text-sm font-bold', ok ? (icon === 'brain' ? 'text-blue-400' : 'text-emerald-400') : 'text-amber-400')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
