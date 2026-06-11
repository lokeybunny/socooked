import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Send, Instagram, Loader2, MessageSquare,
  Bot, Sparkles, Gauge, CheckCircle2, Circle, PhoneCall, RotateCcw, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
type Profile = { username: string; instagram: string | null };

const FN_URL = `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/ig-dm-fetch`;
const BOT_URL = `https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/ig-dm-bot`;
const POLL_MS = 30_000;

type ChecklistItem = 'serious_artist' | 'has_budget' | 'wants_virality' | 'ready_to_invest' | 'agreed_to_call';
const CHECKLIST_KEYS: ChecklistItem[] = ['serious_artist', 'has_budget', 'wants_virality', 'ready_to_invest', 'agreed_to_call'];
const CHECKLIST_LABELS: Record<ChecklistItem, string> = {
  serious_artist: 'Serious artist',
  has_budget: 'Has budget',
  wants_virality: 'Wants virality',
  ready_to_invest: 'Ready to invest',
  agreed_to_call: 'Agreed to call',
};

type Evidence = { message_id: string | null; quote: string };
type Override = {
  checklist?: Partial<Record<ChecklistItem, boolean>>;
  stage?: string;
  qualified?: boolean;
  score?: number;
};
type Analysis = {
  id?: string;
  conversation_id: string;
  profile?: string | null;
  other_username?: string | null;
  score: number;
  stage: string;
  qualified: boolean;
  next_action: string;
  reason: string;
  reply: string;
  checklist: Record<ChecklistItem, boolean>;
  evidence: Record<ChecklistItem, Evidence[]>;
  manual_override: Override;
  auto_reply: boolean;
  basis_msg_id?: string | null;
  bot_at?: string | null;
  updated_at?: string | null;
};

const emptyChecklist = (): Record<ChecklistItem, boolean> =>
  ({ serious_artist: false, has_budget: false, wants_virality: false, ready_to_invest: false, agreed_to_call: false });
const emptyEvidence = (): Record<ChecklistItem, Evidence[]> =>
  ({ serious_artist: [], has_budget: [], wants_virality: [], ready_to_invest: [], agreed_to_call: [] });

const STAGES = ['qualifying', 'warming', 'ready_for_call', 'call_booked', 'disqualified'];

