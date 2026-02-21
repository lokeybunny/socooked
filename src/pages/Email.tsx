import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Mail, Send, FileEdit, Inbox, RefreshCw, ArrowLeft,
  Instagram, MessageSquareText, Voicemail, Filter, Trash2, Eye, Reply, Paperclip, X,
  ChevronsUpDown, Check, Users, Search, Info, Tag, Zap, UserPlus,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface GmailEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
}

interface Attachment {
  filename: string;
  mimeType: string;
  data: string; // base64
  size: number;
}

interface IGConversation {
  id: string;
  participantUsername: string;
  participantId: string;
  lastMessage: string;
  lastMessageTime: string;
  messages: IGMessage[];
}

interface IGMessage {
  id: string;
  fromUsername: string;
  fromId: string;
  text: string;
  createdTime: string;
  isFromMe: boolean;
}

interface MCSubscriberInfo {
  id: number;
  page_id: number;
  status: string;
  first_name: string;
  last_name: string;
  name: string;
  gender: string;
  profile_pic: string;
  locale: string;
  language: string;
  timezone: string;
  live_chat_url: string;
  last_input_text: string;
  subscribed: string;
  last_interaction: string;
  last_seen: string;
  ig_username?: string;
  ig_id?: number;
  phone?: string;
  email?: string;
  tags: { id: number; name: string }[];
  custom_fields: { id: number; name: string; value: any; type: string }[];
}

interface MCFlow {
  ns: string;
  name: string;
  status: string;
}

interface MCTag {
  id: number;
  name: string;
}

const GMAIL_FN = 'gmail-api';
const IG_FN = 'instagram-api';

async function callInstagram(action: string, params?: string): Promise<any> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const extra = params ? `&${params}` : '';
  const url = `https://${projectId}.supabase.co/functions/v1/${IG_FN}?action=${action}${extra}`;
  const res = await fetch(url, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Instagram API error');
  return data;
}

async function callInstagramPost(action: string, body: any): Promise<any> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/${IG_FN}?action=${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Instagram API error');
  return data;
}

