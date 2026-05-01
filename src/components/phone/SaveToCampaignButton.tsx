import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ListPlus, Loader2 } from "lucide-react";

type Props = {
  phone: string;
  contactName?: string | null;
  customerId?: string | null;
};

type CampaignOption = { id: string; name: string; status: string };

const NEW_VALUE = "__new__";

export function SaveToCampaignButton({ phone, contactName, customerId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selected, setSelected] = useState<string>(NEW_VALUE);
  const [newName, setNewName] = useState("Voicemail Callbacks");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("powerdial_campaigns")
        .select("id, name, status")
        .in("status", ["idle", "paused", "running"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const list = (data || []) as CampaignOption[];
      setCampaigns(list);
      setSelected(list.length > 0 ? list[0].id : NEW_VALUE);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");

      let campaignId = selected;
      if (selected === NEW_VALUE) {
        const name = newName.trim() || "Voicemail Callbacks";
        const { data: created, error: cErr } = await supabase
          .from("powerdial_campaigns")
          .insert({ name, created_by: uid, status: "idle" })
          .select("id")
          .single();
        if (cErr) throw cErr;
        campaignId = created.id;
      }

      // Find next position
      const { data: lastPos } = await supabase
        .from("powerdial_queue")
        .select("position")
        .eq("campaign_id", campaignId)
        .order("position", { ascending: false })
        .limit(1);
      const nextPos = (lastPos?.[0]?.position ?? -1) + 1;

      // Avoid duplicates by phone within same campaign
      const { data: existing } = await supabase
        .from("powerdial_queue")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("phone", phone)
        .limit(1);

      if (existing && existing.length > 0) {
        toast({ title: "Already in campaign", description: phone });
      } else {
        const { error: qErr } = await supabase.from("powerdial_queue").insert({
          campaign_id: campaignId,
          phone,
          contact_name: contactName || null,
          customer_id: customerId || null,
          position: nextPos,
          status: "pending",
        });
        if (qErr) throw qErr;

        // Bump total_leads count
        const { data: campRow } = await supabase
          .from("powerdial_campaigns")
          .select("total_leads")
          .eq("id", campaignId)
          .single();
        await supabase
          .from("powerdial_campaigns")
          .update({ total_leads: (campRow?.total_leads ?? 0) + 1 })
          .eq("id", campaignId);

        toast({ title: "Saved to campaign", description: phone });
      }
      setOpen(false);
    } catch (e) {
      toast({
        title: "Save failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ListPlus className="h-3 w-3" /> Save to campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to PowerD campaign</DialogTitle>
          <DialogDescription>
            Add {phone} {contactName ? `(${contactName})` : ""} to a PowerDial campaign queue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Campaign</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : (
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.status}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_VALUE}>+ Create new campaign</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {selected === NEW_VALUE && (
            <div className="space-y-1">
              <Label>New campaign name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
