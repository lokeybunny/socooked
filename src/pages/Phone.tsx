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
import { Phone, Upload, FileAudio, X, Loader2, Check, FolderUp, Copy, ChevronDown, ChevronUp, Voicemail, PhoneCall, User, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

  // Transcription upload state
  const [dragOver, setDragOver] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [callType, setCallType] = useState<CallType>('voicemail');
  const [transcribing, setTranscribing] = useState(false);
  const [uploadingToDrive, setUploadingToDrive] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New customer dialog state
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustSaving, setNewCustSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [custRes, transRes] = await Promise.all([
      supabase.from('customers').select('id, full_name, phone, email'),
      supabase.from('transcriptions').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    setCustomers(custRes.data || []);
    setTranscriptions(transRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Group transcriptions by customer
  const groupedTranscriptions = useMemo(() => {
    const groups: Record<string, { customer: any; items: any[] }> = {};
    const ungrouped: any[] = [];

    for (const t of transcriptions) {
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
  }, [transcriptions, customers]);

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

        // Upload original audio to Google Drive
        let driveResult = null;
        try {
          setUploadingToDrive(true);
          const folderRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/google-drive?action=ensure-folder`,
            {
              method: 'POST',
              headers: {
                'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ category: 'Transcriptions', customer_name: customerName }),
            }
          );
          const folderData = await folderRes.json();
          if (!folderRes.ok) throw new Error(folderData.error || 'Folder creation failed');

          const driveForm = new FormData();
          const typePrefix = callType === 'voicemail' ? 'VM' : 'CALL';
          const renamedFile = new File([file], `${dateStr}_${typePrefix}_${file.name}`, { type: file.type });
          driveForm.append('file', renamedFile);
          driveForm.append('folder_id', folderData.folder_id);

          const uploadRes = await fetch(
            `https://${projectId}.supabase.co/functions/v1/google-drive?action=upload`,
            {
              method: 'POST',
              headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
              body: driveForm,
            }
          );
          driveResult = await uploadRes.json();
          if (!uploadRes.ok) throw new Error(driveResult.error || 'Drive upload failed');
        } catch (driveErr: any) {
          console.error('Drive upload error:', driveErr);
        } finally {
          setUploadingToDrive(false);
        }

        newResults.push({
          id: transcribeData.transcription_id || file.name,
          filename: file.name,
          transcript: transcribeData.transcript,
          summary: transcribeData.summary,
          driveLink: driveResult?.webViewLink || null,
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
      }));
      setTranscriptions(prev => [...newTranscriptions, ...prev]);
      // Auto-expand the customer group to show the new transcription
      setExpandedCustomer(selectedCustomerId);
    }
  };

  const copyTranscript = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getTypeBadge = (sourceType: string) => {
    if (sourceType === 'voicemail') return <Badge variant="secondary" className="gap-1 text-[10px]"><Voicemail className="h-3 w-3" />Voicemail</Badge>;
    if (sourceType === 'live_call') return <Badge variant="outline" className="gap-1 text-[10px]"><PhoneCall className="h-3 w-3" />Live Call</Badge>;
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
          {/* ─── Left Column: Transcription Tool + Recent ─── */}
          <div className="space-y-6">
            {/* Upload Card */}
            <div className="glass-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <FileAudio className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Audio Transcription</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Drop audio files to transcribe. Files are archived to Google Drive and transcripts stored in CRM.
              </p>

              {/* Customer + Call Type selects */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* ─── Recent Transcriptions (grouped by customer) ─── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Recent Transcriptions</h2>
                {transcriptions.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">{transcriptions.length}</Badge>
                )}
              </div>
              {loading ? (
                <div className="glass-card p-8 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : transcriptions.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <FileAudio className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No transcriptions yet. Upload audio above to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {groupedTranscriptions.grouped.map(([customerId, group]) => (
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
                                  {getTypeBadge(t.source_type)}
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

                  {groupedTranscriptions.ungrouped.length > 0 && (
                    <div className="glass-card overflow-hidden">
                      <button
                        onClick={() => setExpandedCustomer(expandedCustomer === '__ungrouped' ? null : '__ungrouped')}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-muted-foreground">Unassigned</span>
                          <Badge variant="secondary" className="text-[10px]">{groupedTranscriptions.ungrouped.length}</Badge>
                        </div>
                        {expandedCustomer === '__ungrouped' ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {expandedCustomer === '__ungrouped' && (
                        <div className="border-t border-border divide-y divide-border">
                          {groupedTranscriptions.ungrouped.map((t) => (
                            <div key={t.id} className="px-4 py-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {getTypeBadge(t.source_type)}
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(t.created_at), 'MMM d, yyyy h:mm a')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
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
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ─── Right Column: RingCentral Softphone ─── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Softphone</h2>
            </div>
            <div className="glass-card overflow-hidden rounded-xl sticky top-4">
              <iframe
                src={RC_EMBED_URL}
                title="RingCentral Softphone"
                className="w-full border-0"
                style={{ height: '600px' }}
                allow="microphone; autoplay"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
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
    </AppLayout>
  );
}
