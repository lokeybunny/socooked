import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, Copy, ExternalLink, Flame, Brain, Rocket, Skull, Eye, Zap, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Discovery {
  id: string;
  original_tweet: { text: string; user: string; url: string; likes: number; media_url?: string; created_at?: string };
  categories: string[];
  liquidity_ignition_score: number;
  coin_name: string;
  ticker: string;
  tagline: string;
  lore_origin: string;
  enemy_narrative: string;
  community_name: string;
  bio_description: string;
  pumpfun_description: string;
  psychological_hook: string;
  launch_thread: string;
  viral_first_post: string;
  phase1_pump_script: string;
  engagement_farming_replies: string[];
  whale_bait_framing: string;
  exit_liquidity_narrative: string;
  why_stupid_but_runs: string;
  pump_probability: number;
  failure_risk: string;
  amplification_tweak: string;
  score_repeatability: number;
  score_tribal: number;
  score_simplicity: number;
  score_screenshot: number;
  score_shock: number;
  score_degen_humor: number;
  score_community_nickname: number;
  score_pump_velocity: number;
  score_exit_flexibility: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Literal Shitcoin': 'bg-amber-500/20 text-amber-400',
  'Toilet Tech': 'bg-amber-500/20 text-amber-400',
  'Bodily Function Monetization': 'bg-amber-500/20 text-amber-400',
  'Degenerate Dating': 'bg-pink-500/20 text-pink-400',
  'Dating App Tokenomics': 'bg-pink-500/20 text-pink-400',
  'Adult Humor Non-Explicit': 'bg-pink-500/20 text-pink-400',
  'AI Gone Too Far': 'bg-blue-500/20 text-blue-400',
  'AI Waifu Coin': 'bg-blue-500/20 text-blue-400',
  'Tech Bro Satire': 'bg-blue-500/20 text-blue-400',
  'Anti-VC Rebellion': 'bg-red-500/20 text-red-400',
  'Rug Parody': 'bg-red-500/20 text-red-400',
  'Self-Aware Scam': 'bg-red-500/20 text-red-400',
  'Community Cult': 'bg-purple-500/20 text-purple-400',
  'Zero Utility Pride': 'bg-purple-500/20 text-purple-400',
  'Fake Utility Meme': 'bg-emerald-500/20 text-emerald-400',
  'Absurd Startup Pitch': 'bg-emerald-500/20 text-emerald-400',
};

function getCategoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || 'bg-muted text-muted-foreground';
}

