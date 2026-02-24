import { useState, useMemo } from 'react';
import type { ScheduledPost, Platform, PostStatus } from '@/lib/smm/types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

const ALL_PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'twitter', 'pinterest'];
const ALL_STATUSES: PostStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'scheduled', 'queued', 'cancelled'];

export default function SMMHistory({ posts }: { posts: ScheduledPost[] }) {
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProfile, setFilterProfile] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const profiles = useMemo(() => [...new Set(posts.map(p => p.profile_username))], [posts]);

  const filtered = useMemo(() => {
    return posts
      .filter(p => filterPlatform === 'all' || p.platforms.includes(filterPlatform as Platform))
      .filter(p => filterStatus === 'all' || p.status === filterStatus)
      .filter(p => filterProfile === 'all' || p.profile_username === filterProfile)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [posts, filterPlatform, filterStatus, filterProfile]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={filterProfile} onValueChange={setFilterProfile}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Profile" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Profiles</SelectItem>
            {profiles.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {ALL_PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left p-3 font-medium">Time</th>
              <th className="text-left p-3 font-medium">Profile</th>
              <th className="text-left p-3 font-medium">Type</th>
              <th className="text-left p-3 font-medium">Title</th>
              <th className="text-left p-3 font-medium">Platforms</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <>
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                  <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{format(new Date(p.created_at), 'MMM d, h:mm a')}</td>
                  <td className="p-3 font-medium">{p.profile_username}</td>
                  <td className="p-3 text-xs text-muted-foreground">{p.type}</td>
                  <td className="p-3 truncate max-w-[180px]">{p.title}</td>
                  <td className="p-3 text-xs text-muted-foreground">{p.platforms.join(', ')}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                      p.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}>{p.status}</span>
                  </td>
                  <td className="p-3">{expandedId === p.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}</td>
                </tr>
                {expandedId === p.id && (
                  <tr key={`${p.id}-detail`}>
                    <td colSpan={7} className="bg-muted/30 p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-muted-foreground">Request ID:</span><p className="font-mono">{p.request_id}</p></div>
                        <div><span className="text-muted-foreground">Job ID:</span><p className="font-mono">{p.job_id}</p></div>
                        <div><span className="text-muted-foreground">Scheduled:</span><p>{p.scheduled_date ? format(new Date(p.scheduled_date), 'MMM d, h:mm a') : '—'}</p></div>
                        <div><span className="text-muted-foreground">Published:</span><p>{p.published_at ? format(new Date(p.published_at), 'MMM d, h:mm a') : '—'}</p></div>
                        {p.error && <div className="col-span-full"><span className="text-destructive">Error:</span><p>{p.error}</p></div>}
                        {p.post_urls.length > 0 && (
                          <div className="col-span-full">
                            <span className="text-muted-foreground">Post URLs:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {p.post_urls.map(u => (
                                <a key={u.platform} href={u.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{u.platform}</a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No posts match filters</p>}
      </div>
    </div>
  );
}
