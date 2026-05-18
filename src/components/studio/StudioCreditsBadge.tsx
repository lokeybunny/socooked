import { useEffect, useState } from 'react';
import { Wallet, Pencil, ExternalLink, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'studio_atlas_credits_usd';

export function StudioCreditsBadge() {
  const [balance, setBalance] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setBalance(localStorage.getItem(STORAGE_KEY) || '');
  }, []);

  const save = () => {
    const cleaned = draft.replace(/[^0-9.]/g, '');
    localStorage.setItem(STORAGE_KEY, cleaned);
    setBalance(cleaned);
    setEditing(false);
  };

  const display = balance ? `$${Number(balance).toFixed(2)}` : '—';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur">
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
