import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageSquare, Send, RefreshCw, Loader2, Plus, ArrowLeft, Webhook } from 'lucide-react';
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
  provider?: string | null;
};

function isLandlineReply(m: SMSMessage) {
  if (!m || m.direction !== 'inbound') return false;
  return m.metadata?.landline_reply === true || m.provider === 'twilio';
}

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
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedRef = useRef(false);
  const prevActiveCountRef = useRef(0);
  // Per-thread latest inbound id we've already "seen" — persisted to localStorage so
  // cleared red dots stay cleared across refreshes / navigations.
  const SEEN_STORAGE_KEY = 'powerdial-sms-seen-inbound-v1';
  const seenInboundRef = useRef<Record<string, string>>((() => {
    try {
      const raw = localStorage.getItem(SEEN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })());
  const persistSeen = useCallback(() => {
    try { localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seenInboundRef.current)); } catch {}
  }, []);
  const [unreadThreads, setUnreadThreads] = useState<Set<string>>(new Set());
  const activeThreadRef = useRef<string | null>(null);
  useEffect(() => { activeThreadRef.current = activeThread; }, [activeThread]);

  const loadContacts = useCallback(async () => {
    const { data } = await supabase.from('sms_contacts').select('phone_last10, name');
    const map: Record<string, string> = {};
    (data || []).forEach((c: any) => { if (c.phone_last10) map[c.phone_last10] = c.name; });
    setContacts(map);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? hasLoadedRef.current;
    if (!silent) setLoading(true);
    // Pull any new inbound messages from VoidFix first (their webhook is unreliable)
    try {
      await supabase.functions.invoke('powerdial-sms', { body: { action: 'poll', limit: 50 } });
    } catch { /* non-fatal */ }
    const { data } = await supabase
      .from('communications')
      .select('*')
      .eq('type', 'sms')
      .order('created_at', { ascending: false })
      .limit(500);
    setMessages((prev) => {
      const next = (data as SMSMessage[]) || [];
      // Avoid re-rendering if nothing actually changed (prevents thread "recycle" flash)
      if (prev.length === next.length && prev.length > 0 && prev[0]?.id === next[0]?.id && prev[prev.length - 1]?.id === next[next.length - 1]?.id) {
        return prev;
      }
      return next;
    });
    if (!silent) setLoading(false);
    hasLoadedRef.current = true;
  }, []);

  useEffect(() => { load({ silent: false }); }, [load]);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Track unread inbound per thread.
  // On first load: mark a thread unread if its MOST RECENT message is inbound (you haven't replied).
  // On subsequent loads: any new inbound (id different from last-seen) marks unread.
  useEffect(() => {
    if (messages.length === 0) return;
    const latestInboundByThread = new Map<string, SMSMessage>();
    const latestAnyByThread = new Map<string, SMSMessage>();
    for (const m of messages) {
      const counterpart = m.direction === 'inbound' ? m.from_address : m.to_address;
      const key = normalizeLast10(counterpart);
      if (!key || key.length !== 10) continue;
      const curAny = latestAnyByThread.get(key);
      if (!curAny || new Date(m.created_at) > new Date(curAny.created_at)) {
        latestAnyByThread.set(key, m);
      }
      if (m.direction !== 'inbound') continue;
      const cur = latestInboundByThread.get(key);
      if (!cur || new Date(m.created_at) > new Date(cur.created_at)) {
        latestInboundByThread.set(key, m);
      }
    }
    setUnreadThreads(prev => {
      const next = new Set(prev);
      latestInboundByThread.forEach((msg, key) => {
        const alreadySeen = seenInboundRef.current[key] === msg.id;
        const isLatestInThread = latestAnyByThread.get(key)?.id === msg.id;
        if (activeThreadRef.current === key) {
          // Active thread — mark as seen, ensure not unread
          if (seenInboundRef.current[key] !== msg.id) {
            seenInboundRef.current[key] = msg.id;
            persistSeen();
          }
          next.delete(key);
          return;
        }
        // Unread only if (a) we haven't seen this inbound id AND (b) it's the latest message in the thread
        if (!alreadySeen && isLatestInThread) {
          next.add(key);
        }
      });
      return next;
    });
  }, [messages, persistSeen]);

  // Clear unread + update seen marker when a thread is opened
  useEffect(() => {
    if (!activeThread) return;
    setUnreadThreads(prev => {
      if (!prev.has(activeThread)) return prev;
      const next = new Set(prev);
      next.delete(activeThread);
      return next;
    });
    // Update seen pointer to the latest inbound currently in this thread
    const latest = messages
      .filter(m => m.direction === 'inbound' && normalizeLast10(m.from_address) === activeThread)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (latest) seenInboundRef.current[activeThread] = latest.id;
  }, [activeThread, messages]);

  // Background poll every 8s — seamless, no spinner, no thread reset
  useEffect(() => {
    const id = setInterval(() => { load({ silent: true }); }, 8000);
    return () => clearInterval(id);
  }, [load]);

  // Realtime — refresh on any new SMS row (silent, no flash)
  useEffect(() => {
    const channel = supabase
      .channel('powerdial-sms-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communications', filter: 'type=eq.sms' }, () => {
        load({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_contacts' }, () => {
        loadContacts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, loadContacts]);

  const displayPhone = useCallback((rawPhone: string | null | undefined) => {
    const last10 = normalizeLast10(rawPhone);
    const phone = formatPhone(rawPhone);
    const name = contacts[last10];
    return name ? `${name} — ${phone}` : phone;
  }, [contacts]);

  const saveContactName = useCallback(async (phoneRaw: string, name: string) => {
    const last10 = normalizeLast10(phoneRaw);
    if (!last10 || last10.length !== 10) { toast.error('Invalid phone'); return; }
    const trimmed = name.trim();
    if (!trimmed) {
      // Empty name = remove the contact
      const { error } = await supabase.from('sms_contacts').delete().eq('phone_last10', last10);
      if (error) { toast.error(error.message); return; }
      toast.success('Name removed');
    } else {
      const { error } = await supabase.from('sms_contacts').upsert(
        { phone_last10: last10, phone: phoneRaw || `+1${last10}`, name: trimmed },
        { onConflict: 'phone_last10' },
      );
      if (error) { toast.error(error.message); return; }
      toast.success('Name saved');
    }
    setEditingName(false);
    loadContacts();
  }, [loadContacts]);

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

  // Reset count tracker whenever active thread changes so "justOpened" detection is correct.
  useLayoutEffect(() => {
    prevActiveCountRef.current = 0;
  }, [activeThread]);

  // Always pin to newest message: on thread open, force scroll to bottom (with retries for layout settle).
  // On new messages arriving, only auto-scroll if user is near the bottom.
  useLayoutEffect(() => {
    if (!activeThread || activeMessages.length === 0) {
      prevActiveCountRef.current = activeMessages.length;
      return;
    }
    const root = scrollAreaRef.current;
    const viewport = root?.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
    const scrollEl = viewport || root;
    const prevCount = prevActiveCountRef.current;
    const grew = activeMessages.length > prevCount;
    const justOpened = prevCount === 0;
    let nearBottom = true;
    if (scrollEl && !justOpened) {
      nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 120;
    }

    const jumpToBottom = () => {
      const r = scrollAreaRef.current;
      const v = r?.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]') || r;
      if (v) v.scrollTop = v.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    };

    if (justOpened) {
      // Layout/images may not be ready — retry across frames to guarantee bottom alignment.
      requestAnimationFrame(jumpToBottom);
      requestAnimationFrame(() => requestAnimationFrame(jumpToBottom));
      const t1 = setTimeout(jumpToBottom, 60);
      const t2 = setTimeout(jumpToBottom, 200);
      const t3 = setTimeout(jumpToBottom, 500);
      prevActiveCountRef.current = activeMessages.length;
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    if (grew && nearBottom) {
      requestAnimationFrame(jumpToBottom);
    }
    prevActiveCountRef.current = activeMessages.length;
  }, [activeThread, activeMessages.length]);

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
        }
        // If composing fresh, return to inbox list. Otherwise stay in the active thread.
        if (showCompose) setActiveThread(null);
        load({ silent: true });
      }
    } finally {
      setSending(false);
    }
  };

  const handleTestInbound = async () => {
    setSending(true);
    try {
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/powerdial-sms`;
      const form = new URLSearchParams();
      form.set('number', '+13235559999');
      form.set('message', `Test inbound from VoidFix simulator @ ${new Date().toLocaleTimeString()}`);
      form.set('ID', `test-${Date.now()}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const text = await res.text();
      if (!res.ok) {
        toast.error(`Webhook returned ${res.status}: ${text.slice(0, 120)}`);
      } else {
        toast.success('Test inbound delivered — check inbox');
        setTimeout(() => load({ silent: true }), 600);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Test webhook failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="glass-card flex flex-col md:flex-row min-h-[500px] max-h-[calc(100vh-260px)] overflow-hidden">
      {/* Threads list */}
      <div className={`md:w-[300px] md:border-r border-border ${activeThread ? 'hidden md:block' : 'block'}`}>
        <div className="p-3 border-b border-border flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold flex-1">SMS Inbox</span>
          <Button size="sm" variant="ghost" onClick={handleTestInbound} title="Send a test inbound webhook to verify VoidFix integration">
            <Webhook className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => load({ silent: false })}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowCompose(true); setActiveThread(null); }}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-340px)] min-h-[400px]">
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
                    <div className="flex items-center gap-1.5 min-w-0">
                      {unreadThreads.has(key) && (
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)] animate-pulse shrink-0"
                          aria-label="New message"
                        />
                      )}
                      <span className="text-sm font-medium font-mono truncate">{displayPhone(t.phone)}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(t.last.created_at), 'MMM d')}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] px-1.5 ${t.last.direction === 'inbound' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {t.last.direction === 'inbound' ? 'IN' : 'OUT'}
                    </Badge>
                    {isLandlineReply(t.last) && (
                      <Badge variant="outline" className="text-[9px] px-1.5 bg-amber-500/20 text-amber-400 border-amber-500/40">
                        LANDLINE REPLY
                      </Badge>
                    )}
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
              {(() => {
                const activePhone = threads.find(t => normalizeLast10(t.phone) === activeThread)?.phone || activeThread || '';
                const last10 = normalizeLast10(activePhone);
                const currentName = contacts[last10] || '';
                if (editingName) {
                  return (
                    <Input
                      autoFocus
                      defaultValue={currentName}
                      placeholder="Add name (leave blank to remove)"
                      className="h-8 text-sm flex-1"
                      onBlur={(e) => saveContactName(activePhone, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveContactName(activePhone, (e.target as HTMLInputElement).value); }
                        if (e.key === 'Escape') { setEditingName(false); }
                      }}
                    />
                  );
                }
                return (
                  <span
                    className="text-sm font-semibold font-mono cursor-pointer hover:text-primary transition-colors select-none"
                    title="Double-click to add or edit a name"
                    onDoubleClick={() => { setNameDraft(currentName); setEditingName(true); }}
                  >
                    {displayPhone(activePhone)}
                  </span>
                );
              })()}
            </div>
            <ScrollArea ref={scrollAreaRef as any} className="flex-1 p-3 h-[calc(100vh-420px)] min-h-[300px]">
              <div className="space-y-2">
                {activeMessages.map(m => {
                  const errMsg = m.metadata?.error || m.metadata?.twilio_error_message;
                  const isFailed = ['failed', 'undelivered'].includes(String(m.status).toLowerCase()) || !!errMsg;
                  return (
                    <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${m.direction === 'outbound' ? (isFailed ? 'bg-red-500/20 border border-red-500/40' : 'bg-purple-500/20') : isLandlineReply(m) ? 'bg-amber-500/15 border border-amber-500/40' : 'bg-muted'} text-foreground`}>
                        {isLandlineReply(m) && (
                          <Badge variant="outline" className="text-[9px] px-1.5 mb-1 bg-amber-500/20 text-amber-400 border-amber-500/40">
                            LANDLINE REPLY · needs follow-up from VoidFix
                          </Badge>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">
                          {format(new Date(m.created_at), 'MMM d, h:mm a')} · {m.status}
                        </p>

                        {isFailed && errMsg && (
                          <p className="text-[10px] text-red-400 mt-1">{errMsg}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
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
