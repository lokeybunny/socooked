import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageSquare, Send, RefreshCw, Loader2, Plus, ArrowLeft, Webhook, Trash2, UserPlus, FileText, Star, StickyNote, Workflow, PhoneOff, Zap, Pin, PinOff, Phone, CalendarClock, Paperclip, X as XIcon, ImageIcon } from 'lucide-react';
import TwilioKeypad from '@/components/phone/TwilioKeypad';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { format } from 'date-fns';
import CallNotesPopup from '@/components/phone/CallNotesPopup';
import EmojiButton from '@/components/sms/EmojiButton';
import { moveToVideographyFunnel } from '@/lib/moveToVideographyFunnel';

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
  media_urls?: string[] | null;
};

function isLandlineReply(m: SMSMessage) {
  if (!m || m.direction !== 'inbound') return false;
  return m.metadata?.landline_reply === true || m.provider === 'twilio';
}

function normalizeLast10(raw: string | null | undefined) {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '').slice(-10);
}

// Thread key: last10 for normal phones; for shortcodes (3-6 digits) or other
// non-standard senders (e.g. "22395"), fall back to the cleaned digits so they
// still appear in the inbox.
function threadKey(raw: string | null | undefined) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return String(raw).trim().toLowerCase(); // alphanumeric senders
  if (digits.length >= 10) return digits.slice(-10);
  return digits; // shortcodes / 3-6 digit senders
}

function formatPhone(raw: string | null | undefined) {
  const last10 = normalizeLast10(raw);
  if (last10.length !== 10) return raw || '';
  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
}

