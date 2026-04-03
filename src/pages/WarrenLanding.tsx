import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

import {
  ArrowRight, Zap, Globe, BarChart3, Brain,
  ChevronDown, Shield, Clock, Users, TrendingUp, Cpu, Rocket,
  Code, Layers, Newspaper, Bot, Coins, Radio
} from 'lucide-react';
import ScrollToTopButton from '@/components/landing/ScrollToTopButton';
import { motion, useScroll, useTransform } from 'framer-motion';
import WarrenVideoPlayer from '@/components/landing/WarrenVideoPlayer';

import parallaxHero from '@/assets/landing/parallax-hero-solana.jpg';
import parallaxMemecoins from '@/assets/landing/parallax-solana-memecoins.jpg';
import parallaxCommand from '@/assets/landing/parallax-solana-command.jpg';
import parallaxDeploy from '@/assets/landing/parallax-solana-deploy.jpg';
import dashboardPreview from '@/assets/landing/solana-dashboard-preview.jpg';

const steps = [
  {
    num: '01',
    icon: Layers,
    title: 'Learn Solana Fundamentals',
    desc: 'Understand the Solana blockchain from the ground up — wallets, SPL tokens, program architecture, and how meme coins actually work under the hood.',
  },
  {
    num: '02',
    icon: Code,
    title: 'Build Your Token & Smart Contract',
    desc: 'We walk you through creating your own SPL token, setting up metadata, configuring supply, and writing the smart contract logic — no CS degree required.',
  },
  {
    num: '03',
    icon: Rocket,
    title: 'Bundle & Deploy on Solana',
    desc: 'Master the art of bundling — multi-wallet launches, liquidity pooling, and sniping protection. Deploy your project with confidence on mainnet.',
  },
  {
    num: '04',
    icon: Bot,
    title: 'AI-Powered Project Management',
    desc: 'Use our AI tools to generate branding, build community narratives, automate social media, and track your token\'s performance in real time.',
  },
  {
    num: '05',
    icon: Newspaper,
    title: 'CT News & Alpha Intel',
    desc: 'Stay ahead of Crypto Twitter with curated alpha, trending narratives, and real-time sentiment analysis — so you know what\'s moving before the crowd.',
  },
  {
    num: '06',
    icon: TrendingUp,
    title: 'Scale & Sustain Your Project',
    desc: 'Learn holder retention strategies, community building frameworks, and revenue models that keep your project alive long after launch day.',
  },
];

