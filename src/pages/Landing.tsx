import { Suspense, lazy, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Globe, BarChart3, Sparkles, Layers, Monitor, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { motion, useScroll, useTransform } from 'framer-motion';

const STU25Scene = lazy(() => import('@/components/three/STU25Scene'));

const services = [
  { icon: Globe, title: 'Web Development' },
  { icon: BarChart3, title: 'Social Media' },
  { icon: Sparkles, title: 'AI Automation' },
  { icon: Layers, title: 'Brand Identity' },
  { icon: Monitor, title: 'UI/UX Design' },
  { icon: Zap, title: 'Performance' },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });

  // Parallax transforms
  // Layer 1: 3D Hero — visible 0-20%, gone by 20%
  const heroOpacity = useTransform(scrollYProgress, [0, 0.18], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.18], [1, 0.92]);
  const heroY = useTransform(scrollYProgress, [0, 0.18], [0, -60]);

  // Layer 2: Tagline — fades in 20-28%, holds, fades out 38-45%
  const revealOpacity = useTransform(scrollYProgress, [0.20, 0.28, 0.38, 0.45], [0, 1, 1, 0]);
  const revealY = useTransform(scrollYProgress, [0.20, 0.28, 0.38, 0.45], [40, 0, 0, -30]);

  // Layer 3: Services — fades in 47-55%, holds, fades out 65-72%
  const servicesOpacity = useTransform(scrollYProgress, [0.47, 0.55, 0.65, 0.72], [0, 1, 1, 0]);
  const servicesY = useTransform(scrollYProgress, [0.47, 0.55, 0.65, 0.72], [50, 0, 0, -30]);

  // Layer 4: CTA — fades in 75-83%, stays
  const ctaOpacity = useTransform(scrollYProgress, [0.75, 0.83], [0, 1]);
  const ctaY = useTransform(scrollYProgress, [0.75, 0.83], [40, 0]);

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div ref={containerRef} className="relative bg-background text-foreground" style={{ height: '500vh' }}>
      {/* Subtle grid — fixed */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02] z-0">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      {/* Fixed viewport container */}
      <div className="fixed inset-0 z-10 flex flex-col">
        {/* Nav */}
        <header className="flex items-center justify-between px-6 md:px-12 py-5 relative z-30">
          <div className="flex items-center">
            <span className="text-foreground/70 font-light text-sm tracking-[0.25em] uppercase">STU '25</span>
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

        {/* Stacked layers — all position absolute, controlled by scroll */}
        <div className="flex-1 relative overflow-hidden">

          {/* Layer 1: 3D Hero */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
          >
            <div className="w-full h-[55vh] max-w-4xl">
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
            {/* Scroll hint */}
            <motion.div
              className="absolute bottom-12 flex flex-col items-center gap-2"
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="w-px h-8 bg-gradient-to-b from-transparent to-muted-foreground/30" />
              <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/30">Scroll</span>
            </motion.div>
          </motion.div>

          {/* Layer 2: Tagline reveal */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-6"
            style={{ opacity: revealOpacity, y: revealY }}
          >
            <p className="text-[10px] md:text-xs tracking-[0.4em] uppercase text-muted-foreground/60 mb-4">
              SMM &amp; Web Services
            </p>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-center max-w-lg leading-tight">
              Digital Infrastructure
              <br />
              <span className="text-muted-foreground">for Modern Brands</span>
            </h2>
            <div className="w-12 h-px bg-border mt-8" />
          </motion.div>

          {/* Layer 3: Services grid */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-6"
            style={{ opacity: servicesOpacity, y: servicesY }}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-lg">
              {services.map(({ icon: Icon, title }, i) => (
                <motion.div
                  key={title}
                  className="glass-card p-5 flex flex-col items-center gap-3 text-center group hover:bg-accent/50 transition-colors duration-300"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  viewport={{ once: true }}
                >
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-[10px] md:text-xs tracking-wider uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                    {title}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Layer 4: CTA */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-6"
            style={{ opacity: ctaOpacity, y: ctaY }}
          >
            <span className="text-foreground/50 font-light text-xs tracking-[0.3em] uppercase mb-8">STU '25</span>
            <h2 className="text-xl md:text-2xl font-light tracking-tight text-center mb-2">
              Ready?
            </h2>
            <p className="text-xs text-muted-foreground/40 mb-10 tracking-wide font-light">
              Build your digital imprint
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="group flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-500"
            >
              <span className="font-light">Enter</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform duration-300" />
            </button>
          </motion.div>
        </div>

        {/* Footer */}
        <footer className="px-6 md:px-12 py-4 flex items-center justify-between relative z-30">
          <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground/30">
            STU25
          </p>
          <p className="text-[9px] text-muted-foreground/30">
            &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
}
