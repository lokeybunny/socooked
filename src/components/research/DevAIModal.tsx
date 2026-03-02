import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, ImageIcon, Copy, RefreshCw, Zap, TrendingUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NarrativeResult {
  id?: string;
  token_name: string;
  token_symbol: string;
  narrative: string;
  source_platform: string;
  source_reasoning?: string;
  meta_categories: string[];
  image_prompt: string;
  confidence: number;
  deploy_window: string;
  risk_level?: string;
  image_url?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DevAIModal({ open, onOpenChange }: Props) {
  const [generating, setGenerating] = useState(false);
  const [narrative, setNarrative] = useState<NarrativeResult | null>(null);
  const [genImage, setGenImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Override fields
  const [overrideName, setOverrideName] = useState('');
  const [overrideSymbol, setOverrideSymbol] = useState('');

  const generateNarrative = async () => {
    setGenerating(true);
    setNarrative(null);
    setImageUrl(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-ai`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ action: 'generate' }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        setNarrative(result.data);
        setOverrideName(result.data.token_name);
        setOverrideSymbol(result.data.token_symbol);
        toast.success('🔥 Narrative generated!');
      } else {
        toast.error(result.error || 'Generation failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const generateImage = async () => {
    if (!narrative?.image_prompt) return;
    setGenImage(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-ai`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          action: 'generate_image',
          narrative_id: narrative.id,
          prompt: narrative.image_prompt,
        }),
      });
      const result = await res.json();
      if (result.success && result.data?.image_url) {
        setImageUrl(result.data.image_url);
        toast.success('🍌 Image generated!');
      } else {
        toast.error(result.error || 'Image generation failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Image generation failed');
    } finally {
      setGenImage(false);
    }
  };

  const copyNarrative = () => {
    if (!narrative) return;
    const text = [
      `NAME OF TOKEN: ${overrideName || narrative.token_name}`,
      `SYMBOL OF TOKEN: $${overrideSymbol || narrative.token_symbol}`,
      `THE NARRATIVE: ${narrative.narrative}`,
      `THE SOURCE: ${narrative.source_platform}`,
      narrative.source_reasoning ? `WHY: ${narrative.source_reasoning}` : '',
      `DEPLOY: ${narrative.deploy_window}`,
      `CONFIDENCE: ${narrative.confidence}/10`,
      narrative.risk_level ? `RISK: ${narrative.risk_level}` : '',
      `METAS: ${narrative.meta_categories.join(', ')}`,
      imageUrl ? `IMAGE: ${imageUrl}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            DEV AI — Narrative Engine
            <span className="text-xs text-muted-foreground font-normal">Pump.fun Strategist</span>
          </DialogTitle>
        </DialogHeader>

        {!narrative ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-purple-500" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-foreground">Generate a Viral Narrative</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                DEV AI synthesizes live X feed, market cap alerts, trending metas, and research findings into a launch-ready Pump.fun narrative.
              </p>
            </div>
            <Button
              onClick={generateNarrative}
              disabled={generating}
              size="lg"
              className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              {generating ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Synthesizing...</>
              ) : (
                <><Zap className="h-5 w-5" /> Generate Narrative</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Narrative Card */}
            <div className="rounded-xl border-2 border-purple-500/30 bg-gradient-to-b from-purple-500/5 to-pink-500/5 overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-sm font-bold",
                    narrative.confidence >= 8 ? "bg-emerald-500/20 text-emerald-400" :
                    narrative.confidence >= 6 ? "bg-amber-500/20 text-amber-400" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {narrative.confidence}/10
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-bold">
                    {narrative.source_platform}
                  </span>
                  {narrative.deploy_window && (
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-bold",
                      narrative.deploy_window === 'NOW' ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-muted text-muted-foreground"
                    )}>
                      ⏱ {narrative.deploy_window}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copyNarrative}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 space-y-3">
                {/* Editable Name/Symbol */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">NAME OF TOKEN</Label>
                    <Input
                      value={overrideName}
                      onChange={(e) => setOverrideName(e.target.value)}
                      className="h-9 font-bold text-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">SYMBOL OF TOKEN</Label>
                    <Input
                      value={overrideSymbol}
                      onChange={(e) => setOverrideSymbol(e.target.value.toUpperCase())}
                      className="h-9 font-mono font-bold text-lg"
                      maxLength={6}
                    />
                  </div>
                </div>

                {/* Narrative */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">THE NARRATIVE</Label>
                  <p className="text-sm text-foreground leading-relaxed bg-background/50 p-3 rounded-lg border border-border">
                    {narrative.narrative}
                  </p>
                </div>

                {/* Source */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">THE SOURCE</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-purple-400">{narrative.source_platform}</span>
                    {narrative.source_reasoning && (
                      <span className="text-xs text-muted-foreground">— {narrative.source_reasoning}</span>
                    )}
                  </div>
                </div>

                {/* Meta categories */}
                <div className="flex flex-wrap gap-1.5">
                  {narrative.meta_categories.map((cat, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {cat}
                    </span>
                  ))}
                </div>

                {/* Risk */}
                {narrative.risk_level && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Risk:</span>
                    <span className={cn(
                      "font-bold",
                      narrative.risk_level === 'LOW' ? "text-emerald-400" :
                      narrative.risk_level === 'MEDIUM' ? "text-amber-400" :
                      "text-red-400"
                    )}>{narrative.risk_level}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Generate Image */}
            <div className="space-y-3">
              <Button
                onClick={generateImage}
                disabled={genImage}
                size="lg"
                className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-base"
              >
                {genImage ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Generating Image...</>
                ) : (
                  <><ImageIcon className="h-5 w-5" /> 🍌 GENERATE IMAGE</>
                )}
              </Button>

              {imageUrl && (
                <div className="rounded-xl overflow-hidden border-2 border-amber-500/30">
                  <img
                    src={imageUrl}
                    alt={narrative.token_name}
                    className="w-full h-auto max-h-[400px] object-contain bg-black"
                  />
                  <div className="px-3 py-2 bg-muted/30 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Banana2 — Gemini 3 Pro</span>
                    <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Regenerate */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={generateNarrative}
                disabled={generating}
                className="gap-1.5 flex-1"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerate Narrative
              </Button>
              <Button variant="ghost" onClick={copyNarrative} className="gap-1.5">
                <Copy className="h-4 w-4" /> Copy All
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