// Extract image URLs from a message body (Supabase content-uploads bucket or any common image extension)
const IMAGE_URL_REGEX = /(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|heic|bmp)(?:\?[^\s]*)?)/gi;
function extractImageUrls(body: string | null | undefined): string[] {
  if (!body) return [];
  const matches = body.match(IMAGE_URL_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
}
function stripImageUrls(body: string | null | undefined): string {
  if (!body) return '';
  return body.replace(IMAGE_URL_REGEX, '').replace(/\s{2,}/g, ' ').trim();
}

export default function PowerDialSMSInbox() {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [contactEmails, setContactEmails] = useState<Record<string, string>>({});
  const [starredSet, setStarredSet] = useState<Set<string>>(new Set());
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());
  const PIN_ORDER_KEY = 'powerdial-sms-pin-order-v1';
  const [pinOrder, setPinOrder] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(PIN_ORDER_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const persistPinOrder = useCallback((arr: string[]) => {
    setPinOrder(arr);
    try { localStorage.setItem(PIN_ORDER_KEY, JSON.stringify(arr)); } catch {}
  }, []);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [funneledSet, setFunneledSet] = useState<Set<string>>(new Set());
  const [interestedSet, setInterestedSet] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<'all' | 'starred' | 'disconnected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  // Image attachment (uploaded to storage; URL appended to outbound SMS body)
  const [pendingAttachments, setPendingAttachments] = useState<{ url: string; name: string }[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Send Proposal modal
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalPhoneKey, setProposalPhoneKey] = useState<string | null>(null);
  const [proposalStep, setProposalStep] = useState<'email' | 'choose'>('email');
  const [proposalEmail, setProposalEmail] = useState('');
  const [proposalSending, setProposalSending] = useState(false);
  // Notes popup (shared with Phone via sms_contacts.notes)
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesPhone, setNotesPhone] = useState<string>('');
  const [callPhone, setCallPhone] = useState<string | null>(null);
  // Schedule SMS modal
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState<string>('');
  const [scheduleBody, setScheduleBody] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  type ScheduledJob = { id: string; to_phone: string; body: string; send_at: string; status: string };
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  // Per-thread name color (persisted remotely in sms_contacts.name_color, with localStorage cache for instant paint)
  const NAME_COLOR_STORAGE_KEY = 'powerdial-sms-name-colors-v1';
  const [nameColors, setNameColors] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(NAME_COLOR_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // Hydrate from remote on mount so colors follow the user across browsers
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('sms_contacts')
        .select('phone_last10, name_color')
        .not('name_color', 'is', null);
      if (error || !data) return;
      const remote: Record<string, string> = {};
      for (const r of data as any[]) {
        if (r.phone_last10 && r.name_color) remote[r.phone_last10] = r.name_color;
      }
      setNameColors((prev) => {
        const merged = { ...prev, ...remote };
        try { localStorage.setItem(NAME_COLOR_STORAGE_KEY, JSON.stringify(merged)); } catch {}
        return merged;
      });
    })();

    // Realtime sync: if another browser changes a color, reflect it here
    const ch = supabase
      .channel('sms-name-colors')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_contacts' }, (payload: any) => {
        const row = payload.new || payload.old;
        if (!row?.phone_last10) return;
        setNameColors((prev) => {
          const next = { ...prev };
          if (payload.new?.name_color) next[row.phone_last10] = payload.new.name_color;
          else delete next[row.phone_last10];
          try { localStorage.setItem(NAME_COLOR_STORAGE_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const setNameColor = async (last10: string, color: string | null) => {
    setNameColors((prev) => {
      const next = { ...prev };
      if (!color) delete next[last10]; else next[last10] = color;
      try { localStorage.setItem(NAME_COLOR_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    // Persist remotely
    try {
      const { data: existing } = await supabase
        .from('sms_contacts')
        .select('id, name')
        .eq('phone_last10', last10)
        .maybeSingle();
      if (existing?.id) {
        await supabase.from('sms_contacts').update({ name_color: color }).eq('id', existing.id);
      } else {
        await supabase.from('sms_contacts').insert({
          phone_last10: last10,
          phone: '+1' + last10,
          name: last10,
          name_color: color,
        });
      }
    } catch (e) {
      console.error('Failed to persist name color', e);
    }
  };
  const NAME_COLOR_OPTIONS: { label: string; value: string }[] = [
    { label: 'Default', value: '' },
    { label: 'Red', value: '#f87171' },
    { label: 'Orange', value: '#fb923c' },
    { label: 'Amber', value: '#fbbf24' },
    { label: 'Green', value: '#4ade80' },
    { label: 'Cyan', value: '#22d3ee' },
    { label: 'Blue', value: '#60a5fa' },
    { label: 'Purple', value: '#a78bfa' },
    { label: 'Pink', value: '#f472b6' },
  ];
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
  const contactsRef = useRef<Record<string, string>>({});
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  const loadContacts = useCallback(async () => {
    const { data } = await supabase.from('sms_contacts').select('phone_last10, name, email, starred, tags, pinned');
    const map: Record<string, string> = {};
    const emails: Record<string, string> = {};
    const starred = new Set<string>();
    const pinned = new Set<string>();
    const interested = new Set<string>();
    (data || []).forEach((c: any) => {
      if (!c.phone_last10) return;
      if (c.name) map[c.phone_last10] = c.name;
      if (c.email) emails[c.phone_last10] = c.email;
      if (c.starred) starred.add(c.phone_last10);
      if (c.pinned) pinned.add(c.phone_last10);
      if (Array.isArray(c.tags) && c.tags.includes('interested')) interested.add(c.phone_last10);
    });
    setContacts(map);
    setContactEmails(emails);
    setStarredSet(starred);
    setPinnedSet(pinned);
    setInterestedSet(interested);

    // Load already-funneled contacts (videography-landing source)
    try {
      const { data: cust } = await supabase
        .from('customers')
        .select('phone')
        .eq('source', 'videography-landing');
      const f = new Set<string>();
      (cust || []).forEach((c: any) => {
        const last10 = String(c.phone || '').replace(/\D/g, '').slice(-10);
        if (last10.length === 10) f.add(last10);
      });
      setFunneledSet(f);
    } catch {}
  }, []);

  const togglePin = useCallback(async (e: React.MouseEvent, last10: string) => {
    e.stopPropagation();
    const isPinned = pinnedSet.has(last10);
    const next = new Set(pinnedSet);
    if (isPinned) next.delete(last10); else next.add(last10);
    setPinnedSet(next);
    if (isPinned) {
      persistPinOrder(pinOrder.filter(k => k !== last10));
    } else if (!pinOrder.includes(last10)) {
      persistPinOrder([...pinOrder, last10]);
    }
    try {
      const { error } = await supabase.from('sms_contacts').upsert(
        {
          phone_last10: last10,
          phone: `+1${last10}`,
          name: contacts[last10] || `+1${last10}`,
          pinned: !isPinned,
          pinned_at: !isPinned ? new Date().toISOString() : null,
        },
        { onConflict: 'phone_last10' },
      );
      if (error) throw error;
      toast.success(isPinned ? 'Unpinned' : 'Pinned to top');
    } catch (err: any) {
      // revert
      setPinnedSet(pinnedSet);
      toast.error(err?.message || 'Failed to update pin');
    }
  }, [pinnedSet, contacts, pinOrder, persistPinOrder]);

  const handlePinDrop = useCallback((targetKey: string) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    if (!pinnedSet.has(dragKey) || !pinnedSet.has(targetKey)) { setDragKey(null); return; }
    const current = pinOrder.filter(k => pinnedSet.has(k));
    // ensure both keys present
    const ensure = (k: string, arr: string[]) => arr.includes(k) ? arr : [...arr, k];
    let arr = ensure(targetKey, ensure(dragKey, current));
    arr = arr.filter(k => k !== dragKey);
    const targetIdx = arr.indexOf(targetKey);
    arr.splice(targetIdx, 0, dragKey);
    persistPinOrder(arr);
    setDragKey(null);
  }, [dragKey, pinnedSet, pinOrder, persistPinOrder]);

  const pollVoidFix = useCallback(async () => {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('VoidFix poll timeout')), 4500);
    });
    await Promise.race([
      supabase.functions.invoke('powerdial-sms', { body: { action: 'poll', limit: 50 } }),
      timeout,
    ]);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? hasLoadedRef.current;
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('communications')
      .select('id, direction, body, from_address, to_address, phone_number, external_id, status, created_at, customer_id, metadata, type, provider, media_urls')
      .eq('type', 'sms')
      .order('created_at', { ascending: false })
      .limit(300);
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

  const syncAndLoad = useCallback(async (opts?: { silent?: boolean }) => {
    await load(opts);
    // Pull VoidFix in the background so a slow carrier/device API can never block
    // the inbox from rendering existing SMS records.
    pollVoidFix()
      .then(() => load({ silent: true }))
      .catch(() => { /* non-fatal: keep inbox usable even if VoidFix is slow */ });
  }, [load, pollVoidFix]);

  useEffect(() => { syncAndLoad({ silent: false }); }, [syncAndLoad]);
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
      const key = threadKey(counterpart);
      if (!key) continue;
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
    if (latest && seenInboundRef.current[activeThread] !== latest.id) {
      seenInboundRef.current[activeThread] = latest.id;
      persistSeen();
    }
  }, [activeThread, messages, persistSeen]);

  // Background VoidFix poll every 12s — relies on realtime to refresh UI on new rows
  useEffect(() => {
    const id = setInterval(() => {
      pollVoidFix().catch(() => {});
    }, 12000);
    return () => clearInterval(id);
  }, [pollVoidFix]);

  // Load pending scheduled SMS jobs
  const loadScheduledJobs = useCallback(async () => {
    const { data } = await supabase
      .from('scheduled_sms_jobs')
      .select('id, to_phone, body, send_at, status')
      .eq('status', 'pending')
      .order('send_at', { ascending: true });
    setScheduledJobs((data as ScheduledJob[]) || []);
  }, []);

  useEffect(() => { loadScheduledJobs(); }, [loadScheduledJobs]);

  // Realtime — refresh on any new SMS row (silent, no flash)
  useEffect(() => {
    const channel = supabase
      .channel('powerdial-sms-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications', filter: 'type=eq.sms' }, () => {
        load({ silent: true });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'communications', filter: 'type=eq.sms' }, () => {
        load({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_contacts' }, () => {
        loadContacts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_sms_jobs' }, (payload: any) => {
        loadScheduledJobs();
        // Notify when a scheduled SMS transitions to 'sent'
        const newRow = payload.new;
        const oldRow = payload.old;
        if (
          payload.eventType === 'UPDATE' &&
          newRow?.status === 'sent' &&
          oldRow?.status !== 'sent'
        ) {
          const last10 = normalizeLast10(newRow.to_phone);
          const phoneDisplay = formatPhone(newRow.to_phone) || newRow.to_phone;
          const name = contactsRef.current[last10];
          const who = name ? `${name} (${phoneDisplay})` : phoneDisplay;
          const preview = (newRow.body || '').length > 90
            ? (newRow.body || '').slice(0, 90) + '…'
            : (newRow.body || '');
          toast.success(`Scheduled SMS sent to ${who}`, {
            description: preview,
            duration: 12000,
            action: last10 ? {
              label: 'Open thread',
              onClick: () => {
                setShowCompose(false);
                setActiveThread(last10);
                load({ silent: true });
              },
            } : undefined,
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, loadContacts, loadScheduledJobs]);

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

  // Group messages by counterpart phone (last 10 digits, or shortcode digits)
  const threads = useMemo(() => {
    const map = new Map<string, { phone: string; messages: SMSMessage[]; last: SMSMessage; unreadInbound: number }>();
    for (const m of messages) {
      const counterpart = m.direction === 'inbound' ? m.from_address : m.to_address;
      const key = threadKey(counterpart);
      if (!key) continue;
      const entry = map.get(key);
      if (!entry) {
        map.set(key, { phone: counterpart || key, messages: [m], last: m, unreadInbound: m.direction === 'inbound' ? 1 : 0 });
      } else {
        entry.messages.push(m);
        if (new Date(m.created_at) > new Date(entry.last.created_at)) entry.last = m;
        if (m.direction === 'inbound') entry.unreadInbound += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const aKey = normalizeLast10(a.phone);
      const bKey = normalizeLast10(b.phone);
      const aPin = pinnedSet.has(aKey) ? 1 : 0;
      const bPin = pinnedSet.has(bKey) ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      if (aPin && bPin) {
        const aIdx = pinOrder.indexOf(aKey);
        const bIdx = pinOrder.indexOf(bKey);
        const aOrd = aIdx === -1 ? 9999 : aIdx;
        const bOrd = bIdx === -1 ? 9999 : bIdx;
        if (aOrd !== bOrd) return aOrd - bOrd;
      }
      return new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime();
    });
  }, [messages, pinnedSet, pinOrder]);

  const disconnectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) {
      if (m.direction === 'outbound' && (m.body || '').toLowerCase().includes('just got disconnected')) {
        const k = normalizeLast10(m.to_address);
        if (k) s.add(k);
      }
    }
    return s;
  }, [messages]);

  const visibleThreads = useMemo(() => {
    let list = threads;
    if (filterMode === 'starred') {
      list = list.filter(t => starredSet.has(normalizeLast10(t.phone)));
    } else if (filterMode === 'disconnected') {
      list = list.filter(t => disconnectedSet.has(normalizeLast10(t.phone)));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(t => {
        const last10 = normalizeLast10(t.phone);
        const name = (contacts[last10] || '').toLowerCase();
        const phone = (t.phone || '').toLowerCase();
        return last10.includes(q.replace(/\D/g, '')) || name.includes(q) || phone.includes(q);
      });
    }
    return list;
  }, [threads, filterMode, starredSet, disconnectedSet, searchQuery, contacts]);

  const activeMessages = useMemo(() => {
    if (!activeThread) return [];
    const t = threads.find(t => normalizeLast10(t.phone) === activeThread);
    if (!t) return [];
    return [...t.messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [activeThread, threads]);

  const activePendingJobs = useMemo(() => {
    if (!activeThread) return [] as ScheduledJob[];
    return scheduledJobs.filter(j => normalizeLast10(j.to_phone) === activeThread);
  }, [activeThread, scheduledJobs]);

  const cancelScheduledJob = useCallback(async (id: string) => {
    if (!confirm('Cancel this scheduled message?')) return;
    const { error } = await supabase.from('scheduled_sms_jobs').delete().eq('id', id).eq('status', 'pending');
    if (error) { toast.error(error.message); return; }
    toast.success('Scheduled message cancelled');
    setScheduledJobs(prev => prev.filter(j => j.id !== id));
  }, []);

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

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingAttachment(true);
    try {
      const uploads: { url: string; name: string }[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 10MB`);
          continue;
        }
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `sms-mms/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('content-uploads')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast.error(`Upload failed: ${upErr.message}`);
          continue;
        }
        const { data: pub } = supabase.storage.from('content-uploads').getPublicUrl(path);
        uploads.push({ url: pub.publicUrl, name: file.name });
      }
      if (uploads.length) setPendingAttachments((p) => [...p, ...uploads]);
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async (toOverride?: string) => {
    const to = (toOverride ?? (activeThread ? threads.find(t => normalizeLast10(t.phone) === activeThread)?.phone : composeTo)) || '';
    const text = composeBody.trim();
    const attachUrls = pendingAttachments.map((a) => a.url).join('\n');
    const body = [text, attachUrls].filter(Boolean).join(text && attachUrls ? '\n' : '');
    if (!to || !body) {
      toast.error('Recipient and message (or image) required');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('powerdial-sms', {
        body: { action: 'send', to, body },
      });
      if (error || !(data as any)?.ok) {
        const errCode = (data as any)?.error || error?.message || 'Failed to send';
        if (errCode === 'dnd') {
          const reason = (data as any)?.reason || 'opted_out';
          const last10 = String(to).replace(/\D/g, '').slice(-10);
          toast.error(`Blocked by DND list (${reason})`, {
            action: {
              label: 'Remove from DND',
              onClick: async () => {
                const { error: delErr } = await supabase
                  .from('sms_dnd_list')
                  .delete()
                  .eq('phone_last10', last10);
                if (delErr) toast.error(delErr.message);
                else toast.success('Removed from DND — try sending again');
              },
            },
            duration: 8000,
          });
        } else {
          toast.error(errCode);
        }
      } else {
        toast.success(pendingAttachments.length ? 'SMS + image link sent' : 'SMS sent');
        setComposeBody('');
        setPendingAttachments([]);
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

  const handleCreateCustomer = async (e: React.MouseEvent, phoneKey: string) => {
    e.stopPropagation();
    const last10 = normalizeLast10(phoneKey);
    if (last10.length !== 10) {
      toast.error('Invalid phone number');
      return;
    }
    const e164 = `+1${last10}`;
    const display = displayPhone(phoneKey);
    const contactName = contacts[last10];
    const fallbackName = contactName || `SMS Lead ${display}`;
    try {
      // Search-before-insert: look up by phone last 10 digits
      const { data: existing } = await supabase
        .from('customers')
        .select('id, full_name, status')
        .or(`phone.ilike.%${last10},phone.eq.${e164}`)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        toast.info(`${existing.full_name || display} is already a customer (${existing.status})`);
        return;
      }
      const { error } = await supabase.from('customers').insert({
        full_name: fallbackName,
        phone: e164,
        status: 'active',
        source: 'sms_inbox',
        category: 'digital-services',
        notes: `Created from SMS thread on ${new Date().toLocaleString()}`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`${fallbackName} added to New Clients`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create customer');
    }
  };

  // ---------- Send Proposal from SMS thread ----------
  const detectEmailInThread = useCallback((phoneKey: string): string => {
    const re = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    const threadMessages = messages.filter(m => {
      const counterpart = m.direction === 'inbound' ? m.from_address : m.to_address;
      return normalizeLast10(counterpart) === phoneKey;
    });
    for (const m of threadMessages) {
      const match = (m.body || '').match(re);
      if (match) return match[0];
    }
    return '';
  }, [messages]);

  const openSendProposal = (e: React.MouseEvent, phoneKey: string) => {
    e.stopPropagation();
    const last10 = normalizeLast10(phoneKey);
    if (last10.length !== 10) { toast.error('Invalid phone number'); return; }
    setProposalPhoneKey(last10);
    // Prefer the email already bound to this contact, otherwise auto-detect from thread
    const stored = contactEmails[last10];
    setProposalEmail(stored || detectEmailInThread(last10));
    setProposalStep('email');
    setProposalOpen(true);
  };

  const openNotes = (e: React.MouseEvent | null, phoneKey: string) => {
    if (e) e.stopPropagation();
    const last10 = normalizeLast10(phoneKey);
    if (last10.length !== 10) { toast.error('Invalid phone number'); return; }
    setNotesPhone('+1' + last10);
    setNotesOpen(true);
  };

  const handleProposalContinue = async () => {
    const email = proposalEmail.trim();
    if (!email || !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    // Bind this email to the SMS contact (pre-client) so it's remembered for next time
    if (proposalPhoneKey) {
      try {
        await supabase.from('sms_contacts').upsert(
          {
            phone_last10: proposalPhoneKey,
            phone: `+1${proposalPhoneKey}`,
            email,
            name: contacts[proposalPhoneKey] || null,
          } as never,
          { onConflict: 'phone_last10' },
        );
        setContactEmails((prev) => ({ ...prev, [proposalPhoneKey]: email }));
      } catch { /* non-fatal */ }
    }
    setProposalStep('choose');
  };

  const sendProposalTemplate = async (kind: '399' | '199' | '3000') => {
    if (!proposalPhoneKey) return;
    const email = proposalEmail.trim();
    if (!email) { toast.error('Email required'); return; }
    setProposalSending(true);
    try {
      const last10 = proposalPhoneKey;
      const e164 = `+1${last10}`;
      const display = formatPhone(last10);
      const contactName = contacts[last10] || `SMS Lead ${display}`;

      // Look up customer (if exists) so we can link the proposal
      const { data: existing } = await supabase
        .from('customers')
        .select('id, full_name, email')
        .or(`phone.ilike.%${last10},phone.eq.${e164}`)
        .limit(1)
        .maybeSingle();

      const customerId = existing?.id || null;
      const clientName = existing?.full_name || contactName;

      const exp = new Date();
      exp.setDate(exp.getDate() + 14);
      const expDate = exp.toISOString().slice(0, 10);

      let payload: Record<string, any>;
      if (kind === '399' || kind === '199') {
        const isHalf = kind === '199';
        const price = isHalf ? 199 : 399;
        const titleSuffix = isHalf ? ' (50% OFF — Limited Offer)' : '';
        payload = {
          title: `Real Estate Listing Video — $${price} Package${titleSuffix}`,
          client_name: clientName,
          client_email: email,
          client_phone: e164,
          amount: price,
          currency: 'USD',
          line_items: [{ description: `Real Estate Listing Video — $${price} Package (up to 4 bedrooms)${isHalf ? ' — 50% OFF promotional pricing' : ''}`, quantity: 1, unit_price: price }],
          notes: `Single AI-cinematic listing video for a real estate property. Full edit included, delivered in 9:16 Instagram/Reels format, up to 1 minute max length, covers up to 4 bedrooms. Additional bedrooms billed at $50/bedroom over 4. 48–72 hour turnaround.${isHalf ? ' This proposal reflects a 50% promotional discount off the standard $399 package.' : ''}`,
          terms: 'FULL PAYMENT IS REQUIRED BEFORE WORK IS RENDERED. Payment must be made via Zelle or Cash App OR Debit/Credit. Once this proposal is signed, the client may also pay via debit or credit card through the /payme page. Two (2) free revisions included. Additional revisions billed at $50 each.',
          proposal_body: `Real Estate Listing Video — $${price} Package${isHalf ? '\n\n*** 50% OFF — Limited promotional pricing (regularly $399, now $199) ***' : ''}

What's included:
• 1 cinematic AI-enhanced listing video
• Full edit: color grading, transitions, music sync, AI furniture removal & visual enhancements
• Delivered in 9:16 vertical format, optimized for Instagram Reels & TikTok
• Up to 1 minute maximum runtime
• Covers up to 4 bedrooms
• 48–72 hour turnaround from asset delivery
• 2 free revisions

Bedroom add-ons:
• Properties with more than 4 bedrooms: +$50 per additional bedroom

Payment Terms:
• FULL PAYMENT IS REQUIRED BEFORE WORK IS RENDERED.
• All payments must be made via Zelle or Cash App  OR Debit/Credit.
• Once this proposal is signed, the client may alternatively pay by debit or credit card through the /payme page.

By signing below, the client agrees to the scope, pricing, and payment terms outlined above.`,
          expiration_date: expDate,
          signature_required: true,
          customer_id: customerId,
          status: 'draft',
        };
      } else {
        payload = {
          title: 'Monthly Retainer Venture — $3,000/month',
          client_name: clientName,
          client_email: email,
          client_phone: e164,
          amount: 3000,
          currency: 'USD',
          line_items: [{ description: 'Monthly Retainer — Venture Engagement ($3,000/month)', quantity: 1, unit_price: 3000 }],
          notes: 'Monthly retainer engagement: ongoing creative production, marketing, and growth support. Billed monthly in advance.',
          terms: 'FULL PAYMENT OF $3,000 IS REQUIRED EACH MONTH BEFORE WORK IS RENDERED. Payment must be made via Zelle or Cash App OR Debit/Credit. Once this proposal is signed, the client may also pay via debit or credit card through the /payme page. Month-to-month — either party may cancel with 7 days written notice prior to the next billing cycle.',
          proposal_body: `Monthly Retainer Venture — $3,000 / month

What's included each month:
• Ongoing AI-driven content production (video, social, marketing assets)
• Paid ad campaign management & optimization
• Direct strategy access and weekly check-ins
• Priority turnaround on new requests
• Performance reporting and analytics

Engagement:
• Month-to-month retainer, billed in advance
• Either party may cancel with 7 days notice prior to the next billing cycle

Payment Terms:
• FULL PAYMENT OF $3,000 IS REQUIRED EACH MONTH BEFORE WORK IS RENDERED.
• All payments must be made via Zelle or Cash App  OR Debit/Credit.
• Once this proposal is signed, the client may alternatively pay by debit or credit card through the /payme page.
• Service begins after first month's payment is confirmed.

By signing below, the client agrees to the scope, pricing, and payment terms outlined above.`,
          expiration_date: expDate,
          signature_required: true,
          customer_id: customerId,
          status: 'draft',
        };
      }

      // Insert the proposal draft
      const { data: inserted, error: insErr } = await supabase
        .from('proposals')
        .insert(payload as never)
        .select('id')
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message || 'Failed to create proposal');

      // Send via the same workflow used in /proposals — use direct fetch so we can read non-2xx error bodies
      const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || '';
      const url = `https://${projectId}.supabase.co/functions/v1/clawd-bot/proposal-send`;
      const sess = await supabase.auth.getSession();
      const authToken = sess.data.session?.access_token || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ id: (inserted as { id: string }).id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Send failed (HTTP ${res.status})`);

      const label = kind === '399' ? '$399' : kind === '199' ? '$199 (50% off)' : '$3,000/mo';
      toast.success(`${label} proposal sent to ${email}`);
      setProposalOpen(false);
      setProposalPhoneKey(null);
      setProposalEmail('');
      setProposalStep('email');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send proposal');
    } finally {
      setProposalSending(false);
    }
  };

  const handleDeleteThread = async (e: React.MouseEvent, phoneKey: string) => {
    e.stopPropagation();
    const display = displayPhone(phoneKey);
    if (!confirm(`Delete entire SMS thread with ${display}?\n\nThis removes all messages from the inbox. This cannot be undone.`)) return;
    try {
      // Collect external_ids of inbound messages we're about to delete so the
      // VoidFix poller can't re-import them on the next refresh.
      const inboundExternalIds = messages
        .filter(m => m.direction === 'inbound' && normalizeLast10(m.from_address) === phoneKey && m.external_id)
        .map(m => ({ external_id: String(m.external_id), phone_last10: phoneKey }));
      if (inboundExternalIds.length > 0) {
        await supabase
          .from('sms_deleted_external_ids')
          .upsert(inboundExternalIds, { onConflict: 'external_id' });
      }
      // Match any communication where from_address or to_address ends with the last-10 digits
      const likePattern = `%${phoneKey}`;
      const { error } = await supabase
        .from('communications')
        .delete()
        .eq('type', 'sms')
        .or(`from_address.ilike.${likePattern},to_address.ilike.${likePattern}`);
      if (error) {
        toast.error(error.message);
        return;
      }
      // Local cleanup
      setMessages(prev => prev.filter(m => {
        const cp = m.direction === 'inbound' ? m.from_address : m.to_address;
        return normalizeLast10(cp) !== phoneKey;
      }));
      setUnreadThreads(prev => {
        const next = new Set(prev);
        next.delete(phoneKey);
        return next;
      });
      if (seenInboundRef.current[phoneKey]) {
        delete seenInboundRef.current[phoneKey];
        persistSeen();
      }
      if (activeThreadRef.current === phoneKey) setActiveThread(null);
      toast.success('Thread deleted');
      load({ silent: true });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete thread');
    }
  };

  return (
    <>
    <div className="glass-card flex flex-col md:flex-row min-h-[500px] max-h-[calc(100vh-260px)] overflow-hidden">
      {/* Threads list */}
      <div className={`md:w-[300px] md:border-r border-border ${activeThread ? 'hidden md:block' : 'block'}`}>
        <div className="p-3 border-b border-border flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold flex-1">SMS Inbox</span>
          <Button size="sm" variant="ghost" onClick={handleTestInbound} title="Send a test inbound webhook to verify VoidFix integration">
            <Webhook className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => syncAndLoad({ silent: false })}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowCompose(true); setActiveThread(null); }}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {/* Filter tabs: All / Starred */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${filterMode === 'all' ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            All ({threads.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('starred')}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${filterMode === 'starred' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            <Star className="h-3 w-3" />
            Starred ({threads.filter(t => starredSet.has(normalizeLast10(t.phone))).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('disconnected')}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${filterMode === 'disconnected' ? 'bg-orange-500/20 border-orange-500/50 text-orange-300' : 'border-border text-muted-foreground hover:text-foreground'}`}
            title="Threads where VoidFix sent the 'just got disconnected' follow-up — needs callback"
          >
            <PhoneOff className="h-3 w-3" />
            Disconnected ({threads.filter(t => disconnectedSet.has(normalizeLast10(t.phone))).length})
          </button>
        </div>
        <div className="px-3 py-2 border-b border-border">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or number…"
            className="h-7 text-[11px]"
          />
        </div>
        <ScrollArea className="h-[calc(100vh-340px)] min-h-[400px]">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : visibleThreads.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">
              {filterMode === 'starred' ? 'No starred clients yet' : filterMode === 'disconnected' ? 'No disconnected callbacks pending' : 'No SMS yet'}
            </p>
          ) : (
            visibleThreads.map(t => {
              const key = normalizeLast10(t.phone);
              const isActive = activeThread === key;
              const isStarred = starredSet.has(key);
              const isPinned = pinnedSet.has(key);
              return (
                <div
                  key={key}
                  draggable={isPinned}
                  onDragStart={(e) => { if (isPinned) { setDragKey(key); e.dataTransfer.effectAllowed = 'move'; } }}
                  onDragOver={(e) => { if (isPinned && dragKey && dragKey !== key) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                  onDrop={(e) => { if (isPinned) { e.preventDefault(); handlePinDrop(key); } }}
                  onDragEnd={() => setDragKey(null)}
                  className={`group relative w-full border-b border-border/50 hover:bg-muted/30 ${isActive ? 'bg-muted/50' : ''} ${isPinned ? 'bg-emerald-500/5 cursor-grab active:cursor-grabbing' : ''} ${dragKey === key ? 'opacity-50' : ''} ${dragKey && dragKey !== key && isPinned ? 'ring-1 ring-emerald-400/40' : ''}`}
                >
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <button
                      onClick={() => setActiveThread(key)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {unreadThreads.has(key) && (
                            <span
                              className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)] animate-pulse shrink-0"
                              aria-label="New message"
                            />
                          )}
                          {isPinned && (
                            <Pin
                              className="h-3.5 w-3.5 text-emerald-400 fill-emerald-400 shrink-0 rotate-45"
                              aria-label="Pinned"
                            />
                          )}
                          {isStarred && (
                            <Star
                              className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0"
                              aria-label="Signed proposal — starred client"
                            />
                          )}
                          {interestedSet.has(key) && (
                            <span
                              className="inline-block h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.9)] shrink-0"
                              aria-label="Marked interested on Power Dial call"
                              title="Marked interested on Power Dial call"
                            />
                          )}
                          <span
                            className="text-sm font-medium font-mono truncate"
                            style={nameColors[key] ? { color: nameColors[key] } : undefined}
                          >{displayPhone(t.phone)}</span>
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
                    <div className="flex shrink-0 items-center gap-1 pt-0.5">
                      <button
                        onClick={(e) => openNotes(e, key)}
                        className="p-1 rounded hover:bg-amber-500/20 text-amber-400 transition-colors"
                        title="Open notes (shared with Phone)"
                        aria-label="Open notes"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => openSendProposal(e, key)}
                        className="p-1 rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                        title="Send proposal"
                        aria-label="Send proposal"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => togglePin(e, key)}
                        className={`p-1 rounded transition-colors hover:bg-emerald-500/20 ${isPinned ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400'}`}
                        title={isPinned ? 'Unpin thread' : 'Pin thread to top'}
                        aria-label={isPinned ? 'Unpin thread' : 'Pin thread'}
                      >
                        <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-emerald-400 rotate-45' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteThread(e, key)}
                        className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                        title="Delete thread"
                        aria-label="Delete thread"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
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
            <div className="flex items-center gap-2">
              <EmojiButton onSelect={(emoji) => setComposeBody((b) => b + emoji)} side="top" align="start" />
              <Button onClick={() => handleSend(composeTo)} disabled={sending || !composeTo || !composeBody.trim()} className="ml-auto">
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Send
              </Button>
            </div>
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
                  <div className="flex items-center gap-1.5 min-w-0">
                    {starredSet.has(last10) && (
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" aria-label="Signed proposal — starred client" />
                    )}
                    {interestedSet.has(last10) && (
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.9)] shrink-0"
                        aria-label="Marked interested on Power Dial call"
                        title="Marked interested on Power Dial call"
                      />
                    )}
                    <span
                      className="text-sm font-semibold font-mono cursor-pointer hover:text-primary transition-colors select-none truncate"
                      style={nameColors[last10] ? { color: nameColors[last10] } : undefined}
                      title="Click to color · Double-click to add or edit a name"
                      onClick={() => setColorPickerOpen(true)}
                      onDoubleClick={(e) => { e.stopPropagation(); setNameDraft(currentName); setEditingName(true); }}
                    >
                      {displayPhone(activePhone)}
                    </span>
                  </div>
                );
              })()}
              <div className="flex-1" />
              {(() => {
                const activePhone = threads.find(t => normalizeLast10(t.phone) === activeThread)?.phone || activeThread || '';
                const last10 = normalizeLast10(activePhone);
                if (funneledSet.has(last10)) return null;
                return (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 gap-1"
                    onClick={async () => {
                      const res = await moveToVideographyFunnel({ phone: activePhone, name: contacts[last10] || null });
                      if (res?.ok) {
                        setFunneledSet((prev) => {
                          const next = new Set(prev);
                          next.add(last10);
                          return next;
                        });
                      }
                    }}
                    title="Move this contact to the Videography funnel"
                  >
                    <Workflow className="h-3.5 w-3.5" />
                    <span className="text-xs">Move to Funnel</span>
                  </Button>
                );
              })()}
              <Button
                size="sm"
                variant="ghost"
                className="text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 gap-1"
                onClick={() => {
                  if (!activeThread) return;
                  const last10 = activeThread.replace(/\D/g, '').slice(-10);
                  if (last10.length === 10) setCallPhone('+1' + last10);
                }}
                title="Call this contact via Twilio browser dialer"
              >
                <Phone className="h-3.5 w-3.5" />
                <span className="text-xs">Call</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 gap-1"
                onClick={() => {
                  if (!activeThread) return;
                  // Default to 1 hour from now in local time
                  const d = new Date(Date.now() + 60 * 60 * 1000);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  setScheduleDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
                  setScheduleTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
                  setScheduleBody(composeBody || '');
                  setScheduleOpen(true);
                }}
                title="Schedule a text to auto-send at a future date/time"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                <span className="text-xs">Schedule</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1"
                onClick={() => activeThread && openNotes(null, activeThread)}
                title="Open notes (shared with Phone)"
              >
                <StickyNote className="h-3.5 w-3.5" />
                <span className="text-xs">Notes</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
                onClick={() => {
                  const snippet = "Hi, I'm Warren. I do AI drone footage and I'd love to do one of your properties free of charge so we can build a network together. If you get an opportunity, call me back so we can discuss more. https://instagram.com/W4RR3Nguru";
                  setComposeBody((b) => (b ? b + (b.endsWith(' ') ? '' : ' ') + snippet : snippet));
                }}
                title="Insert quick pitch shortcut into reply"
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="text-xs">Quick Pitch</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
                onClick={(e) => activeThread && handleCreateCustomer(e, activeThread)}
                title="Create customer (add to New Clients)"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span className="text-xs">Create Customer</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 gap-1"
                onClick={(e) => activeThread && openSendProposal(e, activeThread)}
                title="Send proposal"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="text-xs">Send Proposal</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
                onClick={(e) => activeThread && togglePin(e, activeThread)}
                title={activeThread && pinnedSet.has(activeThread) ? 'Unpin thread' : 'Pin thread to top'}
              >
                {activeThread && pinnedSet.has(activeThread) ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5 rotate-45" />
                )}
                <span className="text-xs">{activeThread && pinnedSet.has(activeThread) ? 'Unpin' : 'Pin'}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={(e) => activeThread && handleDeleteThread(e, activeThread)}
                title="Delete thread"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
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
                        {(() => {
                          const bodyImgs = extractImageUrls(m.body);
                          const colImgs = Array.isArray(m.media_urls) ? m.media_urls.filter(Boolean) : [];
                          const imgs = Array.from(new Set([...colImgs, ...bodyImgs]));
                          const text = bodyImgs.length ? stripImageUrls(m.body) : m.body;
                          return (
                            <>
                              {text && <p className="text-sm whitespace-pre-wrap break-words">{text}</p>}
                              {imgs.map((url) => (
                                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
                                  <img src={url} alt="attachment" className="rounded-lg max-h-64 max-w-full object-contain border border-border/40" loading="lazy" />
                                </a>
                              ))}
                            </>
                          );
                        })()}
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
                {activePendingJobs.map(job => (
                  <div key={`pending-${job.id}`} className="flex justify-end">
                    <div className="max-w-[75%] rounded-2xl px-3 py-2 bg-[#0A84FF] text-white shadow-sm relative">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CalendarClock className="h-3 w-3 opacity-90" />
                        <span className="text-[9px] uppercase tracking-wide opacity-90 font-semibold">Scheduled</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">{job.body}</p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-[9px] opacity-80">
                          Sends {format(new Date(job.send_at), 'MMM d, h:mm a')}
                        </p>
                        <button
                          type="button"
                          onClick={() => cancelScheduledJob(job.id)}
                          className="text-[10px] font-semibold underline underline-offset-2 hover:opacity-80"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="p-3 border-t border-border space-y-2">
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map((a, i) => (
                    <div key={a.url} className="relative group">
                      <img src={a.url} alt={a.name} className="h-16 w-16 object-cover rounded border border-border" />
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((p) => p.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-90 hover:opacity-100"
                        title="Remove"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleAttachFiles(e.target.files)}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAttachment}
                  title="Attach image"
                  className="shrink-0"
                >
                  {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>
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
                <EmojiButton onSelect={(emoji) => setComposeBody((b) => b + emoji)} side="top" align="end" />
                <Button onClick={() => handleSend()} disabled={sending || (!composeBody.trim() && pendingAttachments.length === 0)}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a thread or start a new SMS
          </div>
        )}
      </div>
    </div>

    {/* Send Proposal Modal */}
    <Dialog open={proposalOpen} onOpenChange={(o) => { if (!o && !proposalSending) { setProposalOpen(false); setProposalStep('email'); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Proposal</DialogTitle>
          <DialogDescription>
            {proposalStep === 'email'
              ? 'Confirm or enter the client email. We auto-detect any email mentioned in this thread.'
              : 'Choose which proposal template to send.'}
          </DialogDescription>
        </DialogHeader>

        {proposalStep === 'email' ? (
          <div className="space-y-3 py-2">
            <label className="text-xs text-muted-foreground">Client Email</label>
            <Input
              type="email"
              placeholder="client@example.com"
              value={proposalEmail}
              onChange={(e) => setProposalEmail(e.target.value)}
              autoFocus
            />
            {proposalPhoneKey && (
              <p className="text-[11px] text-muted-foreground">
                Sending to: {formatPhone(proposalPhoneKey)}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 py-2">
            <button
              type="button"
              disabled={proposalSending}
              onClick={() => sendProposalTemplate('399')}
              className="w-full text-left p-4 rounded-lg border border-border hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors disabled:opacity-50"
            >
              <div className="font-semibold text-sm">$399 Listing Video Package</div>
              <div className="text-xs text-muted-foreground mt-1">Single AI-cinematic real estate listing video — full payment up front via Zelle / Cash App.</div>
            </button>
            <button
              type="button"
              disabled={proposalSending}
              onClick={() => sendProposalTemplate('199')}
              className="w-full text-left p-4 rounded-lg border border-amber-500/40 bg-amber-500/5 hover:border-amber-500/70 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">$199 Listing Video Package</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">50% OFF</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">Same $399 package — 50% promotional discount. Limited offer to close the deal.</div>
            </button>
            <button
              type="button"
              disabled={proposalSending}
              onClick={() => sendProposalTemplate('3000')}
              className="w-full text-left p-4 rounded-lg border border-border hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors disabled:opacity-50"
            >
              <div className="font-semibold text-sm">$3,000 / month Retainer Venture</div>
              <div className="text-xs text-muted-foreground mt-1">Monthly retainer engagement — full $3,000 due each month before work renders, via Zelle / Cash App.</div>
            </button>
            {proposalSending && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending proposal…
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {proposalStep === 'email' ? (
            <>
              <Button variant="ghost" onClick={() => setProposalOpen(false)}>Cancel</Button>
              <Button onClick={handleProposalContinue}>Continue</Button>
            </>
          ) : (
            <Button variant="ghost" disabled={proposalSending} onClick={() => setProposalStep('email')}>
              Back
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Shared Contact Notes — same drag-anywhere popup used on the Phone page.
        Backed by sms_contacts.notes (keyed by phone_last10), so notes saved here
        appear on the Phone page for the same contact, and vice versa. */}
    <CallNotesPopup open={notesOpen} onOpenChange={setNotesOpen} phone={notesPhone} />
    <Dialog open={!!callPhone} onOpenChange={(o) => { if (!o) setCallPhone(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Call Contact</DialogTitle>
          <DialogDescription>Place a call via the Twilio browser dialer.</DialogDescription>
        </DialogHeader>
        {callPhone && <TwilioKeypad prefilledNumber={callPhone} />}
      </DialogContent>
    </Dialog>

    <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-indigo-400" /> Schedule SMS
          </DialogTitle>
          <DialogDescription>
            Auto-send a text at a future date and time. Worker checks every minute.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Date</label>
              <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Time</label>
              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Message</label>
            <textarea
              value={scheduleBody}
              onChange={(e) => setScheduleBody(e.target.value)}
              rows={4}
              className="w-full mt-1 text-sm rounded-md border border-border bg-background px-3 py-2 resize-none"
              placeholder="Type the SMS to send…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
              disabled={scheduleSaving || !scheduleDate || !scheduleTime || !scheduleBody.trim() || !activeThread}
              onClick={async () => {
                if (!activeThread) return;
                const last10 = activeThread.replace(/\D/g, '').slice(-10);
                if (last10.length !== 10) { toast.error('Invalid phone'); return; }
                const sendAt = new Date(`${scheduleDate}T${scheduleTime}`);
                if (isNaN(sendAt.getTime())) { toast.error('Invalid date/time'); return; }
                if (sendAt.getTime() < Date.now() - 60_000) { toast.error('Time must be in the future'); return; }
                setScheduleSaving(true);
                const { error } = await supabase.from('scheduled_sms_jobs').insert({
                  to_phone: '+1' + last10,
                  body: scheduleBody.trim(),
                  send_at: sendAt.toISOString(),
                  source: 'sms_inbox_schedule_btn',
                });
                 setScheduleSaving(false);
                 if (error) { toast.error(error.message); return; }
                 toast.success(`Scheduled for ${sendAt.toLocaleString()}`);
                 setScheduleOpen(false);
                 setScheduleBody('');
                 loadScheduledJobs();
               }}
            >
              {scheduleSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CalendarClock className="h-3.5 w-3.5 mr-1" />}
              Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Contact Name & Color</DialogTitle>
          <DialogDescription>Add or edit the contact's name and pick a color for the thread header.</DialogDescription>
        </DialogHeader>
        {(() => {
          const activePhone = threads.find(t => normalizeLast10(t.phone) === activeThread)?.phone || activeThread || '';
          const last10 = normalizeLast10(activePhone);
          const current = nameColors[last10] || '';
          const currentName = contacts[last10] || '';
          return (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <div className="flex gap-2">
                  <Input
                    defaultValue={currentName}
                    placeholder="Add name (leave blank to remove)"
                    className="h-8 text-sm flex-1"
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveContactName(activePhone, (e.target as HTMLInputElement).value);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => saveContactName(activePhone, nameDraft || currentName)}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Color</label>
                <div className="grid grid-cols-3 gap-2">
                  {NAME_COLOR_OPTIONS.map(opt => {
                    const selected = current === opt.value;
                    return (
                      <button
                        key={opt.label}
                        onClick={() => { setNameColor(last10, opt.value || null); }}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs hover:bg-muted transition-colors ${selected ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                      >
                        <span
                          className="inline-block h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: opt.value || 'transparent' }}
                        />
                        <span style={opt.value ? { color: opt.value } : undefined}>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}
