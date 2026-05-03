import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { QueueCard, type QueueRow } from '@/components/queue/QueueCard';
import { QueueMetrics, type Metrics } from '@/components/queue/QueueMetrics';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Search, Sparkles, Send, MessageSquare, Loader2 } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Highest Urgency' },
  { key: 'recent', label: 'Recently Signed' },
  { key: 'payment_pending', label: 'Payment Pending' },
  { key: 'in_production', label: 'In Production' },
  { key: 'completed', label: 'Completed' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'oldest', label: 'Oldest' },
];

export default function AIQueue() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [, setNow] = useState(0);
  const [smsTarget, setSmsTarget] = useState<QueueRow | null>(null);
  const [smsBody, setSmsBody] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const navigate = useNavigate();

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from('production_queue' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error(error);
      toast({ title: 'Failed to load queue', description: error.message, variant: 'destructive' });
    } else {
      setRows((data || []) as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    const ch = supabase
      .channel('production_queue_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_queue' }, () => fetchRows())
      .subscribe();
    const tick = setInterval(() => setNow(t => t + 1), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(tick); };
  }, []);

  // Sort + filter
  const sorted = useMemo(() => {
    const remaining = (r: QueueRow): number => {
      if (!r.deadline_at) return Number.POSITIVE_INFINITY;
      const dl = new Date(r.deadline_at).getTime();
      const now = r.paused_at ? new Date(r.paused_at).getTime() : Date.now();
      return dl - now + r.total_paused_seconds * 1000;
    };

    let list = [...rows];

    // Filter
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        [r.first_name, r.last_name, r.email, r.phone, r.listing_address]
          .some(v => v?.toLowerCase().includes(q))
      );
    }

    switch (filter) {
      case 'urgent':
        list = list.filter(r => r.deadline_at && r.status !== 'completed');
        list.sort((a, b) => remaining(a) - remaining(b));
        break;
      case 'recent':
        list.sort((a, b) => (b.signed_at || '').localeCompare(a.signed_at || ''));
        break;
      case 'payment_pending':
        list = list.filter(r => r.status === 'payment_pending' || (!r.payment_approved_at && r.status === 'signed'));
        break;
      case 'in_production':
        list = list.filter(r => r.status === 'in_production' || !!r.production_started_at && r.status !== 'completed');
        break;
      case 'completed':
        list = list.filter(r => r.status === 'completed' || r.status === 'delivered');
        break;
      case 'overdue':
        list = list.filter(r => r.deadline_at && remaining(r) < 0 && r.status !== 'completed');
        break;
      case 'assigned':
        list = list.filter(r => !!r.assigned_to);
        break;
      case 'oldest':
        list.sort((a, b) => (a as any).created_at?.localeCompare?.((b as any).created_at) ?? 0);
        break;
      default:
        // Default: overdue/active first by remaining, then unstarted
        list.sort((a, b) => {
          const ra = remaining(a), rb = remaining(b);
          if (ra === Number.POSITIVE_INFINITY && rb === Number.POSITIVE_INFINITY) return 0;
          if (ra === Number.POSITIVE_INFINITY) return 1;
          if (rb === Number.POSITIVE_INFINITY) return -1;
          return ra - rb;
        });
    }

    return list.map((r, i) => ({ ...r, position: i + 1 }));
  }, [rows, filter, search]);

  // Metrics
  const metrics: Metrics = useMemo(() => {
    const now = Date.now();
    const active = rows.filter(r => r.status !== 'completed' && r.status !== 'delivered').length;
    const inProduction = rows.filter(r => !!r.production_started_at && r.status !== 'completed').length;
    const activeTimers = rows.filter(r => !!r.deadline_at && !r.paused_at && r.status !== 'completed').length;
    const dueSoon = rows.filter(r => {
      if (!r.deadline_at || r.status === 'completed') return false;
      const left = new Date(r.deadline_at).getTime() - now;
      return left > 0 && left < 12 * 3600 * 1000;
    }).length;
    const overdue = rows.filter(r => {
      if (!r.deadline_at || r.status === 'completed') return false;
      return new Date(r.deadline_at).getTime() < now;
    }).length;
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const completedToday = rows.filter(r =>
      (r.status === 'completed' || r.status === 'delivered') &&
      (r as any).completed_at && new Date((r as any).completed_at).getTime() >= startOfDay.getTime()
    ).length;
    const completedRows = rows.filter(r => (r as any).completed_at && r.production_started_at);
    const avg = completedRows.length
      ? completedRows.reduce((sum, r) => sum + (new Date((r as any).completed_at).getTime() - new Date(r.production_started_at!).getTime()), 0) / completedRows.length / 3600000
      : null;
    return { active, inProduction, activeTimers, dueSoon, overdue, completedToday, avgCompletionHours: avg };
  }, [rows]);

  const handleAction = async (action: string, row: QueueRow) => {
    const updates: Record<string, any> = {};
    const nowIso = new Date().toISOString();
    switch (action) {
      case 'start': {
        const deadline = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
        Object.assign(updates, {
          production_started_at: nowIso,
          deadline_at: deadline,
          status: 'in_production',
          paused_at: null,
        });
        break;
      }
      case 'pause':
        updates.paused_at = nowIso;
        break;
      case 'resume': {
        if (row.paused_at) {
          const addedSeconds = Math.floor((Date.now() - new Date(row.paused_at).getTime()) / 1000);
          updates.total_paused_seconds = row.total_paused_seconds + addedSeconds;
          // Push deadline forward by paused duration
          if (row.deadline_at) {
            updates.deadline_at = new Date(new Date(row.deadline_at).getTime() + addedSeconds * 1000).toISOString();
          }
          updates.paused_at = null;
        }
        break;
      }
      case 'complete':
        Object.assign(updates, { status: 'completed', completed_at: nowIso });
        break;
      case 'open_customer':
        if (row.customer_id) navigate(`/customers?id=${row.customer_id}`);
        return;
      case 'view_agreement':
        if (row.proposal_id) navigate(`/proposals?id=${row.proposal_id}`);
        return;
      case 'notes': {
        const text = window.prompt('Add note', row.notes || '');
        if (text == null) return;
        updates.notes = text;
        break;
      }
      case 'assign': {
        const who = window.prompt('Assigned editor name (stored in meta)', row.meta?.assigned_name || '');
        if (who == null) return;
        updates.meta = { ...row.meta, assigned_name: who };
        updates.assigned_to = who ? row.assigned_to || crypto.randomUUID() : null;
        break;
      }
      case 'edit_address': {
        const addr = window.prompt('Listing address (street, city, state, zip)', row.listing_address || '');
        if (addr == null) return;
        updates.listing_address = addr.trim() || null;
        break;
      }
      case 'upload':
        toast({ title: 'Upload', description: 'Hook this to your file uploader.' });
        return;
      case 'send_update': {
        if (!row.phone) {
          toast({ title: 'No phone number', description: 'This customer has no phone on file.', variant: 'destructive' });
          return;
        }
        const firstName = row.first_name || (row.last_name ? '' : 'there');
        const addr = row.listing_address ? ` for ${row.listing_address}` : '';
        setSmsBody(`Hi ${firstName} — quick update on your AI listing video${addr}. `);
        setSmsTarget(row);
        return;
      }
    }

    if (Object.keys(updates).length) {
      const { error } = await supabase.from('production_queue' as any).update(updates).eq('id', row.id);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else toast({ title: 'Updated' });
    }
  };

  const sendSms = async () => {
    if (!smsTarget?.phone || !smsBody.trim()) {
      toast({ title: 'Missing info', description: 'Phone and message are required.', variant: 'destructive' });
      return;
    }
    setSmsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('powerdial-sms', {
        body: { action: 'send', to: smsTarget.phone, body: smsBody.trim() },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error || 'Send failed');
      toast({ title: 'SMS sent', description: `Message delivered to ${smsTarget.phone}` });
      setSmsTarget(null);
      setSmsBody('');
    } catch (e: any) {
      toast({ title: 'SMS failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSmsSending(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-400" />
              <h1 className="text-2xl font-semibold tracking-tight">AI Queue</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time production operations · 72h deadline tracking · auto-prioritized
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, address…"
              className="pl-9"
            />
          </div>
        </div>

        {/* Metrics */}
        <QueueMetrics metrics={metrics} />

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.key)}
              className={filter === f.key ? 'bg-emerald-500 text-black hover:bg-emerald-600' : 'h-8 text-xs'}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Loading queue…</div>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-3 text-emerald-400/50" />
            <p className="text-sm">No queue items yet. Signed proposals will appear here automatically.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {sorted.map(row => (
                <QueueCard key={row.id} row={row} onAction={handleAction} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Dialog open={!!smsTarget} onOpenChange={(open) => !open && setSmsTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-400" />
              Send SMS Update
            </DialogTitle>
            <DialogDescription asChild>
              {smsTarget ? (
                <span className="text-foreground/80">
                  To <span className="font-medium">{[smsTarget.first_name, smsTarget.last_name].filter(Boolean).join(' ') || 'Customer'}</span>
                  {' · '}
                  <span className="font-mono text-emerald-400">{smsTarget.phone}</span>
                </span>
              ) : <span />}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              placeholder="Type your message…"
              rows={6}
              className="resize-none"
              autoFocus
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{smsBody.length} chars · {Math.ceil(Math.max(1, smsBody.length) / 160)} segment{smsBody.length > 160 ? 's' : ''}</span>
              {smsTarget?.listing_address && <span className="truncate max-w-[60%]">📍 {smsTarget.listing_address}</span>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsTarget(null)} disabled={smsSending}>Cancel</Button>
            <Button onClick={sendSms} disabled={smsSending || !smsBody.trim()} className="bg-emerald-500 hover:bg-emerald-600 text-black">
              {smsSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
