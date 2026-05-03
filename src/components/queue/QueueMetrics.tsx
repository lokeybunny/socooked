import { motion } from 'framer-motion';
import { Activity, AlertTriangle, CheckCircle2, Clock, Flame, PlayCircle, Timer, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Metrics {
  active: number;
  dueSoon: number;
  overdue: number;
  completedToday: number;
  inProduction: number;
  activeTimers: number;
  avgCompletionHours: number | null;
}

const cards: { key: keyof Metrics; label: string; icon: any; tone: string }[] = [
  { key: 'active', label: 'Active Queue', icon: Activity, tone: 'text-emerald-400' },
  { key: 'inProduction', label: 'In Production', icon: PlayCircle, tone: 'text-emerald-400' },
  { key: 'activeTimers', label: 'Active Timers', icon: Timer, tone: 'text-emerald-400' },
  { key: 'dueSoon', label: 'Due Soon (<12h)', icon: Flame, tone: 'text-orange-400' },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, tone: 'text-red-400' },
  { key: 'completedToday', label: 'Completed Today', icon: CheckCircle2, tone: 'text-emerald-400' },
];

export function QueueMetrics({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c, i) => {
        const value = metrics[c.key] ?? 0;
        const Icon = c.icon;
        return (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{c.label}</span>
              <Icon className={cn('h-4 w-4', c.tone)} />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-50" />
          </motion.div>
        );
      })}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 6 * 0.04 }}
        className="col-span-2 sm:col-span-3 lg:col-span-6 relative overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-400" />
          <span className="text-xs text-muted-foreground">Avg completion time</span>
        </div>
        <span className="font-mono tabular-nums text-sm text-foreground">
          {metrics.avgCompletionHours == null ? '—' : `${metrics.avgCompletionHours.toFixed(1)}h`}
        </span>
        <Zap className="h-4 w-4 text-emerald-400/60" />
      </motion.div>
    </div>
  );
}
