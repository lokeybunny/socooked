import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

const CRON_INTERVAL_MS = 5 * 60 * 1000;

function getNextCronMs(): number {
  const now = Date.now();
  return CRON_INTERVAL_MS - (now % CRON_INTERVAL_MS);
}

export default function CronCountdown() {
  const [remaining, setRemaining] = useState(getNextCronMs);

  useEffect(() => {
    const id = setInterval(() => setRemaining(getNextCronMs()), 1000);
    return () => clearInterval(id);
  }, []);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const label = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground tabular-nums">
      <Timer className="h-3 w-3" />
      {label}
    </span>
  );
}
