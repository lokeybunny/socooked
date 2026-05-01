import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, MessageSquare, StickyNote } from "lucide-react";
import { toast } from "sonner";
import EmojiButton from "@/components/sms/EmojiButton";
import CallNotesPopup from "@/components/phone/CallNotesPopup";

type SMSMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  from_address: string | null;
  to_address: string | null;
  status: string;
  created_at: string;
};

function normalizeLast10(raw: string | null | undefined) {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "").slice(-10);
}

function formatPhone(raw: string | null | undefined) {
  const last10 = normalizeLast10(raw);
  if (last10.length !== 10) return raw || "";
  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
}

export function SmsThreadPopup({
  open,
  onOpenChange,
  phone,
  contactName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phone: string;
  contactName?: string | null;
}) {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const last10 = useMemo(() => normalizeLast10(phone), [phone]);
  const e164 = last10.length === 10 ? `+1${last10}` : phone;

  const load = useCallback(async (silent = false) => {
    if (!last10) return;
    if (!silent) setLoading(true);
    try {
      // Try to pull any new inbound from VoidFix
      try { await supabase.functions.invoke("powerdial-sms", { body: { action: "poll", limit: 50 } }); } catch {}
      const { data } = await supabase
        .from("communications")
        .select("id, direction, body, from_address, to_address, status, created_at")
        .eq("type", "sms")
        .or(`from_address.ilike.%${last10},to_address.ilike.%${last10}`)
        .order("created_at", { ascending: true })
        .limit(500);
      const filtered = ((data as SMSMessage[]) || []).filter((m) => {
        const cp = m.direction === "inbound" ? m.from_address : m.to_address;
        return normalizeLast10(cp) === last10;
      });
      setMessages(filtered);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [last10]);

  useEffect(() => {
    if (!open) return;
    load(false);
    const id = setInterval(() => load(true), 6000);
    const ch = supabase
      .channel(`sms-popup-${last10}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "communications", filter: "type=eq.sms" }, () => load(true))
      .subscribe();
    return () => { clearInterval(id); supabase.removeChannel(ch); };
  }, [open, last10, load]);

  // Auto-scroll to bottom whenever messages change while open
  useEffect(() => {
    if (!open) return;
    const v = scrollRef.current?.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    if (v) v.scrollTop = v.scrollHeight;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  const send = async () => {
    const text = body.trim();
    if (!text) { toast.error("Type a message first"); return; }
    if (last10.length !== 10) { toast.error("Invalid phone"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("powerdial-sms", {
        body: { action: "send", to: e164, body: text },
      });
      if (error || !(data as any)?.ok) {
        toast.error((data as any)?.error || error?.message || "Failed to send");
      } else {
        toast.success("SMS sent via VoidFix");
        setBody("");
        load(true);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
        <DialogContent
          className="max-w-lg p-0 gap-0 overflow-hidden"
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('[aria-label="Contact Notes"]')) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('[aria-label="Contact Notes"]')) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('[aria-label="Contact Notes"]')) e.preventDefault();
          }}
        >
          <DialogHeader className="px-4 py-3 border-b">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                  {contactName ? `${contactName} — ` : ""}{formatPhone(phone)}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Send and receive SMS via VoidFix. Identical to the SMS page thread.
                </DialogDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs shrink-0 mr-6"
                onClick={() => setNotesOpen(true)}
              >
                <StickyNote className="h-3.5 w-3.5" /> Notes
              </Button>
            </div>
          </DialogHeader>

          <ScrollArea ref={scrollRef as any} className="h-[420px] px-4 py-3 bg-muted/10">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">
                No messages yet. Start the conversation below.
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => {
                  const out = m.direction === "outbound";
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        out ? "bg-emerald-500 text-white rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
                      }`}>
                        <div>{m.body || ""}</div>
                        <div className={`text-[10px] mt-1 ${out ? "text-white/70" : "text-muted-foreground"}`}>
                          {new Date(m.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            )}
          </ScrollArea>

          <div className="border-t p-3 space-y-2 bg-background">
            <div className="flex items-end gap-2">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type a message…"
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
                }}
              />
              <div className="flex flex-col gap-1">
                <EmojiButton onSelect={(emoji) => setBody((b) => b + emoji)} />
                <Button size="sm" onClick={send} disabled={sending || !body.trim()} className="bg-emerald-500 hover:bg-emerald-600">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">⌘/Ctrl + Enter to send</p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Rendered OUTSIDE the Dialog so Radix's pointer-events lock doesn't block dragging */}
      <CallNotesPopup open={notesOpen} onOpenChange={setNotesOpen} phone={phone} />
    </>
  );
}

export default SmsThreadPopup;
