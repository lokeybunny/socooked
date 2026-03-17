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
  const [activePresetIds, setActivePresetIds] = useState<Set<string>>(new Set());
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
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/darkside-smm?action=services`;
      const resp = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const json = await resp.json();
      if (json.success && Array.isArray(json.data)) {
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

  // Load active preset IDs from DB config
  const loadActiveConfig = useCallback(async () => {
    const { data } = await supabase
      .from('site_configs')
      .select('content')
      .eq('site_id', 'smm-boost')
      .eq('section', `auto-boost-${profileUsername}`)
      .single();
    const config = data?.content as { enabled?: boolean; preset_ids?: string[]; preset_id?: string } | null;
    if (config) {
      // Support both legacy single preset_id and new multi preset_ids
      if (config.preset_ids && Array.isArray(config.preset_ids)) {
        setActivePresetIds(new Set(config.preset_ids));
      } else if (config.preset_id) {
        setActivePresetIds(new Set([config.preset_id]));
      }
    }
  }, [profileUsername]);

  useEffect(() => {
    if (open) {
      loadPresets();
      loadBalance();
      loadActiveConfig();
    }
  }, [open, loadPresets, loadBalance, loadActiveConfig]);

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
    const newActive = new Set(activePresetIds);
    newActive.delete(id);
    setActivePresetIds(newActive);
    saveAutoBoostConfig(newActive);
    loadPresets();
    toast.success('Preset deleted');
  };

  const handleTogglePreset = (presetId: string, enabled: boolean) => {
    const newActive = new Set(activePresetIds);
    if (enabled) {
      newActive.add(presetId);
    } else {
      newActive.delete(presetId);
    }
    setActivePresetIds(newActive);
    saveAutoBoostConfig(newActive);
  };

  const saveAutoBoostConfig = async (ids: Set<string>) => {
    const preset_ids = [...ids];
    await supabase.from('site_configs').upsert({
      site_id: 'smm-boost',
      section: `auto-boost-${profileUsername}`,
      content: { enabled: preset_ids.length > 0, preset_ids } as any,
      is_published: true,
    }, { onConflict: 'site_id,section' });
  };

  const totalCost = (svcs: BoostService[]) =>
    svcs.reduce((sum, s) => sum + (s.quantity / 1000) * s.rate, 0).toFixed(4);

  const combinedCostPerPost = presets
    .filter(p => activePresetIds.has(p.id))
    .reduce((sum, p) => sum + p.services.reduce((s, svc) => s + (svc.quantity / 1000) * svc.rate, 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Auto-Boost Configuration
          </DialogTitle>
        </DialogHeader>

        {/* Balance & Summary */}
        <div className="flex items-center justify-between bg-muted/50 border border-border rounded-lg p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-sm font-mono">Balance: {balance ?? '...'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activePresetIds.size > 0 ? (
              <Badge variant="default" className="text-[10px] font-mono">
                {activePresetIds.size} active · ${combinedCostPerPost.toFixed(4)}/post
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">No presets active</Badge>
            )}
          </div>
        </div>

        {/* Saved Presets with individual toggles */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Boost Presets</h3>
          {presets.length === 0 && <p className="text-xs text-muted-foreground">No presets yet. Create one below.</p>}
          {presets.map(p => {
            const isActive = activePresetIds.has(p.id);
            return (
              <div key={p.id} className={`border rounded-lg p-3 space-y-1.5 transition-colors ${isActive ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isActive}
                      onCheckedChange={(checked) => handleTogglePreset(p.id, checked)}
                      className="scale-90"
                    />
                    <span className="font-medium text-sm">{p.preset_name}</span>
                    {isActive && <Badge variant="default" className="text-[10px]">ACTIVE</Badge>}
                    <Badge variant="outline" className="text-[10px] font-mono">${totalCost(p.services)}/post</Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeletePreset(p.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 pl-9">
                  {p.services.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                      {s.service_name.substring(0, 40)}… × {s.quantity}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Create New Preset */}
        <div className="border border-dashed border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Create New Preset</h3>
          <Input placeholder="Preset name (e.g. 'Standard Boost')" value={presetName} onChange={e => setPresetName(e.target.value)} />

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
