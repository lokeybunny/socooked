import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Play, Film, Sparkles, GraduationCap, TrendingUp, X, ChevronLeft, ChevronRight, MessageCircle, ArrowUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/* ─── Vimeo showcase data (replace IDs with real ones) ─── */
const vimeoVideos = [
  { id: '1091155498', title: 'Cinematic AI Film', desc: 'AI-directed short film' },
  { id: '1091158498', title: 'Brand Story', desc: 'Luxury brand narrative' },
  { id: '1091160000', title: 'Music Visual', desc: 'AI music video concept' },
  { id: '1091162000', title: 'Product Launch', desc: 'Cinematic product reveal' },
  { id: '1091164000', title: 'Documentary Style', desc: 'AI documentary piece' },
  { id: '1091166000', title: 'Motion Art', desc: 'Abstract AI art film' },
];

const authorityCards = [
  { icon: Film, title: 'AI Director', stat: '100+', label: 'Projects Completed' },
  { icon: Sparkles, title: 'Filmmaker', stat: '50K+', label: 'Views Generated' },
  { icon: GraduationCap, title: 'Educator', stat: '2hr', label: 'Master Course' },
  { icon: TrendingUp, title: 'Viral Creator', stat: '10x', label: 'ROI Systems' },
];

const coursePoints = [
  'AI tools workflow — Kling, Seedance, Wan2.2 pipelines',
  'Cinematic storytelling system for AI-generated films',
  'Monetization blueprint — sell AI video services',
  'Prompt engineering for cinematic visuals',
  'Post-production & editing automation',
];

