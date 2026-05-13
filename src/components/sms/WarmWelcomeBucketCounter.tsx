import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, Smartphone, Clock } from 'lucide-react';

const IMESSAGE_CAP = 50;
const SMS_CAP = 50;

type Row = {
  id: string;
  status: string;
  imessage_new_sent_today: number;
  sms_sent_today: number;
  counters_day: string;
};

// Counters reset on UTC midnight (counters_day uses ISO UTC date)
function msUntilUtcMidnight() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return next.getTime() - now.getTime();
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${m}m`;
}

// Format the UTC midnight reset moment in the user's local timezone, e.g. "5:00 PM PST"
function formatLocalResetTime() {
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(utcMidnight);
  } catch {
    return utcMidnight.toLocaleTimeString();
  }
}

export default function WarmWelcomeBucketCounter() {
  const [imessage, setImessage] = useState(0);
  const [sms, setSms] = useState(0);
  const [countdown, setCountdown] = useState(formatCountdown(msUntilUtcMidnight()));

  const todayUTC = () => new Date().toISOString().slice(0, 10);

  const load = async () => {
    // Source of truth: count actual sent targets today (UTC), not the
    // per-campaign counter columns (which can drift / not include
    // campaigns that have already finished).
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);
    const sinceIso = startOfDayUtc.toISOString();

    const [imRes, smsRes] = await Promise.all([
      supabase
        .from('warm_welcome_targets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .eq('channel', 'imessage')
        .gte('sent_at', sinceIso),
      supabase
        .from('warm_welcome_targets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .eq('channel', 'sms')
        .gte('sent_at', sinceIso),
    ]);
    setImessage(imRes.count || 0);
    setSms(smsRes.count || 0);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('ww-bucket-counter')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warm_welcome_targets' },
        () => load(),
      )
      .subscribe();
    const t = setInterval(load, 30_000);
    const cd = setInterval(() => setCountdown(formatCountdown(msUntilUtcMidnight())), 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); clearInterval(cd); };
  }, []);

  const Pill = ({
    icon: Icon,
    label,
    sent,
    cap,
    tone,
  }: { icon: any; label: string; sent: number; cap: number; tone: 'blue' | 'emerald' }) => {
    const pct = Math.min(100, Math.round((sent / cap) * 100));
    const full = sent >= cap;
    const color = full
      ? 'bg-red-500/15 text-red-300 border-red-500/40'
      : tone === 'blue'
        ? 'bg-blue-500/15 text-blue-300 border-blue-500/40'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    return (
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${color}`}
        title={`${label} API — ${sent}/${cap} new contacts today (${pct}%)`}
      >
        <Icon className="h-3 w-3" />
        <span className="hidden sm:inline">{label}</span>
        <span className="font-semibold tabular-nums">{sent}/{cap}</span>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Pill icon={MessageCircle} label="iMessage API" sent={imessage} cap={IMESSAGE_CAP} tone="blue" />
      <Pill icon={Smartphone} label="Android SMS API" sent={sms} cap={SMS_CAP} tone="emerald" />
      <div
        className="flex items-center gap-1 px-2 py-1 rounded-full border border-border/60 bg-muted/40 text-[10px] text-muted-foreground"
        title={`Daily caps reset at 00:00 UTC (${formatLocalResetTime()} local). Resets in ${countdown}.`}
      >
        <Clock className="h-3 w-3" />
        <span className="tabular-nums">Resets in {countdown}</span>
        <span className="hidden md:inline opacity-70">· {formatLocalResetTime()}</span>
      </div>
    </div>
  );
}
