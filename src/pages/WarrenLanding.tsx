import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import {
  ArrowRight, Zap, ChevronDown, Brain, Sparkles,
  Code2, Video, Building2, Palette, Globe, Monitor, Camera, Wifi
} from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';

import parallaxHero from '@/assets/landing/parallax-hero-ai-realestate.jpg';
import serviceDesign from '@/assets/landing/service-ai-design.jpg';
import serviceWebDev from '@/assets/landing/service-ai-webdev.jpg';
import serviceVideo from '@/assets/landing/service-ai-videographer.jpg';

const fade = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] },
  }),
};

const services = [
  {
    id: 'design',
    title: 'AI Design',
    subtitle: 'Brand Identity & Creative',
    desc: 'From logos to full brand systems — our AI-powered design pipeline delivers professional creative assets at a fraction of the traditional cost and timeline.',
    features: ['Brand Identity Systems', 'Marketing Collateral', 'Social Media Assets', 'UI/UX Design'],
    icon: Palette,
    image: serviceDesign,
    link: '/ai-design',
    gradient: 'from-purple-500 to-pink-500',
    accent: 'purple',
  },
  {
    id: 'webdev',
    title: 'AI Web Development',
    subtitle: 'Full-Stack Digital Solutions',
    desc: 'Custom websites, web applications, and digital platforms built with AI-accelerated development — delivering enterprise-grade solutions in days, not months.',
    features: ['Custom Web Applications', 'E-Commerce Platforms', 'Landing Pages & Funnels', 'API Integrations'],
    icon: Code2,
    image: serviceWebDev,
    link: '/ai-web-dev',
    gradient: 'from-cyan-500 to-teal-500',
    accent: 'cyan',
  },
  {
    id: 'video',
    title: 'AI Videographer',
    subtitle: 'Professional Video & Live Streaming',
    desc: 'Connecting real people with AI-enhanced video production — weddings, funerals, events — professionally shot and live streamed at the best prices in town.',
    features: ['Wedding Videography', 'Funeral & Memorial Coverage', 'Live Streaming Services', 'AI-Enhanced Editing'],
    icon: Video,
    image: serviceVideo,
    link: '/ai-videographer',
    gradient: 'from-amber-500 to-orange-500',
    accent: 'amber',
  },
];

const accentColors: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  purple: { border: 'border-purple-500/20', bg: 'bg-purple-500/[0.05]', text: 'text-purple-400', dot: 'bg-purple-400' },
  cyan: { border: 'border-cyan-500/20', bg: 'bg-cyan-500/[0.05]', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/[0.05]', text: 'text-amber-400', dot: 'bg-amber-400' },
};

