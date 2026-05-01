import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

const DEFAULT_OUTBOUND_ASSISTANT = '1eddf1f7-3ef8-4950-9a65-1fd68516208e';
const DEFAULT_POWERDIAL_HUMAN_TRANSFER_PHONE = '+17027016192';
const TARGET_SAMPLE_RATE = 8000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const INBOUND_ASSISTANT_IDS = new Set([
  'fea7fb27-2311-4f42-9bc1-d6e6fa966ab8',
  '29ca9037-ff4c-4d56-a9c7-6c5bc1ab1b38',
]);

const OUTBOUND_VAPI_ASSISTANTS = [
  { id: '1eddf1f7-3ef8-4950-9a65-1fd68516208e', label: 'Cold Caller (Default)' },
  { id: 'dc35680f-8763-4702-84d7-e3df267ddaf9', label: 'Web Design – Outbound' },
  { id: '0045f12e-56e2-4245-971b-1f7dd2069282', label: 'Videography – Outbound' },
];

type Props = {
  campaign: {
    id: string;
    settings: any;
  };
  onUpdate: () => void;
};

function getSettingsFormState(settings: any) {
  const nextSettings = settings || {};
  const persistedAssistantId = sanitizeAssistantId(nextSettings.vapi_assistant_id);
  const knownAssistant = OUTBOUND_VAPI_ASSISTANTS.find((assistant) => assistant.id === persistedAssistantId);

  return {
    callDelay: String(nextSettings.call_delay_ms || 2000),
    maxRetries: String(nextSettings.max_retries || 2),
    retryNoAnswerHours: String(nextSettings.retry_no_answer_hours || 4),
    retryBusyMinutes: String(nextSettings.retry_busy_minutes || 30),
    hoursStart: nextSettings.calling_hours_start || '09:00',
    hoursEnd: nextSettings.calling_hours_end || '17:00',
    vapiAssistantId: knownAssistant ? persistedAssistantId : 'custom',
    customAssistantId: knownAssistant ? '' : persistedAssistantId,
    humanTransferPhone: String(nextSettings.human_transfer_phone || DEFAULT_POWERDIAL_HUMAN_TRANSFER_PHONE),
    aiAssistGreeting: String(
      nextSettings.ai_assist_greeting ||
        "Hey, I'm calling in regards to your property listings. Do you have a second to talk?",
    ),
    // Auto-SMS after live transfer is OFF by default — opt in only.
    smsAfterTransfer: nextSettings.sms_after_transfer === true,
    smsAfterTransferMessage: String(nextSettings.sms_after_transfer_message || ''),
    smsSequenceId: String(nextSettings.sms_sequence_id || 'none'),
    voicemailDropEnabled: nextSettings.voicemail_drop_enabled !== false,
    voicemailDropUrl: String(nextSettings.voicemail_drop_url || ''),
    voicemailDropSmsEnabled: nextSettings.voicemail_drop_sms_enabled !== false,
    voicemailDropSmsText: String(
      nextSettings.voicemail_drop_sms_text ||
        "Hi this is Warren Guru. Just left you a voice mail, Im calling to see if you wouldn't mind having me make a video for one of your listings for free? Im a AI Videographer, Call me back at 702 701 6192."
    ),
  };
}

