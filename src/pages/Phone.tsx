import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Phone, Upload, FileAudio, X, Loader2, Check, FolderUp, Copy, ChevronDown, ChevronUp, Voicemail, PhoneCall, User, UserPlus, Search, ChevronLeft, ChevronRight, Play, Square, Download, ArrowUpRight, Zap, PhoneOff, Clock, Ban, Info, MapPin, Mail, Building2, Tag, Star, Globe, Instagram, ExternalLink, MonitorPlay, CalendarClock } from 'lucide-react';
import { Teleprompter } from '@/components/phone/Teleprompter';
import MeetingSchedulerModal from '@/components/phone/MeetingSchedulerModal';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const RC_EMBED_URL = 'https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/app.html';
const CALL_TYPES = [
  { value: 'voicemail', label: 'Voicemail', icon: Voicemail },
  { value: 'live_call', label: 'Live Call', icon: PhoneCall },
] as const;

type CallType = typeof CALL_TYPES[number]['value'];

export default function PhonePage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [transcriptions, setTranscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsCategoryFilter, setLeadsCategoryFilter] = useState<string>('all');
  const [areaCodeFilter, setAreaCodeFilter] = useState<string>('');
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [transcriptionsOpen, setTranscriptionsOpen] = useState(false);

  // Promote to prospect dialog
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteCustomerId, setPromoteCustomerId] = useState<string | null>(null);
  const [promoteCustomerName, setPromoteCustomerName] = useState('');

  // Lead detail popup (editable)
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [leadDetail, setLeadDetail] = useState<any>(null);
  const [leadDetailLoading, setLeadDetailLoading] = useState(false);
  const [leadEditForm, setLeadEditForm] = useState<Record<string, string>>({});
  const [leadSaving, setLeadSaving] = useState(false);

  // Not interested confirmation
  const [deleteLeadOpen, setDeleteLeadOpen] = useState(false);
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [deleteLeadName, setDeleteLeadName] = useState('');
  const [deletingLead, setDeletingLead] = useState(false);

  // Call back scheduler popup
  const [callBackOpen, setCallBackOpen] = useState(false);
  const [callBackLeadId, setCallBackLeadId] = useState<string | null>(null);
  const [callBackLeadName, setCallBackLeadName] = useState('');
  const [callBackDate, setCallBackDate] = useState<Date | undefined>(undefined);
  const [callBackTime, setCallBackTime] = useState('10:00');

  // Interested confirmation
  const [interestedOpen, setInterestedOpen] = useState(false);
  const [interestedLead, setInterestedLead] = useState<{ id: string; name: string; category: string | null; email?: string; phone?: string } | null>(null);

  // Workflow gate (post-interested)
  const [workflowGateOpen, setWorkflowGateOpen] = useState(false);
  const [workflowGateLead, setWorkflowGateLead] = useState<any>(null);
  const [workflowOpts, setWorkflowOpts] = useState({ audit: true, auditEmail: true, meetingEmail: true, schedule: true });
  const [workflowRunning, setWorkflowRunning] = useState(false);

  // Meeting scheduler after interested
  const [meetingSchedulerOpen, setMeetingSchedulerOpen] = useState(false);
  const [meetingSchedulerLead, setMeetingSchedulerLead] = useState<any>(null);

  // Analyze lead state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<{ instagram?: string; website?: string; leadId?: string; pdfUrl?: string; scores?: any } | null>(null);
  const [sendingReport, setSendingReport] = useState(false);

  // Email preview state
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ to: string; subject: string; body_html: string; customer_name: string; customer_id: string | null; lead: any } | null>(null);
  const [emailDraftLoading, setEmailDraftLoading] = useState(false);
  const [emailSubjectEdit, setEmailSubjectEdit] = useState('');
  const [emailBodyEdit, setEmailBodyEdit] = useState('');

  // Transcription upload state
  const [dragOver, setDragOver] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [callType, setCallType] = useState<CallType>('voicemail');
  const [selectedCategory, setSelectedCategory] = useState<string>('other');
  const [transcribing, setTranscribing] = useState(false);
  const [uploadingToDrive, setUploadingToDrive] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const skipMeetingEmailRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // New customer dialog state
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustSaving, setNewCustSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [custRes, transRes, leadsRes] = await Promise.all([
      supabase.from('customers').select('id, full_name, phone, email'),
      supabase.from('transcriptions').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('customers').select('id, full_name, phone, email, company, source, created_at, address, notes, tags, category, instagram_handle, meta').eq('status', 'lead').order('created_at', { ascending: false }),
    ]);
    setCustomers(custRes.data || []);
    setTranscriptions(transRes.data || []);
    setLeads(leadsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied — paste into dialer`);
  };

  const handlePromoteToProspect = async () => {
    if (!promoteCustomerId) return;
    const { error } = await supabase.from('customers').update({ status: 'prospect' }).eq('id', promoteCustomerId);
    if (error) { toast.error('Failed to promote'); return; }
    setLeads(prev => prev.filter(l => l.id !== promoteCustomerId));
    toast.success(`${promoteCustomerName} moved to Prospects`);
    setPromoteOpen(false);
    setPromoteCustomerId(null);
    setPromoteCustomerName('');
  };

  const handleLeadDoubleClick = async (lead: any) => {
    setLeadDetail(lead);
    setLeadEditForm({
      full_name: lead.full_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      address: lead.address || '',
      source: lead.source || '',
      instagram_handle: lead.instagram_handle || '',
      notes: lead.notes || '',
      tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
    });
    setLeadDetailOpen(true);
  };

  const handleLeadDetailSave = async () => {
    if (!leadDetail) return;
    setLeadSaving(true);
    const payload = {
      full_name: leadEditForm.full_name,
      email: leadEditForm.email || null,
      phone: leadEditForm.phone || null,
      company: leadEditForm.company || null,
      address: leadEditForm.address || null,
      source: leadEditForm.source || null,
      instagram_handle: leadEditForm.instagram_handle || null,
      notes: leadEditForm.notes || null,
      tags: leadEditForm.tags ? leadEditForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    };
    const { error } = await supabase.from('customers').update(payload).eq('id', leadDetail.id);
    setLeadSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead updated');
    setLeadDetailOpen(false);
    loadData();
  };

  const handleLeadStatus = async (leadId: string, leadName: string, action: 'busy' | 'not_interested' | 'call_back') => {
    if (action === 'not_interested') {
      setDeleteLeadId(leadId);
      setDeleteLeadName(leadName);
      setDeleteLeadOpen(true);
      return;
    }
    if (action === 'busy') {
      // Set busy_until to 24 hours from now in meta
      const lead = leads.find(l => l.id === leadId);
      const existingMeta = typeof lead?.meta === 'object' ? lead.meta : {};
      const busyUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const updatedMeta = { ...existingMeta, busy_until: busyUntil };
      await supabase.from('customers').update({ meta: updatedMeta } as any).eq('id', leadId);
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, meta: updatedMeta } : l));
      toast('Busy — removed from queue for 24 hours', { icon: '⏸️' });
      // Advance to next lead
      setCurrentLeadIndex(prev => prev + 1);
      return;
    }
    if (action === 'call_back') {
      setCallBackLeadId(leadId);
      setCallBackLeadName(leadName);
      setCallBackDate(undefined);
      setCallBackTime('10:00');
      setCallBackOpen(true);
      return;
    }
  };

  const handleConfirmCallBack = async () => {
    if (!callBackLeadId || !callBackDate) return;
    const lead = leads.find(l => l.id === callBackLeadId);
    const existingMeta = typeof lead?.meta === 'object' ? lead.meta : {};
    const [hours, minutes] = callBackTime.split(':').map(Number);
    const callbackAt = new Date(callBackDate);
    callbackAt.setHours(hours, minutes, 0, 0);
    const updatedMeta = { ...existingMeta, callback_at: callbackAt.toISOString() };
    await supabase.from('customers').update({ meta: updatedMeta } as any).eq('id', callBackLeadId);
    setLeads(prev => prev.map(l => l.id === callBackLeadId ? { ...l, meta: updatedMeta } : l));
    toast.success(`Call back scheduled for ${format(callbackAt, 'MMM d, h:mm a')}`);
    setCallBackOpen(false);
    setCallBackLeadId(null);
    // Advance to next lead
    setCurrentLeadIndex(prev => prev + 1);
  };

  const handleLeadInterested = async (leadId: string, leadName: string, leadCategory: string | null) => {
    const leadObj = leads.find(l => l.id === leadId);
    const catLabel = SERVICE_CATEGORIES.find(c => c.id === (leadCategory || 'other'))?.label || 'Other';

    // ── 1. Update deal to Qualified ──
    const { data: existingDeal } = await supabase
      .from('deals')
      .select('id')
      .eq('customer_id', leadId)
      .limit(1)
      .maybeSingle();

    if (existingDeal) {
      await supabase.from('deals').update({ stage: 'qualified' }).eq('id', existingDeal.id);
      await supabase.from('activity_log').insert({
        entity_type: 'deal', entity_id: existingDeal.id, action: 'updated',
        meta: { title: `${leadName}`, customer_name: leadName, from_stage: 'new', to_stage: 'qualified' },
      });
    } else {
      const { data: newDeal } = await supabase.from('deals').insert({
        title: `${leadName} — ${catLabel}`, customer_id: leadId, category: leadCategory || 'other',
        stage: 'qualified', status: 'open', pipeline: 'default', deal_value: 0, probability: 30,
      }).select('id').single();
      if (newDeal) {
        await supabase.from('activity_log').insert({
          entity_type: 'deal', entity_id: newDeal.id, action: 'updated',
          meta: { title: `${leadName} — ${catLabel}`, customer_name: leadName, from_stage: 'new', to_stage: 'qualified' },
        });
      }
    }

    // ── 2. Update customer status ──
    await supabase.from('customers').update({ status: 'prospect' }).eq('id', leadId);
    toast.success(`${leadName} marked as Interested — moved to Qualified`);

    // ── 3. Telegram Notification (direct call) ──
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/telegram-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({
          entity_type: 'lead', action: 'created',
          meta: {
            message: `⭐ *Interested Client*\n👤 *${leadName}*\n📂 Category: *${catLabel}*\n📧 ${leadObj?.email || 'No email'}\n📞 ${leadObj?.phone || 'No phone'}\n\n_Cold caller marked this lead as interested_`,
            name: leadName,
          },
        }),
      });
    } catch (e) { console.error('Telegram notify error:', e); }

    // Also log to activity_log for record keeping
    await supabase.from('activity_log').insert({
      entity_type: 'lead', entity_id: leadId, action: 'created',
      meta: {
        message: `⭐ *Interested Client*\n👤 *${leadName}*\n📂 Category: *${catLabel}*\n📧 ${leadObj?.email || 'No email'}\n📞 ${leadObj?.phone || 'No phone'}\n\n_Cold caller marked this lead as interested_`,
        name: leadName,
      },
    });

    // ── 4. Remove from leads list ──
    setLeads(prev => prev.filter(l => l.id !== leadId));

    // ── 5. Show Workflow Gate dialog instead of auto-firing everything ──
    skipMeetingEmailRef.current = false;
    setWorkflowGateLead(leadObj);
    setWorkflowOpts({ audit: true, auditEmail: true, meetingEmail: true, schedule: true });
    setWorkflowGateOpen(true);
  };

  // ── Execute selected workflow steps ──
  const executeWorkflow = async () => {
    const lead = workflowGateLead;
    if (!lead) return;
    setWorkflowRunning(true);
    setWorkflowGateOpen(false);

    // Schedule meeting if selected
    if (workflowOpts.schedule) {
      setMeetingSchedulerLead(lead);
      setMeetingSchedulerOpen(true);
    }

    // Run audit + emails in background if selected
    if (lead.email && (workflowOpts.audit || workflowOpts.auditEmail || workflowOpts.meetingEmail)) {
      const shouldAudit = workflowOpts.audit;
      const shouldAuditEmail = workflowOpts.auditEmail;
      const shouldMeetingEmail = workflowOpts.meetingEmail;

      toast.info(`Starting selected workflow steps for ${lead.full_name}...`, { duration: 6000 });

      (async () => {
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          let pdfUrl: string | null = null;
          let auditScores: any = null;

          // Run audit if selected
          if (shouldAudit) {
            const result = await runAuditOnly(lead);
            pdfUrl = result.pdfUrl;
            auditScores = result.auditScores;
          }

          // Send audit email if selected
          if (shouldAuditEmail && pdfUrl) {
            await sendAuditEmail(lead, pdfUrl, auditScores);
          } else if (shouldAuditEmail && !shouldAudit) {
            toast.warning('Skipping audit email — no audit was run to generate a report.');
          }

          // Send meeting email if selected (with delay if audit email was also sent)
          if (shouldMeetingEmail) {
            if (skipMeetingEmailRef.current) {
              toast.info('In-person meeting booked — skipping video meeting invite email.');
            } else {
              if (shouldAuditEmail && pdfUrl) {
                await new Promise(resolve => setTimeout(resolve, 62000));
                if (skipMeetingEmailRef.current) {
                  toast.info('In-person meeting booked — skipping video meeting invite email.');
                  return;
                }
              }
              await sendMeetingEmail(lead);
            }
          }
        } catch (err: any) {
          console.error('Workflow pipeline error:', err);
          toast.error(`Workflow failed: ${err.message}`);
        }
      })();
    }

    setWorkflowRunning(false);
    setWorkflowGateLead(null);
  };

  // ── Audit-only step (extracted from runAutoAuditAndEmail) ──
  const runAuditOnly = async (lead: any): Promise<{ pdfUrl: string | null; auditScores: any }> => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    setAnalyzing(true);
    let pdfUrl: string | null = null;
    let auditScores: any = null;

    try {
      const FREE_EMAIL_DOMAINS = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com','mail.com','protonmail.com','zoho.com','yandex.com','gmx.com','live.com','msn.com','me.com','inbox.com','fastmail.com','tutanota.com','hey.com']);
      const VALID_TLDS = new Set(['.com','.net','.org','.biz','.co','.us','.io','.info','.pro','.me','.tv','.app','.dev','.store','.shop','.agency','.design','.media','.studio','.tech','.digital','.solutions','.services','.consulting','.marketing','.group','.team','.site','.website','.online','.cloud','.space','.xyz']);
      const extractDomain = (email: string | null): string | null => {
        if (!email || !email.includes('@')) return null;
        const domain = email.split('@')[1]?.toLowerCase().trim();
        if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;
        const tldMatch = domain.match(/(\.[a-z]+)$/);
        if (!tldMatch || !VALID_TLDS.has(tldMatch[1])) return null;
        return domain;
      };

      const metaObj = typeof lead.meta === 'object' ? lead.meta : {};
      let website = metaObj?.website || metaObj?.url || metaObj?.site || null;
      let igHandle = lead.instagram_handle || null;

      if (!website) {
        const emailDomain = extractDomain(lead.email);
        if (emailDomain) website = `https://${emailDomain}`;
      }

      if (!website || !igHandle) {
        const searchName = lead.company || lead.full_name;
        try {
          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/meta-extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
            body: JSON.stringify({ url: `https://www.google.com/search?q=${encodeURIComponent(searchName + ' website')}`, name: searchName }),
          });
          if (res.ok) {
            const data = await res.json();
            if (!website) website = data?.website || data?.url || data?.data?.website || null;
            if (!igHandle) igHandle = data?.instagram || data?.data?.instagram || null;
          }
        } catch (e) { console.error('Auto meta-extract error:', e); }
      }

      if (website) {
        try {
          const parsedHost = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
          const tldMatch = parsedHost.match(/(\.[a-z]+)$/);
          if (tldMatch && !VALID_TLDS.has(tldMatch[1])) website = null;
        } catch { /* invalid URL */ }
      }

      let fbUrl: string | null = null;
      if (website) {
        try {
          const scrapeRes = await fetch(`https://${projectId}.supabase.co/functions/v1/firecrawl-scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
            body: JSON.stringify({ url: website, options: { formats: ['links', 'html'], onlyMainContent: false, waitFor: 5000 } }),
          });
          if (scrapeRes.ok) {
            const scrapeData = await scrapeRes.json();
            const links: string[] = scrapeData?.data?.links || scrapeData?.links || [];
            const html: string = scrapeData?.data?.html || scrapeData?.html || '';
            const extractIg = (u: string) => { const m = u.match(/instagram\.com\/([A-Za-z0-9._]+)/); if (m) { const h = m[1].toLowerCase(); const r = ['p','reel','reels','explore','stories','accounts','directory','about','developer','legal','api','static','direct','tv']; if (!r.includes(h)) return m[1]; } return null; };
            const extractFb = (u: string) => { const m = u.match(/(facebook\.com\/[A-Za-z0-9._-]+)/); if (m) { const s = m[1].split('/')[1]?.toLowerCase(); const r = ['sharer','share','dialog','login','help','policies','settings','events','groups','marketplace','watch','gaming','fundraisers','pages','ads','business','privacy','terms']; if (s && !r.includes(s)) return `https://www.${m[1]}`; } return null; };
            for (const l of links) { if (!igHandle) { const h = extractIg(l); if (h) igHandle = h; } if (!fbUrl) { const f = extractFb(l); if (f) fbUrl = f; } if (igHandle && fbUrl) break; }
            if (!igHandle) { const re = /href=["']([^"']*instagram\.com\/[A-Za-z0-9._]+[^"']*?)["']/gi; let m2; while ((m2 = re.exec(html)) !== null) { const h = extractIg(m2[1]); if (h) { igHandle = h; break; } } }
            if (!fbUrl) { const re = /href=["']([^"']*facebook\.com\/[A-Za-z0-9._-]+[^"']*?)["']/gi; let m2; while ((m2 = re.exec(html)) !== null) { const f = extractFb(m2[1]); if (f) { fbUrl = f; break; } } }
          }
        } catch (e) { console.error('Auto scrape error:', e); }
      }

      if (website || igHandle || fbUrl) {
        const updatedMeta = { ...metaObj, ...(website ? { website } : {}), ...(igHandle ? { instagram: igHandle } : {}), ...(fbUrl ? { facebook: fbUrl } : {}) };
        await supabase.from('customers').update({ meta: updatedMeta, ...(igHandle ? { instagram_handle: igHandle } : {}) } as any).eq('id', lead.id);
      }

      if (!website && !igHandle && !fbUrl) {
        toast.warning(`Could not find web presence for ${lead.full_name}. Skipping audit.`);
      } else {
        toast.info(`Running digital audit for ${lead.full_name}...`, { duration: 10000 });
        const auditRes = await fetch(`https://${projectId}.supabase.co/functions/v1/audit-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({ website_url: website, ig_handle: igHandle, fb_url: fbUrl, customer_id: lead.id, customer_name: lead.full_name }),
        });
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          pdfUrl = auditData.pdf_url || null;
          auditScores = auditData.scores || null;
          await supabase.from('customers').update({
            meta: { ...(typeof lead.meta === 'object' ? lead.meta : {}), analyzed: true, audit_pdf_url: pdfUrl, audit_date: new Date().toISOString(), website, instagram: igHandle },
          } as any).eq('id', lead.id);
          toast.success(`Audit complete for ${lead.full_name}! Score: ${auditScores?.overall || '?'}/100`);
        } else {
          const errData = await auditRes.json().catch(() => ({}));
          toast.error(`Audit failed for ${lead.full_name}: ${errData.error || auditRes.status}`);
        }
      }
    } catch (err: any) {
      toast.error(`Audit pipeline error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
    return { pdfUrl, auditScores };
  };

  // ── Send audit report email ──
  const sendAuditEmail = async (lead: any, pdfUrl: string, auditScores: any) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    try {
      let attachments: { filename: string; mimeType: string; data: string }[] | undefined;
      try {
        const pdfRes = await fetch(pdfUrl);
        if (pdfRes.ok) {
          const pdfBuffer = await pdfRes.arrayBuffer();
          const bytes = new Uint8Array(pdfBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          attachments = [{ filename: `Digital_Audit_${lead.full_name.replace(/\s+/g, '_')}.pdf`, mimeType: 'application/pdf', data: btoa(binary) }];
        }
      } catch (pdfErr) { console.error('PDF fetch for attachment failed:', pdfErr); }

      const scoreText = auditScores?.overall ? ` Your overall digital presence score is ${auditScores.overall}/100.` : '';
      const reportBody = `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.7;">
          <p>Hi ${lead.full_name},</p>
          <p>Thank you for your interest! I've put together a complimentary <strong>Digital Audit Report</strong> for your brand.${scoreText}</p>
          <p>The full report is attached as a PDF — it covers your website, social media presence, and actionable recommendations to strengthen your digital footprint.</p>
          ${pdfUrl ? `<p>You can also <a href="${pdfUrl}" style="color:#2754C5;">view the report online here</a>.</p>` : ''}
          <p>I'd love to walk you through the findings and discuss how we can help. I'll be sending over a meeting link in a follow-up email shortly.</p>
          <p>Looking forward to connecting!</p>
        </div>`;

      const sendRes = await fetch(`https://${projectId}.supabase.co/functions/v1/gmail-api?action=send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({
          to: lead.email, subject: `Your Free Digital Audit Report — ${lead.company || lead.full_name}`,
          body: reportBody, ...(attachments ? { attachments } : {}),
        }),
      });
      if (sendRes.ok) toast.success(`📧 Audit report sent to ${lead.email}`);
      else { const errData = await sendRes.json().catch(() => ({})); toast.error(`Failed to send audit email: ${errData.error || 'unknown error'}`); }
    } catch (err: any) { toast.error(`Report email failed: ${err.message}`); }
  };

  // ── Send meeting invite email ──
  const sendMeetingEmail = async (lead: any) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    try {
      const meetingUrl = `${window.location.origin}/letsmeet`;
      const meetingBody = `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.7;">
          <p>Hi ${lead.full_name},</p>
          <p>As a follow-up, I'd love to schedule a quick call to go over your audit results and explore how we can help grow your brand.</p>
          <p style="margin:24px 0;">
            <a href="${meetingUrl}" style="display:inline-block;padding:14px 28px;background:#2754C5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;">
              📅 Book a Meeting
            </a>
          </p>
          <p>Click the button above to pick a time that works best for you. The meeting is completely free — no strings attached.</p>
          <p>Talk soon!</p>
        </div>`;

      const meetRes = await fetch(`https://${projectId}.supabase.co/functions/v1/gmail-api?action=send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ to: lead.email, subject: `Let's Connect — Book a Free Strategy Call`, body: meetingBody }),
      });
      if (meetRes.ok) toast.success(`📅 Meeting invite sent to ${lead.email}`);
      else { const errData = await meetRes.json().catch(() => ({})); toast.error(`Failed to send meeting invite: ${errData.error || 'unknown error'}`); }
    } catch (err: any) { toast.error(`Meeting invite email failed: ${err.message}`); }
  };

  // (runAutoAuditAndEmail removed — replaced by workflow gate with runAuditOnly, sendAuditEmail, sendMeetingEmail above)

  const handleDeleteLead = async () => {
    if (!deleteLeadId) return;
    setDeletingLead(true);
    // Cascade delete related records
    await Promise.all([
      supabase.from('cards').delete().eq('customer_id', deleteLeadId),
      supabase.from('signatures').delete().eq('customer_id', deleteLeadId),
      supabase.from('documents').delete().eq('customer_id', deleteLeadId),
      supabase.from('invoices').delete().eq('customer_id', deleteLeadId),
      supabase.from('interactions').delete().eq('customer_id', deleteLeadId),
      supabase.from('conversation_threads').delete().eq('customer_id', deleteLeadId),
      supabase.from('bot_tasks').delete().eq('customer_id', deleteLeadId),
      supabase.from('communications').delete().eq('customer_id', deleteLeadId),
      supabase.from('deals').delete().eq('customer_id', deleteLeadId),
      supabase.from('transcriptions').delete().eq('customer_id', deleteLeadId),
      supabase.from('api_previews').delete().eq('customer_id', deleteLeadId),
      supabase.from('boards').delete().eq('customer_id', deleteLeadId),
      supabase.from('calendar_events').delete().eq('customer_id', deleteLeadId),
      supabase.from('content_assets').delete().eq('customer_id', deleteLeadId),
      supabase.from('research_findings').delete().eq('customer_id', deleteLeadId),
      supabase.from('site_configs').delete().eq('customer_id', deleteLeadId),
      supabase.from('meetings').delete().eq('customer_id', deleteLeadId),
    ]);
    const { error } = await supabase.from('customers').delete().eq('id', deleteLeadId);
    if (error) { toast.error('Failed to remove lead'); setDeletingLead(false); return; }
    setLeads(prev => prev.filter(l => l.id !== deleteLeadId));
    setCustomers(prev => prev.filter(c => c.id !== deleteLeadId));
    // Reset index to avoid pointing at a stale position
    setCurrentLeadIndex(0);
    toast.success(`${deleteLeadName} removed from CRM`);
    setDeleteLeadOpen(false);
    setDeleteLeadId(null);
    setDeleteLeadName('');
    setDeletingLead(false);
  };

  const filteredLeads = useMemo(() => {
    const now = new Date().toISOString();
    let result = leads.filter(l => {
      const meta = typeof l.meta === 'object' ? l.meta : {};
      // Hide busy leads until busy_until expires
      if (meta?.busy_until && meta.busy_until > now) return false;
      // Hide callback leads until callback_at arrives
      if (meta?.callback_at && meta.callback_at > now) return false;
      return true;
    });
    if (leadsCategoryFilter !== 'all') {
      result = result.filter(l => (l.category || 'other') === leadsCategoryFilter);
    }
    if (areaCodeFilter.length === 3) {
      result = result.filter(l => {
        const phone = (l.phone || '').replace(/\D/g, '');
        const areaCode = phone.length === 11 && phone.startsWith('1') ? phone.substring(1, 4) : phone.substring(0, 3);
        return areaCode === areaCodeFilter;
      });
    }
    return result;
  }, [leads, leadsCategoryFilter, areaCodeFilter]);

  const currentLead = filteredLeads.length > 0 ? filteredLeads[currentLeadIndex % filteredLeads.length] : null;

  // Analyze lead — full audit pipeline: find website/IG → scrape → generate PDF → download
  const handleAnalyzeLead = async (targetLead?: any) => {
    const lead = targetLead || currentLead;
    if (!lead) return;
    setAnalyzing(true);
    setAnalyzeResult(null);

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    try {
      // Step 0: Extract website domain from email address (skip free email providers)
      const FREE_EMAIL_DOMAINS = new Set([
        'gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com',
        'mail.com','protonmail.com','zoho.com','yandex.com','gmx.com','live.com',
        'msn.com','me.com','inbox.com','fastmail.com','tutanota.com','hey.com',
      ]);
      const VALID_TLDS = new Set(['.com','.net','.org','.biz','.co','.us','.io','.info','.pro','.me','.tv','.app','.dev','.store','.shop','.agency','.design','.media','.studio','.tech','.digital','.solutions','.services','.consulting','.marketing','.group','.team','.site','.website','.online','.cloud','.space','.xyz']);

      const extractDomainFromEmail = (email: string | null): string | null => {
        if (!email || !email.includes('@')) return null;
        const domain = email.split('@')[1]?.toLowerCase().trim();
        if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;
        // Check that the TLD is in our valid list
        const tldMatch = domain.match(/(\.[a-z]+)$/);
        if (!tldMatch || !VALID_TLDS.has(tldMatch[1])) return null;
        return domain;
      };

      // Step 1: Gather existing data
      const metaObj = typeof lead.meta === 'object' ? lead.meta : {};
      let website = metaObj?.website || metaObj?.url || metaObj?.site || null;
      let igHandle = lead.instagram_handle || null;

      // Step 1b: Try to derive website from email domain
      if (!website) {
        const emailDomain = extractDomainFromEmail(lead.email);
        if (emailDomain) {
          website = `https://${emailDomain}`;
          toast.info(`Detected website from email: ${emailDomain}`);
        }
      }

      // Step 2: If no website/IG, search for them via meta-extract
      if (!website || !igHandle) {
        const searchName = lead.company || lead.full_name;
        toast.info(`Searching for ${searchName}'s web presence...`);

        try {
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/meta-extract`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
              body: JSON.stringify({ url: `https://www.google.com/search?q=${encodeURIComponent(searchName + ' website')}`, name: searchName }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (!website) website = data?.website || data?.url || data?.data?.website || null;
            if (!igHandle) igHandle = data?.instagram || data?.data?.instagram || null;
          }
        } catch (e) {
          console.error('Meta-extract error:', e);
        }
      }

      // Step 2b: Validate any discovered website URL has a valid TLD
      if (website) {
        try {
          const parsedHost = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
          const tldMatch = parsedHost.match(/(\.[a-z]+)$/);
          if (tldMatch && !VALID_TLDS.has(tldMatch[1])) {
            console.warn(`Rejecting website with invalid TLD: ${parsedHost}`);
            website = null;
          }
        } catch { /* invalid URL, keep as-is */ }
      }

      // Step 3: If website found, scrape it for social links (IG + Facebook)
      let fbUrl: string | null = null;
      if (website && (!igHandle || !fbUrl)) {
        toast.info('Checking website for social media links...');
        try {
          const scrapeRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/firecrawl-scrape`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
              body: JSON.stringify({ url: website, options: { formats: ['links', 'html'], onlyMainContent: false, waitFor: 5000 } }),
            }
          );
          if (scrapeRes.ok) {
            const scrapeData = await scrapeRes.json();

            // Helper to extract IG handle from a URL string
            const extractIgHandle = (url: string): string | null => {
              const match = url.match(/instagram\.com\/([A-Za-z0-9._]+)/);
              if (match) {
                const handle = match[1].toLowerCase();
                const reserved = ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'directory', 'about', 'developer', 'legal', 'api', 'static', 'direct', 'tv'];
                if (!reserved.includes(handle)) return match[1];
              }
              return null;
            };

            // Helper to extract Facebook page URL
            const extractFbUrl = (url: string): string | null => {
              const match = url.match(/(facebook\.com\/[A-Za-z0-9._-]+)/);
              if (match) {
                const slug = match[1].split('/')[1]?.toLowerCase();
                const reserved = ['sharer', 'share', 'dialog', 'login', 'help', 'policies', 'settings', 'events', 'groups', 'marketplace', 'watch', 'gaming', 'fundraisers', 'pages', 'ads', 'business', 'privacy', 'terms'];
                if (slug && !reserved.includes(slug)) return `https://www.${match[1]}`;
              }
              return null;
            };

            const links: string[] = scrapeData?.data?.links || scrapeData?.links || [];
            const html: string = scrapeData?.data?.html || scrapeData?.html || '';

            // Search links array for IG and FB
            for (const l of links) {
              if (!igHandle) { const h = extractIgHandle(l); if (h) igHandle = h; }
              if (!fbUrl) { const f = extractFbUrl(l); if (f) fbUrl = f; }
              if (igHandle && fbUrl) break;
            }

            // Fallback: parse HTML for IG
            if (!igHandle) {
              const hrefRegex = /href=["']([^"']*instagram\.com\/[A-Za-z0-9._]+[^"']*?)["']/gi;
              let hrefMatch;
              while ((hrefMatch = hrefRegex.exec(html)) !== null) {
                const h = extractIgHandle(hrefMatch[1]);
                if (h) { igHandle = h; break; }
              }
            }

            // Fallback: parse HTML for Facebook
            if (!fbUrl) {
              const fbRegex = /href=["']([^"']*facebook\.com\/[A-Za-z0-9._-]+[^"']*?)["']/gi;
              let fbMatch;
              while ((fbMatch = fbRegex.exec(html)) !== null) {
                const f = extractFbUrl(fbMatch[1]);
                if (f) { fbUrl = f; break; }
              }
            }
          }
        } catch (e) {
          console.error('Scrape for social links error:', e);
        }
      }

      // Step 4: If IG found but no website, try to get website from IG external URL (handled by audit-report internally)

      // Save discovered data to CRM
      if (website || igHandle || fbUrl) {
        const updatedMeta = { ...metaObj, ...(website ? { website } : {}), ...(igHandle ? { instagram: igHandle } : {}), ...(fbUrl ? { facebook: fbUrl } : {}) };
        await supabase.from('customers').update({
          meta: updatedMeta,
          ...(igHandle ? { instagram_handle: igHandle } : {}),
        } as any).eq('id', lead.id);
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, meta: updatedMeta, instagram_handle: igHandle || l.instagram_handle } : l));
      }

      if (!website && !igHandle && !fbUrl) {
        toast.error('Could not find any website, Instagram, or Facebook for this lead. Try adding them manually.');
        setAnalyzeResult({ leadId: lead.id });
        return;
      }

      // Step 5: Run the full audit
      toast.info(`Running full digital audit${website ? ` on ${website}` : ''}${igHandle ? ` + @${igHandle}` : ''}${fbUrl ? ` + Facebook` : ''}...`, { duration: 10000 });

      const auditRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/audit-report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({
            website_url: website || null,
            ig_handle: igHandle || null,
            fb_url: fbUrl || null,
            customer_id: lead.id,
            customer_name: lead.full_name,
          }),
        }
      );

      if (!auditRes.ok) {
        const errData = await auditRes.json().catch(() => ({}));
        throw new Error(errData.error || `Audit failed: ${auditRes.status}`);
      }

      const auditData = await auditRes.json();
      const pdfUrl = auditData.pdf_url;

      // Step 6: Auto-download the PDF
      if (pdfUrl) {
        try {
          const pdfRes = await fetch(pdfUrl);
          const blob = await pdfRes.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `Digital_Audit_${lead.full_name.replace(/\s+/g, '_')}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);
          toast.success('Audit PDF downloaded!');
        } catch (dlErr) {
          console.error('Download error:', dlErr);
          toast.error('PDF generated but download failed. Check Content library.');
        }
      }

      // Update local lead state with analyzed flag
      setLeads(prev => prev.map(l => l.id === lead.id ? {
        ...l,
        meta: { ...(typeof l.meta === 'object' ? l.meta : {}), analyzed: true, audit_pdf_url: pdfUrl, audit_date: new Date().toISOString(), website, instagram: igHandle },
      } : l));

      setAnalyzeResult({
        instagram: igHandle || undefined,
        website: website || undefined,
        leadId: lead.id,
        pdfUrl: pdfUrl || undefined,
        scores: auditData.scores || undefined,
      });

      toast.success(`Audit complete for ${lead.full_name}! Score: ${auditData.scores?.overall || '?'}/100`);
    } catch (err: any) {
      console.error('Analyze/Audit error:', err);
      toast.error(err.message || 'Failed to analyze lead');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendReport = async (lead: any) => {
    if (!lead?.email) {
      toast.error('No email on file for this lead');
      return;
    }
    const metaObj = typeof lead.meta === 'object' ? lead.meta : {};
    const pdfUrl = metaObj?.audit_pdf_url;
    if (!pdfUrl) {
      toast.error('No audit report found. Run Analyze first.');
      return;
    }

    setEmailDraftLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/email-command`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({
            prompt: `Send a professional email to ${lead.full_name} at ${lead.email} about their free digital audit results. Include a link to their audit report: ${pdfUrl}. Mention their overall score and suggest scheduling a call to discuss the findings. Keep it brief and professional. Sign as Warren from STU25 / Warren Guru Creative Management.`,
            draft_only: true,
          }),
        }
      );

      const data = await res.json();
      if (data.type === 'draft') {
        setEmailDraft({
          to: data.to,
          subject: data.subject,
          body_html: data.body_html,
          customer_name: data.customer_name || lead.full_name,
          customer_id: data.customer_id || lead.id,
          lead,
        });
        setEmailSubjectEdit(data.subject);
        setEmailBodyEdit(data.body_html);
        setEmailPreviewOpen(true);
      } else {
        toast.error(data.message || 'Failed to compose email');
      }
    } catch (err: any) {
      console.error('Draft email error:', err);
      toast.error('Failed to compose email');
    } finally {
      setEmailDraftLoading(false);
    }
  };

  // Step 2: Actually send the email after preview/edit
  const handleConfirmSendEmail = async () => {
    if (!emailDraft) return;
    setSendingReport(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Fetch the PDF and encode as base64 for attachment
      const lead = emailDraft.lead;
      const metaObj = typeof lead?.meta === 'object' ? lead.meta : {};
      const pdfUrl = metaObj?.audit_pdf_url;
      let attachments: { filename: string; mimeType: string; data: string }[] | undefined;

      if (pdfUrl) {
        try {
          const pdfRes = await fetch(pdfUrl);
          if (pdfRes.ok) {
            const pdfBuffer = await pdfRes.arrayBuffer();
            const bytes = new Uint8Array(pdfBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64Pdf = btoa(binary);
            const customerName = (lead?.full_name || 'Prospect').replace(/\s+/g, '_');
            attachments = [{
              filename: `Digital_Audit_${customerName}.pdf`,
              mimeType: 'application/pdf',
              data: base64Pdf,
            }];
          }
        } catch (pdfErr) {
          console.error('Failed to fetch PDF for attachment:', pdfErr);
          // Continue sending without attachment
        }
      }

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/gmail-api?action=send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({
            to: emailDraft.to,
            subject: emailSubjectEdit,
            body: emailBodyEdit,
            ...(attachments ? { attachments } : {}),
          }),
        }
      );

      if (res.ok) {
        toast.success(`Audit report sent to ${emailDraft.to}`);
        setEmailPreviewOpen(false);
        setEmailDraft(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to send email');
      }
    } catch (err: any) {
      console.error('Send email error:', err);
      toast.error('Failed to send email');
    } finally {
      setSendingReport(false);
    }
  };

  const handleNextLead = () => {
    if (filteredLeads.length <= 1) return;
    const randomOffset = Math.floor(Math.random() * (filteredLeads.length - 1)) + 1;
    setCurrentLeadIndex(prev => (prev + randomOffset) % filteredLeads.length);
    setAnalyzeResult(null);
  };

  const filteredTranscriptions = useMemo(() => {
    if (!searchQuery.trim()) return transcriptions;
    const q = searchQuery.toLowerCase();
    return transcriptions.filter(t => {
      const customerName = t.customer_id ? customers.find(c => c.id === t.customer_id)?.full_name || '' : '';
      return customerName.toLowerCase().includes(q);
    });
  }, [transcriptions, customers, searchQuery]);

  // Group filtered transcriptions by customer
  const groupedTranscriptions = useMemo(() => {
    const groups: Record<string, { customer: any; items: any[] }> = {};
    const ungrouped: any[] = [];

    for (const t of filteredTranscriptions) {
      if (t.customer_id) {
        if (!groups[t.customer_id]) {
          const customer = customers.find(c => c.id === t.customer_id);
          groups[t.customer_id] = { customer: customer || { full_name: 'Unknown Customer' }, items: [] };
        }
        groups[t.customer_id].items.push(t);
      } else {
        ungrouped.push(t);
      }
    }

    const sorted = Object.entries(groups).sort(
      ([, a], [, b]) => new Date(b.items[0].created_at).getTime() - new Date(a.items[0].created_at).getTime()
    );

    return { grouped: sorted, ungrouped };
  }, [filteredTranscriptions, customers]);

  // Pagination
  const totalGroups = groupedTranscriptions.grouped.length + (groupedTranscriptions.ungrouped.length > 0 ? 1 : 0);
  const totalPages = Math.max(1, Math.ceil(totalGroups / ITEMS_PER_PAGE));
  const paginatedGroups = useMemo(() => {
    const allGroups = [...groupedTranscriptions.grouped];
    // Add ungrouped as a virtual group at the end
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return allGroups.slice(start, end);
  }, [groupedTranscriptions.grouped, currentPage, ITEMS_PER_PAGE]);
  const showUngrouped = groupedTranscriptions.ungrouped.length > 0 && 
    (currentPage - 1) * ITEMS_PER_PAGE + paginatedGroups.length < totalGroups &&
    currentPage === totalPages;

  // ─── Drag & drop handlers ─────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|ogg|flac|aac|wma|webm)$/i)
    );
    if (files.length === 0) { toast.error('Please drop audio files only'); return; }
    setUploadFiles(prev => [...prev, ...files]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setUploadFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => setUploadFiles(prev => prev.filter((_, i) => i !== idx));

  // ─── Create new customer (lead) ───────────────────────
  const handleCreateCustomer = async () => {
    if (!newCustName.trim()) { toast.error('Name is required'); return; }
    setNewCustSaving(true);
    const { data, error } = await supabase.from('customers').insert({
      full_name: newCustName.trim(),
      phone: newCustPhone.trim() || null,
      email: newCustEmail.trim() || null,
      status: 'lead',
    }).select('id, full_name, phone, email').single();

    if (error) {
      toast.error('Failed to create customer');
      setNewCustSaving(false);
      return;
    }

    setCustomers(prev => [data, ...prev]);
    setSelectedCustomerId(data.id);
    setNewCustOpen(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustEmail('');
    setNewCustSaving(false);
    toast.success(`Created lead: ${data.full_name}`);
  };

  // ─── Transcribe + upload to Drive ─────────────────────
  const handleTranscribe = async () => {
    if (uploadFiles.length === 0) { toast.error('Add audio files first'); return; }
    if (!selectedCustomerId) { toast.error('Select a customer'); return; }

    const customer = customers.find(c => c.id === selectedCustomerId);
    const customerName = customer?.full_name || 'Unknown';
    const dateStr = format(new Date(), 'yyyy-MM-dd');

    setTranscribing(true);
    setResults([]);
    const newResults: any[] = [];

    for (const file of uploadFiles) {
      try {
        const formData = new FormData();
        formData.append('audio', file);
        formData.append('customer_name', customerName);
        formData.append('customer_id', selectedCustomerId);
        formData.append('source_type', callType);
        formData.append('category', selectedCategory);

        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const transcribeRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/transcribe-audio`,
          {
            method: 'POST',
            headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
            body: formData,
          }
        );
        const transcribeData = await transcribeRes.json();
        if (!transcribeRes.ok) throw new Error(transcribeData.error || 'Transcription failed');

        // Upload original audio to Supabase storage
        let audioPublicUrl: string | null = null;
        try {
          setUploadingToDrive(true);
          const { uploadToStorage } = await import('@/lib/storage');
          const typePrefix = callType === 'voicemail' ? 'VM' : 'CALL';
          const renamedFile = new File([file], `${dateStr}_${typePrefix}_${file.name}`, { type: file.type });
          audioPublicUrl = await uploadToStorage(renamedFile, {
            category: 'Transcriptions',
            customerName,
            source: 'phone',
            fileName: renamedFile.name,
          });
        } catch (uploadErr: any) {
          console.error('Storage upload error:', uploadErr);
        } finally {
          setUploadingToDrive(false);
        }

        // Save the storage link to the transcription record
        const transcriptionId = transcribeData.transcription_id;
        if (transcriptionId && audioPublicUrl) {
          await supabase.from('transcriptions').update({ audio_url: audioPublicUrl } as any).eq('id', transcriptionId);
        }

        newResults.push({
          id: transcriptionId || file.name,
          filename: file.name,
          transcript: transcribeData.transcript,
          summary: transcribeData.summary,
          driveLink: audioPublicUrl,
          callType,
          success: true,
        });

        toast.success(`Transcribed: ${file.name}`);
      } catch (err: any) {
        console.error('Transcription error:', err);
        newResults.push({ id: file.name, filename: file.name, error: err.message, success: false });
        toast.error(`Failed: ${file.name}`);
      }
    }

    setResults(newResults);
    setTranscribing(false);
    setUploadFiles([]);

    // Immediately add successful transcriptions to the list
    const successfulResults = newResults.filter(r => r.success && r.id);
    if (successfulResults.length > 0) {
      const newTranscriptions = successfulResults.map(r => ({
        id: r.id,
        source_type: r.callType || callType,
        transcript: r.transcript,
        summary: r.summary || null,
        customer_id: selectedCustomerId,
        created_at: new Date().toISOString(),
        duration_seconds: null,
        source_id: `upload_${Date.now()}`,
        audio_url: r.driveLink || null,
      }));
      setTranscriptions(prev => [...newTranscriptions, ...prev]);
      setExpandedCustomer(selectedCustomerId);

      // After transcription, ask if user wants to promote to prospect
      const customer = customers.find(c => c.id === selectedCustomerId);
      if (customer) {
        setPromoteCustomerId(selectedCustomerId);
        setPromoteCustomerName(customer.full_name);
        setPromoteOpen(true);
      }
    }
  };

  const copyTranscript = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioBlobUrls, setAudioBlobUrls] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const extractDriveFileId = (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  const handlePlayAudio = async (transcription: any) => {
    if (!transcription.audio_url) { toast.error('No audio file linked'); return; }

    // If already playing this one, stop it
    if (playingId === transcription.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // If we already have the blob cached, play it
    if (audioBlobUrls[transcription.id]) {
      const audio = new Audio(audioBlobUrls[transcription.id]);
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(transcription.id);
      audio.play();
      return;
    }

    // For Supabase storage URLs, fetch directly
    setDownloadingId(transcription.id);
    try {
      const res = await fetch(transcription.audio_url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setAudioBlobUrls(prev => ({ ...prev, [transcription.id]: blobUrl }));

      const audio = new Audio(blobUrl);
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(transcription.id);
      audio.play();
    } catch (err: any) {
      console.error('Play error:', err);
      toast.error('Failed to load audio');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getTypeBadge = (sourceType: string, transcription?: any) => {
    const hasAudio = transcription?.audio_url;
    const isPlaying = transcription && playingId === transcription.id;
    const isLoading = transcription && downloadingId === transcription.id;

    const clickProps = hasAudio ? {
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); handlePlayAudio(transcription); },
      className: cn("gap-1 text-[10px] cursor-pointer hover:opacity-80 transition-opacity", isPlaying && "ring-2 ring-primary/50"),
      role: "button" as const,
    } : { className: "gap-1 text-[10px]" };

    if (sourceType === 'voicemail') return (
      <Badge variant="secondary" {...clickProps}>
        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : isPlaying ? <Square className="h-3 w-3" /> : <Voicemail className="h-3 w-3" />}
        Voicemail
        {hasAudio && !isLoading && !isPlaying && <Play className="h-2.5 w-2.5 ml-0.5" />}
        {isPlaying && <span className="ml-0.5 text-[9px]">Playing</span>}
      </Badge>
    );
    if (sourceType === 'live_call') return (
      <Badge variant="outline" {...clickProps}>
        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : isPlaying ? <Square className="h-3 w-3" /> : <PhoneCall className="h-3 w-3" />}
        Live Call
        {hasAudio && !isLoading && !isPlaying && <Play className="h-2.5 w-2.5 ml-0.5" />}
        {isPlaying && <span className="ml-0.5 text-[9px]">Playing</span>}
      </Badge>
    );
    return <Badge variant="outline" className="text-[10px]">{sourceType}</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Phone</h1>
          <p className="text-muted-foreground mt-1">Softphone + audio transcription workspace.</p>
        </div>

        {/* Two-column layout: Left = Transcription, Right = RingCentral */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
          {/* ─── Left Column: Warm Leads + Transcription Tool + Recent ─── */}
          <div className="space-y-6">

            {/* ─── Cold Leads Quick-Dial Panel ─── */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Cold Leads</h2>
                  <Badge variant="secondary" className="text-[10px]">{filteredLeads.length} of {leads.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    className="h-8 text-xs gap-1.5"
                    disabled={!currentLead || analyzing}
                    onClick={() => handleAnalyzeLead()}
                  >
                    {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    {analyzing ? 'Auditing...' : 'Analyze & Audit'}
                  </Button>
                  <div className="w-44">
                    <Select value={leadsCategoryFilter} onValueChange={v => { setLeadsCategoryFilter(v); setCurrentLeadIndex(0); setAnalyzeResult(null); }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {SERVICE_CATEGORIES.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <span className="flex items-center gap-2">
                              <cat.icon className="h-3.5 w-3.5" />
                              {cat.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    <Input
                      placeholder="Area code"
                      maxLength={3}
                      value={areaCodeFilter}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                        setAreaCodeFilter(v);
                        setCurrentLeadIndex(0);
                        setAnalyzeResult(null);
                      }}
                      className="h-8 text-xs text-center font-mono tracking-widest"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                SpaceBot-sourced leads — one at a time. Copy phone → dial → transcribe → promote.
                {areaCodeFilter.length === 3 && <span className="ml-1 text-primary font-medium">· Filtered by ({areaCodeFilter})</span>}
              </p>

              {!currentLead ? (
                <div className="text-center py-8">
                  <Phone className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1.5" />
                  <p className="text-xs text-muted-foreground">No cold leads in this category.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Single lead card */}
                  {(() => {
                    const lead = currentLead;
                    const meta = typeof lead.meta === 'object' ? lead.meta : {};
                    const noteTag = meta?.callback_at ? 'callback' : meta?.busy_until ? 'busy' : null;
                    const callbackLabel = meta?.callback_at ? `Call back: ${format(new Date(meta.callback_at), 'MMM d, h:mm a')}` : null;
                    return (
                      <div
                        className={cn(
                          "rounded-xl border bg-card p-4 space-y-3 transition-colors",
                          noteTag === 'busy' && "border-yellow-500/30",
                          noteTag === 'callback' && "border-blue-500/30",
                          !noteTag && "border-border"
                        )}
                        onDoubleClick={() => handleLeadDoubleClick(lead)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                            noteTag === 'busy' ? "bg-yellow-500/10" : noteTag === 'callback' ? "bg-blue-500/10" : "bg-muted"
                          )}>
                            <User className={cn("h-5 w-5", noteTag === 'busy' ? "text-yellow-600" : noteTag === 'callback' ? "text-blue-500" : "text-muted-foreground")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleLeadDoubleClick(lead)} className="text-base font-semibold text-primary hover:underline truncate cursor-pointer text-left">{lead.full_name}</button>
                              {noteTag === 'busy' && <Badge variant="outline" className="text-[9px] h-4 border-yellow-500/40 text-yellow-600">Busy (24h)</Badge>}
                              {noteTag === 'callback' && <Badge variant="outline" className="text-[9px] h-4 border-blue-500/40 text-blue-500">{callbackLabel}</Badge>}
                              {(typeof lead.meta === 'object' && lead.meta?.analyzed) && (
                                <Badge variant="outline" className="text-[9px] h-4 border-green-500/40 text-green-600 gap-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleSendReport(lead); }}>
                                  <Check className="h-2.5 w-2.5" /> Audited
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              {lead.company && <span>{lead.company}</span>}
                              {lead.source && <span>· via {lead.source}</span>}
                              {lead.category && <span>· {lead.category}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Phone / Email copy row */}
                        <div className="flex items-center gap-2">
                          {lead.phone ? (
                            <Button
                              variant="outline" size="sm"
                              className="h-8 text-xs gap-1.5 flex-1"
                              onClick={() => copyToClipboard(lead.phone, lead.full_name)}
                            >
                              <Copy className="h-3 w-3" />
                              {lead.phone}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic flex-1">No phone on file</span>
                          )}
                          {lead.email && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => copyToClipboard(lead.email, 'Email')}>
                              <Mail className="h-3 w-3" />
                              Copy Email
                            </Button>
                          )}
                        </div>

                        {/* Analyze result */}
                        {analyzeResult && analyzeResult.leadId === lead.id && (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5 text-primary" /> Audit Results
                            </p>
                            {analyzeResult.website && (
                              <a href={analyzeResult.website.startsWith('http') ? analyzeResult.website : `https://${analyzeResult.website}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" />
                                {analyzeResult.website}
                              </a>
                            )}
                            {analyzeResult.instagram && (
                              <a href={`https://instagram.com/${analyzeResult.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs text-primary hover:underline">
                                <Instagram className="h-3 w-3" />
                                @{analyzeResult.instagram.replace('@', '')}
                              </a>
                            )}
                            {analyzeResult.scores && (
                              <div className="flex items-center gap-3 pt-1">
                                <Badge variant="secondary" className="text-[10px]">Overall: {analyzeResult.scores.overall}/100</Badge>
                                <Badge variant="secondary" className="text-[10px]">Website: {analyzeResult.scores.website}</Badge>
                                <Badge variant="secondary" className="text-[10px]">Social: {analyzeResult.scores.social}</Badge>
                              </div>
                            )}
                            {analyzeResult.pdfUrl && (
                              <div className="flex items-center gap-2 pt-1">
                                <a href={analyzeResult.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                                  <Download className="h-3 w-3" /> View PDF
                                </a>
                                {lead.email && (
                                  <Button
                                    variant="outline" size="sm"
                                    className="h-6 text-[10px] gap-1"
                                    disabled={sendingReport || emailDraftLoading}
                                    onClick={() => handleSendReport(lead)}
                                  >
                                    {emailDraftLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                                    Send to {lead.full_name}
                                  </Button>
                                )}
                              </div>
                            )}
                            {!analyzeResult.website && !analyzeResult.instagram && (
                              <p className="text-xs text-muted-foreground">No Instagram or website found.</p>
                            )}
                          </div>
                        )}

                        {/* Previously analyzed — show resend option */}
                        {!analyzeResult && typeof lead.meta === 'object' && lead.meta?.analyzed && lead.meta?.audit_pdf_url && (
                          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-2">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                              <Check className="h-3.5 w-3.5 text-green-600" /> Previously Audited
                              <span className="text-muted-foreground text-[10px]">
                                {lead.meta.audit_date ? new Date(lead.meta.audit_date).toLocaleDateString() : ''}
                              </span>
                            </p>
                            <div className="flex items-center gap-2">
                              <a href={lead.meta.audit_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                                <Download className="h-3 w-3" /> View Report
                              </a>
                              {lead.email && (
                                <Button
                                  variant="outline" size="sm"
                                  className="h-6 text-[10px] gap-1"
                                  disabled={sendingReport || emailDraftLoading}
                                  onClick={() => handleSendReport(lead)}
                                >
                                  {emailDraftLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                                  Send Report
                                </Button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Status actions */}
                        <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                          <Button
                            variant="outline" size="sm" className="h-7 text-[11px] gap-1 flex-1"
                            onClick={() => handleLeadStatus(lead.id, lead.full_name, 'busy')}
                          >
                            <PhoneOff className="h-3 w-3 text-yellow-600" /> Busy
                          </Button>
                          <Button
                            variant="outline" size="sm" className="h-7 text-[11px] gap-1 flex-1"
                            onClick={() => handleLeadStatus(lead.id, lead.full_name, 'call_back')}
                          >
                            <Clock className="h-3 w-3 text-blue-500" /> Call Back
                          </Button>
                          <Button
                            variant="outline" size="sm" className="h-7 text-[11px] gap-1 flex-1 border-green-500/40 text-green-600 hover:bg-green-500/10"
                            onClick={() => { setInterestedLead({ id: lead.id, name: lead.full_name, category: lead.category, email: lead.email, phone: lead.phone }); setInterestedOpen(true); }}
                          >
                            <Star className="h-3 w-3" /> Interested
                          </Button>
                          <Button
                            variant="outline" size="sm" className="h-7 text-[11px] gap-1 flex-1"
                            onClick={() => handleLeadStatus(lead.id, lead.full_name, 'not_interested')}
                          >
                            <Ban className="h-3 w-3 text-destructive" /> Not Interested
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Next button */}
                  {filteredLeads.length > 1 && (
                    <Button variant="secondary" className="w-full gap-2" onClick={handleNextLead}>
                      <ChevronRight className="h-4 w-4" />
                      Next Lead (random)
                    </Button>
                  )}

                  <p className="text-[10px] text-muted-foreground text-center">
                    Double-click for full details · {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''} available
                  </p>
                </div>
              )}
            </div>

            {/* Upload Card */}
            <div className="glass-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <FileAudio className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Audio Transcription</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Drop audio files to transcribe. Files are archived to Google Drive and transcripts stored in CRM.
              </p>

              {/* Customer + Call Type + Category selects */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Customer</Label>
                    <button
                      type="button"
                      onClick={() => setNewCustOpen(true)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <UserPlus className="h-3 w-3" /> New
                    </button>
                  </div>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Call Type</Label>
                  <Select value={callType} onValueChange={(v) => setCallType(v as CallType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CALL_TYPES.map(ct => (
                        <SelectItem key={ct.value} value={ct.value}>
                          <span className="flex items-center gap-2">
                            <ct.icon className="h-3.5 w-3.5" />
                            {ct.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="flex items-center gap-2">
                            <cat.icon className="h-3.5 w-3.5" />
                            {cat.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
              >
                <Upload className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-foreground font-medium">Drag & drop audio files</p>
                <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A, OGG, FLAC, AAC, WebM</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.wma,.webm"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* File list */}
              {uploadFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted rounded-md px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileAudio className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
                      </div>
                      <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Transcribe button */}
              <Button
                onClick={handleTranscribe}
                disabled={transcribing || uploadFiles.length === 0 || !selectedCustomerId}
                className="w-full gap-2"
              >
                {transcribing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {uploadingToDrive ? 'Uploading to Drive...' : 'Transcribing...'}
                  </>
                ) : (
                  <>
                    <FileAudio className="h-4 w-4" />
                    Transcribe & Upload ({uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''})
                  </>
                )}
              </Button>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Results</h3>
                {results.map((r) => (
                  <div key={r.id} className={cn("glass-card p-4 space-y-2", r.success ? "" : "border-destructive/30")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {r.success ? <Check className="h-4 w-4 text-primary" /> : <X className="h-4 w-4 text-destructive" />}
                        <span className="text-sm font-medium text-foreground">{r.filename}</span>
                        {r.success && r.callType && getTypeBadge(r.callType)}
                      </div>
                      <div className="flex items-center gap-1">
                        {r.driveLink && (
                          <a href={r.driveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <FolderUp className="h-3 w-3" /> Drive
                          </a>
                        )}
                        {r.success && (
                          <button onClick={() => setExpandedResult(expandedResult === r.id ? null : r.id)} className="text-muted-foreground hover:text-foreground ml-2">
                            {expandedResult === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {r.success && r.summary && <p className="text-xs text-muted-foreground">{r.summary}</p>}
                    {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                    {expandedResult === r.id && r.transcript && (
                      <div className="mt-2 space-y-2">
                        <div className="bg-muted rounded-md p-3 max-h-[300px] overflow-y-auto">
                          <p className="text-sm text-foreground whitespace-pre-wrap">{r.transcript}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => copyTranscript(r.transcript)} className="gap-1.5">
                          <Copy className="h-3 w-3" /> Copy Transcript
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>

          {/* ─── Right Column: RingCentral Softphone ─── */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Phone className="h-5 w-5 text-primary" />
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="font-medium">Call Back #:</span>
                <span className="text-foreground">(702) 997-6750</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="font-medium">Cell:</span>
                <span className="text-foreground">(423) 465-1253</span>
                <button
                  onClick={() => setTeleprompterOpen(true)}
                  className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Open Teleprompter"
                >
                  <MonitorPlay className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="glass-card overflow-hidden rounded-xl">
              <iframe
                src={RC_EMBED_URL}
                title="RingCentral Softphone"
                className="w-full border-0"
                style={{ height: '600px' }}
                allow="microphone; autoplay"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            </div>

            {/* ─── Recent Transcriptions (grouped by customer) ─── */}
            <div className="space-y-4">
              <button
                onClick={() => setTranscriptionsOpen(!transcriptionsOpen)}
                className="w-full flex items-center justify-between glass-card px-4 py-3 hover:bg-muted/50 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Recent Transcriptions</h2>
                  {filteredTranscriptions.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{filteredTranscriptions.length}</Badge>
                  )}
                </div>
                {transcriptionsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {transcriptionsOpen && (
                <>
                  <div className="relative w-full">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by customer name..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      className="pl-9 h-9"
                    />
                  </div>
                  {loading ? (
                    <div className="glass-card p-8 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : filteredTranscriptions.length === 0 ? (
                    <div className="glass-card p-8 text-center">
                      <FileAudio className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {searchQuery ? 'No transcriptions match your search.' : 'No transcriptions yet.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paginatedGroups.map(([customerId, group]) => (
                        <div key={customerId} className="glass-card overflow-hidden">
                          <button
                            onClick={() => setExpandedCustomer(expandedCustomer === customerId ? null : customerId)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <User className="h-4 w-4 text-primary shrink-0" />
                              <span className="text-sm font-medium text-foreground truncate">{group.customer?.full_name}</span>
                              <Badge variant="secondary" className="text-[10px]">{group.items.length}</Badge>
                            </div>
                            {expandedCustomer === customerId ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          {expandedCustomer === customerId && (
                            <div className="border-t border-border divide-y divide-border">
                              {group.items.map((t) => (
                                <div key={t.id} className="px-4 py-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {getTypeBadge(t.source_type, t)}
                                      <span className="text-xs text-muted-foreground">
                                        {format(new Date(t.created_at), 'MMM d, yyyy h:mm a')}
                                      </span>
                                      {t.duration_seconds && (
                                        <span className="text-xs text-muted-foreground">
                                          · {Math.floor(t.duration_seconds / 60)}:{String(t.duration_seconds % 60).padStart(2, '0')}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {t.audio_url && (
                                        <Button
                                          variant="ghost" size="sm"
                                          className={cn("h-7 w-7 p-0", playingId === t.id ? "text-destructive hover:text-destructive" : "text-primary hover:text-primary")}
                                          onClick={(e) => { e.stopPropagation(); handlePlayAudio(t); }}
                                          disabled={downloadingId === t.id}
                                          title={playingId === t.id ? "Stop" : "Play audio"}
                                        >
                                          {downloadingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playingId === t.id ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="sm" onClick={() => copyTranscript(t.transcript)} className="h-7 w-7 p-0">
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                      <button onClick={() => setExpandedResult(expandedResult === t.id ? null : t.id)} className="text-muted-foreground hover:text-foreground p-1">
                                        {expandedResult === t.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                      </button>
                                    </div>
                                  </div>
                                  {t.summary && <p className="text-xs text-muted-foreground line-clamp-2">{t.summary}</p>}
                                  {expandedResult === t.id && (
                                    <div className="bg-muted rounded-md p-3 max-h-[200px] overflow-y-auto">
                                      <p className="text-sm text-foreground whitespace-pre-wrap">{t.transcript}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                          <p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</p>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 w-8 p-0">
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-8 w-8 p-0">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New Customer Dialog */}
      <Dialog open={newCustOpen} onOpenChange={setNewCustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} placeholder="Phone number" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={newCustEmail} onChange={e => setNewCustEmail(e.target.value)} placeholder="Email address" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCustOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCustomer} disabled={newCustSaving || !newCustName.trim()} className="gap-2">
              {newCustSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote to Prospect Dialog */}
      <AlertDialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push to Prospects?</AlertDialogTitle>
            <AlertDialogDescription>
              Transcription complete for <span className="font-semibold text-foreground">{promoteCustomerName}</span>. 
              Would you like to move them from Leads to Prospects?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPromoteOpen(false); setPromoteCustomerId(null); }}>
              No, keep as Lead
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePromoteToProspect} className="gap-1.5">
              <ArrowUpRight className="h-4 w-4" />
              Yes, push to Prospects
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lead Detail Dialog (double-click, editable) */}
      <Dialog open={leadDetailOpen} onOpenChange={setLeadDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Edit Lead
            </DialogTitle>
          </DialogHeader>
          {leadDetail && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={leadEditForm.full_name || ''} onChange={e => setLeadEditForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</Label>
                  <Input type="email" value={leadEditForm.email || ''} onChange={e => setLeadEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone</Label>
                  <Input value={leadEditForm.phone || ''} onChange={e => setLeadEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Company</Label>
                  <Input value={leadEditForm.company || ''} onChange={e => setLeadEditForm(f => ({ ...f, company: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Input value={leadEditForm.source || ''} onChange={e => setLeadEditForm(f => ({ ...f, source: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Address</Label>
                <Input value={leadEditForm.address || ''} onChange={e => setLeadEditForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Instagram className="h-3.5 w-3.5" /> Instagram Handle</Label>
                <Input value={leadEditForm.instagram_handle || ''} onChange={e => setLeadEditForm(f => ({ ...f, instagram_handle: e.target.value }))} placeholder="@username" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Tags</Label>
                <Input value={leadEditForm.tags || ''} onChange={e => setLeadEditForm(f => ({ ...f, tags: e.target.value }))} placeholder="Comma-separated" />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <textarea value={leadEditForm.notes || ''} onChange={e => setLeadEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes..." className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
              </div>

              {leadDetail.category && (
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                  <p className="text-sm text-foreground font-medium mt-0.5">{leadDetail.category}</p>
                </div>
              )}

              <div className="bg-muted rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Added</p>
                <p className="text-sm text-foreground font-medium mt-0.5">{format(new Date(leadDetail.created_at), 'MMM d, yyyy')}</p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setLeadDetailOpen(false); handleLeadStatus(leadDetail.id, leadDetail.full_name, 'not_interested'); }}>
                  <Ban className="h-3.5 w-3.5" /> Not Interested
                </Button>
                <Button className="gap-1.5" onClick={handleLeadDetailSave} disabled={leadSaving || !leadEditForm.full_name}>
                  {leadSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Lead Confirmation (Not Interested) */}
      <AlertDialog open={deleteLeadOpen} onOpenChange={setDeleteLeadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from CRM?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{deleteLeadName}</span> and all associated data (deals, invoices, threads, etc.) from the entire CRM. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingLead}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLead} disabled={deletingLead} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5">
              {deletingLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Yes, remove permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Call Back Scheduler */}
      <Dialog open={callBackOpen} onOpenChange={setCallBackOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-500" />
              Schedule Call Back
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            When should <span className="font-semibold text-foreground">{callBackLeadName}</span> reappear in the queue?
          </p>
          <div className="space-y-4">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={callBackDate}
                onSelect={setCallBackDate}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                className="p-3 pointer-events-auto"
              />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input
                type="time"
                value={callBackTime}
                onChange={e => setCallBackTime(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallBackOpen(false)}>Cancel</Button>
            <Button disabled={!callBackDate} onClick={handleConfirmCallBack} className="gap-1.5">
              <CalendarClock className="h-4 w-4" />
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interested Confirmation */}
      <AlertDialog open={interestedOpen} onOpenChange={setInterestedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Interested?</AlertDialogTitle>
            {!interestedLead?.email ? (
              <AlertDialogDescription className="space-y-2">
                <span className="flex items-center gap-2 text-amber-600 font-semibold">
                  <Mail className="h-4 w-4" /> Email Required
                </span>
                <span className="block"><span className="font-semibold text-foreground">{interestedLead?.name}</span> does not have an email address on file. Please ask the customer for their email before marking them as interested — it's needed for the automated audit & outreach pipeline.</span>
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription>
                Are you sure <span className="font-semibold text-foreground">{interestedLead?.name}</span> is interested? This will move their deal to <span className="font-semibold text-foreground">Qualified</span> and update their status to <span className="font-semibold text-foreground">Prospect</span>.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {interestedLead?.email ? (
              <AlertDialogAction
                className="bg-green-600 text-white hover:bg-green-700 gap-1.5"
                onClick={() => {
                  if (interestedLead) {
                    handleLeadInterested(interestedLead.id, interestedLead.name, interestedLead.category);
                  }
                  setInterestedOpen(false);
                  setInterestedLead(null);
                }}
              >
                <Star className="h-4 w-4" />
                Yes, mark Interested
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                className="bg-amber-600 text-white hover:bg-amber-700 gap-1.5"
                onClick={() => {
                  setInterestedOpen(false);
                  setInterestedLead(null);
                  const lead = leads.find(l => l.id === interestedLead?.id);
                  if (lead) {
                    setLeadDetail(lead);
                    setLeadEditForm({ full_name: lead.full_name || '', email: lead.email || '', phone: lead.phone || '', company: lead.company || '', address: lead.address || '', notes: lead.notes || '' });
                    setLeadDetailOpen(true);
                  }
                }}
              >
                <Mail className="h-4 w-4" />
                Add Email First
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Workflow Gate Dialog */}
      <Dialog open={workflowGateOpen} onOpenChange={(open) => { if (!open) { setWorkflowGateOpen(false); setWorkflowGateLead(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Outreach Workflow
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{workflowGateLead?.full_name}</span> has been marked as Interested. Choose which steps to run:
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors">
              <input type="checkbox" checked={workflowOpts.audit} onChange={e => setWorkflowOpts(prev => ({ ...prev, audit: e.target.checked, auditEmail: e.target.checked ? prev.auditEmail : false }))} className="h-4 w-4 rounded accent-primary" />
              <div className="flex-1">
                <span className="text-sm font-medium">🔍 Run Digital Audit</span>
                <p className="text-xs text-muted-foreground">Analyze website, social media & generate PDF report</p>
              </div>
            </label>
            <label className={cn("flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors", !workflowOpts.audit && "opacity-50 pointer-events-none")}>
              <input type="checkbox" checked={workflowOpts.auditEmail} disabled={!workflowOpts.audit} onChange={e => setWorkflowOpts(prev => ({ ...prev, auditEmail: e.target.checked }))} className="h-4 w-4 rounded accent-primary" />
              <div className="flex-1">
                <span className="text-sm font-medium">📧 Send Audit Report Email</span>
                <p className="text-xs text-muted-foreground">Email the PDF audit report to {workflowGateLead?.email || 'customer'}</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors">
              <input type="checkbox" checked={workflowOpts.meetingEmail} onChange={e => setWorkflowOpts(prev => ({ ...prev, meetingEmail: e.target.checked }))} className="h-4 w-4 rounded accent-primary" />
              <div className="flex-1">
                <span className="text-sm font-medium">📅 Send Meeting Invite Email</span>
                <p className="text-xs text-muted-foreground">Follow-up email with booking link</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors">
              <input type="checkbox" checked={workflowOpts.schedule} onChange={e => setWorkflowOpts(prev => ({ ...prev, schedule: e.target.checked }))} className="h-4 w-4 rounded accent-primary" />
              <div className="flex-1">
                <span className="text-sm font-medium">🗓️ Open Meeting Scheduler</span>
                <p className="text-xs text-muted-foreground">Schedule a meeting on the calendar now</p>
              </div>
            </label>
          </div>
          {!workflowGateLead?.email && (workflowOpts.audit || workflowOpts.auditEmail || workflowOpts.meetingEmail) && (
            <p className="text-xs text-amber-600 flex items-center gap-1"><Mail className="h-3 w-3" /> No email on file — email steps will be skipped.</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setWorkflowGateOpen(false); setWorkflowGateLead(null); }}>
              Skip All
            </Button>
            <Button onClick={executeWorkflow} disabled={workflowRunning} className="gap-1.5">
              <Zap className="h-4 w-4" />
              Run Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview Dialog */}
      <Dialog open={emailPreviewOpen} onOpenChange={setEmailPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Preview
            </DialogTitle>
          </DialogHeader>
          {emailDraft && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium">To:</span>
                <span>{emailDraft.to}</span>
                <span className="text-xs">({emailDraft.customer_name})</span>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Subject</Label>
                <Input
                  value={emailSubjectEdit}
                  onChange={(e) => setEmailSubjectEdit(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Email Body</Label>
                <div
                  className="border rounded-md p-4 min-h-[200px] bg-background text-sm prose prose-sm dark:prose-invert max-w-none [&_*]:text-foreground"
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: emailBodyEdit }}
                  onBlur={(e) => setEmailBodyEdit(e.currentTarget.innerHTML)}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEmailPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSendEmail}
              disabled={sendingReport}
              className="gap-2"
            >
              {sendingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Teleprompter open={teleprompterOpen} onOpenChange={setTeleprompterOpen} lead={currentLead} />
      <MeetingSchedulerModal
        open={meetingSchedulerOpen}
        onOpenChange={setMeetingSchedulerOpen}
        lead={meetingSchedulerLead}
        onBooked={(bookedMeetingType) => {
          loadData();
          if (bookedMeetingType === 'in_person') {
            skipMeetingEmailRef.current = true;
          }
        }}
      />
    </AppLayout>
  );
}
