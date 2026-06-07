import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Calendar, Loader2, CheckCircle2, Instagram, RefreshCw, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { smmApi } from '@/lib/smm/store';
import { uploadToStorage } from '@/lib/storage';
import type { SMMProfile, ScheduledPost } from '@/lib/smm/types';

export default function ReelsUpload() {
  const [profiles, setProfiles] = useState<SMMProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profile, setProfile] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [scheduleAt, setScheduleAt] = useState(''); // datetime-local
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<null | { scheduled: boolean }>(null);
  const [allPosts, setAllPosts] = useState<ScheduledPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const posts = await smmApi.getPosts();
      setAllPosts(posts);
    } catch (e) {
      console.error('[ReelsUpload] load posts failed', e);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const profilePosts = useMemo(() => {
    if (!profile) return [];
    return allPosts
      .filter(p => p.profile_username === profile && p.platforms.includes('instagram'))
      .filter(p => p.status === 'scheduled' || p.status === 'queued' || p.status === 'pending')
      .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
  }, [allPosts, profile]);

  async function handleCancel(post: ScheduledPost) {
    if (!post.job_id) return;
    if (!confirm('Cancel this scheduled post?')) return;
    setCancelingId(post.id);
    try {
      await smmApi.cancelPost(post.job_id);
      toast.success('Scheduled post cancelled');
      setAllPosts(prev => prev.filter(p => p.id !== post.id));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to cancel');
    } finally {
      setCancelingId(null);
    }
  }

  useEffect(() => {
    let mounted = true;
    smmApi.getProfiles().then(list => {
      if (!mounted) return;
      const igProfiles = list.filter(p =>
        p.connected_platforms?.some(cp => cp.platform === 'instagram' && cp.connected),
      );
      const usable = igProfiles.length ? igProfiles : list;
      setProfiles(usable);
      const saved = localStorage.getItem('reels.activeProfile') || '';
      if (saved && usable.some(p => p.username === saved)) setProfile(saved);
      else if (usable[0]?.username) setProfile(usable[0].username);
    }).catch(e => {
      console.error(e);
      toast.error('Failed to load Instagram profiles');
    }).finally(() => mounted && setLoadingProfiles(false));
    return () => { mounted = false; };
  }, []);

  const videoPreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (videoPreview) URL.revokeObjectURL(videoPreview); }, [videoPreview]);

  const minScheduleLocal = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60_000);
    const tz = d.getTimezoneOffset();
    const local = new Date(d.getTime() - tz * 60_000);
    return local.toISOString().slice(0, 16);
  }, []);

  const canSubmit = !!profile && !!file && !uploading;

  async function handleSubmit() {
    if (!file || !profile) return;
    setUploading(true);
    setProgress(5);
    setDone(null);
    try {
      // 1. Upload video to storage
      setProgress(15);
      const mediaUrl = await uploadToStorage(file, {
        category: 'reels',
        customerName: profile,
        source: 'reels-upload',
        fileName: file.name,
      });
      setProgress(65);

      // 2. Convert datetime-local to ISO if scheduled
      let scheduledIso: string | null = null;
      if (scheduleAt) {
        scheduledIso = new Date(scheduleAt).toISOString();
      }

      // 3. Send to Upload-Post via smm-api
      await smmApi.createPost({
        user: profile,
        type: 'video',
        platforms: ['instagram'],
        title: caption || ' ',
        description: caption,
        media_url: mediaUrl,
        scheduled_date: scheduledIso,
      });

      setProgress(100);
      setDone({ scheduled: !!scheduledIso });
      toast.success(scheduledIso ? 'Reel scheduled' : 'Reel uploading to Instagram');
      // Reset
      setFile(null);
      setCaption('');
      setScheduleAt('');
      loadPosts();
    } catch (e: any) {
      console.error('[ReelsUpload] failed:', e);
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Instagram className="h-6 w-6 text-pink-500" /> Reel Upload
            </h1>
            <p className="text-sm text-muted-foreground">Post or schedule an Instagram reel.</p>
          </div>
        </div>

        <Card className="p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Instagram Profile</Label>
              <Link to="/dashboard/instagram-profiles" className="text-xs text-primary hover:underline">Manage</Link>
            </div>
            <Select value={profile} onValueChange={(v) => { setProfile(v); localStorage.setItem('reels.activeProfile', v); }} disabled={loadingProfiles}>
              <SelectTrigger>
                <SelectValue placeholder={loadingProfiles ? 'Loading…' : 'Select a profile'} />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(p => {
                  const ig = p.connected_platforms?.find(cp => cp.platform === 'instagram');
                  return (
                    <SelectItem key={p.id} value={p.username}>
                      {p.username}{ig?.handle ? ` — @${ig.handle}` : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Video File</Label>
            <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/*"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
              {file ? (
                <div className="space-y-2">
                  {videoPreview && (
                    <video src={videoPreview} controls className="max-h-64 mx-auto rounded" />
                  )}
                  <p className="text-sm text-muted-foreground">{file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); setFile(null); }}>Replace</Button>
                </div>
              ) : (
                <div className="space-y-2 text-muted-foreground">
                  <Upload className="h-8 w-8 mx-auto" />
                  <p className="text-sm">Click to choose a video (MP4 recommended)</p>
                </div>
              )}
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption">Caption</Label>
            <Textarea
              id="caption"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write your caption, hashtags, mentions…"
              rows={4}
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Schedule (optional)
            </Label>
            <Input
              id="schedule"
              type="datetime-local"
              value={scheduleAt}
              min={minScheduleLocal}
              onChange={e => setScheduleAt(e.target.value)}
              disabled={uploading}
            />
            <p className="text-xs text-muted-foreground">Leave blank to post immediately.</p>
          </div>

          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">Uploading… {progress}%</p>
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-sm text-green-500 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <CheckCircle2 className="h-4 w-4" />
              {done.scheduled ? 'Reel scheduled successfully.' : 'Reel sent to Instagram. It will appear shortly.'}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full" size="lg">
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
            ) : scheduleAt ? (
              <><Calendar className="h-4 w-4 mr-2" /> Schedule Reel</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Post Reel Now</>
            )}
          </Button>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" /> Schedule
              </h2>
              <p className="text-xs text-muted-foreground">
                {profile ? <>Upcoming posts for <span className="font-medium">@{profile}</span></> : 'Select a profile to view its schedule'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={loadPosts} disabled={loadingPosts}>
              <RefreshCw className={`h-4 w-4 ${loadingPosts ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {loadingPosts && profilePosts.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>
          ) : profilePosts.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
              No scheduled posts for this profile.
            </div>
          ) : (
            <ul className="space-y-2">
              {profilePosts.map(p => {
                const when = p.scheduled_date ? new Date(p.scheduled_date) : null;
                return (
                  <li key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50">
                    {p.preview_url || p.media_url ? (
                      <div className="w-14 h-14 rounded overflow-hidden bg-muted flex-shrink-0">
                        {p.preview_url ? (
                          <img src={p.preview_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <video src={p.media_url} className="w-full h-full object-cover" muted />
                        )}
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Instagram className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] uppercase">{p.status}</Badge>
                        {when && (
                          <span className="text-xs text-muted-foreground">
                            {when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1 line-clamp-2">{p.title || p.description || '(no caption)'}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCancel(p)}
                      disabled={cancelingId === p.id || !p.job_id}
                      title="Cancel scheduled post"
                    >
                      {cancelingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
