import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, PhoneCall, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const DISCONNECT_PATTERN = '%just got disconnected%';

type Row = { id: string; phone: string; customer_id: string | null; body: string; created_at: string };

export default function DisconnectedTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campName, setCampName] = useState('Disconnected Follow-Up');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('communications')
      .select('id, to_address, phone_number, customer_id, body, created_at')
      .eq('type', 'sms')
      .eq('direction', 'outbound')
      .ilike('body', DISCONNECT_PATTERN)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) toast.error(error.message);
    
    const seen = new Map<string, Row>();
    (data || []).forEach((r: any) => {
      const ph = (r.to_address || r.phone_number || '').toString();
      const last10 = ph.replace(/\D/g, '').slice(-10);
      if (!last10 || seen.has(last10)) return;
      seen.set(last10, { id: r.id, phone: `+1${last10}`, customer_id: r.customer_id, body: r.body, created_at: r.created_at });
    });
    setRows(Array.from(seen.values()));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = (phone: string) => {
    const next = new Set(selected);
    next.has(phone) ? next.delete(phone) : next.add(phone);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.phone)));
  };

  const copyPhones = () => {
    const list = (selected.size > 0 ? rows.filter(r => selected.has(r.phone)) : rows).map(r => r.phone).join('\n');
    navigator.clipboard.writeText(list);
    toast.success(`Copied ${list.split('\n').length} numbers`);
  };

  const createPowerDCampaign = async () => {
    const targets = selected.size > 0 ? rows.filter(r => selected.has(r.phone)) : rows;
    if (targets.length === 0) return toast.error('No numbers to add');
    if (!campName.trim()) return toast.error('Campaign name required');
    setCreating(true);
    try {
      const { data: camp, error: cErr } = await supabase
        .from('powerdial_campaigns')
        .insert({ name: campName, status: 'idle', total_leads: targets.length })
        .select().single();
      if (cErr || !camp) throw cErr;
      const queueRows = targets.map((t, i) => ({
        campaign_id: camp.id,
        phone: t.phone,
        customer_id: t.customer_id,
        position: i,
        status: 'pending',
      }));
      const { error: qErr } = await supabase.from('powerdial_queue').insert(queueRows);
      if (qErr) throw qErr;
      toast.success(`Power D campaign "${campName}" created with ${targets.length} contacts`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-orange-400" /> Disconnected SMS Recipients
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Numbers that received the "just got disconnected" follow-up text. Build a Power D campaign from them.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={campName}
            onChange={e => setCampName(e.target.value)}
            placeholder="Power D campaign name"
            className="h-8 max-w-xs"
          />
          <Button size="sm" onClick={createPowerDCampaign} disabled={creating || rows.length === 0} className="bg-orange-500 hover:bg-orange-600">
            {creating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5 mr-1" />}
            Create Power D Campaign ({selected.size > 0 ? selected.size : rows.length})
          </Button>
          <Button size="sm" variant="outline" onClick={copyPhones} disabled={rows.length === 0}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy Numbers
          </Button>
          <Badge variant="outline" className="ml-auto">{rows.length} unique</Badge>
        </div>
      </div>

      <div className="glass-card p-3">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No "just got disconnected" texts found yet</p>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="flex items-center gap-2 px-2 pb-2 border-b border-border mb-2">
              <Checkbox checked={selected.size === rows.length && rows.length > 0} onCheckedChange={toggleAll} />
              <span className="text-[11px] text-muted-foreground">Select all</span>
            </div>
            <div className="space-y-1">
              {rows.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-2 py-2 hover:bg-muted/40 rounded">
                  <Checkbox checked={selected.has(r.phone)} onCheckedChange={() => toggle(r.phone)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono">{r.phone}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.body}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
