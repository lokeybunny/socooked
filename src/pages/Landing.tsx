import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Zap, Globe, BarChart3, Layers, Sparkles, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const services = [
  {
    icon: Globe,
    title: 'Web Development',
    description: 'High-performance sites built with cutting-edge frameworks.',
  },
  {
    icon: BarChart3,
    title: 'Social Media Marketing',
    description: 'Data-driven campaigns that amplify your digital presence.',
  },
  {
    icon: Sparkles,
    title: 'AI Automation',
    description: 'Intelligent workflows that scale your operations effortlessly.',
  },
  {
    icon: Layers,
    title: 'Brand Identity',
    description: 'Cohesive digital imprints that leave lasting impressions.',
  },
  {
    icon: Monitor,
    title: 'UI/UX Design',
    description: 'Minimal, intuitive interfaces crafted for conversion.',
  },
  {
    icon: Zap,
    title: 'Performance Ops',
    description: 'Optimization, analytics, and growth infrastructure.',
  },
];

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
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Ambient grid background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-foreground flex items-center justify-center">
            <span className="text-background font-bold text-xs tracking-widest">ST</span>
          </div>
          <span className="font-semibold text-foreground tracking-tight text-lg">STU25</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/auth')}
            className="border-border hover:bg-accent"
          >
            Sign In
          </Button>
          <Button size="sm" onClick={() => navigate('/auth')}>
            Get Started
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-20 md:pt-32 pb-20">
        {/* Glow orb */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-muted/50 text-xs text-muted-foreground mb-8 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Digital Infrastructure for Modern Brands
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-[1.1]">
          Your Digital
          <br />
          <span className="text-muted-foreground">Imprint</span> Starts Here
        </h1>

        <p className="text-muted-foreground text-base md:text-lg max-w-xl mt-6 leading-relaxed">
          AI-powered social media marketing &amp; web services. We build lightweight, high-performance digital systems that scale.
        </p>

        <div className="flex items-center gap-4 mt-10">
          <Button size="lg" onClick={() => navigate('/auth')} className="gap-2 px-8">
            Launch Dashboard
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() =>
              document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="text-muted-foreground"
          >
            Explore Services
          </Button>
        </div>

        {/* Metric strip */}
        <div className="grid grid-cols-3 gap-8 md:gap-16 mt-20 border-t border-border pt-10">
          {[
            { value: '99.9%', label: 'Uptime' },
            { value: '<200ms', label: 'Avg Response' },
            { value: '∞', label: 'Scalability' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl md:text-3xl font-bold text-foreground font-mono">{value}</p>
              <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="relative z-10 px-6 md:px-12 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Services</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Full-Stack Digital Solutions
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group glass-card p-6 hover:bg-accent/50 transition-all duration-300 cursor-default"
            >
              <div className="p-2.5 rounded-lg bg-muted w-fit mb-4 group-hover:bg-primary/10 transition-colors">
                <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 md:px-12 py-24">
        <div className="max-w-3xl mx-auto text-center glass-card p-12 md:p-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight relative z-10">
            Ready to Build Your Digital Presence?
          </h2>
          <p className="text-muted-foreground mt-3 max-w-md mx-auto relative z-10">
            Join STU25 and get access to AI-driven marketing tools, analytics dashboards, and
            project management — all in one platform.
          </p>
          <Button
            size="lg"
            onClick={() => navigate('/auth')}
            className="mt-8 gap-2 px-10 relative z-10"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 md:px-12 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-foreground flex items-center justify-center">
              <span className="text-background text-[9px] font-bold tracking-widest">ST</span>
            </div>
            <span className="text-sm text-muted-foreground">
              STU25 — Social Media Marketing &amp; Web Services
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} STU25. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