export default function IgDm() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<string>('unc86');
  const [autoBot, setAutoBot] = useState<boolean>(false);
  const [generating, setGenerating] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [botBusy, setBotBusy] = useState<Record<string, boolean>>({});
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [editing, setEditing] = useState(false);
  const handledRef = useRef<Record<string, string>>({});
  const openedRef = useRef<Record<string, boolean>>({});
  // Conflict resolution: tracks local in-flight edits per conversation so that
  // realtime echoes from other devices don't clobber unsaved local changes.
  // Map<conversation_id, Map<field, expiresAtMs>>
  const pendingRef = useRef<Record<string, Record<string, number>>>({});
  const PENDING_TTL_MS = 6_000;
  const OVERRIDE_TTL_MS = 30_000; // keep override edits longer in case of slow round-trip
  const markPending = (convId: string, keys: string[], ttl = PENDING_TTL_MS) => {
    const now = Date.now();
    const cur = pendingRef.current[convId] || {};
    for (const k of keys) cur[k] = now + ttl;
    pendingRef.current[convId] = cur;
  };
  const getPendingKeys = (convId: string): Set<string> => {
    const cur = pendingRef.current[convId] || {};
    const now = Date.now();
    const out = new Set<string>();
    for (const [k, exp] of Object.entries(cur)) {
      if (exp > now) out.add(k);
      else delete cur[k];
    }
    return out;
  };

  const getAuth = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  // ============ Init user + settings ============
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: settings } = await supabase
        .from('ig_dm_user_settings')
        .select('auto_bot, selected_profile')
        .eq('user_id', user.id)
        .maybeSingle();
      if (settings) {
        setAutoBot(!!settings.auto_bot);
        if (settings.selected_profile) setProfile(settings.selected_profile);
      }

      const { data: rows } = await supabase
        .from('ig_dm_analyses')
        .select('*')
        .eq('user_id', user.id);
      if (rows) {
        const map: Record<string, Analysis> = {};
        for (const r of rows as any[]) {
          map[r.conversation_id] = rowToAnalysis(r);
        }
        setAnalyses(map);
      }

      // Realtime sync across devices
      const channel = supabase
        .channel('ig_dm_analyses_rt')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'ig_dm_analyses', filter: `user_id=eq.${user.id}` },
          (payload: any) => {
            if (payload.eventType === 'DELETE') {
              const oldConv = payload.old?.conversation_id;
              if (!oldConv) return;
              delete pendingRef.current[oldConv];
              setAnalyses((prev) => {
                const next = { ...prev };
                delete next[oldConv];
                return next;
              });
              return;
            }
            const row = payload.new;
            if (!row?.conversation_id) return;
            const convId = row.conversation_id as string;
            const incoming = rowToAnalysis(row);
            setAnalyses((prev) => {
              const local = prev[convId];
              const pending = getPendingKeys(convId);
              // No local copy or no in-flight edits → accept incoming verbatim.
              if (!local || pending.size === 0) {
                return { ...prev, [convId]: incoming };
              }
              // Stale echo: ignore if incoming is older than what we already hold.
              if (local.updated_at && incoming.updated_at && incoming.updated_at < local.updated_at) {
                return prev;
              }
              // Merge: incoming wins by default, but preserve pending local fields.
              const merged: Analysis = { ...incoming };
              for (const key of pending) {
                (merged as any)[key] = (local as any)[key];
              }
              // manual_override is shallow-merged so per-key overrides survive
              // even if only some override toggles are in-flight.
              if (local.manual_override && Object.keys(local.manual_override).length) {
                merged.manual_override = {
                  ...(incoming.manual_override || {}),
                  ...local.manual_override,
                };
              }
              return { ...prev, [convId]: merged };
            });
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    })();
  }, []);

  const rowToAnalysis = (r: any): Analysis => ({
    id: r.id,
    conversation_id: r.conversation_id,
    profile: r.profile,
    other_username: r.other_username,
    score: r.score ?? 0,
    stage: r.stage ?? 'qualifying',
    qualified: !!r.qualified,
    next_action: r.next_action ?? 'ask_qualifier',
    reason: r.reason ?? '',
    reply: r.reply ?? '',
    checklist: { ...emptyChecklist(), ...(r.checklist || {}) },
    evidence: { ...emptyEvidence(), ...(r.evidence || {}) },
    manual_override: r.manual_override || {},
    auto_reply: !!r.auto_reply,
    basis_msg_id: r.basis_msg_id,
    bot_at: r.bot_at,
    updated_at: r.updated_at,
  });

  // ============ Persist auto-bot global toggle ============
  const updateAutoBot = async (v: boolean) => {
    setAutoBot(v);
    if (!userId) return;
    await supabase
      .from('ig_dm_user_settings')
      .upsert({ user_id: userId, auto_bot: v, selected_profile: profile }, { onConflict: 'user_id' });
  };

  // ============ Persist profile selection ============
  useEffect(() => {
    if (!userId) return;
    supabase.from('ig_dm_user_settings').upsert(
      { user_id: userId, selected_profile: profile, auto_bot: autoBot },
      { onConflict: 'user_id' }
    );
  }, [profile, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============ Save / patch analysis row ============
  const saveAnalysis = useCallback(async (convId: string, patch: Partial<Analysis>, conv?: Conversation) => {
    // Mark every patched field as in-flight so realtime echoes from this or
    // other devices don't overwrite the user's local edits mid-save.
    const patchedKeys = Object.keys(patch);
    if (patchedKeys.length) {
      const hasOverride = patchedKeys.includes('manual_override');
      markPending(convId, patchedKeys, hasOverride ? OVERRIDE_TTL_MS : PENDING_TTL_MS);
    }
    setAnalyses((prev) => {
      const base: Analysis = prev[convId] || {
        conversation_id: convId,
        score: 0, stage: 'qualifying', qualified: false, next_action: 'ask_qualifier',
        reason: '', reply: '', checklist: emptyChecklist(), evidence: emptyEvidence(),
        manual_override: {}, auto_reply: false,
      };
      const merged: Analysis = { ...base, ...patch, conversation_id: convId };
      return { ...prev, [convId]: merged };
    });

    if (!userId) return;
    const next = { ...(analyses[convId] || {}), ...patch };
    const row: any = {
      user_id: userId,
      conversation_id: convId,
      profile: next.profile ?? conv?.other_username ? profile : profile,
      other_username: next.other_username ?? conv?.other_username ?? null,
      score: next.score ?? 0,
      stage: next.stage ?? 'qualifying',
      qualified: !!next.qualified,
      next_action: next.next_action ?? 'ask_qualifier',
      reason: next.reason ?? '',
      reply: next.reply ?? '',
      checklist: next.checklist ?? emptyChecklist(),
      evidence: next.evidence ?? emptyEvidence(),
      manual_override: next.manual_override ?? {},
      auto_reply: !!next.auto_reply,
      basis_msg_id: next.basis_msg_id ?? null,
      bot_at: next.bot_at ?? null,
    };
    const { error } = await supabase
      .from('ig_dm_analyses')
      .upsert(row, { onConflict: 'user_id,conversation_id' });
    if (error) console.warn('[ig_dm_analyses] save failed', error);
  }, [userId, analyses, profile]);

  // ============ DM fetch / send ============
  const loadProfiles = useCallback(async () => {
    try {
      const headers = await getAuth();
      const res = await fetch(`${FN_URL}?action=profiles`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Failed to load profiles');
      const list: Profile[] = json.profiles || [];
      setProfiles(list);
      if (list.length && !list.find((p) => p.username === profile)) setProfile(list[0].username);
    } catch (e: any) { console.warn('[IgDm] loadProfiles failed', e); }
  }, [getAuth, profile]);

  const load = useCallback(async (selected: string) => {
    try {
      const headers = await getAuth();
      const res = await fetch(`${FN_URL}?user=${encodeURIComponent(selected)}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Failed to fetch DMs');
      const convs: Conversation[] = json.conversations || [];
      setConversations(convs);
      setActiveId((cur) => cur || convs[0]?.conversation_id || null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load IG DMs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuth]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => { setLoading(true); load(profile); }, [profile, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      c.other_username.toLowerCase().includes(q) ||
      (c.last_message?.text || '').toLowerCase().includes(q));
  }, [conversations, query]);

  const active = useMemo(
    () => conversations.find((c) => c.conversation_id === activeId) || null,
    [conversations, activeId]
  );

  const handleRefresh = () => { setRefreshing(true); load(profile); };

  // ============ Bot calls ============
  const askBot = useCallback(async (conv: Conversation, mode: 'reply' | 'opener' = 'reply') => {
    const headers = await getAuth();
    const res = await fetch(BOT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        other_username: conv.other_username,
        mode,
        messages: conv.messages.map((m) => ({
          id: m.id, direction: m.direction, text: m.text, created_time: m.created_time,
        })),
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Bot failed');

    const patch: Partial<Analysis> = {
      profile,
      other_username: conv.other_username,
      score: Number(json.score) || 0,
      stage: json.stage || 'qualifying',
      qualified: !!json.qualified,
      next_action: json.next_action || 'ask_qualifier',
      reason: json.reason || '',
      reply: json.reply || '',
      checklist: { ...emptyChecklist(), ...(json.checklist || {}) },
      evidence: { ...emptyEvidence(), ...(json.evidence || {}) },
      basis_msg_id: conv.last_message?.id || null,
      bot_at: new Date().toISOString(),
    };
    await saveAnalysis(conv.conversation_id, patch, conv);
    return { ...patch, should_send: json.should_send !== false && !!json.reply };
  }, [getAuth, profile, saveAnalysis]);

  const sendToConv = useCallback(async (conv: Conversation, message: string) => {
    const headers = await getAuth();
    const res = await fetch(`${FN_URL}?user=${encodeURIComponent(profile)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ recipient_id: conv.other_id, message }),
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok || json?.success === false) {
      const msg = json?.error?.message || json?.error || json?.message || `Send failed (${res.status})`;
      throw new Error(String(msg));
    }
    return true;
  }, [getAuth, profile]);

  const handleSend = async () => {
    if (!active || !reply.trim()) return;
    if (!active.other_id) return toast.error('Missing recipient id');
    setSending(true);
    try {
      await sendToConv(active, reply);
      toast.success('Reply sent');
      setReply('');
      setTimeout(() => load(profile), 500);
    } catch (e: any) { toast.error(e?.message || 'Send failed'); }
    finally { setSending(false); }
  };

  const handleGenerate = async () => {
    if (!active) return;
    setGenerating(true);
    try {
      const out = await askBot(active);
      if (out.reply) { setReply(out.reply); toast.success(`AI suggestion · ${out.score}/100 · ${out.stage}`); }
      else toast.message(`Bot chose not to reply (score ${out.score})`, { description: out.reason });
    } catch (e: any) { toast.error(e?.message || 'Bot failed'); }
    finally { setGenerating(false); }
  };

  const handleScore = async () => {
    if (!active) return;
    setScoring(true);
    try {
      const out = await askBot(active);
      toast.success(`Score: ${out.score}/100 · ${out.stage}`, { description: out.reason });
    } catch (e: any) { toast.error(e?.message || 'Score failed'); }
    finally { setScoring(false); }
  };

  // ============ Per-thread auto-reply (saved in DB) ============
  const toggleThreadAuto = async (conv: Conversation) => {
    const cur = analyses[conv.conversation_id];
    const next = !cur?.auto_reply;
    await saveAnalysis(conv.conversation_id, {
      auto_reply: next,
      other_username: conv.other_username,
    }, conv);

    // When turning ON, immediately engage:
    //  - reply if the lead is waiting on us (last inbound, unhandled)
    //  - otherwise send a re-engagement opener (check-in)
    if (!next) return;
    if (botBusy[conv.conversation_id]) return;
    const last = conv.last_message;
    const shouldReply = last?.direction === 'inbound' && handledRef.current[conv.conversation_id] !== last.id;
    const mode: 'reply' | 'opener' = shouldReply ? 'reply' : 'opener';

    setBotBusy((b) => ({ ...b, [conv.conversation_id]: true }));
    try {
      const out = await askBot(conv, mode);
      if (out.should_send && out.reply) {
        await sendToConv(conv, out.reply);
        toast.success(`Bot ${mode === 'opener' ? 'opened' : 'replied to'} @${conv.other_username}`, {
          description: out.reply.slice(0, 80),
        });
        if (last) handledRef.current[conv.conversation_id] = last.id;
        openedRef.current[conv.conversation_id] = true;
        setTimeout(() => load(profile), 600);
      } else {
        toast.message(`Bot had nothing to send for @${conv.other_username}`, {
          description: out.reason || 'No reply generated',
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Bot failed to start');
    } finally {
      setBotBusy((b) => { const { [conv.conversation_id]: _, ...rest } = b; return rest; });
    }
  };

  // ============ Manual overrides ============
  const toggleChecklistOverride = async (conv: Conversation, k: ChecklistItem) => {
    const a = analyses[conv.conversation_id];
    const botVal = !!a?.checklist?.[k];
    const overrideVal = a?.manual_override?.checklist?.[k];
    const newChecklist = { ...(a?.manual_override?.checklist || {}) };
    if (overrideVal === undefined) {
      // No override yet → flip the bot value
      newChecklist[k] = !botVal;
    } else {
      // Override exists → clear it (back to bot value)
      delete newChecklist[k];
    }
    await saveAnalysis(conv.conversation_id, {
      manual_override: { ...(a?.manual_override || {}), checklist: newChecklist },
      other_username: conv.other_username,
    }, conv);
  };

  const overrideStage = async (conv: Conversation, stage: string) => {
    const a = analyses[conv.conversation_id];
    await saveAnalysis(conv.conversation_id, {
      manual_override: { ...(a?.manual_override || {}), stage: stage || undefined },
      other_username: conv.other_username,
    }, conv);
  };
  const overrideQualified = async (conv: Conversation, q: boolean | undefined) => {
    const a = analyses[conv.conversation_id];
    await saveAnalysis(conv.conversation_id, {
      manual_override: { ...(a?.manual_override || {}), qualified: q },
      other_username: conv.other_username,
    }, conv);
  };
  const clearOverrides = async (conv: Conversation) => {
    await saveAnalysis(conv.conversation_id, {
      manual_override: {},
      other_username: conv.other_username,
    }, conv);
    toast.success('Overrides cleared');
  };

  // ============ Effective values ============
  const eff = (a: Analysis | undefined) => {
    if (!a) return null;
    const cl: Record<ChecklistItem, boolean> = { ...a.checklist };
    if (a.manual_override?.checklist) {
      for (const k of CHECKLIST_KEYS) {
        if (a.manual_override.checklist[k] !== undefined) cl[k] = !!a.manual_override.checklist[k];
      }
    }
    return {
      checklist: cl,
      stage: a.manual_override?.stage ?? a.stage,
      qualified: a.manual_override?.qualified ?? a.qualified,
      score: a.manual_override?.score ?? a.score,
    };
  };

  // ============ Auto-run loop ============
  useEffect(() => {
    if (!autoBot || conversations.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const conv of conversations) {
        if (cancelled) break;
        const a = analyses[conv.conversation_id];
        if (!a?.auto_reply) continue;
        if (botBusy[conv.conversation_id]) continue;
        const last = conv.last_message;
        const shouldReply = last?.direction === 'inbound' && handledRef.current[conv.conversation_id] !== last.id;
        const shouldOpen = !shouldReply && !openedRef.current[conv.conversation_id];
        if (!shouldOpen && !shouldReply) continue;
        const mode: 'reply' | 'opener' = shouldReply ? 'reply' : 'opener';
        setBotBusy((b) => ({ ...b, [conv.conversation_id]: true }));
        try {
          const out = await askBot(conv, mode);
          if (out.should_send && out.reply) {
            await sendToConv(conv, out.reply);
            toast.success(`Bot ${mode === 'opener' ? 'opened' : 'replied to'} @${conv.other_username}`, {
              description: out.reply.slice(0, 80),
            });
            if (mode === 'opener') openedRef.current[conv.conversation_id] = true;
          }
          if (last) handledRef.current[conv.conversation_id] = last.id;
        } catch (e) { console.warn('[ig-dm-bot] auto failed', e); }
        finally {
          setBotBusy((b) => { const { [conv.conversation_id]: _, ...rest } = b; return rest; });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [conversations, autoBot, analyses]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoBot) return;
    const t = setInterval(() => load(profile), POLL_MS);
    return () => clearInterval(t);
  }, [autoBot, profile, load]);

  // ============ Helpers ============
  const fmtTime = (t: string | null) => {
    if (!t) return '';
    try {
      return new Date(t).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
    } catch { return ''; }
  };
  const scoreColor = (s: number) =>
    s >= 76 ? 'bg-green-500/15 text-green-500 border-green-500/30'
    : s >= 51 ? 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30'
    : s >= 21 ? 'bg-orange-500/15 text-orange-500 border-orange-500/30'
    : 'bg-muted text-muted-foreground border-border';

  const activeAnalysis = active ? analyses[active.conversation_id] : null;
  const activeEff = eff(activeAnalysis || undefined);
  const hasOverride = !!activeAnalysis?.manual_override && Object.keys(activeAnalysis.manual_override).length > 0;

  // map message_id -> snippet for evidence lookup
  const msgIndex = useMemo(() => {
    const map: Record<string, Message> = {};
    if (active) for (const m of active.messages) map[m.id] = m;
    return map;
  }, [active]);

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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md border border-border bg-background">
              <Bot className={cn('w-4 h-4', autoBot ? 'text-green-500' : 'text-muted-foreground')} />
              <span className="text-xs text-muted-foreground hidden sm:inline">My Auto-bot</span>
              <Switch checked={autoBot} onCheckedChange={updateAutoBot} />
            </div>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {(profiles.length ? profiles : [{ username: profile, instagram: null }]).map((p) => (
                <option key={p.username} value={p.username}>
                  {p.username}{p.instagram ? ` (@${p.instagram})` : ''}
                </option>
              ))}
            </select>
            <Button onClick={handleRefresh} variant="outline" size="sm" disabled={refreshing}>
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-72px)]">
        {/* Conversation list */}
        <Card className="overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border/50">
            <Input placeholder="Search handle or message…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9" />
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
                  const a = analyses[c.conversation_id];
                  const e = eff(a);
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
                          <div className="flex items-center gap-1.5 shrink-0">
                            {a?.auto_reply && <Bot className="w-3 h-3 text-green-500" />}
                            {e && (
                              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border tabular-nums', scoreColor(e.score))}>
                                {e.score}
                              </span>
                            )}
                            {e?.checklist?.agreed_to_call && <PhoneCall className="w-3 h-3 text-green-500" />}
                            <span className="text-[10px] text-muted-foreground">{fmtTime(c.updated_time)}</span>
                          </div>
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
                <MessageSquare className="w-8 h-8" /> Select a conversation
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">@{active.other_username}</div>
                  <div className="text-xs text-muted-foreground">{active.message_count} messages</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <Bot className={cn('w-4 h-4', activeAnalysis?.auto_reply ? 'text-green-500' : '')} />
                    <span className="hidden sm:inline">Auto-reply</span>
                    <Switch checked={!!activeAnalysis?.auto_reply} onCheckedChange={() => toggleThreadAuto(active)} />
                  </label>
                  <a href={`https://www.instagram.com/${active.other_username}`} target="_blank" rel="noreferrer" className="text-xs text-pink-500 hover:underline">
                    Open profile
                  </a>
                </div>
              </div>

              {/* Qualification panel */}
              <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Gauge className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Qualification</span>
                    {activeEff ? (
                      <>
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border tabular-nums', scoreColor(activeEff.score))}>
                          {activeEff.score}/100
                        </span>
                        {editing ? (
                          <select
                            value={activeEff.stage}
                            onChange={(e) => overrideStage(active, e.target.value)}
                            className="h-6 text-[10px] rounded border border-border bg-background px-1.5"
                          >
                            {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                          </select>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{activeEff.stage.replace(/_/g, ' ')}</span>
                        )}
                        {editing && (
                          <select
                            value={activeEff.qualified ? 'yes' : 'no'}
                            onChange={(e) => overrideQualified(active, e.target.value === 'yes')}
                            className="h-6 text-[10px] rounded border border-border bg-background px-1.5"
                          >
                            <option value="no">unqualified</option>
                            <option value="yes">qualified</option>
                          </select>
                        )}
                        {activeEff.score >= 76 && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-green-500">
                            <PhoneCall className="w-3 h-3" /> push for call
                          </span>
                        )}
                        {hasOverride && <span className="text-[10px] text-yellow-500">manual override</span>}
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Not scored yet</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {hasOverride && (
                      <Button onClick={() => clearOverrides(active)} variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <RotateCcw className="w-3 h-3" /><span className="ml-1.5">Reset</span>
                      </Button>
                    )}
                    <Button onClick={() => setEditing((v) => !v)} variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      <Pencil className="w-3 h-3" /><span className="ml-1.5">{editing ? 'Done' : 'Edit'}</span>
                    </Button>
                    <Button onClick={handleScore} variant="ghost" size="sm" disabled={scoring || generating} className="h-7 px-2 text-xs">
                      {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gauge className="w-3 h-3" />}
                      <span className="ml-1.5">{activeAnalysis ? 'Re-score' : 'Score'}</span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {CHECKLIST_KEYS.map((k) => {
                    const ok = !!activeEff?.checklist?.[k];
                    const overrideVal = activeAnalysis?.manual_override?.checklist?.[k];
                    const isOverridden = overrideVal !== undefined;
                    const ev = activeAnalysis?.evidence?.[k] || [];
                    return (
                      <div key={k} className={cn(
                        'rounded border px-2 py-1.5 text-[11px]',
                        ok ? 'bg-green-500/10 border-green-500/30' : 'bg-background border-border'
                      )}>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => editing && toggleChecklistOverride(active, k)}
                            disabled={!editing}
                            className={cn(
                              'flex items-center gap-1.5 font-medium',
                              ok ? 'text-green-500' : 'text-muted-foreground',
                              editing && 'cursor-pointer hover:opacity-80'
                            )}
                          >
                            {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                            <span>{CHECKLIST_LABELS[k]}</span>
                            {isOverridden && <span className="text-[9px] uppercase text-yellow-500 ml-1">override</span>}
                          </button>
                        </div>
                        {ok && ev.length > 0 && (
                          <ul className="mt-1 pl-5 space-y-0.5">
                            {ev.map((e, i) => {
                              const m = e.message_id ? msgIndex[e.message_id] : null;
                              return (
                                <li key={i} className="text-[10px] text-muted-foreground italic border-l border-green-500/40 pl-2">
                                  "{e.quote || m?.text?.slice(0, 120) || '(no quote)'}"
                                  {m?.created_time && <span className="ml-1 not-italic opacity-60">· {fmtTime(m.created_time)}</span>}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
                {activeAnalysis?.reason && (
                  <div className="text-[11px] text-muted-foreground mt-2 italic">{activeAnalysis.reason}</div>
                )}
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-2">
                  {active.messages.map((m) => (
                    <div key={m.id} className={cn(
                      'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                      m.direction === 'outbound' ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto bg-muted'
                    )}>
                      {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                      {m.attachment_url && (
                        <a href={m.attachment_url} target="_blank" rel="noreferrer" className="block text-xs underline mt-1 break-all">
                          📎 {m.attachment_url}
                        </a>
                      )}
                      <div className={cn('text-[10px] mt-1 opacity-70', m.direction === 'outbound' ? 'text-right' : '')}>
                        {fmtTime(m.created_time)}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="border-t border-border/50 p-3 flex items-end gap-2">
                <Button onClick={handleGenerate} variant="outline" size="sm" disabled={generating || sending} title="Generate AI reply">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span className="ml-2 hidden sm:inline">AI</span>
                </Button>
                <Input
                  placeholder="Type a reply…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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
