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
  const [saving, setSaving] = useState(false);

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
    <div className="glass-card p-6 space-y-5 max-w-md">
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
  );
}
