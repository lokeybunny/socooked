import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { toast } from "sonner";

export default function ReplySettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reply-engine?action=settings`,
      {
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );
    const data = await res.json();
    setSettings(data.settings || {});
  };

  useEffect(() => { fetchSettings(); }, []);

  const saveSettings = async () => {
    setSaving(true);
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reply-engine?action=update-settings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(settings),
      }
    );
    const data = await res.json();
    if (data.ok) toast.success("Settings saved");
    else toast.error("Failed to save");
    setSaving(false);
  };

  const update = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="grid gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Voice & Tone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Brand Voice</Label>
            <Textarea
              value={settings.brand_voice || ""}
              onChange={(e) => update("brand_voice", e.target.value)}
              placeholder="Professional, witty, crypto-native..."
              className="mt-1"
            />
          </div>
          <div>
            <Label>Tone Preset</Label>
            <Select value={settings.tone_preset || "balanced"} onValueChange={(v) => update("tone_preset", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CTA & Sending</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>CTA Enabled</Label>
            <Switch checked={settings.cta_enabled === true} onCheckedChange={(v) => update("cta_enabled", v)} />
          </div>
          {settings.cta_enabled && (
            <div>
              <Label>CTA Text</Label>
              <Input
                value={settings.cta_text || ""}
                onChange={(e) => update("cta_text", e.target.value)}
                placeholder="Check out $TOKEN"
                className="mt-1"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label>Manual Approval Required</Label>
            <Switch checked={settings.manual_approval !== false} onCheckedChange={(v) => update("manual_approval", v)} />
          </div>
          <div>
            <Label>Daily Send Cap</Label>
            <Input
              type="number"
              value={settings.daily_send_cap || 25}
              onChange={(e) => update("daily_send_cap", parseInt(e.target.value) || 25)}
              className="mt-1 w-32"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-red-400">Kill Switch</Label>
              <p className="text-xs text-muted-foreground">Immediately stops all outbound sending</p>
            </div>
            <Switch
              checked={settings.kill_switch === true}
              onCheckedChange={(v) => update("kill_switch", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={saving} className="w-fit">
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
