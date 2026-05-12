import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Save, Voicemail, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import VoicemailHealthCheck from './VoicemailHealthCheck';

const DEFAULT_VM_SMS_TEXT = "";

type Campaign = { id: string; name: string; settings: any };
type RecentDrop = {
  id: string;
  to_address: string | null;
  phone_number: string | null;
  body: string | null;
  status: string | null;
  created_at: string;
  metadata: any;
};

export default function VoicemailFollowupSettings() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState(DEFAULT_VM_SMS_TEXT);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<RecentDrop[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const loadCampaigns = async () => {
    const { data } = await supabase
      .from('powerdial_campaigns')
      .select('id, name, settings')
      .order('created_at', { ascending: false });
    const list = (data as Campaign[]) || [];
    setCampaigns(list);
    if (list.length && !activeId) setActiveId(list[0].id);
  };

  const loadRecent = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('communications')
      .select('id, to_address, phone_number, body, status, created_at, metadata')
      .eq('provider', 'twilio')
      .eq('direction', 'outbound')
      .ilike('metadata->>source', '%voicemail-drop%')
      .order('created_at', { ascending: false })
      .limit(50);
    setRecent((data as unknown as RecentDrop[]) || []);
    setLoadingRecent(false);
  };

  useEffect(() => { loadCampaigns(); loadRecent(); }, []);

  useEffect(() => {
    const camp = campaigns.find(c => c.id === activeId);
    if (!camp) return;
    const s = camp.settings || {};
    setEnabled(s.voicemail_drop_sms_enabled !== false);
    setText(String(s.voicemail_drop_sms_text || DEFAULT_VM_SMS_TEXT));
  }, [activeId, campaigns]);

  const save = async () => {
    if (!activeId) return;
    const camp = campaigns.find(c => c.id === activeId);
    if (!camp) return;
    setSaving(true);
    const newSettings = {
      ...(camp.settings || {}),
      voicemail_drop_sms_enabled: enabled,
      voicemail_drop_sms_text: text.trim() || null,
    };
    const { error } = await supabase
      .from('powerdial_campaigns')
      .update({ settings: newSettings })
      .eq('id', activeId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Voicemail follow-up SMS saved');
    loadCampaigns();
  };

  return (
    <div className="space-y-4">
    <VoicemailHealthCheck />
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Settings */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Voicemail className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Voicemail Drop Follow-up SMS</h3>
            <p className="text-[11px] text-muted-foreground">
              When PowerDial drops a voicemail, VoidFix automatically texts the recipient.
            </p>
          </div>
        </div>

        <div>
          <Label>PowerDial Campaign</Label>
          <Select value={activeId} onValueChange={setActiveId}>
            <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
            <SelectContent>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3 bg-muted/20">
          <Label className="cursor-pointer">Enable VM Follow-up SMS</Label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded"
          />
        </div>

        <div>
          <Label>Message Text</Label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!enabled}
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {text.length} chars · ~{Math.ceil(text.length / 153) || 1} segment(s) · sent from VoidFix
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !activeId} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Activity */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent VM Follow-up Sends</h3>
          <Button size="sm" variant="ghost" onClick={loadRecent} disabled={loadingRecent}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRecent ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <ScrollArea className="h-[420px]">
          {recent.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">
              No voicemail follow-up texts sent yet.
            </p>
          ) : (
            <div className="space-y-2">
              {recent.map(r => {
                const ok = !['failed', 'undelivered'].includes(String(r.status).toLowerCase());
                return (
                  <div key={r.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono">{r.to_address || r.phone_number}</span>
                      <Badge variant="outline" className={`text-[9px] ${ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {r.status || 'sent'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(r.created_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
    </div>
  );
}
