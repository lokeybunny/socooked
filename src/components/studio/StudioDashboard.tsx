import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useStudioJobs, useWorkerHealth } from '@/lib/studio/hooks';
import { Loader2, CheckCircle, XCircle, Clock, Cpu, Plus, Film } from 'lucide-react';
import { VideoTile } from './VideoTile';
import { getJobPrompt, type GenerationJob } from '@/lib/studio/types';

interface Props {
  onNavigate: (tab: string) => void;
  projectId?: string | null;
  subprojectId?: string | null;
  onModify?: (job: GenerationJob) => void;
}

export function StudioDashboard({ onNavigate, projectId, subprojectId, onModify }: Props) {
  const { jobs, loading } = useStudioJobs();
  const { health } = useWorkerHealth();
  const [selected, setSelected] = useState<GenerationJob | null>(null);

  const scopedJobs = useMemo(
    () => jobs.filter(j => {
      if (projectId && j.project_id !== projectId) return false;
      if (subprojectId && j.subproject_id !== subprojectId) return false;
      return true;
    }),
    [jobs, projectId, subprojectId],
  );

  const queued = scopedJobs.filter(j => j.status === 'queued' || j.status === 'provisioning').length;
  const running = scopedJobs.filter(j => j.status === 'running').length;
  const completed = scopedJobs.filter(j => j.status === 'completed').length;
  const failed = scopedJobs.filter(j => j.status === 'failed').length;
  const recent = scopedJobs.filter(j => j.status !== 'failed' && j.status !== 'cancelled').slice(0, 6);

  // Render cache immediately; only block with spinner if we have nothing at all yet.
  const showSpinner = loading && scopedJobs.length === 0;

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<Clock className="w-4 h-4 text-yellow-400" />} label="In Queue" value={queued + running} />
        <StatCard icon={<CheckCircle className="w-4 h-4 text-green-400" />} label="Completed" value={completed} />
        <StatCard icon={<XCircle className="w-4 h-4 text-red-400" />} label="Failed" value={failed} />
        <StatCard icon={<Film className="w-4 h-4 text-violet-400" />} label="Total Jobs" value={scopedJobs.length} />
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
            <p className="text-sm text-muted-foreground">
              {projectId ? 'Will be added to the selected project' : 'Pick or create a project to keep things organized'}
            </p>
          </div>
          <Button onClick={() => onNavigate('create')} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Plus className="w-4 h-4" /> New Generation
          </Button>
        </CardContent>
      </Card>

      {/* Recent Generations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            Recent Generations
            {projectId && <span className="text-xs text-muted-foreground ml-2">(this project)</span>}
          </h3>
          {scopedJobs.length > 6 && (
            <Button variant="ghost" size="sm" onClick={() => onNavigate('library')}>View All</Button>
          )}
        </div>
        {showSpinner ? (
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {recent.map(job => <VideoTile key={job.id} job={job} onOpen={setSelected} onModify={onModify} />)}
          </div>
        )}
      </div>

      {/* Video Preview Modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl bg-zinc-950 border-white/10">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate">{getJobPrompt(selected).slice(0, 80)}</DialogTitle>
                <DialogDescription className="sr-only">Video preview</DialogDescription>
              </DialogHeader>
              {selected.output_video_url ? (
                <video src={selected.output_video_url} controls autoPlay preload="metadata" className="w-full rounded-lg aspect-video bg-black" />
              ) : selected.output_thumbnail_url ? (
                <img src={selected.output_thumbnail_url} alt="" className="w-full rounded-lg" />
              ) : (
                <div className="aspect-video bg-muted/30 rounded-lg flex items-center justify-center">
                  <Film className="w-12 h-12 text-muted-foreground/20" />
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
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
