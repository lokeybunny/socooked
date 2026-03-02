import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, Copy, ExternalLink, Flame, Beaker, Rocket, Skull, Sparkles, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ABSURDITY_TAGS: Record<string, { label: string; color: string }> = {
  toilet: { label: '🚽 TOILET', color: 'bg-amber-500/20 text-amber-400' },
  sexy: { label: '🔥 SEXY', color: 'bg-pink-500/20 text-pink-400' },
  tech: { label: '💻 TECH', color: 'bg-blue-500/20 text-blue-400' },
  monetize: { label: '💰 MONETIZE', color: 'bg-emerald-500/20 text-emerald-400' },
  parody: { label: '🎭 PARODY', color: 'bg-purple-500/20 text-purple-400' },
};

interface Discovery {
  id: string;
  original_tweet: {
    text: string;
    user: string;
    url: string;
    likes: number;
    media_url?: string;
    created_at?: string;
  };
  absurdity_tag: string;
  virality_index: number;
  coin_name: string;
  ticker: string;
  tagline: string;
  lore_origin: string;
  villain: string;
  community_identity: string;
  bio_description: string;
  pumpfun_description: string;
  psychological_hook: string;
  launch_thread: string;
  viral_first_post: string;
  phase1_strategy: string;
  tweet_angles: string[];
  reply_farming: string;
  narrative_stacking: string;
  exit_narrative: string;
  why_stupid_but_runs: string;
  meme_friction: number;
  monetization_absurdity: number;
  narrative_elasticity: number;
  pumpfun_viability: number;
}

