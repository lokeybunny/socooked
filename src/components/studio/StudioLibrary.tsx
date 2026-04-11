import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStudioJobs } from '@/lib/studio/hooks';
import { TASK_LABELS, STATUS_COLORS, type GenerationJob, type TaskType, type JobStatus } from '@/lib/studio/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Film, Search, Download, Copy, Trash2, Loader2, Play, X } from 'lucide-react';

export function StudioLibrary() {
  const { jobs, loading, refetch } = useStudioJobs();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortDir, setSortDir] = useState<'newest' | 'oldest'>('newest');
  const [selected, setSelected] = useState<GenerationJob | null>(null);

  const filtered = jobs
    .filter(j => filterType === 'all' || j.task_type === filterType)
    .filter(j => filterStatus === 'all' || j.status === filterStatus)
    .filter(j => !search || j.prompt.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortDir === 'newest'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  const handleDelete = async (id: string) => {
    await supabase.from('generation_jobs').delete().eq('id', id);
    toast({ title: 'Deleted' });
    refetch();
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompts..." className="pl-9 bg-card/50" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px] bg-card/50"><SelectValue placeholder="Task Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.keys(TASK_LABELS) as TaskType[]).map(t => <SelectItem key={t} value={t}>{TASK_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px] bg-card/50"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(['queued','provisioning','running','completed','failed','cancelled'] as JobStatus[]).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={v => setSortDir(v as 'newest' | 'oldest')}>
          <SelectTrigger className="w-[120px] bg-card/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-16 text-center text-muted-foreground">
            <Film className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No generations found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(job => (
            <Card key={job.id} className="border-border/50 bg-card/50 overflow-hidden group hover:border-violet-500/30 transition-colors cursor-pointer" onClick={() => setSelected(job)}>
              <div className="aspect-video bg-muted/30 relative flex items-center justify-center">
                {job.output_thumbnail_url ? (
                  <img src={job.output_thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : job.output_video_url ? (
                  <video src={job.output_video_url} className="w-full h-full object-cover" muted />
                ) : (
                  <Film className="w-8 h-8 text-muted-foreground/20" />
                )}
                {job.status === 'running' && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                  </div>
                )}
                {job.status === 'completed' && job.output_video_url && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Play className="w-10 h-10 text-white" />
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <p className="text-sm truncate">{job.prompt}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[job.status]}`}>{job.status}</Badge>
                  <Badge variant="outline" className="text-[10px]">{TASK_LABELS[job.task_type]}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={STATUS_COLORS[selected.status]}>{selected.status}</Badge>
                  <span className="truncate">{selected.prompt.slice(0, 60)}</span>
                </DialogTitle>
              </DialogHeader>

              {/* Video Preview */}
              {selected.output_video_url ? (
                <video src={selected.output_video_url} controls className="w-full rounded-lg aspect-video bg-black" />
              ) : selected.output_thumbnail_url ? (
                <img src={selected.output_thumbnail_url} alt="" className="w-full rounded-lg" />
              ) : (
                <div className="aspect-video bg-muted/30 rounded-lg flex items-center justify-center">
                  <Film className="w-12 h-12 text-muted-foreground/20" />
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Type:</span> {TASK_LABELS[selected.task_type]}</div>
                <div><span className="text-muted-foreground">Progress:</span> {selected.progress}%</div>
                <div className="col-span-2"><span className="text-muted-foreground">Prompt:</span> {selected.prompt}</div>
                {selected.negative_prompt && <div className="col-span-2"><span className="text-muted-foreground">Negative:</span> {selected.negative_prompt}</div>}
                {selected.error_message && (
                  <div className="col-span-2 p-2 bg-red-950/30 border border-red-500/30 rounded text-xs text-red-300">{selected.error_message}</div>
                )}
                {selected.settings_json && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Settings:</span>
                    <pre className="mt-1 text-xs bg-muted/30 p-2 rounded overflow-auto max-h-[100px]">{JSON.stringify(selected.settings_json, null, 2)}</pre>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {selected.output_video_url && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(selected.output_video_url!, '_blank')}>
                    <Download className="w-3 h-3" /> Download
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => { navigator.clipboard.writeText(selected.prompt); toast({ title: 'Prompt copied' }); }}>
                  <Copy className="w-3 h-3" /> Copy Prompt
                </Button>
                <Button variant="destructive" size="sm" className="gap-1 ml-auto" onClick={() => handleDelete(selected.id)}>
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
