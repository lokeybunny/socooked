import { Link } from 'react-router-dom';
import { Instagram, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// TikTok glyph
function TikTokIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.59a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.02z"/>
    </svg>
  );
}

export default function SMChooser() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Social Media</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a platform to start posting.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Link to="/dashboard/reels" className="group">
            <Card className="p-8 h-full hover:border-pink-500/60 hover:bg-pink-500/5 transition-all cursor-pointer">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                  <Instagram className="h-10 w-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Instagram</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload reels, posts, and stories.
                  </p>
                </div>
                <Button variant="outline" className="gap-2">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </Link>

          <Link to="/dashboard/reels?platform=tiktok" className="group">
            <Card className="p-8 h-full hover:border-foreground/60 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-20 w-20 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                  <TikTokIcon className="h-10 w-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">TikTok</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload videos to your TikTok account.
                  </p>
                </div>
                <Button variant="outline" className="gap-2">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Need to manage accounts? Go to{' '}
          <Link to="/dashboard/instagram-profiles" className="underline">Instagram Profiles</Link>
          {' '}or the full{' '}
          <Link to="/dashboard/smm" className="underline">SMM Dashboard</Link>.
        </p>
      </div>
    </div>
  );
}
