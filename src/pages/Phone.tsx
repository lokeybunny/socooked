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
import { Phone, Upload, FileAudio, X, Loader2, Check, FolderUp, Copy, ChevronDown, ChevronUp, Voicemail, PhoneCall, User, UserPlus, Search, ChevronLeft, ChevronRight, Play, Square, Download, ArrowUpRight, Zap, PhoneOff, Clock, Ban, Info, MapPin, Mail, Building2, Tag, Star } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SERVICE_CATEGORIES } from '@/components/CategoryGate';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [transcriptionsOpen, setTranscriptionsOpen] = useState(false);

  // Promote to prospect dialog
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteCustomerId, setPromoteCustomerId] = useState<string | null>(null);
  const [promoteCustomerName, setPromoteCustomerName] = useState('');

  // Lead detail popup
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [leadDetail, setLeadDetail] = useState<any>(null);
  const [leadDetailLoading, setLeadDetailLoading] = useState(false);

  // Not interested confirmation
  const [deleteLeadOpen, setDeleteLeadOpen] = useState(false);
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [deleteLeadName, setDeleteLeadName] = useState('');
  const [deletingLead, setDeletingLead] = useState(false);

  // Interested confirmation
  const [interestedOpen, setInterestedOpen] = useState(false);
  const [interestedLead, setInterestedLead] = useState<{ id: string; name: string; category: string | null } | null>(null);

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
    setLeadDetailOpen(true);
  };

  const handleLeadStatus = async (leadId: string, leadName: string, action: 'busy' | 'not_interested' | 'call_back') => {
    if (action === 'not_interested') {
      setDeleteLeadId(leadId);
      setDeleteLeadName(leadName);
      setDeleteLeadOpen(true);
      return;
    }
    let newNotes = '';
    if (action === 'busy') {
      newNotes = `[BUSY] ${new Date().toLocaleDateString()} — Will try again`;
      toast('Marked as Busy — will show up for callback', { icon: '📞' });
    }
    if (action === 'call_back') {
      newNotes = `[CALL BACK] ${new Date().toLocaleDateString()}`;
      toast('Marked for Call Back', { icon: '🔁' });
    }
    await supabase.from('customers').update({ notes: newNotes } as any).eq('id', leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, notes: newNotes } : l));
  };

  const handleLeadInterested = async (leadId: string, leadName: string, leadCategory: string | null) => {
    // Find existing deal for this customer, or it was auto-created by the trigger
    const { data: existingDeal } = await supabase
      .from('deals')
      .select('id')
      .eq('customer_id', leadId)
      .limit(1)
      .maybeSingle();

    if (existingDeal) {
      // Update existing deal to qualified
      await supabase.from('deals').update({ stage: 'qualified' }).eq('id', existingDeal.id);
      // Log stage transition
      await supabase.from('activity_log').insert({
        entity_type: 'deal',
        entity_id: existingDeal.id,
        action: 'updated',
        meta: { title: `${leadName}`, customer_name: leadName, from_stage: 'new', to_stage: 'qualified' },
      });
    } else {
      // Create a new deal at qualified stage
      const catLabel = SERVICE_CATEGORIES.find(c => c.id === (leadCategory || 'other'))?.label || 'Other';
      const { data: newDeal } = await supabase.from('deals').insert({
        title: `${leadName} — ${catLabel}`,
        customer_id: leadId,
        category: leadCategory || 'other',
        stage: 'qualified',
        status: 'open',
        pipeline: 'default',
        deal_value: 0,
        probability: 30,
      }).select('id').single();
      if (newDeal) {
        await supabase.from('activity_log').insert({
          entity_type: 'deal',
          entity_id: newDeal.id,
          action: 'updated',
          meta: { title: `${leadName} — ${catLabel}`, customer_name: leadName, from_stage: 'new', to_stage: 'qualified' },
        });
      }
    }

    // Also update customer status to prospect
    await supabase.from('customers').update({ status: 'prospect' }).eq('id', leadId);
    setLeads(prev => prev.filter(l => l.id !== leadId));
    toast.success(`${leadName} marked as Interested — moved to Qualified`);
  };

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
    ]);
    const { error } = await supabase.from('customers').delete().eq('id', deleteLeadId);
    if (error) { toast.error('Failed to remove lead'); setDeletingLead(false); return; }
    setLeads(prev => prev.filter(l => l.id !== deleteLeadId));
    setCustomers(prev => prev.filter(c => c.id !== deleteLeadId));
    toast.success(`${deleteLeadName} removed from CRM`);
    setDeleteLeadOpen(false);
    setDeleteLeadId(null);
    setDeleteLeadName('');
    setDeletingLead(false);
  };

  const filteredLeads = useMemo(() => {
    if (leadsCategoryFilter === 'all') return leads;
    return leads.filter(l => (l.category || 'other') === leadsCategoryFilter);
  }, [leads, leadsCategoryFilter]);

  const currentLead = filteredLeads.length > 0 ? filteredLeads[currentLeadIndex % filteredLeads.length] : null;

  const handleNextLead = () => {
    if (filteredLeads.length <= 1) return;
    const randomOffset = Math.floor(Math.random() * (filteredLeads.length - 1)) + 1;
    setCurrentLeadIndex(prev => (prev + randomOffset) % filteredLeads.length);
  };

  // Filter transcriptions by search query
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
          <p className="text-muted-foreground mt-1">RingCentral + audio transcription workspace.</p>
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
                <div className="w-44">
                  <Select value={leadsCategoryFilter} onValueChange={v => { setLeadsCategoryFilter(v); setCurrentLeadIndex(0); }}>
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
              </div>
              <p className="text-xs text-muted-foreground">
                SpaceBot-sourced leads — one at a time. Copy phone → dial → transcribe → promote.
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
                    const noteTag = lead.notes?.startsWith('[BUSY]') ? 'busy' : lead.notes?.startsWith('[CALL BACK]') ? 'callback' : null;
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
                              {noteTag === 'busy' && <Badge variant="outline" className="text-[9px] h-4 border-yellow-500/40 text-yellow-600">Busy</Badge>}
                              {noteTag === 'callback' && <Badge variant="outline" className="text-[9px] h-4 border-blue-500/40 text-blue-500">Call Back</Badge>}
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
                            onClick={() => { setInterestedLead({ id: lead.id, name: lead.full_name, category: lead.category }); setInterestedOpen(true); }}
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

          {/* ─── Right Column: Phone Embeds ─── */}
          <div className="space-y-4">
            <Tabs defaultValue="ringcentral" className="w-full">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-5 w-5 text-primary" />
                <TabsList>
                  <TabsTrigger value="ringcentral">RingCentral</TabsTrigger>
                  <TabsTrigger value="gvoice">GVoice</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="ringcentral">
                <div className="glass-card overflow-hidden rounded-xl">
                  <iframe
                    src={RC_EMBED_URL}
                    title="RingCentral"
                    className="w-full border-0"
                    style={{ height: '600px' }}
                    allow="microphone; autoplay"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
              </TabsContent>
              <TabsContent value="gvoice">
                <div className="glass-card overflow-hidden rounded-xl">
                  <iframe
                    src="https://voice.google.com"
                    title="Google Voice"
                    className="w-full border-0"
                    style={{ height: '600px' }}
                    allow="microphone; autoplay"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
              </TabsContent>
            </Tabs>

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

      {/* Lead Detail Dialog (double-click) */}
      <Dialog open={leadDetailOpen} onOpenChange={setLeadDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Lead Details
            </DialogTitle>
          </DialogHeader>
          {leadDetail && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{leadDetail.full_name}</h3>
                  {leadDetail.company && <p className="text-sm text-muted-foreground">{leadDetail.company}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {leadDetail.phone && (
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p>
                      <p className="text-sm text-foreground font-medium truncate">{leadDetail.phone}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto shrink-0" onClick={() => copyToClipboard(leadDetail.phone, 'Phone')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {leadDetail.email && (
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</p>
                      <p className="text-sm text-foreground font-medium truncate">{leadDetail.email}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto shrink-0" onClick={() => copyToClipboard(leadDetail.email, 'Email')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {leadDetail.address && (
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Address</p>
                      <p className="text-sm text-foreground truncate">{leadDetail.address}</p>
                    </div>
                  </div>
                )}
                {leadDetail.instagram_handle && (
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Instagram</p>
                      <p className="text-sm text-foreground truncate">@{leadDetail.instagram_handle}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {leadDetail.source && (
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</p>
                    <p className="text-foreground font-medium mt-0.5">{leadDetail.source}</p>
                  </div>
                )}
                {leadDetail.category && (
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                    <p className="text-foreground font-medium mt-0.5">{leadDetail.category}</p>
                  </div>
                )}
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Added</p>
                  <p className="text-foreground font-medium mt-0.5">{format(new Date(leadDetail.created_at), 'MMM d, yyyy')}</p>
                </div>
                {leadDetail.tags?.length > 0 && (
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tags</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {leadDetail.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-[9px] h-4">{t}</Badge>)}
                    </div>
                  </div>
                )}
              </div>

              {leadDetail.notes && (
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{leadDetail.notes}</p>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                {leadDetail.phone && (
                  <Button variant="outline" className="gap-1.5" onClick={() => { copyToClipboard(leadDetail.phone, leadDetail.full_name); setLeadDetailOpen(false); }}>
                    <Copy className="h-3.5 w-3.5" /> Copy Phone & Dial
                  </Button>
                )}
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setLeadDetailOpen(false); handleLeadStatus(leadDetail.id, leadDetail.full_name, 'not_interested'); }}>
                  <Ban className="h-3.5 w-3.5" /> Not Interested
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

      {/* Interested Confirmation */}
      <AlertDialog open={interestedOpen} onOpenChange={setInterestedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Interested?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure <span className="font-semibold text-foreground">{interestedLead?.name}</span> is interested? This will move their deal to <span className="font-semibold text-foreground">Qualified</span> and update their status to <span className="font-semibold text-foreground">Prospect</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
