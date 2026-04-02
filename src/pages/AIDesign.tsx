import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Phone, Brain, Globe, BarChart3, Mail, TrendingUp, Zap, Shield, Users, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import serviceAcq from '@/assets/landing/service-acquisitions.jpg';
import parallaxCommand from '@/assets/landing/parallax-ai-command.jpg';

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] } }),
};

const steps = [
  { num: '01', icon: Globe, title: 'Branded Acquisition Portal', short: 'Sellers submit their property. The system takes over.' },
  { num: '02', icon: Phone, title: 'AI Closes the Call', short: 'AI voice agent qualifies motivation, timeline, and price.' },
  { num: '03', icon: Brain, title: 'Lead Scoring', short: 'Every transcript analyzed. Every lead scored.' },
  { num: '04', icon: BarChart3, title: 'Deal Pipeline', short: 'New → Contacted → Qualified → Under Contract → Closed.' },
  { num: '05', icon: Mail, title: 'Auto Communications', short: 'Follow-ups, confirmations, and nurture sequences.' },
  { num: '06', icon: TrendingUp, title: 'Distress Data Pipeline', short: 'Tax delinquent, pre-foreclosure, vacant — delivered daily.' },
];

export default function AIDesign() {
  return (
    <div className="bg-black text-white min-h-screen">
      <header className="fixed top-0 inset-x-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/[0.06]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/30 hover:text-white transition-colors text-xs tracking-[0.15em] uppercase">
            <ArrowLeft className="h-3.5 w-3.5" /> GURU
          </Link>
          <Link to="/pricing" className="px-5 py-1.5 text-[10px] tracking-[0.3em] uppercase bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-full font-medium hover:opacity-90 transition-all">
            Subscribe
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative h-[70vh] flex items-end overflow-hidden">
        <img src={serviceAcq} alt="AI Real Estate Acquisitions" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto w-full px-6 pb-16">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-[10px] tracking-[0.5em] uppercase text-cyan-400/50 font-mono">Service 01</span>
            <h1 className="mt-2 text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[0.95]">
              AI <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">Acquisitions</span>
            </h1>
            <p className="mt-3 text-white/30 text-lg font-light max-w-lg">
              Institutional-grade real estate acquisitions powered by AI voice agents, distress data, and a full CRM pipeline.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pipeline Steps */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
              variants={fade} custom={i}
              className="group flex gap-6 py-8 border-b border-cyan-500/[0.06] last:border-0"
            >
              <div className="flex-shrink-0 w-14 flex flex-col items-center">
                <span className="text-[10px] tracking-wider text-cyan-400/20 font-mono">{step.num}</span>
                <div className="mt-2 w-10 h-10 rounded-lg bg-cyan-500/[0.04] border border-cyan-500/[0.08] flex items-center justify-center group-hover:border-cyan-500/30 transition-all duration-500">
                  <step.icon className="h-4 w-4 text-cyan-400/30 group-hover:text-cyan-400 transition-colors duration-500" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white/70 group-hover:text-white transition-colors">{step.title}</h3>
                <p className="mt-1 text-sm text-white/25">{step.short}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Parallax visual break */}
      <section className="relative h-[50vh] overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${parallaxCommand})` }} />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative h-full flex items-center justify-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center px-6">
            AI Works <span className="text-cyan-400/60">24/7</span>
          </h2>
        </div>
      </section>

      {/* Features grid */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Zap, label: 'AI Voice Agent' },
            { icon: Shield, label: 'Skip Tracing' },
            { icon: Globe, label: 'Seller Portals' },
            { icon: Mail, label: 'Auto Emails' },
            { icon: BarChart3, label: 'Deal Pipeline' },
            { icon: Clock, label: 'Distress Data' },
            { icon: Users, label: 'Seller CRM' },
            { icon: Brain, label: 'AI Analysis' },
          ].map((f, i) => (
            <motion.div
              key={f.label}
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fade} custom={i}
              className="group p-6 rounded-xl border border-cyan-500/[0.06] bg-cyan-500/[0.02] hover:bg-cyan-500/[0.06] hover:border-cyan-500/20 transition-all duration-500 text-center"
            >
              <f.icon className="h-5 w-5 mx-auto text-cyan-400/20 group-hover:text-cyan-400 transition-colors duration-500 mb-2" />
              <div className="text-xs tracking-[0.15em] uppercase text-white/40 group-hover:text-white/70 transition-colors">{f.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-cyan-500/[0.06]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold tracking-tight mb-8">
            Start <span className="text-cyan-400/60">closing.</span>
          </h2>
          <Link to="/pricing" className="group inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-full text-xs tracking-[0.25em] uppercase font-semibold hover:opacity-90 transition-all">
            View Pricing <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] py-6 px-6 text-center">
        <Link to="/" className="text-[10px] text-white/15 hover:text-white/30 transition-colors tracking-[0.2em] uppercase">← GURU</Link>
      </footer>
    </div>
  );
}
