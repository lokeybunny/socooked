import { useEffect, useMemo, useState } from 'react';
import { Wallet, Pencil, ExternalLink, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useStudioJobs } from '@/lib/studio/hooks';
import type { GenerationJob } from '@/lib/studio/types';

const STORAGE_KEY = 'studio_atlas_credits_usd';
const PROCESSED_KEY = 'studio_atlas_credits_processed_ids';

// Rough per-second cost estimates (USD) for Seedance-class video gen.
// Override per task_type / resolution as needed.
const COST_PER_SECOND_USD: Record<string, number> = {
  t2v: 0.12,
  i2v: 0.14,
  ti2v: 0.14,
  s2v: 0.16,
  animate: 0.15,
};
const DEFAULT_DURATION = 5;

function estimateCost(job: GenerationJob): number {
  const rate = COST_PER_SECOND_USD[job.task_type] ?? 0.12;
  const duration = Number(job.settings_json?.duration) || DEFAULT_DURATION;
  const res = String(job.settings_json?.resolution || '');
  const hiRes = /1280|1920|1024/.test(res) ? 1.4 : 1;
  return +(rate * duration * hiRes).toFixed(2);
}

function loadProcessed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PROCESSED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveProcessed(set: Set<string>) {
  // cap to last 500 ids
  const arr = Array.from(set).slice(-500);
  localStorage.setItem(PROCESSED_KEY, JSON.stringify(arr));
}

export function StudioCreditsBadge() {
  const { jobs } = useStudioJobs();
  const [balance, setBalance] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [lastDeduct, setLastDeduct] = useState<number | null>(null);

  useEffect(() => {
    setBalance(localStorage.getItem(STORAGE_KEY) || '');
  }, []);

  // Auto-decrement when a job transitions to completed
  useEffect(() => {
    if (!jobs.length) return;
    const current = parseFloat(localStorage.getItem(STORAGE_KEY) || '');
    if (!Number.isFinite(current)) return;

    const processed = loadProcessed();
    let next = current;
    let deducted = 0;

    for (const job of jobs) {
      if (job.status !== 'completed') continue;
      if (processed.has(job.id)) continue;
      const cost = estimateCost(job);
      next -= cost;
      deducted += cost;
      processed.add(job.id);
    }

    if (deducted > 0) {
      const newBal = Math.max(0, +next.toFixed(2)).toString();
      localStorage.setItem(STORAGE_KEY, newBal);
      saveProcessed(processed);
      setBalance(newBal);
      setLastDeduct(+deducted.toFixed(2));
      window.setTimeout(() => setLastDeduct(null), 3000);
    }
  }, [jobs]);

  const save = () => {
    const cleaned = draft.replace(/[^0-9.]/g, '');
    localStorage.setItem(STORAGE_KEY, cleaned);
    setBalance(cleaned);
    setEditing(false);
  };

  const display = useMemo(() => (balance ? `$${Number(balance).toFixed(2)}` : '—'), [balance]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur relative">
      <Wallet className="w-3.5 h-3.5 text-violet-400" />
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Credits</span>
      {editing ? (
        <>
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            className="h-6 w-20 text-xs px-2"
            placeholder="0.00"
          />
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={save}><Check className="w-3 h-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}><X className="w-3 h-3" /></Button>
        </>
      ) : (
        <>
          <span className="text-sm font-semibold tabular-nums">{display}</span>
          {lastDeduct !== null && (
            <span className="text-[10px] font-semibold text-red-400 tabular-nums animate-in fade-in slide-in-from-right-2">
              −${lastDeduct.toFixed(2)}
            </span>
          )}
          <button
            onClick={() => { setDraft(balance); setEditing(true); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Edit balance"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <a
            href="https://console.atlascloud.ai/billing"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Open Atlas Cloud billing"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </>
      )}
    </div>
  );
}
