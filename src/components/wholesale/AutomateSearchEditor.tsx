import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Play, Loader2, Settings2, X } from 'lucide-react';

interface SearchConfig {
  target_states: string[];
  target_counties: string[];
  budget_min: number | null;
  budget_max: number | null;
  acreage_min: number | null;
  acreage_max: number | null;
  property_type_interest: string[];
  motivation_flags: string[];
  target_city: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyer: {
    id: string;
    full_name: string;
    target_states: string[];
    target_counties: string[];
    budget_min: number | null;
    budget_max: number | null;
    acreage_min: number | null;
    acreage_max: number | null;
    property_type_interest: string[];
    meta: Record<string, any>;
  };
  pageId: string;
  onComplete: () => void;
}

const PROPERTY_TYPES = [
  { value: 'land', label: '🏞️ Land' },
  { value: 'sfr', label: '🏠 SFR' },
  { value: 'multi_family', label: '🏘️ Multi-Family' },
];

const MOTIVATION_FLAGS = [
  { value: 'distressed', label: '🔥 Distressed' },
  { value: 'pre_foreclosure', label: '⚠️ Pre-Foreclosure' },
  { value: 'tax_delinquent', label: '💰 Tax Delinquent' },
  { value: 'vacant', label: '🏚️ Vacant' },
  { value: 'absentee_owner', label: '📬 Absentee Owner' },
];

