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
  Instagram, MessageSquareText, Voicemail, Filter, Trash2, Eye, Reply,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

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

const GMAIL_FN = 'gmail-api';

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

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);

  // View email
  const [viewEmail, setViewEmail] = useState<GmailEmail | null>(null);

  // Reply
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);

  // Legacy comms for non-email channels
  const [legacyComms, setLegacyComms] = useState<any[]>([]);

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id, full_name, email, phone');
    setCustomers(data || []);
  }, []);

  const loadEmails = useCallback(async (tab: string) => {
    setLoading(true);
    try {
      const data = await callGmail(tab);
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

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (channel === 'email') {
      loadEmails(activeTab);
    } else if (channel === 'sms' || channel === 'voicemail') {
      loadLegacy();
    }
  }, [channel, activeTab, loadEmails, loadLegacy]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (channel === 'email') {
      await loadEmails(activeTab);
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
      });
      toast.success('Email sent!');
      setComposeOpen(false);
      setForm(emptyForm);
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
    setViewEmail(email);
    setReplyOpen(false);
    setReplyBody('');
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
      // Extract just email address from "Name <email>" format
      const emailMatch = replyTo.match(/<(.+?)>/);
      const toAddr = emailMatch ? emailMatch[1] : replyTo;
      const subject = viewEmail.subject.startsWith('Re:') ? viewEmail.subject : `Re: ${viewEmail.subject}`;
      await callGmailPost('send', { to: toAddr, subject, body: replyBody });
      toast.success('Reply sent!');
      setReplyOpen(false);
      setReplyBody('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  // Filter emails by customer email
  const filteredEmails = selectedCustomerEmail === 'all'
    ? emails
    : emails.filter((e) => {
        const addr = selectedCustomerEmail.toLowerCase();
        return e.from.toLowerCase().includes(addr) || e.to.toLowerCase().includes(addr);
      });

  // Customer email options for filter
  const customerEmailOptions = customers.filter((c) => c.email);
  const customerEmailSet = new Set(customers.filter((c) => c.email).map((c) => c.email!.toLowerCase()));

  const isFromCustomer = (email: GmailEmail) => {
    const fromAddr = email.from.toLowerCase();
    return Array.from(customerEmailSet).some((ce) => fromAddr.includes(ce));
  };
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
                  <p className="text-xs text-muted-foreground truncate">
                    {activeTab === 'sent' ? `To: ${email.to}` : `From: ${email.from}`}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{email.snippet}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(email.date)}</p>
                </div>
              </div>
              <Eye className={`h-4 w-4 shrink-0 mt-1 ${isDimmed ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
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
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setReplyOpen(false); setReplyBody(''); }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleReply} disabled={replying || !replyBody.trim()} className="gap-1.5">
                    <Send className="h-4 w-4" /> {replying ? 'Sending...' : 'Send Reply'}
                  </Button>
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
              <Button onClick={() => { setForm(emptyForm); setComposeOpen(true); }} className="gap-1.5">
                <Plus className="h-4 w-4" /> Compose
              </Button>
            )}
          </div>
        </div>

        {/* Channel switcher */}
        <div className="flex items-center gap-2 border-b border-border pb-4">
          {[
            { key: 'email' as const, icon: Mail, label: 'Email' },
            { key: 'instagram' as const, icon: Instagram, label: 'Instagram' },
            { key: 'sms' as const, icon: MessageSquareText, label: 'SMS' },
            { key: 'voicemail' as const, icon: Voicemail, label: 'Voicemail' },
          ].map(({ key, icon: Icon, label }) => (
            <Button
              key={key}
              variant={channel === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChannel(key)}
              className="gap-1.5"
            >
              <Icon className="h-4 w-4" /> {label}
            </Button>
          ))}
        </div>

        {/* Email channel */}
        {channel === 'email' ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between gap-4">
              <TabsList>
                <TabsTrigger value="inbox" className="gap-1.5"><Inbox className="h-3.5 w-3.5" /> Inbox</TabsTrigger>
                <TabsTrigger value="sent" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Sent</TabsTrigger>
                <TabsTrigger value="drafts" className="gap-1.5"><FileEdit className="h-3.5 w-3.5" /> Drafts</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={selectedCustomerEmail} onValueChange={setSelectedCustomerEmail}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="All customers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All emails</SelectItem>
                    {customerEmailOptions.map((c) => (
                      <SelectItem key={c.id} value={c.email}>{c.full_name} ({c.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          </Tabs>
        ) : channel === 'sms' || channel === 'voicemail' ? (
          <div>{loading ? <p className="text-sm text-muted-foreground">Loading...</p> : renderLegacyList(legacyComms)}</div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Instagram className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">Instagram DMs</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              ManyChat integration coming soon.
            </p>
          </div>
        )}
      </div>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Compose Email</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer (optional)</Label>
              <Select value={form.customer_id} onValueChange={handleCustomerSelect}>
                <SelectTrigger><SelectValue placeholder="Select customer to auto-fill" /></SelectTrigger>
                <SelectContent>
                  {customers.filter((c) => c.email).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
