import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Save, MessageSquare, Sparkles } from 'lucide-react';

type Config = {
  enabled: boolean;
  message: string;
};

const DEFAULT_MESSAGE =
  'Currently in a meeting, Talk with you soon. In mean while check my work on IG: https://instagram.com/W4RR3Nguru';

const DEFAULTS: Config = {
  enabled: true,
  message: DEFAULT_MESSAGE,
};

export default function VoidFixFirstReplySettings() {
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'voidfix_first_reply')
      .maybeSingle();
    if (data?.value) setCfg({ ...DEFAULTS, ...(data.value as any) });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'voidfix_first_reply', value: cfg as any }, { onConflict: 'key' });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('First-time auto-reply saved');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              First-Time Texter Auto-Reply
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Sent automatically the <strong>first time</strong> a new number texts your VoidFix line. Only fires once per phone number.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
            <Badge variant={cfg.enabled ? 'default' : 'outline'} className="text-[10px]">
              {cfg.enabled ? 'Active' : 'Off'}
            </Badge>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Auto-reply message</Label>
          <Textarea
            value={cfg.message}
            onChange={(e) => setCfg({ ...cfg, message: e.target.value })}
            rows={5}
            placeholder={DEFAULT_MESSAGE}
            className="font-mono text-xs"
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{cfg.message.length} chars · ~{Math.ceil(cfg.message.length / 160)} SMS segment(s)</span>
            <button
              type="button"
              onClick={() => setCfg({ ...cfg, message: DEFAULT_MESSAGE })}
              className="underline hover:text-foreground"
            >
              Reset to default
            </button>
          </div>
        </div>

        <div className="rounded border border-border bg-muted/30 p-3">
          <div className="text-[10px] uppercase text-muted-foreground mb-1 flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> Preview
          </div>
          <pre className="whitespace-pre-wrap font-sans text-xs text-foreground/90">
            {cfg.message || <span className="italic text-muted-foreground">No message set.</span>}
          </pre>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
