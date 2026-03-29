import { useRef, useState, Suspense, lazy } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import {
  ArrowRight, Zap, Phone, Globe, Mail, BarChart3, Brain,
  ChevronDown, Shield, Clock, Users, TrendingUp
} from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Play } from 'lucide-react';
import aiTechThumb from '@/assets/landing/ai-tech-thumbnail.jpg';

const InvestorRobot = lazy(() => import('@/components/three/InvestorRobot'));

const steps = [
  {
    num: '01',
    icon: Globe,
    title: 'Your Branded Landing Page',
    desc: 'A professional, conversion-optimized seller landing page deployed under your brand. Sellers submit their property — name, phone, address — and the system takes over.',
  },
  {
    num: '02',
    icon: Phone,
    title: 'AI Voice Closes the Call',
    desc: 'Within seconds of a lead submission, our AI voice agent calls the seller, qualifies their motivation, timeline, and asking price — then logs structured notes directly to your CRM.',
  },
  {
    num: '03',
    icon: Brain,
    title: 'Smart Lead Scoring',
    desc: 'Every call transcript is analyzed by AI to extract motivation level, property condition, timeline urgency, and a lead score — so you know exactly who to prioritize.',
  },
  {
    num: '04',
    icon: BarChart3,
    title: 'Your Full CRM Pipeline',
    desc: 'Sellers flow through a managed pipeline: New → Contacted → Qualified → Under Contract → Closed. Track distress signals, skip-trace contacts, and manage deals — all in one place.',
  },
  {
    num: '05',
    icon: Mail,
    title: 'Automated Email Updates',
    desc: 'The system sends professional follow-up emails on your behalf — confirmations, status updates, and nurture sequences — keeping sellers engaged without lifting a finger.',
  },
  {
    num: '06',
    icon: TrendingUp,
    title: 'Fresh Leads from Our API',
    desc: 'Access distressed property data — tax delinquent, pre-foreclosure, vacant, absentee owners — pulled directly from county records and delivered to your dashboard daily.',
  },
];

const features = [
  { icon: Zap, label: 'AI Voice Agent', desc: 'Automated outbound & inbound calls' },
  { icon: Shield, label: 'Skip Tracing', desc: 'Find owner contact info instantly' },
  { icon: Globe, label: 'Landing Pages', desc: 'Branded seller-facing websites' },
  { icon: Mail, label: 'Auto Emails', desc: 'Drip campaigns & follow-ups' },
  { icon: BarChart3, label: 'Deal Pipeline', desc: 'Full wholesale CRM dashboard' },
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
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <section className="py-20 px-6 border-t border-white/[0.04]">
      <div className="max-w-4xl mx-auto">
        <motion.p
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fade} custom={0}
          className="text-xs tracking-[0.4em] uppercase text-white/30 mb-5 text-center"
        >
          See It In Action
        </motion.p>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fade} custom={1}
          className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-cyan-500/5 group"
        >
          {!playing ? (
            <div className="relative cursor-pointer" onClick={() => setPlaying(true)}>
              <img
                src={aiTechThumb}
                alt="AI-powered wholesale automation demo"
                className="w-full aspect-video object-cover"
                loading="lazy"
                width={1920}
                height={1080}
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/30 transition-colors">
                <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play className="h-8 w-8 text-white ml-1" fill="white" />
                </div>
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-0 bg-cyan-400 rounded-full" />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-white/40">0:00</span>
                  <span className="text-[10px] text-white/40">2:34</span>
                </div>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              className="w-full aspect-video object-cover"
              controls
              autoPlay
              playsInline
              poster={aiTechThumb}
            >
              <source src="" type="video/mp4" />
            </video>
          )}
        </motion.div>
      </div>
    </section>
  );
}

