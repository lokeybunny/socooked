import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Calendar, Loader2, CheckCircle2, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { smmApi } from '@/lib/smm/store';
import { uploadToStorage } from '@/lib/storage';
import type { SMMProfile } from '@/lib/smm/types';

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

  useEffect(() => {
    let mounted = true;
    smmApi.getProfiles().then(list => {
      if (!mounted) return;
      // Only profiles with Instagram connected
      const igProfiles = list.filter(p =>
        p.connected_platforms?.some(cp => cp.platform === 'instagram' && cp.connected),
      );
      setProfiles(igProfiles.length ? igProfiles : list);
      if ((igProfiles[0] || list[0])?.username) setProfile((igProfiles[0] || list[0]).username);
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
            <Label>Instagram Profile</Label>
            <Select value={profile} onValueChange={setProfile} disabled={loadingProfiles}>
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
      </div>
    </div>
  );
}
