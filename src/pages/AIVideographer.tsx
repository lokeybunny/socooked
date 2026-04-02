import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Video, Camera, Wifi, Heart, Flower2, Mic } from 'lucide-react';
import { motion } from 'framer-motion';
import serviceVideo from '@/assets/landing/service-ai-videographer.jpg';

const fade = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] } }),
};

const offerings = [
  { icon: Heart, title: 'Wedding Videography', desc: 'Capture every moment of your special day — professionally filmed and AI-enhanced for cinematic quality at accessible prices.' },
  { icon: Flower2, title: 'Funeral & Memorial Coverage', desc: 'Dignified, professional coverage of memorial services — allowing distant family and friends to be present through live streaming.' },
  { icon: Camera, title: 'Event Videography', desc: 'Conferences, parties, corporate events — multi-camera setups with AI-assisted editing for fast turnaround.' },
  { icon: Wifi, title: 'Live Streaming', desc: 'Professional multi-platform live streaming to YouTube, Facebook, and custom destinations — reach your audience wherever they are.' },
  { icon: Video, title: 'AI-Enhanced Editing', desc: 'Our AI post-production pipeline delivers polished, color-graded, highlight reels faster than traditional editing houses.' },
  { icon: Mic, title: 'Best Prices in Town', desc: 'AI efficiency means we pass savings to you. Get professional video production at prices that make sense for real people.' },
];

export default function AIVideographer() {
  return (
    <div className="bg-black text-white min-h-screen">
      <header className="fixed top-0 inset-x-0 z-50 bg-black/80 backdrop-blur-md border-b border-amber-500/[0.08]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link to="/pricing" className="px-6 py-2 text-xs tracking-[0.25em] uppercase bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded font-medium hover:opacity-90 transition-all">
            Book Now
          </Link>
        </div>
      </header>

      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${serviceVideo})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/80 to-black" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/20 bg-amber-500/[0.05] mb-8">
              <Video className="h-4 w-4 text-amber-400" />
              <span className="text-xs tracking-[0.3em] uppercase text-amber-400/70">AI-Enhanced Videography</span>
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
              AI <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Videographer</span>
            </h1>
            <p className="mt-6 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
              Real videographers. AI-enhanced production. The best prices in town for weddings, funerals, and events — professionally shot and live streamed to your audience.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0}
            className="text-3xl font-bold text-center mb-14">
            What We <span className="text-amber-400">Capture</span>
          </motion.h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {offerings.map((item, i) => (
              <motion.div key={item.title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={i}
                className="group p-8 rounded-xl border border-amber-500/[0.08] bg-amber-500/[0.02] hover:bg-amber-500/[0.06] hover:border-amber-500/20 transition-all duration-500">
                <item.icon className="h-7 w-7 text-amber-400/40 group-hover:text-amber-400 transition-colors mb-4" />
                <h3 className="text-lg font-semibold text-white/80 mb-2">{item.title}</h3>
                <p className="text-sm text-white/30 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 border-t border-amber-500/[0.08]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It <span className="text-amber-400">Works</span></h2>
          <div className="space-y-8">
            {[
              { num: '01', title: 'Book Your Event', desc: 'Tell us the date, type, and location. We match you with the right videographer in your area.' },
              { num: '02', title: 'We Show Up & Shoot', desc: 'A professional videographer captures your event with cinema-grade equipment and multi-camera setups.' },
              { num: '03', title: 'AI Enhances Everything', desc: 'Our AI pipeline handles color grading, stabilization, audio mixing, and highlight reel creation.' },
              { num: '04', title: 'Live Stream & Deliver', desc: 'Your event is live streamed in real-time. Final edited footage delivered within 48 hours.' },
            ].map((step) => (
              <div key={step.num} className="flex gap-6 items-start">
                <span className="text-xs font-mono text-amber-400/30 mt-1">{step.num}</span>
                <div>
                  <h3 className="text-lg font-semibold text-white/80 mb-1">{step.title}</h3>
                  <p className="text-sm text-white/30 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 border-t border-amber-500/[0.08]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to <span className="text-amber-400">capture</span> your moment?</h2>
          <p className="text-white/30 mb-8">Professional videography at prices that make sense.</p>
          <Link to="/pricing" className="group inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:opacity-90 transition-all">
            Book Now <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] py-6 px-6 text-center">
        <Link to="/" className="text-xs text-white/20 hover:text-white/40 transition-colors tracking-wider uppercase">← Back to GURU</Link>
      </footer>
    </div>
  );
}
