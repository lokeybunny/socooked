import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStudioJobs, useWorkerHealth } from '@/lib/studio/hooks';
import { TASK_LABELS, STATUS_COLORS } from '@/lib/studio/types';
import type { GenerationJob } from '@/lib/studio/types';
import { Loader2, CheckCircle, XCircle, Clock, Cpu, Plus, Film } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function StudioDashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { jobs, loading } = useStudioJobs();
  const { health } = useWorkerHealth();

  const queued = jobs.filter(j => j.status === 'queued' || j.status === 'provisioning').length;
  const running = jobs.filter(j => j.status === 'running').length;
  const completed = jobs.filter(j => j.status === 'completed').length;
  const failed = jobs.filter(j => j.status === 'failed').length;
  const recent = jobs.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<Clock className="w-4 h-4 text-yellow-400" />} label="In Queue" value={queued + running} />
        <StatCard icon={<CheckCircle className="w-4 h-4 text-green-400" />} label="Completed" value={completed} />
        <StatCard icon={<XCircle className="w-4 h-4 text-red-400" />} label="Failed" value={failed} />
        <StatCard icon={<Film className="w-4 h-4 text-violet-400" />} label="Total Jobs" value={jobs.length} />
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">GPU Backend</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${health?.online ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">{health?.online ? 'Online' : 'Offline'}</span>
            </div>
            {health?.hardware_tier && health.hardware_tier !== 'unknown' && (
              <p className="text-[10px] text-muted-foreground mt-1">{health.hardware_tier}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Create */}
      <Card className="border-border/50 bg-gradient-to-r from-violet-950/30 to-fuchsia-950/30 backdrop-blur">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">Create New Generation</h3>
            <p className="text-sm text-muted-foreground">Text-to-video, image-to-video, and more</p>
          </div>
          <Button onClick={() => onNavigate('create')} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Plus className="w-4 h-4" /> New Generation
          </Button>
        </CardContent>
      </Card>

      {/* Recent Generations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Recent Generations</h3>
          {jobs.length > 6 && (
            <Button variant="ghost" size="sm" onClick={() => onNavigate('library')}>View All</Button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : recent.length === 0 ? (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-12 text-center text-muted-foreground">
              <Film className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No generations yet. Create your first one!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function JobCard({ job }: { job: GenerationJob }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden group hover:border-violet-500/30 transition-colors">
      <div className="aspect-video bg-muted/30 relative flex items-center justify-center">
        {job.output_thumbnail_url ? (
          <img src={job.output_thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : job.output_video_url ? (
          <video src={job.output_video_url} className="w-full h-full object-cover" muted />
        ) : (
          <Film className="w-8 h-8 text-muted-foreground/30" />
        )}
        {job.status === 'running' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-1 text-violet-400" />
              <span className="text-xs text-violet-300">{job.progress}%</span>
            </div>
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <p className="text-sm font-medium truncate">{job.prompt}</p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[job.status]}`}>
            {job.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {TASK_LABELS[job.task_type]}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
        </p>
      </CardContent>
    </Card>
  );
}