async function callGmail(action: string, body?: any): Promise<any> {
  if (body) {
    const { data, error } = await supabase.functions.invoke(GMAIL_FN, {
      body,
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (error) throw new Error(error.message || 'Gmail function error');
    // supabase.functions.invoke with POST ignores query params, so pass action in body
    return data;
  }
  // GET-style: use query param
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/${GMAIL_FN}?action=${action}`;
  const res = await fetch(url, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gmail API error');
  return data;
}

async function callGmailPost(action: string, body: any): Promise<any> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/${GMAIL_FN}?action=${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gmail API error');
  return data;
}

// ─── Legacy comms helpers for SMS/Voicemail/Instagram ────────
const emptyForm = {
  to: '',
  subject: '',
  body: '',
  customer_id: '',
};

export default function EmailPage() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<GmailEmail[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('inbox');
  const [channel, setChannel] = useState<'email' | 'instagram' | 'sms' | 'voicemail'>('email');
  const [selectedCustomerEmail, setSelectedCustomerEmail] = useState<string>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeCustomerOpen, setComposeCustomerOpen] = useState(false);

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [composeAttachments, setComposeAttachments] = useState<Attachment[]>([]);

  // View email
  const [viewEmail, setViewEmail] = useState<GmailEmail | null>(null);

  // Reply
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);

  // Legacy comms for non-email channels
  const [legacyComms, setLegacyComms] = useState<any[]>([]);

  // Instagram DMs
  const [igConversations, setIgConversations] = useState<IGConversation[]>([]);
  const [igActiveConv, setIgActiveConv] = useState<IGConversation | null>(null);
  const [igReplyText, setIgReplyText] = useState('');
  const [igSending, setIgSending] = useState(false);
  const [readCustomerEmailIds, setReadCustomerEmailIds] = useState<Set<string>>(new Set());

  // ManyChat subscriber details
  const [igSubscriberInfo, setIgSubscriberInfo] = useState<MCSubscriberInfo | null>(null);
  const [igInfoLoading, setIgInfoLoading] = useState(false);
  const [igShowInfo, setIgShowInfo] = useState(false);
  const [igSearchName, setIgSearchName] = useState('');
  const [igSearchResults, setIgSearchResults] = useState<any[]>([]);
  const [igSearching, setIgSearching] = useState(false);
  const [igFlows, setIgFlows] = useState<MCFlow[]>([]);
  const [igTags, setIgTags] = useState<MCTag[]>([]);
  const [igNewTagName, setIgNewTagName] = useState('');
  const [igSelectedFlow, setIgSelectedFlow] = useState('');
  const [igSendingFlow, setIgSendingFlow] = useState(false);

  const handleFileSelect = async (files: FileList | null, target: 'compose' | 'reply') => {
    if (!files) return;
    const maxSize = 10 * 1024 * 1024; // 10MB per file
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // strip data:...;base64,
        };
        reader.readAsDataURL(file);
      });
      newAttachments.push({ filename: file.name, mimeType: file.type || 'application/octet-stream', data, size: file.size });
    }
    if (target === 'compose') {
      setComposeAttachments((prev) => [...prev, ...newAttachments]);
    } else {
      setReplyAttachments((prev) => [...prev, ...newAttachments]);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id, full_name, email, phone');
    setCustomers(data || []);
  }, []);

  const loadEmails = useCallback(async (tab: string) => {
    setLoading(true);
    try {
      const gmailAction = tab === 'customers' ? 'inbox' : tab;
      const data = await callGmail(gmailAction);
      setEmails(data.emails || []);
    } catch (e: any) {
      console.error('Gmail load error:', e);
      toast.error(e.message || 'Failed to load emails');
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLegacy = useCallback(async () => {
    setLoading(true);
    const types = channel === 'sms' ? ['sms'] : ['voicemail'];
    const { data } = await supabase
      .from('communications')
      .select('*')
      .in('type', types)
      .order('created_at', { ascending: false });
    setLegacyComms(data || []);
    setLoading(false);
  }, [channel]);

  const loadInstagram = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callInstagram('conversations');
      setIgConversations(data.conversations || []);
    } catch (e: any) {
      console.error('Instagram load error:', e);
      toast.error(e.message || 'Failed to load Instagram DMs');
      setIgConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleIgSendReply = async () => {
    if (!igActiveConv || !igReplyText.trim()) return;
    setIgSending(true);
    try {
      await callInstagramPost('send', {
        subscriber_id: igActiveConv.participantId,
        message: igReplyText.trim(),
      });
      toast.success('Message sent!');
      setIgReplyText('');
      // Reload messages for this subscriber
      const data = await callInstagram('messages', `subscriber_id=${igActiveConv.participantId}`);
      setIgActiveConv({ ...igActiveConv, messages: data.messages || [] });
    } catch (e: any) {
      const msg = e.message || 'Failed to send message';
      if (msg.includes('24h') || msg.includes('24H') || msg.includes('messaging window')) {
        toast.error('⏳ 24h messaging window expired. The subscriber must DM you first before you can reply.', { duration: 6000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setIgSending(false);
    }
  };

  // ─── ManyChat: Load subscriber info ───
  const loadSubscriberInfo = async (subscriberId: string) => {
    setIgInfoLoading(true);
    try {
      const result = await callInstagram('subscriber', `subscriber_id=${subscriberId}`);
      setIgSubscriberInfo(result.data || null);
    } catch (e: any) {
      // Silently handle - subscriber may not exist in ManyChat
      setIgSubscriberInfo(null);
    } finally {
      setIgInfoLoading(false);
    }
  };

  const loadFlows = async () => {
    try {
      const result = await callInstagram('flows');
      setIgFlows(result.data || []);
    } catch { setIgFlows([]); }
  };

  const loadTags = async () => {
    try {
      const result = await callInstagram('tags');
      setIgTags(result.data || []);
    } catch { setIgTags([]); }
  };

  const handleIgSearch = async () => {
    if (!igSearchName.trim()) return;
    setIgSearching(true);
    try {
      const result = await callInstagram('find', `name=${encodeURIComponent(igSearchName.trim())}`);
      setIgSearchResults(result.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Search failed');
      setIgSearchResults([]);
    } finally {
      setIgSearching(false);
    }
  };

  const handleAddTag = async (subscriberId: string, tagName: string) => {
    try {
      await callInstagramPost('add-tag', { subscriber_id: subscriberId, tag_name: tagName });
      toast.success(`Tag "${tagName}" added`);
      await loadSubscriberInfo(subscriberId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to add tag');
    }
  };

  const handleRemoveTag = async (subscriberId: string, tagName: string) => {
    try {
      await callInstagramPost('remove-tag', { subscriber_id: subscriberId, tag_name: tagName });
      toast.success(`Tag "${tagName}" removed`);
      await loadSubscriberInfo(subscriberId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove tag');
    }
  };

  const handleSendFlow = async (subscriberId: string, flowNs: string) => {
    setIgSendingFlow(true);
    try {
      await callInstagramPost('send-flow', { subscriber_id: subscriberId, flow_ns: flowNs });
      toast.success('Flow sent!');
      setIgSelectedFlow('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send flow');
    } finally {
      setIgSendingFlow(false);
    }
  };

  useEffect(() => {
    if (channel === 'instagram') {
      loadFlows();
      loadTags();
    }
  }, [channel]);

  useEffect(() => {
    if (igActiveConv) {
      loadSubscriberInfo(igActiveConv.participantId);
      setIgShowInfo(false);
    } else {
      setIgSubscriberInfo(null);
    }
  }, [igActiveConv]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (channel === 'email') {
      loadEmails(activeTab);
    } else if (channel === 'instagram') {
      loadInstagram();
      setIgActiveConv(null);
    } else if (channel === 'sms' || channel === 'voicemail') {
      loadLegacy();
    }

    // Realtime: auto-refresh when new communications arrive (always active)
    const realtimeChannel = supabase
      .channel('messages_page_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'communications' },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow.type === 'instagram' && newRow.direction === 'inbound') {
            const fromUser = (newRow.from_address || (newRow.metadata as any)?.ig_username || 'Someone');
            // Always show toast for new Instagram DMs
            toast(`📩 New Instagram DM from ${fromUser}`, { duration: 5000 });
            // Refresh Instagram data if currently viewing instagram
            if (channel === 'instagram') {
              loadInstagram();
              setIgActiveConv((prev) => {
                if (prev && (newRow.external_id === prev.participantId || newRow.to_address === prev.participantId)) {
                  callInstagram('messages', `subscriber_id=${prev.participantId}`).then((data) => {
                    setIgActiveConv((curr) => curr ? { ...curr, messages: data.messages || [] } : null);
                  }).catch(() => {});
                }
                return prev;
              });
            }
          } else if (channel === 'sms' && newRow.type === 'sms') {
            loadLegacy();
          } else if (channel === 'voicemail' && newRow.type === 'voicemail') {
            loadLegacy();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(realtimeChannel); };
  }, [channel, activeTab, loadEmails, loadLegacy, loadInstagram]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (channel === 'email') {
      await loadEmails(activeTab);
    } else if (channel === 'instagram') {
      await loadInstagram();
      setIgActiveConv(null);
    } else {
      await loadLegacy();
    }
    setRefreshing(false);
  };

  const handleSend = async () => {
    if (!form.to || !form.subject) {
      toast.error('To and Subject are required');
      return;
    }
    setSending(true);
    try {
      await callGmailPost('send', {
        to: form.to,
        subject: form.subject,
        body: form.body,
        attachments: composeAttachments.length > 0 ? composeAttachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })) : undefined,
      });
      toast.success('Email sent!');
      setComposeOpen(false);
      setForm(emptyForm);
      setComposeAttachments([]);
      if (activeTab === 'sent') loadEmails('sent');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setSending(true);
    try {
      await callGmailPost('save-draft', {
        to: form.to,
        subject: form.subject,
        body: form.body,
      });
      toast.success('Draft saved!');
      setComposeOpen(false);
      setForm(emptyForm);
      if (activeTab === 'drafts') loadEmails('drafts');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save draft');
    } finally {
      setSending(false);
    }
  };

  const handleOpenEmail = async (email: GmailEmail) => {
    // If it's a draft, open in compose dialog for editing
    if (activeTab === 'drafts') {
      const toAddr = email.to || '';
      const matchingCustomer = customers.find((c) => c.email && toAddr.toLowerCase().includes(c.email.toLowerCase()));
      setForm({
        to: toAddr,
        subject: email.subject || '',
        body: email.body || email.snippet || '',
        customer_id: matchingCustomer?.id || '',
      });
      setComposeAttachments([]);
      setComposeOpen(true);
      return;
    }

    setViewEmail(email);
    // Clear from notification count when a customer email is opened
    setReadCustomerEmailIds((prev) => new Set(prev).add(email.id));
    setReplyOpen(false);
    setReplyBody('');
    setReplyAttachments([]);
    // Mark as read
    if (email.isUnread && activeTab === 'inbox') {
      try {
        await callGmail(`message&id=${email.id}`);
        setEmails((prev) =>
          prev.map((e) => (e.id === email.id ? { ...e, isUnread: false } : e))
        );
      } catch { /* ignore */ }
    }
  };

  const handleReply = async () => {
    if (!viewEmail || !replyBody.trim()) return;
    setReplying(true);
    try {
      const replyTo = viewEmail.from.includes('warren@stu25.com') ? viewEmail.to : viewEmail.from;
      const emailMatch = replyTo.match(/<(.+?)>/);
      const toAddr = emailMatch ? emailMatch[1] : replyTo;
      const subject = viewEmail.subject.startsWith('Re:') ? viewEmail.subject : `Re: ${viewEmail.subject}`;
      await callGmailPost('send', {
        to: toAddr,
        subject,
        body: replyBody,
        attachments: replyAttachments.length > 0 ? replyAttachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })) : undefined,
      });
      toast.success('Reply sent!');
      setReplyOpen(false);
      setReplyBody('');
      setReplyAttachments([]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  // Search filter helper
  const matchesSearch = (text: string) =>
    !searchQuery.trim() || text.toLowerCase().includes(searchQuery.trim().toLowerCase());

  // Filter emails by customer email + search
  const filteredEmails = emails.filter((e) => {
    const customerMatch = selectedCustomerEmail === 'all' ||
      e.from.toLowerCase().includes(selectedCustomerEmail.toLowerCase()) ||
      e.to.toLowerCase().includes(selectedCustomerEmail.toLowerCase());
    const searchMatch = matchesSearch(`${e.subject} ${e.from} ${e.to} ${e.snippet}`);
    return customerMatch && searchMatch;
  });

  // Customer email options for filter
  const customerEmailOptions = customers.filter((c) => c.email);
  const customerEmailSet = new Set(customers.filter((c) => c.email).map((c) => c.email!.toLowerCase()));

  const isFromCustomer = (email: GmailEmail) => {
    const fromAddr = email.from.toLowerCase();
    return Array.from(customerEmailSet).some((ce) => fromAddr.includes(ce));
  };

  // Count inbox emails from customers that haven't been read in this session
  const customerEmailCount = emails.filter((e) => isFromCustomer(e) && !readCustomerEmailIds.has(e.id)).length;
  // Pre-fill compose from customer select
  const handleCustomerSelect = (custId: string) => {
    const cust = customers.find((c) => c.id === custId);
    setForm({ ...form, customer_id: custId, to: cust?.email || '' });
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  const renderEmailList = (items: GmailEmail[]) =>
    items.length === 0 ? (
      <p className="text-sm text-muted-foreground py-8 text-center">Nothing here yet.</p>
    ) : (
      <div className="space-y-2">
        {items.map((email) => {
          const fromClient = isFromCustomer(email);
          const isDimmed = selectedCustomerEmail === 'all' && !fromClient;

          return (
            <button
              key={email.id}
              onClick={() => handleOpenEmail(email)}
              className={`w-full text-left glass-card p-4 flex items-start justify-between gap-4 hover:bg-accent/50 transition-colors ${
                email.isUnread ? 'border-l-2 border-l-primary' : ''
              } ${isDimmed ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <Mail className={`h-4 w-4 mt-0.5 shrink-0 ${isDimmed ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
                <div className="min-w-0">
                  <p className={`text-sm truncate ${
                    isDimmed
                      ? 'font-normal text-muted-foreground'
                      : email.isUnread
                        ? 'font-semibold text-foreground'
                        : 'font-medium text-foreground'
                  }`}>
                    {email.subject || '(no subject)'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {activeTab === 'sent' ? `To: ${email.to}` : `From: ${email.from}`}
                    </p>
                    {fromClient && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 text-primary text-[10px] font-medium px-1.5 py-0.5 leading-none">
                        Customer
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{email.snippet}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(email.date)}</p>
                </div>
              </div>
              {activeTab === 'drafts' ? (
                <FileEdit className="h-4 w-4 shrink-0 mt-1 text-muted-foreground" />
              ) : (
                <Eye className={`h-4 w-4 shrink-0 mt-1 ${isDimmed ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
              )}
            </button>
          );
        })}
      </div>
    );

  const renderLegacyList = (items: any[]) =>
    items.length === 0 ? (
      <p className="text-sm text-muted-foreground py-8 text-center">Nothing here yet.</p>
    ) : (
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="glass-card p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {item.type === 'sms' ? (
                <MessageSquareText className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              ) : (
                <Voicemail className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.subject || item.phone_number || 'No subject'}</p>
                <p className="text-xs text-muted-foreground truncate">{item.phone_number || item.body?.substring(0, 50) || '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
                  {item.duration_seconds ? ` · ${Math.floor(item.duration_seconds / 60)}m ${item.duration_seconds % 60}s` : ''}
                </p>
              </div>
            </div>
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>
    );

  // ─── Email detail view ────────────────────────────────
  if (viewEmail) {
    return (
      <AppLayout>
        <div className="space-y-4 animate-fade-in">
          <Button variant="ghost" size="sm" onClick={() => setViewEmail(null)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-xl font-semibold text-foreground">{viewEmail.subject || '(no subject)'}</h2>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">From:</span> {viewEmail.from}</p>
              <p><span className="font-medium text-foreground">To:</span> {viewEmail.to}</p>
              <p><span className="font-medium text-foreground">Date:</span> {formatDate(viewEmail.date)}</p>
            </div>
            <div className="border-t border-border pt-4">
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: viewEmail.body || '<p class="text-muted-foreground">No content</p>' }}
              />
            </div>

            {/* Reply section */}
            {!replyOpen ? (
              <div className="border-t border-border pt-4">
                <Button variant="outline" onClick={() => setReplyOpen(true)} className="gap-1.5">
                  <Reply className="h-4 w-4" /> Reply
                </Button>
              </div>
            ) : (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Replying to: {viewEmail.from.includes('warren@stu25.com') ? viewEmail.to : viewEmail.from}
                </p>
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write your reply..."
                  className="min-h-[120px]"
                />
                {/* Reply attachments */}
                <div className="flex flex-wrap gap-2">
                  {replyAttachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs text-foreground">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate max-w-[150px]">{att.filename}</span>
                      <span className="text-muted-foreground">({formatFileSize(att.size)})</span>
                      <button onClick={() => setReplyAttachments((prev) => prev.filter((_, j) => j !== i))} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files, 'reply')}
                    />
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <Paperclip className="h-4 w-4" /> Attach files
                    </div>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setReplyOpen(false); setReplyBody(''); setReplyAttachments([]); }}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleReply} disabled={replying || !replyBody.trim()} className="gap-1.5">
                      <Send className="h-4 w-4" /> {replying ? 'Sending...' : 'Send Reply'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Messages</h1>
            <p className="text-muted-foreground mt-1">Manage your messages across all channels.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            {channel === 'email' && (
              <Button onClick={() => { setForm(emptyForm); setComposeAttachments([]); setComposeOpen(true); }} className="gap-1.5">
                <Plus className="h-4 w-4" /> Compose
              </Button>
            )}
          </div>
        </div>

        {/* Channel switcher */}
        <div className="flex items-center gap-2 border-b border-border pb-4">
          {[
            { key: 'email' as const, icon: Mail, label: 'Email', comingSoon: false },
            { key: 'instagram' as const, icon: Instagram, label: 'Instagram', comingSoon: false },
            { key: 'sms' as const, icon: MessageSquareText, label: 'SMS', comingSoon: false },
            { key: 'voicemail' as const, icon: Voicemail, label: 'Voicemail', comingSoon: false },
          ].map(({ key, icon: Icon, label, comingSoon }) => (
            <div key={key} className="relative">
              <Button
                variant={channel === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => !comingSoon && setChannel(key)}
                className={cn("gap-1.5", comingSoon && "opacity-50 cursor-not-allowed")}
                disabled={comingSoon}
              >
                <Icon className="h-4 w-4" /> {label}
              </Button>
              {comingSoon && (
                <span className="absolute -top-2 -right-2 text-[9px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full leading-none">
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Email channel */}
        {channel === 'email' ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between gap-4">
              <TabsList>
                <TabsTrigger value="inbox" className="gap-1.5">
                  <Inbox className="h-3.5 w-3.5" /> Inbox
                </TabsTrigger>
                <TabsTrigger value="customers" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Customers
                  {customerEmailCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none">
                      {customerEmailCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="sent" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Sent</TabsTrigger>
                <TabsTrigger value="drafts" className="gap-1.5"><FileEdit className="h-3.5 w-3.5" /> Drafts</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={filterOpen} className="w-[220px] justify-between font-normal">
                      {selectedCustomerEmail === 'all'
                        ? 'All emails'
                        : customerEmailOptions.find((c) => c.email === selectedCustomerEmail)?.full_name || selectedCustomerEmail}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Search customers..." />
                      <CommandList>
                        <CommandEmpty>No customer found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => { setSelectedCustomerEmail('all'); setFilterOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", selectedCustomerEmail === 'all' ? "opacity-100" : "opacity-0")} />
                            All emails
                          </CommandItem>
                          {customerEmailOptions.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={`${c.full_name} ${c.email}`}
                              onSelect={() => { setSelectedCustomerEmail(c.email); setFilterOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedCustomerEmail === c.email ? "opacity-100" : "opacity-0")} />
                              {c.full_name} ({c.email})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {['inbox', 'sent', 'drafts'].map((tab) => (
              <TabsContent key={tab} value={tab}>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading emails...</span>
                  </div>
                ) : (
                  renderEmailList(filteredEmails)
                )}
              </TabsContent>
            ))}
            <TabsContent value="customers">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading emails...</span>
                </div>
              ) : (
                renderEmailList(emails.filter((e) => isFromCustomer(e) && matchesSearch(`${e.subject} ${e.from} ${e.to} ${e.snippet}`)))
              )}
            </TabsContent>
          </Tabs>
        ) : channel === 'sms' || channel === 'voicemail' ? (
          <div>{loading ? <p className="text-sm text-muted-foreground">Loading...</p> : renderLegacyList(legacyComms.filter((c) => matchesSearch(`${c.subject || ''} ${c.phone_number || ''} ${c.body || ''}`)))}</div>
        ) : channel === 'instagram' ? (
          loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading Instagram DMs...</span>
            </div>
          ) : igActiveConv ? (
            /* ─── Instagram conversation detail ─── */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setIgActiveConv(null)} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> Back to conversations
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIgShowInfo(!igShowInfo)} className="gap-1.5">
                    <Info className="h-4 w-4" /> {igShowInfo ? 'Hide Info' : 'Subscriber Info'}
                  </Button>
                </div>
              </div>

              <div className={cn("grid gap-4", igShowInfo ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1")}>
                {/* Chat panel */}
                <div className={cn("glass-card p-4", igShowInfo ? "lg:col-span-2" : "")}>
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                    <Instagram className="h-5 w-5 text-pink-500" />
                    <span className="font-semibold text-foreground">@{igActiveConv.participantUsername}</span>
                    {igSubscriberInfo && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {igSubscriberInfo.name}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {[...igActiveConv.messages].reverse().map((msg) => (
                      <div key={msg.id} className={cn("flex", msg.isFromMe ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[70%] rounded-lg px-3 py-2 text-sm",
                          msg.isFromMe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}>
                          <p>{msg.text}</p>
                          <p className={cn("text-[10px] mt-1", msg.isFromMe ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            {formatDate(msg.createdTime)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Reply input */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                    <Input
                      value={igReplyText}
                      onChange={(e) => setIgReplyText(e.target.value)}
                      placeholder="Type a message..."
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleIgSendReply(); } }}
                    />
                    <Button size="sm" onClick={handleIgSendReply} disabled={igSending || !igReplyText.trim()} className="gap-1.5">
                      <Send className="h-4 w-4" /> {igSending ? '...' : 'Send'}
                    </Button>
                  </div>
                </div>

                {/* Subscriber info panel */}
                {igShowInfo && (
                  <div className="glass-card p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Users className="h-4 w-4" /> Subscriber Details
                    </h3>
                    {igInfoLoading ? (
                      <div className="flex items-center gap-2 py-4">
                        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Loading...</span>
                      </div>
                    ) : igSubscriberInfo ? (
                      <div className="space-y-3 text-sm">
                        {igSubscriberInfo.profile_pic && (
                          <img src={igSubscriberInfo.profile_pic} alt="" className="h-12 w-12 rounded-full" />
                        )}
                        <div className="space-y-1">
                          <p className="text-foreground font-medium">{igSubscriberInfo.name}</p>
                          {igSubscriberInfo.ig_username && <p className="text-muted-foreground text-xs">@{igSubscriberInfo.ig_username}</p>}
                          {igSubscriberInfo.email && <p className="text-muted-foreground text-xs">{igSubscriberInfo.email}</p>}
                          {igSubscriberInfo.phone && <p className="text-muted-foreground text-xs">{igSubscriberInfo.phone}</p>}
                          <p className="text-muted-foreground text-xs">Status: {igSubscriberInfo.status}</p>
                          {igSubscriberInfo.last_interaction && (
                            <p className="text-muted-foreground text-xs">Last active: {formatDate(igSubscriberInfo.last_interaction)}</p>
                          )}
                          {igSubscriberInfo.subscribed && (
                            <p className="text-muted-foreground text-xs">Subscribed: {formatDate(igSubscriberInfo.subscribed)}</p>
                          )}
                        </div>

                        {/* Tags */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <Tag className="h-3 w-3" /> Tags
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {(igSubscriberInfo.tags || []).map((tag) => (
                              <span key={tag.id} className="inline-flex items-center gap-1 bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-[10px]">
                                {tag.name}
                                <button onClick={() => handleRemoveTag(igActiveConv.participantId, tag.name)} className="hover:text-destructive">
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            <Select value={igNewTagName} onValueChange={setIgNewTagName}>
                              <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue placeholder="Add tag..." />
                              </SelectTrigger>
                              <SelectContent>
                                {igTags.map((t) => (
                                  <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              disabled={!igNewTagName}
                              onClick={() => { handleAddTag(igActiveConv.participantId, igNewTagName); setIgNewTagName(''); }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Send Flow */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <Zap className="h-3 w-3" /> Send Flow
                          </p>
                          <div className="flex items-center gap-1">
                            <Select value={igSelectedFlow} onValueChange={setIgSelectedFlow}>
                              <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue placeholder="Select flow..." />
                              </SelectTrigger>
                              <SelectContent>
                                {igFlows.filter((f) => f.status === 'active' || f.status === 'published').map((f) => (
                                  <SelectItem key={f.ns} value={f.ns}>{f.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              disabled={!igSelectedFlow || igSendingFlow}
                              onClick={() => handleSendFlow(igActiveConv.participantId, igSelectedFlow)}
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Custom Fields */}
                        {igSubscriberInfo.custom_fields && igSubscriberInfo.custom_fields.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">Custom Fields</p>
                            <div className="space-y-0.5">
                              {igSubscriberInfo.custom_fields.filter((f) => f.value).map((f) => (
                                <p key={f.id} className="text-[10px] text-muted-foreground">
                                  <span className="font-medium">{f.name}:</span> {String(f.value)}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {igSubscriberInfo.live_chat_url && (
                          <a
                            href={igSubscriberInfo.live_chat_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            Open in ManyChat →
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No subscriber data available</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ─── Instagram conversation list + search ─── */
            <div className="space-y-4">
              {/* Search subscribers */}
              <div className="flex items-center gap-2">
                <Input
                  value={igSearchName}
                  onChange={(e) => setIgSearchName(e.target.value)}
                  placeholder="Search subscribers by name..."
                  onKeyDown={(e) => { if (e.key === 'Enter') handleIgSearch(); }}
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={handleIgSearch} disabled={igSearching} className="gap-1.5">
                  <Search className="h-4 w-4" /> {igSearching ? '...' : 'Search'}
                </Button>
              </div>

              {/* Search results */}
              {igSearchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Search Results</p>
                  {igSearchResults.map((sub: any) => (
                    <button
                      key={sub.id}
                      onClick={() => {
                        const newConv: IGConversation = {
                          id: String(sub.id),
                          participantUsername: sub.ig_username || sub.name || 'unknown',
                          participantId: String(sub.id),
                          lastMessage: sub.last_input_text || '',
                          lastMessageTime: sub.last_interaction || '',
                          messages: [],
                        };
                        setIgActiveConv(newConv);
                        setIgSearchResults([]);
                        setIgSearchName('');
                        // Load messages
                        callInstagram('messages', `subscriber_id=${sub.id}`).then((data) => {
                          setIgActiveConv((prev) => prev ? { ...prev, messages: data.messages || [] } : null);
                        }).catch(() => {});
                      }}
                      className="w-full text-left glass-card p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors"
                    >
                      {sub.profile_pic && <img src={sub.profile_pic} alt="" className="h-8 w-8 rounded-full" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{sub.name}</p>
                        {sub.ig_username && <p className="text-xs text-muted-foreground">@{sub.ig_username}</p>}
                      </div>
                      <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />
                    </button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setIgSearchResults([])} className="text-xs">Clear results</Button>
                </div>
              )}

              {/* Conversation list */}
              {igConversations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No Instagram conversations found.</p>
              ) : (
                <div className="space-y-2">
                  {igConversations.filter((conv) => matchesSearch(`${conv.participantUsername} ${conv.lastMessage}`)).map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setIgActiveConv(conv)}
                      className="w-full text-left glass-card p-4 flex items-start justify-between gap-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <Instagram className="h-4 w-4 text-pink-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">@{conv.participantUsername}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(conv.lastMessageTime)}</p>
                        </div>
                      </div>
                      <Eye className="h-4 w-4 shrink-0 mt-1 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        ) : null}
      </div>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Compose Email</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer (optional)</Label>
              <Popover open={composeCustomerOpen} onOpenChange={setComposeCustomerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {form.customer_id
                      ? customers.find((c) => c.id === form.customer_id)?.full_name || 'Select customer'
                      : 'Select customer to auto-fill'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customers..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.filter((c) => c.email).map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.full_name} ${c.email}`}
                            onSelect={() => { handleCustomerSelect(c.id); setComposeCustomerOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.customer_id === c.id ? "opacity-100" : "opacity-0")} />
                            {c.full_name} ({c.email})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
                placeholder="recipient@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Email subject"
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write your email..."
                className="flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            {/* Compose attachments */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {composeAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs text-foreground">
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate max-w-[150px]">{att.filename}</span>
                    <span className="text-muted-foreground">({formatFileSize(att.size)})</span>
                    <button onClick={() => setComposeAttachments((prev) => prev.filter((_, j) => j !== i))} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files, 'compose')}
                />
                <Paperclip className="h-4 w-4" /> Attach files
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleSaveDraft} disabled={sending}>
                <FileEdit className="h-4 w-4 mr-1" /> Save Draft
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                <Send className="h-4 w-4 mr-1" /> {sending ? 'Sending...' : 'Send'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
