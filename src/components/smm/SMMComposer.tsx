import { useState } from 'react';
import type { SMMProfile, Platform, PostType } from '@/lib/smm/types';
import { useSMMContext, EXTENDED_PLATFORMS, PLATFORM_META } from '@/lib/smm/context';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Send, Image, Video, FileText, Type, Upload, Link2, CalendarDays, Clock, Columns, AlignJustify, Copy } from 'lucide-react';

const POST_TYPES: { value: PostType; label: string; icon: any }[] = [
  { value: 'video', label: 'Video', icon: Video },
  { value: 'photos', label: 'Photos', icon: Image },
  { value: 'text', label: 'Text', icon: Type },
  { value: 'document', label: 'Document', icon: FileText },
];

const ALL_PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'twitter', 'pinterest'];

const CHAR_LIMITS: Record<string, number> = {
  twitter: 280, instagram: 2200, facebook: 63206, linkedin: 3000, tiktok: 2200, youtube: 5000, pinterest: 500,
};

const PLATFORM_WARNINGS: Record<string, string> = {
  reddit: 'Requires subreddit name (r/)',
  facebook: 'Requires Page ID to publish',
  linkedin: 'Requires Organization ID for company pages',
};

export default function SMMComposer({ profiles, onRefresh }: { profiles: SMMProfile[]; onRefresh: () => void }) {
  const { profileId, platform: ctxPlatform } = useSMMContext();
  const [localProfileId, setLocalProfileId] = useState(profileId || profiles[0]?.id || '');
  const [postType, setPostType] = useState<PostType>('photos');
  const [platforms, setPlatforms] = useState<Platform[]>(ctxPlatform !== 'all' ? [ctxPlatform as Platform] : []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [mediaMode, setMediaMode] = useState<'file' | 'url'>('file');
  const [mediaUrl, setMediaUrl] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'schedule' | 'queue'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'simple' | 'pro'>('simple');
  const [platformOverrides, setPlatformOverrides] = useState<Record<string, { title: string; firstComment: string }>>({});

  const togglePlatform = (p: Platform) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const copyToAll = () => {
    const overrides: Record<string, { title: string; firstComment: string }> = {};
    platforms.forEach(p => { overrides[p] = { title, firstComment }; });
    setPlatformOverrides(overrides);
    toast.success('Caption copied to all platforms');
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (platforms.length === 0) { toast.error('Select at least one platform'); return; }
    setSubmitting(true);
    const profile = profiles.find(p => p.id === localProfileId);
    const scheduledDate = publishMode === 'schedule' && scheduleDate && scheduleTime
      ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
      : null;

    try {
      const overrides: Record<string, { title?: string; first_comment?: string }> = {};
      Object.entries(platformOverrides).forEach(([p, v]) => {
        if (v.title || v.firstComment) overrides[p] = { title: v.title || undefined, first_comment: v.firstComment || undefined };
      });

      await smmApi.createPost({
        user: profile?.username || localProfileId,
        title, description, type: postType, platforms,
        first_comment: firstComment || undefined,
        media_url: mediaUrl || undefined,
        scheduled_date: scheduledDate,
        add_to_queue: publishMode === 'queue',
        platform_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      });

      toast.success(publishMode === 'now' ? 'Post submitted!' : publishMode === 'schedule' ? 'Post scheduled!' : 'Added to queue!');
      setTitle(''); setDescription(''); setFirstComment(''); setPlatforms([]); setMediaUrl(''); setPlatformOverrides({});
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create post');
    }
    setSubmitting(false);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Layout Mode Toggle */}
      <div className="flex items-center gap-2">
        <Button variant={layoutMode === 'simple' ? 'default' : 'outline'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setLayoutMode('simple')}>
          <AlignJustify className="h-3 w-3" /> Simple
        </Button>
        <Button variant={layoutMode === 'pro' ? 'default' : 'outline'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setLayoutMode('pro')}>
          <Columns className="h-3 w-3" /> Pro Mode
        </Button>
      </div>

      <div className={layoutMode === 'pro' ? 'grid lg:grid-cols-[1fr_340px] gap-4' : 'max-w-2xl mx-auto'}>
        {/* Main Composer */}
        <div className="glass-card p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Profile</Label>
              <Select value={localProfileId} onValueChange={setLocalProfileId}>
                <SelectTrigger><SelectValue placeholder="Select profile" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => {
                    const handles = p.connected_platforms
                      .filter(cp => cp.connected)
                      .map(cp => `${PLATFORM_META[cp.platform]?.abbr || cp.platform}: @${cp.display_name}`)
                      .join(' · ');
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{p.username}</span>
                          {handles && <span className="text-[10px] text-muted-foreground">{handles}</span>}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Post Type</Label>
              <div className="flex gap-1.5">
                {POST_TYPES.map(t => (
                  <button key={t.value} onClick={() => setPostType(t.value)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${postType === t.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                    <t.icon className="h-3 w-3" /> {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Platforms</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_PLATFORMS.map(p => (
                <label key={p} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${platforms.includes(p) ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-muted text-muted-foreground border border-transparent'}`}>
                  <Checkbox checked={platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} className="h-3 w-3" />
                  {PLATFORM_META[p]?.abbr || p}
                </label>
              ))}
            </div>
            {platforms.some(p => PLATFORM_WARNINGS[p]) && (
              <div className="space-y-1 mt-2">
                {platforms.filter(p => PLATFORM_WARNINGS[p]).map(p => (
                  <p key={p} className="text-[11px] text-amber-500">⚠ {PLATFORM_META[p]?.label}: {PLATFORM_WARNINGS[p]}</p>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Input placeholder="Title / Caption" value={title} onChange={e => setTitle(e.target.value)} />
              {platforms.length === 1 && CHAR_LIMITS[platforms[0]] && (
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] ${title.length > CHAR_LIMITS[platforms[0]] ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {title.length}/{CHAR_LIMITS[platforms[0]]}
                </span>
              )}
            </div>
            <Textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>

          {postType !== 'text' && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Label className="text-xs font-medium">Media</Label>
                <div className="flex items-center gap-1 text-xs">
                  <button onClick={() => setMediaMode('file')} className={`px-2 py-1 rounded ${mediaMode === 'file' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}><Upload className="h-3 w-3 inline mr-1" />File</button>
                  <button onClick={() => setMediaMode('url')} className={`px-2 py-1 rounded ${mediaMode === 'url' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}><Link2 className="h-3 w-3 inline mr-1" />URL</button>
                </div>
              </div>
              {mediaMode === 'file' ? (
                <div className="flex items-center justify-center border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors">
                  <p className="text-xs text-muted-foreground">Drag & drop or click to upload (mock)</p>
                </div>
              ) : <Input placeholder="https://..." value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} />}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">First Comment (global)</Label>
            <Input placeholder="Optional first comment..." value={firstComment} onChange={e => setFirstComment(e.target.value)} />
          </div>

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

        {/* Pro Mode: Per-Platform Cards */}
        {layoutMode === 'pro' && platforms.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Per-Platform</p>
              <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px]" onClick={copyToAll}>
                <Copy className="h-3 w-3" /> Copy to All
              </Button>
            </div>
            {platforms.map(p => {
              const meta = PLATFORM_META[p];
              const limit = CHAR_LIMITS[p];
              const override = platformOverrides[p] || { title: '', firstComment: '' };
              return (
                <div key={p} className="glass-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${meta?.color}`}>{meta?.abbr}</span>
                    <span className="text-xs font-medium text-foreground">{meta?.label}</span>
                    {limit && <span className={`ml-auto text-[10px] ${(override.title || title).length > limit ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {(override.title || title).length}/{limit}
                    </span>}
                  </div>
                  <Input placeholder={`Caption for ${meta?.label}...`} value={override.title} onChange={e => setPlatformOverrides(prev => ({ ...prev, [p]: { ...prev[p], title: e.target.value, firstComment: prev[p]?.firstComment || '' } }))}
                    className="h-8 text-xs" />
                  <Input placeholder="First comment..." value={override.firstComment} onChange={e => setPlatformOverrides(prev => ({ ...prev, [p]: { ...prev[p], firstComment: e.target.value, title: prev[p]?.title || '' } }))}
                    className="h-8 text-xs" />
                  {PLATFORM_WARNINGS[p] && <p className="text-[10px] text-amber-500">⚠ {PLATFORM_WARNINGS[p]}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
