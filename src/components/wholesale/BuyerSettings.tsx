import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Settings, Save, Flame, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_DISTRESS_WEIGHTS } from '@/lib/wholesale/distressScoring';

export default function BuyerSettings() {
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    const { data } = await supabase.from('lw_buyer_config').select('*');
    const map: Record<string, any> = {};
    (data || []).forEach((r: any) => { map[r.key] = { id: r.id, value: r.value }; });
    setConfig(map);
    setLoading(false);
  };

  const saveKey = async (key: string, value: any) => {
    const existing = config[key];
    if (existing?.id) {
      await supabase.from('lw_buyer_config').update({ value, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('lw_buyer_config').insert({ key, value });
    }
    toast.success(`${key} saved`);
    loadConfig();
  };

  const getVal = (key: string, fallback: any = {}) => config[key]?.value ?? fallback;

  // Scoring thresholds
  const thresholds = getVal('scoring_thresholds', { high_intent: 70, medium_intent: 40, auto_qualify: 85 });
  const alertConfig = getVal('telegram_alerts', { enabled: true, min_score: 70 });
  const autoTasks = getVal('auto_create_tasks', true);
  const intentKeywords = getVal('intent_keywords', { high: [], medium: [], low: [] });

  const distressWeights = getVal('distress_weights', DEFAULT_DISTRESS_WEIGHTS);
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalc = async () => {
    setRecalculating(true);
    try {
      const { error } = await supabase.functions.invoke('distress-score-recalc', { body: {} });
      if (error) throw error;
      toast.success('Distress scores recalculated');
    } catch (err: any) { toast.error(err.message || 'Recalc failed'); }
    setRecalculating(false);
  };

  const WEIGHT_LABELS: Record<string, string> = {
    absentee_owner: 'Absentee Owner', vacant_flag: 'Vacant Property', tax_delinquent: 'Tax Delinquent',
    high_equity: 'High Equity (≥40%)', free_and_clear: 'Free & Clear', pre_foreclosure: 'Pre-Foreclosure',
    auction_status: 'Auction', out_of_state_owner: 'Out-of-State', years_owned_10plus: 'Long Ownership (10+ yrs)',
    lien_count_2plus: 'Multiple Liens (2+)', probate_flag: 'Probate/Estate', vacant_land: 'Vacant Land',
    corporate_owned: 'Corporate Owned', trust_owned: 'Trust Owned', inherited_flag: 'Inherited',
    tax_lien: 'Tax Lien', county_buyer_match: 'County Buyer Match',
  };

  return (
    <div className="space-y-4">
      {/* Distress Score Weights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Flame className="h-4 w-4" /> Distress Score Weights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Configure how much each distress factor contributes to the total score (0–100 cap).</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(WEIGHT_LABELS).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  className="h-8 text-sm"
                  value={distressWeights[key] ?? DEFAULT_DISTRESS_WEIGHTS[key as keyof typeof DEFAULT_DISTRESS_WEIGHTS] ?? 0}
                  onChange={e => saveKey('distress_weights', { ...distressWeights, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleRecalc} disabled={recalculating} className="mt-2">
            {recalculating ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Recalculating…</> : 'Recalculate All Scores'}
          </Button>
        </CardContent>
      </Card>

      {/* Scoring Thresholds */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-4 w-4" /> Scoring Thresholds
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>High Intent (min score)</Label>
              <Input
                type="number"
                value={thresholds.high_intent}
                onChange={e => saveKey('scoring_thresholds', { ...thresholds, high_intent: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Medium Intent (min score)</Label>
              <Input
                type="number"
                value={thresholds.medium_intent}
                onChange={e => saveKey('scoring_thresholds', { ...thresholds, medium_intent: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Auto-Qualify (min score)</Label>
              <Input
                type="number"
                value={thresholds.auto_qualify}
                onChange={e => saveKey('scoring_thresholds', { ...thresholds, auto_qualify: Number(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Intent Keywords */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Intent Keywords</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>High Intent Keywords <span className="text-muted-foreground text-xs">(+15 points each)</span></Label>
            <Textarea
              value={(intentKeywords.high || []).join(', ')}
              onChange={e => {
                const updated = { ...intentKeywords, high: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) };
                saveKey('intent_keywords', updated);
              }}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label>Medium Intent Keywords <span className="text-muted-foreground text-xs">(+8 points each)</span></Label>
            <Textarea
              value={(intentKeywords.medium || []).join(', ')}
              onChange={e => {
                const updated = { ...intentKeywords, medium: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) };
                saveKey('intent_keywords', updated);
              }}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label>Low Intent Keywords <span className="text-muted-foreground text-xs">(+3 points each)</span></Label>
            <Textarea
              value={(intentKeywords.low || []).join(', ')}
              onChange={e => {
                const updated = { ...intentKeywords, low: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) };
                saveKey('intent_keywords', updated);
              }}
              rows={2}
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Automation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-create follow-up tasks</p>
              <p className="text-xs text-muted-foreground">Create a review task when medium+ intent buyers are discovered</p>
            </div>
            <Switch
              checked={autoTasks === true || autoTasks === 'true'}
              onCheckedChange={v => saveKey('auto_create_tasks', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Telegram Alerts</p>
              <p className="text-xs text-muted-foreground">Get notified when high-score buyers are found</p>
            </div>
            <Switch
              checked={alertConfig.enabled}
              onCheckedChange={v => saveKey('telegram_alerts', { ...alertConfig, enabled: v })}
            />
          </div>
          {alertConfig.enabled && (
            <div className="space-y-1">
              <Label>Alert minimum score</Label>
              <Input
                type="number"
                value={alertConfig.min_score}
                onChange={e => saveKey('telegram_alerts', { ...alertConfig, min_score: Number(e.target.value) })}
                className="w-[120px]"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
