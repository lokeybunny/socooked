import { useState } from 'react';
import type { SMMProfile, Platform, PostType } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Send, Image, Video, FileText, Type, Upload, Link2, CalendarDays, Clock } from 'lucide-react';

const POST_TYPES: { value: PostType; label: string; icon: any }[] = [
  { value: 'video', label: 'Video', icon: Video },
  { value: 'photos', label: 'Photos', icon: Image },
  { value: 'text', label: 'Text', icon: Type },
  { value: 'document', label: 'Document', icon: FileText },
];

const ALL_PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'twitter', 'pinterest'];

export default function SMMComposer({ profiles, onRefresh }: { profiles: SMMProfile[]; onRefresh: () => void }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [postType, setPostType] = useState<PostType>('photos');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [mediaMode, setMediaMode] = useState<'file' | 'url'>('file');
  const [mediaUrl, setMediaUrl] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'schedule' | 'queue'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const togglePlatform = (p: Platform) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (platforms.length === 0) { toast.error('Select at least one platform'); return; }
    setSubmitting(true);
    const profile = profiles.find(p => p.id === profileId);
    const scheduledDate = publishMode === 'schedule' && scheduleDate && scheduleTime
      ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
      : publishMode === 'queue' ? new Date(Date.now() + 86400000).toISOString() : null;

    await smmApi.createPost({
      profile_id: profileId,
      profile_username: profile?.username || '',
      title, description, type: postType, platforms,
      first_comment: firstComment || undefined,
      scheduled_date: scheduledDate,
      status: publishMode === 'now' ? 'pending' : publishMode === 'queue' ? 'queued' : 'scheduled',
    });

    toast.success(publishMode === 'now' ? 'Post submitted!' : publishMode === 'schedule' ? 'Post scheduled!' : 'Added to queue!');
    setTitle(''); setDescription(''); setFirstComment(''); setPlatforms([]); setMediaUrl('');
    setSubmitting(false);
    onRefresh();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="glass-card p-6 space-y-5">
        {/* Profile Select */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Profile</Label>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger><SelectValue placeholder="Select profile" /></SelectTrigger>
            <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Post Type */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Post Type</Label>
          <div className="flex gap-2">
            {POST_TYPES.map(t => (
              <button key={t.value} onClick={() => setPostType(t.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${postType === t.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Platform Select */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Platforms</Label>
          <div className="flex flex-wrap gap-2">
            {ALL_PLATFORMS.map(p => (
              <label key={p} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${platforms.includes(p) ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-muted text-muted-foreground border border-transparent'}`}>
                <Checkbox checked={platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} className="h-3.5 w-3.5" />
                {p}
              </label>
            ))}
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-3">
          <Input placeholder="Title / Caption" value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>

        {/* Media */}
        {postType !== 'text' && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-medium">Media</Label>
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => setMediaMode('file')} className={`px-2 py-1 rounded ${mediaMode === 'file' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}><Upload className="h-3 w-3 inline mr-1" />File</button>
                <button onClick={() => setMediaMode('url')} className={`px-2 py-1 rounded ${mediaMode === 'url' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}><Link2 className="h-3 w-3 inline mr-1" />URL</button>
              </div>
            </div>
            {mediaMode === 'file' ? (
              <div className="flex items-center justify-center border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors">
                <p className="text-xs text-muted-foreground">Drag & drop or click to upload (mock)</p>
              </div>
            ) : (
              <Input placeholder="https://..." value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} />
            )}
          </div>
        )}

        {/* First Comment */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">First Comment (global)</Label>
          <Input placeholder="Optional first comment..." value={firstComment} onChange={e => setFirstComment(e.target.value)} />
        </div>

        {/* Publishing Options */}
        <div className="space-y-3 border-t border-border pt-4">
          <Label className="text-xs font-medium">Publishing</Label>
          <div className="flex gap-2">
            {[
              { v: 'now' as const, label: 'Post Now', icon: Send },
              { v: 'schedule' as const, label: 'Schedule', icon: CalendarDays },
              { v: 'queue' as const, label: 'Add to Queue', icon: Clock },
            ].map(o => (
              <button key={o.v} onClick={() => setPublishMode(o.v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${publishMode === o.v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                <o.icon className="h-3.5 w-3.5" /> {o.label}
              </button>
            ))}
          </div>
          {publishMode === 'schedule' && (
            <div className="flex gap-2">
              <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="flex-1" />
              <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-32" />
            </div>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2" size="lg">
          <Send className="h-4 w-4" />
          {submitting ? 'Submitting...' : publishMode === 'now' ? 'Post Now' : publishMode === 'schedule' ? 'Schedule Post' : 'Add to Queue'}
        </Button>
      </div>
    </div>
  );
}
