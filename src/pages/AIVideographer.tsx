import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Video, Camera, Wifi, Heart, Flower2, Mic } from 'lucide-react';
import { motion } from 'framer-motion';
import serviceVid from '@/assets/landing/service-video-v2.jpg';

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] } }),
};

export default function AIVideographer() {
  return (
    <div className="bg-black text-white min-h-screen">
      <header className="fixed top-0 inset-x-0 z-50 bg-black/80 backdrop-blur-md border-b border-amber-500/[0.06]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/30 hover:text-white transition-colors text-xs tracking-[0.15em] uppercase">
            <ArrowLeft className="h-3.5 w-3.5" /> GURU
          </Link>
          <Link to="/pricing" className="px-5 py-1.5 text-[10px] tracking-[0.3em] uppercase bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded-full font-medium hover:opacity-90 transition-all">
            Book Now
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative h-[70vh] flex items-end overflow-hidden">
        <img src={serviceVid} alt="AI Videography" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto w-full px-6 pb-16">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-[10px] tracking-[0.5em] uppercase text-amber-400/50 font-mono">Service 03</span>
            <h1 className="mt-2 text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[0.95]">
              AI <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Videographer</span>
            </h1>
            <p className="mt-3 text-white/30 text-lg font-light max-w-lg">
              Real people. AI-enhanced production. Best prices in town for weddings, funerals, and live events.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Services grid */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { icon: Heart, label: 'Weddings' },
            { icon: Flower2, label: 'Memorials' },
            { icon: Camera, label: 'Events' },
            { icon: Wifi, label: 'Live Streaming' },
            { icon: Video, label: 'AI Editing' },
            { icon: Mic, label: 'Best Prices' },
          ].map((f, i) => (
            <motion.div
              key={f.label}
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fade} custom={i}
              className="group aspect-square rounded-2xl border border-amber-500/[0.08] bg-amber-500/[0.02] hover:bg-amber-500/[0.06] hover:border-amber-500/20 transition-all duration-500 flex flex-col items-center justify-center gap-4"
            >
              <f.icon className="h-8 w-8 text-amber-400/20 group-hover:text-amber-400 transition-colors duration-500" />
              <div className="text-xs tracking-[0.2em] uppercase text-white/30 group-hover:text-white/70 transition-colors">{f.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works — minimal */}
      <section className="py-16 px-6 border-t border-amber-500/[0.06]">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-8 sm:gap-16 justify-center">
          {[
            { num: '01', word: 'Book' },
            { num: '02', word: 'Shoot' },
            { num: '03', word: 'Stream' },
            { num: '04', word: 'Deliver' },
          ].map((s) => (
            <div key={s.num} className="text-center">
              <span className="text-[10px] font-mono text-amber-400/20 block">{s.num}</span>
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white/50">{s.word}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-amber-500/[0.06]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold tracking-tight mb-8">
            Capture your <span className="text-amber-400/60">moment.</span>
          </h2>
          <Link to="/pricing" className="group inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded-full text-xs tracking-[0.25em] uppercase font-semibold hover:opacity-90 transition-all">
            Book Now <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] py-6 px-6 text-center">
        <Link to="/" className="text-[10px] text-white/15 hover:text-white/30 transition-colors tracking-[0.2em] uppercase">← GURU</Link>
      </footer>
    </div>
  );
}