export default function WarrenLanding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const headerBg = useTransform(scrollYProgress, [0, 0.05], ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="animate-spin h-6 w-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full" />
    </div>
  );
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div ref={containerRef} className="bg-black text-white min-h-screen selection:bg-cyan-500/20">
      {/* ── Sticky Header ── */}
      <motion.header
        style={{ backgroundColor: headerBg }}
        className="fixed top-0 inset-x-0 z-50 backdrop-blur-md border-b border-white/[0.04]"
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-cyan-400" />
            <span className="text-white/80 font-medium text-base tracking-[0.15em] uppercase">GURU</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {services.map(s => (
              <a key={s.id} href={`#${s.id}`} className="text-white/30 hover:text-cyan-400 text-xs tracking-[0.2em] uppercase transition-colors">
                {s.title}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-5">
            <button onClick={() => navigate('/auth')} className="text-white/40 hover:text-white text-sm tracking-wider transition-colors">
              Login
            </button>
            <Link
              to="/pricing"
              className="px-6 py-2 text-xs tracking-[0.25em] uppercase bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded font-medium hover:from-cyan-400 hover:to-teal-400 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </motion.header>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${parallaxHero})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(0,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="relative text-center max-w-4xl px-6 pt-14"
        >
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-cyan-500/20 bg-cyan-500/[0.05] mb-8">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs tracking-[0.3em] uppercase text-cyan-400/70">AI-Powered Services</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05]">
            One Brand.
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">Three Superpowers.</span>
          </h1>

          <p className="mt-8 text-base sm:text-lg text-white/40 max-w-2xl mx-auto leading-relaxed font-light">
            Design. Development. Videography. — All powered by AI, all under one roof. 
            We bring institutional-grade AI to creative services so you get better results, faster, and at a fraction of the cost.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#services"
              className="group flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20"
            >
              Explore Services
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <button
              onClick={() => navigate('/auth')}
              className="flex items-center gap-2 px-8 py-4 text-sm tracking-[0.2em] uppercase text-white/40 hover:text-cyan-400 transition-colors"
            >
              Client Portal
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-16 flex items-center justify-center gap-10 text-white/20">
            {[
              { icon: Palette, label: 'Design' },
              { icon: Code2, label: 'Development' },
              { icon: Video, label: 'Video' },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <item.icon className="h-6 w-6 text-cyan-400/40" />
                <span className="text-xs tracking-[0.2em] uppercase">{item.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="h-5 w-5 text-cyan-400/30" />
        </motion.div>
      </section>

      {/* ── Services Section ── */}
      <section id="services" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5 text-center"
          >
            Our Services
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center mb-6"
          >
            AI Changes <span className="text-cyan-400">Everything.</span>
          </motion.h2>
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={2}
            className="text-base text-white/30 max-w-xl mx-auto text-center mb-16 leading-relaxed"
          >
            Three distinct services, one unified AI-first philosophy. Each division leverages cutting-edge artificial intelligence to deliver results that were previously impossible.
          </motion.p>

          <div className="space-y-32">
            {services.map((service, idx) => {
              const colors = accentColors[service.accent];
              const isEven = idx % 2 === 1;

              return (
                <motion.div
                  key={service.id}
                  id={service.id}
                  initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }}
                  variants={fade} custom={0}
                  className={`grid md:grid-cols-2 gap-12 items-center ${isEven ? 'md:direction-rtl' : ''}`}
                >
                  {/* Image */}
                  <div className={`relative group ${isEven ? 'md:order-2' : ''}`}>
                    <div className={`absolute -inset-1 rounded-2xl bg-gradient-to-r ${service.gradient} opacity-10 group-hover:opacity-20 blur-xl transition-opacity duration-700`} />
                    <img
                      src={service.image}
                      alt={`${service.title} - AI powered ${service.subtitle}`}
                      className={`relative w-full rounded-2xl border ${colors.border} shadow-2xl`}
                      loading="lazy"
                      width={1920}
                      height={1080}
                    />
                  </div>

                  {/* Content */}
                  <div className={`space-y-6 ${isEven ? 'md:order-1' : ''}`}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors.border} ${colors.bg}`}>
                      <service.icon className={`h-3.5 w-3.5 ${colors.text}`} />
                      <span className={`text-xs tracking-[0.2em] uppercase ${colors.text} opacity-70`}>{service.subtitle}</span>
                    </div>

                    <h3 className="text-3xl sm:text-4xl font-bold leading-tight">
                      {service.title}
                    </h3>

                    <p className="text-white/40 text-lg leading-relaxed">
                      {service.desc}
                    </p>

                    <div className="space-y-3">
                      {service.features.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 text-white/50">
                          <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                          <span className="text-sm">{f}</span>
                        </div>
                      ))}
                    </div>

                    <Link
                      to={service.link}
                      className={`group inline-flex items-center gap-3 px-8 py-3 rounded-lg text-sm tracking-[0.2em] uppercase font-medium transition-all bg-gradient-to-r ${service.gradient} text-black hover:opacity-90 shadow-lg`}
                    >
                      Learn More
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Why AI Section ── */}
      <section className="py-24 px-6 border-t border-cyan-500/[0.08]">
        <div className="max-w-4xl mx-auto text-center">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5"
          >
            The GURU Advantage
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-14"
          >
            Why <span className="text-cyan-400">AI-First</span> Wins
          </motion.h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { icon: Zap, title: '10x Faster', desc: 'AI acceleration cuts delivery timelines from months to days' },
              { icon: Brain, title: 'Smarter Output', desc: 'Machine learning ensures optimized results every time' },
              { icon: Sparkles, title: 'Lower Cost', desc: 'AI efficiency means premium quality at accessible prices' },
              { icon: Globe, title: 'Always On', desc: 'Your AI systems work 24/7 — no downtime, no delays' },
              { icon: Monitor, title: 'Data-Driven', desc: 'Every decision backed by analytics and real-time insights' },
              { icon: Wifi, title: 'Live Delivery', desc: 'Real-time streaming and instant deployments built in' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fade} custom={i}
                className="group p-8 rounded-xl border border-cyan-500/[0.06] bg-cyan-500/[0.02] hover:bg-cyan-500/[0.05] hover:border-cyan-500/20 transition-all duration-500"
              >
                <item.icon className="h-7 w-7 text-cyan-400/30 group-hover:text-cyan-400 transition-colors duration-500 mb-4" />
                <div className="text-base font-semibold text-white/70 group-hover:text-white/90 transition-colors mb-2">{item.title}</div>
                <div className="text-sm text-white/25 leading-relaxed">{item.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${parallaxHero})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/50" />
        <div className="max-w-2xl mx-auto text-center relative px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}>
            <p className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5">Ready?</p>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
              Let AI
              <br />
              <span className="text-cyan-400/60">work for you.</span>
            </h2>
            <p className="mt-6 text-base text-white/30 max-w-md mx-auto leading-relaxed">
              Design. Develop. Film. — All amplified by artificial intelligence.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/pricing#top"
                onClick={() => window.scrollTo(0, 0)}
                className="group flex items-center gap-3 px-12 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20"
              >
                View Pricing
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-cyan-500/[0.08] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Zap className="h-4 w-4 text-cyan-400/40" />
            <span className="text-white/40 font-medium text-sm tracking-[0.15em] uppercase">GURU</span>
          </div>
          <div className="flex items-center gap-6">
            {services.map(s => (
              <Link key={s.id} to={s.link} className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">
                {s.title}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">Terms</Link>
            <Link to="/pricing" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">Pricing</Link>
          </div>
          <p className="text-xs text-white/15">© {new Date().getFullYear()} GURU. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
