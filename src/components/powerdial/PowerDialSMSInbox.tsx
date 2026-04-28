import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageSquare, Send, RefreshCw, Loader2, Plus, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

type SMSMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  from_address: string | null;
  to_address: string | null;
  phone_number: string | null;
  status: string;
  external_id: string | null;
  created_at: string;
  customer_id: string | null;
  metadata: any;
};

function normalizeLast10(raw: string | null | undefined) {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '').slice(-10);
}

function formatPhone(raw: string | null | undefined) {
  const last10 = normalizeLast10(raw);
  if (last10.length !== 10) return raw || '';
  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
}

export default function PowerDialSMSInbox() {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showCompose, setShowCompose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('communications')
      .select('*')
      .eq('type', 'sms')
      .order('created_at', { ascending: false })
      .limit(500);
    setMessages((data as SMSMessage[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime — refresh on any new SMS row
  useEffect(() => {
    const channel = supabase
      .channel('powerdial-sms-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communications', filter: 'type=eq.sms' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Group messages by counterpart phone (last 10 digits)
  const threads = useMemo(() => {
    const map = new Map<string, { phone: string; messages: SMSMessage[]; last: SMSMessage; unreadInbound: number }>();
    for (const m of messages) {
      const counterpart = m.direction === 'inbound' ? m.from_address : m.to_address;
      const key = normalizeLast10(counterpart);
      if (!key || key.length !== 10) continue;
      const entry = map.get(key);
      if (!entry) {
        map.set(key, { phone: counterpart || key, messages: [m], last: m, unreadInbound: m.direction === 'inbound' ? 1 : 0 });
      } else {
        entry.messages.push(m);
        if (new Date(m.created_at) > new Date(entry.last.created_at)) entry.last = m;
        if (m.direction === 'inbound') entry.unreadInbound += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime());
  }, [messages]);

  const activeMessages = useMemo(() => {
    if (!activeThread) return [];
    const t = threads.find(t => normalizeLast10(t.phone) === activeThread);
    if (!t) return [];
    return [...t.messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [activeThread, threads]);

  const handleSend = async (toOverride?: string) => {
    const to = (toOverride ?? (activeThread ? threads.find(t => normalizeLast10(t.phone) === activeThread)?.phone : composeTo)) || '';
    const body = composeBody.trim();
    if (!to || !body) {
      toast.error('Recipient and message required');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('powerdial-sms', {
        body: { action: 'send', to, body },
      });
      if (error || !(data as any)?.ok) {
        toast.error((data as any)?.error || error?.message || 'Failed to send');
      } else {
        toast.success('SMS sent');
        setComposeBody('');
        if (showCompose) {
          setShowCompose(false);
          setComposeTo('');
          setActiveThread(normalizeLast10(to));
        }
        load();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="glass-card flex flex-col md:flex-row min-h-[500px]">
      {/* Threads list */}
      <div className={`md:w-[300px] md:border-r border-border ${activeThread ? 'hidden md:block' : 'block'}`}>
        <div className="p-3 border-b border-border flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold flex-1">SMS Inbox</span>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowCompose(true); setActiveThread(null); }}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="h-[450px]">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : threads.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No SMS yet</p>
          ) : (
            threads.map(t => {
              const key = normalizeLast10(t.phone);
              const isActive = activeThread === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveThread(key)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/30 ${isActive ? 'bg-muted/50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium font-mono">{formatPhone(t.phone)}</span>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(t.last.created_at), 'MMM d')}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={`text-[9px] px-1.5 ${t.last.direction === 'inbound' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {t.last.direction === 'inbound' ? 'IN' : 'OUT'}
                    </Badge>
                    <p className="text-xs text-muted-foreground truncate flex-1">{t.last.body}</p>
                  </div>
                </button>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* Conversation / compose */}
      <div className={`flex-1 flex flex-col ${activeThread || showCompose ? 'flex' : 'hidden md:flex'}`}>
        {showCompose ? (
          <div className="p-4 space-y-3 flex-1 flex flex-col">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setShowCompose(false); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold">New SMS</span>
            </div>
            <Input
              placeholder="To: +1 555 555 5555"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
            />
            <Textarea
              placeholder="Message..."
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              className="flex-1 min-h-[120px]"
            />
            <Button onClick={() => handleSend(composeTo)} disabled={sending || !composeTo || !composeBody.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send
            </Button>
          </div>
        ) : activeThread ? (
          <>
            <div className="p-3 border-b border-border flex items-center gap-2">
              <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setActiveThread(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold font-mono">
                {formatPhone(threads.find(t => normalizeLast10(t.phone) === activeThread)?.phone || activeThread)}
              </span>
            </div>
            <ScrollArea className="flex-1 p-3 h-[350px]">
              <div className="space-y-2">
                {activeMessages.map(m => (
                  <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${m.direction === 'outbound' ? 'bg-purple-500/20 text-foreground' : 'bg-muted text-foreground'}`}>
                      <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">
                        {format(new Date(m.created_at), 'MMM d, h:mm a')} · {m.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-3 border-t border-border flex gap-2">
              <Textarea
                placeholder="Type a reply..."
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                className="flex-1 min-h-[44px] max-h-[120px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSend();
                  }
                }}
              />
              <Button onClick={() => handleSend()} disabled={sending || !composeBody.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a thread or start a new SMS
          </div>
        )}
      </div>
    </div>
  );
}
