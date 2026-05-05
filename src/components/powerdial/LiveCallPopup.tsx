// LiveCallPopup — invoked when the dialer presses "Live Transfer" on an active call.
// Shows a draggable closer interface with: contact context, teleprompter script,
// and a one-click "Text User" button that fires an SMS to the lead via VoidFix.

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, Loader2, X, Phone, FileText, Ban, ThumbsUp } from 'lucide-react';
import { Teleprompter } from '@/components/phone/Teleprompter';

type ActiveCall = {
  phone: string;
  contact_name?: string | null;
  customer_id?: string | null;
  notes?: string | null;
  note?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  call: ActiveCall | null;
}

const DEFAULT_QUICK_TEXT =
  "Hey, this is Warren — great chatting just now. I'll send over the AI marketing details we discussed. Reply here anytime.";

export default function LiveCallPopup({ open, onOpenChange, call }: Props) {
  const [quickText, setQuickText] = useState(DEFAULT_QUICK_TEXT);
  const [scriptText, setScriptText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [markingDnd, setMarkingDnd] = useState(false);
  const [markingInterested, setMarkingInterested] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);

  // Load editable defaults from app_settings
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['teleprompter_default_script', 'sms_quick_text']);
      if (cancelled) return;
      for (const row of data || []) {
        if (row.key === 'sms_quick_text' && (row.value as any)?.body) {
          setQuickText(String((row.value as any).body));
        }
        if (row.key === 'teleprompter_default_script' && (row.value as any)?.body) {
          setScriptText(String((row.value as any).body));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Auto-open teleprompter when popup opens
  useEffect(() => {
    if (open) setShowTeleprompter(true);
    else setShowTeleprompter(false);
  }, [open]);

  const handleTextUser = async () => {
    if (!call?.phone) {
      toast.error('No phone number for this call');
      return;
    }
    if (!quickText.trim()) {
      toast.error('Message body is empty');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('powerdial-sms', {
        body: { action: 'send', to: call.phone, body: quickText.trim(), customer_id: call.customer_id || undefined },
      });
      if (error || !(data as any)?.ok) {
        toast.error((data as any)?.error || error?.message || 'Send failed');
      } else {
        toast.success('Message sent ✓');
        // Mark the latest call log for this phone so the dropped-call auto-SMS
        // is bypassed when the call ends. We match the most recent log within
        // the last 30 minutes for this lead phone.
        try {
          const last10 = String(call.phone).replace(/\D/g, '').slice(-10);
          const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const { data: logs } = await supabase
            .from('powerdial_call_logs')
            .select('id, meta')
            .ilike('phone', `%${last10}`)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(1);
          const log = logs?.[0] as any;
          if (log?.id) {
            const meta = (log.meta && typeof log.meta === 'object') ? log.meta : {};
            await supabase.from('powerdial_call_logs').update({
              meta: { ...meta, manual_text_sent: true, manual_text_at: new Date().toISOString() },
            }).eq('id', log.id);
          }
        } catch (e) {
          console.warn('[LiveCallPopup] manual_text_sent flag failed', e);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const handleNotInterested = async () => {
    if (!call?.phone) {
      toast.error('No phone number for this call');
      return;
    }
    setMarkingDnd(true);
    try {
      const digits = String(call.phone).replace(/\D/g, '');
      const last10 = digits.slice(-10);
      const e164 = digits.length === 11 ? `+${digits}` : `+1${last10}`;

      // 1) Add to DND list
      const { error: dndErr } = await supabase.from('sms_dnd_list').upsert(
        {
          phone: e164,
          phone_last10: last10,
          reason: 'not_interested_live_call',
          source: 'live_call_popup',
        },
        { onConflict: 'phone_last10' },
      );
      if (dndErr) throw dndErr;

      // 2) Bypass dropped-call auto SMS by flagging latest call log
      try {
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: logs } = await supabase
          .from('powerdial_call_logs')
          .select('id, meta')
          .ilike('phone', `%${last10}`)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1);
        const log = logs?.[0] as any;
        if (log?.id) {
          const meta = (log.meta && typeof log.meta === 'object') ? log.meta : {};
          await supabase.from('powerdial_call_logs').update({
            meta: {
              ...meta,
              manual_text_sent: true,
              dropped_call_sms_sent: true,
              not_interested: true,
              not_interested_at: new Date().toISOString(),
            },
            disposition: 'not_interested',
          }).eq('id', log.id);
        }
      } catch (e) {
        console.warn('[LiveCallPopup] flag log not_interested failed', e);
      }

      toast.success('Marked Not Interested · Added to DND');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to mark not interested');
    } finally {
      setMarkingDnd(false);
    }
  };

  const handleInterested = async () => {
    if (!call?.phone) {
      toast.error('No phone number for this call');
      return;
    }
    setMarkingInterested(true);
    try {
      const digits = String(call.phone).replace(/\D/g, '');
      const last10 = digits.slice(-10);
      const e164 = digits.length === 11 ? `+${digits}` : `+1${last10}`;

      // Fetch existing tags so we can merge
      const { data: existing } = await supabase
        .from('sms_contacts')
        .select('tags, name')
        .eq('phone_last10', last10)
        .maybeSingle();
      const tags = new Set<string>(((existing as any)?.tags as string[]) || []);
      tags.add('interested');

      const { error } = await supabase.from('sms_contacts').upsert(
        {
          phone_last10: last10,
          phone: e164,
          name: (existing as any)?.name || call.contact_name || e164,
          tags: Array.from(tags),
        },
        { onConflict: 'phone_last10' },
      );
      if (error) throw error;

      // Flag the latest call log too
      try {
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: logs } = await supabase
          .from('powerdial_call_logs')
          .select('id, meta')
          .ilike('phone', `%${last10}`)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1);
        const log = logs?.[0] as any;
        if (log?.id) {
          const meta = (log.meta && typeof log.meta === 'object') ? log.meta : {};
          await supabase.from('powerdial_call_logs').update({
            meta: { ...meta, interested: true, interested_at: new Date().toISOString() },
            disposition: 'interested',
          }).eq('id', log.id);
        }
      } catch (e) {
        console.warn('[LiveCallPopup] flag log interested failed', e);
      }

      toast.success('Marked Interested · Green dot will show in SMS');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to mark interested');
    } finally {
      setMarkingInterested(false);
    }
  };

  if (!open || !call) return null;

  return (
    <>
      <div className="fixed top-4 right-4 z-[60] w-[380px] max-w-[95vw] glass-card border-2 border-emerald-500/40 shadow-2xl rounded-xl overflow-hidden animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/10 border-b border-emerald-500/20">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-emerald-400 font-mono text-xs font-bold">LIVE TRANSFER</p>
              <p className="text-[11px] text-muted-foreground truncate">
                <span className="font-medium text-foreground">{call.contact_name || 'Unknown'}</span>
                {' · '}
                <span className="font-mono">{call.phone}</span>
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Last message of interest from import */}
        {call.note && (
          <div className="px-4 py-2 border-b border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
            <span className="font-semibold text-amber-400">Last message:</span> "{call.note}"
          </div>
        )}

        {/* Notes (if any) */}
        {call.notes && (
          <div className="px-4 py-2 border-b border-border bg-muted/20 text-[11px] text-muted-foreground">
            <span className="font-semibold">Notes:</span> {call.notes}
          </div>
        )}

        {/* Quick text composer */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Text</label>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-purple-400 hover:text-purple-300"
              onClick={() => setShowTeleprompter(s => !s)}
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              {showTeleprompter ? 'Hide' : 'Show'} Script
            </Button>
          </div>
          <Textarea
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            rows={4}
            className="text-sm resize-none"
            placeholder="Type a follow-up message…"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleTextUser}
              disabled={sending || !quickText.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Text User
            </Button>
            <Button
              onClick={handleNotInterested}
              disabled={markingDnd}
              variant="destructive"
            >
              {markingDnd ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
              Not Interested
            </Button>
          </div>
          <a
            href={`tel:${call.phone}`}
            className="flex items-center justify-center gap-2 w-full text-xs text-muted-foreground hover:text-foreground py-1.5 rounded border border-border"
          >
            <Phone className="h-3 w-3" /> Call back manually
          </a>
        </div>
      </div>

      {/* Teleprompter side panel */}
      <Teleprompter
        open={showTeleprompter}
        onOpenChange={setShowTeleprompter}
        lead={{ full_name: call.contact_name, phone: call.phone, id: call.customer_id }}
        customScript={scriptText}
      />
    </>
  );
}
