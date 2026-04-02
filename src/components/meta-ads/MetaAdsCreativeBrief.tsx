import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Palette, Sparkles, Plus, Camera, Video, Layers, Smartphone, Save } from 'lucide-react';
import { toast } from 'sonner';

interface CreativeBrief {
  id: string;
  conceptName: string;
  targetAudience: string;
  emotionalAngle: string;
  visualDirection: string;
  adHook: string;
  openingLine: string;
  painPoint: string;
  solutionMessage: string;
  trustBuilder: string;
  cta: string;
  aspectRatio: string;
  platform: string;
  format: string;
}

const emptyBrief = (): CreativeBrief => ({
  id: crypto.randomUUID(),
  conceptName: '',
  targetAudience: '',
  emotionalAngle: '',
  visualDirection: '',
  adHook: '',
  openingLine: '',
  painPoint: '',
  solutionMessage: '',
  trustBuilder: '',
  cta: '',
  aspectRatio: '9:16',
  platform: 'Instagram Reels',
  format: 'UGC / Talking Head',
});

export default function MetaAdsCreativeBrief() {
  const [briefs, setBriefs] = useState<CreativeBrief[]>([]);
  const [editing, setEditing] = useState<CreativeBrief | null>(null);

  const handleNew = () => setEditing(emptyBrief());

  const handleSave = () => {
    if (!editing) return;
    setBriefs(prev => {
      const idx = prev.findIndex(b => b.id === editing.id);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = editing; return copy; }
      return [...prev, editing];
    });
    setEditing(null);
    toast.success('Creative brief saved');
  };

  const generateAI = () => {
    toast.info('Generating creative brief via AI...');
    setEditing(prev => prev ? {
      ...prev,
      conceptName: 'The Transformation Reveal',
      targetAudience: 'Women 25-45, interested in skincare and beauty treatments',
      emotionalAngle: 'Confidence & self-care empowerment',
      visualDirection: 'Clean, bright, before/after transformation. Natural lighting.',
      adHook: 'You won\'t believe this is the same person...',
      openingLine: 'I was so self-conscious about my skin until I found this...',
      painPoint: 'Dealing with skin issues that makeup can\'t fix',
      solutionMessage: 'Professional treatment that delivers real, lasting results',
      trustBuilder: '500+ happy clients, licensed medical professionals, 5-star reviews',
      cta: 'Book your free consultation today — limited March spots available',
      aspectRatio: '9:16',
      platform: 'Instagram Reels + Stories',
      format: 'UGC / Talking Head',
    } : prev);
  };

  const fields: { key: keyof CreativeBrief; label: string; type: 'input' | 'textarea' }[] = [
    { key: 'conceptName', label: 'Concept Name', type: 'input' },
    { key: 'targetAudience', label: 'Target Audience', type: 'input' },
    { key: 'emotionalAngle', label: 'Emotional Angle', type: 'input' },
    { key: 'visualDirection', label: 'Visual Direction', type: 'textarea' },
    { key: 'adHook', label: 'Ad Hook', type: 'input' },
    { key: 'openingLine', label: 'Opening Line', type: 'input' },
    { key: 'painPoint', label: 'Pain Point', type: 'input' },
    { key: 'solutionMessage', label: 'Solution Message', type: 'textarea' },
    { key: 'trustBuilder', label: 'Trust Builder', type: 'input' },
    { key: 'cta', label: 'Call to Action', type: 'input' },
    { key: 'aspectRatio', label: 'Aspect Ratio', type: 'input' },
    { key: 'platform', label: 'Platform Recommendations', type: 'input' },
    { key: 'format', label: 'Format (UGC / Carousel / Reel / Shot List)', type: 'input' },
  ];

  if (editing) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Palette className="h-5 w-5 text-pink-500" /> Creative Brief
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={generateAI} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> AI Generate
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            {fields.map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                {f.type === 'input' ? (
                  <Input value={editing[f.key]} onChange={e => setEditing(p => p ? { ...p, [f.key]: e.target.value } : p)} />
                ) : (
                  <Textarea value={editing[f.key]} onChange={e => setEditing(p => p ? { ...p, [f.key]: e.target.value } : p)} className="min-h-[60px]" />
                )}
              </div>
            ))}
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
            <Palette className="h-5 w-5 text-pink-500" /> Creative Briefs
          </h3>
          <p className="text-sm text-muted-foreground">AI-generated briefs for image & video ads</p>
        </div>
        <Button size="sm" onClick={handleNew} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Brief
        </Button>
      </div>

      {briefs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <Palette className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No creative briefs yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create a brief to know exactly what content to create for your ads</p>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={handleNew}>
              <Plus className="h-3.5 w-3.5" /> Create First Brief
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {briefs.map(b => (
            <Card key={b.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setEditing(b)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-foreground">{b.conceptName || 'Untitled'}</p>
                  <div className="flex gap-1">
                    {b.format.includes('UGC') && <Camera className="h-3.5 w-3.5 text-muted-foreground" />}
                    {b.format.includes('Reel') && <Video className="h-3.5 w-3.5 text-muted-foreground" />}
                    {b.format.includes('Carousel') && <Layers className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{b.adHook}</p>
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{b.platform}</Badge>
                  <Badge variant="outline" className="text-[10px]">{b.aspectRatio}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
