import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Delete, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TwilioKeypadProps {
  defaultCaller?: string;
  prefilledNumber?: string;
  onCallComplete?: (sid: string, durationSec: number) => void;
}

const KEYS: { digit: string; letters: string }[] = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

function formatDisplay(num: string): string {
  const digits = num.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  // 11-digit (1xxxxxxxxxx)
  return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TwilioKeypad({
  defaultCaller,
  prefilledNumber,
  onCallComplete,
}: TwilioKeypadProps) {
  const [number, setNumber] = useState('');
  const [caller, setCaller] = useState(defaultCaller || (() => {
    try { return localStorage.getItem('twilio_caller_phone') || ''; } catch { return ''; }
  })());
  const [editingCaller, setEditingCaller] = useState(false);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<string>('');
  const [callDuration, setCallDuration] = useState(0);
  const [dialing, setDialing] = useState(false);
  const pollRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefilledNumber) setNumber(prefilledNumber.replace(/\D/g, ''));
  }, [prefilledNumber]);

  useEffect(() => {
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  const persistCaller = (v: string) => {
    setCaller(v);
    try { localStorage.setItem('twilio_caller_phone', v); } catch { /* noop */ }
  };

  const press = (d: string) => {
    if (callSid) return; // ignore during active call
    setNumber((n) => (n + d).slice(0, 15));
  };

  const backspace = () => {
    if (callSid) return;
    setNumber((n) => n.slice(0, -1));
  };

  const startPolling = (sid: string) => {
    startedAtRef.current = Date.now();
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const r = await fetch(`https://${projectId}.supabase.co/functions/v1/twilio-dial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ action: 'status', call_sid: sid }),
        });
        const data = await r.json();
        if (data?.ok) {
          setCallStatus(data.status);
          if (startedAtRef.current && ['in-progress', 'ringing', 'queued', 'initiated'].includes(data.status)) {
            setCallDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
          }
          if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(data.status)) {
            const dur = Number(data.duration || 0);
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            setCallSid(null);
            setCallDuration(0);
            startedAtRef.current = null;
            onCallComplete?.(sid, dur);
            toast(`Call ended (${data.status})`, { icon: '📵' });
          }
        }
      } catch (e) { /* swallow */ }
    }, 3000);
  };

  const dial = async () => {
    if (!number || number.length < 7) { toast.error('Enter a valid number'); return; }
    if (!caller || caller.replace(/\D/g, '').length < 10) {
      toast.error('Set your callback number first');
      setEditingCaller(true);
      return;
    }
    setDialing(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const r = await fetch(`https://${projectId}.supabase.co/functions/v1/twilio-dial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ action: 'dial', to: number, caller }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) { toast.error(data?.error || 'Dial failed'); return; }
      setCallSid(data.call_sid);
      setCallStatus(data.status || 'initiated');
      toast.success(`Ringing your phone… answer to connect`);
      startPolling(data.call_sid);
    } catch (e: any) {
      toast.error(e?.message || 'Dial failed');
    } finally {
      setDialing(false);
    }
  };

  const hangup = async () => {
    if (!callSid) return;
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      await fetch(`https://${projectId}.supabase.co/functions/v1/twilio-dial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ action: 'hangup', call_sid: callSid }),
      });
      toast('Hanging up…');
    } catch (e: any) {
      toast.error('Hangup failed');
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 flex flex-col items-center gap-5 w-full max-w-sm mx-auto">
      {/* Caller (your phone) */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <User className="h-3 w-3" /> Your callback #
          </Label>
          <button
            onClick={() => setEditingCaller((v) => !v)}
            className="text-[10px] text-primary hover:underline"
          >
            {editingCaller ? 'Done' : 'Edit'}
          </button>
        </div>
        {editingCaller ? (
          <Input
            value={caller}
            onChange={(e) => persistCaller(e.target.value)}
            placeholder="+1 (555) 555-5555"
            className="h-9 text-sm"
          />
        ) : (
          <div className="text-sm text-foreground/80">
            {caller ? formatDisplay(caller.replace(/\D/g, '')) : <span className="text-muted-foreground italic">Set your number to receive the call</span>}
          </div>
        )}
      </div>

      {/* Display */}
      <div className="w-full text-center">
        <div className="min-h-[3.5rem] text-3xl font-light tracking-wider text-foreground tabular-nums">
          {formatDisplay(number) || <span className="text-muted-foreground/40">Enter number</span>}
        </div>
        {callSid && (
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-xs text-muted-foreground capitalize">
              {callStatus} · {fmtDuration(callDuration)}
            </span>
          </div>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {KEYS.map((k) => (
          <button
            key={k.digit}
            onClick={() => press(k.digit)}
            disabled={!!callSid}
            className={cn(
              'aspect-square rounded-full bg-muted/50 hover:bg-muted active:bg-primary/20',
              'flex flex-col items-center justify-center transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'border border-border/50',
            )}
          >
            <span className="text-2xl font-medium text-foreground leading-none">{k.digit}</span>
            {k.letters && <span className="text-[9px] text-muted-foreground tracking-widest mt-0.5">{k.letters}</span>}
          </button>
        ))}
      </div>

      {/* Action row */}
      <div className="flex items-center justify-center gap-4 w-full">
        <button
          onClick={backspace}
          disabled={!number || !!callSid}
          className="w-11 h-11 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-30"
          title="Backspace"
        >
          <Delete className="h-5 w-5 text-muted-foreground" />
        </button>

        {callSid ? (
          <Button
            onClick={hangup}
            className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 shadow-lg"
          >
            <PhoneOff className="h-7 w-7" />
          </Button>
        ) : (
          <Button
            onClick={dial}
            disabled={dialing || !number}
            className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 shadow-lg disabled:opacity-50"
          >
            <Phone className="h-7 w-7" />
          </Button>
        )}

        <div className="w-11 h-11" />
      </div>

      <p className="text-[10px] text-muted-foreground text-center px-2">
        We'll ring your callback # first; answer to be bridged to the dialed number.
      </p>
    </div>
  );
}
