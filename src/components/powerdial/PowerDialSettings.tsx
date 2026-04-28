import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

const DEFAULT_OUTBOUND_ASSISTANT = '1eddf1f7-3ef8-4950-9a65-1fd68516208e';
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
    humanTransferPhone: String(nextSettings.human_transfer_phone || ''),
    aiAssistGreeting: String(
      nextSettings.ai_assist_greeting ||
        "Hey, I'm calling in regards to your property listings. Do you have a second to talk?",
    ),
    // Auto-SMS after live transfer is OFF by default — opt in only.
    smsAfterTransfer: nextSettings.sms_after_transfer === true,
    smsAfterTransferMessage: String(nextSettings.sms_after_transfer_message || ''),
    smsSequenceId: String(nextSettings.sms_sequence_id || 'none'),
  };
}

function sanitizeAssistantId(value: unknown) {
  const assistantId = typeof value === 'string' ? value.trim() : '';

  if (!assistantId || INBOUND_ASSISTANT_IDS.has(assistantId)) {
    return DEFAULT_OUTBOUND_ASSISTANT;
  }

  return assistantId;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['teleprompter_default_script', 'sms_quick_text']);
      for (const row of data || []) {
        if (row.key === 'teleprompter_default_script') setScript(String((row.value as any)?.body || ''));
        if (row.key === 'sms_quick_text') setQuickText(String((row.value as any)?.body || ''));
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: 'teleprompter_default_script', value: { body: script } },
      { key: 'sms_quick_text', value: { body: quickText } },
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
      <Button onClick={save} disabled={saving} size="sm">
        <Save className="h-4 w-4 mr-1" /> Save Global
      </Button>
    </div>
  );
}
