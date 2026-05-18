import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StudioDashboard } from '@/components/studio/StudioDashboard';
import { StudioCreate } from '@/components/studio/StudioCreate';
import { StudioLibrary } from '@/components/studio/StudioLibrary';
import { StudioQueue } from '@/components/studio/StudioQueue';
import { StudioSettings } from '@/components/studio/StudioSettings';
import { StudioReferences } from '@/components/studio/StudioReferences';
import { StudioShrink } from '@/components/studio/StudioShrink';
import { StudioCreditsBadge } from '@/components/studio/StudioCreditsBadge';
import { ProjectSelector } from '@/components/studio/ProjectSelector';
import { SubprojectSelector } from '@/components/studio/SubprojectSelector';
import { Film, Sparkles, Grid3X3, ListOrdered, Settings, Image as ImageIcon, Minimize2 } from 'lucide-react';
import { getJobPrompt, type GenerationJob } from '@/lib/studio/types';

export interface CreatePrefill {
  task_type?: GenerationJob['task_type'];
  prompt?: string;
  negative_prompt?: string | null;
  settings_json?: GenerationJob['settings_json'];
  input_image_url?: string | null;
}

export default function AIGen() {
  const [tab, setTab] = useState('dashboard');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [subprojectId, setSubprojectId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<CreatePrefill | null>(null);

  const handleProjectChange = useCallback((id: string | null) => {
    setProjectId(id);
    setSubprojectId(null);
  }, []);

  const openModify = useCallback((job: GenerationJob) => {
    setPrefill({
      task_type: job.task_type,
      prompt: getJobPrompt(job),
      negative_prompt: job.negative_prompt,
      settings_json: job.settings_json,
      input_image_url: job.input_image_url,
    });
    if (job.project_id) setProjectId(job.project_id);
    if (job.subproject_id !== undefined) setSubprojectId(job.subproject_id ?? null);
    setTab('create');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-4 sm:p-6 md:p-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Warren Studio</h1>
              <p className="text-sm text-muted-foreground">Cinematic AI video generation, organized by project.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectSelector value={projectId} onChange={handleProjectChange} />
            {projectId && (
              <SubprojectSelector projectId={projectId} value={subprojectId} onChange={setSubprojectId} />
            )}
            <StudioCreditsBadge />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted/50 border border-border/50 mb-6">
            <TabsTrigger value="dashboard" className="gap-1.5 data-[state=active]:bg-background">
              <Sparkles className="w-3.5 h-3.5" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-1.5 data-[state=active]:bg-background">
              <Film className="w-3.5 h-3.5" /> Create
            </TabsTrigger>
            <TabsTrigger value="library" className="gap-1.5 data-[state=active]:bg-background">
              <Grid3X3 className="w-3.5 h-3.5" /> Library
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5 data-[state=active]:bg-background">
              <ListOrdered className="w-3.5 h-3.5" /> Queue
            </TabsTrigger>
            <TabsTrigger value="references" className="gap-1.5 data-[state=active]:bg-background">
              <ImageIcon className="w-3.5 h-3.5" /> References
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 data-[state=active]:bg-background">
              <Settings className="w-3.5 h-3.5" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><StudioDashboard onNavigate={setTab} projectId={projectId} subprojectId={subprojectId} onModify={openModify} /></TabsContent>
          <TabsContent value="create">
            <StudioCreate
              projectId={projectId}
              subprojectId={subprojectId}
              prefill={prefill}
              onPrefillConsumed={() => setPrefill(null)}
            />
          </TabsContent>
          <TabsContent value="library"><StudioLibrary projectId={projectId} subprojectId={subprojectId} onModify={openModify} /></TabsContent>
          <TabsContent value="queue"><StudioQueue /></TabsContent>
          <TabsContent value="references"><StudioReferences projectId={projectId} /></TabsContent>
          <TabsContent value="settings"><StudioSettings /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
