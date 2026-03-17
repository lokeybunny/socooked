import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Send, Loader2, ChevronUp, ChevronDown, CheckCircle2, XCircle, HelpCircle, Paperclip, X, Image, Film, Music } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { uploadToStorage } from '@/lib/storage';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

const NYSONBLACK_CUSTOMER_ID = '42be9e81-3b78-4d28-9a25-3b01ba466948';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,audio/mpeg,audio/mp3,audio/wav';

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'info';
  text: string;
  timestamp: Date;
}

interface UploadedAsset {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  contentAssetId?: string;
}

interface SMMTerminalProps {
  profileUsername: string;
}

function detectAssetType(mime: string): 'image' | 'video' | 'audio' {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'image';
}

export default function SMMTerminal({ profileUsername }: SMMTerminalProps) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<UploadedAsset[]>([]);
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: '0', type: 'info', text: '⚡ SMM Scheduler ready. Attach files (📎) or type a command.', timestamp: new Date() },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const addLine = useCallback((type: TerminalLine['type'], text: string) => {
    setLines(prev => [...prev, { id: crypto.randomUUID(), type, text, timestamp: new Date() }]);
  }, []);

  // ─── Upload files to storage + save as content_assets ───
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading(true);
    const newAssets: UploadedAsset[] = [];

    for (const file of files) {
      const assetType = detectAssetType(file.type);
      try {
        // Upload to storage
        const url = await uploadToStorage(file, {
          category: 'ai-generated',
          customerName: 'NysonBlack',
          source: 'smm-terminal',
          fileName: file.name,
        });

        // Save to content_assets as AI Generated
        const { data: caData, error: caError } = await supabase.from('content_assets').insert({
          title: file.name,
          type: assetType,
          url,
          status: 'ready',
          category: 'ai-generated',
          source: 'smm-terminal',
          customer_id: NYSONBLACK_CUSTOMER_ID,
          tags: ['smm', profileUsername],
        }).select('id').single();

        if (caError) throw caError;

        newAssets.push({
          id: crypto.randomUUID(),
          name: file.name,
          url,
          type: assetType,
          contentAssetId: caData?.id,
        });
      } catch (err: any) {
        addLine('error', `✗ Upload failed: ${file.name} — ${err.message}`);
      }
    }

    if (newAssets.length > 0) {
      setPendingFiles(prev => [...prev, ...newAssets]);
      addLine('success', `✓ ${newAssets.length} file${newAssets.length > 1 ? 's' : ''} uploaded & saved to content library`);
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }, [addLine, profileUsername]);

  const removePendingFile = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  // ─── Submit command (with optional attached files) ───
  const handleSubmit = useCallback(async () => {
    const cmd = input.trim();
    const hasFiles = pendingFiles.length > 0;
    if ((!cmd && !hasFiles) || loading) return;

    // Build the prompt
    let prompt = cmd;
    if (hasFiles && !cmd) {
      // Auto-generate scheduling prompt for bulk uploads
      prompt = `Schedule these ${pendingFiles.length} uploaded media files across the next ${Math.max(pendingFiles.length, 7)} days as drafts for review. Organize them by type (images first, then videos). Space them evenly.`;
    }

    const fileContext = hasFiles
      ? `\n\n[ATTACHED_MEDIA: ${pendingFiles.map(f => `${f.type}:${f.url}`).join(', ')}]`
      : '';

    addLine('input', `> ${cmd || `[${pendingFiles.length} files attached — auto-scheduling]`}`);
    if (hasFiles) {
      addLine('info', `📎 ${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}: ${pendingFiles.map(f => f.name).join(', ')}`);
    }
    setInput('');
    const filesToSend = [...pendingFiles];
    setPendingFiles([]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('smm-scheduler', {
        body: {
          prompt: prompt + fileContext,
          profile: profileUsername,
          attached_media: filesToSend.map(f => ({
            url: f.url,
            type: f.type,
            name: f.name,
            content_asset_id: f.contentAssetId,
          })),
        },
      });

      if (error) {
        addLine('error', `✗ ${error.message}`);
        setLoading(false);
        return;
      }

      if (data?.type === 'clarify') {
        addLine('info', `? ${data.message}`);
      } else if (data?.type === 'executed') {
        for (const action of data.actions || []) {
          if (action.success) {
            addLine('success', `✓ ${action.description}`);
            if (action.data) {
              const preview = formatResult(action.data);
              if (preview) addLine('output', preview);
            }
          } else {
            addLine('error', `✗ ${action.description}: ${action.error}`);
          }
        }
      } else if (data?.type === 'message') {
        addLine('output', data.message);
      } else {
        addLine('output', JSON.stringify(data, null, 2));
      }
    } catch (e: any) {
      addLine('error', `✗ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [input, loading, profileUsername, addLine, pendingFiles]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const fileIcon = (type: string) => {
    if (type === 'video') return <Film className="h-3 w-3" />;
    if (type === 'audio') return <Music className="h-3 w-3" />;
    return <Image className="h-3 w-3" />;
  };

  return (
    <div className={cn(
      'border-t border-border/50 bg-[hsl(var(--card))] transition-all duration-300 mt-6',
      expanded ? 'min-h-[18rem]' : '',
    )}>
      {/* Header bar — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full h-12 flex items-center gap-2 px-4 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <Terminal className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold text-foreground/80">SMM Scheduler</span>
        <span className="opacity-50">—</span>
        <span className="opacity-60 truncate">prompt-driven control · {profileUsername}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {uploading && <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />}
          {loading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          {pendingFiles.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {pendingFiles.length} 📎
            </Badge>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* Terminal body */}
      {expanded && (
        <div className="flex flex-col h-[calc(100%-3rem)]">
          {/* Log output */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs space-y-0.5 max-h-60">
            {lines.map(line => (
              <div key={line.id} className={cn(
                'leading-5 whitespace-pre-wrap break-all',
                line.type === 'input' && 'text-primary font-medium',
                line.type === 'output' && 'text-muted-foreground',
                line.type === 'error' && 'text-destructive',
                line.type === 'success' && 'text-primary',
                line.type === 'info' && 'text-muted-foreground/70 italic',
              )}>
                {line.type === 'success' && <CheckCircle2 className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {line.type === 'error' && <XCircle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {line.type === 'info' && <HelpCircle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {line.text}
              </div>
            ))}
            {loading && (
              <div className="text-muted-foreground/50 animate-pulse">processing…</div>
            )}
          </div>

          {/* Pending files strip */}
          {pendingFiles.length > 0 && (
            <div className="px-4 py-1.5 border-t border-border/20 flex flex-wrap gap-1.5">
              {pendingFiles.map(f => (
                <Badge key={f.id} variant="outline" className="text-[10px] gap-1 py-0.5 pr-1">
                  {fileIcon(f.type)}
                  <span className="max-w-[100px] truncate">{f.name}</span>
                  <button onClick={() => removePendingFile(f.id)} className="hover:text-destructive ml-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border/30">
            {/* File attach button */}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
              title="Attach files (images, videos, audio)"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            </button>

            <span className="text-primary font-mono text-xs font-bold">›</span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingFiles.length > 0 ? 'Add instructions or hit enter to auto-schedule…' : 'schedule a post tomorrow at 3pm on IG and X…'}
              className="flex-1 bg-transparent text-foreground font-mono text-xs outline-none placeholder:text-muted-foreground/40"
              disabled={loading}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || (!input.trim() && pendingFiles.length === 0)}
              className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatResult(data: any): string {
  if (!data || typeof data !== 'object') return '';
  const parts: string[] = [];
  if (data.request_id) parts.push(`request: ${data.request_id}`);
  if (data.job_id) parts.push(`job: ${data.job_id}`);
  if (data.status) parts.push(`status: ${data.status}`);
  if (data.scheduled_posts?.length !== undefined) parts.push(`${data.scheduled_posts.length} scheduled`);
  if (data.history?.length !== undefined) parts.push(`${data.history.length} entries`);
  if (data.message) parts.push(data.message);
  return parts.length ? `  → ${parts.join(' · ')}` : '';
}
