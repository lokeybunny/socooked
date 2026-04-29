import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Trash2, Ban, Plus } from 'lucide-react';
import { format } from 'date-fns';

type DNDRow = {
  id: string;
  phone: string;
  phone_last10: string;
  reason: string | null;
  source: string;
  original_message_body: string | null;
  created_at: string;
};

function formatPhone(raw: string | null | undefined) {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function normalizeToE164(raw: string): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

export default function DNDListTab() {
  const [rows, setRows] = useState<DNDRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);
  const hasLoaded = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasLoaded.current) setLoading(true);
    const { data } = await supabase
      .from('sms_dnd_list')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    setRows((data as DNDRow[]) || []);
    setLoading(false);
    hasLoaded.current = true;
  }, []);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('sms-dnd-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_dnd_list' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const addEntry = async () => {
    const e164 = normalizeToE164(newPhone);
    if (!e164) { toast.error('Enter a valid 10-digit US phone'); return; }
    setAdding(true);
    const { error } = await supabase.from('sms_dnd_list').upsert(
      {
        phone: e164,
        phone_last10: e164.replace(/\D/g, '').slice(-10),
        reason: newReason.trim() || 'manual',
        source: 'manual',
      },
      { onConflict: 'phone_last10' },
    );
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Added to DND');
    setNewPhone('');
    setNewReason('');
    load(true);
  };

  const removeEntry = async (id: string, phone: string) => {
    if (!confirm(`Remove ${formatPhone(phone)} from DND?`)) return;
    const { error } = await supabase.from('sms_dnd_list').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Removed from DND');
    load(true);
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Ban className="h-4 w-4 text-red-400" />
        <span className="text-sm font-semibold flex-1">DND — Do Not Text</span>
        <Button size="sm" variant="ghost" onClick={() => load(false)}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        These numbers will never receive an SMS from this account. Negative replies in Hook Reply land here automatically.
      </p>

      <div className="flex gap-2 items-end flex-wrap border border-border rounded-lg p-3 bg-card/40">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] text-muted-foreground">Phone</label>
          <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+1 555 555 5555" className="h-8" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] text-muted-foreground">Reason (optional)</label>
          <Input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="e.g. requested removal" className="h-8" />
        </div>
        <Button size="sm" onClick={addEntry} disabled={adding}>
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Add
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-400px)] min-h-[400px]">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No numbers in DND</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map(r => (
              <div key={r.id} className="flex items-center gap-2 border border-border rounded px-3 py-2">
                <span className="text-sm font-mono font-semibold flex-1">{formatPhone(r.phone)}</span>
                <Badge variant="outline" className="text-[9px] bg-muted/30">{r.source}</Badge>
                {r.reason && <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{r.reason}</span>}
                <span className="text-[10px] text-muted-foreground">{format(new Date(r.created_at), 'MMM d')}</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => removeEntry(r.id, r.phone)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
