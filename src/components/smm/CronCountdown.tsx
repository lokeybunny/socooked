import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';

const CRON_INTERVAL_MS = 5 * 60 * 1000;

function getNextCronMs(): number {
  const now = Date.now();
  return CRON_INTERVAL_MS - (now % CRON_INTERVAL_MS);
}

interface Props {
  onCronFire?: () => void;
}

export default function CronCountdown({ onCronFire }: Props) {
  const [remaining, setRemaining] = useState(getNextCronMs);
  const firedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const ms = getNextCronMs();
      setRemaining(ms);

      // When timer resets (crossed the boundary), fire the callback once
      if (ms > CRON_INTERVAL_MS - 3000) {
        if (!firedRef.current) {
          firedRef.current = true;
          // Small delay so the cron has time to process
          setTimeout(() => onCronFire?.(), 8000);
        }
      } else {
        firedRef.current = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [onCronFire]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const label = `${mins}:${String(secs).padStart(2, '0')}`;
  const isImminent = remaining < 15000;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono tabular-nums ${
      isImminent ? 'text-primary animate-pulse' : 'text-muted-foreground'
    }`}>
      <Timer className="h-3 w-3" />
      {label}
    </span>
  );
}
