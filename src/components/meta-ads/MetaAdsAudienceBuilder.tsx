import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Plus, Users, Layers, Ban, Sparkles, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Audience {
  id: string;
  name: string;
  type: 'saved' | 'custom' | 'lookalike';
  funnelStage: 'cold' | 'warm' | 'hot';
  targeting: string;
  rationale: string;
  notes: string;
}

export default function MetaAdsAudienceBuilder() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [editing, setEditing] = useState<Audience | null>(null);

  const newAudience = (type: 'saved' | 'custom' | 'lookalike') => {
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      type,
      funnelStage: type === 'custom' ? 'warm' : type === 'lookalike' ? 'cold' : 'cold',
      targeting: '',
      rationale: '',
      notes: '',
    });
  };

  const save = () => {
    if (!editing) return;
    setAudiences(prev => {
      const idx = prev.findIndex(a => a.id === editing.id);
      if (idx >= 0) { const c = [...prev]; c[idx] = editing; return c; }
      return [...prev, editing];
    });
    setEditing(null);
    toast.success('Audience saved');
  };

  const funnelColors = { cold: 'text-blue-500 bg-blue-500/10', warm: 'text-amber-500 bg-amber-500/10', hot: 'text-red-500 bg-red-500/10' };
  const typeIcons = { saved: Target, custom: Users, lookalike: Layers };

  if (editing) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="h-5 w-5 text-green-500" /> {editing.type.charAt(0).toUpperCase() + editing.type.slice(1)} Audience
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" onClick={save} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Save</Button>
          </div>
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Audience Name</label>
              <Input value={editing.name} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} placeholder="e.g. Cold — Homebuyers 25-45" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={editing.type} onValueChange={v => setEditing(p => p ? { ...p, type: v as any } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saved">Saved Audience</SelectItem>
                    <SelectItem value="custom">Custom Audience</SelectItem>
                    <SelectItem value="lookalike">Lookalike Audience</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Funnel Stage</label>
                <Select value={editing.funnelStage} onValueChange={v => setEditing(p => p ? { ...p, funnelStage: v as any } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold">❄️ Cold</SelectItem>
                    <SelectItem value="warm">🔥 Warm</SelectItem>
                    <SelectItem value="hot">🔴 Hot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Targeting Details</label>
              <Textarea value={editing.targeting} onChange={e => setEditing(p => p ? { ...p, targeting: e.target.value } : p)} placeholder="Interests, demographics, behaviors, sources..." className="min-h-[80px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Targeting Rationale (why this audience?)</label>
              <Textarea value={editing.rationale} onChange={e => setEditing(p => p ? { ...p, rationale: e.target.value } : p)} placeholder="Explain why this audience makes sense..." className="min-h-[60px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={editing.notes} onChange={e => setEditing(p => p ? { ...p, notes: e.target.value } : p)} className="min-h-[40px]" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="h-5 w-5 text-green-500" /> Audience Builder
          </h3>
          <p className="text-sm text-muted-foreground">Plan and organize your targeting strategy</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => newAudience('saved')} className="gap-1.5"><Target className="h-3.5 w-3.5" /> Saved</Button>
          <Button variant="outline" size="sm" onClick={() => newAudience('custom')} className="gap-1.5"><Users className="h-3.5 w-3.5" /> Custom</Button>
          <Button variant="outline" size="sm" onClick={() => newAudience('lookalike')} className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Lookalike</Button>
        </div>
      </div>

      {audiences.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <Target className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No audiences created yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Build audiences for cold, warm, and hot targeting</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {audiences.map(a => {
            const Icon = typeIcons[a.type];
            return (
              <Card key={a.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setEditing(a)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm text-foreground">{a.name || 'Untitled'}</span>
                    </div>
                    <Badge className={`text-[10px] ${funnelColors[a.funnelStage]}`}>{a.funnelStage}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{a.targeting || 'No targeting details'}</p>
                  {a.rationale && <p className="text-[10px] text-muted-foreground/70 italic line-clamp-1">{a.rationale}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
