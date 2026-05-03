import { useEffect, useState } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  deadlineAt: string | null;
  pausedAt?: string | null;
  totalPausedSeconds?: number;
  compact?: boolean;
}

function getRemaining(deadline: string, pausedAt: string | null | undefined, paused: number): number {
  const dl = new Date(deadline).getTime();
  const now = pausedAt ? new Date(pausedAt).getTime() : Date.now();
  return dl - now + paused * 1000;
}

export function CountdownTimer({ deadlineAt, pausedAt, totalPausedSeconds = 0, compact }: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!deadlineAt || pausedAt) return;
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [deadlineAt, pausedAt]);

  if (!deadlineAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
        <Timer className="h-3.5 w-3.5" />
        Not started
      </span>
    );
  }

  const remainingMs = getRemaining(deadlineAt, pausedAt, totalPausedSeconds);
  const overdue = remainingMs <= 0;
  const abs = Math.abs(remainingMs);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const remainingHours = remainingMs / 3600000;
  let tone = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
  let pulse = false;
  if (overdue) { tone = 'text-red-400 border-red-500/40 bg-red-500/10'; pulse = true; }
  else if (remainingHours < 4) { tone = 'text-red-400 border-red-500/40 bg-red-500/10'; pulse = true; }
  else if (remainingHours < 12) { tone = 'text-orange-400 border-orange-500/30 bg-orange-500/5'; }
  else if (remainingHours < 24) { tone = 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5'; }

  const label = overdue
    ? `${h}h ${String(m).padStart(2, '0')}m OVERDUE`
    : `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono tabular-nums rounded-md border px-2 py-1',
        compact ? 'text-[11px]' : 'text-xs',
        tone,
        pulse && 'animate-pulse',
        pausedAt && 'opacity-60',
      )}
    >
      {overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
      {pausedAt ? 'PAUSED' : label}
    </span>
  );
}
