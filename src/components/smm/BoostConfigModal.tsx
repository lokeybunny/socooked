import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Zap, Loader2, DollarSign, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface BoostService {
  service_id: string;
  service_name: string;
  quantity: number;
  rate: number;
}

interface BoostPreset {
  id: string;
  preset_name: string;
  profile_username: string;
  services: BoostService[];
  created_at: string;
}

interface DarksideService {
  service: number;
  name: string;
  rate: string;
  min: string;
  max: string;
  category: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileUsername: string;
}

export default function BoostConfigModal({ open, onOpenChange, profileUsername }: Props) {
  const [presets, setPresets] = useState<BoostPreset[]>([]);
  const [services, setServices] = useState<DarksideService[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [autoBoostEnabled, setAutoBoostEnabled] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  // New preset form
  const [presetName, setPresetName] = useState('');
  const [selectedServices, setSelectedServices] = useState<BoostService[]>([]);
  const [addingService, setAddingService] = useState(false);
  const [newServiceId, setNewServiceId] = useState('');
  const [newQuantity, setNewQuantity] = useState('500');

  const loadPresets = useCallback(async () => {
    const { data } = await supabase
      .from('smm_boost_presets')
      .select('*')
      .eq('profile_username', profileUsername)
      .order('created_at', { ascending: false });
    if (data) setPresets(data as unknown as BoostPreset[]);
  }, [profileUsername]);

  const loadServices = useCallback(async () => {
    setLoadingServices(true);
    try {
      const res = await supabase.functions.invoke('darkside-smm', {
        body: {},
        headers: { 'Content-Type': 'application/json' },
      });
      // The function expects action as query param, use fetch directly
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/darkside-smm?action=services`;
      const resp = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const json = await resp.json();
      if (json.success && Array.isArray(json.data)) {
        // Filter to Instagram/TikTok relevant services
        const relevant = json.data.filter((s: DarksideService) =>
          /instagram|tiktok/i.test(s.category || s.name)
        );
        setServices(relevant.length > 0 ? relevant : json.data.slice(0, 100));
      }
    } catch (e) {
      console.error('Failed to load services', e);
    } finally {
      setLoadingServices(false);
    }
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/darkside-smm?action=balance`;
      const resp = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const json = await resp.json();
      if (json.success) setBalance(json.data?.balance || json.data?.currency || JSON.stringify(json.data));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) {
      loadPresets();
      loadBalance();
      // Load auto-boost state from localStorage
      const stored = localStorage.getItem(`boost-auto-${profileUsername}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setAutoBoostEnabled(parsed.enabled);
        setActivePresetId(parsed.presetId);
      }
    }
  }, [open, loadPresets, loadBalance, profileUsername]);

  const handleAddService = () => {
    if (!newServiceId) return;
    const svc = services.find(s => String(s.service) === newServiceId);
    if (!svc) return;
    setSelectedServices(prev => [...prev, {
      service_id: String(svc.service),
      service_name: svc.name,
      quantity: Number(newQuantity) || 500,
      rate: parseFloat(svc.rate) || 0,
    }]);
    setNewServiceId('');
    setNewQuantity('500');
    setAddingService(false);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim() || selectedServices.length === 0) {
      toast.error('Name and at least one service required');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('smm_boost_presets').insert({
      profile_username: profileUsername,
      preset_name: presetName.trim(),
      services: selectedServices as any,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Preset saved');
      setPresetName('');
      setSelectedServices([]);
      loadPresets();
    }
    setLoading(false);
  };

  const handleDeletePreset = async (id: string) => {
    await supabase.from('smm_boost_presets').delete().eq('id', id);
    if (activePresetId === id) {
      setActivePresetId(null);
      setAutoBoostEnabled(false);
      localStorage.removeItem(`boost-auto-${profileUsername}`);
    }
    loadPresets();
    toast.success('Preset deleted');
  };

  const handleToggleAutoBoost = (enabled: boolean) => {
    setAutoBoostEnabled(enabled);
    if (enabled && !activePresetId && presets.length > 0) {
      setActivePresetId(presets[0].id);
    }
    const state = { enabled, presetId: enabled ? (activePresetId || presets[0]?.id) : null };
    localStorage.setItem(`boost-auto-${profileUsername}`, JSON.stringify(state));
    // Also persist to DB for the edge function to read
    saveAutoBoostConfig(enabled, state.presetId);
  };

  const handleSelectPreset = (presetId: string) => {
    setActivePresetId(presetId);
    const state = { enabled: autoBoostEnabled, presetId };
    localStorage.setItem(`boost-auto-${profileUsername}`, JSON.stringify(state));
    if (autoBoostEnabled) saveAutoBoostConfig(true, presetId);
  };

  const saveAutoBoostConfig = async (enabled: boolean, presetId: string | null) => {
    // Store the active boost config as a site_config so edge functions can read it
    await supabase.from('site_configs').upsert({
      site_id: 'smm-boost',
      section: `auto-boost-${profileUsername}`,
      content: { enabled, preset_id: presetId } as any,
      is_published: true,
    }, { onConflict: 'site_id,section' });
  };

  const totalCost = (svcs: BoostService[]) =>
    svcs.reduce((sum, s) => sum + (s.quantity / 1000) * s.rate, 0).toFixed(4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Auto-Boost Configuration
          </DialogTitle>
        </DialogHeader>

        {/* Balance & Auto Toggle */}
        <div className="flex items-center justify-between bg-muted/50 border border-border rounded-lg p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-sm font-mono">Balance: {balance ?? '...'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-boost" className="text-sm">Auto-Boost</Label>
            <Switch id="auto-boost" checked={autoBoostEnabled} onCheckedChange={handleToggleAutoBoost} />
          </div>
        </div>

        {/* Active Preset Selector (when auto-boost is ON) */}
        {autoBoostEnabled && presets.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Active Preset (fires on every publish)</Label>
            <Select value={activePresetId || ''} onValueChange={handleSelectPreset}>
              <SelectTrigger><SelectValue placeholder="Select preset" /></SelectTrigger>
              <SelectContent>
                {presets.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.preset_name} — ${totalCost(p.services)}/post
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Saved Presets */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Saved Presets</h3>
          {presets.length === 0 && <p className="text-xs text-muted-foreground">No presets yet. Create one below.</p>}
          {presets.map(p => (
            <div key={p.id} className={`border rounded-lg p-3 space-y-1.5 ${activePresetId === p.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.preset_name}</span>
                  {activePresetId === p.id && autoBoostEnabled && <Badge variant="default" className="text-[10px]">ACTIVE</Badge>}
                  <Badge variant="outline" className="text-[10px]">${totalCost(p.services)}/post</Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeletePreset(p.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.services.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                    {s.service_name.substring(0, 40)}… × {s.quantity}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Create New Preset */}
        <div className="border border-dashed border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Create New Preset</h3>
          <Input placeholder="Preset name (e.g. 'Standard Boost')" value={presetName} onChange={e => setPresetName(e.target.value)} />

          {/* Selected services */}
          {selectedServices.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2">
              <span className="flex-1 truncate">{s.service_name}</span>
              <span className="font-mono">×{s.quantity}</span>
              <span className="font-mono text-muted-foreground">${((s.quantity / 1000) * s.rate).toFixed(4)}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedServices(prev => prev.filter((_, j) => j !== i))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {/* Add service */}
          {addingService ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadServices} disabled={loadingServices}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${loadingServices ? 'animate-spin' : ''}`} />
                  Load Services
                </Button>
              </div>
              {services.length > 0 && (
                <>
                  <Select value={newServiceId} onValueChange={setNewServiceId}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="Select a service" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {services.map(s => (
                        <SelectItem key={s.service} value={String(s.service)} className="text-xs">
                          {s.name} — ${s.rate}/1K (min {s.min})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Quantity" value={newQuantity} onChange={e => setNewQuantity(e.target.value)} className="w-32" />
                    <Button size="sm" onClick={handleAddService} disabled={!newServiceId}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingService(false)}>Cancel</Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setAddingService(true); if (services.length === 0) loadServices(); }}>
              <Plus className="h-3.5 w-3.5" /> Add Service
            </Button>
          )}

          {selectedServices.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs font-mono">Total: ${totalCost(selectedServices)}/post</span>
              <Button size="sm" onClick={handleSavePreset} disabled={loading}>
                {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Save Preset
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
