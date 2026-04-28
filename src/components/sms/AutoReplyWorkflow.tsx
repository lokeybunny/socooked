import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, Save, RefreshCw, ArrowRight, ArrowLeft, Phone, Zap } from 'lucide-react';

type Config = {
  enabled: boolean;
  forward_enabled: boolean;
  include_quoted: boolean;
  prefix: string;
  forward_to_cell: string;
};

type Comm = {
  id: string;
  provider: string;
  direction: string;
  from_address: string | null;
  to_address: string | null;
  body: string;
  status: string;
  created_at: string;
  metadata: any;
};

const DEFAULTS: Config = {
  enabled: true,
  forward_enabled: true,
  include_quoted: true,
  prefix: "Hey, just got your message on my line ending in 8105. This is my cell — that's a landline. I'll follow back in a moment.",
  forward_to_cell: '+14244658105',
};

export default function AutoReplyWorkflow() {
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState<Comm[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [simFrom, setSimFrom] = useState('+13235551234');
  const [simBody, setSimBody] = useState('Hey Warren just got your voicemail!');
  const [simResult, setSimResult] = useState<{
    autoReply: { to: string; body: string } | null;
    forward: { to: string; body: string } | null;
    error?: string;
  } | null>(null);

  const loadCfg = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'sms_auto_reply').maybeSingle();
    if (data?.value) setCfg({ ...DEFAULTS, ...(data.value as any) });
    setLoading(false);
  };

  const loadActivity = async () => {
    const { data } = await supabase
      .from('communications')
      .select('id, provider, direction, from_address, to_address, body, status, created_at, metadata')
      .eq('type', 'sms')
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(60);
    setActivity((data as Comm[]) || []);
  };

  useEffect(() => {
    loadCfg();
    loadActivity();
    const ch = supabase
      .channel('sms-auto-reply-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications' }, () => loadActivity())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'sms_auto_reply', value: cfg as any }, { onConflict: 'key' });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Auto-reply settings saved');
  };

  const previewReply = () => {
    const sample = 'Hey Warren just got your voicemail!';
    if (!cfg.include_quoted) return cfg.prefix;
    return `${cfg.prefix}\n\nYou wrote:\n"${sample}"`;
  };

  const buildAutoReplyBody = (inbound: string) => {
    const trimmed = (inbound || '').trim();
    if (!trimmed || !cfg.include_quoted) return cfg.prefix;
    const MAX = 600;
    const quoted = trimmed.length > MAX ? `${trimmed.slice(0, MAX).trim()}…` : trimmed;
    return `${cfg.prefix}\n\nYou wrote:\n"${quoted}"`;
  };

  const simulateInbound = async () => {
    if (!simFrom.trim() || !simBody.trim()) {
      toast.error('Need a from-number and body to simulate');
      return;
    }
    setSimulating(true);
    setSimResult(null);

    const twilioNumber = '+17028298105';
    const expectedAutoReply = cfg.enabled
      ? { to: simFrom.trim(), body: buildAutoReplyBody(simBody) }
      : null;
    const expectedForward = cfg.forward_enabled
      ? {
          to: cfg.forward_to_cell,
          body: `[Twilio ${twilioNumber}] From ${simFrom.trim()}:\n${simBody}`,
        }
      : null;

    try {
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/twilio-sms-inbound`;
      const form = new URLSearchParams();
      form.set('From', simFrom.trim());
      form.set('To', twilioNumber);
      form.set('Body', simBody);
      form.set('MessageSid', `SIM-${Date.now()}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const text = await res.text();
      if (!res.ok) {
        setSimResult({ autoReply: expectedAutoReply, forward: expectedForward, error: `Webhook ${res.status}: ${text.slice(0, 200)}` });
        toast.error(`Webhook returned ${res.status}`);
      } else {
        setSimResult({ autoReply: expectedAutoReply, forward: expectedForward });
        toast.success('Simulation fired — check activity feed for live status');
        setTimeout(loadActivity, 1500);
      }
    } catch (e: any) {
      setSimResult({ autoReply: expectedAutoReply, forward: expectedForward, error: e?.message || 'Network error' });
      toast.error(e?.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  // Group activity into inbound→reply pairs
  const renderActivity = () => {
    if (activity.length === 0) {
      return <p className="text-xs text-muted-foreground text-center py-8">No SMS activity in the last 24 hours.</p>;
    }
    return (
      <div className="space-y-2">
        {activity.map((c) => {
          const isInbound = c.direction === 'inbound';
          const isAutoReply = c.metadata?.source === 'twilio-auto-reply-voidfix';
          const isForward = c.provider === 'voidfix' && typeof c.body === 'string' && c.body.startsWith('[Twilio ');
          let label = '';
          let color = '';
          let Icon = ArrowRight;
          if (isInbound) {
            label = 'Inbound (Twilio)';
            color = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
            Icon = ArrowLeft;
          } else if (isAutoReply) {
            label = 'Auto-Reply → Sender (VoidFix)';
            color = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
          } else if (isForward) {
            label = 'Forward → Cell (VoidFix)';
            color = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
          } else {
            label = `${c.direction} ${c.provider}`;
            color = 'bg-muted text-muted-foreground border-border';
          }
          return (
            <div key={c.id} className="border border-border/60 rounded-lg p-3 bg-card/40">
              <div className="flex items-center justify-between gap-2 mb-1">
                <Badge variant="outline" className={`text-[10px] ${color}`}>
                  <Icon className="h-3 w-3 mr-1" />{label}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mb-1">
                {c.from_address || '?'} → {c.to_address || '?'} · <span className="text-foreground/70">{c.status}</span>
              </div>
              <pre className="text-xs text-foreground/90 whitespace-pre-wrap font-sans line-clamp-4">{c.body}</pre>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Settings */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Phone className="h-4 w-4 text-emerald-400" /> Auto-Reply Workflow
          </h3>
          <Badge variant="outline" className={cfg.enabled ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300'}>
            {cfg.enabled ? 'Active' : 'Paused'}
          </Badge>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          When someone texts your Twilio number (e.g. <span className="text-foreground/80">+1 702-829-8105</span>),
          your VoidFix cell automatically replies to the sender with the canned message + a quote of what they wrote,
          and forwards a copy of their message to your personal cell so you see the conversation.
        </p>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
          <div>
            <Label className="text-xs">Auto-Reply Enabled</Label>
            <p className="text-[10px] text-muted-foreground">Send the canned reply from VoidFix to the sender</p>
          </div>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
          <div>
            <Label className="text-xs">Forward to Cell Enabled</Label>
            <p className="text-[10px] text-muted-foreground">Mirror inbound texts to your personal cell</p>
          </div>
          <Switch checked={cfg.forward_enabled} onCheckedChange={(v) => setCfg({ ...cfg, forward_enabled: v })} />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
          <div>
            <Label className="text-xs">Quote Sender's Message</Label>
            <p className="text-[10px] text-muted-foreground">Append the original text to the auto-reply</p>
          </div>
          <Switch checked={cfg.include_quoted} onCheckedChange={(v) => setCfg({ ...cfg, include_quoted: v })} />
        </div>

        <div>
          <Label className="text-xs">Auto-Reply Prefix</Label>
          <Textarea
            rows={3}
            value={cfg.prefix}
            onChange={(e) => setCfg({ ...cfg, prefix: e.target.value })}
            className="text-xs"
          />
        </div>

        <div>
          <Label className="text-xs">Forward-to Cell Number (E.164)</Label>
          <Input
            value={cfg.forward_to_cell}
            onChange={(e) => setCfg({ ...cfg, forward_to_cell: e.target.value })}
            placeholder="+14244658105"
            className="text-xs"
          />
        </div>

        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <Label className="text-[10px] text-emerald-400 uppercase tracking-wider">Live Preview</Label>
          <pre className="text-xs text-foreground/90 whitespace-pre-wrap font-sans mt-1">{previewReply()}</pre>
        </div>

        <Button onClick={save} disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-600">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>

        {/* Simulate Inbound */}
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            <Label className="text-[11px] text-purple-300 uppercase tracking-wider">Simulate Inbound SMS</Label>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Fires a real webhook hit to <code>twilio-sms-inbound</code> as if a person texted +1 702-829-8105.
            Runs the full workflow (auto-reply + cell forward) and shows the exact outgoing messages.
          </p>
          <div className="grid gap-2">
            <Input
              value={simFrom}
              onChange={(e) => setSimFrom(e.target.value)}
              placeholder="From (test number, E.164)"
              className="text-xs"
            />
            <Textarea
              rows={2}
              value={simBody}
              onChange={(e) => setSimBody(e.target.value)}
              placeholder="Inbound message body"
              className="text-xs"
            />
          </div>
          <Button
            onClick={simulateInbound}
            disabled={simulating}
            size="sm"
            className="w-full bg-purple-500 hover:bg-purple-600"
          >
            {simulating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            Run Simulation
          </Button>

          {simResult && (
            <div className="space-y-2 pt-2">
              {simResult.error && (
                <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">
                  {simResult.error}
                </div>
              )}
              {simResult.autoReply ? (
                <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
                  <div className="text-[10px] text-emerald-400 uppercase mb-1">
                    1. Auto-Reply (VoidFix → {simResult.autoReply.to})
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap font-sans text-foreground/90">
                    {simResult.autoReply.body}
                  </pre>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground italic">Auto-reply disabled — no message sent to sender.</div>
              )}
              {simResult.forward ? (
                <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                  <div className="text-[10px] text-amber-400 uppercase mb-1">
                    2. Forward to Cell (VoidFix → {simResult.forward.to})
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap font-sans text-foreground/90">
                    {simResult.forward.body}
                  </pre>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground italic">Forwarding disabled — no copy sent to your cell.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Activity */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Live Activity (last 24h)</h3>
          <Button size="sm" variant="ghost" onClick={loadActivity} className="h-7 text-[11px]">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
        <ScrollArea className="h-[600px] pr-3">{renderActivity()}</ScrollArea>
      </div>
    </div>
  );
}
