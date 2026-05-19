import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  currentPrompt: string;
  onPromptUpdated: (newPrompt: string, transcript: string) => void;
}

export function PromptVoiceEditButton({ currentPrompt, onPromptUpdated }: Props) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (blob.size < 500) {
          toast({ title: 'No audio captured', description: 'Tap the mic and speak for a moment.', variant: 'destructive' });
          return;
        }
        await send(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      toast({ title: 'Mic blocked', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const send = async (blob: Blob) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('audio', blob, 'edit.webm');
      form.append('currentPrompt', currentPrompt);
      const { data, error } = await supabase.functions.invoke('prompt-voice-edit', { body: form });
      if (error) throw error;
      const d = data as { transcript?: string; newPrompt?: string; error?: string };
      if (d?.error || !d?.newPrompt) throw new Error(d?.error || 'No prompt returned');
      onPromptUpdated(d.newPrompt, d.transcript || '');
      toast({
        title: 'Prompt updated by voice',
        description: d.transcript ? `Heard: "${d.transcript.slice(0, 120)}${d.transcript.length > 120 ? '…' : ''}"` : undefined,
      });
    } catch (e) {
      toast({ title: 'Voice edit failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <Button variant="ghost" size="sm" disabled className="h-7 text-xs gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Editing…
      </Button>
    );
  }
  if (recording) {
    return (
      <Button variant="ghost" size="sm" onClick={stop} className="h-7 text-xs gap-1 text-red-400 hover:text-red-300">
        <Square className="w-3 h-3 fill-current" /> Stop & Apply
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="sm" onClick={start} className="h-7 text-xs gap-1" title="Speak edits — AI rewrites the prompt while keeping intent">
      <Mic className="w-3 h-3" /> Edit by Voice
    </Button>
  );
}
