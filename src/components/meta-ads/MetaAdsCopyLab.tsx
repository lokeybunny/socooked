import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  PenTool, Sparkles, RefreshCw, Minimize2, Maximize2, Save, Copy,
  Wand2, ArrowDown, ArrowUp, Heart
} from 'lucide-react';
import { toast } from 'sonner';

const copyTabs = [
  'Primary Text', 'Headline', 'Description', 'CTA', 'Hook Variations',
  'Short Form', 'Long Form', 'Local Service', 'Ecommerce', 'Lead Gen', 'Retargeting',
];

const tonePresets = [
  'Professional', 'Emotional', 'Urgent', 'Luxury', 'Aggressive', 'Direct Response',
  'Friendly', 'Educational', 'Humorous', 'Authority',
];

const audiencePresets = [
  'Moms', 'Realtors', 'Dentists', 'Gyms', 'Restaurants', 'Med Spas',
  'Lawyers', 'Ecommerce', 'Coaches', 'Local Business',
];

export default function MetaAdsCopyLab({ trainerMode }: { trainerMode: boolean }) {
  const [activeTab, setActiveTab] = useState('Primary Text');
  const [prompt, setPrompt] = useState('');
  const [generated, setGenerated] = useState('');
  const [savedCopies, setSavedCopies] = useState<string[]>([]);

  const handleGenerate = () => {
    toast.info('Generating ad copy via AI...');
    // Placeholder — would call edge function
    setGenerated(`Here are 5 ${activeTab.toLowerCase()} variations for your ad:\n\n1. "Stop scrolling — this is the offer you've been waiting for."\n2. "Ready to transform your results? Here's how."\n3. "Most people ignore this. Smart operators don't."\n4. "What if your next ad could 3x your leads?"\n5. "Your competitors are already doing this. Are you?"`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <PenTool className="h-5 w-5 text-purple-500" /> Ad Copy Lab
          </h3>
          <p className="text-sm text-muted-foreground">AI-powered ad copy generation</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0">
          {copyTabs.map(t => (
            <TabsTrigger key={t} value={t} className="text-xs data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-500 border border-transparent data-[state=active]:border-purple-500/20 rounded-lg px-2.5 py-1">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Input Panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Generate {activeTab}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea
                placeholder={`Describe what you need: e.g. "Write 10 hooks for a Las Vegas med spa offering lip filler specials"`}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Tone</p>
              <div className="flex flex-wrap gap-1.5">
                {tonePresets.map(t => (
                  <Badge key={t} variant="outline" className="cursor-pointer hover:bg-muted text-[10px]" onClick={() => setPrompt(p => p + ` Tone: ${t}.`)}>
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Audience</p>
              <div className="flex flex-wrap gap-1.5">
                {audiencePresets.map(a => (
                  <Badge key={a} variant="outline" className="cursor-pointer hover:bg-muted text-[10px]" onClick={() => setPrompt(p => p + ` For: ${a}.`)}>
                    {a}
                  </Badge>
                ))}
              </div>
            </div>

            <Button onClick={handleGenerate} className="w-full gap-1.5">
              <Sparkles className="h-4 w-4" /> Generate
            </Button>
          </CardContent>
        </Card>

        {/* Output Panel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Output</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleGenerate} title="Regenerate">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(generated); toast.success('Copied'); }} title="Copy">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSavedCopies(p => [...p, generated]); toast.success('Saved'); }} title="Save">
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {generated ? (
              <div className="space-y-3">
                <div className="bg-muted rounded-xl p-4 text-sm whitespace-pre-wrap text-foreground min-h-[200px]">
                  {generated}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setPrompt('Make this more emotional')}>
                    <Heart className="h-3 w-3" /> More Emotional
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setPrompt('Shorten this copy')}>
                    <Minimize2 className="h-3 w-3" /> Shorten
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setPrompt('Expand this copy')}>
                    <Maximize2 className="h-3 w-3" /> Expand
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setPrompt('Make this more aggressive')}>
                    <Wand2 className="h-3 w-3" /> More Aggressive
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] text-center">
                <PenTool className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Generate ad copy to see results here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Saved Copies */}
      {savedCopies.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Saved Copies ({savedCopies.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {savedCopies.map((c, i) => (
              <div key={i} className="bg-muted rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap">
                {c}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
