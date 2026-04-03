import { useRef, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

import {
  ArrowRight, Zap, Phone, Globe, Mail, BarChart3, Brain,
  ChevronDown, Shield, Clock, Users, TrendingUp, Building2, Briefcase
} from 'lucide-react';
import ScrollToTopButton from '@/components/landing/ScrollToTopButton';
import { motion, useScroll, useTransform } from 'framer-motion';
import WarrenVideoPlayer from '@/components/landing/WarrenVideoPlayer';

import parallaxHero from '@/assets/landing/parallax-hero-ai-realestate.jpg';
import parallaxNeighborhood from '@/assets/landing/parallax-ai-neighborhood.jpg';
import parallaxCommand from '@/assets/landing/parallax-ai-command.jpg';
import parallaxAppraisal from '@/assets/landing/parallax-ai-appraisal.jpg';
import dashboardPreview from '@/assets/landing/client-dashboard-preview.jpg';

const steps = [
  {
    num: '01',
    icon: Globe,
    title: 'Your Branded Acquisition Portal',
    desc: 'A professional, conversion-optimized seller landing page deployed under your firm\'s brand. Sellers submit their property — name, phone, address — and the system takes over.',
  },
  {
    num: '02',
    icon: Phone,
    title: 'AI Closes the Initial Call',
    desc: 'Within seconds of a lead submission, our AI voice agent calls the seller, qualifies their motivation, timeline, and asking price — then logs structured notes directly to your CRM.',
  },
  {
    num: '03',
    icon: Brain,
    title: 'Intelligent Lead Scoring',
    desc: 'Every call transcript is analyzed by AI to extract motivation level, property condition, timeline urgency, and a lead score — so your team knows exactly who to prioritize.',
  },
  {
    num: '04',
    icon: BarChart3,
    title: 'Full Deal Pipeline',
    desc: 'Sellers flow through a managed pipeline: New → Contacted → Qualified → Under Contract → Closed. Track distress signals, skip-trace contacts, and manage deals — all in one place.',
  },
  {
    num: '05',
    icon: Mail,
    title: 'Automated Client Communications',
    desc: 'The system sends professional follow-up emails on your behalf — confirmations, status updates, and nurture sequences — keeping sellers engaged without lifting a finger.',
  },
  {
    num: '06',
    icon: TrendingUp,
    title: 'Proprietary Data Pipeline',
    desc: 'Access distressed property data — tax delinquent, pre-foreclosure, vacant, absentee owners — pulled directly from county records and delivered to your dashboard daily.',
  },
];

const features = [
  { icon: Zap, label: 'AI Voice Agent', desc: 'Automated outbound & inbound calls' },
  { icon: Shield, label: 'Skip Tracing', desc: 'Find owner contact info instantly' },
  { icon: Globe, label: 'Acquisition Portals', desc: 'Branded seller-facing websites' },
  { icon: Mail, label: 'Auto Emails', desc: 'Drip campaigns & follow-ups' },
  { icon: BarChart3, label: 'Deal Pipeline', desc: 'Full investment CRM dashboard' },
  { icon: Clock, label: 'Distress Data', desc: 'Fresh leads from public records' },
  { icon: Users, label: 'Seller Management', desc: 'Track every seller interaction' },
  { icon: Brain, label: 'AI Analysis', desc: 'Transcript scoring & insights' },
];

const fade = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] },
  }),
};

function DemoVideoSection() {
  return (
    <section id="see-it-in-action" className="py-20 px-6 border-t border-cyan-500/[0.08]">
      <div className="max-w-4xl mx-auto">
        <motion.p
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fade} custom={0}
          className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5 text-center"
        >
          How It Works
        </motion.p>
        <motion.h2
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fade} custom={1}
          className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center mb-12"
        >
          Your Entire Pipeline. <span className="text-cyan-400">Automated.</span>
        </motion.h2>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fade} custom={1}
          className="flex justify-center"
        >
          <WarrenVideoPlayer />
        </motion.div>
      </div>
    </section>
  );
}

