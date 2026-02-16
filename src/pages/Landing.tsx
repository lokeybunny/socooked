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
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.25], [1, 0.9]);
  const heroY = useTransform(scrollYProgress, [0, 0.25], [0, -80]);

  const revealOpacity = useTransform(scrollYProgress, [0.15, 0.35], [0, 1]);
  const revealY = useTransform(scrollYProgress, [0.15, 0.35], [60, 0]);

  const servicesOpacity = useTransform(scrollYProgress, [0.4, 0.55], [0, 1]);
  const servicesY = useTransform(scrollYProgress, [0.4, 0.55], [80, 0]);

  const ctaOpacity = useTransform(scrollYProgress, [0.65, 0.8], [0, 1]);
  const ctaY = useTransform(scrollYProgress, [0.65, 0.8], [60, 0]);

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div ref={containerRef} className="relative bg-background text-foreground" style={{ height: '400vh' }}>
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
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center mb-6">
              <span className="text-background font-bold text-[9px] tracking-[0.15em]">ST</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-center mb-2">
              Ready?
            </h2>
            <p className="text-xs text-muted-foreground/60 mb-8 tracking-wide">
              Build your digital imprint
            </p>
            <Button
              size="lg"
              onClick={() => navigate('/auth')}
              className="gap-2 px-10 rounded-full"
            >
              Enter
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
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
