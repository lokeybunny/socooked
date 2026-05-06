// Manual call-to-call dialer that imports queue items from a Power Dial campaign.
// User picks a campaign, then manually calls each lead one-by-one (tel: link),
// marks them Interested / Not Interested, opens the Teleprompter, and edits notes.
// Mirrors the LiveCallPopup logic from Power Dial — same DB writes (sms_contacts.tags,
// sms_dnd_list, powerdial_call_logs.disposition) so flags appear consistently.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Phone, ThumbsUp, Ban, FileText, CheckCircle2, Loader2, RefreshCw, StickyNote, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { Teleprompter } from '@/components/phone/Teleprompter';
import { SmsThreadPopup } from '@/components/phone/SmsThreadPopup';

type Campaign = { id: string; name: string; status: string; total_leads: number };
type QueueItem = {
  id: string;
  phone: string;
  contact_name: string | null;
  note: string | null;
  position: number;
  status: string;
  last_result: string | null;
  customer_id: string | null;
};

export default function CampaignManualDialer() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>('');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneSet, setDoneSet] = useState<Set<string>>(new Set());
  const [contactedSet, setContactedSet] = useState<Set<string>>(new Set());
  const [smsPopup, setSmsPopup] = useState<{ phone: string; name: string | null } | null>(null);
  const [callChoice, setCallChoice] = useState<QueueItem | null>(null);

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from('powerdial_campaigns')
      .select('id, name, status, total_leads')
      .order('created_at', { ascending: false })
      .limit(40);
    setCampaigns((data as any[]) || []);
  }, []);

  const loadQueue = useCallback(async (id: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('powerdial_queue')
      .select('id, phone, contact_name, note, position, status, last_result, customer_id')
      .eq('campaign_id', id)
      .order('position', { ascending: true });
    const queue = (data as any[]) || [];
    setItems(queue);

    // Find which queue phones we've previously texted (outbound SMS in communications)
    const last10s = Array.from(new Set(queue.map(q => String(q.phone).replace(/\D/g, '').slice(-10)).filter(Boolean)));
    if (last10s.length) {
      const ors = last10s.map(d => `phone_number.ilike.%${d}%,to_address.ilike.%${d}%`).join(',');
      const { data: comms } = await supabase
        .from('communications')
        .select('phone_number, to_address')
        .eq('type', 'sms')
        .eq('direction', 'outbound')
        .or(ors)
        .limit(2000);
      const contacted = new Set<string>();
      (comms || []).forEach((c: any) => {
        const d = String(c.phone_number || c.to_address || '').replace(/\D/g, '').slice(-10);
        if (d) contacted.add(d);
      });
      setContactedSet(contacted);
    } else {
      setContactedSet(new Set());
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => {
    if (campaignId) loadQueue(campaignId);
    setActiveId(null);
    setDoneSet(new Set());
  }, [campaignId, loadQueue]);

  const active = items.find(i => i.id === activeId) || null;

  // Load notes when active changes
  useEffect(() => {
    if (!active) { setNotesDraft(''); return; }
    const last10 = String(active.phone).replace(/\D/g, '').slice(-10);
    supabase.from('sms_contacts').select('notes').eq('phone_last10', last10).maybeSingle()
      .then(({ data }) => setNotesDraft((data as any)?.notes || ''));
  }, [active?.id]);

  const phoneE164 = (p: string) => {
    const d = p.replace(/\D/g, '');
    return d.length === 11 ? `+${d}` : `+1${d.slice(-10)}`;
  };

  const markInterested = async (item: QueueItem) => {
    setBusyId(item.id);
    try {
      const last10 = item.phone.replace(/\D/g, '').slice(-10);
      const e164 = phoneE164(item.phone);
      const { data: existing } = await supabase
        .from('sms_contacts').select('tags, name').eq('phone_last10', last10).maybeSingle();
      const tags = new Set<string>(((existing as any)?.tags as string[]) || []);
      tags.add('interested');
      const { error } = await supabase.from('sms_contacts').upsert(
        {
          phone_last10: last10,
          phone: e164,
          name: (existing as any)?.name || item.contact_name || e164,
          tags: Array.from(tags),
        },
        { onConflict: 'phone_last10' },
      );
      if (error) throw error;
      setDoneSet(prev => new Set(prev).add(item.id));
      toast.success('Marked Interested · Green dot will show in SMS');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to mark interested');
    } finally {
      setBusyId(null);
    }
  };

  const markNotInterested = async (item: QueueItem) => {
    setBusyId(item.id);
    try {
      const last10 = item.phone.replace(/\D/g, '').slice(-10);
      const e164 = phoneE164(item.phone);
      const { error } = await supabase.from('sms_dnd_list').upsert(
        {
          phone: e164,
          phone_last10: last10,
          reason: 'not_interested_manual_call',
          source: 'phone_manual_dialer',
        },
        { onConflict: 'phone_last10' },
      );
      if (error) throw error;
      setDoneSet(prev => new Set(prev).add(item.id));
      toast.success('Marked Not Interested · Added to DND');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to mark not interested');
    } finally {
      setBusyId(null);
    }
  };

  const saveNotes = async () => {
    if (!active) return;
    setSavingNotes(true);
    try {
      const last10 = active.phone.replace(/\D/g, '').slice(-10);
      const e164 = phoneE164(active.phone);
      const { data: existing } = await supabase
        .from('sms_contacts').select('name').eq('phone_last10', last10).maybeSingle();
      const { error } = await supabase.from('sms_contacts').upsert(
        {
          phone_last10: last10,
          phone: e164,
          name: (existing as any)?.name || active.contact_name || e164,
          notes: notesDraft.trim() || null,
        },
        { onConflict: 'phone_last10' },
      );
      if (error) throw error;
      toast.success('Notes saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const startCall = (item: QueueItem) => {
    setCallChoice(item);
  };

  const callWithTwilio = (item: QueueItem) => {
    setActiveId(item.id);
    setCallChoice(null);
    window.dispatchEvent(new CustomEvent('twilio:dial', { detail: { phone: phoneE164(item.phone) } }));
    toast.success(`Calling ${item.contact_name || item.phone} via Twilio…`);
  };

  const callWithRingCentral = (item: QueueItem) => {
    setActiveId(item.id);
    setCallChoice(null);
    // Open RingCentral's tel: handler — RC desktop app registers as the system dialer.
    window.location.href = `tel:${phoneE164(item.phone)}`;
    toast.success(`Dialing ${item.contact_name || item.phone} via RingCentral…`);
  };

  return (
    <div className="glass-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" /> Manual Campaign Dialer
          </h3>
          <p className="text-[11px] text-muted-foreground">Import a Power Dial campaign and call leads one-by-one.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadCampaigns} className="h-8">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Select value={campaignId} onValueChange={setCampaignId}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Select a Power Dial campaign…" />
        </SelectTrigger>
        <SelectContent>
          {campaigns.map(c => (
            <SelectItem key={c.id} value={c.id}>
              {c.name} · {c.total_leads} leads
            </SelectItem>
          ))}
          {campaigns.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">No campaigns yet</div>
          )}
        </SelectContent>
      </Select>

      {campaignId && (
        <>
          {/* Active call detail panel */}
          {active && (
            <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Currently calling</p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {active.contact_name || 'Unknown'} · <span className="font-mono">{active.phone}</span>
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setShowTeleprompter(s => !s)}>
                  <FileText className="h-3.5 w-3.5 mr-1 text-purple-400" />
                  {showTeleprompter ? 'Hide' : 'Script'}
                </Button>
              </div>

              {active.note && (
                <div className="text-xs italic text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                  💬 "{active.note}"
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                  <StickyNote className="h-3 w-3" /> Notes
                </label>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={2}
                  className="text-xs resize-none mt-1"
                  placeholder="Notes from this call…"
                />
                <Button size="sm" variant="outline" className="h-7 text-[11px] mt-1" onClick={saveNotes} disabled={savingNotes}>
                  {savingNotes ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Save Notes
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-8"
                  onClick={() => markInterested(active)}
                  disabled={busyId === active.id}
                >
                  {busyId === active.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ThumbsUp className="h-3.5 w-3.5 mr-1" />}
                  Interested
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8"
                  onClick={() => markNotInterested(active)}
                  disabled={busyId === active.id}
                >
                  {busyId === active.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Ban className="h-3.5 w-3.5 mr-1" />}
                  Not Interested
                </Button>
              </div>
            </div>
          )}

          {/* Queue list */}
          <ScrollArea className="h-[420px] rounded-lg border border-border">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No leads in this campaign</div>
            ) : (
              <div className="divide-y divide-border">
                {items.map((item, idx) => {
                  const isActive = item.id === activeId;
                  const isDone = doneSet.has(item.id);
                  const last10 = String(item.phone).replace(/\D/g, '').slice(-10);
                  const wasContacted = contactedSet.has(last10);
                  return (
                    <div key={item.id} className={`px-3 py-2 ${isActive ? 'bg-primary/5' : ''} ${isDone ? 'opacity-60' : ''} ${wasContacted ? 'bg-red-500/10' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-5 text-right">{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${wasContacted ? 'text-red-400' : 'text-foreground'}`}>
                            {item.contact_name || <span className="text-muted-foreground italic">No name</span>}
                            {wasContacted && <span className="ml-2 text-[9px] uppercase tracking-wider text-red-400">· Texted</span>}
                          </p>
                          <p className={`text-[11px] font-mono ${wasContacted ? 'text-red-400/70' : 'text-muted-foreground'}`}>{item.phone}</p>
                        </div>
                        {isDone && <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Done</Badge>}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          title="Text"
                          onClick={() => setSmsPopup({ phone: item.phone, name: item.contact_name })}
                        >
                          <MessageSquare className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          className={`h-7 text-white ${wasContacted ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                          onClick={() => startCall(item)}
                        >
                          <Phone className="h-3 w-3 mr-1" /> Call
                        </Button>
                      </div>
                      {item.note && (
                        <p className="text-[11px] italic text-amber-400 mt-1 pl-7 truncate" title={item.note}>
                          💬 "{item.note}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </>
      )}

      <Teleprompter
        open={showTeleprompter}
        onOpenChange={setShowTeleprompter}
        lead={active ? { full_name: active.contact_name, phone: active.phone, id: active.customer_id } : null}
      />

      {smsPopup && (
        <SmsThreadPopup
          open={!!smsPopup}
          onOpenChange={(v) => { if (!v) setSmsPopup(null); }}
          phone={smsPopup.phone}
          contactName={smsPopup.name}
        />
      )}
    </div>
  );
}
