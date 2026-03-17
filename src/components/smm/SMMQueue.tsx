import { useEffect, useMemo, useState } from 'react';
import type { SMMProfile, QueueSettings, QueueSlot, ScheduledPost } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import PostCard from './PostCard';
import { format } from 'date-fns';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC', 'Europe/London', 'Asia/Tokyo'];

export default function SMMQueue({ profiles, posts }: { profiles: SMMProfile[]; posts: ScheduledPost[] }) {
  const [profileUsername, setProfileUsername] = useState(profiles[0]?.username || '');
  const [settings, setSettings] = useState<QueueSettings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profileUsername) return;
    setLoading(true);
    smmApi.getQueueSettings(profileUsername).then(s => {
      setSettings(s || { profile_id: profileUsername, timezone: 'America/New_York', slots: [] });
      setLoading(false);
    });
  }, [profileUsername]);

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

  // Queued posts: scheduled/queued posts from anchored data, sorted by date
  const queuedPosts = useMemo(() => {
    return posts
      .filter(p => p.scheduled_date && ['scheduled', 'queued', 'pending', 'in_progress'].includes(p.status))
      .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
  }, [posts]);

  const nextPost = queuedPosts[0] ?? null;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Queue Settings</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Profile</Label>
            <Select value={profileUsername} onValueChange={setProfileUsername}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.username}>{p.username}</SelectItem>)}</SelectContent>
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

      <div className="space-y-4">
        {nextPost && (
          <div className="glass-card p-4 flex items-center gap-3 border-primary/20 border">
            <Clock className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Next Queued Post</p>
              <p className="text-xs text-muted-foreground">
                {nextPost.scheduled_date
                  ? format(new Date(nextPost.scheduled_date), 'MMM d') + ' — ' + nextPost.title.slice(0, 40)
                  : nextPost.title.slice(0, 40)}
              </p>
            </div>
          </div>
        )}

        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Queued Posts ({queuedPosts.length})</h3>
          {queuedPosts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{loading ? 'Loading...' : 'No posts in queue.'}</p>
          ) : (
            <div className="space-y-2">
              {queuedPosts.map((p, i) => (
                <div key={p.id} className={`rounded-lg ${i === 0 ? 'ring-1 ring-primary/20' : ''}`}>
                  <PostCard post={p} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