function sanitizeAssistantId(value: unknown) {
  const assistantId = typeof value === 'string' ? value.trim() : '';

  if (!assistantId || INBOUND_ASSISTANT_IDS.has(assistantId)) {
    return DEFAULT_OUTBOUND_ASSISTANT;
  }

  return assistantId;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

async function decodeAndResample(file: File): Promise<{ samples: Float32Array; durationSec: number }> {
  const arrayBuf = await file.arrayBuffer();
  const tmpCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  let decoded: AudioBuffer;
  try {
    decoded = await tmpCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    tmpCtx.close();
  }

  const durationSec = decoded.duration;
  const targetLen = Math.ceil(durationSec * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, targetLen, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  let monoBuf: AudioBuffer;
  if (decoded.numberOfChannels === 1) {
    monoBuf = decoded;
  } else {
    monoBuf = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const out = monoBuf.getChannelData(0);
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    for (let i = 0; i < decoded.length; i++) {
      let sum = 0;
      for (let c = 0; c < channels.length; c++) sum += channels[c][i];
      out[i] = sum / channels.length;
    }
  }

  src.buffer = monoBuf;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const raw = rendered.getChannelData(0).slice();
  let peak = 0;
  for (let i = 0; i < raw.length; i++) peak = Math.max(peak, Math.abs(raw[i]));
  if (peak > 0) {
    const gain = Math.min(0.707 / peak, 4);
    for (let i = 0; i < raw.length; i++) raw[i] = Math.max(-0.95, Math.min(0.95, raw[i] * gain));
  }

  return { samples: raw, durationSec };
}

export default function PowerDialSettings({ campaign, onUpdate }: Props) {
  const s = campaign.settings || {};
  const settingsKey = JSON.stringify(s);
  const initialState = getSettingsFormState(s);

  const [callDelay, setCallDelay] = useState(initialState.callDelay);
  const [maxRetries, setMaxRetries] = useState(initialState.maxRetries);
  const [retryNoAnswerHours, setRetryNoAnswerHours] = useState(initialState.retryNoAnswerHours);
  const [retryBusyMinutes, setRetryBusyMinutes] = useState(initialState.retryBusyMinutes);
  const [hoursStart, setHoursStart] = useState(initialState.hoursStart);
  const [hoursEnd, setHoursEnd] = useState(initialState.hoursEnd);
  const [vapiAssistantId, setVapiAssistantId] = useState(initialState.vapiAssistantId);
  const [customAssistantId, setCustomAssistantId] = useState(initialState.customAssistantId);
  const [humanTransferPhone, setHumanTransferPhone] = useState(initialState.humanTransferPhone);
  const [aiAssistGreeting, setAiAssistGreeting] = useState(initialState.aiAssistGreeting);
  const [smsAfterTransfer, setSmsAfterTransfer] = useState(initialState.smsAfterTransfer);
  const [smsAfterTransferMessage, setSmsAfterTransferMessage] = useState(initialState.smsAfterTransferMessage);
  const [smsSequenceId, setSmsSequenceId] = useState(initialState.smsSequenceId);
  const [voicemailDropEnabled, setVoicemailDropEnabled] = useState(initialState.voicemailDropEnabled);
  const [voicemailDropUrl, setVoicemailDropUrl] = useState(initialState.voicemailDropUrl);
  const [voicemailDropSmsEnabled, setVoicemailDropSmsEnabled] = useState(initialState.voicemailDropSmsEnabled);
  const [voicemailDropSmsText, setVoicemailDropSmsText] = useState(initialState.voicemailDropSmsText);
  const [vmUploading, setVmUploading] = useState(false);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('sms_sequences').select('id, name').eq('is_active', true).order('created_at', { ascending: false })
      .then(({ data }) => setSequences((data as any[]) || []));
  }, []);

  useEffect(() => {
    const nextState = getSettingsFormState(campaign.settings || {});
    setCallDelay(nextState.callDelay);
    setMaxRetries(nextState.maxRetries);
    setRetryNoAnswerHours(nextState.retryNoAnswerHours);
    setRetryBusyMinutes(nextState.retryBusyMinutes);
    setHoursStart(nextState.hoursStart);
    setHoursEnd(nextState.hoursEnd);
    setVapiAssistantId(nextState.vapiAssistantId);
    setCustomAssistantId(nextState.customAssistantId);
    setHumanTransferPhone(nextState.humanTransferPhone);
    setAiAssistGreeting(nextState.aiAssistGreeting);
    setSmsAfterTransfer(nextState.smsAfterTransfer);
    setSmsAfterTransferMessage(nextState.smsAfterTransferMessage);
    setSmsSequenceId(nextState.smsSequenceId);
    setVoicemailDropEnabled(nextState.voicemailDropEnabled);
    setVoicemailDropUrl(nextState.voicemailDropUrl);
    setVoicemailDropSmsEnabled(nextState.voicemailDropSmsEnabled);
    setVoicemailDropSmsText(nextState.voicemailDropSmsText);
  }, [campaign.id, settingsKey, campaign.settings]);

  const isCustom = vapiAssistantId === 'custom';
  const resolvedAssistantId = sanitizeAssistantId(isCustom ? customAssistantId : vapiAssistantId);

  const handleSave = async () => {
    setSaving(true);
    const newSettings = {
      ...s,
      call_delay_ms: Number(callDelay) || 2000,
      max_retries: Number(maxRetries) || 2,
      retry_no_answer_hours: Number(retryNoAnswerHours) || 4,
      retry_busy_minutes: Number(retryBusyMinutes) || 30,
      calling_hours_start: hoursStart,
      calling_hours_end: hoursEnd,
      vapi_assistant_id: resolvedAssistantId,
      human_transfer_phone: humanTransferPhone.trim(),
      ai_assist_greeting: aiAssistGreeting.trim(),
      sms_after_transfer: smsAfterTransfer,
      sms_after_transfer_message: smsAfterTransferMessage.trim(),
      sms_sequence_id: smsSequenceId === 'none' ? null : smsSequenceId,
      voicemail_drop_enabled: voicemailDropEnabled,
      voicemail_drop_url: voicemailDropUrl.trim() || null,
      voicemail_drop_sms_enabled: voicemailDropSmsEnabled,
      voicemail_drop_sms_text: voicemailDropSmsText.trim() || null,
    };

    const { error } = await supabase
      .from('powerdial_campaigns')
      .update({ settings: newSettings })
      .eq('id', campaign.id);

    setSaving(false);
    if (error) {
      toast.error('Failed to save settings');
    } else {
      toast.success('Settings saved');
      onUpdate();
    }
  };

  return (
    <div className="space-y-5 max-w-md">
      <GlobalAppSettings />
      <div className="glass-card p-6 space-y-5">
      <h3 className="text-sm font-semibold text-foreground">Campaign Settings</h3>

      <div>
        <Label>Outbound Vapi AI Assistant</Label>
        <Select
          value={vapiAssistantId}
          onValueChange={(value) => {
            setVapiAssistantId(value);
            if (value !== 'custom') setCustomAssistantId('');
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select assistant" />
          </SelectTrigger>
          <SelectContent>
            {OUTBOUND_VAPI_ASSISTANTS.map((assistant) => (
              <SelectItem key={assistant.id} value={assistant.id}>{assistant.label}</SelectItem>
            ))}
            <SelectItem value="custom">Custom Assistant ID</SelectItem>
          </SelectContent>
        </Select>
        {isCustom && (
          <Input
            className="mt-2"
            placeholder="Paste Vapi assistant ID"
            value={customAssistantId}
            onChange={(event) => setCustomAssistantId(event.target.value)}
          />
        )}
        <p className="text-[10px] text-muted-foreground mt-1">PowerDial only uses outbound assistants and defaults to Web Design – Outbound for calls.</p>
      </div>

      <div>
        <Label>Live Transfer Phone (used by AI Off & AI Assist)</Label>
        <Input
          type="tel"
          placeholder="+1 555 555 5555"
          value={humanTransferPhone}
          onChange={(event) => setHumanTransferPhone(event.target.value)}
        />
        <p className="text-[10px] text-muted-foreground mt-1">Where to ring the live agent. Used by both AI-Off transfers and the AI Assist warm-handoff.</p>
      </div>

      <div>
        <Label>AI Assist Greeting</Label>
        <textarea
          className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="Hey, I'm calling in regards to your property listings. Do you have a second to talk?"
          value={aiAssistGreeting}
          onChange={(event) => setAiAssistGreeting(event.target.value)}
        />
        <p className="text-[10px] text-muted-foreground mt-1">Spoken to the lead by Twilio TTS to stall while we silently bridge in the live agent. Only used when <strong>AI Assist</strong> is on.</p>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
        <div className="flex items-center justify-between">
          <Label className="cursor-pointer">SMS After Live Transfer</Label>
          <input
            type="checkbox"
            checked={smsAfterTransfer}
            onChange={(e) => setSmsAfterTransfer(e.target.checked)}
            className="h-4 w-4 rounded"
          />
        </div>
        <textarea
          className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Type the SMS to auto-send the moment a call bridges to a live agent…"
          value={smsAfterTransferMessage}
          onChange={(e) => setSmsAfterTransferMessage(e.target.value)}
          disabled={!smsAfterTransfer}
        />
        <p className="text-[10px] text-muted-foreground">Off by default. Toggle on and write a message to auto-send the lead the instant the call is bridged to a live agent.</p>
      </div>

      <div className="space-y-2 rounded-md border border-emerald-500/30 p-3 bg-emerald-500/5">
        <Label>Auto-Responder Sequence (after greet SMS)</Label>
        <Select value={smsSequenceId} onValueChange={setSmsSequenceId}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None — no follow-ups</SelectItem>
            {sequences.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          When the live-transfer SMS sends, the recipient is enrolled in this sequence. Their next reply triggers the next step.
          Manage sequences from the SMS page.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-purple-500/30 p-3 bg-purple-500/5">
        <div className="flex items-center justify-between">
          <Label className="cursor-pointer">📼 Voicemail Drop (on AMD = voicemail)</Label>
          <input
            type="checkbox"
            checked={voicemailDropEnabled}
            onChange={(e) => setVoicemailDropEnabled(e.target.checked)}
            className="h-4 w-4 rounded"
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          When Twilio AMD detects a voicemail box, instead of hanging up we wait for the beep and play your pre-recorded MP3.
          Recipient gets the message in their inbox.
        </p>

        <div className="flex flex-col gap-2 pt-1">
          <Input
            type="url"
            placeholder="https://…/voicemail.mp3 (uses default if empty)"
            value={voicemailDropUrl}
            onChange={(e) => setVoicemailDropUrl(e.target.value)}
            disabled={!voicemailDropEnabled}
          />
          <div className="flex items-center gap-2">
            <input
              id={`vm-upload-${campaign.id}`}
              type="file"
              accept="audio/*"
              className="hidden"
              disabled={!voicemailDropEnabled || vmUploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) { toast.error('Max 10 MB'); return; }
                setVmUploading(true);
                try {
                  const { samples, durationSec } = await decodeAndResample(file);
                  if (durationSec > 60) { toast.error('Recording must be 60 seconds or less'); return; }
                  const pcmBytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
                  const { data: sess } = await supabase.auth.getSession();
                  const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-voicemail-transcode`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token || ''}` },
                    body: JSON.stringify({
                      name: file.name,
                      original_filename: file.name,
                      original_format: file.type || 'unknown',
                      original_size: file.size,
                      duration_sec: durationSec,
                      pcm_base64: bytesToBase64(pcmBytes),
                      codec: 'pcm_mulaw',
                      set_active: false,
                    }),
                  });
                  const json = await resp.json();
                  if (!resp.ok || !json.ok) throw new Error(json?.error || `HTTP ${resp.status}`);
                  setVoicemailDropUrl(`${json.playback_url}&v=${Date.now()}`);
                  toast.success(`Voicemail converted (${durationSec.toFixed(1)}s) — click Save to apply`);
                } finally {
                  setVmUploading(false);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!voicemailDropEnabled || vmUploading}
              onClick={() => document.getElementById(`vm-upload-${campaign.id}`)?.click()}
            >
              {vmUploading ? 'Converting…' : 'Upload audio'}
            </Button>
            {voicemailDropUrl && (
              <audio src={voicemailDropUrl} controls className="h-8 flex-1 min-w-0" />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Uploads are converted to the Twilio-safe signal automatically. Default: Warren's voicemail message.
          </p>
        </div>

        {/* Voicemail Drop SMS — sent from VoidFix after a successful drop */}
        <div className="space-y-2 border-t border-border/40 pt-3 mt-3">
          <div className="flex items-center justify-between">
            <Label className="cursor-pointer">📱 Voicemail Drop Text (sent from VoidFix)</Label>
            <input
              type="checkbox"
              checked={voicemailDropSmsEnabled}
              onChange={(e) => setVoicemailDropSmsEnabled(e.target.checked)}
              disabled={!voicemailDropEnabled}
              className="h-4 w-4 rounded"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            After a voicemail drop is successfully delivered, automatically send this SMS from your VoidFix cell to the same recipient.
          </p>
          <textarea
            value={voicemailDropSmsText}
            onChange={(e) => setVoicemailDropSmsText(e.target.value)}
            disabled={!voicemailDropEnabled || !voicemailDropSmsEnabled}
            rows={4}
            placeholder="Hi this is Warren Guru. Just left you a voice mail…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs disabled:opacity-50"
          />
          <p className="text-[10px] text-muted-foreground">
            {voicemailDropSmsText.length} chars · sends ~{Math.ceil(voicemailDropSmsText.length / 153) || 1} segment(s)
          </p>
        </div>
      </div>

      <div>
        <Label>Call Delay (ms between calls)</Label>
        <Input type="number" value={callDelay} onChange={(event) => setCallDelay(event.target.value)} />
        <p className="text-[10px] text-muted-foreground mt-1">Default: 2000ms (2 seconds)</p>
      </div>

      <div>
        <Label>Max Retries per Contact</Label>
        <Input type="number" value={maxRetries} onChange={(event) => setMaxRetries(event.target.value)} />
      </div>

      <div>
        <Label>Retry No-Answer After (hours)</Label>
        <Input type="number" value={retryNoAnswerHours} onChange={(event) => setRetryNoAnswerHours(event.target.value)} />
      </div>

      <div>
        <Label>Retry Busy After (minutes)</Label>
        <Input type="number" value={retryBusyMinutes} onChange={(event) => setRetryBusyMinutes(event.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Calling Hours Start</Label>
          <Input type="time" value={hoursStart} onChange={(event) => setHoursStart(event.target.value)} />
        </div>
        <div>
          <Label>Calling Hours End</Label>
          <Input type="time" value={hoursEnd} onChange={(event) => setHoursEnd(event.target.value)} />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-1" /> Save Settings
      </Button>
    </div>
    </div>
  );
}

function GlobalAppSettings() {
  const [script, setScript] = useState('');
  const [quickText, setQuickText] = useState('');
  const [droppedEnabled, setDroppedEnabled] = useState(true);
  const [droppedBody, setDroppedBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const DEFAULT_DROPPED = "Hi, Just got disconnected, Im Warren, AI videographer. Would you mind if I made a free marketing video on one of your listings for you to use to shop the house? Check my IG! https://instagram.com/W4RR3NGuru";

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'teleprompter_default_script',
          'sms_quick_text',
          'powerdial_dropped_call_sms_enabled',
          'powerdial_dropped_call_sms_body',
        ]);
      let bodyLoaded = false;
      for (const row of data || []) {
        if (row.key === 'teleprompter_default_script') setScript(String((row.value as any)?.body || ''));
        if (row.key === 'sms_quick_text') setQuickText(String((row.value as any)?.body || ''));
        if (row.key === 'powerdial_dropped_call_sms_enabled') {
          const v = (row.value as any)?.enabled;
          setDroppedEnabled(v !== false);
        }
        if (row.key === 'powerdial_dropped_call_sms_body') {
          const v = String((row.value as any)?.body || '');
          setDroppedBody(v);
          if (v) bodyLoaded = true;
        }
      }
      if (!bodyLoaded) setDroppedBody(DEFAULT_DROPPED);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: 'teleprompter_default_script', value: { body: script } },
      { key: 'sms_quick_text', value: { body: quickText } },
      { key: 'powerdial_dropped_call_sms_enabled', value: { enabled: droppedEnabled } },
      { key: 'powerdial_dropped_call_sms_body', value: { body: droppedBody } },
    ];
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Global settings saved');
  };

  if (loading) return null;

  return (
    <div className="glass-card p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Global Settings (Teleprompter & Quick Text)</h3>
      <div>
        <Label>Teleprompter Default Script</Label>
        <textarea
          className="flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          placeholder={"Paste your closing script here. Lines in ALL CAPS or starting with —/#/━ become section headers."}
          value={script}
          onChange={(e) => setScript(e.target.value)}
        />
        <p className="text-[10px] text-muted-foreground mt-1">Used by the Live Transfer popup. Leave empty to fall back to the built-in STU25 cold-call script.</p>
      </div>
      <div>
        <Label>Default Quick-Text Message</Label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Default body for the 'Text User' button on live transfers."
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
        />
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-foreground">Dropped Live-Call Auto SMS</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Automatically text the lead if they hang up after a live human picks up — unless you already manually sent a text from the Live Transfer popup.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={droppedEnabled}
              onChange={(e) => setDroppedEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span>{droppedEnabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
        <textarea
          className="flex min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder={DEFAULT_DROPPED}
          value={droppedBody}
          onChange={(e) => setDroppedBody(e.target.value)}
          disabled={!droppedEnabled}
        />
        <p className="text-[10px] text-muted-foreground">
          Replies to this message (other than STOP) automatically enter the Hook Reply campaign.
        </p>
      </div>

      <Button onClick={save} disabled={saving} size="sm">
        <Save className="h-4 w-4 mr-1" /> Save Global
      </Button>
    </div>
  );
}