export default function WarrenLanding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFunnelModal, setShowFunnelModal] = useState(false);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const headerBg = useTransform(scrollYProgress, [0, 0.05], ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="animate-spin h-6 w-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full" />
    </div>
  );
  

  return (
    <div ref={containerRef} className="bg-black text-white min-h-screen selection:bg-cyan-500/20">
      {/* ── Sticky Header ── */}
      <motion.header
        style={{ backgroundColor: headerBg }}
        className="fixed top-0 inset-x-0 z-50 backdrop-blur-md border-b border-white/[0.04]"
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center gap-3 cursor-pointer">
            <Building2 className="h-5 w-5 text-cyan-400" />
            <div className="flex flex-col leading-none">
              <span className="text-cyan-400/60 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
              <span className="text-white/80 font-medium text-base tracking-[0.15em] uppercase -mt-0.5">GURU</span>
            </div>
          </a>
          <div className="hidden sm:flex items-center gap-6">
            <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-white hover:text-cyan-400 text-xs tracking-[0.15em] uppercase transition-colors">
              Real Estate
            </a>
            <Link to="/videography" onClick={() => window.scrollTo(0, 0)} className="text-white/40 hover:text-white text-xs tracking-[0.15em] uppercase transition-colors">
              Videography
            </Link>
            <Link to="/webdesign" onClick={() => window.scrollTo(0, 0)} className="text-white/40 hover:text-white text-xs tracking-[0.15em] uppercase transition-colors">
              Web Design
            </Link>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => navigate('/auth')} className="text-white/40 hover:text-white transition-colors" title="Login">
              <Users className="h-5 w-5" />
            </button>
            <Link
              to="/pricing"
              className="px-6 py-2 text-xs tracking-[0.25em] uppercase bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded font-medium hover:from-cyan-400 hover:to-teal-400 transition-all"
            >
              Subscribe
            </Link>
          </div>
        </div>
      </motion.header>

      {/* ── Hero with Parallax ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Parallax BG */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxHero})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(0,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="relative text-center max-w-3xl px-6 pt-14"
        >
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-cyan-500/20 bg-cyan-500/[0.05] mb-8">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs tracking-[0.3em] uppercase text-cyan-400/70">AI-Powered Real Estate Investment Firm</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05]">
            Institutional-Grade
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">Acquisitions.</span>
          </h1>

          <p className="mt-8 text-base sm:text-lg text-white/40 max-w-xl mx-auto leading-relaxed font-light">
            AI voice agents qualify every seller. Distressed property data delivered daily. A full brokerage-grade CRM that runs your pipeline — so you can focus on closing.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/pricing"
              className="group flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#see-it-in-action"
              className="flex items-center gap-2 px-8 py-4 text-sm tracking-[0.2em] uppercase text-white/40 hover:text-cyan-400 transition-colors"
            >
              See It In Action
              <ChevronDown className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-16 flex items-center justify-center gap-10 text-white/20">
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">24hr</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Free Trial</div>
            </div>
            <div className="w-px h-12 bg-cyan-500/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">100%</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Automated</div>
            </div>
            <div className="w-px h-12 bg-cyan-500/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">$50M+</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Deals Closed</div>
            </div>
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

      {/* ── Parallax: AI Neighborhood Data ── */}
      <section className="relative py-32 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxNeighborhood})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/80 to-black/60" />
        <div className="relative max-w-3xl mx-auto px-6 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.05]">
              <Briefcase className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs tracking-[0.2em] uppercase text-cyan-400/70">Data-Driven Investing</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Proprietary Market Intelligence <span className="text-cyan-400">at Scale.</span>
            </h2>
            <p className="text-white/40 text-lg leading-relaxed max-w-xl mx-auto">
              Our AI analyzes every property in your target market — identifying distress signals, equity positions, and motivation indicators that human scouts miss.
            </p>
            <div className="inline-grid gap-3 text-left">
              {['Tax Delinquent & Pre-Foreclosure Detection', 'Absentee Owner Identification', 'Vacancy & Code Violation Analysis', 'Automated Skip Tracing'].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-white/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
        </div>
      </section>

      {/* ── Demo Video ── */}
      <DemoVideoSection />

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-cyan-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5 text-center"
          >
            The Process
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14"
          >
            How Our Firm <span className="text-cyan-400">Operates</span>
          </motion.h2>

          <div className="space-y-0">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
                variants={fade} custom={i}
                className="group relative flex gap-6 py-10 border-b border-cyan-500/[0.06] last:border-0"
              >
                <div className="flex-shrink-0 w-14 flex flex-col items-center">
                  <span className="text-xs tracking-wider text-cyan-400/30 font-mono">{step.num}</span>
                  <div className="mt-3 w-12 h-12 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/[0.1] flex items-center justify-center group-hover:border-cyan-500/30 group-hover:bg-cyan-500/[0.08] transition-all duration-500">
                    <step.icon className="h-5 w-5 text-cyan-400/50 group-hover:text-cyan-400 transition-colors duration-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold tracking-wide text-white/80 group-hover:text-white transition-colors duration-300">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm sm:text-base text-white/30 leading-relaxed group-hover:text-white/40 transition-colors duration-300">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Parallax: AI Command Center ── */}
      <section className="relative py-28 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxCommand})` }}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-3xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
            AI That Works <span className="text-cyan-400">24/7</span> — So You Don't Have To.
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            Our AI command center processes leads, qualifies sellers, and manages your pipeline around the clock. Every call, every email, every follow-up — handled automatically.
          </p>
        </div>
      </section>

      {/* ── Dashboard Preview ── */}
      <section className="py-20 px-6 border-t border-cyan-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5 text-center"
          >
            Your Dashboard
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-12"
          >
            Brokerage-Grade <span className="text-cyan-400">CRM</span>
          </motion.h2>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={2}
            className="flex justify-center"
          >
            <img
              src={dashboardPreview}
              alt="Investment CRM Dashboard preview showing deal pipeline and analytics"
              className="w-full max-w-3xl rounded-2xl border border-cyan-500/10 shadow-2xl shadow-cyan-500/[0.05]"
              loading="lazy"
            />
          </motion.div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="py-24 px-6 border-t border-cyan-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5 text-center"
          >
            Full Suite
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14"
          >
            One Subscription. <span className="text-cyan-400">Full Stack.</span>
          </motion.h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fade} custom={i}
                className="group p-6 rounded-xl border border-cyan-500/[0.06] bg-cyan-500/[0.02] hover:bg-cyan-500/[0.05] hover:border-cyan-500/20 transition-all duration-500 text-center"
              >
                <f.icon className="h-6 w-6 mx-auto text-cyan-400/30 group-hover:text-cyan-400 transition-colors duration-500 mb-3" />
                <div className="text-sm tracking-wider uppercase font-medium text-white/60 group-hover:text-white/80 transition-colors">{f.label}</div>
                <div className="text-xs text-white/25 mt-2 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Funnel Leads CTA ── */}
      <section className="py-16 px-6 border-t border-cyan-500/[0.08]">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}>
            <p className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-4">See A Working Funnel</p>
            <p className="text-sm text-white/40 max-w-md mx-auto mb-8 leading-relaxed">
              Preview a live seller acquisition portal — built, branded, and ready to capture leads on autopilot.
            </p>
            <button
              onClick={() => setShowFunnelModal(true)}
              className="group inline-flex items-center gap-3 px-10 py-4 border border-cyan-500/20 rounded-lg text-sm tracking-[0.2em] uppercase text-cyan-400/70 hover:text-cyan-400 hover:border-cyan-500/40 hover:bg-cyan-500/[0.05] transition-all"
            >
              View Live Funnel
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Funnel iframe modal */}
      {showFunnelModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setShowFunnelModal(false)}
        >
          <div
            className="relative w-full max-w-4xl h-[80vh] rounded-[2rem] overflow-hidden border border-cyan-500/20 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowFunnelModal(false)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 transition-colors"
            >
              ✕
            </button>
            <iframe
              src="https://warren.guru/sell/home"
              className="w-full h-full bg-white"
              title="Funnel Landing Page Preview"
            />
          </div>
        </div>
      )}

      {/* ── Parallax CTA: AI Appraisal ── */}
      <section className="relative py-32 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxAppraisal})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/50" />
        <div className="max-w-2xl mx-auto text-center relative px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}>
            <p className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5">Ready to Scale?</p>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
              Stop chasing.
              <br />
              <span className="text-cyan-400/60">Start closing.</span>
            </h2>
            <p className="mt-6 text-base text-white/30 max-w-md mx-auto leading-relaxed">
              24-hour free trial. $599/mo for the first 90 days. Cancel anytime.
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
            <Building2 className="h-4 w-4 text-cyan-400/40" />
            <div className="flex flex-col leading-none">
              <span className="text-cyan-400/30 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
              <span className="text-white/40 font-medium text-sm tracking-[0.15em] uppercase -mt-0.5">GURU</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">
              Terms
            </Link>
            <Link to="/pricing" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">
              Pricing
            </Link>
            <a href="https://discord.gg/warrenguru" target="_blank" rel="noopener noreferrer" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">
              Discord
            </a>
          </div>
          <p className="text-xs text-white/15">© {new Date().getFullYear()} Warren Guru. All rights reserved.</p>
        </div>
      </footer>
      <ScrollToTopButton />
    </div>
  );
}
