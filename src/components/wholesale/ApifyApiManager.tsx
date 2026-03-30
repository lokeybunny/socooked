import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Key, Plus, Trash2, ShieldBan, Loader2, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

interface ApifyKey {
  id: string;
  api_key: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

interface BlockedWorker {
  id: string;
  actor_shortcode: string;
  reason: string | null;
  blocked_at: string;
}

export default function ApifyApiManager() {
  const [keys, setKeys] = useState<ApifyKey[]>([]);
  const [blocked, setBlocked] = useState<BlockedWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newShortcode, setNewShortcode] = useState('');
  const [newReason, setNewReason] = useState('');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [keysRes, blockedRes] = await Promise.all([
      supabase.from('apify_config').select('*').order('created_at', { ascending: false }),
      supabase.from('apify_blocked_workers').select('*').order('blocked_at', { ascending: false }),
    ]);
    setKeys((keysRes.data as any[]) || []);
    setBlocked((blockedRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const addKey = async () => {
    if (!newKey.trim()) { toast.error('API key is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('apify_config').insert({
      api_key: newKey.trim(),
      label: newLabel.trim() || `Key ${keys.length + 1}`,
      is_active: true,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('API key added');
    setNewKey('');
    setNewLabel('');
    loadData();
  };

  const toggleKey = async (id: string, current: boolean) => {
    await supabase.from('apify_config').update({ is_active: !current } as any).eq('id', id);
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: !current } : k));
    toast.success(!current ? 'Key activated' : 'Key deactivated');
  };

  const deleteKey = async (id: string) => {
    await supabase.from('apify_config').delete().eq('id', id);
    setKeys(prev => prev.filter(k => k.id !== id));
    toast.success('Key removed');
  };

  const blockWorker = async () => {
    if (!newShortcode.trim()) { toast.error('Worker shortcode is required'); return; }
    const { error } = await supabase.from('apify_blocked_workers').insert({
      actor_shortcode: newShortcode.trim(),
      reason: newReason.trim() || null,
    } as any);
    if (error) {
      if (error.code === '23505') toast.error('Worker already blocked');
      else toast.error(error.message);
      return;
    }
    toast.success('Worker blocked');
    setNewShortcode('');
    setNewReason('');
    loadData();
  };

  const unblockWorker = async (id: string) => {
    await supabase.from('apify_blocked_workers').delete().eq('id', id);
    setBlocked(prev => prev.filter(w => w.id !== id));
    toast.success('Worker unblocked');
  };

  const maskKey = (key: string) => key.slice(0, 6) + '••••••••' + key.slice(-4);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Keys Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            Apify API Keys
            <Badge variant="outline" className="ml-auto">{keys.filter(k => k.is_active).length} active</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Rotate your Apify API key monthly to stay within free-tier credit limits. Only one key can be active at a time.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new key */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Label</label>
              <Input
                placeholder="e.g. March 2026 Account"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex-[2] space-y-1">
              <label className="text-xs text-muted-foreground">API Key</label>
              <Input
                placeholder="apify_api_xxxxxxxxxxxx"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                type="password"
                className="h-9 font-mono text-xs"
              />
            </div>
            <Button onClick={addKey} disabled={saving} size="sm" className="h-9 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {/* Existing keys */}
          {keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No API keys configured yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div
                  key={k.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    k.is_active ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30 opacity-60'
                  }`}
                >
                  <Switch
                    checked={k.is_active}
                    onCheckedChange={() => toggleKey(k.id, k.is_active)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{k.label}</span>
                      {k.is_active ? (
                        <Badge variant="default" className="text-[10px] gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <XCircle className="h-2.5 w-2.5" /> Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code className="text-xs text-muted-foreground font-mono">
                        {showKeys[k.id] ? k.api_key : maskKey(k.api_key)}
                      </code>
                      <button
                        onClick={() => setShowKeys(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {showKeys[k.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Added {new Date(k.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteKey(k.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocked Workers Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldBan className="h-4 w-4 text-destructive" />
            Blocked Workers
            <Badge variant="destructive" className="ml-auto">{blocked.length} blocked</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Block specific Apify actors by their shortcode (e.g. <code className="bg-muted px-1 rounded">code_crafter/leads-finder</code>).
            Blocked workers will never be invoked by any automation.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add blocked worker */}
          <div className="flex items-end gap-2">
            <div className="flex-[2] space-y-1">
              <label className="text-xs text-muted-foreground">Actor Shortcode</label>
              <Input
                placeholder="username/actor-name"
                value={newShortcode}
                onChange={e => setNewShortcode(e.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Reason (optional)</label>
              <Input
                placeholder="e.g. Too expensive"
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                className="h-9"
              />
            </div>
            <Button onClick={blockWorker} size="sm" variant="destructive" className="h-9 gap-1.5">
              <ShieldBan className="h-3.5 w-3.5" />
              Block
            </Button>
          </div>

          {/* Blocked list */}
          {blocked.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldBan className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No workers blocked</p>
            </div>
          ) : (
            <div className="space-y-2">
              {blocked.map(w => (
                <div key={w.id} className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <ShieldBan className="h-4 w-4 text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono font-semibold text-foreground">{w.actor_shortcode}</code>
                    {w.reason && (
                      <p className="text-xs text-muted-foreground mt-0.5">{w.reason}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Blocked {new Date(w.blocked_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-destructive/20 hover:bg-destructive/10"
                    onClick={() => unblockWorker(w.id)}
                  >
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
