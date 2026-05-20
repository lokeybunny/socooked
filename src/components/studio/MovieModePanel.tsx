import { Clapperboard, Film, Clock, Layers } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  MovieModeConfig,
  SubScenesPerMaster,
  ClipDuration,
  calcRuntime,
} from '@/lib/studio/movieMode';

interface Props {
  config: MovieModeConfig;
  onChange: (next: MovieModeConfig) => void;
  masterCount: number;
}

const SUB_OPTIONS: SubScenesPerMaster[] = [2, 3, 4];
const DUR_OPTIONS: ClipDuration[] = [5, 10, 15];

export function MovieModePanel({ config, onChange, masterCount }: Props) {
  const runtime = calcRuntime(masterCount, config.subsPerScene, config.durationSec);

  return (
    <div
      className={`rounded-lg border transition-all ${
        config.enabled
          ? 'border-emerald-400/40 bg-emerald-500/[0.04] shadow-[0_0_24px_rgba(16,185,129,0.12)]'
          : 'border-white/10 bg-black/40'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => onChange({ ...config, enabled: v })}
            className="data-[state=checked]:bg-emerald-500"
          />
          <Clapperboard className={`w-4 h-4 ${config.enabled ? 'text-emerald-300' : 'text-white/40'}`} />
          <span
            className={`text-[11px] font-semibold tracking-[0.18em] uppercase ${
              config.enabled ? 'text-emerald-300' : 'text-white/60'
            }`}
          >
            Movie Mode
          </span>
        </label>

        {config.enabled && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-200/90 font-mono">
            <Clock className="w-3 h-3" />
            <span>{runtime.label}</span>
            <span className="opacity-60">· {runtime.clips} clips</span>
          </div>
        )}
      </div>

      {/* Expanded config */}
      {config.enabled && (
        <div className="px-3 pb-3 pt-1 border-t border-emerald-400/15 grid grid-cols-2 gap-3">
          {/* Subs per scene */}
          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-200/70 mb-1">
              <Layers className="w-3 h-3" /> Sub-scenes per master
            </div>
            <div className="flex gap-1">
              {SUB_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ ...config, subsPerScene: n })}
                  className={`flex-1 h-7 rounded text-xs font-semibold transition ${
                    config.subsPerScene === n
                      ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-200'
                      : 'bg-black/40 border border-white/10 text-white/60 hover:border-emerald-400/40'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-200/70 mb-1">
              <Film className="w-3 h-3" /> Clip length
            </div>
            <div className="flex gap-1">
              {DUR_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChange({ ...config, durationSec: d })}
                  className={`flex-1 h-7 rounded text-xs font-semibold transition ${
                    config.durationSec === d
                      ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-200'
                      : 'bg-black/40 border border-white/10 text-white/60 hover:border-emerald-400/40'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Runtime summary */}
          <div className="col-span-2 text-[10px] text-emerald-200/80 font-mono bg-black/40 rounded px-2 py-1.5 border border-emerald-400/20">
            {masterCount || '—'} master × {config.subsPerScene} sub × {config.durationSec}s
            <span className="mx-1 opacity-50">=</span>
            <span className="text-emerald-300 font-semibold">{runtime.label}</span>
            <span className="opacity-60"> total runtime · {runtime.clips} CDance2 generations</span>
          </div>
        </div>
      )}
    </div>
  );
}