export default function WarrenLanding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const headerBg = useTransform(scrollYProgress, [0, 0.05], ['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="animate-spin h-6 w-6 border-2 border-white/30 border-t-white rounded-full" />
    </div>
  );
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div ref={containerRef} className="bg-black text-white min-h-screen selection:bg-white/20">
      {/* ── Sticky Header ── */}
      <motion.header
        style={{ backgroundColor: headerBg }}
        className="fixed top-0 inset-x-0 z-50 backdrop-blur-md border-b border-white/[0.04]"
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex flex-col leading-none">
            <span className="text-white/30 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/80 font-medium text-base tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => navigate('/auth')} className="text-white/40 hover:text-white text-sm tracking-wider transition-colors">
              Login
            </button>
            <Link
              to="/pricing"
              className="px-6 py-2 text-xs tracking-[0.25em] uppercase bg-white text-black rounded font-medium hover:bg-white/90 transition-colors"
            >
              Subscribe
            </Link>
          </div>
        </div>
      </motion.header>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-14 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.03)_0%,_transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="relative text-center max-w-3xl"
        >
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-white/10 bg-white/[0.03] mb-8">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs tracking-[0.3em] uppercase text-white/50">Now Accepting Subscribers</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05]">
            Wholesale Real Estate
            <br />
            <span className="text-white/40">on Autopilot.</span>
          </h1>

          <p className="mt-8 text-base sm:text-lg text-white/40 max-w-xl mx-auto leading-relaxed font-light">
            AI voice agents close your seller calls. Fresh distressed leads delivered daily. A full CRM that runs your pipeline — while you focus on deals.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/pricing"
              className="group flex items-center gap-3 px-10 py-4 bg-white text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:bg-white/90 transition-all"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#how-it-works"
              className="flex items-center gap-2 px-8 py-4 text-sm tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors"
            >
              See How It Works
              <ChevronDown className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-16 flex items-center justify-center gap-10 text-white/20">
            <div className="text-center">
              <div className="text-3xl font-bold text-white/60">24hr</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Free Trial</div>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white/60">100%</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Automated</div>
            </div>
          </div>

          {/* 3D Investor Robot */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="mt-12"
          >
            <Suspense fallback={<div className="h-[45vh]" />}>
              <InvestorRobot />
            </Suspense>
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="h-5 w-5 text-white/20" />
        </motion.div>
      </section>

      {/* ── Problem ── */}
      <section className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto text-center">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-white/30 mb-5"
          >
            The Problem
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight"
          >
            You're leaving deals on the table.
          </motion.h2>
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={2}
            className="mt-6 text-base sm:text-lg text-white/35 leading-relaxed max-w-xl mx-auto"
          >
            Cold calling for hours. Manually tracking sellers in spreadsheets. Missing hot leads because you can't call back fast enough. The wholesale game is brutal when you're doing everything by hand.
          </motion.p>
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={3}
            className="mt-5 text-base text-white/50 font-medium"
          >
            Warren Guru replaces the grind with a system.
          </motion.p>
        </div>
      </section>

      {/* ── Demo Video ── */}
      <DemoVideoSection />

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-white/30 mb-5 text-center"
          >
            How It Works
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center mb-16"
          >
            Your Entire Pipeline. Automated.
          </motion.h2>

          <div className="space-y-0">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
                variants={fade} custom={i}
                className="group relative flex gap-6 py-10 border-b border-white/[0.04] last:border-0"
              >
                <div className="flex-shrink-0 w-14 flex flex-col items-center">
                  <span className="text-xs tracking-wider text-white/20 font-mono">{step.num}</span>
                  <div className="mt-3 w-12 h-12 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center group-hover:border-white/20 group-hover:bg-white/[0.06] transition-all duration-500">
                    <step.icon className="h-5 w-5 text-white/40 group-hover:text-white/70 transition-colors duration-500" />
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

      {/* ── Features Grid ── */}
      <section className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-white/30 mb-5 text-center"
          >
            Everything Included
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14"
          >
            One Subscription. Full Stack.
          </motion.h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fade} custom={i}
                className="group p-6 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-500 text-center"
              >
                <f.icon className="h-6 w-6 mx-auto text-white/25 group-hover:text-white/60 transition-colors duration-500 mb-3" />
                <div className="text-sm tracking-wider uppercase font-medium text-white/60 group-hover:text-white/80 transition-colors">{f.label}</div>
                <div className="text-xs text-white/25 mt-2 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 px-6 border-t border-white/[0.04] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(255,255,255,0.02)_0%,_transparent_60%)]" />
        <div className="max-w-2xl mx-auto text-center relative">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}>
            <p className="text-xs tracking-[0.4em] uppercase text-white/30 mb-5">Ready to Automate?</p>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
              Stop chasing.
              <br />
              <span className="text-white/40">Start closing.</span>
            </h2>
            <p className="mt-6 text-base text-white/30 max-w-md mx-auto leading-relaxed">
              24-hour free trial. $599/mo for the first 90 days. Cancel anytime.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/pricing"
                className="group flex items-center gap-3 px-12 py-4 bg-white text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:bg-white/90 transition-all"
              >
                View Pricing
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col leading-none">
            <span className="text-white/20 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/40 font-medium text-sm tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-xs tracking-wider uppercase text-white/20 hover:text-white/50 transition-colors">
              Terms
            </Link>
            <Link to="/pricing" className="text-xs tracking-wider uppercase text-white/20 hover:text-white/50 transition-colors">
              Pricing
            </Link>
          </div>
          <p className="text-xs text-white/15">&copy; {new Date().getFullYear()} Warren Guru</p>
        </div>
      </footer>
    </div>
  );
}