export default function AIDirector() {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const courseRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToFunnel = () => courseRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('customers').insert({
        full_name: formData.name.trim(),
        email: formData.email.trim(),
        source: 'ai-director-landing',
        status: 'lead',
        tags: ['ai-course'],
      });
      if (error) throw error;
      setSubmitted(true);
      toast({ title: 'You\'re in!', description: 'Check your inbox for course access.' });
    } catch {
      toast({ title: 'Something went wrong', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const scrollCarousel = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[hsl(0,0%,3%)] text-white selection:bg-emerald-500/30">
      {/* ─── Sticky header ─── */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-black/60 border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <Link to="/" className="flex flex-col leading-none">
            <span className="text-[9px] tracking-[0.3em] uppercase text-emerald-400/70">Warren</span>
            <span className="text-sm font-light tracking-[0.15em] uppercase text-white/80">GURU</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5">
            <button onClick={scrollToFunnel} className="text-[10px] sm:text-xs tracking-[0.15em] uppercase text-white/40 hover:text-emerald-400 transition-colors">
              Course
            </button>
            <a
              href="https://vimeo.com/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] sm:text-xs tracking-[0.15em] uppercase text-white/40 hover:text-white transition-colors"
            >
              Vimeo
            </a>
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] sm:text-xs tracking-wider uppercase hover:bg-emerald-500/20 transition-all"
            >
              <MessageCircle className="h-3 w-3" />
              Discord
            </a>
          </nav>
        </div>
      </header>

      {/* ─── 1. HERO ─── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
        {/* Animated gradient BG */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-black via-[hsl(0,0%,5%)] to-black" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse" />
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-emerald-400/3 blur-[80px]" />
        </div>

        <motion.div
          className="relative z-10 text-center max-w-3xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="text-[10px] sm:text-xs tracking-[0.4em] uppercase text-emerald-400/60 mb-4">
            AI Film Director
          </p>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-4">
            AI Films. Real Emotion.
            <br />
            <span className="text-emerald-400">Directed by Warren Guru.</span>
          </h1>
          <p className="text-sm sm:text-base text-white/40 font-light max-w-lg mx-auto mb-8">
            Turn ideas into cinematic AI experiences.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-500 text-black font-medium text-sm tracking-wide hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              Join Discord
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <button
              onClick={scrollToFunnel}
              className="group flex items-center gap-2 px-6 py-3 rounded-full border border-white/10 text-white/70 text-sm tracking-wide hover:border-emerald-500/30 hover:text-white transition-all"
            >
              Start Course
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-10 flex flex-col items-center gap-2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-px h-10 bg-gradient-to-b from-transparent to-emerald-400/40" />
          <span className="text-[10px] tracking-[0.3em] uppercase text-white/30">Scroll</span>
        </motion.div>
      </section>

      {/* ─── 2. VIDEO SHOWCASE ─── */}
      <section className="py-20 sm:py-28 px-4 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="text-[10px] tracking-[0.3em] uppercase text-emerald-400/60 mb-2">Portfolio</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Featured Work</h2>
          </motion.div>

          <div className="relative">
            <button onClick={() => scrollCarousel(-1)} className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div ref={scrollRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4 px-2">
              {vimeoVideos.map((v) => (
                <motion.div
                  key={v.id}
                  className="flex-none w-72 sm:w-80 snap-start cursor-pointer group"
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setActiveVideo(v.id)}
                >
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-white/5 border border-white/5 group-hover:border-emerald-500/20 transition-all">
                    <img
                      src={`https://vumbnail.com/${v.id}.jpg`}
                      alt={v.title}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                      <div className="p-3 rounded-full bg-emerald-500/20 backdrop-blur-sm border border-emerald-500/30 group-hover:scale-110 transition-transform">
                        <Play className="h-5 w-5 text-emerald-400" />
                      </div>
                    </div>
                  </div>
                  <h3 className="mt-3 text-sm font-medium text-white/80">{v.title}</h3>
                  <p className="text-xs text-white/30">{v.desc}</p>
                </motion.div>
              ))}
            </div>
            <button onClick={() => scrollCarousel(1)} className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Video Modal */}
      <AnimatePresence>
        {activeVideo && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveVideo(null)}
          >
            <motion.div
              className="relative w-full max-w-4xl aspect-video rounded-xl overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setActiveVideo(null)} className="absolute -top-10 right-0 text-white/50 hover:text-white transition-colors">
                <X className="h-6 w-6" />
              </button>
              <iframe
                src={`https://player.vimeo.com/video/${activeVideo}?autoplay=1&title=0&byline=0&portrait=0`}
                className="w-full h-full"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 3. AUTHORITY ─── */}
      <section className="py-20 sm:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-14"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="text-[10px] tracking-[0.3em] uppercase text-emerald-400/60 mb-2">Credentials</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Why Warren Guru?</h2>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {authorityCards.map((card, i) => (
              <motion.div
                key={card.title}
                className="group relative p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-emerald-500/20 hover:bg-emerald-500/[0.03] transition-all duration-300 text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <card.icon className="h-6 w-6 text-emerald-400/60 mx-auto mb-3" />
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mb-1">{card.stat}</p>
                <p className="text-xs text-white/30 mb-2">{card.label}</p>
                <p className="text-xs sm:text-sm font-medium text-white/70">{card.title}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 4. COURSE FUNNEL ─── */}
      <section ref={courseRef} className="py-20 sm:py-28 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-transparent" />
        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="text-[10px] tracking-[0.3em] uppercase text-emerald-400/60 mb-2">Master Course</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Learn AI Filmmaking in 2 Hours
            </h2>
            <p className="text-sm text-white/40 max-w-lg mx-auto">
              Step-by-step system to create cinematic AI films and monetize them.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Bullet points */}
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              {coursePoints.map((pt, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <p className="text-sm text-white/60 leading-relaxed">{pt}</p>
                </div>
              ))}
            </motion.div>

            {/* Form */}
            <motion.div
              className="p-6 sm:p-8 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-6 w-6 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">You're in!</h3>
                  <p className="text-sm text-white/40">Check your inbox for access.</p>
                  <a
                    href="https://discord.gg/warrenguru"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Join Discord <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h3 className="text-sm font-medium text-white/80 tracking-wider uppercase mb-4">Get Access</h3>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={formData.name}
                    onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                    required
                    maxLength={100}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors"
                  />
                  <input
                    type="email"
                    placeholder="Your email"
                    value={formData.email}
                    onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                    required
                    maxLength={255}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-emerald-500 text-black font-medium text-sm tracking-wide hover:bg-emerald-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    {submitting ? 'Submitting…' : 'Get Access'}
                  </button>
                  <p className="text-[10px] text-white/20 text-center">No spam. Unsubscribe anytime.</p>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 5. FINAL CTA ─── */}
      <section className="py-24 sm:py-32 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-xl mx-auto"
        >
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            Stop Watching.<br />
            <span className="text-emerald-400">Start Creating.</span>
          </h2>
          <p className="text-sm text-white/30 mb-8">Your AI filmmaking journey starts now.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-500 text-black font-medium text-sm hover:bg-emerald-400 transition-all"
            >
              Join Discord <ArrowRight className="h-4 w-4" />
            </a>
            <button
              onClick={scrollToFunnel}
              className="flex items-center gap-2 px-6 py-3 rounded-full border border-white/10 text-white/70 text-sm hover:border-emerald-500/30 hover:text-white transition-all"
            >
              Start Course <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/5 py-8 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-[10px] text-white/20 tracking-wider uppercase">© {new Date().getFullYear()} Warren Guru</p>
          <div className="flex items-center gap-4">
            <a href="https://discord.gg/warrenguru" target="_blank" rel="noopener noreferrer" className="text-white/20 hover:text-emerald-400/60 transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            </a>
            <a href="https://vimeo.com/warrenguru" target="_blank" rel="noopener noreferrer" className="text-white/20 hover:text-white/40 transition-colors text-[10px] tracking-wider uppercase">
              Vimeo
            </a>
          </div>
        </div>
      </footer>

      {/* ─── Floating Discord button ─── */}
      <a
        href="https://discord.gg/warrenguru"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 left-4 sm:left-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md text-emerald-400 text-xs tracking-wider hover:bg-emerald-500/20 transition-all shadow-lg"
      >
        <MessageCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Join Community</span>
      </a>

      {/* ─── Back to top ─── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-4 sm:right-6 z-40 p-3 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  );
}
