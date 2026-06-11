import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Send, Instagram, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type Message = {
  id: string;
  from: string;
  direction: 'inbound' | 'outbound';
  text: string;
  attachment_url: string | null;
  created_time: string | null;
};

type Conversation = {
  conversation_id: string;
  other_username: string;
  other_id: string;
  updated_time: string | null;
  message_count: number;
  last_message: Message | null;
  messages: Message[];
};

const FN_URL = `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/ig-dm-fetch`;

type Profile = { username: string; instagram: string | null };

const PROFILE_STORAGE_KEY = 'ig-dm:selected-profile';

export default function IgDm() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<string>(() => {
    if (typeof window === 'undefined') return 'unc86';
    return localStorage.getItem(PROFILE_STORAGE_KEY) || 'unc86';
  });

  const getAuth = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const headers = await getAuth();
      const res = await fetch(`${FN_URL}?action=profiles`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Failed to load profiles');
      const list: Profile[] = json.profiles || [];
      setProfiles(list);
      if (list.length && !list.find((p) => p.username === profile)) {
        setProfile(list[0].username);
      }
    } catch (e: any) {
      console.warn('[IgDm] loadProfiles failed', e);
    }
  }, [getAuth, profile]);

  const load = useCallback(async (selected: string) => {
    try {
      const headers = await getAuth();
      const res = await fetch(`${FN_URL}?user=${encodeURIComponent(selected)}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Failed to fetch DMs');
      const convs: Conversation[] = json.conversations || [];
      setConversations(convs);
      setActiveId(convs[0]?.conversation_id || null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load IG DMs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuth]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => {
    setLoading(true);
    localStorage.setItem(PROFILE_STORAGE_KEY, profile);
    load(profile);
  }, [profile, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      c.other_username.toLowerCase().includes(q) ||
      (c.last_message?.text || '').toLowerCase().includes(q)
    );
  }, [conversations, query]);

  const active = useMemo(
    () => conversations.find((c) => c.conversation_id === activeId) || null,
    [conversations, activeId]
  );

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleSend = async () => {
    if (!active || !reply.trim()) return;
    if (!active.other_id) {
      toast.error('Missing recipient id for this conversation');
      return;
    }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ recipient_id: active.other_id, message: reply }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Send failed');
      toast.success('Reply sent');
      setReply('');
      setTimeout(load, 500);
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const fmtTime = (t: string | null) => {
    if (!t) return '';
    try {
      return new Date(t).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch { return ''; }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Instagram className="w-5 h-5 text-pink-500" />
              <h1 className="text-lg font-semibold">IG DM</h1>
              <Badge variant="secondary" className="ml-1">{conversations.length}</Badge>
            </div>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-72px)]">
        {/* Conversation list */}
        <Card className="overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border/50">
            <Input
              placeholder="Search handle or message…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No conversations</div>
            ) : (
              <ul>
                {filtered.map((c) => {
                  const isActive = c.conversation_id === activeId;
                  return (
                    <li key={c.conversation_id}>
                      <button
                        onClick={() => setActiveId(c.conversation_id)}
                        className={cn(
                          'w-full text-left px-3 py-3 border-b border-border/30 hover:bg-muted/40 transition-colors',
                          isActive && 'bg-muted/60'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">@{c.other_username}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {fmtTime(c.updated_time)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {c.last_message?.direction === 'outbound' ? 'You: ' : ''}
                          {c.last_message?.text || (c.last_message?.attachment_url ? '📎 attachment' : '—')}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </Card>

        {/* Thread */}
        <Card className="overflow-hidden flex flex-col">
          {!active ? (
            <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
              <div className="flex flex-col items-center gap-2">
                <MessageSquare className="w-8 h-8" />
                Select a conversation
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                <div>
                  <div className="font-semibold">@{active.other_username}</div>
                  <div className="text-xs text-muted-foreground">{active.message_count} messages</div>
                </div>
                <a
                  href={`https://www.instagram.com/${active.other_username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-pink-500 hover:underline"
                >
                  Open profile
                </a>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-2">
                  {active.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                        m.direction === 'outbound'
                          ? 'ml-auto bg-primary text-primary-foreground'
                          : 'mr-auto bg-muted'
                      )}
                    >
                      {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                      {m.attachment_url && (
                        <a
                          href={m.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs underline mt-1 break-all"
                        >
                          📎 {m.attachment_url}
                        </a>
                      )}
                      <div className={cn(
                        'text-[10px] mt-1 opacity-70',
                        m.direction === 'outbound' ? 'text-right' : ''
                      )}>
                        {fmtTime(m.created_time)}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="border-t border-border/50 p-3 flex items-end gap-2">
                <Input
                  placeholder="Type a reply…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !reply.trim()}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
