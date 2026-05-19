import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mic, Square, Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { lightboxProps } from './ImageLightbox';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** ordered reference image sources (URLs or data URLs) */
  images: { url: string; label: string }[];
  /** called with the finalized cinematic prompt */
  onApply: (prompt: string) => void;
}

const fileToDataUrl = (f: File | Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(f);
  });

export function PromptGuideDialog({ open, onOpenChange, images, onApply }: Props) {
  const { toast } = useToast();
  const [intent, setIntent] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [finalPrompt, setFinalPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) {
      setIntent(''); setFinalPrompt(''); setCopied(false);
      setRecording(false); setTranscribing(false); setBuilding(false);
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    }
  }, [open]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        await transcribe(blob);
      };
      rec.start();
      setRecording(true);
    } catch (e: any) {
      toast({ title: 'Mic blocked', description: e?.message || 'Allow microphone access', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    try { mediaRecorderRef.current?.stop(); } catch {}
    setRecording(false);
  };

  const transcribe = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const dataUrl = await fileToDataUrl(blob);
      const base64 = dataUrl.split(',')[1] || '';
      const { data, error } = await supabase.functions.invoke('studio-prompt-guide', {
        body: { mode: 'transcribe', audio_base64: base64, audio_mime: blob.type || 'audio/webm' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const txt = String((data as any)?.transcript || '').trim();
      if (txt) setIntent(prev => prev ? `${prev}\n${txt}` : txt);
      else toast({ title: 'No speech detected' });
    } catch (e: any) {
      toast({ title: 'Transcription failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setTranscribing(false);
    }
  };

  const buildPrompt = async () => {
    if (!intent.trim() && images.length === 0) {
      toast({ title: 'Add an idea or a reference image first', variant: 'destructive' });
      return;
    }
    setBuilding(true);
    try {
      const { data, error } = await supabase.functions.invoke('studio-prompt-guide', {
        body: { mode: 'prompt', intent, images },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const out = String((data as any)?.prompt || '').trim();
      if (!out) throw new Error('Empty prompt');
      setFinalPrompt(out);
      try { await navigator.clipboard.writeText(out); setCopied(true); } catch {}
      onApply(out);
      toast({ title: 'Prompt ready', description: 'Inserted into prompt & copied to clipboard' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Failed to build prompt', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBuilding(false);
    }
  };

  const copyAgain = async () => {
    try { await navigator.clipboard.writeText(finalPrompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#00ff88]" /> Prompt Guide</DialogTitle>
          <DialogDescription>
            Describe what should happen in the shot — by voice or text. Reference your uploaded images as <span className="text-foreground">image 1, image 2, …</span> The AI will analyze the references and craft a cinematic Seedance prompt.
          </DialogDescription>
        </DialogHeader>

        {/* Reference thumbnails */}
        {images.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-muted-foreground">References ({images.length})</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <div key={i} className="relative shrink-0">
                  <img src={img.url} alt={img.label} className="h-14 w-14 object-cover rounded-md border border-border/50" {...lightboxProps(img.url, img.label)} />
                  <Badge variant="secondary" className="absolute -bottom-1 -right-1 text-[9px] px-1 py-0 h-4">img {i + 1}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Intent input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">Your idea</label>
            <div className="flex items-center gap-2">
              {transcribing && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> transcribing…</span>}
              {!recording ? (
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={startRecording} disabled={transcribing || building}>
                  <Mic className="w-3 h-3" /> Record
                </Button>
              ) : (
                <Button type="button" size="sm" variant="destructive" className="h-7 text-xs gap-1 animate-pulse" onClick={stopRecording}>
                  <Square className="w-3 h-3" /> Stop
                </Button>
              )}
            </div>
          </div>
          <Textarea
            value={intent}
            onChange={e => setIntent(e.target.value)}
            placeholder="e.g. First frame is image 2 — guy in the back of a taxi, realtor walks up to the car, opens the door. POV first-person hands visible as he gets out. She shakes his hand: 'Welcome to 10372 Hawks Wing — come on in.' They walk to image 4, she opens the gate, says 'Welcome to your dream home.' End at the front door."
            rows={6}
            className="text-sm"
            disabled={building}
          />
        </div>

        {/* Result */}
        {finalPrompt && (
          <div className="space-y-1.5 border-t border-border/40 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#00ff88]">Cinematic prompt (inserted above)</label>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={copyAgain}>
                {copied ? <Check className="w-3 h-3 text-[#00ff88]" /> : <Copy className="w-3 h-3" />} Copy
              </Button>
            </div>
            <div className="text-xs bg-background/50 border border-border/40 rounded-md p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">{finalPrompt}</div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button type="button" onClick={buildPrompt} disabled={building || transcribing} className="gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700">
            {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {building ? 'Analyzing…' : 'Generate cinematic prompt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
