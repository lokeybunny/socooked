import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone as PhoneIcon, Smartphone, Building2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Role = "cell" | "office" | "twilio_landline";

const ROLE_META: Record<Role, { label: string; description: string; icon: any }> = {
  cell: {
    label: "Cell (VoidFix Android)",
    description: "Used in email signatures and direct-call links. Replacing this updates every place this number appears across settings.",
    icon: Smartphone,
  },
  office: {
    label: "Office (Forwarded line)",
    description: "Twilio forwards inbound calls here. Updating this also rewrites the missed-call forward target.",
    icon: PhoneIcon,
  },
  twilio_landline: {
    label: "Twilio Landline",
    description: "The public Twilio number customers call/text.",
    icon: Building2,
  },
};

function formatDisplay(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
function normalize(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return input.startsWith("+") ? `+${d}` : `+${d}`;
}

export default function ChangeNumberSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Role | null>(null);
  const [numbers, setNumbers] = useState<Record<Role, string>>({
    cell: "+14802200405",
    office: "+17027016192",
    twilio_landline: "+17028298105",
  });
  const [drafts, setDrafts] = useState<Record<Role, string>>({
    cell: "",
    office: "",
    twilio_landline: "",
  });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "business_numbers")
      .maybeSingle();
    const v = (data?.value as any) || {};
    const next = {
      cell: v.cell || "+14802200405",
      office: v.office || "+17027016192",
      twilio_landline: v.twilio_landline || "+17028298105",
    };
    setNumbers(next);
    setDrafts({
      cell: formatDisplay(next.cell),
      office: formatDisplay(next.office),
      twilio_landline: formatDisplay(next.twilio_landline),
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (role: Role) => {
    const newNumber = normalize(drafts[role]);
    if (!/^\+\d{11,15}$/.test(newNumber)) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (newNumber === numbers[role]) {
      toast.info("Number unchanged");
      return;
    }
    const confirmed = window.confirm(
      `Globally replace ${formatDisplay(numbers[role])} with ${formatDisplay(newNumber)}?\n\nEvery place this number appears in settings (email signatures, Twilio forwarding, auto-replies) will be updated.`
    );
    if (!confirmed) return;
    setSaving(role);
    try {
      const { data, error } = await supabase.functions.invoke("business-numbers-update", {
        body: { role, new_number: newNumber, old_number: numbers[role] },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Update failed");
      toast.success(`Updated. ${(data.app_settings_keys_updated || []).length} setting(s) rewritten.`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update number");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" /> Change Number
        </CardTitle>
        <CardDescription>
          Centralized phone numbers for the business. Saving here pushes the change everywhere
          this number is referenced (email signatures, call forwarding, auto-replies).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          (Object.keys(ROLE_META) as Role[]).map((role) => {
            const meta = ROLE_META[role];
            const Icon = meta.icon;
            return (
              <div key={role} className="space-y-2 rounded-lg border border-border p-4">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="h-4 w-4" /> {meta.label}
                </Label>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
                <p className="text-xs text-muted-foreground">
                  Current: <span className="font-mono text-foreground">{formatDisplay(numbers[role])}</span>
                </p>
                <div className="flex gap-2">
                  <Input
                    value={drafts[role]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [role]: e.target.value }))}
                    placeholder="(480) 220-0405"
                  />
                  <Button
                    onClick={() => handleSave(role)}
                    disabled={saving === role}
                    className="gap-2 shrink-0"
                  >
                    {saving === role ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save & Propagate
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