export function DiscoveryLab() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(false);
  const [maxDegen, setMaxDegen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const hunt = async () => {
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discovery-lab`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ max_degeneracy: maxDegen }),
      });
      const data = await res.json();
      if (data.success && data.discoveries?.length) {
        setDiscoveries(prev => [...data.discoveries, ...prev].slice(0, 50));
        toast.success(`🔥 ${data.discoveries.length} narratives weaponized`);
      } else {
        toast.error(data.error || 'No discoveries found');
      }
    } catch (err: any) {
      toast.error(err.message || 'Discovery failed');
    } finally {
      setLoading(false);
    }
  };

  const copyAll = (d: Discovery) => {
    const text = [
      `🪙 COIN: ${d.coin_name} ($${d.ticker})`,
      `📢 TAGLINE: ${d.tagline}`,
      ``,
      `📖 LORE ORIGIN:`,
      d.lore_origin,
      ``,
      `👿 VILLAIN: ${d.villain}`,
      `👥 COMMUNITY: ${d.community_identity}`,
      ``,
      `🧠 PSYCHOLOGICAL HOOK:`,
      d.psychological_hook,
      ``,
      `📝 BIO: ${d.bio_description}`,
      `📝 PUMPFUN DESC: ${d.pumpfun_description}`,
      ``,
      `🚀 LAUNCH THREAD:`,
      d.launch_thread,
      ``,
      `📱 VIRAL FIRST POST:`,
      d.viral_first_post,
      ``,
      `📈 PHASE 1 STRATEGY:`,
      d.phase1_strategy,
      ``,
      `🎯 TWEET ANGLES:`,
      ...(d.tweet_angles || []).map((a, i) => `${i + 1}. ${a}`),
      ``,
      `💬 REPLY FARMING: ${d.reply_farming}`,
      `📚 NARRATIVE STACKING: ${d.narrative_stacking}`,
      `🚪 EXIT NARRATIVE: ${d.exit_narrative}`,
      ``,
      `🤡 WHY STUPID BUT RUNS:`,
      d.why_stupid_but_runs,
      ``,
      `💎 VIRALITY ARBITRAGE INDEX: ${d.virality_index}/100`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Full narrative copied');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
            <Beaker className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-foreground tracking-tight">🔥 DISCOVERY LAB</h2>
            <p className="text-xs text-muted-foreground">Pre-Viral Narrative Weaponization Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={maxDegen} onCheckedChange={setMaxDegen} />
            <span className={cn("text-xs font-bold", maxDegen ? "text-pink-400" : "text-muted-foreground")}>
              {maxDegen ? '💀 MAX DEGENERACY' : 'Normal Mode'}
            </span>
          </label>
          <Button
            onClick={hunt}
            disabled={loading}
            className="gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-bold"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            {loading ? 'Hunting...' : 'Hunt Narratives'}
          </Button>
        </div>
      </div>

      {/* Results */}
      {discoveries.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
          <Skull className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No discoveries yet. Hit <strong>Hunt Narratives</strong> to scan X for absurd, weaponizable narratives.</p>
        </div>
      )}

      {loading && discoveries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm text-muted-foreground">Scanning X for underpriced narratives...</p>
          <p className="text-xs text-muted-foreground/60">Weaponizing absurdity into liquidity</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {discoveries.map(d => {
          const tagInfo = ABSURDITY_TAGS[d.absurdity_tag] || { label: `🎲 ${d.absurdity_tag?.toUpperCase() || 'MISC'}`, color: 'bg-muted text-muted-foreground' };
          const isHigh = d.virality_index >= 70;
          const isExpanded = expandedId === d.id;
          return (
            <div
              key={d.id}
              className={cn(
                "rounded-xl border overflow-hidden transition-all",
                isHigh
                  ? "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                  : "border-border"
              )}
            >
              {/* Header */}
              <div className={cn(
                "px-4 py-2.5 border-b flex items-center gap-2 flex-wrap",
                isHigh ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/40 border-border"
              )}>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-bold", tagInfo.color)}>{tagInfo.label}</span>
                <span className={cn(
                  "text-sm font-black px-2.5 py-0.5 rounded-full ml-auto",
                  isHigh ? "bg-emerald-500/20 text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-muted text-muted-foreground"
                )}>
                  💎 {d.virality_index}/100
                </span>
              </div>

              {/* Body */}
              <div className="p-4 space-y-3">
                {/* Original tweet preview */}
                {d.original_tweet && (
                  <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">@{d.original_tweet.user}</span>
                      <span className="text-[10px] text-muted-foreground">❤ {d.original_tweet.likes}</span>
                      {d.original_tweet.url && (
                        <a href={d.original_tweet.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3">{d.original_tweet.text}</p>
                    {d.original_tweet.media_url && (
                      <img
                        src={d.original_tweet.media_url}
                        alt=""
                        className="w-full h-32 rounded-md object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxUrl(d.original_tweet.media_url!)}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                  </div>
                )}

                {/* Coin info */}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="text-base font-black text-foreground">{d.coin_name}</h3>
                  <span className="text-sm font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">${d.ticker}</span>
                </div>
                <p className="text-sm font-bold text-muted-foreground italic">"{d.tagline}"</p>

                {/* Scores */}
                <div className="grid grid-cols-4 gap-1 text-center">
                  {[
                    { label: 'Friction', val: d.meme_friction },
                    { label: 'Absurdity', val: d.monetization_absurdity },
                    { label: 'Elastic', val: d.narrative_elasticity },
                    { label: 'Viable', val: d.pumpfun_viability },
                  ].map(s => (
                    <div key={s.label} className="rounded-md bg-muted/40 p-1.5">
                      <div className={cn("text-sm font-bold", s.val >= 8 ? "text-emerald-400" : s.val >= 6 ? "text-amber-400" : "text-muted-foreground")}>{s.val}/10</div>
                      <div className="text-[9px] text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Expandable full narrative */}
                {isExpanded && (
                  <div className="space-y-3 pt-2 border-t border-border animate-fade-in">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">LORE ORIGIN</span>
                      <p className="text-xs text-foreground">{d.lore_origin}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Villain:</span> <span className="text-foreground font-bold">{d.villain}</span></div>
                      <div><span className="text-muted-foreground">Community:</span> <span className="text-foreground font-bold">{d.community_identity}</span></div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">🧠 PSYCHOLOGICAL HOOK</span>
                      <p className="text-xs text-foreground">{d.psychological_hook}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">📝 BIO</span>
                      <p className="text-xs text-muted-foreground">{d.bio_description}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">📝 PUMPFUN DESCRIPTION</span>
                      <p className="text-xs text-muted-foreground">{d.pumpfun_description}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">🚀 LAUNCH THREAD</span>
                      <p className="text-xs text-foreground whitespace-pre-wrap">{d.launch_thread}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">📱 VIRAL FIRST POST</span>
                      <p className="text-xs text-foreground">{d.viral_first_post}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">📈 PHASE 1 STRATEGY</span>
                      <p className="text-xs text-foreground">{d.phase1_strategy}</p>
                    </div>
                    {d.tweet_angles?.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">🎯 TWEET ANGLES</span>
                        <ol className="text-xs text-foreground space-y-0.5 list-decimal list-inside">
                          {d.tweet_angles.map((a, i) => <li key={i}>{a}</li>)}
                        </ol>
                      </div>
                    )}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">💬 REPLY FARMING</span>
                      <p className="text-xs text-muted-foreground">{d.reply_farming}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">📚 NARRATIVE STACKING</span>
                      <p className="text-xs text-muted-foreground">{d.narrative_stacking}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">🚪 EXIT NARRATIVE</span>
                      <p className="text-xs text-muted-foreground">{d.exit_narrative}</p>
                    </div>
                    <div className="space-y-1 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">🤡 WHY STUPID BUT RUNS</span>
                      <p className="text-xs text-foreground font-medium">{d.why_stupid_but_runs}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  >
                    <Eye className="h-3 w-3" /> {isExpanded ? 'Collapse' : 'Full Intel'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => copyAll(d)}
                  >
                    <Copy className="h-3 w-3" /> Copy All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-emerald-400 ml-auto"
                    onClick={() => toast.info('War Chest coming soon')}
                  >
                    <Rocket className="h-3 w-3" /> War Chest
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-4xl p-2 bg-black/90">
          {lightboxUrl && (
            <img src={lightboxUrl} alt="Source" className="w-full h-auto max-h-[85vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
