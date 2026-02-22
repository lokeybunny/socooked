import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import {
  Phone as PhoneIcon, Search, RefreshCw, ChevronRight,
  FileText, Clock, CheckCircle2, Loader2, PhoneIncoming,
  PhoneOutgoing, Upload, X, AudioLines, UserPlus, ArrowLeft
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Transcription {
  id: string;
  source_id: string;
  source_type: string;
  transcript: string;
  summary: string | null;
  phone_from: string | null;
  phone_to: string | null;
  direction: string | null;
  duration_seconds: number | null;
  occurred_at: string | null;
  created_at: string;
  customer_id: string | null;
}

interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
}

export default function PhonePage() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [selected, setSelected] = useState<Transcription | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Drag-drop state
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  useEffect(() => {
    loadTranscriptions();
  }, []);

  async function loadTranscriptions() {
    setLoading(true);
    const { data } = await supabase
      .from('transcriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setTranscriptions(data || []);
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-rc', {
        body: { action: 'sync' },
      });
      if (error) throw error;
      toast.success(`Synced ${data?.inserted ?? 0} new transcripts`);
      await loadTranscriptions();
    } catch (e: any) {
      toast.error(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  // ─── Drag & Drop ─────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Check if audio file
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|ogg|flac|aac|wma|webm)$/i)) {
      toast.error('Please drop an audio file (mp3, wav, m4a, etc.)');
      return;
    }

    setDroppedFile(file);

    // Load customers for the modal
    const { data } = await supabase
      .from('customers')
      .select('id, full_name, phone, email')
      .order('full_name');
    setCustomers(data || []);
    setSelectedCustomerId('');
    setShowCustomerModal(true);
  }, []);

  async function handleUploadAndTranscribe() {
    if (!droppedFile || !selectedCustomerId) return;

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return;

    setUploading(true);
    try {
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const phoneLabel = customer.phone || 'no-phone';

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Step 1: Ensure Google Drive folder: Transcriptions / [date] / [phone]
      setUploadStep('Creating Drive folder…');
      const folderRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/google-drive?action=ensure-folder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({ category: 'Transcriptions', customer_name: `${dateStr} — ${phoneLabel}` }),
        }
      );
      const folderData = await folderRes.json();
      if (!folderRes.ok) throw new Error(folderData.error || 'Folder creation failed');

      const folderId = folderData?.folder_id;
      if (!folderId) throw new Error('No folder ID returned');

      // Step 2: Upload audio to Google Drive
      setUploadStep('Uploading audio to Drive…');
      const formData = new FormData();
      formData.append('file', droppedFile);
      formData.append('folder_id', folderId);

      const uploadRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/google-drive?action=upload`,
        {
          method: 'POST',
          headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
          body: formData,
        }
      );
      const uploadResult = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadResult.error || 'Upload failed');

      const driveUrl = uploadResult?.webViewLink || uploadResult?.id || '';

      // Step 3: Transcribe audio
      setUploadStep('Transcribing audio…');
      const arrayBuffer = await droppedFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Convert to base64 in chunks
      let b64 = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        b64 += String.fromCharCode(...chunk);
      }
      b64 = btoa(b64);

      const { data: transcribeResult, error: transcribeErr } = await supabase.functions.invoke(
        'transcribe-audio',
        {
          body: {
            audio_base64: b64,
            file_name: droppedFile.name,
            customer_id: selectedCustomerId,
            phone_number: customer.phone,
            drive_url: driveUrl,
          },
        }
      );
      if (transcribeErr) throw new Error(transcribeErr.message || 'Transcription failed');

      toast.success('Audio uploaded & transcribed successfully');
      setShowCustomerModal(false);
      setDroppedFile(null);
      await loadTranscriptions();

      // Auto-select the new transcription
      if (transcribeResult?.transcription) {
        setSelected(transcribeResult.transcription);
      }
    } catch (e: any) {
      console.error('Upload flow error:', e);
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadStep('');
    }
  }

  const filtered = transcriptions.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.transcript?.toLowerCase().includes(q) ||
      t.summary?.toLowerCase().includes(q) ||
      t.phone_from?.includes(q) ||
      t.phone_to?.includes(q) ||
      t.source_type?.toLowerCase().includes(q)
    );
  });

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  function formatDuration(s: number | null) {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  return (
    <AppLayout>
      <div
        className="space-y-4 animate-fade-in relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 p-10 rounded-2xl border-2 border-dashed border-primary/40 bg-card">
              <AudioLines className="h-12 w-12 text-primary/60" />
              <p className="text-lg font-medium text-foreground">Drop audio file here</p>
              <p className="text-sm text-muted-foreground">MP3, WAV, M4A, OGG, FLAC</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Phone</h1>
            <p className="text-sm text-muted-foreground mt-1">Calls, SMS & voicemails via RingCentral.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Drag & drop audio to transcribe</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" style={{ height: 'calc(100vh - 210px)' }}>
          {/* Left: RingCentral Embeddable */}
          <div className="glass-card overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <PhoneIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">RingCentral</span>
            </div>
            <div className="flex-1">
              <iframe
                src="https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/app.html"
                width="100%"
                height="100%"
                allow="microphone; autoplay"
                style={{ border: 'none' }}
              />
            </div>
          </div>

          {/* Right: Transcript Panel */}
          <div className="glass-card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Transcripts</span>
                <span className="text-xs text-muted-foreground">({filtered.length})</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="gap-1.5"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync
              </Button>
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search transcripts…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Transcript List */}
              <div className={`${selected ? 'hidden sm:block sm:w-2/5 border-r border-border' : 'w-full'} overflow-y-auto`}>
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                    <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {search ? 'No matching transcripts' : 'No transcripts yet'}
                    </p>
                    {!search && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Drop an audio file or click Sync
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filtered.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelected(t)}
                        className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${
                          selected?.id === t.id ? 'bg-accent' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {t.source_type === 'audio_upload' ? (
                              <AudioLines className="h-3 w-3 text-primary" />
                            ) : t.direction === 'inbound' ? (
                              <PhoneIncoming className="h-3 w-3 text-info" />
                            ) : (
                              <PhoneOutgoing className="h-3 w-3 text-success" />
                            )}
                            <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                              {t.phone_from || t.source_type}
                            </span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {t.occurred_at
                            ? format(new Date(t.occurred_at), 'MMM d, h:mm a')
                            : format(new Date(t.created_at), 'MMM d, h:mm a')}
                          {t.duration_seconds && (
                            <span>· {formatDuration(t.duration_seconds)}</span>
                          )}
                        </div>
                        {t.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.summary}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Transcript Detail */}
              {selected && (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 space-y-4">
                    <button
                      onClick={() => setSelected(null)}
                      className="sm:hidden text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
                    >
                      ← Back
                    </button>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {selected.source_type === 'audio_upload' ? (
                          <AudioLines className="h-4 w-4 text-primary" />
                        ) : selected.direction === 'inbound' ? (
                          <PhoneIncoming className="h-4 w-4 text-info" />
                        ) : (
                          <PhoneOutgoing className="h-4 w-4 text-success" />
                        )}
                        <h3 className="text-base font-semibold text-foreground">
                          {selected.phone_from || 'Unknown'}
                        </h3>
                        <StatusBadge status={selected.source_type} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <p className="text-muted-foreground">From</p>
                          <p className="text-foreground font-medium">{selected.phone_from || '—'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">To</p>
                          <p className="text-foreground font-medium">{selected.phone_to || '—'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Date</p>
                          <p className="text-foreground font-medium">
                            {selected.occurred_at
                              ? format(new Date(selected.occurred_at), 'MMM d, yyyy · h:mm a')
                              : '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Duration</p>
                          <p className="text-foreground font-medium">{formatDuration(selected.duration_seconds)}</p>
                        </div>
                      </div>
                    </div>

                    {selected.source_type === 'audio_upload' && selected.source_id?.startsWith('http') && (
                      <a
                        href={selected.source_id}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <Upload className="h-3 w-3" />
                        View in Google Drive
                      </a>
                    )}

                    {selected.summary && (
                      <div className="glass-card p-3 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</p>
                        <p className="text-sm text-foreground leading-relaxed">{selected.summary}</p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transcript</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {selected.transcript}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!selected && filtered.length > 0 && (
                <div className="hidden sm:flex flex-1 items-center justify-center text-center px-6">
                  <div>
                    <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Select a transcript to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Selection Modal */}
      <Dialog open={showCustomerModal} onOpenChange={v => { if (!uploading) { setShowCustomerModal(v); if (!v) setDroppedFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AudioLines className="h-5 w-5 text-primary" />
              Transcribe Audio
            </DialogTitle>
            <DialogDescription>
              Select a customer to link this recording to. The audio will be stored in Google Drive and transcribed automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* File info */}
            {droppedFile && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <AudioLines className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{droppedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(droppedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              </div>
            )}

            {/* Customer search & select OR new customer form */}
            {showNewCustomer ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNewCustomer(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <Label className="text-sm font-medium">New Customer</Label>
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Full name *"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <Input
                    placeholder="Phone number"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={!newName.trim() || creatingCustomer}
                  onClick={async () => {
                    setCreatingCustomer(true);
                    try {
                      const { data, error } = await supabase
                        .from('customers')
                        .insert({
                          full_name: newName.trim(),
                          phone: newPhone.trim() || null,
                          email: newEmail.trim() || null,
                        })
                        .select('id, full_name, phone, email')
                        .single();
                      if (error) throw error;
                      setCustomers(prev => [data, ...prev]);
                      setSelectedCustomerId(data.id);
                      setShowNewCustomer(false);
                      setNewName('');
                      setNewPhone('');
                      setNewEmail('');
                      toast.success(`Created ${data.full_name}`);
                    } catch (e: any) {
                      toast.error(e.message || 'Failed to create customer');
                    } finally {
                      setCreatingCustomer(false);
                    }
                  }}
                >
                  {creatingCustomer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  Create & Select
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Customer</Label>
                  <button
                    onClick={() => setShowNewCustomer(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <UserPlus className="h-3 w-3" />
                    Add new
                  </button>
                </div>
                <Input
                  placeholder="Search customers…"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="h-9 text-sm"
                />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {filteredCustomers.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3 text-center">No customers found</p>
                  ) : (
                    filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCustomerId(c.id)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors ${
                          selectedCustomerId === c.id ? 'bg-accent' : ''
                        }`}
                      >
                        <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.phone || c.email || '—'}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Upload progress */}
            {uploading && uploadStep && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{uploadStep}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowCustomerModal(false); setDroppedFile(null); }}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUploadAndTranscribe}
                disabled={!selectedCustomerId || uploading}
                className="gap-1.5"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload & Transcribe
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
