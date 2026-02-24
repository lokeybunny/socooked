import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Calendar, User, Tag, FolderOpen, Trash2, Mail, FileText, Receipt,
  PenTool, Phone, MessageSquare, Upload, Globe, Clock, Image, Video,
  Send, Inbox, RefreshCw
} from 'lucide-react';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';

const GMAIL_FN = 'gmail-api';
async function callGmail(action: string): Promise<any> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/${GMAIL_FN}?action=${action}`;
  const res = await fetch(url, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gmail API error');
  return data;
}

interface ProjectDetailHubProps {
  project: any;
  open: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const catLabel = (id: string | null) =>
  SERVICE_CATEGORIES.find(c => c.id === id)?.label || id || 'Other';

export function ProjectDetailHub({ project, open, onClose, onDelete }: ProjectDetailHubProps) {
  const [emails, setEmails] = useState<any[]>([]);
  const [gmailEmails, setGmailEmails] = useState<any[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [transcriptions, setTranscriptions] = useState<any[]>([]);
  const [botTasks, setBotTasks] = useState<any[]>([]);
  const [previews, setPreviews] = useState<any[]>([]);
  const [contentAssets, setContentAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  const customerId = project?.customer_id;

  useEffect(() => {
    if (!customerId || !open) return;
    setLoading(true);

    const load = async () => {
      // Fetch customer email for Gmail filtering
      const { data: cust } = await supabase.from('customers').select('email').eq('id', customerId).maybeSingle();
      const custEmail = cust?.email?.toLowerCase().trim() || null;
      setCustomerEmail(custEmail);

      const [
        { data: e }, { data: d }, { data: inv }, { data: sig },
        { data: dl }, { data: ev }, { data: th }, { data: tr },
        { data: tk }, { data: pr }, { data: ca }
      ] = await Promise.all([
        supabase.from('communications').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20),
        supabase.from('documents').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('signatures').select('*').eq('customer_id', customerId).order('signed_at', { ascending: false }),
        supabase.from('deals').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('calendar_events').select('*').eq('customer_id', customerId).order('start_time', { ascending: false }).limit(20),
        supabase.from('conversation_threads').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('transcriptions').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('bot_tasks').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('api_previews').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('content_assets').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      ]);

      setEmails(e || []);
      setDocuments(d || []);
      setInvoices(inv || []);
      setSignatures(sig || []);
      setDeals(dl || []);
      setEvents(ev || []);
      setThreads(th || []);
      setTranscriptions(tr || []);
      setBotTasks(tk || []);
      setPreviews(pr || []);
      setContentAssets(ca || []);
      setLoading(false);

      // Fetch Gmail emails for this customer in background
      if (custEmail) {
        setGmailLoading(true);
        try {
          const [inboxData, sentData] = await Promise.all([
            callGmail('inbox'),
            callGmail('sent'),
          ]);
          const allGmail = [...(inboxData.emails || []), ...(sentData.emails || [])];
          // Filter to only emails involving this customer
          const filtered = allGmail.filter((em: any) =>
            em.from?.toLowerCase().includes(custEmail) || em.to?.toLowerCase().includes(custEmail)
          );
          // Dedupe by id and sort by date
          const seen = new Set<string>();
          const deduped = filtered.filter((em: any) => {
            if (seen.has(em.id)) return false;
            seen.add(em.id);
            return true;
          }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setGmailEmails(deduped);
        } catch (err) {
          console.error('Gmail fetch for project hub:', err);
          setGmailEmails([]);
        } finally {
          setGmailLoading(false);
        }
      }
    };
    load();
  }, [customerId, project?.id, open]);

  if (!project) return null;

  const SectionCount = ({ items, label }: { items: any[]; label: string }) => (
    <span className="text-xs text-muted-foreground">{items.length} {label}</span>
  );

  const EmptyState = ({ label }: { label: string }) => (
    <p className="text-xs text-muted-foreground py-4 text-center">No {label} found</p>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">{project.title}</DialogTitle>
        </DialogHeader>

        {/* Project Meta */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={project.status} />
          <StatusBadge status={project.priority} className={`priority-${project.priority}`} />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <FolderOpen className="h-3 w-3" /> {catLabel(project.category)}
          </span>
          {project.due_date && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Due {new Date(project.due_date).toLocaleDateString()}
            </span>
          )}
        </div>

        {project.description && (
          <p className="text-sm text-muted-foreground">{project.description}</p>
        )}

        {project.customers && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{project.customers.full_name}</span>
            {project.customers.email && <span className="text-muted-foreground">· {project.customers.email}</span>}
          </div>
        )}

        {/* Hub Tabs */}
        <Tabs defaultValue="tasks" className="flex-1 min-h-0">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="tasks" className="text-xs">Tasks</TabsTrigger>
            <TabsTrigger value="emails" className="text-xs">Emails</TabsTrigger>
            <TabsTrigger value="docs" className="text-xs">Sites</TabsTrigger>
            <TabsTrigger value="money" className="text-xs">Money</TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[340px] mt-2">
            {/* Tasks */}
            <TabsContent value="tasks" className="space-y-2 m-0">
              <SectionCount items={botTasks} label="API tasks" />
              {botTasks.length === 0 && <EmptyState label="API-generated tasks" />}
              {botTasks.map(t => (
                <div key={t.id} className="glass-card p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground capitalize">{t.bot_agent?.replace('-', ' ')}</span>
                    {t.description && <span className="text-xs text-muted-foreground line-clamp-1">· {t.description}</span>}
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* Emails / Comms */}
            <TabsContent value="emails" className="space-y-2 m-0">
              {/* Gmail emails */}
              {gmailEmails.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Gmail ({gmailEmails.length})
                  </p>
                  {gmailEmails.map(em => {
                    const isInbound = customerEmail && em.from?.toLowerCase().includes(customerEmail);
                    return (
                      <div
                        key={em.id}
                        className={`glass-card p-3 space-y-1 cursor-pointer hover:bg-accent/50 transition-colors ${isInbound ? 'border-l-2 border-l-primary' : 'border-l-2 border-l-muted-foreground/30'}`}
                        onDoubleClick={() => {
                          const tab = isInbound ? 'inbox' : 'sent';
                          navigate(`/messages?open=${em.id}&tab=${tab}`);
                          onClose();
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {isInbound ? <Inbox className="h-3 w-3 text-primary" /> : <Send className="h-3 w-3 text-muted-foreground" />}
                          <span className="text-sm font-medium line-clamp-1">{em.subject || '(no subject)'}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{isInbound ? 'received' : 'sent'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {isInbound ? `From: ${em.from}` : `To: ${em.to}`}
                        </p>
                        {em.snippet && <p className="text-xs text-muted-foreground line-clamp-2">{em.snippet}</p>}
                        <p className="text-xs text-muted-foreground">{em.date ? new Date(em.date).toLocaleDateString() : ''}</p>
                      </div>
                    );
                  })}
                </>
              )}
              {gmailLoading && (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading Gmail...</span>
                </div>
              )}
              {!gmailLoading && gmailEmails.length === 0 && emails.length === 0 && <EmptyState label="emails" />}

              {/* Logged communications (calls, SMS, etc.) */}
              {emails.filter(e => e.type !== 'email').length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Other Communications</p>
                  {emails.filter(e => e.type !== 'email').map(e => (
                    <div key={e.id} className="glass-card p-3 space-y-1 mb-2">
                      <div className="flex items-center gap-2">
                        {e.type === 'call' ? <Phone className="h-3 w-3 text-primary" /> : <MessageSquare className="h-3 w-3 text-primary" />}
                        <span className="text-sm font-medium line-clamp-1">{e.subject || e.type}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{e.direction}</span>
                      </div>
                      {e.body && <p className="text-xs text-muted-foreground line-clamp-2">{e.body}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Threads */}
              {threads.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Conversation Threads ({threads.length})</p>
                  {threads.map(t => (
                    <div key={t.id} className="glass-card p-3 mb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{t.channel} thread</span>
                        <StatusBadge status={t.status} />
                      </div>
                      {t.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.summary}</p>}
                    </div>
                  ))}
                </div>
              )}
              {/* Transcriptions */}
              {transcriptions.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Call Transcriptions ({transcriptions.length})</p>
                  {transcriptions.map(t => (
                    <div key={t.id} className="glass-card p-3 mb-2">
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.summary || t.transcript.slice(0, 120)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Sites */}
            <TabsContent value="docs" className="space-y-2 m-0">
              {/* Content Assets */}
              <p className="text-xs font-medium text-muted-foreground">Assigned Content ({contentAssets.length})</p>
              {contentAssets.length === 0 && <EmptyState label="assigned content" />}
              {contentAssets.map(a => (
                <div key={a.id} className="glass-card p-3 flex items-center gap-3">
                  {a.type === 'video' ? <Video className="h-4 w-4 text-primary" /> : <Image className="h-4 w-4 text-primary" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{a.type} · {a.source} · {a.status}</p>
                  </div>
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View</a>
                  )}
                </div>
              ))}

              {/* Documents */}
              {documents.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Documents ({documents.length})</p>
                  {documents.map(d => (
                    <div key={d.id} className="glass-card p-3 mb-2 flex items-center gap-3">
                      <FileText className="h-4 w-4 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{d.type} · {d.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Signatures */}
              {signatures.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Signatures ({signatures.length})</p>
                  {signatures.map(s => (
                    <div key={s.id} className="glass-card p-3 mb-2 flex items-center gap-2">
                      <PenTool className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm">{s.signer_name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(s.signed_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Previews */}
              {previews.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Site Previews ({previews.length})</p>
                  {previews.map(p => (
                    <div key={p.id} className="glass-card p-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium truncate">{p.title}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      {p.preview_url && (
                        <a href={p.preview_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 block">
                          View Preview →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Money */}
            <TabsContent value="money" className="space-y-2 m-0">
              <p className="text-xs font-medium text-muted-foreground">Invoices ({invoices.length})</p>
              {invoices.length === 0 && <EmptyState label="invoices" />}
              {invoices.map(inv => (
                <div key={inv.id} className="glass-card p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{inv.invoice_number || 'Invoice'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">${Number(inv.amount).toFixed(2)}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
              {/* Deals */}
              {deals.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Deals ({deals.length})</p>
                  {deals.map(d => (
                    <div key={d.id} className="glass-card p-3 mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{d.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{d.stage} · {d.pipeline}</p>
                      </div>
                      <p className="text-sm font-bold">${Number(d.deal_value).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Activity */}
            <TabsContent value="activity" className="space-y-2 m-0">
              <p className="text-xs font-medium text-muted-foreground">Calendar Events ({events.length})</p>
              {events.length === 0 && <EmptyState label="calendar events" />}
              {events.map(ev => (
                <div key={ev.id} className="glass-card p-3 flex items-center gap-3">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ev.start_time).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {/* Tags */}
              {project.tags?.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                    <Tag className="h-3 w-3" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {project.tags.map((t: string) => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Delete */}
        <div className="pt-3 border-t border-border">
          <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(project.id)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
