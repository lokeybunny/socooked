import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Phone as PhoneIcon, RefreshCw, PhoneIncoming, PhoneOutgoing, Search, Link, Unlink } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

const RC_FN = 'ringcentral-api';
const RC_OAUTH_FN = 'ringcentral-oauth';

async function callRC(action: string, params?: Record<string, string>): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const qp = new URLSearchParams({ action, ...params });
  const url = `https://${projectId}.supabase.co/functions/v1/${RC_FN}?${qp}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'RingCentral API error');
  return data;
}

async function callOAuth(action: string, params?: Record<string, string>): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const qp = new URLSearchParams({ action, ...params });
  const url = `https://${projectId}.supabase.co/functions/v1/${RC_OAUTH_FN}?${qp}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': session ? `Bearer ${session.access_token}` : '',
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'OAuth error');
  return data;
}

export default function PhonePage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Check for OAuth callback code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      // Remove code from URL
      window.history.replaceState({}, '', window.location.pathname);
      handleOAuthCallback(code);
    } else {
      checkConnection();
    }
  }, []);

  const checkConnection = async () => {
    try {
      const data = await callOAuth('status');
      setConnected(data.connected);
      if (data.connected) loadCalls();
    } catch {
      setConnected(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const data = await callOAuth('auth-url', { state: 'rc-oauth' });
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || 'Failed to start OAuth');
      setConnecting(false);
    }
  };

  const handleOAuthCallback = async (code: string) => {
    setConnecting(true);
    try {
      await callOAuth('callback', { code });
      toast.success('RingCentral connected successfully!');
      setConnected(true);
      loadCalls();
    } catch (e: any) {
      toast.error(e.message || 'OAuth callback failed');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await callOAuth('disconnect');
      setConnected(false);
      setCalls([]);
      toast.success('RingCentral disconnected');
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect');
    }
  };

  const loadCalls = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callRC('call-log');
      setCalls(data.calls || []);
    } catch (e: any) {
      console.error('RingCentral call log error:', e);
      if (e.message?.includes('not connected') || e.message?.includes('reconnect')) {
        setConnected(false);
      }
      toast.error(e.message || 'Failed to load call log');
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
            <p className="text-muted-foreground mt-1">Make calls & view history.</p>
          </div>
          <div className="flex items-center gap-2">
            {connected === true && (
              <>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDisconnect} className="gap-1.5 text-destructive">
                  <Unlink className="h-4 w-4" /> Disconnect
                </Button>
              </>
            )}
          </div>
        </div>

        {connected === null ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Checking connection...</span>
          </div>
        ) : connected === false ? (
          <div className="glass-card p-8 text-center space-y-4">
            <PhoneIcon className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Connect RingCentral</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Authorize your RingCentral account to view call logs, send SMS, and access voicemails.
            </p>
            <Button onClick={handleConnect} disabled={connecting} className="gap-2">
              <Link className="h-4 w-4" />
              {connecting ? 'Connecting...' : 'Connect RingCentral'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
            {/* Call Log */}
            <div className="space-y-4">
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
                <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
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

            {/* Embedded RingCentral Phone */}
            <div className="glass-card rounded-2xl overflow-hidden flex flex-col items-center p-0 sticky top-6 self-start">
              <div className="w-full px-4 py-3 border-b border-border/50 flex items-center gap-2">
                <PhoneIcon className="h-4 w-4 text-foreground" />
                <span className="text-sm font-medium text-foreground">RingCentral Phone</span>
              </div>
              <iframe
                width="300"
                height="560"
                id="rc-widget"
                allow="autoplay; microphone"
                src="https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/app.html"
                className="border-0 bg-transparent"
                style={{ colorScheme: 'auto' }}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
