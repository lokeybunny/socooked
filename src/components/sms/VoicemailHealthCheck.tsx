import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { ShieldCheck, ShieldAlert, RefreshCw, Wrench, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

type MissingRow = {
  call_log_id: string;
  phone: string;
  campaign_id: string | null;
  customer_id: string | null;
  voicemail_dropped_at: string;
  age_minutes: number;
  sms_status: string | null;
  last_error?: string;
};

type HealthResponse = {
  healthy: boolean;
  lookbackHours: number;
  graceMinutes: number;
  checked_at: string;
  summary: { total: number; sent: number; sending: number; failed: number; missing: number };
  missing: MissingRow[];
  repairs: Array<{ call_log_id: string; ok: boolean; error?: string }>;
};

export default function VoicemailHealthCheck() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const run = async (repair = false) => {
    repair ? setRepairing(true) : setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('powerdial-vm-health', {
        body: { repair, lookbackHours: 24, graceMinutes: 2 },
      });
      if (error) throw error;
      setData(res as HealthResponse);
      if (repair) {
        const ok = (res as HealthResponse).repairs.filter((r) => r.ok).length;
        const fail = (res as HealthResponse).repairs.length - ok;
        toast.success(`Repair complete: ${ok} sent, ${fail} failed`);
      }
    } catch (e: any) {
      toast.error(`Health check failed: ${e.message ?? e}`);
    } finally {
      setLoading(false);
      setRepairing(false);
    }
  };

  useEffect(() => {
    run(false);
    const t = setInterval(() => run(false), 60_000); // auto refresh every 60s
    return () => clearInterval(t);
  }, []);

  const healthy = data?.healthy ?? true;
  const missingCount = data?.summary.missing ?? 0;

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {healthy ? (
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-500" />
          )}
          <div>
            <div className="font-semibold text-sm">VoidFix Follow-up Health Check</div>
            <div className="text-xs text-muted-foreground">
              Verifies every voicemail drop (last 24h) triggered a VoidFix SMS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => run(false)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => run(true)}
            disabled={repairing || missingCount === 0}
            className="bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
          >
            {repairing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wrench className="h-3.5 w-3.5 mr-1" />}
            Repair Missing ({missingCount})
          </Button>
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Total VM drops" value={data.summary.total} />
            <Stat label="SMS sent" value={data.summary.sent} tone="ok" />
            <Stat label="Sending" value={data.summary.sending} />
            <Stat label="Failed" value={data.summary.failed} tone={data.summary.failed > 0 ? 'warn' : undefined} />
            <Stat label="Missing" value={data.summary.missing} tone={data.summary.missing > 0 ? 'bad' : 'ok'} />
          </div>

          {!healthy && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {missingCount} voicemail drop{missingCount === 1 ? '' : 's'} {missingCount === 1 ? 'is' : 'are'} missing the VoidFix follow-up SMS. Click <strong>Repair Missing</strong> to resend.
            </div>
          )}

          {data.missing.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-2">Missing follow-ups</div>
              <ScrollArea className="h-40 rounded border">
                <div className="divide-y">
                  {data.missing.map((m) => (
                    <div key={m.call_log_id} className="p-2 text-xs flex items-center justify-between gap-2">
                      <div>
                        <div className="font-mono">{m.phone}</div>
                        <div className="text-muted-foreground">
                          dropped {format(new Date(m.voicemail_dropped_at), 'MMM d, h:mm a')} · {m.age_minutes}m ago
                        </div>
                        {m.last_error && <div className="text-red-500 mt-0.5">last error: {m.last_error}</div>}
                      </div>
                      <Badge variant="outline" className="text-amber-500 border-amber-500/40">
                        {m.sms_status ?? 'never sent'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {data.repairs.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Last repair: {data.repairs.filter((r) => r.ok).length} succeeded · {data.repairs.filter((r) => !r.ok).length} failed
            </div>
          )}

          <div className="text-[10px] text-muted-foreground">
            Last checked: {format(new Date(data.checked_at), 'MMM d, h:mm:ss a')} · auto-refresh 60s
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const color =
    tone === 'ok'
      ? 'text-emerald-500'
      : tone === 'warn'
      ? 'text-amber-500'
      : tone === 'bad'
      ? 'text-red-500'
      : 'text-foreground';
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
