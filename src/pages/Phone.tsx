import { useEffect, useState, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Phone as PhoneIcon, RefreshCw, PhoneIncoming, PhoneOutgoing, Search } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';

const RC_FN = 'ringcentral-api';

async function callRC(action: string, params?: Record<string, string>): Promise<any> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const qp = new URLSearchParams({ action, ...params });
  const url = `https://${projectId}.supabase.co/functions/v1/${RC_FN}?${qp}`;
  const res = await fetch(url, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'RingCentral API error');
  return data;
}

export default function PhonePage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showWidget, setShowWidget] = useState(true);
  const widgetLoaded = useRef(false);

  // Load RingCentral Embeddable widget
  useEffect(() => {
    if (widgetLoaded.current) return;
    widgetLoaded.current = true;

    const script = document.createElement('script');
    script.src = 'https://ringcentral.github.io/ringcentral-embeddable/adapter.js?newAdapterUI=1';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup widget on unmount
      const widget = document.getElementById('rc-widget-adapter-frame');
      if (widget) widget.remove();
      const widgetEl = document.querySelector('[id^="rc-widget"]');
      if (widgetEl) widgetEl.remove();
      widgetLoaded.current = false;
    };
  }, []);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callRC('call-log');
      setCalls(data.calls || []);
    } catch (e: any) {
      console.error('RingCentral call log error:', e);
      toast.error(e.message || 'Failed to load call log');
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCalls();
    setRefreshing(false);
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const filtered = calls.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (c.from || '').toLowerCase().includes(q) ||
      (c.to || '').toLowerCase().includes(q) ||
      (c.result || '').toLowerCase().includes(q);
  });

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Phone</h1>
            <p className="text-muted-foreground mt-1">RingCentral call log & embedded phone widget.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showWidget ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowWidget(!showWidget)}
              className="gap-1.5"
            >
              <PhoneIcon className="h-4 w-4" />
              {showWidget ? 'Hide Phone' : 'Show Phone'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {showWidget && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground mb-2">
              The RingCentral phone widget is loaded in the bottom-right corner. Log in with your RingCentral account to make and receive calls, send SMS, and more.
            </p>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search calls..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading call log...</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No calls found.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(call => (
              <div key={call.id} className="glass-card p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  {call.direction === 'inbound' ? (
                    <PhoneIncoming className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  ) : (
                    <PhoneOutgoing className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {call.direction === 'inbound' ? call.from : call.to}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {call.direction === 'inbound' ? `→ ${call.to}` : `← ${call.from}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {call.startTime ? format(new Date(call.startTime), 'MMM d, yyyy h:mm a') : '—'}
                      {call.duration ? ` · ${formatDuration(call.duration)}` : ''}
                      {' · '}{call.direction}
                    </p>
                    {call.recording && (
                      <p className="text-xs text-primary mt-1">🎙️ Recording available</p>
                    )}
                  </div>
                </div>
                <StatusBadge status={call.result || 'unknown'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
