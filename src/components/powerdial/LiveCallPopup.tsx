// LiveCallPopup — invoked when the dialer presses "Live Transfer" on an active call.
// Shows a draggable closer interface with: contact context, teleprompter script,
// and a one-click "Text User" button that fires an SMS to the lead via VoidFix.

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, Loader2, X, Phone, FileText } from 'lucide-react';
import { Teleprompter } from '@/components/phone/Teleprompter';

type ActiveCall = {
  phone: string;
  contact_name?: string | null;
  customer_id?: string | null;
  notes?: string | null;
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
      }
    } finally {
      setSending(false);
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
          <Button
            onClick={handleTextUser}
            disabled={sending || !quickText.trim()}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Text User
          </Button>
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