export default function AutomateSearchEditor({ open, onOpenChange, buyer, pageId, onComplete }: Props) {
  const [config, setConfig] = useState<SearchConfig>({
    target_states: [],
    target_counties: [],
    budget_min: null,
    budget_max: null,
    acreage_min: null,
    acreage_max: null,
    property_type_interest: [],
    motivation_flags: [],
    target_city: '',
  });
  const [stateInput, setStateInput] = useState('');
  const [countyInput, setCountyInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && buyer) {
      const interests = buyer.meta?.interests || {};
      setConfig({
        target_states: buyer.target_states || [],
        target_counties: buyer.target_counties || [],
        budget_min: buyer.budget_min,
        budget_max: buyer.budget_max,
        acreage_min: buyer.acreage_min,
        acreage_max: buyer.acreage_max,
        property_type_interest: interests.property_types || buyer.property_type_interest || [],
        motivation_flags: interests.motivation_flags || [],
        target_city: interests.target_city || '',
      });
    }
  }, [open, buyer]);

  const addTag = (field: 'target_states' | 'target_counties', value: string) => {
    const trimmed = value.trim();
    if (!trimmed || config[field].includes(trimmed)) return;
    setConfig(prev => ({ ...prev, [field]: [...prev[field], trimmed] }));
  };

  const removeTag = (field: 'target_states' | 'target_counties', value: string) => {
    setConfig(prev => ({ ...prev, [field]: prev[field].filter(v => v !== value) }));
  };

  const toggleFlag = (flag: string) => {
    setConfig(prev => ({
      ...prev,
      motivation_flags: prev.motivation_flags.includes(flag)
        ? prev.motivation_flags.filter(f => f !== flag)
        : [...prev.motivation_flags, flag],
    }));
  };

  const togglePropertyType = (pt: string) => {
    setConfig(prev => ({
      ...prev,
      property_type_interest: prev.property_type_interest.includes(pt)
        ? prev.property_type_interest.filter(p => p !== pt)
        : [...prev.property_type_interest, pt],
    }));
  };

  const handleSaveAndRun = async () => {
    if (config.target_states.length === 0) {
      toast.error('At least one target state is required');
      return;
    }

    setSaving(true);
    try {
      // Update buyer record with new search config
      const updatedMeta = {
        ...buyer.meta,
        interests: {
          ...(buyer.meta?.interests || {}),
          property_types: config.property_type_interest,
          motivation_flags: config.motivation_flags,
          target_city: config.target_city || undefined,
        },
      };

      const { error: updateErr } = await supabase
        .from('lw_buyers')
        .update({
          target_states: config.target_states,
          target_counties: config.target_counties,
          budget_min: config.budget_min,
          budget_max: config.budget_max,
          acreage_min: config.acreage_min,
          acreage_max: config.acreage_max,
          property_type_interest: config.property_type_interest,
          meta: updatedMeta,
        })
        .eq('id', buyer.id);

      if (updateErr) throw updateErr;

      // Now trigger the matcher
      const { data, error } = await supabase.functions.invoke('weekly-lead-matcher', {
        body: { buyer_id: buyer.id, page_id: pageId },
      });
      if (error) throw error;

      toast.success(`Search updated & leads matched for ${buyer.full_name}`);
      onOpenChange(false);
      onComplete();
    } catch (err: any) {
      toast.error('Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Edit Search — {buyer.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Target States */}
          <div className="space-y-2">
            <Label className="text-xs">Target States</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. TX, FL"
                value={stateInput}
                onChange={e => setStateInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('target_states', stateInput);
                    setStateInput('');
                  }
                }}
                className="text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => { addTag('target_states', stateInput); setStateInput(''); }}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {config.target_states.map(s => (
                <Badge key={s} variant="secondary" className="text-xs gap-1">
                  {s}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag('target_states', s)} />
                </Badge>
              ))}
            </div>
          </div>

          {/* Target Counties */}
          <div className="space-y-2">
            <Label className="text-xs">Target Counties</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Harris County"
                value={countyInput}
                onChange={e => setCountyInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('target_counties', countyInput);
                    setCountyInput('');
                  }
                }}
                className="text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => { addTag('target_counties', countyInput); setCountyInput(''); }}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {config.target_counties.map(c => (
                <Badge key={c} variant="secondary" className="text-xs gap-1">
                  {c}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag('target_counties', c)} />
                </Badge>
              ))}
            </div>
          </div>

          {/* Target City */}
          <div className="space-y-2">
            <Label className="text-xs">Target City (optional)</Label>
            <Input
              placeholder="e.g. Houston"
              value={config.target_city}
              onChange={e => setConfig(prev => ({ ...prev, target_city: e.target.value }))}
              className="text-sm"
            />
          </div>

          {/* Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Budget Min ($)</Label>
              <Input
                type="number"
                placeholder="0"
                value={config.budget_min ?? ''}
                onChange={e => setConfig(prev => ({ ...prev, budget_min: e.target.value ? Number(e.target.value) : null }))}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Budget Max ($)</Label>
              <Input
                type="number"
                placeholder="No max"
                value={config.budget_max ?? ''}
                onChange={e => setConfig(prev => ({ ...prev, budget_max: e.target.value ? Number(e.target.value) : null }))}
                className="text-sm"
              />
            </div>
          </div>

          {/* Acreage */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Acreage Min</Label>
              <Input
                type="number"
                placeholder="0"
                value={config.acreage_min ?? ''}
                onChange={e => setConfig(prev => ({ ...prev, acreage_min: e.target.value ? Number(e.target.value) : null }))}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Acreage Max</Label>
              <Input
                type="number"
                placeholder="No max"
                value={config.acreage_max ?? ''}
                onChange={e => setConfig(prev => ({ ...prev, acreage_max: e.target.value ? Number(e.target.value) : null }))}
                className="text-sm"
              />
            </div>
          </div>

          {/* Property Types */}
          <div className="space-y-2">
            <Label className="text-xs">Property Types</Label>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map(pt => (
                <button
                  key={pt.value}
                  onClick={() => togglePropertyType(pt.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    config.property_type_interest.includes(pt.value)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Motivation Flags */}
          <div className="space-y-2">
            <Label className="text-xs">Motivation / Distress Flags</Label>
            <div className="space-y-2">
              {MOTIVATION_FLAGS.map(flag => (
                <label key={flag.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={config.motivation_flags.includes(flag.value)}
                    onCheckedChange={() => toggleFlag(flag.value)}
                  />
                  <span className="text-xs">{flag.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSaveAndRun} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Save & Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
