import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Zap, Copy, CheckCircle2, AlertCircle, MessageSquare, History } from 'lucide-react';
import { format } from 'date-fns';

interface AutoShillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileUsername: string;
}

interface ShillConfig {
  enabled: boolean;
  reply_template: string;
  boost_preset_ids: string[];
}

interface BoostPreset {
  id: string;
  preset_name: string;
  services: any[];
}

interface ShillLogEntry {
  id: string;
  action: string;
  meta: any;
  created_at: string;
}

const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smm-auto-shill`;
const headers = {
  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'Content-Type': 'application/json',
};

export default function AutoShillModal({ open, onOpenChange, profileUsername }: AutoShillModalProps) {
  const [config, setConfig] = useState<ShillConfig>({ enabled: false, reply_template: '', boost_preset_ids: [] });
  const [presets, setPresets] = useState<BoostPreset[]>([]);
  const [log, setLog] = useState<ShillLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'config' | 'log'>('config');
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${FUNC_URL}?action=ingest`;

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    Promise.all([
      fetch(`${FUNC_URL}?action=get-config&profile=${profileUsername}`, { headers }).then(r => r.json()),
      supabase.from('smm_boost_presets').select('*').eq('profile_username', profileUsername),
      fetch(`${FUNC_URL}?action=log&profile=${profileUsername}`, { headers }).then(r => r.json()),
    ]).then(([configRes, presetsRes, logRes]) => {
      if (configRes?.config) setConfig(configRes.config);
      if (presetsRes.data) setPresets(presetsRes.data as any);
      if (logRes?.log) setLog(logRes.log);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open, profileUsername]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${FUNC_URL}?action=save-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ profile_username: profileUsername, ...config }),
      });
      toast.success('Auto-shill config saved');
    } catch {
      toast.error('Failed to save config');
    }
    setSaving(false);
  };

  const togglePreset = (id: string) => {
    setConfig(prev => ({
      ...prev,
      boost_preset_ids: prev.boost_preset_ids.includes(id)
        ? prev.boost_preset_ids.filter(p => p !== id)
        : [...prev.boost_preset_ids, id],
    }));
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('Webhook URL copied');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Auto Shill</DialogTitle></DialogHeader>
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Auto Shill — {profileUsername}
          </DialogTitle>
        </DialogHeader>

        {/* Tab toggle */}
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button
            className={`flex-1 text-xs py-1.5 rounded transition-colors ${tab === 'config' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setTab('config')}
          >
            Config
          </button>
          <button
            className={`flex-1 text-xs py-1.5 rounded transition-colors ${tab === 'log' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setTab('log')}
          >
            Log ({log.length})
          </button>
        </div>

        {tab === 'config' ? (
          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Enable Auto Shill</Label>
              <Switch checked={config.enabled} onCheckedChange={(v) => setConfig(prev => ({ ...prev, enabled: v }))} />
            </div>

            {/* Webhook URL */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Discord Bot Webhook URL</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-[10px] bg-muted rounded px-2 py-1.5 break-all text-muted-foreground border border-border">
                  {webhookUrl}
                </code>
                <Button variant="outline" size="sm" onClick={copyWebhook} className="shrink-0">
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                POST <code className="text-primary">{'{"tweet_url":"https://x.com/...", "profile_username":"' + profileUsername + '"}'}</code>
                {' '}with header <code className="text-primary">x-bot-secret</code>
              </p>
            </div>

            {/* Reply template */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reply Template</Label>
              <Textarea
                value={config.reply_template}
                onChange={(e) => setConfig(prev => ({ ...prev, reply_template: e.target.value }))}
                placeholder="Type your shill reply here... Use {tweet_url} to insert the tweet link."
                className="min-h-[80px] text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Variables: <code className="text-primary">{'{tweet_url}'}</code>, <code className="text-primary">{'{timestamp}'}</code>
              </p>
            </div>

            {/* Boost presets */}
            <div className="space-y-1.5">
              <Label className="text-xs">Auto-Boost Presets</Label>
              {presets.length === 0 ? (
                <p className="text-xs text-muted-foreground">No boost presets configured for this profile.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {presets.map(p => (
                    <Badge
                      key={p.id}
                      variant={config.boost_preset_ids.includes(p.id) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
                      onClick={() => togglePreset(p.id)}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      {p.preset_name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            {log.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No shill activity yet.</p>
            ) : (
              <div className="space-y-2">
                {log.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 p-2 rounded border border-border bg-muted/30 text-xs">
                    {entry.action === 'shilled' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-mono truncate text-foreground">{entry.meta?.tweet_url || 'Unknown'}</p>
                      <p className="text-muted-foreground">
                        {format(new Date(entry.created_at), 'MMM d, h:mm a')} · {entry.meta?.profile || ''}
                      </p>
                      {entry.action === 'failed' && (
                        <p className="text-destructive mt-0.5">{entry.meta?.error?.substring(0, 100)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}

        <DialogFooter>
          {tab === 'config' && (
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? 'Saving...' : 'Save Config'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
