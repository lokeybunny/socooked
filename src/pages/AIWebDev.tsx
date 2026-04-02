import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Code2, Globe, Server, Smartphone, Zap, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import serviceWeb from '@/assets/landing/service-webdev-v2.jpg';

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] } }),
};

export default function AIWebDev() {
  return (
    <div className="bg-black text-white min-h-screen">
      <header className="fixed top-0 inset-x-0 z-50 bg-black/80 backdrop-blur-md border-b border-purple-500/[0.06]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/30 hover:text-white transition-colors text-xs tracking-[0.15em] uppercase">
            <ArrowLeft className="h-3.5 w-3.5" /> GURU
          </Link>
          <Link to="/pricing" className="px-5 py-1.5 text-[10px] tracking-[0.3em] uppercase bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded-full font-medium hover:opacity-90 transition-all">
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative h-[70vh] flex items-end overflow-hidden">
        <img src={serviceWeb} alt="AI Web Development" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto w-full px-6 pb-16">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-[10px] tracking-[0.5em] uppercase text-purple-400/50 font-mono">Service 02</span>
            <h1 className="mt-2 text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[0.95]">
              AI <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">Web Dev</span>
            </h1>
            <p className="mt-3 text-white/30 text-lg font-light max-w-lg">
              Enterprise-grade digital solutions built at startup speed. Days, not months.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Visual grid */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { icon: Globe, label: 'Custom Websites' },
            { icon: Server, label: 'Web Apps' },
            { icon: Smartphone, label: 'Landing Pages' },
            { icon: Zap, label: 'API Integrations' },
            { icon: Shield, label: 'Security' },
            { icon: Code2, label: 'AI-Accelerated' },
          ].map((f, i) => (
            <motion.div
              key={f.label}
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fade} custom={i}
              className="group aspect-square rounded-2xl border border-purple-500/[0.08] bg-purple-500/[0.02] hover:bg-purple-500/[0.06] hover:border-purple-500/20 transition-all duration-500 flex flex-col items-center justify-center gap-4"
            >
              <f.icon className="h-8 w-8 text-purple-400/20 group-hover:text-purple-400 transition-colors duration-500" />
              <div className="text-xs tracking-[0.2em] uppercase text-white/30 group-hover:text-white/70 transition-colors">{f.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-purple-500/[0.06]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold tracking-tight mb-8">
            Ready to <span className="text-purple-400/60">build?</span>
          </h2>
          <Link to="/pricing" className="group inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded-full text-xs tracking-[0.25em] uppercase font-semibold hover:opacity-90 transition-all">
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
