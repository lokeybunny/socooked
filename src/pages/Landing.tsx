import { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const STU25Scene = lazy(() => import('@/components/three/STU25Scene'));

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden relative">
      {/* Subtle grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      {/* Nav — minimal */}
      <header className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-foreground flex items-center justify-center">
            <span className="text-background font-bold text-[10px] tracking-[0.15em]">ST</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/auth')}
            className="text-muted-foreground text-xs"
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero — 3D scene is the focus */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-[85vh] px-6">
        {/* Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/[0.04] rounded-full blur-[150px] pointer-events-none" />

        {/* 3D Canvas */}
        <div className="w-full h-[50vh] md:h-[55vh] max-w-4xl">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin h-6 w-6 border border-primary border-t-transparent rounded-full" />
              </div>
            }
          >
            <STU25Scene />
          </Suspense>
        </div>

        {/* Tagline — ultra minimal */}
        <p className="text-xs md:text-sm tracking-[0.3em] uppercase text-muted-foreground mt-4">
          Digital Imprint
        </p>

        {/* CTA */}
        <Button
          size="lg"
          onClick={() => navigate('/auth')}
          className="mt-8 gap-2 px-10 rounded-full"
        >
          Enter
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </section>

      {/* Bottom bar */}
      <footer className="relative z-10 px-6 md:px-12 py-6 flex items-center justify-between">
        <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50">
          SMM &amp; Web Services
        </p>
        <p className="text-[10px] text-muted-foreground/40">
          &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
