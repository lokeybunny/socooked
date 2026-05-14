import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, MessageSquare, StickyNote, Workflow, Zap, Paperclip, X, Sparkles, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import EmojiButton from "@/components/sms/EmojiButton";
import CallNotesPopup from "@/components/phone/CallNotesPopup";
import { moveToVideographyFunnel } from "@/lib/moveToVideographyFunnel";
import { MediaImage } from "@/components/sms/MediaImage";

type SMSMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  from_address: string | null;
  to_address: string | null;
  status: string;
  created_at: string;
  media_urls?: string[] | null;
  provider?: string | null;
  metadata?: Record<string, any> | null;
};

type PendingAttachment = { id: string; url: string; name: string; uploading?: boolean };

function isImessageProvider(p?: string | null) {
  return !!p && p.toLowerCase().includes("voidfix-imessage") && !p.toLowerCase().includes("-sms");
}

const IMAGE_URL_REGEX = /(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|heic|bmp)(?:\?[^\s]*)?)/gi;
function extractImageUrls(body: string | null | undefined): string[] {
  if (!body) return [];
  const matches = body.match(IMAGE_URL_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
}
function stripImageUrls(body: string | null | undefined): string {
  if (!body) return "";
  return body.replace(IMAGE_URL_REGEX, "").replace(/\s{2,}/g, " ").trim();
}

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
  initialBody,
  seedReplyText,
  seedReplyAt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phone: string;
  contactName?: string | null;
  initialBody?: string;
  seedReplyText?: string | null;
  seedReplyAt?: string | null;
}) {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState(initialBody || "");
  const [notesOpen, setNotesOpen] = useState(false);
  const [routeImessage, setRouteImessage] = useState(false);
  const [routeReason, setRouteReason] = useState<string>("");
  const [routeOverride, setRouteOverride] = useState<"imessage" | "sms" | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [quickReplyLoading, setQuickReplyLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [deviceType, setDeviceType] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const last10 = useMemo(() => normalizeLast10(phone), [phone]);
  const e164 = last10.length === 10 ? `+1${last10}` : phone;

  const load = useCallback(async (silent = false) => {
    if (!last10) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await supabase
        .from("communications")
        .select("id, direction, body, from_address, to_address, status, created_at, media_urls, provider, metadata")
        .eq("type", "sms")
        .or(`from_address.ilike.%${last10},to_address.ilike.%${last10}`)
        .order("created_at", { ascending: true })
        .limit(300);
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
    if (initialBody) setBody(initialBody);
    load(false);
    // Note: global VoidFix poller + realtime subscription handle inbound.
    // Avoid invoking powerdial-sms 'poll' here — it can exceed the 150s edge timeout.
    const ch = supabase
      .channel(`sms-popup-${last10}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "communications", filter: "type=eq.sms" }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, last10, load]);

  // Route resolution: device_type from audit is authoritative.
  //   iphone        -> iMessage
  //   android/voip/landline -> SMS (VoidFix)
  //   unknown/null  -> fall back to user's saved localStorage choice, else SMS
  const resolveRoute = useCallback(async () => {
    if (last10.length !== 10) return;
    const { data } = await supabase
      .from("sms_contacts")
      .select("device_type, name")
      .eq("phone_last10", last10)
      .maybeSingle();
    const dt = (data?.device_type || "").toLowerCase();
    setDeviceType(data?.device_type || null);
    const nameTag = data?.name || "";
    const isIphone = dt === "iphone" || /_iPhone$/i.test(nameTag);
    const isNonImsg = dt === "android" || dt === "voip" || dt === "landline"
      || /_(Android|VoIP|Landline)$/i.test(nameTag);
    if (isIphone) { setRouteOverride("imessage"); return; }
    if (isNonImsg) { setRouteOverride("sms"); return; }
    try {
      const v = localStorage.getItem(`sms-thread-route-${last10}`);
      if (v === "imessage" || v === "sms") { setRouteOverride(v); return; }
    } catch {}
    setRouteOverride(null);
  }, [last10]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => { if (!cancelled) await resolveRoute(); })();
    return () => { cancelled = true; };
  }, [open, resolveRoute]);

  const auditPhone = async () => {
    if (last10.length !== 10) { toast.error("Invalid phone"); return; }
    setAuditing(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-device-audit", {
        body: { action: "run", phone: e164 },
      });
      if (error || !(data as any)?.ok) {
        toast.error((data as any)?.error || error?.message || "Audit failed");
        return;
      }
      const dt = (data as any)?.device_type || "unknown";
      const locked = (data as any)?.locked;
      toast.success(
        dt === "iphone" ? `📱 iPhone — routing as iMessage${locked ? " (cached)" : ""}`
        : dt === "android" ? `🤖 Android — routing as SMS${locked ? " (cached)" : ""}`
        : dt === "landline" ? `☎️ Landline${locked ? " (cached)" : ""}`
        : dt === "voip" ? `📞 VoIP — routing as SMS${locked ? " (cached)" : ""}`
        : `Audit complete — device unknown`
      );
      await resolveRoute();
    } finally {
      setAuditing(false);
    }
  };


  // Detect iMessage suggestion: VIP route, existing customer, or prior iMessage thread.
  // This is informational only — actual routing follows routeOverride (default SMS).
  useEffect(() => {
    if (!open || last10.length !== 10) { setRouteImessage(false); setRouteReason(""); return; }
    let cancelled = false;
    (async () => {
      const [vipRes, custRes] = await Promise.all([
        supabase.from("sms_contacts").select("vip_route").eq("phone_last10", last10).maybeSingle(),
        supabase.from("customers").select("id").ilike("phone", `%${last10}`).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      if (vipRes.data?.vip_route) { setRouteImessage(true); setRouteReason("VIP route"); return; }
      if (custRes.data?.id) { setRouteImessage(true); setRouteReason("Customer"); return; }
      const hadImsg = messages.some((m) => isImessageProvider(m.provider));
      if (hadImsg) { setRouteImessage(true); setRouteReason("Prior iMessage"); return; }
      setRouteImessage(false); setRouteReason("");
    })();
    return () => { cancelled = true; };
  }, [open, last10, messages]);

  const setRoute = (r: "imessage" | "sms") => {
    setRouteOverride(r);
    try { localStorage.setItem(`sms-thread-route-${last10}`, r); } catch {}
    toast.success(r === "imessage" ? "Thread set to iMessage" : "Thread set to SMS (VoidFix)");
  };

  // Effective route: explicit override wins; otherwise default to SMS for existing/new threads.
  const useImessageRoute = routeOverride ? routeOverride === "imessage" : false;

  // Last inbound message + relative timeframe
  // Last inbound: prefer messages from communications, fall back to seed (e.g. hot reply spreadsheet row)
  const lastInbound = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === "inbound") return messages[i];
    }
    if (seedReplyText && seedReplyText.trim()) {
      return {
        id: "seed",
        direction: "inbound" as const,
        body: seedReplyText,
        from_address: phone,
        to_address: null,
        status: "received",
        created_at: seedReplyAt || new Date().toISOString(),
      } as SMSMessage;
    }
    return null;
  }, [messages, seedReplyText, seedReplyAt, phone]);

  const lastInboundAgo = useMemo(() => {
    if (!lastInbound) return "";
    const t = new Date(lastInbound.created_at).getTime();
    if (!Number.isFinite(t)) return "";
    const ms = Date.now() - t;
    const m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }, [lastInbound]);

  const lastInboundWhen = useMemo(() => {
    if (!lastInbound) return "";
    const t = new Date(lastInbound.created_at).getTime();
    if (!Number.isFinite(t)) return "";
    return new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }, [lastInbound]);

  const generateQuickReply = async () => {
    if (!lastInbound) { toast.error("No inbound message to reply to"); return; }
    const inboundText = stripImageUrls(lastInbound.body) || lastInbound.body || "";
    if (!inboundText.trim()) { toast.error("Last reply has no text"); return; }
    setQuickReplyLoading(true);
    try {
      const recent = messages.slice(-10).map((m) => ({
        direction: m.direction,
        body: stripImageUrls(m.body) || m.body || "",
      }));
      // Ensure the seed reply is always included as the most recent inbound for context
      if (lastInbound.id === "seed" && !recent.some((m) => m.body === inboundText)) {
        recent.push({ direction: "inbound", body: inboundText });
      }
      const { data, error } = await supabase.functions.invoke("sms-quick-reply", {
        body: { inboundMessage: inboundText, contactName, recentMessages: recent, inboundAt: lastInbound.created_at },
      });
      if (error || !(data as any)?.reply) {
        toast.error((data as any)?.error || error?.message || "Failed to generate reply");
        return;
      }
      setBody((data as any).reply);
      toast.success("Quick reply drafted — review and hit send");
    } finally {
      setQuickReplyLoading(false);
    }
  };



  // Auto-scroll to bottom whenever messages change while open
  useEffect(() => {
    if (!open) return;
    const v = scrollRef.current?.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    if (v) v.scrollTop = v.scrollHeight;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const items = Array.from(files).slice(0, 10 - attachments.length);
    for (const f of items) {
      const id = crypto.randomUUID();
      setAttachments((prev) => [...prev, { id, url: "", name: f.name, uploading: true }]);
      try {
        const ext = (f.name.split(".").pop() || "bin").toLowerCase();
        const path = `sms-attachments/${last10 || "thread"}/${id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("content-uploads")
          .upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("content-uploads").getPublicUrl(path);
        setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, url: pub.publicUrl, uploading: false } : a)));
      } catch (e: any) {
        toast.error(`Upload failed: ${e?.message || "unknown"}`);
        setAttachments((prev) => prev.filter((a) => a.id !== id));
      }
    }
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const send = async () => {
    const text = body.trim();
    const ready = attachments.filter((a) => !a.uploading && a.url);
    if (!text && ready.length === 0) { toast.error("Type a message or attach a file"); return; }
    if (attachments.some((a) => a.uploading)) { toast.error("Wait for uploads to finish"); return; }
    if (last10.length !== 10) { toast.error("Invalid phone"); return; }
    setSending(true);
    try {
      // Hybrid: attachments always route through SMS/MMS provider — VoidFix iMessage is text-only.
      const useMms = ready.length > 0;
      const fn = useMms ? "powerdial-sms" : (useImessageRoute ? "voidfix-imessage" : "powerdial-sms");
      const invokeBody: Record<string, any> = { action: "send", to: e164, body: text };
      if (useMms) {
        invokeBody.mediaUrls = ready.map((a) => a.url);
        invokeBody.hybridImessageThread = useImessageRoute;
      }
      const { data, error } = await supabase.functions.invoke(fn, { body: invokeBody });
      if (error || !(data as any)?.ok) {
        toast.error((data as any)?.error || error?.message || "Failed to send");
      } else {
        const channel = (data as any)?.channel;
        if (useMms) {
          toast.success(useImessageRoute ? "Sent as MMS (attachment) 📎" : "MMS sent");
        } else {
          toast.success(useImessageRoute ? (channel === "sms" ? "Sent (SMS fallback)" : "iMessage sent 💙") : "SMS sent via VoidFix");
        }
        setBody("");
        setAttachments([]);
        load(true);
      }
    } finally {
      setSending(false);
    }
  };

  // iMessage capability: text-only. Any pending media forces the whole thread temporarily into SMS/MMS.
  const hasMedia = attachments.length > 0;
  const effectiveImessage = useImessageRoute && !hasMedia;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
        <DialogContent
          className="max-w-2xl w-[95vw] p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh]"
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
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className={`h-4 w-4 ${effectiveImessage ? "text-[#007AFF]" : "text-emerald-400"}`} />
                  {contactName ? `${contactName} — ` : ""}{formatPhone(phone)}
                  {effectiveImessage && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#007AFF]/15 text-[#007AFF] text-[10px] font-semibold px-2 py-0.5">
                      iMessage
                    </span>
                  )}
                  {useImessageRoute && hasMedia && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold px-2 py-0.5">
                      SMS/MMS · media attached
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {effectiveImessage
                    ? "iMessage (VoidFix). Add media to fall back to SMS/MMS for the next send."
                    : useImessageRoute && hasMedia
                      ? "Thread temporarily on SMS/MMS — remove media to return to iMessage."
                      : `SMS via VoidFix${routeImessage && !routeOverride ? ` · iMessage suggested (${routeReason})` : ""}.`}
                </DialogDescription>
                {/* Per-thread API selector — VoidFix iMessage vs VoidFix SMS (original) */}
                <div className="mt-1.5 inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setRoute("sms")}
                    className={`px-2 py-0.5 rounded font-semibold transition ${!useImessageRoute ? "bg-emerald-500 text-white" : "text-muted-foreground hover:text-foreground"}`}
                    title="Send via VoidFix SMS (original)"
                  >
                    SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoute("imessage")}
                    className={`px-2 py-0.5 rounded font-semibold transition ${useImessageRoute ? "bg-[#007AFF] text-white" : "text-muted-foreground hover:text-foreground"}`}
                    title="Send via VoidFix iMessage"
                  >
                    iMessage
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap shrink-0 mr-6">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => {
                    const snippet = "Hi, I'm Warren. I do AI drone footage and I'd love to do one of your properties free of charge so we can build a network together. If you get an opportunity, call me back so we can discuss more. https://instagram.com/W4RR3Nguru";
                    setBody((b) => (b ? b + (b.endsWith(' ') ? '' : ' ') + snippet : snippet));
                  }}
                  title="Insert quick pitch shortcut"
                >
                  <Zap className="h-3.5 w-3.5" /> Quick Pitch
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
                  onClick={generateQuickReply}
                  disabled={quickReplyLoading || !lastInbound}
                  title={lastInbound ? `AI reply to last message (${lastInboundAgo})` : "No inbound message to reply to"}
                >
                  {quickReplyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Quick Reply
                  {lastInbound && (
                    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 text-sky-300 text-[10px] font-semibold px-1.5 py-0.5">
                      <Clock className="h-2.5 w-2.5" />{lastInboundAgo}
                    </span>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                  onClick={() => moveToVideographyFunnel({ phone, name: contactName || null })}
                  title="Create a videography funnel lead from this contact"
                >
                  <Workflow className="h-3.5 w-3.5" /> Move to Funnel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setNotesOpen(true)}
                >
                  <StickyNote className="h-3.5 w-3.5" /> Notes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                  onClick={auditPhone}
                  disabled={auditing}
                  title={deviceType ? `Already audited: ${deviceType} — re-check` : "Detect iMessage vs SMS via Twilio Lookup"}
                >
                  {auditing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Audit
                  {deviceType && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-semibold px-1.5 py-0.5 capitalize">
                      {deviceType}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </DialogHeader>

          {lastInbound && (
            <div className="px-4 py-2 border-b bg-sky-500/5 shrink-0">
              <div className="flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 text-sky-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wide text-sky-300 font-semibold flex items-center gap-1.5">
                    Their last reply
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 normal-case tracking-normal">
                      <Clock className="h-2.5 w-2.5" /> {lastInboundWhen} · {lastInboundAgo}
                    </span>
                  </div>
                  <div className="text-sm text-foreground/90 mt-0.5 line-clamp-3 whitespace-pre-wrap">
                    {stripImageUrls(lastInbound.body) || lastInbound.body}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10 shrink-0"
                  onClick={generateQuickReply}
                  disabled={quickReplyLoading}
                >
                  {quickReplyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  AI Reply
                </Button>
              </div>
            </div>
          )}

          <ScrollArea ref={scrollRef as any} className="flex-1 min-h-[300px] px-4 py-3 bg-muted/10">
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
                  const isImsg = isImessageProvider(m.provider);
                  const explicitMedia = Array.isArray(m.media_urls) ? m.media_urls : [];
                  const bodyMedia = extractImageUrls(m.body);
                  const allMedia = Array.from(new Set([...(explicitMedia || []), ...bodyMedia]));
                  const textOnly = stripImageUrls(m.body);
                  // Bubble palette: iMessage outbound = blue (#007AFF) white text; iMessage inbound = white bg, black text.
                  // SMS (Android/Twilio): keep emerald outbound / dark card inbound.
                  const bubble = out
                    ? isImsg
                      ? "bg-[#007AFF] text-white rounded-br-sm"
                      : "bg-emerald-500 text-white rounded-br-sm"
                    : isImsg
                      ? "bg-white text-black border border-gray-200 rounded-bl-sm"
                      : "bg-card border border-border rounded-bl-sm";
                  const meta = out
                    ? "text-white/70"
                    : isImsg
                      ? "text-gray-500"
                      : "text-muted-foreground";
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${bubble}`}>
                        {allMedia.length > 0 && (
                          <div className={`grid gap-1.5 mb-1.5 ${allMedia.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                            {allMedia.map((url) => (
                              <MediaImage
                                key={url}
                                url={url}
                                alt="MMS attachment"
                                className="rounded-lg max-h-64 w-full object-cover bg-black/10"
                              />
                            ))}
                          </div>
                        )}
                        {textOnly && <div>{textOnly}</div>}
                        <div className={`text-[10px] mt-1 flex items-center gap-1 flex-wrap ${meta}`}>
                          {isImsg && <span className="font-semibold">iMessage</span>}
                          {out && !isImsg && allMedia.length > 0 && m.metadata?.hybrid_imessage_thread && (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 font-semibold">sent as MMS</span>
                          )}
                          {out && !isImsg && allMedia.length > 0 && !m.metadata?.hybrid_imessage_thread && (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 font-semibold">MMS</span>
                          )}
                          <span>{new Date(m.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            )}
          </ScrollArea>

          <div className="border-t p-3 space-y-2 bg-background shrink-0">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
                    {a.uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                    <span className="max-w-[140px] truncate">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove attachment"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {useImessageRoute && (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold px-2 py-0.5">
                    Will send as MMS (iMessage is text-only)
                  </span>
                )}
              </div>
            )}
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
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(e) => { uploadFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
              />
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 p-0"
                  onClick={() => fileRef.current?.click()}
                  disabled={sending || attachments.length >= 10}
                  title="Attach photo/video"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <EmojiButton onSelect={(emoji) => setBody((b) => b + emoji)} />
                <Button
                  size="sm"
                  onClick={send}
                  disabled={sending || (!body.trim() && attachments.filter((a) => !a.uploading && a.url).length === 0)}
                  className={`gap-1.5 ${
                    hasMedia
                      ? "bg-emerald-500 hover:bg-emerald-600"
                      : effectiveImessage
                        ? "bg-[#007AFF] hover:bg-[#0066DD]"
                        : "bg-emerald-500 hover:bg-emerald-600"
                  }`}
                  title={
                    hasMedia
                      ? (useImessageRoute ? "iMessage disabled — sending as MMS (media attached)" : "Send MMS")
                      : effectiveImessage ? "Send iMessage" : "Send SMS"
                  }
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span className="text-[11px] font-semibold">
                        {hasMedia ? "MMS" : effectiveImessage ? "iMessage" : "SMS"}
                      </span>
                    </>
                  )}
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
