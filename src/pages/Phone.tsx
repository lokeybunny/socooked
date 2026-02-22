import { useEffect, useState, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Phone, Upload, FileAudio, X, Loader2, Check, FolderUp, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const RC_EMBEDDABLE_URL = 'https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/adapter.js';

export default function PhonePage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [transcriptions, setTranscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Transcription upload state
  const [dragOver, setDragOver] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [transcribing, setTranscribing] = useState(false);
  const [uploadingToDrive, setUploadingToDrive] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rcScriptRef = useRef<HTMLScriptElement | null>(null);

  // Load RingCentral Embeddable
  useEffect(() => {
    if (document.querySelector(`script[src="${RC_EMBEDDABLE_URL}"]`)) return;
    const script = document.createElement('script');
    script.src = RC_EMBEDDABLE_URL;
    script.async = true;
    document.body.appendChild(script);
    rcScriptRef.current = script;
    return () => {
      // Cleanup RC widget on unmount
      const widget = document.getElementById('rc-widget-adapter-frame');
      if (widget) widget.remove();
      if (rcScriptRef.current) {
        document.body.removeChild(rcScriptRef.current);
        rcScriptRef.current = null;
      }
    };
  }, []);

  const loadData = useCallback(async () => {
    const [custRes, transRes] = await Promise.all([
      supabase.from('customers').select('id, full_name, phone, email'),
      supabase.from('transcriptions').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setCustomers(custRes.data || []);
    setTranscriptions(transRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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
        // 1. Transcribe via AI
        const formData = new FormData();
        formData.append('audio', file);
        formData.append('customer_name', customerName);
        formData.append('customer_id', selectedCustomerId);

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

        // 2. Upload original audio to Google Drive
        let driveResult = null;
        try {
          setUploadingToDrive(true);
          // Ensure folder: Transcriptions / CustomerName
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

          // Upload the audio file
          const driveForm = new FormData();
          const renamedFile = new File([file], `${dateStr}_${file.name}`, { type: file.type });
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
          // Non-fatal - transcript was still saved
        } finally {
          setUploadingToDrive(false);
        }

        newResults.push({
          id: transcribeData.transcription_id || file.name,
          filename: file.name,
          transcript: transcribeData.transcript,
          summary: transcribeData.summary,
          driveLink: driveResult?.webViewLink || null,
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
    loadData(); // Refresh transcriptions list
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

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Phone</h1>
          <p className="text-muted-foreground mt-1">RingCentral softphone + audio transcription tool.</p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ─── Left: Transcription Tool ─── */}
          <div className="space-y-6">
            <div className="glass-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <FileAudio className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Audio Transcription</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Drop audio files to transcribe. Files are saved to Google Drive under Transcriptions / [Customer Name] and the transcript is stored in the CRM.
              </p>

              {/* Customer select */}
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-foreground font-medium">Drag & drop audio files here</p>
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
                        {r.success ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-destructive" />}
                        <span className="text-sm font-medium text-foreground">{r.filename}</span>
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

          {/* ─── Right: Recent Transcriptions ─── */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Recent Transcriptions</h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : transcriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No transcriptions yet.</p>
            ) : (
              <div className="space-y-2">
                {transcriptions.map((t) => {
                  const customer = customers.find(c => c.id === t.customer_id);
                  return (
                    <div key={t.id} className="glass-card p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {customer?.full_name || 'Unknown Customer'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t.source_type} · {format(new Date(t.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
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
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
