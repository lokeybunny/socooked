// Warm Welcome Campaign panel — sits on the Hot Replies page.
// Audits each contact's device, then sends a personalized AI iMessage
// (iPhone) or SMS (Android / fallback) with daily caps + 24h cooldown.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Heart, Play, Square, RefreshCw, MessageSquare, Smartphone, Loader2, AlertTriangle, CheckCircle2, FlaskConical, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";

type WWContact = {
  hot_reply_id?: string;
  phone: string;
  name?: string | null;
  reply_text?: string | null;
  reply_at?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  cooldown_until: string | null;
  imessage_new_sent_today: number;
  sms_sent_today: number;
  counters_day: string;
  total_targets: number;
  total_sent: number;
  total_failed: number;
  total_skipped: number;
  last_processed_at: string | null;
  created_at: string;
};

type LogRow = {
  id: string;
  level: string;
  message: string;
  created_at: string;
  meta?: any;
};

type TargetRow = {
  id: string;
  name: string | null;
  phone_e164: string;
  device_type: string | null;
  channel: string | null;
  status: string;
  sent_at: string | null;
  error: string | null;
};

function safeErr(e: any, fb = 'Error') {
  if (!e) return fb;
  if (typeof e === 'string') return e;
  if (typeof e?.message === 'string') return e.message;
  try { return JSON.stringify(e); } catch { return fb; }
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  running: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  cooldown: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  stopped: 'bg-red-500/15 text-red-400 border-red-500/30',
  done: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export default function WarmWelcomeCampaignPanel({ contacts }: { contacts: WWContact[] }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [testPhone1, setTestPhone1] = useState('+13235593526');
  const [testPhone2, setTestPhone2] = useState('+17028298105');
  const [testBusy, setTestBusy] = useState(false);
  const channelRef = useRef<any>(null);

  const loadLatest = async () => {
    const { data } = await supabase
      .from('warm_welcome_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    const c = (data?.[0] as Campaign) || null;
    setCampaign(c);
    if (c) await loadDetails(c.id);
  };

  const loadDetails = async (campaignId: string) => {
    const [{ data: lg }, { data: tg }] = await Promise.all([
      supabase.from('warm_welcome_logs').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(50),
      supabase.from('warm_welcome_targets').select('id,name,phone_e164,device_type,channel,status,sent_at,error').eq('campaign_id', campaignId).order('created_at', { ascending: true }).limit(200),
    ]);
    setLogs((lg as LogRow[]) || []);
    setTargets((tg as TargetRow[]) || []);
  };

  useEffect(() => {
    loadLatest();
    const ch = supabase
      .channel('warm-welcome-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warm_welcome_campaigns' }, () => loadLatest())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warm_welcome_logs' }, (p: any) => {
        if (campaign && p.new?.campaign_id === campaign.id) {
          setLogs((prev) => [p.new as LogRow, ...prev].slice(0, 50));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warm_welcome_targets' }, () => {
        if (campaign) loadDetails(campaign.id);
      })
      .subscribe();
    channelRef.current = ch;
    return () => { try { supabase.removeChannel(ch); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCampaign = async () => {
    if (!contacts || contacts.length === 0) {
      toast.error('No contacts in the current filter — adjust filters first');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('warm-welcome-campaign', {
        body: { action: 'start', contacts },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Campaign started — ${(data as any).queued} contacts queued`);
      await loadLatest();
    } catch (e: any) {
      toast.error(safeErr(e, 'Start failed'));
    } finally { setBusy(false); }
  };

  const stopCampaign = async () => {
    if (!campaign) return;
    setBusy(true);
    try {
      await supabase.functions.invoke('warm-welcome-campaign', { body: { action: 'stop', campaign_id: campaign.id } });
      toast.success('Campaign stopped');
      await loadLatest();
    } catch (e: any) { toast.error(safeErr(e, 'Stop failed')); }
    finally { setBusy(false); }
  };

  const resumeCampaign = async () => {
    if (!campaign) return;
    setBusy(true);
    try {
      await supabase.functions.invoke('warm-welcome-campaign', { body: { action: 'resume', campaign_id: campaign.id } });
      toast.success('Campaign resumed');
      await loadLatest();
    } catch (e: any) { toast.error(safeErr(e, 'Resume failed')); }
    finally { setBusy(false); }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      await supabase.functions.invoke('warm-welcome-runner', { body: campaign ? { campaign_id: campaign.id } : {} });
      toast.success('Runner triggered');
      await loadLatest();
    } catch (e: any) { toast.error(safeErr(e, 'Runner failed')); }
    finally { setBusy(false); }
  };

  const runTest = async () => {
    const nums = [testPhone1, testPhone2]
      .map((s) => s.trim())
      .filter((s) => s.replace(/\D/g, '').length >= 10);
    if (nums.length === 0) { toast.error('Enter at least 1 valid phone number'); return; }
    if (nums.length > 2) { toast.error('Max 2 test numbers'); return; }
    setTestBusy(true);
    try {
      const testContacts = nums.map((p) => ({ phone: p, name: 'Test Recipient' }));
      const { data, error } = await supabase.functions.invoke('warm-welcome-campaign', {
        body: { action: 'start', test: true, contacts: testContacts },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Test campaign started — ${(data as any).queued} number(s) queued`);
      setTestPhone1(''); setTestPhone2('');
      await loadLatest();
    } catch (e: any) { toast.error(safeErr(e, 'Test failed')); }
    finally { setTestBusy(false); }
  };

  const isRunning = campaign?.status === 'running';
  const isCooldown = campaign?.status === 'cooldown';
  const cooldownLabel = useMemo(() => {
    if (!campaign?.cooldown_until) return null;
    try {
      const d = new Date(campaign.cooldown_until);
      const ms = d.getTime() - Date.now();
      if (ms <= 0) return 'expired';
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return `${h}h ${m}m`;
    } catch { return null; }
  }, [campaign?.cooldown_until]);

  const sentCount = targets.filter(t => t.status === 'sent').length;
  const failedCount = targets.filter(t => t.status === 'failed').length;
  const pendingCount = targets.filter(t => ['pending','auditing','audited','sending'].includes(t.status)).length;

  return (
    <Card className="border-2 border-pink-500/40 bg-gradient-to-br from-pink-500/5 to-rose-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="h-4 w-4 text-pink-400" />
            Warm Welcome Campaign
            {campaign && (
              <Badge variant="outline" className={STATUS_COLORS[campaign.status] || ''}>
                {campaign.status.toUpperCase()}
              </Badge>
            )}
            {isCooldown && cooldownLabel && (
              <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                cooldown {cooldownLabel}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <Button size="sm" onClick={startCampaign} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run Campaign ({contacts.length})
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={stopCampaign} disabled={busy} className="border-red-500/40 text-red-400 hover:bg-red-500/10">
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            )}
            {(isCooldown || campaign?.status === 'stopped') && (
              <Button size="sm" variant="outline" onClick={resumeCampaign} disabled={busy} className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                <Play className="h-3.5 w-3.5" /> Resume Campaign
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={runNow} disabled={busy} title="Trigger runner once">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
          <Clock className="h-3 w-3 text-amber-400" />
          <span>
            Active <span className="text-amber-400 font-semibold">8 AM – 6 PM Pacific Time</span> only. Audits each lead's device → iMessage to iPhones, SMS to Androids.
            AI personalizes each message. Caps: <span className="text-emerald-400 font-semibold">50</span> new iMessage/day,{' '}
            <span className="text-emerald-400 font-semibold">50</span> SMS/day. Auto-cooldown 24h when capped.
          </span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Test Campaign */}
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
            <FlaskConical className="h-3.5 w-3.5" />
            Test Campaign
            <span className="text-[10px] font-normal text-muted-foreground">
              (1–2 numbers, bypasses 8AM-6PM PT gate & daily caps — fires immediately)
            </span>
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              placeholder="Test number 1 (e.g. 3235593526)"
              value={testPhone1}
              onChange={(e) => setTestPhone1(e.target.value)}
              className="h-8 text-xs"
              disabled={testBusy}
            />
            <Input
              placeholder="Test number 2 (optional)"
              value={testPhone2}
              onChange={(e) => setTestPhone2(e.target.value)}
              className="h-8 text-xs"
              disabled={testBusy}
            />
            <Button
              size="sm"
              onClick={runTest}
              disabled={testBusy}
              className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
            >
              {testBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
              Run Test
            </Button>
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <Stat label="Targets" value={campaign?.total_targets ?? 0} icon={<Smartphone className="h-3 w-3" />} />
          <Stat label="Sent" value={campaign?.total_sent ?? sentCount} accent="emerald" icon={<CheckCircle2 className="h-3 w-3" />} />
          <Stat label="Failed" value={campaign?.total_failed ?? failedCount} accent="red" icon={<AlertTriangle className="h-3 w-3" />} />
          <Stat label="iMsg new today" value={`${campaign?.imessage_new_sent_today ?? 0}/50`} accent="blue" />
          <Stat label="SMS today" value={`${campaign?.sms_sent_today ?? 0}/50`} accent="amber" />
        </div>

        {/* Logs + targets */}
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-background/30">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border flex items-center gap-2">
              <MessageSquare className="h-3 w-3" /> Activity Log
            </div>
            <ScrollArea className="h-[240px]">
              {logs.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground text-center">No activity yet</div>
              ) : (
                <div className="divide-y divide-border">
                  {logs.map((l) => (
                    <div key={l.id} className="px-3 py-1.5 text-[11px] flex items-start gap-2">
                      <span className={`uppercase font-semibold w-12 shrink-0 ${
                        l.level === 'success' ? 'text-emerald-400' :
                        l.level === 'error' ? 'text-red-400' :
                        l.level === 'warn' ? 'text-amber-400' : 'text-muted-foreground'
                      }`}>{l.level}</span>
                      <span className="text-muted-foreground w-20 shrink-0 font-mono">{format(new Date(l.created_at), 'HH:mm:ss')}</span>
                      <span className="flex-1 break-words">{l.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          <div className="rounded-lg border border-border bg-background/30">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border flex items-center justify-between">
              <span>Targets</span>
              <span className="text-[10px]">{pendingCount} pending · {sentCount} sent · {failedCount} failed</span>
            </div>
            <ScrollArea className="h-[240px]">
              {targets.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground text-center">No targets yet</div>
              ) : (
                <div className="divide-y divide-border">
                  {targets.map((t) => (
                    <div key={t.id} className="px-3 py-1.5 text-[11px] flex items-center gap-2">
                      <span className="flex-1 truncate">
                        <span className="font-medium">{t.name || '—'}</span>{' '}
                        <span className="text-muted-foreground font-mono">{t.phone_e164}</span>
                      </span>
                      {t.device_type && (
                        <Badge variant="outline" className="text-[9px]">{t.device_type}</Badge>
                      )}
                      {t.channel && (
                        <Badge variant="outline" className={`text-[9px] ${t.channel === 'imessage' ? 'border-blue-500/40 text-blue-400' : 'border-amber-500/40 text-amber-400'}`}>
                          {t.channel}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[9px] ${
                        t.status === 'sent' ? 'border-emerald-500/40 text-emerald-400' :
                        t.status === 'failed' ? 'border-red-500/40 text-red-400' :
                        'border-zinc-500/40 text-zinc-400'
                      }`}>{t.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon, accent }: { label: string; value: number | string; icon?: React.ReactNode; accent?: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400', red: 'text-red-400', blue: 'text-blue-400', amber: 'text-amber-400',
  };
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground tracking-wide">
        {icon}{label}
      </div>
      <div className={`text-base font-semibold ${accent ? colorMap[accent] : 'text-foreground'}`}>{value}</div>
    </div>
  );
}
