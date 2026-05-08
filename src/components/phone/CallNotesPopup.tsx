import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, StickyNote, X, GripHorizontal, FileAudio, Copy, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface CallNotesPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string; // any format
}

function last10(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

function formatPhone(p: string): string {
  const d = last10(p);
  if (d.length !== 10) return p;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const PANEL_WIDTH = 480;
const PANEL_HEIGHT_ESTIMATE = 620;

export default function CallNotesPopup({ open, onOpenChange, phone }: CallNotesPopupProps) {
  const phoneKey = last10(phone);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [notes, setNotes] = useState("");
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Draggable position (top-left in viewport coords). null = not yet positioned.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Initial centered position when opened
  useEffect(() => {
    if (open && pos === null) {
      const x = Math.max(16, (window.innerWidth - PANEL_WIDTH) / 2);
      const y = Math.max(16, (window.innerHeight - PANEL_HEIGHT_ESTIMATE) / 2);
      setPos({ x, y });
    }
  }, [open, pos]);

  useEffect(() => {
    if (!open || !phoneKey || phoneKey.length !== 10) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sms_contacts")
        .select("name,email,instagram,notes")
        .eq("phone_last10", phoneKey)
        .maybeSingle();
      if (cancelled) return;
      setName((data as any)?.name || "");
      setEmail((data as any)?.email || "");
      setInstagram((data as any)?.instagram || "");
      setNotes((data as any)?.notes || "");
      const { data: tx } = await supabase
        .from("contact_transcripts")
        .select("id,title,filename,summary,client_wants,chatgpt_prompt,transcript,created_at,duration_seconds,sentiment,conversation_type")
        .eq("phone_last10", phoneKey)
        .order("created_at", { ascending: false });
      setTranscripts(tx || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, phoneKey]);

  // Drag handlers (pointer events for mouse + touch)
  function onPointerDownHeader(e: React.PointerEvent<HTMLDivElement>) {
    if (!panelRef.current || !pos) return;
    // Ignore drag when clicking the close button
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
    };
  }

  function onPointerMoveHeader(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    e.stopPropagation();
    const rect = panelRef.current?.getBoundingClientRect();
    const w = rect?.width ?? PANEL_WIDTH;
    const h = rect?.height ?? PANEL_HEIGHT_ESTIMATE;
    const nextX = Math.min(
      Math.max(0, e.clientX - dragRef.current.offsetX),
      Math.max(0, window.innerWidth - w),
    );
    const nextY = Math.min(
      Math.max(0, e.clientY - dragRef.current.offsetY),
      Math.max(0, window.innerHeight - 40), // keep header reachable
    );
    setPos({ x: nextX, y: nextY });
  }

  function onPointerUpHeader(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  // Reset position when closed so it re-centers next time
  useEffect(() => {
    if (!open) {
      // small delay so close animation doesn't jump
      const t = setTimeout(() => setPos(null), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function save() {
    if (phoneKey.length !== 10) {
      toast.error("Invalid phone number");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("sms_contacts").upsert(
      {
        phone_last10: phoneKey,
        phone: "+1" + phoneKey,
        name: name || null,
        email: email || null,
        instagram: instagram || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "phone_last10" },
    );
    setSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success("Notes saved");
    }
  }

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Contact Notes"
      className="fixed z-[100] rounded-xl border border-border bg-background shadow-2xl pointer-events-auto"
      style={{
        top: pos.y,
        left: pos.x,
        width: PANEL_WIDTH,
      }}
    >
      {/* Drag handle / header */}
      <div
        onPointerDown={onPointerDownHeader}
        onPointerMove={onPointerMoveHeader}
        onPointerUp={onPointerUpHeader}
        onPointerCancel={onPointerUpHeader}
        className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border cursor-grab active:cursor-grabbing select-none rounded-t-xl bg-muted/30"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
          <StickyNote className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">Contact Notes</div>
            <div className="text-xs text-muted-foreground leading-tight truncate">
              {formatPhone(phone)} — follows this contact across Phone & SMS
            </div>
          </div>
        </div>
        <button
          data-no-drag
          onClick={() => onOpenChange(false)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cn-name">Name</Label>
              <Input id="cn-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cn-email">Email</Label>
                <Input id="cn-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cn-ig">Instagram</Label>
                <Input id="cn-ig" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@handle" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-notes">Notes</Label>
              <Textarea
                id="cn-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything important about this contact…"
                rows={6}
              />
            </div>
            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Notes
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
