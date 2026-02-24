import { Button } from '@/components/ui/button';
import { Play, ChevronRight } from 'lucide-react';

interface MVClientLandingProps {
  firstName: string;
  onContinue: () => void;
}

const SAMPLE_VIDEOS = [
  {
    title: 'Brand Story Reel',
    description: 'A cinematic intro for your brand identity',
    thumbnail: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&q=80',
    url: '',
  },
  {
    title: 'Product Showcase',
    description: 'Dynamic product highlight with motion graphics',
    thumbnail: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&q=80',
    url: '',
  },
  {
    title: 'Social Media Teaser',
    description: 'Short-form content optimized for engagement',
    thumbnail: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=600&q=80',
    url: '',
  },
];

export default function MVClientLanding({ firstName, onContinue }: MVClientLandingProps) {
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

        {/* Sample Videos Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_VIDEOS.map((video, i) => (
            <div
              key={i}
              className="group glass-card overflow-hidden rounded-xl border border-border hover:border-primary/40 transition-all hover:shadow-lg"
            >
              <div className="relative aspect-video overflow-hidden">
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
                    <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-1">
                <h3 className="text-sm font-semibold text-foreground">{video.title}</h3>
                <p className="text-xs text-muted-foreground">{video.description}</p>
              </div>
            </div>
          ))}
        </div>

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
