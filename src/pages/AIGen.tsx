import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StudioDashboard } from '@/components/studio/StudioDashboard';
import { StudioCreate } from '@/components/studio/StudioCreate';
import { StudioLibrary } from '@/components/studio/StudioLibrary';
import { StudioQueue } from '@/components/studio/StudioQueue';
import { StudioSettings } from '@/components/studio/StudioSettings';
import { Film, Sparkles, Grid3X3, ListOrdered, Settings } from 'lucide-react';

export default function AIGen() {
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-4 sm:p-6 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Warren Studio</h1>
              <p className="text-sm text-muted-foreground">Cinematic AI video generation, powered by your own model stack.</p>
            </div>
          </div>
        </div>

        {/* Spotlight Video */}
        <div className="mb-8 rounded-xl overflow-hidden border border-border/50 bg-card/50 shadow-lg">
          <div className="relative">
            <video
              src="/videos/spotlight.mov"
              controls
              playsInline
              preload="metadata"
              className="w-full aspect-video bg-black"
              poster=""
            />
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-violet-600/90 backdrop-blur-sm">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-white flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Spotlight
              </span>
            </div>
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
            <TabsTrigger value="settings" className="gap-1.5 data-[state=active]:bg-background">
              <Settings className="w-3.5 h-3.5" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><StudioDashboard onNavigate={setTab} /></TabsContent>
          <TabsContent value="create"><StudioCreate /></TabsContent>
          <TabsContent value="library"><StudioLibrary /></TabsContent>
          <TabsContent value="queue"><StudioQueue /></TabsContent>
          <TabsContent value="settings"><StudioSettings /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
