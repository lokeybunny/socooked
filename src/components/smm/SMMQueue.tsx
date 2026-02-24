import { useEffect, useState } from 'react';
import type { SMMProfile, QueueSettings, QueueSlot } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC', 'Europe/London', 'Asia/Tokyo'];

export default function SMMQueue({ profiles }: { profiles: SMMProfile[] }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [settings, setSettings] = useState<QueueSettings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    smmApi.getQueueSettings(profileId).then(s => {
      setSettings(s || { profile_id: profileId, timezone: 'America/New_York', slots: [] });
      setLoading(false);
    });
  }, [profileId]);

  const addSlot = () => {
    if (!settings) return;
    setSettings({ ...settings, slots: [...settings.slots, { day: 1, time: '09:00' }] });
  };

  const removeSlot = (i: number) => {
    if (!settings) return;
    setSettings({ ...settings, slots: settings.slots.filter((_, idx) => idx !== i) });
  };

  const updateSlot = (i: number, field: keyof QueueSlot, value: any) => {
    if (!settings) return;
    const updated = [...settings.slots];
    updated[i] = { ...updated[i], [field]: value };
    setSettings({ ...settings, slots: updated });
  };

  const handleSave = async () => {
    if (!settings) return;
    await smmApi.saveQueueSettings(settings);
    toast.success('Queue settings saved');
  };

  // Build next 10 queue preview slots
  const previewSlots = settings ? (() => {
    const now = new Date();
    const slots: { datetime: Date; slot: QueueSlot }[] = [];
    for (let d = 0; d < 14 && slots.length < 10; d++) {
      const date = new Date(now.getTime() + d * 86400000);
      const dow = date.getDay();
      const daySlots = settings.slots.filter(s => s.day === dow).sort((a, b) => a.time.localeCompare(b.time));
      for (const s of daySlots) {
        const [h, m] = s.time.split(':').map(Number);
        const dt = new Date(date);
        dt.setHours(h, m, 0, 0);
        if (dt > now) slots.push({ datetime: dt, slot: s });
        if (slots.length >= 10) break;
      }
    }
    return slots;
  })() : [];

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Queue Settings</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Profile</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {settings && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Timezone</Label>
                <Select value={settings.timezone} onValueChange={v => setSettings({ ...settings, timezone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIMEZONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Slots ({settings.slots.length})</Label>
                  <Button variant="outline" size="sm" onClick={addSlot} disabled={settings.slots.length >= 24} className="gap-1 h-7"><Plus className="h-3 w-3" /> Add</Button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {settings.slots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                      <Select value={String(slot.day)} onValueChange={v => updateSlot(i, 'day', Number(v))}>
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{DAYS.map((d, di) => <SelectItem key={di} value={String(di)}>{d.slice(0, 3)}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="time" value={slot.time} onChange={e => updateSlot(i, 'time', e.target.value)} className="w-24 h-8 text-xs" />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeSlot(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={handleSave} className="w-full">Save Settings</Button>
            </>
          )}
        </div>
      </div>

      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Queue Preview</h3>
        {previewSlots.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No upcoming queue slots</p>
        ) : (
          <div className="space-y-2">
            {previewSlots.map((s, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${i === 0 ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'}`}>
                <Clock className={`h-4 w-4 shrink-0 ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{DAYS[s.slot.day]}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.datetime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {s.slot.time}
                  </p>
                </div>
                {i === 0 && <span className="ml-auto text-xs font-medium text-primary">Next Slot</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
