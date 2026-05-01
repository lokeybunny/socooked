import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, StickyNote } from "lucide-react";
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

export default function CallNotesPopup({ open, onOpenChange, phone }: CallNotesPopupProps) {
  const phoneKey = last10(phone);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [notes, setNotes] = useState("");

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
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, phoneKey]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            Contact Notes
          </DialogTitle>
          <DialogDescription>
            {formatPhone(phone)} — saved notes follow this contact across Phone & SMS.
          </DialogDescription>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
