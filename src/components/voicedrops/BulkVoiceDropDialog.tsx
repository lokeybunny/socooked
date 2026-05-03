import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lrSendVoiceDrop } from "@/lib/leadsrain";

export type BulkLead = { id?: string; customer_id?: string | null; phone: string | null; name?: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: BulkLead[];
};

export default function BulkVoiceDropDialog({ open, onOpenChange, leads }: Props) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ phone: string; ok: boolean; msg: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setResults([]); setProgress(0); setConfirmed(false);
    (async () => {
      const { data } = await supabase.from("leadsrain_campaigns").select("*").order("is_active", { ascending: false });
      setCampaigns(data || []);
      const def = (data || []).find((c: any) => c.is_active) || data?.[0];
      if (def) setCampaignId(def.id);
    })();
  }, [open]);

  const valid = leads.filter(l => l.phone && String(l.phone).replace(/\D/g, "").length >= 10);

  async function run() {
    if (!confirmed) return toast.error("Confirm consent first.");
    if (!campaignId) return toast.error("Select campaign.");
    setSending(true);
    const out: typeof results = [];
    for (let i = 0; i < valid.length; i++) {
      const l = valid[i];
      try {
        const r = await lrSendVoiceDrop({
          phone_number: l.phone!,
          campaign_id: campaignId,
          customer_id: l.customer_id || null,
          lead_id: l.id || null,
        });
        out.push({ phone: l.phone!, ok: !!r.ok, msg: r.ok ? "sent" : (r.error || "failed") });
      } catch (e: any) {
        out.push({ phone: l.phone!, ok: false, msg: e?.message || "error" });
      }
      setResults([...out]);
      setProgress(Math.round(((i + 1) / valid.length) * 100));
      // Tiny rate limit: 1s
      await new Promise(r => setTimeout(r, 1000));
    }
    setSending(false);
    toast.success(`Bulk done: ${out.filter(o => o.ok).length}/${valid.length} sent`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Voicemail className="h-4 w-4 text-amber-400" /> Bulk Voice Drops</DialogTitle>
          <DialogDescription>
            {valid.length} valid contact(s) of {leads.length} selected. Invalid numbers will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.campaign_name}{c.is_active ? " ★" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
            <span>I confirm I have consent for all contacts in this batch.</span>
          </label>

          {sending && <div className="text-xs text-muted-foreground">Progress: {progress}%</div>}

          {results.length > 0 && (
            <div className="max-h-48 overflow-auto rounded border border-border text-xs">
              {results.map((r, i) => (
                <div key={i} className={`px-2 py-1 border-b border-border/40 flex justify-between ${r.ok ? "" : "text-red-400"}`}>
                  <span>{r.phone}</span><span>{r.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Close</Button>
          <Button onClick={run} disabled={sending || !confirmed || valid.length === 0} className="bg-amber-500 hover:bg-amber-600 text-black">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Send ${valid.length} Drops`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
