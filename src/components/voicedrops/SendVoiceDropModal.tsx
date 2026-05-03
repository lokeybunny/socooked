import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lrSendVoiceDrop } from "@/lib/leadsrain";

type Campaign = {
  id: string;
  campaign_name: string;
  caller_id: string | null;
  audio_url: string | null;
  is_active: boolean;
  provider_campaign_id: string | null;
  provider_list_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPhone?: string | null;
  contactName?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  onSent?: (dropId: string) => void;
};

export default function SendVoiceDropModal({ open, onOpenChange, defaultPhone, contactName, customerId, leadId, onSent }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { setPhone(defaultPhone || ""); }, [defaultPhone]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from("leadsrain_campaigns").select("*").order("is_active", { ascending: false });
      const list = (data || []) as Campaign[];
      setCampaigns(list);
      const def = list.find(c => c.is_active) || list[0];
      if (def) setCampaignId(def.id);
    })();
  }, [open]);

  const selected = campaigns.find(c => c.id === campaignId);

  async function send() {
    if (!confirmed) return toast.error("Please confirm consent before sending.");
    if (!phone) return toast.error("Phone number required.");
    if (!campaignId) return toast.error("Select a campaign first.");
    setSending(true);
    try {
      const result = await lrSendVoiceDrop({
        phone_number: phone,
        campaign_id: campaignId,
        customer_id: customerId || null,
        lead_id: leadId || null,
      });
      if (!result.ok) throw new Error(result.error || "Send failed");
      toast.success(
        `Voice drop sent${result.voidfix_sms_sent ? " + VoidFix SMS fired" : ""}`,
      );
      onSent?.(result.drop_id!);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send voice drop");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Voicemail className="h-4 w-4 text-amber-400" /> Send Voice Drop
          </DialogTitle>
          <DialogDescription>
            {contactName ? `${contactName} — ` : ""}via LeadsRain. VoidFix SMS follows automatically on success.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="Select a campaign" /></SelectTrigger>
              <SelectContent>
                {campaigns.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No campaigns yet — add one in /voice-drops Settings.</div>}
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.campaign_name}{c.is_active ? " ★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs space-y-1">
              <div><span className="text-muted-foreground">Caller ID:</span> {selected.caller_id || "—"}</div>
              <div><span className="text-muted-foreground">Audio:</span> {selected.audio_url ? <a href={selected.audio_url} target="_blank" rel="noreferrer" className="text-emerald-400 underline">Preview</a> : "—"}</div>
              <div><span className="text-muted-foreground">Provider list:</span> {selected.provider_list_id || <span className="text-amber-400">missing</span>}</div>
            </div>
          )}

          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1XXXXXXXXXX" />
          </div>

          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
            <span>I confirm I have consent / the contact is opted in for outreach.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={sending || !confirmed} className="bg-amber-500 hover:bg-amber-600 text-black">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Voice Drop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
