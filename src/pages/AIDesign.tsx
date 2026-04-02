import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Palette, Layers, PenTool, Image, Monitor, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import serviceDesign from '@/assets/landing/service-ai-design.jpg';

const fade = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] } }),
};

const offerings = [
  { icon: Palette, title: 'Brand Identity', desc: 'Complete logo, color palette, typography, and brand guidelines — all AI-generated and professionally refined.' },
  { icon: Layers, title: 'Marketing Materials', desc: 'Brochures, flyers, business cards, and print collateral designed to convert.' },
  { icon: PenTool, title: 'Social Media Assets', desc: 'Consistent, on-brand graphics for every platform — Instagram, Facebook, LinkedIn, X.' },
  { icon: Image, title: 'Digital Illustrations', desc: 'Custom AI-generated illustrations, infographics, and visual assets for any use case.' },
  { icon: Monitor, title: 'UI/UX Design', desc: 'Wireframes, mockups, and full design systems for web and mobile applications.' },
  { icon: Sparkles, title: 'Rapid Iteration', desc: 'AI lets us produce 10 variations in the time it takes others to make 1. You pick the best.' },
];

export default function AIDesign() {
  return (
    <div className="bg-black text-white min-h-screen">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-black/80 backdrop-blur-md border-b border-purple-500/[0.08]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link to="/pricing" className="px-6 py-2 text-xs tracking-[0.25em] uppercase bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded font-medium hover:opacity-90 transition-all">
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${serviceDesign})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/80 to-black" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/20 bg-purple-500/[0.05] mb-8">
              <Palette className="h-4 w-4 text-purple-400" />
              <span className="text-xs tracking-[0.3em] uppercase text-purple-400/70">AI-Powered Design Studio</span>
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
              AI <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Design</span>
            </h1>
            <p className="mt-6 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
              Professional creative services accelerated by artificial intelligence. Premium quality, faster delivery, better prices.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Offerings */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}
            className="text-3xl font-bold text-center mb-14">
            What We <span className="text-purple-400">Deliver</span>
          </motion.h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {offerings.map((item, i) => (
              <motion.div key={item.title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={i}
                className="group p-8 rounded-xl border border-purple-500/[0.08] bg-purple-500/[0.02] hover:bg-purple-500/[0.06] hover:border-purple-500/20 transition-all duration-500">
                <item.icon className="h-7 w-7 text-purple-400/40 group-hover:text-purple-400 transition-colors mb-4" />
                <h3 className="text-lg font-semibold text-white/80 mb-2">{item.title}</h3>
                <p className="text-sm text-white/30 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-purple-500/[0.08]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to <span className="text-purple-400">create</span>?</h2>
          <p className="text-white/30 mb-8">Get AI-powered design that stands out.</p>
          <Link to="/pricing" className="group inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:opacity-90 transition-all">
            View Pricing <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] py-6 px-6 text-center">
        <Link to="/" className="text-xs text-white/20 hover:text-white/40 transition-colors tracking-wider uppercase">← Back to GURU</Link>
      </footer>
    </div>
  );
}
