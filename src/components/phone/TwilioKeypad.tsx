import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Delete, Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Device, type Call } from '@twilio/voice-sdk';

interface TwilioKeypadProps {
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
  return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TwilioKeypad({ prefilledNumber, onCallComplete }: TwilioKeypadProps) {
  const [number, setNumber] = useState('');
  const [device, setDevice] = useState<Device | null>(null);
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [callStatus, setCallStatus] = useState<string>('');
  const [callDuration, setCallDuration] = useState(0);
  const [dialing, setDialing] = useState(false);
  const [muted, setMuted] = useState(false);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefilledNumber) setNumber(prefilledNumber.replace(/\D/g, ''));
  }, [prefilledNumber]);

  // Initialize Twilio Device on mount
  useEffect(() => {
    let mounted = true;
    let dev: Device | null = null;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('twilio-voice-token', {
          body: { identity: 'browser-user' },
        });
        if (error) throw new Error(error.message);
        if (!data?.token) throw new Error(data?.error || 'No token returned');
        if (!mounted) return;

        dev = new Device(data.token, {
          codecPreferences: ['opus', 'pcmu'] as any,
          logLevel: 'silent' as any,
        });

        dev.on('registered', () => {
          if (!mounted) return;
          setDeviceReady(true);
          setDeviceError(null);
        });
        dev.on('error', (err: any) => {
          console.error('[TwilioDevice] error', err);
          if (!mounted) return;
          setDeviceError(err?.message || 'Voice device error');
        });
        dev.on('tokenWillExpire', async () => {
          try {
            const { data: refresh } = await supabase.functions.invoke('twilio-voice-token', {
              body: { identity: 'browser-user' },
            });
            if (refresh?.token) dev?.updateToken(refresh.token);
          } catch (e) {
            console.error('[TwilioDevice] token refresh failed', e);
          }
        });

        await dev.register();
        if (mounted) setDevice(dev);
      } catch (err: any) {
        console.error('[TwilioDevice] init failed', err);
        if (mounted) setDeviceError(err?.message || 'Failed to init device');
      }
    })();

    return () => {
      mounted = false;
      if (tickRef.current) window.clearInterval(tickRef.current);
      try { dev?.disconnectAll(); } catch {}
      try { dev?.destroy(); } catch {}
    };
  }, []);

  const stopTimer = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    startedAtRef.current = null;
  }, []);

  const press = (d: string) => {
    if (activeCall) {
      // Send DTMF during active call
      try { activeCall.sendDigits(d); } catch {}
      return;
    }
    setNumber((n) => (n + d).slice(0, 15));
  };

  const backspace = () => {
    if (activeCall) return;
    setNumber((n) => n.slice(0, -1));
  };

  const dial = async () => {
    if (!number || number.length < 7) { toast.error('Enter a valid number'); return; }
    if (!device || !deviceReady) {
      toast.error(deviceError || 'Voice device not ready yet');
      return;
    }

    // Request mic permission proactively (browsers gate getUserMedia)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('Microphone access denied');
      return;
    }

    setDialing(true);
    try {
      const digits = number.replace(/\D/g, '');
      const e164 = digits.length === 10 ? `+1${digits}` : digits.startsWith('1') ? `+${digits}` : `+${digits}`;
      const call = await device.connect({ params: { To: e164 } });

      setActiveCall(call);
      setCallStatus('connecting');
      setMuted(false);

      call.on('accept', () => {
        setCallStatus('in-progress');
        startedAtRef.current = Date.now();
        if (tickRef.current) window.clearInterval(tickRef.current);
        tickRef.current = window.setInterval(() => {
          if (startedAtRef.current) setCallDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }, 1000);
      });
      call.on('ringing', () => setCallStatus('ringing'));
      call.on('disconnect', () => {
        const dur = startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0;
        const sid = (call as any).parameters?.CallSid || '';
        stopTimer();
        setActiveCall(null);
        setCallStatus('');
        setCallDuration(0);
        setMuted(false);
        onCallComplete?.(sid, dur);
        toast('Call ended', { icon: '📵' });
      });
      call.on('cancel', () => {
        stopTimer();
        setActiveCall(null);
        setCallStatus('');
        setCallDuration(0);
      });
      call.on('error', (e: any) => {
        console.error('[TwilioCall] error', e);
        toast.error(e?.message || 'Call error');
        stopTimer();
        setActiveCall(null);
        setCallStatus('');
      });
    } catch (e: any) {
      toast.error(e?.message || 'Dial failed');
    } finally {
      setDialing(false);
    }
  };

  const hangup = () => {
    if (!activeCall) return;
    try { activeCall.disconnect(); } catch {}
  };

  const toggleMute = () => {
    if (!activeCall) return;
    const next = !muted;
    try { activeCall.mute(next); setMuted(next); } catch {}
  };

  return (
    <div className="glass-card rounded-2xl p-6 flex flex-col items-center gap-5 w-full max-w-sm mx-auto">
      {/* Status bar */}
      <div className="w-full flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'h-2 w-2 rounded-full',
            deviceReady ? 'bg-green-500' : deviceError ? 'bg-destructive' : 'bg-yellow-500 animate-pulse',
          )} />
          <span className="text-muted-foreground">
            {deviceReady ? 'Mic ready' : deviceError ? 'Offline' : 'Connecting…'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Volume2 className="h-3 w-3" />
          <span>Browser call</span>
        </div>
      </div>

      {/* Display */}
      <div className="w-full text-center">
        <div className="min-h-[3.5rem] text-3xl font-light tracking-wider text-foreground tabular-nums">
          {formatDisplay(number) || <span className="text-muted-foreground/40">Enter number</span>}
        </div>
        {activeCall && (
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
        {deviceError && !activeCall && (
          <div className="mt-1 text-[10px] text-destructive">{deviceError}</div>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {KEYS.map((k) => (
          <button
            key={k.digit}
            onClick={() => press(k.digit)}
            className={cn(
              'aspect-square rounded-full bg-muted/50 hover:bg-muted active:bg-primary/20',
              'flex flex-col items-center justify-center transition-colors',
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
        {activeCall ? (
          <button
            onClick={toggleMute}
            className={cn(
              'w-11 h-11 rounded-full flex items-center justify-center transition-colors',
              muted ? 'bg-destructive/20 text-destructive' : 'hover:bg-muted text-muted-foreground',
            )}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        ) : (
          <button
            onClick={backspace}
            disabled={!number}
            className="w-11 h-11 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-30"
            title="Backspace"
          >
            <Delete className="h-5 w-5 text-muted-foreground" />
          </button>
        )}

        {activeCall ? (
          <Button
            onClick={hangup}
            className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 shadow-lg"
          >
            <PhoneOff className="h-7 w-7" />
          </Button>
        ) : (
          <Button
            onClick={dial}
            disabled={dialing || !number || !deviceReady}
            className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 shadow-lg disabled:opacity-50"
          >
            <Phone className="h-7 w-7" />
          </Button>
        )}

        <div className="w-11 h-11" />
      </div>

      <p className="text-[10px] text-muted-foreground text-center px-2">
        Calls go through your browser microphone — no callback or approval needed.
      </p>
    </div>
  );
}
