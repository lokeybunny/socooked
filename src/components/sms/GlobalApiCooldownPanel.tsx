import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, Smartphone, Snowflake, CheckCircle2 } from 'lucide-react';

const IMESSAGE_CAP = 50;
const SMS_CAP = 50;

function msUntilUtcMidnight() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return next.getTime() - now.getTime();
}
function fmt(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${h}h ${m}m`;
}
function localReset() {
  const now = new Date();
  const utcMid = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(utcMid);
  } catch { return utcMid.toLocaleTimeString(); }
}

export default function GlobalApiCooldownPanel() {
  const [imessage, setImessage] = useState(0);
  const [sms, setSms] = useState(0);
  const [countdown, setCountdown] = useState(fmt(msUntilUtcMidnight()));

  const todayUTC = () => new Date().toISOString().slice(0, 10);

  const load = async () => {
    // Source of truth: actual sent targets today (UTC).
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);
    const sinceIso = startOfDayUtc.toISOString();

    // Auto-reply sources that route through the VoidFix Android SMS API
    // (powerdial-sms → sms.voidfix.com). These count toward the SMS bucket.
    const SMS_AUTO_SOURCES = [
      'powerdial-dropped-call-sms',
      'powerdial-voicemail-drop-sms',
      'vapi-hangup-auto-reply',
      'vapi-auto-reply',
      'voidfix-first-time-auto-reply',
      'twilio-auto-reply-voidfix',
    ];

    const [imRes, smsRes, autoSmsRes] = await Promise.all([
      supabase.from('warm_welcome_targets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent').eq('channel', 'imessage').gte('sent_at', sinceIso),
      supabase.from('warm_welcome_targets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent').eq('channel', 'sms').gte('sent_at', sinceIso),
      supabase.from('communications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'sms')
        .eq('direction', 'outbound')
        .gte('created_at', sinceIso)
        .in('metadata->>source', SMS_AUTO_SOURCES),
    ]);
    setImessage(imRes.count || 0);
    setSms((smsRes.count || 0) + (autoSmsRes.count || 0));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('global-api-cooldown')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warm_welcome_targets' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warm_welcome_campaigns' }, () => load())
      .subscribe();
    const t = setInterval(load, 30_000);
    const c = setInterval(() => setCountdown(fmt(msUntilUtcMidnight())), 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); clearInterval(c); };
  }, []);

  const imessageCool = imessage >= IMESSAGE_CAP;
  const smsCool = sms >= SMS_CAP;
  const anyCool = imessageCool || smsCool;

  const Row = ({
    icon: Icon, label, sent, cap, cooling,
  }: { icon: any; label: string; sent: number; cap: number; cooling: boolean }) => {
    const pct = Math.min(100, Math.round((sent / cap) * 100));
    return (
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg border ${cooling ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">{label}</div>
            <div className="text-xs tabular-nums">
              <span className={cooling ? 'text-red-400 font-semibold' : 'text-foreground'}>{sent}</span>
              <span className="text-muted-foreground">/{cap} new today</span>
            </div>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${cooling ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            {cooling ? (
              <>
                <Snowflake className="h-3 w-3 text-red-400" />
                <span className="text-red-400 font-medium">In cooldown</span>
                <span className="text-muted-foreground">· resumes in {countdown} ({localReset()})</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span className="text-muted-foreground">Active · {cap - sent} slots left · resets in {countdown}</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={anyCool ? 'border-red-500/30' : ''}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Snowflake className={`h-4 w-4 ${anyCool ? 'text-red-400' : 'text-muted-foreground'}`} />
            <h3 className="text-sm font-semibold">VoidFix API Cooldown</h3>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Global cap: 50 NEW contacts/day per API (across all campaigns)
          </div>
        </div>
        <Row icon={MessageCircle} label="iMessage API" sent={imessage} cap={IMESSAGE_CAP} cooling={imessageCool} />
        <Row icon={Smartphone} label="Android SMS API" sent={sms} cap={SMS_CAP} cooling={smsCool} />
      </CardContent>
    </Card>
  );
}
