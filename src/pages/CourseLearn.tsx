import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Play, MessageCircle, LogOut } from 'lucide-react';

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    // Already an embed URL
    if (u.pathname.startsWith('/embed/')) return url;
    // youtube.com/watch?v=ID
    const v = u.searchParams.get('v');
    if (v) return `https://www.youtube.com/embed/${v}`;
    // youtu.be/ID
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    // vimeo.com/ID
    if (u.hostname.includes('vimeo.com') && /^\/\d+/.test(u.pathname))
      return `https://player.vimeo.com/video${u.pathname}`;
  } catch {}
  return url;
}

export default function CourseLearn() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/course/login', { replace: true });
  }, [user, loading, navigate]);

  const { data: lessons, isLoading } = useQuery({
    queryKey: ['course-lessons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_lessons')
        .select('*')
        .eq('is_published', true)
        .order('position', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading || !user) return <div className="flex items-center justify-center min-h-screen bg-[hsl(0,0%,3%)]"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;

  return (
    <div className="min-h-screen bg-[hsl(0,0%,3%)] text-white">
      <header className="border-b border-white/5 px-4 sm:px-6 py-4 sticky top-0 bg-[hsl(0,0%,3%)]/90 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex flex-col leading-none">
            <span className="text-[9px] tracking-[0.25em] uppercase text-emerald-400/70">Warren</span>
            <span className="text-sm font-light tracking-[0.15em] uppercase text-white/80">GURU</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/40 hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Discord
            </a>
            <button onClick={handleSignOut} className="text-xs text-white/30 hover:text-white/50 transition-colors flex items-center gap-1">
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">AI Filmmaking 2 Hour Master Course</h1>
          <p className="text-sm text-white/40">Welcome back, {user.email}. Pick up where you left off.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : !lessons?.length ? (
          <div className="text-center py-20 border border-white/5 rounded-2xl bg-white/[0.02]">
            <p className="text-white/40 text-sm">Course content is being prepared. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {lessons.map((lesson, idx) => (
              <div key={lesson.id} className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                {/* Video embed */}
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    src={toEmbedUrl(lesson.video_url)}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={lesson.title}
                  />
                </div>
                {/* Info */}
                <div className="p-4 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                      {idx + 1}
                    </span>
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold mb-1">{lesson.title}</h2>
                      {lesson.description && <p className="text-sm text-white/40">{lesson.description}</p>}
                      {lesson.duration_label && (
                        <span className="mt-2 inline-block text-[10px] uppercase tracking-wider text-white/20 bg-white/5 px-2 py-0.5 rounded-full">
                          {lesson.duration_label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Discord CTA */}
        <div className="mt-12 p-6 rounded-2xl border border-white/5 bg-white/[0.02] text-center">
          <h3 className="text-sm font-medium mb-2">Need Help?</h3>
          <p className="text-xs text-white/40 mb-4">Join our Discord community for live support and feedback.</p>
          <a
            href="https://discord.gg/warrenguru"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-black text-sm font-medium hover:bg-emerald-400 transition-all"
          >
            <MessageCircle className="h-4 w-4" /> Join Discord
          </a>
        </div>
      </main>
    </div>
  );
}