export function DiscoveryLab() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(false);
  const [maxDegen, setMaxDegen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [evolutionStats, setEvolutionStats] = useState<{ active: boolean; learned: number } | null>(null);

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
      if (res.status === 429) { toast.error('Rate limited — try again shortly'); return; }
      if (res.status === 402) { toast.error('AI credits exhausted — top up in Settings'); return; }
      const data = await res.json();
      if (data.success && data.discoveries?.length) {
        setDiscoveries(prev => [...data.discoveries, ...prev].slice(0, 50));
        setEvolutionStats({ active: data.evolution_active, learned: data.top_performers_learned || 0 });
        const evolMsg = data.evolution_active ? ` | 🧬 Learning from ${data.top_performers_learned} top performers` : '';
        toast.success(`🧠 ${data.discoveries.length} narratives weaponized from ${data.tweets_scanned} tweets${evolMsg}`);
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
      `📂 CATEGORIES: ${d.categories.join(', ')}`,
      ``, `📖 LORE ORIGIN:`, d.lore_origin,
      ``, `⚔️ ENEMY: ${d.enemy_narrative}`,
      `👥 COMMUNITY: ${d.community_name}`,
      ``, `🧠 PSYCHOLOGICAL HOOK:`, d.psychological_hook,
      ``, `📝 BIO: ${d.bio_description}`,
      `📝 PUMPFUN DESC: ${d.pumpfun_description}`,
      ``, `🚀 LAUNCH THREAD:`, d.launch_thread,
      ``, `📱 VIRAL FIRST POST:`, d.viral_first_post,
      ``, `📈 PHASE 1 PUMP SCRIPT:`, d.phase1_pump_script,
      ``, `🎯 ENGAGEMENT FARMING REPLIES:`,
      ...(d.engagement_farming_replies || []).map((r, i) => `${i + 1}. ${r}`),
      ``, `🐋 WHALE BAIT: ${d.whale_bait_framing}`,
      `🚪 EXIT NARRATIVE: ${d.exit_liquidity_narrative}`,
      ``, `🤡 WHY STUPID BUT RUNS:`, d.why_stupid_but_runs,
      ``, `📊 PUMP PROBABILITY: ${d.pump_probability}%`,
      `⚠️ FAILURE RISK: ${d.failure_risk}`,
      `🔧 AMPLIFICATION TWEAK: ${d.amplification_tweak}`,
      ``, `🚀 LIQUIDITY IGNITION SCORE: ${d.liquidity_ignition_score}/100`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Full narrative package copied');
  };

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[9px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-bold", value >= 8 ? "text-emerald-400" : value >= 6 ? "text-amber-400" : "text-muted-foreground")}>{value}</span>
      </div>
      <div className="h-1 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", value >= 8 ? "bg-emerald-500" : value >= 6 ? "bg-amber-500" : "bg-muted-foreground/40")}
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
            <Brain className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-foreground tracking-tight">🧠 MEME INTELLIGENCE LAB</h2>
            <p className="text-xs text-muted-foreground">
              Pre-Viral Narrative Weaponization Engine · 60 Categories
              {evolutionStats?.active && (
                <span className="ml-2 text-emerald-400 font-bold">· 🧬 Evolving ({evolutionStats.learned} learned)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={maxDegen} onCheckedChange={setMaxDegen} />
            <span className={cn("text-xs font-bold", maxDegen ? "text-pink-400" : "text-muted-foreground")}>
              {maxDegen ? '💀 MAX DEGENERACY' : 'Normal'}
            </span>
          </label>
          <Button
            onClick={hunt}
            disabled={loading}
            className="gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-bold"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading ? 'Scanning X...' : 'Hunt Narratives'}
          </Button>
        </div>
      </div>

      {/* Empty / Loading */}
      {discoveries.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
          <Skull className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No intelligence yet. Hit <strong>Hunt Narratives</strong> to extract narrative asymmetry from X.</p>
        </div>
      )}
      {loading && discoveries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm text-muted-foreground">Scanning X for narrative asymmetry...</p>
          <p className="text-xs text-muted-foreground/60">Converting overlooked absurdity into liquidity ignition events</p>
        </div>
      )}

      {/* Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {discoveries.map(d => {
          const isHot = d.liquidity_ignition_score >= 70;
          const isExpanded = expandedId === d.id;
          return (
            <div
              key={d.id}
              className={cn(
                "rounded-xl border overflow-hidden transition-all",
                isHot ? "border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]" : "border-border"
              )}
            >
              {/* Card Header */}
              <div className={cn(
                "px-4 py-2.5 border-b flex items-center gap-2 flex-wrap",
                isHot ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/40 border-border"
              )}>
                {d.categories?.slice(0, 3).map(cat => (
                  <span key={cat} className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold", getCategoryColor(cat))}>
                    {cat}
                  </span>
                ))}
                <span className={cn(
                  "text-sm font-black px-2.5 py-0.5 rounded-full ml-auto",
                  isHot ? "bg-emerald-500/20 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-muted text-muted-foreground"
                )}>
                  🚀 {d.liquidity_ignition_score}/100
                </span>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3">
                {/* Original tweet */}
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
                        className="w-full h-28 rounded-md object-cover cursor-pointer hover:opacity-80 transition-opacity"
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

                {/* 9-criteria scores */}
                <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                  <ScoreBar label="Repeat" value={d.score_repeatability} />
                  <ScoreBar label="Tribal" value={d.score_tribal} />
                  <ScoreBar label="Simple" value={d.score_simplicity} />
                  <ScoreBar label="Screenshot" value={d.score_screenshot} />
                  <ScoreBar label="Shock" value={d.score_shock} />
                  <ScoreBar label="Degen" value={d.score_degen_humor} />
                  <ScoreBar label="Nickname" value={d.score_community_nickname} />
                  <ScoreBar label="Velocity" value={d.score_pump_velocity} />
                  <ScoreBar label="Exit Flex" value={d.score_exit_flexibility} />
                </div>

                {/* Simulation strip */}
                <div className="flex items-center gap-2 text-[10px] px-2 py-1.5 rounded-md bg-muted/40">
                  <Target className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="text-muted-foreground">Pump Prob:</span>
                  <span className={cn("font-bold", d.pump_probability >= 70 ? "text-emerald-400" : d.pump_probability >= 40 ? "text-amber-400" : "text-red-400")}>
                    {d.pump_probability}%
                  </span>
                  <span className="text-muted-foreground ml-2 truncate">Tweak: {d.amplification_tweak || '—'}</span>
                </div>

                {/* Expanded intel */}
                {isExpanded && (
                  <div className="space-y-3 pt-2 border-t border-border animate-fade-in">
                    {[
                      { label: 'LORE ORIGIN', value: d.lore_origin },
                      { label: '⚔️ ENEMY NARRATIVE', value: d.enemy_narrative },
                      { label: '👥 COMMUNITY', value: d.community_name },
                      { label: '🧠 PSYCHOLOGICAL HOOK', value: d.psychological_hook },
                      { label: '📝 BIO', value: d.bio_description },
                      { label: '📝 PUMPFUN DESC', value: d.pumpfun_description },
                      { label: '🚀 LAUNCH THREAD', value: d.launch_thread, pre: true },
                      { label: '📱 VIRAL FIRST POST', value: d.viral_first_post },
                      { label: '📈 PHASE 1 PUMP SCRIPT', value: d.phase1_pump_script },
                      { label: '🐋 WHALE BAIT', value: d.whale_bait_framing },
                      { label: '🚪 EXIT NARRATIVE', value: d.exit_liquidity_narrative },
                    ].map(({ label, value, pre }) => value ? (
                      <div key={label} className="space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{label}</span>
                        <p className={cn("text-xs text-foreground", pre && "whitespace-pre-wrap")}>{value}</p>
                      </div>
                    ) : null)}

                    {d.engagement_farming_replies?.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">🎯 ENGAGEMENT FARMING REPLIES</span>
                        <ol className="text-xs text-foreground space-y-0.5 list-decimal list-inside">
                          {d.engagement_farming_replies.map((r, i) => <li key={i}>{r}</li>)}
                        </ol>
                      </div>
                    )}

                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">🤡 WHY STUPID BUT RUNS</span>
                      <p className="text-xs text-foreground font-medium">{d.why_stupid_but_runs}</p>
                    </div>

                    {d.failure_risk && (
                      <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 space-y-1">
                        <span className="text-[10px] font-bold text-red-400 uppercase">⚠️ FAILURE RISK</span>
                        <p className="text-xs text-foreground">{d.failure_risk}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setExpandedId(isExpanded ? null : d.id)}>
                    <Eye className="h-3 w-3" /> {isExpanded ? 'Collapse' : 'Full Intel'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => copyAll(d)}>
                    <Copy className="h-3 w-3" /> Copy All
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-emerald-400 ml-auto" onClick={() => toast.info('War Chest coming soon')}>
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
          {lightboxUrl && <img src={lightboxUrl} alt="Source" className="w-full h-auto max-h-[85vh] object-contain rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
