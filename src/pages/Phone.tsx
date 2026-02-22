import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Phone as PhoneIcon, RefreshCw, PhoneIncoming, PhoneOutgoing,
  Search, MessageSquare, Voicemail, Send, Link, Unlink,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

const RC_FN = 'ringcentral-api';
const RC_OAUTH_FN = 'ringcentral-oauth';

async function callRC(action: string, params?: Record<string, string>, body?: any): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const qp = new URLSearchParams({ action, ...params });
  const url = `https://${projectId}.supabase.co/functions/v1/${RC_FN}?${qp}`;

  const opts: RequestInit = {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    opts.method = 'POST';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
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
  const [smsMessages, setSmsMessages] = useState<any[]>([]);
  const [voicemails, setVoicemails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('calls');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  // SMS compose state
  const [smsTo, setSmsTo] = useState('');
  const [smsText, setSmsText] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);

  // Check for OAuth callback code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
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
      if (data.connected) loadAll();
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
      loadAll();
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
      setSmsMessages([]);
      setVoicemails([]);
      toast.success('RingCentral disconnected');
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect');
    }
  };

  const loadCalls = useCallback(async () => {
    try {
      const data = await callRC('call-log');
      setCalls(data.calls || []);
    } catch (e: any) {
      console.error('Call log error:', e);
      if (e.message?.includes('not connected') || e.message?.includes('reconnect')) {
        setConnected(false);
      }
      toast.error(e.message || 'Failed to load call log');
    }
  }, []);

  const loadSMS = useCallback(async () => {
    try {
      const data = await callRC('sms-list');
      setSmsMessages(data.messages || []);
    } catch (e: any) {
      console.error('SMS error:', e);
    }
  }, []);

  const loadVoicemails = useCallback(async () => {
    try {
      const data = await callRC('voicemail-list');
      setVoicemails(data.messages || []);
    } catch (e: any) {
      console.error('Voicemail error:', e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCalls(), loadSMS(), loadVoicemails()]);
    setLoading(false);
  }, [loadCalls, loadSMS, loadVoicemails]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleSendSms = async () => {
    if (!smsTo.trim() || !smsText.trim()) {
      toast.error('Phone number and message are required');
      return;
    }
    setSmsSending(true);
    try {
      await callRC('sms-send', undefined, { to: smsTo, text: smsText });
      toast.success('SMS sent!');
      setSmsTo('');
      setSmsText('');
      setSmsDialogOpen(false);
      loadSMS();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send SMS');
    } finally {
      setSmsSending(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const filterItems = (items: any[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(c =>
      (c.from || '').toLowerCase().includes(q) ||
      (c.to || '').toLowerCase().includes(q) ||
      (c.result || '').toLowerCase().includes(q) ||
      (c.subject || '').toLowerCase().includes(q)
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Phone</h1>
            <p className="text-muted-foreground mt-1">Calls, SMS & voicemails.</p>
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
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="calls" className="gap-1.5">
                      <PhoneIcon className="h-4 w-4" /> Calls
                    </TabsTrigger>
                    <TabsTrigger value="sms" className="gap-1.5">
                      <MessageSquare className="h-4 w-4" /> SMS
                    </TabsTrigger>
                    <TabsTrigger value="voicemail" className="gap-1.5">
                      <Voicemail className="h-4 w-4" /> Voicemail
                    </TabsTrigger>
                  </TabsList>

                  {activeTab === 'sms' && (
                    <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-1.5">
                          <Send className="h-4 w-4" /> New SMS
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Send SMS</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <Input
                            placeholder="To phone number (e.g. +15551234567)"
                            value={smsTo}
                            onChange={(e) => setSmsTo(e.target.value)}
                          />
                          <Textarea
                            placeholder="Message..."
                            value={smsText}
                            onChange={(e) => setSmsText(e.target.value)}
                            rows={3}
                          />
                          <Button onClick={handleSendSms} disabled={smsSending} className="w-full gap-1.5">
                            <Send className="h-4 w-4" />
                            {smsSending ? 'Sending...' : 'Send'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <>
                    <TabsContent value="calls">
                      {filterItems(calls).length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No calls found.</p>
                      ) : (
                        <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                          {filterItems(calls).map(call => (
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
                    </TabsContent>

                    <TabsContent value="sms">
                      {filterItems(smsMessages).length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No SMS messages found.</p>
                      ) : (
                        <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                          {filterItems(smsMessages).map(msg => (
                            <div key={msg.id} className="glass-card p-4 flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0">
                                {msg.direction === 'inbound' ? (
                                  <PhoneIncoming className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                ) : (
                                  <PhoneOutgoing className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {msg.direction === 'inbound' ? msg.from : msg.to}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {msg.subject || 'No content'}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {msg.createdAt ? format(new Date(msg.createdAt), 'MMM d, yyyy h:mm a') : '—'}
                                    {' · '}{msg.direction}
                                  </p>
                                </div>
                              </div>
                              <StatusBadge status={msg.messageStatus || 'unknown'} />
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="voicemail">
                      {filterItems(voicemails).length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No voicemails found.</p>
                      ) : (
                        <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                          {filterItems(voicemails).map(vm => (
                            <div key={vm.id} className="glass-card p-4 flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0">
                                <Voicemail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{vm.from}</p>
                                  <p className="text-xs text-muted-foreground truncate">→ {vm.to}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {vm.createdAt ? format(new Date(vm.createdAt), 'MMM d, yyyy h:mm a') : '—'}
                                  </p>
                                </div>
                              </div>
                              <StatusBadge status={vm.readStatus || 'unknown'} />
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </>
                )}
              </Tabs>
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
