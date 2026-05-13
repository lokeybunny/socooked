import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, Smartphone } from 'lucide-react';

const IMESSAGE_CAP = 50;
const SMS_CAP = 50;

type Row = {
  id: string;
  status: string;
  imessage_new_sent_today: number;
  sms_sent_today: number;
  counters_day: string;
};

export default function WarmWelcomeBucketCounter() {
  const [imessage, setImessage] = useState(0);
  const [sms, setSms] = useState(0);

  const todayUTC = () => new Date().toISOString().slice(0, 10);

  const load = async () => {
    const { data } = await supabase
      .from('warm_welcome_campaigns')
      .select('id, status, imessage_new_sent_today, sms_sent_today, counters_day')
      .in('status', ['running', 'cooldown'])
      .eq('counters_day', todayUTC());
    const rows = (data as Row[] | null) || [];
    setImessage(rows.reduce((s, r) => s + (r.imessage_new_sent_today || 0), 0));
    setSms(rows.reduce((s, r) => s + (r.sms_sent_today || 0), 0));
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('ww-bucket-counter')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warm_welcome_campaigns' },
        () => load(),
      )
      .subscribe();
    const t = setInterval(load, 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
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
    <div className="flex items-center gap-2">
      <Pill icon={MessageCircle} label="iMessage API" sent={imessage} cap={IMESSAGE_CAP} tone="blue" />
      <Pill icon={Smartphone} label="Android SMS API" sent={sms} cap={SMS_CAP} tone="emerald" />
    </div>
  );
}