const features = [
  { icon: Coins, label: 'Token Bundler', desc: 'Multi-wallet Solana launches' },
  { icon: Shield, label: 'Anti-Snipe', desc: 'Protected deployment strategies' },
  { icon: Bot, label: 'AI Branding', desc: 'Auto-generate project identity' },
  { icon: Newspaper, label: 'CT Intel', desc: 'Real-time crypto twitter alpha' },
  { icon: BarChart3, label: 'Token Analytics', desc: 'Live charts & holder tracking' },
  { icon: Radio, label: 'Community Tools', desc: 'Discord & Telegram automation' },
  { icon: Brain, label: 'AI Research', desc: 'Narrative & sentiment analysis' },
  { icon: Code, label: 'Smart Contracts', desc: 'Solana program templates' },
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
    <section id="see-it-in-action" className="py-20 px-6 border-t border-amber-500/[0.08]">
      <div className="max-w-4xl mx-auto">
        <motion.p
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fade} custom={0}
          className="text-xs tracking-[0.4em] uppercase text-amber-400/50 mb-5 text-center"
        >
          Watch & Learn
        </motion.p>
        <motion.h2
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fade} custom={1}
          className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center mb-12"
        >
          From Zero to <span className="text-amber-400">Deployed.</span>
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
  const headerBg = useTransform(scrollYProgress, [0, 0.05], ['rgba(0,0,0,0.6)', 'rgba(15,10,5,0.95)']);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="animate-spin h-6 w-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full" />
    </div>
  );

  return (
    <div ref={containerRef} className="bg-black text-white min-h-screen selection:bg-amber-500/20">
      {/* ── Sticky Header ── */}
      <motion.header
        style={{ backgroundColor: headerBg }}
        className="fixed top-0 inset-x-0 z-50 backdrop-blur-md border-b border-white/[0.04]"
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center gap-3 cursor-pointer">
            <Cpu className="h-5 w-5 text-amber-400" />
            <div className="flex flex-col leading-none">
              <span className="text-amber-400/60 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
              <span className="text-white/80 font-medium text-base tracking-[0.15em] uppercase -mt-0.5">GURU</span>
            </div>
          </a>
          <div className="hidden sm:flex items-center gap-6">
            <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-white hover:text-amber-400 text-xs tracking-[0.15em] uppercase transition-colors">
              Crypto
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
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2 text-xs tracking-[0.25em] uppercase bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded font-medium hover:from-amber-400 hover:to-orange-400 transition-all"
            >
              Join Discord
            </a>
          </div>
        </div>
      </motion.header>

      {/* ── Hero with Parallax ── */}
      <section className="relative min-h-screen flex items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxHero})`, backgroundPosition: 'center 20%' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(245,158,11,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.2) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="relative w-full max-w-3xl mx-auto px-6 pb-20"
        >
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-amber-500/20 bg-amber-500/[0.05] mb-6">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs tracking-[0.3em] uppercase text-amber-400/70">AI-Powered Solana Project Studio</span>
          </div>

          <p className="text-base sm:text-lg text-white/50 max-w-xl leading-relaxed font-light mb-4">
            Learn to bundle, deploy meme tokens, and build full crypto projects from the ground up. AI tools, CT alpha, and step-by-step guides — presented by Warren Guru.
          </p>
          <p className="text-sm text-amber-400/60 max-w-xl leading-relaxed font-medium mb-8">
            🚀 Download the Warren Guru Bundler for Solana — free in the Discord, along with hours of free training.
          </p>

          <div className="flex flex-col sm:flex-row items-start gap-4">
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/20"
            >
              Join Discord
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#see-it-in-action"
              className="flex items-center gap-2 px-8 py-4 text-sm tracking-[0.2em] uppercase text-white/40 hover:text-amber-400 transition-colors"
            >
              See It In Action
              <ChevronDown className="h-4 w-4" />
            </a>
          </div>
        </motion.div>

        <motion.div
          className="absolute bottom-4 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="h-5 w-5 text-amber-400/30" />
        </motion.div>
      </section>

      {/* ── Parallax: Meme Coin Ecosystem ── */}
      <section className="relative py-32 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxMemecoins})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/80 to-black/60" />
        <div className="relative max-w-3xl mx-auto px-6 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/[0.05]">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs tracking-[0.2em] uppercase text-amber-400/70">Meme Project Mastery</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              From Concept to <span className="text-amber-400">Moonshot.</span>
            </h2>
            <p className="text-white/40 text-lg leading-relaxed max-w-xl mx-auto">
              Learn to identify trending narratives, build meme projects with real utility, and deploy tokens that stand out in a sea of rugs. Warren Guru breaks it all down.
            </p>
            <div className="inline-grid gap-3 text-left">
              {['Token Bundling & Multi-Wallet Strategies', 'AI-Generated Branding & Narratives', 'Liquidity Pool Setup & Management', 'Community Building & CT Marketing'].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-white/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
        </div>
      </section>

      {/* ── Demo Video ── */}
      <DemoVideoSection />

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-amber-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-amber-400/50 mb-5 text-center"
          >
            The Playbook
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14"
          >
            How You'll <span className="text-amber-400">Build</span>
          </motion.h2>

          <div className="space-y-0">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
                variants={fade} custom={i}
                className="group relative flex gap-6 py-10 border-b border-amber-500/[0.06] last:border-0"
              >
                <div className="flex-shrink-0 w-14 flex flex-col items-center">
                  <span className="text-xs tracking-wider text-amber-400/30 font-mono">{step.num}</span>
                  <div className="mt-3 w-12 h-12 rounded-lg bg-amber-500/[0.05] border border-amber-500/[0.1] flex items-center justify-center group-hover:border-amber-500/30 group-hover:bg-amber-500/[0.08] transition-all duration-500">
                    <step.icon className="h-5 w-5 text-amber-400/50 group-hover:text-amber-400 transition-colors duration-500" />
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
            AI That Builds <span className="text-amber-400">24/7</span> — So You Ship Faster.
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            Our AI command center generates token branding, writes smart contracts, monitors CT sentiment, and manages your community — all on autopilot.
          </p>
        </div>
      </section>

      {/* ── Dashboard Preview ── */}
      <section className="py-20 px-6 border-t border-amber-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-amber-400/50 mb-5 text-center"
          >
            Your Dashboard
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-12"
          >
            Full-Stack <span className="text-amber-400">Crypto Suite</span>
          </motion.h2>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={2}
            className="flex justify-center"
          >
            <img
              src={dashboardPreview}
              alt="Solana project dashboard showing token analytics, meme coin portfolio, and CT intelligence"
              className="w-full max-w-3xl rounded-2xl border border-amber-500/10 shadow-2xl shadow-amber-500/[0.05]"
              loading="lazy"
            />
          </motion.div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="py-24 px-6 border-t border-amber-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={0}
            className="text-xs tracking-[0.4em] uppercase text-amber-400/50 mb-5 text-center"
          >
            Full Suite
          </motion.p>
          <motion.h2
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fade} custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14"
          >
            One Platform. <span className="text-amber-400">Full Stack Crypto.</span>
          </motion.h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fade} custom={i}
                className="group p-6 rounded-xl border border-amber-500/[0.06] bg-amber-500/[0.02] hover:bg-amber-500/[0.05] hover:border-amber-500/20 transition-all duration-500 text-center"
              >
                <f.icon className="h-6 w-6 mx-auto text-amber-400/30 group-hover:text-amber-400 transition-colors duration-500 mb-3" />
                <div className="text-sm tracking-wider uppercase font-medium text-white/60 group-hover:text-white/80 transition-colors">{f.label}</div>
                <div className="text-xs text-white/25 mt-2 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── YouTube CTA ── */}
      <section className="py-16 px-6 border-t border-amber-500/[0.08]">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}>
            <p className="text-xs tracking-[0.4em] uppercase text-amber-400/50 mb-4">Follow the Journey</p>
            <p className="text-sm text-white/40 max-w-md mx-auto mb-8 leading-relaxed">
              Warren Guru documents every project build, every bundling strategy, and every CT alpha call — live on YouTube.
            </p>
            <a
              href="https://youtube.com/@warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 px-10 py-4 border border-amber-500/20 rounded-lg text-sm tracking-[0.2em] uppercase text-amber-400/70 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/[0.05] transition-all"
            >
              Watch on YouTube
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── Parallax CTA: Deploy ── */}
      <section className="relative py-32 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxDeploy})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/50" />
        <div className="max-w-2xl mx-auto text-center relative px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}>
            <p className="text-xs tracking-[0.4em] uppercase text-amber-400/50 mb-5">Ready to Launch?</p>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
              Stop watching.
              <br />
              <span className="text-amber-400/60">Start building.</span>
            </h2>
            <p className="mt-6 text-base text-white/30 max-w-md mx-auto leading-relaxed">
              The Warren Guru Bundler for Solana is available for free download in the Discord — plus hours of free training to get you from zero to deployed.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://discord.gg/warrenguru"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 px-12 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/20"
              >
                Join Discord
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-amber-500/[0.08] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Cpu className="h-4 w-4 text-amber-400/40" />
            <div className="flex flex-col leading-none">
              <span className="text-amber-400/30 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
              <span className="text-white/40 font-medium text-sm tracking-[0.15em] uppercase -mt-0.5">GURU</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-xs tracking-wider uppercase text-white/20 hover:text-amber-400/50 transition-colors">
              Terms
            </Link>
            <Link to="/pricing" className="text-xs tracking-wider uppercase text-white/20 hover:text-amber-400/50 transition-colors">
              Pricing
            </Link>
            <a href="https://discord.gg/warrenguru" target="_blank" rel="noopener noreferrer" className="text-xs tracking-wider uppercase text-white/20 hover:text-amber-400/50 transition-colors">
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
