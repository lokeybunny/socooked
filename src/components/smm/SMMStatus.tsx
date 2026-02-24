import { useState } from 'react';
import { smmApi } from '@/lib/smm/store';
import type { ScheduledPost } from '@/lib/smm/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

export default function SMMStatus() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ScheduledPost | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const q = query.trim();
      const isJobId = q.startsWith('job_') || !q.startsWith('req_');
      const data = await smmApi.getPostStatus(isJobId ? { job_id: q } : { request_id: q });
      if (data) {
        setResult({
          id: data.id || q, job_id: data.job_id || q, request_id: data.request_id || '',
          profile_id: data.user || '', profile_username: data.user || '', title: data.title || '',
          type: data.type || 'text', platforms: data.platforms || [], status: data.status || 'pending',
          scheduled_date: data.scheduled_date || null, post_urls: (data.platform_results || []).map((r: any) => ({ platform: r.platform, url: r.url || '' })),
          created_at: data.created_at || new Date().toISOString(), error: data.error,
        } as ScheduledPost);
      } else {
        setResult(null);
      }
    } catch { setResult(null); }
    setLoading(false);
  };

  const handlePoll = async () => {
    if (!result) return;
    setPolling(true);
    try {
      const data = await smmApi.getPostStatus({ job_id: result.job_id || undefined, request_id: result.request_id || undefined });
      if (data) {
        setResult(prev => prev ? { ...prev, status: data.status, post_urls: (data.platform_results || []).map((r: any) => ({ platform: r.platform, url: r.url || '' })), error: data.error } : null);
      }
    } catch {}
    setPolling(false);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Look up by Request ID or Job ID</h3>
        <div className="flex gap-2">
          <Input placeholder="req_001 or job_001" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          <Button onClick={handleSearch} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
          </Button>
        </div>
      </div>

      {result === null && <p className="text-sm text-muted-foreground text-center py-4">No job found for that ID</p>}

      {result && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{result.title}</h3>
            <Button variant="outline" size="sm" onClick={handlePoll} disabled={polling} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${polling ? 'animate-spin' : ''}`} /> Poll Status
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              result.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
              result.status === 'failed' ? 'bg-destructive/10 text-destructive' :
              result.status === 'in_progress' ? 'bg-amber-400/10 text-amber-500' :
              'bg-muted text-muted-foreground'
            }`}>{result.status}</span>
            <span className="text-xs text-muted-foreground">{result.type} · {result.profile_username}</span>
          </div>

          {/* Progress bar mock */}
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${
              result.status === 'completed' ? 'w-full bg-emerald-500' :
              result.status === 'in_progress' ? 'w-2/3 bg-amber-400' :
              result.status === 'pending' ? 'w-1/4 bg-muted-foreground' :
              result.status === 'failed' ? 'w-1/2 bg-destructive' : 'w-0'
            }`} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">Job ID</span><p className="font-mono">{result.job_id}</p></div>
            <div><span className="text-muted-foreground">Request ID</span><p className="font-mono">{result.request_id}</p></div>
            <div><span className="text-muted-foreground">Created</span><p>{format(new Date(result.created_at), 'MMM d, h:mm a')}</p></div>
            <div><span className="text-muted-foreground">Platforms</span><p>{result.platforms.join(', ')}</p></div>
          </div>

          {result.post_urls.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Published URLs:</p>
              {result.post_urls.map(u => (
                <a key={u.platform} href={u.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">{u.platform}: {u.url}</a>
              ))}
            </div>
          )}

          {result.error && <p className="text-sm text-destructive">Error: {result.error}</p>}
        </div>
      )}
    </div>
  );
}
