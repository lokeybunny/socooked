import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import {
  ArrowRight, Zap, ChevronDown, Building2, Code2, Video,
} from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';

import heroMain from '@/assets/landing/hero-guru-main.jpg';
import serviceAcq from '@/assets/landing/service-acquisitions.jpg';
import serviceWeb from '@/assets/landing/service-webdev-v2.jpg';
import serviceVid from '@/assets/landing/service-video-v2.jpg';

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.23, 1, 0.32, 1] },
  }),
};

const services = [
  {
    id: 'acquisitions',
    tag: '01',
    title: 'AI Acquisitions',
    short: 'Real estate. Automated.',
    image: serviceAcq,
    link: '/ai-design',
    gradient: 'from-cyan-500 to-teal-500',
    shadowColor: 'shadow-cyan-500/20',
  },
  {
    id: 'webdev',
    tag: '02',
    title: 'AI Web Dev',
    short: 'Ship in days, not months.',
    image: serviceWeb,
    link: '/ai-web-dev',
    gradient: 'from-purple-500 to-violet-500',
    shadowColor: 'shadow-purple-500/20',
  },
  {
    id: 'video',
    tag: '03',
    title: 'AI Videographer',
    short: 'Capture every moment.',
    image: serviceVid,
    link: '/ai-videographer',
    gradient: 'from-amber-500 to-orange-500',
    shadowColor: 'shadow-amber-500/20',
  },
];

export default function WarrenLanding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const headerBg = useTransform(scrollYProgress, [0, 0.03], ['rgba(0,0,0,0)', 'rgba(0,0,0,0.9)']);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="animate-spin h-6 w-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full" />
    </div>
  );
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div ref={containerRef} className="bg-black text-white min-h-screen selection:bg-cyan-500/20 overflow-x-hidden">

      {/* ── Sticky Header ── */}
      <motion.header
        style={{ backgroundColor: headerBg }}
        className="fixed top-0 inset-x-0 z-50 backdrop-blur-md border-b border-white/[0.03]"
      >
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-white/70 font-medium tracking-[0.2em] uppercase text-sm">GURU</span>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/auth')} className="text-white/30 hover:text-white text-xs tracking-[0.15em] uppercase transition-colors">
              Login
            </button>
            <Link
              to="/pricing"
              className="px-5 py-1.5 text-[10px] tracking-[0.3em] uppercase bg-white text-black rounded-full font-medium hover:bg-white/90 transition-all"
            >
              Start
            </Link>
          </div>
        </div>
      </motion.header>

      {/* ── Hero: Full-bleed visual ── */}
      <section className="relative h-screen flex items-end overflow-hidden">
        <motion.div
          className="absolute inset-0"
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
        >
          <img
            src={heroMain}
            alt="AI-powered cityscape visualization"
            className="w-full h-full object-cover"
            width={1920}
            height={1080}
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />

        <div className="relative w-full max-w-7xl mx-auto px-6 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.9]">
              <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">
                GURU
              </span>
            </h1>
            <p className="mt-4 text-white/30 text-sm sm:text-base tracking-[0.3em] uppercase font-light max-w-md">
              AI-Powered Services
            </p>
          </motion.div>
        </div>

        <motion.div
          className="absolute bottom-6 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="h-5 w-5 text-white/20" />
        </motion.div>
      </section>

      {/* ── Services: Immersive visual cards ── */}
      {services.map((service, idx) => (
        <section key={service.id} className="relative">

          {/* Full-width parallax image */}
          <div className="relative h-[80vh] sm:h-[90vh] overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center bg-fixed"
              style={{ backgroundImage: `url(${service.image})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

            {/* Minimal overlay content */}
            <div className="absolute inset-0 flex items-end">
              <div className="max-w-7xl mx-auto w-full px-6 pb-16">
                <motion.div
                  initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }}
                  variants={fade} custom={0}
                  className="max-w-lg"
                >
                  <span className="text-[10px] tracking-[0.5em] uppercase text-white/20 font-mono">{service.tag}</span>
                  <h2 className="mt-3 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1]">
                    {service.title}
                  </h2>
                  <p className="mt-3 text-white/30 text-base sm:text-lg font-light">{service.short}</p>
                  <Link
                    to={service.link}
                    className={`group mt-8 inline-flex items-center gap-3 px-8 py-3 bg-gradient-to-r ${service.gradient} text-black rounded-full text-xs tracking-[0.25em] uppercase font-semibold hover:opacity-90 transition-all shadow-lg ${service.shadowColor}`}
                  >
                    Explore
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* ── Stats ribbon ── */}
      <section className="py-20 px-6 border-y border-white/[0.04]">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { value: '$50M+', label: 'Deals Closed' },
            { value: '24hr', label: 'Turnaround' },
            { value: '100%', label: 'AI-Powered' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fade} custom={i}
            >
              <div className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-b from-white/80 to-white/20 bg-clip-text text-transparent">
                {stat.value}
              </div>
              <div className="mt-2 text-[10px] tracking-[0.4em] uppercase text-white/20">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center bg-fixed opacity-30" style={{ backgroundImage: `url(${heroMain})` }} />
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative max-w-2xl mx-auto text-center px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}>
            <h2 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[0.95]">
              Let AI
              <br />
              <span className="text-white/20">work for you.</span>
            </h2>
            <div className="mt-12">
              <Link
                to="/pricing"
                className="group inline-flex items-center gap-3 px-10 py-4 bg-white text-black rounded-full text-xs tracking-[0.25em] uppercase font-semibold hover:bg-white/90 transition-all"
              >
                Get Started
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-white/20 font-medium text-xs tracking-[0.2em] uppercase">GURU</span>
          <div className="flex items-center gap-8">
            {services.map(s => (
              <Link key={s.id} to={s.link} className="text-[10px] tracking-[0.2em] uppercase text-white/15 hover:text-white/40 transition-colors">
                {s.title}
              </Link>
            ))}
            <Link to="/terms" className="text-[10px] tracking-[0.2em] uppercase text-white/15 hover:text-white/40 transition-colors">Terms</Link>
          </div>
          <p className="text-[10px] text-white/10 tracking-wider">© {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}
