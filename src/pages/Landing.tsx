import { Suspense, lazy, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Globe, BarChart3, Sparkles, Layers, Monitor, Zap, X, DoorOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';

const STU25Scene = lazy(() => import('@/components/three/STU25Scene'));

const services = [
  {
    icon: Globe,
    title: 'Web Development',
    description: 'We craft high-performance websites and applications that feel effortless. Clean code, thoughtful architecture, and experiences that just work — because your digital home should feel like home.',
  },
  {
    icon: BarChart3,
    title: 'Social Media',
    description: 'Your story deserves to be heard. We build data-driven campaigns that grow your community authentically — real engagement, real connections, real results that compound over time.',
  },
  {
    icon: Sparkles,
    title: 'AI Automation',
    description: 'Let intelligent systems handle the repetitive so you can focus on the creative. We design workflows that learn, adapt, and scale alongside your ambitions — quietly and reliably.',
  },
  {
    icon: Layers,
    title: 'Brand Identity',
    description: 'More than a logo — we help you find the visual language that makes people remember you. Cohesive, intentional design systems that carry your essence across every touchpoint.',
  },
  {
    icon: Monitor,
    title: 'UI/UX Design',
    description: 'Interfaces should feel invisible. We design minimal, intuitive experiences where every pixel earns its place — guiding users naturally toward what matters most.',
  },
  {
    icon: Zap,
    title: 'Performance',
    description: 'Speed is a feature. We optimize every layer of your stack — from infrastructure to delivery — so your users never wait and your metrics never stop climbing.',
  },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeService, setActiveService] = useState<number | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const { scrollYProgress } = useScroll({ target: containerRef });

  // Track scroll progress for pointer-events
  scrollYProgress.on('change', (v) => setScrollProgress(v));

  // Keyboard navigation for service modals
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (activeService === null) return;
    if (e.key === 'Escape') setActiveService(null);
    if (e.key === 'ArrowRight') setActiveService((activeService + 1) % services.length);
    if (e.key === 'ArrowLeft') setActiveService((activeService - 1 + services.length) % services.length);
  }, [activeService]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
            <span className="text-foreground/70 font-light text-lg md:text-xl tracking-[0.15em] uppercase">STU25</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={() => navigate('/auth')}
              className="text-muted-foreground/50 hover:text-foreground transition-colors duration-300"
            >
              <DoorOpen className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Stacked layers — all position absolute, controlled by scroll */}
        <div className="flex-1 relative overflow-hidden">

          {/* Layer 1: 3D Hero */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ opacity: heroOpacity, scale: heroScale, y: heroY, pointerEvents: scrollProgress < 0.18 ? 'auto' : 'none' }}
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
              <div className="w-px h-10 bg-gradient-to-b from-transparent to-muted-foreground/70" />
              <span className="text-xs tracking-[0.3em] uppercase text-muted-foreground/70">Scroll</span>
            </motion.div>
          </motion.div>

          {/* Layer 2: Tagline reveal */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-6"
            style={{ opacity: revealOpacity, y: revealY, pointerEvents: (scrollProgress > 0.20 && scrollProgress < 0.45) ? 'auto' : 'none' }}
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
            style={{ opacity: servicesOpacity, y: servicesY, pointerEvents: (scrollProgress > 0.47 && scrollProgress < 0.72) ? 'auto' : 'none' }}
          >
             <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-lg">
              {services.map(({ icon: Icon, title }, i) => (
                <motion.div
                  key={title}
                  className="glass-card p-5 flex flex-col items-center gap-3 text-center group hover:bg-accent/50 transition-colors duration-300 cursor-pointer"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  viewport={{ once: true }}
                  onClick={() => setActiveService(i)}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-[10px] md:text-xs tracking-wider uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                    {title}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Service Detail Modal */}
          <AnimatePresence>
            {activeService !== null && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  onClick={() => setActiveService(null)}
                />
                {/* Modal with nav arrows */}
                <motion.div
                  className="fixed inset-0 z-50 flex items-center justify-center px-16 md:px-24 pointer-events-none"
                  initial={{ opacity: 0, scale: 0.92, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {/* Left arrow */}
                  <button
                    onClick={() => setActiveService((activeService - 1 + services.length) % services.length)}
                    className="pointer-events-auto absolute left-4 md:left-8 p-2 rounded-full bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all duration-300"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  {/* Card */}
                  <div className="glass-card p-8 md:p-10 max-w-md w-full pointer-events-auto relative">
                    <button
                      onClick={() => setActiveService(null)}
                      className="absolute top-4 right-4 text-muted-foreground/40 hover:text-foreground transition-colors duration-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="flex flex-col items-center text-center gap-5">
                      {(() => {
                        const service = services[activeService];
                        const Icon = service.icon;
                        return (
                          <>
                            <div className="p-3 rounded-lg bg-muted/50">
                              <Icon className="h-5 w-5 text-foreground/70" />
                            </div>
                            <h3 className="text-sm tracking-[0.2em] uppercase font-light text-foreground">
                              {service.title}
                            </h3>
                            <p className="text-sm text-muted-foreground/70 leading-relaxed font-light">
                              {service.description}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Right arrow */}
                  <button
                    onClick={() => setActiveService((activeService + 1) % services.length)}
                    className="pointer-events-auto absolute right-4 md:right-8 p-2 rounded-full bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all duration-300"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Layer 4: CTA */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-6"
            style={{ opacity: ctaOpacity, y: ctaY, pointerEvents: scrollProgress > 0.75 ? 'auto' : 'none' }}
          >
            <span className="text-foreground/50 font-light text-sm md:text-base tracking-[0.25em] uppercase mb-4">STU25</span>
            <h2 className="text-2xl md:text-3xl font-light tracking-tight text-center mb-2">
              Ready?
            </h2>
            <p className="text-sm text-muted-foreground/40 mb-5 tracking-wide font-light">
              Build your digital imprint
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="group flex items-center gap-2 text-sm tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-500"
            >
              <span className="font-light">Enter</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform duration-300" />
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
