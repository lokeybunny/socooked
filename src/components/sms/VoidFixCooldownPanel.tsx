import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Snowflake, MessageCircle, Smartphone, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';

const SETTING_KEY = 'voidfix_manual_cooldown';
const HOURS = 24;

type State = { sms_until: string | null; imessage_until: string | null };

function fmtRemaining(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return `${h}h ${m}m`;
}

export default function VoidFixCooldownPanel() {
  const [state, setState] = useState<State>({ sms_until: null, imessage_until: null });
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SETTING_KEY)
      .maybeSingle();
    const v = (data?.value || {}) as Partial<State>;
    setState({ sms_until: v.sms_until || null, imessage_until: v.imessage_until || null });
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('voidfix-manual-cooldown')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${SETTING_KEY}` }, () => load())
      .subscribe();
    const t = setInterval(() => setTick(x => x + 1), 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  const save = async (next: State) => {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: SETTING_KEY, value: next as any, updated_at: new Date().toISOString() });
    if (error) throw error;
    setState(next);
  };

  const pause = async (channel: 'sms' | 'imessage') => {
    setBusy(channel);
    try {
      const until = new Date(Date.now() + HOURS * 3600_000).toISOString();
      const next: State = { ...state, [channel === 'sms' ? 'sms_until' : 'imessage_until']: until };
      await save(next);
      toast.success(`${channel === 'sms' ? 'Android SMS' : 'iMessage'} API paused for ${HOURS}h`);
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setBusy(null); }
  };

  const resume = async (channel: 'sms' | 'imessage') => {
    setBusy(channel);
    try {
      const next: State = { ...state, [channel === 'sms' ? 'sms_until' : 'imessage_until']: null };
      await save(next);
      toast.success(`${channel === 'sms' ? 'Android SMS' : 'iMessage'} API resumed`);
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setBusy(null); }
  };

  const Row = ({
    icon: Icon, label, channel, until,
  }: { icon: any; label: string; channel: 'sms' | 'imessage'; until: string | null }) => {
    const remaining = fmtRemaining(until);
    const paused = !!remaining;
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
        <div className={`p-2 rounded-lg border ${paused ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground">
            {paused ? (
              <span className="text-red-400">Paused · auto-resumes in {remaining}</span>
            ) : (
              <span>Active · sending normally</span>
            )}
          </div>
        </div>
        {paused ? (
          <Button size="sm" variant="outline" disabled={busy === channel} onClick={() => resume(channel)}>
            <Play className="h-3.5 w-3.5 mr-1" /> Resume now
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy === channel} onClick={() => pause(channel)} className="border-red-500/40 text-red-400 hover:bg-red-500/10">
            <Pause className="h-3.5 w-3.5 mr-1" /> Pause 24h
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Snowflake className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">VoidFix Manual Cool Down</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pause one channel for 24 hours when it's flagged for spam. The other channel keeps sending — warm-welcomes, auto-replies, blasts, and direct sends all respect this.
        </p>
        <Row icon={Smartphone} label="VoidFix Android SMS API" channel="sms" until={state.sms_until} />
        <Row icon={MessageCircle} label="VoidFix iMessage API" channel="imessage" until={state.imessage_until} />
      </CardContent>
    </Card>
  );
}
