import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Play, ChevronRight, Loader2 } from 'lucide-react';
import VideoThumbnail from '@/components/ui/VideoThumbnail';

interface MVClientLandingProps {
  firstName: string;
  onContinue: () => void;
}

interface MVVideo {
  id: string;
  title: string;
  url: string;
}

const FALLBACK_VIDEOS = [
  { title: 'Brand Story Reel', thumbnail: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&q=80' },
  { title: 'Product Showcase', thumbnail: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&q=80' },
  { title: 'Social Media Teaser', thumbnail: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=600&q=80' },
];

export default function MVClientLanding({ firstName, onContinue }: MVClientLandingProps) {
  const [mvVideos, setMvVideos] = useState<MVVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('site_configs')
        .select('content')
        .eq('site_id', 'stu25')
        .eq('section', 'mv-landing-videos')
        .maybeSingle();
      if (data?.content) {
        const content = data.content as Record<string, unknown>;
        setMvVideos((content.videos as MVVideo[] | undefined) || []);
      }
      setLoadingVideos(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-10 animate-fade-in">
        {/* Greeting */}
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-primary tracking-widest uppercase">Welcome</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Hey {firstName} 👋
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Check out some sample music videos we've crafted. These are the styles and quality you can expect for your project.
          </p>
        </div>

        {/* Videos Grid */}
        {loadingVideos ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : mvVideos.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-xl mx-auto">
            {mvVideos.map((video, i) => (
              <div key={video.id || i} className="group glass-card overflow-hidden rounded-xl border border-border hover:border-primary/40 transition-all hover:shadow-lg">
                <div className="relative aspect-[9/16] overflow-hidden bg-muted">
                  <VideoThumbnail src={video.url} title={video.title} videoClassName="w-full h-full object-cover" />
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-foreground truncate">{video.title}</h3>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FALLBACK_VIDEOS.map((video, i) => (
              <div key={i} className="group glass-card overflow-hidden rounded-xl border border-border hover:border-primary/40 transition-all hover:shadow-lg">
                <div className="relative aspect-video overflow-hidden">
                  <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
                      <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-foreground">{video.title}</h3>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Continue Button */}
        <div className="flex justify-center">
          <Button
            onClick={onContinue}
            size="lg"
            className="gap-2 px-8"
          >
            Continue to Upload Portal
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Powered by STU25
        </p>
      </div>
    </div>
  );
}
