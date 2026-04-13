import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

type CallLog = {
  id: string;
  phone: string;
  attempt_number: number;
  twilio_status: string | null;
  amd_result: string | null;
  connected_to_vapi: boolean;
  transcript: string | null;
  summary: string | null;
  disposition: string | null;
  recording_url: string | null;
  follow_up_needed: boolean;
  created_at: string;
  customer_id: string | null;
};

export default function PowerDialCallLog({ campaignId }: { campaignId: string }) {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<CallLog | null>(null);

  const load = async () => {
    let query = supabase
      .from('powerdial_call_logs')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (filter !== 'all') {
      query = query.eq('amd_result', filter);
    }

    const { data } = await query;
    let results = (data as CallLog[]) || [];
    if (search.trim()) {
      const s = search.toLowerCase();
      results = results.filter(l => l.phone.includes(s) || l.transcript?.toLowerCase().includes(s) || l.summary?.toLowerCase().includes(s));
    }
    setLogs(results);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campaignId, filter]);

  const resultBadge: Record<string, { label: string; class: string }> = {
    human: { label: 'Human', class: 'bg-emerald-500/20 text-emerald-400' },
    voicemail: { label: 'Voicemail', class: 'bg-amber-500/20 text-amber-400' },
    busy: { label: 'Busy', class: 'bg-orange-500/20 text-orange-400' },
    no_answer: { label: 'No Answer', class: 'bg-yellow-500/20 text-yellow-400' },
    failed: { label: 'Failed', class: 'bg-red-500/20 text-red-400' },
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="glass-card">
      <div className="p-3 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="h-8 w-48" onKeyDown={e => e.key === 'Enter' && load()} />
          <Button size="sm" variant="ghost" onClick={load}><Search className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="flex gap-1">
          {['all', 'human', 'voicemail', 'busy', 'no_answer', 'failed'].map(f => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'ghost'} className="h-7 text-xs" onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'no_answer' ? 'No Ans' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{logs.length} records</span>
      </div>
      <ScrollArea className="h-[400px]">
        <div className="divide-y divide-border">
          {logs.map(log => {
            const badge = resultBadge[log.amd_result || ''] || { label: log.amd_result || '—', class: 'bg-muted text-muted-foreground' };
            return (
              <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(log)}>
                <span className="text-sm font-mono text-foreground w-32 shrink-0">{log.phone}</span>
                <Badge variant="outline" className={`text-[10px] ${badge.class}`}>{badge.label}</Badge>
                {log.connected_to_vapi && <Badge variant="outline" className="text-[10px] bg-blue-500/20 text-blue-400">Vapi</Badge>}
                {log.follow_up_needed && <Badge variant="outline" className="text-[10px] bg-purple-500/20 text-purple-400">Follow-up</Badge>}
                <span className="text-xs text-muted-foreground ml-auto">{format(new Date(log.created_at), 'MMM d h:mm a')}</span>
              </div>
            );
          })}
          {logs.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No call logs yet</p>}
        </div>
      </ScrollArea>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Call Detail — {selected?.phone}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">AMD Result:</span> <span className="font-medium">{selected.amd_result || '—'}</span></div>
                <div><span className="text-muted-foreground">Twilio Status:</span> <span className="font-medium">{selected.twilio_status || '—'}</span></div>
                <div><span className="text-muted-foreground">Vapi Connected:</span> <span className="font-medium">{selected.connected_to_vapi ? 'Yes' : 'No'}</span></div>
                <div><span className="text-muted-foreground">Disposition:</span> <span className="font-medium">{selected.disposition || '—'}</span></div>
                <div><span className="text-muted-foreground">Follow-up:</span> <span className="font-medium">{selected.follow_up_needed ? 'Yes' : 'No'}</span></div>
                <div><span className="text-muted-foreground">Attempt:</span> <span className="font-medium">#{selected.attempt_number}</span></div>
              </div>
              {selected.summary && (
                <div>
                  <p className="text-muted-foreground mb-1">Summary</p>
                  <p className="bg-muted/30 p-2 rounded text-xs">{selected.summary}</p>
                </div>
              )}
              {selected.transcript && (
                <div>
                  <p className="text-muted-foreground mb-1">Transcript</p>
                  <ScrollArea className="h-[200px]">
                    <pre className="bg-muted/30 p-2 rounded text-xs whitespace-pre-wrap">{selected.transcript}</pre>
                  </ScrollArea>
                </div>
              )}
              {selected.recording_url && (
                <a href={selected.recording_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary text-xs">
                  <ExternalLink className="h-3 w-3" /> Play Recording
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
