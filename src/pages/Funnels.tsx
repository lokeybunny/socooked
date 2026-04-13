import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthLayoutGate } from '@/components/layout/AuthLayoutGate';
import { toast } from 'sonner';
import {
  Globe, GraduationCap, Filter, Clock, Mail, Phone, Search, Video,
  Bot, Play, ExternalLink, Send, Loader2,
  RefreshCw, Eye, MessageSquare, EyeOff, ChevronLeft, ChevronRight, Trash2, ChevronDown,
  FileText, Mic, Copy, Sparkles, UserPlus, BellRing, Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

type FunnelType = 'all' | 'webdesign' | 'videography' | 'aicourses';

interface FunnelLead {
  id: string;
  funnel: 'webdesign' | 'aicourses' | 'videography';
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  status: string;
  notes: string | null;
  company?: string | null;
  property_address?: string | null;
  event_type?: string | null;
  last_activity_at?: string | null;
  // Vapi AI
  vapi_call_status?: string | null;
  vapi_call_id?: string | null;
  ai_notes?: string | null;
  vapi_recording_url?: string | null;
  vapi_transcript?: string | null;
  vapi_summary?: string | null;
  timeline?: string | null;
  property_condition?: string | null;
  motivation?: string | null;
  asking_price?: number | null;
  lead_score?: number | null;
  is_inbound?: boolean;
  // draft
  drafted_at?: string | null;
  // source table
  _table: 'customers' | 'lw_landing_leads';
  // remind campaign
  remind_status?: 'active' | 'connected' | 'expired' | 'paused' | null;
  remind_attempts?: number | null;
  remind_connected_at?: string | null;
  remind_created_at?: string | null;
  happy?: boolean;
  dead?: boolean;
}

const PAGE_SIZE = 30;
const LIVE_CALL_STALE_MS = 15 * 60 * 1000;

const FUNNEL_CONFIG: Record<string, { label: string; icon: typeof Globe; color: string; bgColor: string }> = {
  webdesign: { label: 'Web Design', icon: Globe, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  aicourses: { label: 'AI Courses', icon: GraduationCap, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  videography: { label: 'Videography', icon: Video, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
};

const PIPELINE_STAGES: Record<string, { value: string; label: string }[]> = {
  webdesign: [
    { value: 'lead', label: 'Prospect' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'callback', label: 'Call Back' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'ai_complete', label: 'AI Complete' },
    { value: 'agreement_sent', label: 'Agreement Sent' },
    { value: 'closed', label: 'Closed' },
    { value: 'dead', label: 'Dead' },
  ],
  videography: [
    { value: 'lead', label: 'Prospect' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'callback', label: 'Call Back' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'agreement_sent', label: 'Agreement Sent' },
    { value: 'closed', label: 'Closed' },
    { value: 'dead', label: 'Dead' },
  ],
  aicourses: [
    { value: 'pending', label: 'Pending Payment' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
};

/* ─── Email Modal ─── */
function EmailModal({ lead, open, onClose }: { lead: FunnelLead | null; open: boolean; onClose: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (lead && open) {
      const funnelLabel = FUNNEL_CONFIG[lead.funnel]?.label || lead.funnel;
      setSubject(`Re: Your ${funnelLabel} Inquiry`);
      setBody(`Hi ${lead.full_name.split(' ')[0]},\n\nHow can I get a hold of you? Also, what's a good time?\n\nweb designer.`);
    }
  }, [lead, open]);

  const handleSend = async () => {
    if (!lead?.email) { toast.error('No email on file'); return; }
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body required'); return; }
    setSending(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-api?action=send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ to: lead.email, subject, body: body.replace(/\n/g, '<br/>') }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Send failed');
      toast.success(`Email sent to ${lead.email}`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    } finally { setSending(false); }
  };

  if (!lead) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Reply to {lead.full_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">To: {lead.email || 'No email'}</p>
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Message body..." value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSend} disabled={sending || !lead.email}>
              {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Detail Modal ─── */
function LeadDetailModal({ lead, open, onClose, onLeadUpdate }: { lead: FunnelLead | null; open: boolean; onClose: () => void; onLeadUpdate?: (updated: FunnelLead) => void }) {
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcriptResult, setTranscriptResult] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  useEffect(() => { setTranscriptResult(null); setAnalysisResult(null); }, [lead?.id]);

  const handleTranscribe = async () => {
    if (!lead?.vapi_recording_url) return;
    setTranscribing(true);
    try {
      const audioRes = await fetch(lead.vapi_recording_url);
      if (!audioRes.ok) throw new Error('Failed to fetch recording');
      const audioBlob = await audioRes.blob();
      const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('customer_name', lead.full_name);
      if (lead._table === 'customers') formData.append('customer_id', lead.id);
      formData.append('source_type', 'vapi_recording');
      const { data, error } = await supabase.functions.invoke('transcribe-audio', { body: formData });
      if (error) throw error;
      setTranscriptResult(data.transcript || 'No transcript generated');
      toast.success('Recording transcribed');
    } catch (err: any) {
      toast.error(err.message || 'Transcription failed');
    } finally { setTranscribing(false); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard')).catch(() => toast.error('Failed to copy'));
  };

  const handleAnalyze = async () => {
    const transcript = transcriptResult || lead?.vapi_transcript;
    if (!transcript) { toast.error('No transcript available to analyze'); return; }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('script-ai', { body: { transcript } });
      if (error) throw error;
      setAnalysisResult(data);
      toast.success('Conversation analyzed');
    } catch (err: any) {
      toast.error(err.message || 'Analysis failed');
    } finally { setAnalyzing(false); }
  };

  const handleCreateCustomer = async () => {
    if (!lead) return;
    setCreatingCustomer(true);
    try {
      // Build notes combining all AI data
      const noteParts: string[] = [];
      if (lead.ai_notes) noteParts.push(`AI Notes:\n${lead.ai_notes}`);
      if (lead.vapi_summary) noteParts.push(`Call Summary:\n${lead.vapi_summary}`);
      if (lead.vapi_transcript) noteParts.push(`Transcript:\n${lead.vapi_transcript}`);
      if (transcriptResult) noteParts.push(`Deepgram Transcription:\n${transcriptResult}`);
      if (analysisResult) noteParts.push(`AI Analysis:\n${JSON.stringify(analysisResult, null, 2)}`);
      if (lead.notes) noteParts.push(`Lead Notes:\n${lead.notes}`);
      if (lead.property_address) noteParts.push(`Property: ${lead.property_address}`);
      if (lead.motivation) noteParts.push(`Motivation: ${lead.motivation}`);
      if (lead.timeline) noteParts.push(`Timeline: ${lead.timeline}`);
      if (lead.property_condition) noteParts.push(`Condition: ${lead.property_condition}`);
      if (lead.asking_price) noteParts.push(`Asking Price: $${lead.asking_price.toLocaleString()}`);
      if (lead.lead_score) noteParts.push(`Lead Score: ${lead.lead_score}/100`);

      const funnelLabel = FUNNEL_CONFIG[lead.funnel]?.label || lead.funnel;
      const meta: Record<string, unknown> = {
        funnel_source: lead.funnel,
        funnel_lead_id: lead.id,
        funnel_table: lead._table,
        vapi_call_status: lead.vapi_call_status,
        vapi_call_id: lead.vapi_call_id,
        vapi_recording_url: lead.vapi_recording_url,
        vapi_ai_notes: lead.ai_notes,
        vapi_transcript: lead.vapi_transcript,
        vapi_summary: lead.vapi_summary,
      };

      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('full_name', lead.full_name)
        .not('source', 'in', '("videography-landing","webdesign-landing")')
        .maybeSingle();

      if (existing) {
        toast.error('A customer with this name already exists in CRM');
        return;
      }

      const { error } = await supabase.from('customers').insert([{
        full_name: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        company: lead.company || null,
        source: `funnel-${lead.funnel}`,
        status: 'lead',
        notes: noteParts.join('\n\n---\n\n'),
        tags: [funnelLabel, 'funnel-import'],
        meta: meta as any,
      }]);

      if (error) throw error;
      toast.success(`${lead.full_name} added to CRM as a new customer`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create customer');
    } finally { setCreatingCustomer(false); }
  };

  if (!lead) return null;
  const cfg = FUNNEL_CONFIG[lead.funnel];
  const hasAI = !!(lead.vapi_call_status === 'completed' || lead.ai_notes || lead.vapi_transcript);
  const hasAnyTranscript = !!(transcriptResult || lead.vapi_transcript);

  const CopyAnalyzeBar = ({ text }: { text: string }) => (
    <div className="flex items-center gap-1.5 mt-1.5">
      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => handleCopy(text)}>
        <Copy className="h-3 w-3 mr-1" /> Copy
      </Button>
      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={handleAnalyze} disabled={analyzing}>
        {analyzing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
        {analyzing ? 'Analyzing…' : 'Analyze Conversation'}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <cfg.icon className={cn("h-5 w-5", cfg.color)} />
            {lead.full_name}
            <Badge variant="outline" className={cn("text-xs ml-2", cfg.color)}>{cfg.label}</Badge>
            {lead.drafted_at && <Badge variant="secondary" className="text-[10px] ml-1 text-yellow-600">Drafted</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-muted-foreground text-xs">Email</p><p>{lead.email || '—'}</p></div>
          <div><p className="text-muted-foreground text-xs">Phone</p><p>{lead.phone || '—'}</p></div>
          <div><p className="text-muted-foreground text-xs">Submitted</p><p>{format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}</p></div>
          <div><p className="text-muted-foreground text-xs">Status</p><Badge variant="secondary">{lead.status}</Badge></div>
          {lead.property_address && <div className="col-span-2"><p className="text-muted-foreground text-xs">Property Address</p><p>{lead.property_address}</p></div>}
          {lead.company && <div className="col-span-2"><p className="text-muted-foreground text-xs">Business Name</p><p>{lead.company}</p></div>}
          {lead.notes && <div className="col-span-2"><p className="text-muted-foreground text-xs">Notes</p><p className="whitespace-pre-wrap">{lead.notes}</p></div>}
        </div>

        {/* Vapi AI Section */}
        {hasAI && (
          <div className="mt-4 border-t pt-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Bot className="h-4 w-4 text-primary" /> AI Call Data</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground text-xs">Call Status</p>
                <Badge variant={lead.vapi_call_status === 'completed' ? 'default' : 'secondary'}>{lead.vapi_call_status || 'pending'}</Badge>
              </div>
              {lead.timeline && <div><p className="text-muted-foreground text-xs">Timeline</p><p>{lead.timeline}</p></div>}
              {lead.property_condition && <div><p className="text-muted-foreground text-xs">Condition</p><p>{lead.property_condition}</p></div>}
              {lead.motivation && <div><p className="text-muted-foreground text-xs">Motivation</p><p>{lead.motivation}</p></div>}
              {lead.asking_price && <div><p className="text-muted-foreground text-xs">Asking Price</p><p>${lead.asking_price.toLocaleString()}</p></div>}
              {lead.lead_score != null && lead.lead_score > 0 && <div><p className="text-muted-foreground text-xs">Lead Score</p><p className="font-bold">{lead.lead_score}/100</p></div>}
            </div>
            {lead.ai_notes && (
              <div className="mt-3"><p className="text-muted-foreground text-xs mb-1">AI Notes</p>
                <div className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">{lead.ai_notes}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => handleCopy(lead.ai_notes!)}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                </div>
              </div>
            )}
            {lead.vapi_summary && (
              <div className="mt-3"><p className="text-muted-foreground text-xs mb-1">Call Summary</p>
                <div className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">{lead.vapi_summary}</div>
              </div>
            )}
            {lead.vapi_transcript && (
              <div className="mt-3"><p className="text-muted-foreground text-xs mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Call Transcript</p>
                <div className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">{lead.vapi_transcript}</div>
                <CopyAnalyzeBar text={lead.vapi_transcript} />
              </div>
            )}
            {lead.vapi_recording_url && (
              <div className="mt-3 space-y-2">
                <p className="text-muted-foreground text-xs flex items-center gap-1"><Play className="h-3 w-3" /> Recording</p>
                <audio controls className="w-full h-9" preload="metadata"><source src={lead.vapi_recording_url} /></audio>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="text-xs" onClick={handleTranscribe} disabled={transcribing}>
                    {transcribing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Mic className="h-3 w-3 mr-1" />}
                    {transcribing ? 'Transcribing…' : 'Transcribe Recording'}
                  </Button>
                  {hasAnyTranscript && !analysisResult && (
                    <Button variant="outline" size="sm" className="text-xs" onClick={handleAnalyze} disabled={analyzing}>
                      {analyzing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      {analyzing ? 'Analyzing…' : 'Analyze Conversation'}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {transcriptResult && (
              <div className="mt-3"><p className="text-muted-foreground text-xs mb-1 flex items-center gap-1"><Mic className="h-3 w-3" /> Deepgram Transcription</p>
                <div className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">{transcriptResult}</div>
                <CopyAnalyzeBar text={transcriptResult} />
              </div>
            )}
          </div>
        )}

        {/* Recording without AI */}
        {!hasAI && lead.vapi_recording_url && (
          <div className="mt-4 border-t pt-4 space-y-2">
            <p className="text-muted-foreground text-xs flex items-center gap-1"><Play className="h-3 w-3" /> Recording</p>
            <audio controls className="w-full h-9" preload="metadata"><source src={lead.vapi_recording_url} /></audio>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleTranscribe} disabled={transcribing}>
              {transcribing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Mic className="h-3 w-3 mr-1" />}
              {transcribing ? 'Transcribing…' : 'Transcribe Recording'}
            </Button>
            {transcriptResult && (
              <div className="mt-2"><p className="text-muted-foreground text-xs mb-1 flex items-center gap-1"><Mic className="h-3 w-3" /> Transcription</p>
                <div className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">{transcriptResult}</div>
                <CopyAnalyzeBar text={transcriptResult} />
              </div>
            )}
          </div>
        )}

        {/* AI Analysis Result */}
        {analysisResult && (
          <div className="mt-4 border-t pt-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-primary" /> Conversation Analysis</h3>
            {analysisResult.summary && (
              <div className="mb-3"><p className="text-muted-foreground text-xs mb-1">Summary</p>
                <div className="bg-muted/50 rounded-md p-3 text-xs">{analysisResult.summary}</div>
              </div>
            )}
            {analysisResult.people?.length > 0 && (
              <div className="mb-3"><p className="text-muted-foreground text-xs mb-1">People</p>
                <div className="space-y-1">{analysisResult.people.map((p: any, i: number) => (
                  <div key={i} className="bg-muted/50 rounded-md p-2 text-xs flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{p.name}</span>
                    {p.role && <span className="text-muted-foreground">— {p.role}</span>}
                    {p.email && <span className="text-muted-foreground">· {p.email}</span>}
                    {p.phone && <span className="text-muted-foreground">· {p.phone}</span>}
                    {p.is_new_customer && <Badge variant="default" className="text-[9px] h-4">New Customer</Badge>}
                  </div>
                ))}</div>
              </div>
            )}
            {analysisResult.project_ideas?.length > 0 && (
              <div className="mb-3"><p className="text-muted-foreground text-xs mb-1">Project Ideas</p>
                <div className="space-y-1">{analysisResult.project_ideas.map((p: any, i: number) => (
                  <div key={i} className="bg-muted/50 rounded-md p-2 text-xs">
                    <span className="font-medium">{p.title}</span>
                    {p.description && <span className="text-muted-foreground"> — {p.description}</span>}
                    {p.estimated_value && <Badge variant="outline" className="ml-2 text-[9px]">{p.estimated_value}</Badge>}
                  </div>
                ))}</div>
              </div>
            )}
            {analysisResult.action_items?.length > 0 && (
              <div className="mb-3"><p className="text-muted-foreground text-xs mb-1">Action Items</p>
                <ul className="list-disc list-inside space-y-0.5">{analysisResult.action_items.map((a: string, i: number) => (
                  <li key={i} className="text-xs">{a}</li>
                ))}</ul>
              </div>
            )}
            {analysisResult.suggested_category && (
              <div className="mb-3"><p className="text-muted-foreground text-xs mb-1">Suggested Category</p>
                <Badge variant="secondary" className="text-xs">{analysisResult.suggested_category}</Badge>
              </div>
            )}
            {analysisResult.suggested_services?.length > 0 && (
              <div className="mb-3"><p className="text-muted-foreground text-xs mb-1">Services Discussed</p>
                <div className="flex gap-1 flex-wrap">{analysisResult.suggested_services.map((s: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                ))}</div>
              </div>
            )}
            {analysisResult.budget_mentioned && (
              <div className="mb-3"><p className="text-muted-foreground text-xs mb-1">Budget</p><p className="text-xs">{analysisResult.budget_mentioned}</p></div>
            )}
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => handleCopy(JSON.stringify(analysisResult, null, 2))}>
              <Copy className="h-3 w-3 mr-1" /> Copy Analysis
            </Button>
          </div>
        )}

        {/* Create Customer Button */}
        <div className="mt-4 border-t pt-4">
          <Button onClick={handleCreateCustomer} disabled={creatingCustomer} className="w-full">
            {creatingCustomer ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            {creatingCustomer ? 'Creating Customer…' : 'Create Customer'}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Adds to CRM with all funnel data, AI notes, transcripts & analysis</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Lead Card ─── */
function LeadCard({ lead, onEmail, onView, onDraft, onUndraft, onStageChange, onRemind, onHappyToggle, onDeadToggle, onPhoneEdit }: {
  lead: FunnelLead; onEmail: () => void; onView: () => void;
  onDraft: () => void; onUndraft: () => void;
  onStageChange: (newStatus: string) => void;
  onRemind: () => void;
  onHappyToggle: (checked: boolean) => void;
  onDeadToggle: (checked: boolean) => void;
  onPhoneEdit: (newPhone: string) => void;
}) {
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(lead.phone || '');
  const cfg = FUNNEL_CONFIG[lead.funnel];
  const isLiveCall = lead.vapi_call_status === 'in_call' || lead.vapi_call_status === 'calling';
  const hasAI = !!(isLiveCall || lead.vapi_call_status === 'completed' || lead.ai_notes);
  const activityAt = lead.last_activity_at || lead.created_at;
  const isDrafted = !!lead.drafted_at;
  const draftHoursLeft = isDrafted ? Math.max(0, 72 - differenceInHours(new Date(), new Date(lead.drafted_at!))) : null;
  const stages = PIPELINE_STAGES[lead.funnel] || [];
  const currentStageLabel = stages.find(s => s.value === lead.status)?.label || lead.status;
  const isHappy = !!lead.happy;
  const isDead = !!lead.dead;
  const isConnected = (lead.remind_status === 'connected' || isHappy) && !isDead;
  const isReminding = !isHappy && !isDead && lead.remind_status === 'active';
  const isExpired = !isHappy && !isDead && lead.remind_status === 'expired';

  return (
    <div className={cn(
      "border rounded-lg p-4 hover:border-primary/30 transition-colors bg-card",
      isDrafted && "opacity-60 border-dashed",
      isDead && "ring-2 ring-red-500 border-red-500/50",
      !isDead && isConnected && "ring-2 ring-green-500 border-green-500/50",
      !isDead && isReminding && "ring-2 ring-yellow-500 border-yellow-500/50",
      !isDead && !isConnected && !isReminding && isExpired && "ring-2 ring-red-500 border-red-500/50",
    )}>
      {isDead && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-red-500/10">
          <Zap className="h-3.5 w-3.5 text-red-500" />
          <span className="text-xs font-bold text-red-600">DEAD LEAD ☠️</span>
        </div>
      )}
      {!isDead && isConnected && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-green-500/10">
          <Zap className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs font-bold text-green-600">{isHappy ? 'WORK BEGAN ✅' : 'AI CONNECTED'}</span>
          {!isHappy && lead.remind_connected_at && (
            <span className="text-[10px] text-green-600/70 ml-auto">
              {formatDistanceToNow(new Date(lead.remind_connected_at), { addSuffix: true })}
            </span>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("p-1.5 rounded-md shrink-0", cfg.bgColor)}>
            <cfg.icon className={cn("h-3.5 w-3.5", cfg.color)} />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{lead.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{lead.email || lead.phone || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {isLiveCall && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] gap-1 animate-pulse',
                lead.vapi_call_status === 'in_call'
                  ? 'text-green-600 border-green-500/30 bg-green-500/10'
                  : 'text-amber-600 border-amber-500/30 bg-amber-500/10'
              )}
            >
              {lead.vapi_call_status === 'in_call' ? '📞 IN CALL' : '📞 Calling...'}
            </Badge>
          )}
          {isDrafted && (
            <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-500/30">
              <EyeOff className="h-2.5 w-2.5 mr-0.5" /> {draftHoursLeft}h left
            </Badge>
          )}
          {isReminding && (
            <Badge variant="outline" className="text-[10px] gap-1 text-yellow-500 border-yellow-500/30 animate-pulse bg-yellow-500/10">
              <BellRing className="h-2.5 w-2.5" /> Reminding ({lead.remind_attempts || 0})
            </Badge>
          )}
          {isExpired && (
            <Badge variant="outline" className="text-[10px] gap-1 text-red-500 border-red-500/30 bg-red-500/10">
              <BellRing className="h-2.5 w-2.5" /> Failed
            </Badge>
          )}
          {hasAI && (
            <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
              <Bot className="h-2.5 w-2.5" /> AI
            </Badge>
          )}
          {lead.vapi_call_id && (
            <Badge variant="outline" className={cn("text-[10px] gap-1", lead.is_inbound ? "text-green-600 border-green-500/30 bg-green-500/10" : "text-orange-600 border-orange-500/30 bg-orange-500/10")}>
              {lead.is_inbound ? '📥 Inbound' : '📤 Outbound'}
            </Badge>
          )}
          <Badge variant="outline" className={cn("text-[10px]", cfg.color)}>{cfg.label}</Badge>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDistanceToNow(new Date(activityAt), { addSuffix: true })}</span>
        <Select value={lead.status} onValueChange={onStageChange}>
          <SelectTrigger className="h-6 text-[10px] w-auto gap-1 border-dashed px-2 py-0">
            <SelectValue>{currentStageLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {stages.map(s => (
              <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {lead.notes && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{lead.notes}</p>}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onView}>
          <Eye className="h-3 w-3 mr-1" /> View
        </Button>
        {lead.email && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onEmail}>
            <Mail className="h-3 w-3 mr-1" /> Reply
          </Button>
        )}
        {lead.funnel === 'webdesign' && !editingPhone && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setPhoneInput(lead.phone || ''); setEditingPhone(true); }}>
            <Phone className="h-3 w-3 mr-1" /> {lead.phone && lead.phone !== 'N/A' ? lead.phone : 'Add Phone'}
          </Button>
        )}
        {lead.funnel === 'webdesign' && editingPhone && (
          <div className="flex items-center gap-1">
            <Input
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              className="h-7 text-xs w-32"
              placeholder="(555) 000-0000"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { onPhoneEdit(phoneInput); setEditingPhone(false); } if (e.key === 'Escape') setEditingPhone(false); }}
            />
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { onPhoneEdit(phoneInput); setEditingPhone(false); }}>Save</Button>
          </div>
        )}
        {lead.funnel !== 'webdesign' && lead.phone && lead.phone !== 'N/A' && (
          <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1">
            <Phone className="h-3 w-3" /> Call
          </a>
        )}
        {lead.funnel === 'webdesign' && (
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            <Checkbox
              checked={isHappy}
              onCheckedChange={(checked) => onHappyToggle(!!checked)}
              className="h-3.5 w-3.5"
            />
            <span className={cn(isHappy && "text-green-600 font-medium")}>Happy</span>
          </label>
        )}
        {lead.funnel === 'webdesign' && (
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            <Checkbox
              checked={isDead}
              onCheckedChange={(checked) => onDeadToggle(!!checked)}
              className="h-3.5 w-3.5"
            />
            <span className={cn(isDead && "text-red-600 font-medium")}>Dead</span>
          </label>
        )}
        {lead.funnel === 'webdesign' && lead.phone && lead.phone !== 'N/A' && !isConnected && (
          <Button
            variant={isReminding ? "outline" : "ghost"}
            size="sm"
            className={cn("h-7 text-xs", isReminding && "text-yellow-500 border-yellow-500/30")}
            onClick={onRemind}
          >
            <BellRing className="h-3 w-3 mr-1" />
            {isReminding ? 'Stop Remind' : 'Remind'}
          </Button>
        )}
        {isDrafted ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-yellow-600 ml-auto" onClick={onUndraft}>
            <Eye className="h-3 w-3 mr-1" /> Undraft
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground ml-auto" onClick={onDraft}>
            <EyeOff className="h-3 w-3 mr-1" /> Draft
          </Button>
        )}
      </div>
    </div>
  );
}
/* ─── Main Page ─── */
export default function Funnels() {
  const [leads, setLeads] = useState<FunnelLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FunnelType>('all');
  const [search, setSearch] = useState('');
  const [showDrafted, setShowDrafted] = useState(false);
  const [page, setPage] = useState(1);
  const [emailLead, setEmailLead] = useState<FunnelLead | null>(null);
  const [viewLead, setViewLead] = useState<FunnelLead | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const fetchInFlightRef = useRef(false);

  const fetchLeads = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (!silent) setLoading(true);
    try {
      const [{ data: custLeads }, { data: vidLeads }, { data: courseRows }, { data: remindRows }] = await Promise.all([
        supabase.from('customers').select('*').eq('source', 'webdesign-landing').not('meta->>vapi_call_id', 'is', null).order('created_at', { ascending: false }).limit(500),
        supabase.from('customers').select('*').eq('source', 'videography-landing').order('created_at', { ascending: false }).limit(500),
        supabase.from('guru_subscriptions').select('*').eq('plan', 'ai_course').order('created_at', { ascending: false }).limit(500),
        supabase.from('vapi_remind_queue').select('customer_id, status, attempts, connected_at, created_at').in('status', ['active', 'connected', 'expired']),
      ]);

      const remindMap = new Map<string, { status: string; attempts: number; connected_at: string | null; created_at: string | null }>();
      (remindRows || []).forEach((r: any) => remindMap.set(r.customer_id, { status: r.status, attempts: r.attempts, connected_at: r.connected_at, created_at: r.created_at }));

      const combined: FunnelLead[] = [];

      (custLeads || []).forEach((c) => {
        const meta = (c.meta as Record<string, unknown>) || {};
        const tags = c.tags as string[] || [];
        const remind = remindMap.get(c.id);
        const lastActivityAt = (meta.vapi_last_contact as string) || (meta.vapi_call_started_at as string) || c.created_at;
        const rawCallStatus = (meta.vapi_call_status as string) || null;
        const isFreshLiveCall = !!(
          rawCallStatus &&
          ['in_call', 'calling'].includes(rawCallStatus) &&
          Date.now() - new Date(lastActivityAt).getTime() < LIVE_CALL_STALE_MS
        );
        const isDirectInbound = !!meta.vapi_direct_dial;
        combined.push({
          id: c.id, funnel: 'webdesign' as const, _table: 'customers',
          full_name: c.full_name, email: c.email, phone: c.phone,
          created_at: c.created_at, status: c.status || 'new', notes: c.notes,
          company: c.company,
          event_type: tags.find(t => !['videography', 'webdesign', 'ai-website', 'general'].includes(t)) || null,
          last_activity_at: lastActivityAt,
          vapi_call_status: isFreshLiveCall ? rawCallStatus : (rawCallStatus === 'in_call' || rawCallStatus === 'calling' ? null : rawCallStatus),
          vapi_call_id: (meta.vapi_call_id as string) || null,
          ai_notes: (meta.vapi_ai_notes as string) || null,
          vapi_recording_url: (meta.vapi_recording_url as string) || null,
          vapi_transcript: (meta.vapi_transcript as string) || null,
          vapi_summary: (meta.vapi_summary as string) || null,
          is_inbound: isDirectInbound,
          drafted_at: (isFreshLiveCall || isDirectInbound) ? null : ((meta.funnel_drafted_at as string) || null),
          remind_status: (remind?.status as any) || (meta.vapi_remind_status as any) || null,
          remind_attempts: remind?.attempts || null,
          remind_connected_at: remind?.connected_at || (meta.vapi_remind_connected_at as string) || null,
          remind_created_at: remind?.created_at || null,
          happy: !!(meta.happy),
          dead: !!(meta.dead),
        });
      });

      (vidLeads || []).forEach((c) => {
        const meta = (c.meta as Record<string, unknown>) || {};
        const tags = c.tags as string[] || [];
        const lastActivityAt = (meta.vapi_last_contact as string) || (meta.vapi_call_started_at as string) || c.created_at;
        const rawCallStatus = (meta.vapi_call_status as string) || null;
        const isFreshLiveCall = !!(
          rawCallStatus &&
          ['in_call', 'calling'].includes(rawCallStatus) &&
          Date.now() - new Date(lastActivityAt).getTime() < LIVE_CALL_STALE_MS
        );
        const isDirectInbound = !!meta.vapi_direct_dial;
        combined.push({
          id: c.id, funnel: 'videography' as const, _table: 'customers',
          full_name: c.full_name, email: c.email, phone: c.phone,
          created_at: c.created_at, status: c.status || 'lead', notes: c.notes,
          company: c.company,
          event_type: tags.find(t => !['videography', 'webdesign', 'ai-website', 'general'].includes(t)) || null,
          last_activity_at: lastActivityAt,
          vapi_call_status: isFreshLiveCall ? rawCallStatus : (rawCallStatus === 'in_call' || rawCallStatus === 'calling' ? null : rawCallStatus),
          vapi_call_id: (meta.vapi_call_id as string) || null,
          ai_notes: (meta.vapi_ai_notes as string) || null,
          vapi_recording_url: (meta.vapi_recording_url as string) || null,
          vapi_transcript: (meta.vapi_transcript as string) || null,
          vapi_summary: (meta.vapi_summary as string) || null,
          is_inbound: isDirectInbound,
          drafted_at: (isFreshLiveCall || isDirectInbound) ? null : ((meta.funnel_drafted_at as string) || null),
          happy: !!(meta.happy),
          dead: !!(meta.dead),
        });
      });

      (courseRows || []).forEach((r) => {
        const meta = (r.meta as Record<string, unknown>) || {};
        combined.push({
          id: r.id, funnel: 'aicourses', _table: 'guru_subscriptions' as any,
          full_name: r.full_name || r.email, email: r.email, phone: null,
          created_at: r.created_at, status: r.status || 'pending', notes: `Plan: ${r.plan} · Amount: $${(r.amount_cents / 100).toFixed(2)}`,
          company: null,
          last_activity_at: r.created_at,
          vapi_call_status: null, vapi_call_id: null, ai_notes: null,
          vapi_recording_url: null, vapi_transcript: null, vapi_summary: null,
          drafted_at: (meta.funnel_drafted_at as string) || null,
        });
      });

      combined.sort((a, b) => new Date(b.last_activity_at || b.created_at).getTime() - new Date(a.last_activity_at || a.created_at).getTime());

      const now = new Date();
      const visible = combined.filter((l) => {
        if (!l.drafted_at) return true;
        return differenceInHours(now, new Date(l.drafted_at)) < 72;
      });

      setLeads(visible);
    } catch (err) {
      console.error('Funnels fetch error:', err);
    } finally {
      fetchInFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLeads();
    const intervalId = window.setInterval(() => {
      void fetchLeads({ silent: true });
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleDraft = async (lead: FunnelLead) => {
    const now = new Date().toISOString();
    if (lead._table === 'customers') {
      await supabase.from('customers').update({ meta: { funnel_drafted_at: now } } as any).eq('id', lead.id);
    } else if ((lead._table as string) === 'guru_subscriptions') {
      // Read existing meta, merge drafted_at
      const { data: row } = await supabase.from('guru_subscriptions').select('meta').eq('id', lead.id).single();
      const existingMeta = (row?.meta as Record<string, unknown>) || {};
      await supabase.from('guru_subscriptions').update({ meta: { ...existingMeta, funnel_drafted_at: now } } as any).eq('id', lead.id);
    } else {
      await supabase.from('lw_landing_leads').update({ drafted_at: now }).eq('id', lead.id);
    }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, drafted_at: now } : l));
    toast.success(`${lead.full_name} drafted — hidden for 72 hours`);
  };

  const handleUndraft = async (lead: FunnelLead) => {
    if (lead._table === 'customers') {
      await supabase.from('customers').update({ meta: {} } as any).eq('id', lead.id);
    } else if ((lead._table as string) === 'guru_subscriptions') {
      const { data: row } = await supabase.from('guru_subscriptions').select('meta').eq('id', lead.id).single();
      const existingMeta = (row?.meta as Record<string, unknown>) || {};
      delete existingMeta.funnel_drafted_at;
      await supabase.from('guru_subscriptions').update({ meta: existingMeta } as any).eq('id', lead.id);
    } else {
      await supabase.from('lw_landing_leads').update({ drafted_at: null }).eq('id', lead.id);
    }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, drafted_at: null } : l));
    toast.success(`${lead.full_name} undrafted`);
  };

  const handleStageChange = async (lead: FunnelLead, newStatus: string) => {
    if (lead.status === newStatus) return;
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
    if (lead._table === 'customers') {
      const { error } = await supabase.from('customers').update({ status: newStatus }).eq('id', lead.id);
      if (error) { toast.error(error.message); fetchLeads(); return; }
    } else {
      const { error } = await supabase.from('lw_landing_leads').update({ status: newStatus }).eq('id', lead.id);
      if (error) { toast.error(error.message); fetchLeads(); return; }
    }
    const stageLabel = PIPELINE_STAGES[lead.funnel]?.find(s => s.value === newStatus)?.label || newStatus;
    toast.success(`${lead.full_name} → ${stageLabel}`);
  };

  const handleRemind = async (lead: FunnelLead) => {
    if (!lead.phone || lead._table !== 'customers') return;

    // If already reminding, cancel it
    if (lead.remind_status === 'active') {
      const { error } = await supabase.functions.invoke('vapi-remind-check', {
        body: { action: 'cancel', customer_id: lead.id },
      });
      if (error) { toast.error('Failed to cancel remind'); return; }
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, remind_status: null, remind_attempts: null } : l));
      toast.success(`Remind campaign stopped for ${lead.full_name}`);
      return;
    }

    // Enqueue new remind campaign
    const { data, error } = await supabase.functions.invoke('vapi-remind-check', {
      body: {
        action: 'enqueue',
        customer_id: lead.id,
        phone: lead.phone,
        full_name: lead.full_name,
        business_name: lead.company || '',
      },
    });
    if (error) { toast.error('Failed to start remind'); return; }
    if (data?.error) {
      toast.error(data.error);
      return;
    }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, remind_status: 'active' as const, remind_attempts: 0 } : l));
    toast.success(`🔔 Remind campaign started for ${lead.full_name} — calls every 4hrs (9am-5pm PST) for 5 days`);
  };

  const handleHappyToggle = async (lead: FunnelLead, checked: boolean) => {
    if (lead._table !== 'customers') return;
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, happy: checked } : l));
    const { data: existing } = await supabase.from('customers').select('meta').eq('id', lead.id).single();
    const meta = { ...((existing?.meta as Record<string, unknown>) || {}), happy: checked };
    const { error } = await supabase.from('customers').update({ meta }).eq('id', lead.id);
    if (error) { toast.error(error.message); fetchLeads(); return; }
    toast.success(checked ? `✅ ${lead.full_name} marked happy — work began` : `${lead.full_name} unmarked`);
  };

  const handleDeadToggle = async (lead: FunnelLead, checked: boolean) => {
    if (lead._table !== 'customers') return;
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, dead: checked, happy: checked ? false : l.happy } : l));
    const { data: existing } = await supabase.from('customers').select('meta').eq('id', lead.id).single();
    const meta = { ...((existing?.meta as Record<string, unknown>) || {}), dead: checked };
    if (checked) (meta as any).happy = false;
    const { error } = await supabase.from('customers').update({ meta }).eq('id', lead.id);
    if (error) { toast.error(error.message); fetchLeads(); return; }
    toast.success(checked ? `☠️ ${lead.full_name} marked dead` : `${lead.full_name} revived`);
  };

  const filtered = useMemo(() => {
    let result = leads;
    if (filter !== 'all') result = result.filter(l => l.funnel === filter);
    if (!showDrafted) result = result.filter(l => !l.drafted_at);
    if (stageFilter) result = result.filter(l => l.status === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      const phoneQuery = search.replace(/\D/g, '');
      result = result.filter(l => {
        const phone = l.phone || '';
        const normalizedPhone = phone.replace(/\D/g, '');
        return l.full_name.toLowerCase().includes(q) ||
          (l.email || '').toLowerCase().includes(q) ||
          phone.toLowerCase().includes(q) ||
          (!!phoneQuery && normalizedPhone.includes(phoneQuery)) ||
          (l.property_address || '').toLowerCase().includes(q) ||
          (l.company || '').toLowerCase().includes(q);
      });
    }
    return result;
  }, [leads, filter, search, showDrafted, stageFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(page, totalPages);
  const pagedLeads = filtered.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filter, search, showDrafted, stageFilter]);

  // Reset stage filter when funnel changes
  useEffect(() => { setStageFilter(null); }, [filter]);

  const counts = useMemo(() => ({
    all: leads.filter(l => !l.drafted_at).length,
    webdesign: leads.filter(l => l.funnel === 'webdesign' && !l.drafted_at).length,
    aicourses: leads.filter(l => l.funnel === 'aicourses' && !l.drafted_at).length,
    videography: leads.filter(l => l.funnel === 'videography' && !l.drafted_at).length,
  }), [leads]);

  // Pipeline stage counts for current funnel
  const pipelineStages = filter !== 'all' ? PIPELINE_STAGES[filter] || [] : [];
  const funnelLeadsForPipeline = filter !== 'all' ? leads.filter(l => l.funnel === filter && !l.drafted_at) : [];
  const stageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    pipelineStages.forEach(s => { map[s.value] = 0; });
    funnelLeadsForPipeline.forEach(l => {
      if (map[l.status] !== undefined) map[l.status]++;
      else if (pipelineStages.length > 0) map[pipelineStages[0].value] = (map[pipelineStages[0].value] || 0) + 1;
    });
    return map;
  }, [funnelLeadsForPipeline, pipelineStages]);

  const draftCount = leads.filter(l => !!l.drafted_at).length;

  return (
    <AuthLayoutGate>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Funnels</h1>
            <p className="text-sm text-muted-foreground">Leads from your landing pages only</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={showDrafted ? "default" : "outline"} size="sm" onClick={() => setShowDrafted(!showDrafted)}>
              <EyeOff className="h-3.5 w-3.5 mr-1" />
              Drafted {draftCount > 0 && `(${draftCount})`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchLeads()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['all', 'webdesign', 'videography', 'aicourses'] as const).map((key) => {
            const cfg = key === 'all'
              ? { label: 'All Leads', icon: Filter, color: 'text-foreground', bgColor: 'bg-muted' }
              : FUNNEL_CONFIG[key];
            return (
              <Card key={key} className={cn("cursor-pointer transition-all", filter === key && "ring-2 ring-primary")} onClick={() => setFilter(key)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn("p-2 rounded-md", cfg.bgColor)}>
                    <cfg.icon className={cn("h-4 w-4", cfg.color)} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{counts[key]}</p>
                    <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Pipeline Stage Rail */}
        {filter !== 'all' && pipelineStages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              variant={stageFilter === null ? "default" : "outline"}
              size="sm"
              className="shrink-0 text-xs h-8"
              onClick={() => setStageFilter(null)}
            >
              All ({funnelLeadsForPipeline.length})
            </Button>
            {pipelineStages.map(s => (
              <Button
                key={s.value}
                variant={stageFilter === s.value ? "default" : "outline"}
                size="sm"
                className="shrink-0 text-xs h-8"
                onClick={() => setStageFilter(stageFilter === s.value ? null : s.value)}
              >
                {s.label} <span className="ml-1.5 text-muted-foreground">{stageCounts[s.value] || 0}</span>
              </Button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, phone, address..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Leads Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pagedLeads.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{showDrafted ? 'No drafted leads' : 'No leads found'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pagedLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onEmail={() => setEmailLead(lead)}
                onView={() => setViewLead(lead)}
                onDraft={() => handleDraft(lead)}
                onUndraft={() => handleUndraft(lead)}
                onStageChange={(newStatus) => handleStageChange(lead, newStatus)}
                onRemind={() => handleRemind(lead)}
                onHappyToggle={(checked) => handleHappyToggle(lead, checked)}
                onDeadToggle={(checked) => handleDeadToggle(lead, checked)}
                onPhoneEdit={async (newPhone) => {
                  if (!newPhone.trim()) return;
                  const { error } = await supabase.from('customers').update({ phone: newPhone.trim() }).eq('id', lead.id);
                  if (error) { toast.error('Failed to update phone'); return; }
                  setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, phone: newPhone.trim() } : l));
                  toast.success('Phone updated');
                }}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" disabled={safeCurrentPage <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {safeCurrentPage} of {totalPages} · {filtered.length} leads
            </span>
            <Button variant="outline" size="sm" disabled={safeCurrentPage >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <EmailModal lead={emailLead} open={!!emailLead} onClose={() => setEmailLead(null)} />
        <LeadDetailModal lead={viewLead} open={!!viewLead} onClose={() => setViewLead(null)} onLeadUpdate={(updated) => setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))} />
      </div>
    </AuthLayoutGate>
  );
}
