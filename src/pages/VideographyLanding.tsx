import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMetaPixel } from '@/hooks/useMetaPixel';
import {
  ArrowRight, ChevronDown, Video, Camera, Film, Sparkles,
  Heart, Clock, Users, Star, CheckCircle, Loader2, MessageCircle,
  DoorOpen, Wifi, Radio
} from 'lucide-react';
import ScrollToTopButton from '@/components/landing/ScrollToTopButton';
import { motion } from 'framer-motion';

import heroImg from '@/assets/landing/parallax-videography-hero.jpg';
import midImg from '@/assets/landing/parallax-videography-mid.jpg';
import funnelImg from '@/assets/landing/parallax-videography-funnel.jpg';
import VideoPortfolioSection from '@/components/landing/VideoPortfolioSection';

const fade = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] },
  }),
};

const services = [
  { icon: Heart, label: 'Wedding Streaming', desc: 'Live stream your ceremony to guests worldwide' },
  { icon: Radio, label: 'Funeral Streaming', desc: 'Dignified live broadcasts for memorial services' },
  { icon: Sparkles, label: 'Event Streaming', desc: 'Galas, conferences & celebrations streamed live' },
  { icon: Camera, label: 'Multi-Camera', desc: 'Professional multi-angle broadcast coverage' },
  { icon: Video, label: 'Highlight Reels', desc: 'Cinematic recap films delivered next day' },
  { icon: Wifi, label: 'Reliable Streaming', desc: 'Bonded cellular + WiFi for zero-drop streams' },
  { icon: Clock, label: 'Fast Turnaround', desc: 'Same-day clips & full edits within 48hrs' },
  { icon: Star, label: '4K Quality', desc: 'Broadcast-grade 4K cinematic delivery' },
];

const steps = [
  { num: '01', title: 'Tell Us About Your Event', desc: 'Share the details — wedding, memorial, corporate event, or celebration. We plan the streaming setup and camera coverage around your needs.' },
  { num: '02', title: 'We Stream It Live', desc: 'Our crew sets up multi-camera, broadcast-quality streaming so every guest — near or far — can watch in real time with crystal-clear quality.' },
  { num: '03', title: 'Receive Your Film', desc: 'After the event, we deliver a cinematic highlight reel and the full recording — edited, color-graded, and ready to share.' },
];

export default function VideographyLanding() {
  useMetaPixel('945218684863625');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [eventType, setEventType] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      setTimeout(() => {
        document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location.hash]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      await supabase
        .from('customers')
        .delete()
        .eq('phone', phone.trim())
        .eq('source', 'videography-landing');

      const { error: insertErr } = await supabase.from('customers').insert({
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        source: 'videography-landing',
        status: 'lead',
        notes: `Event: ${eventType || 'Not specified'}\n${message}`,
        tags: ['videography', 'streaming', eventType?.toLowerCase() || 'general'],
      });
      if (insertErr) {
        if (insertErr.message?.includes('customers_phone_unique') || insertErr.message?.includes('customers_phone_source_unique') || insertErr.code === '23505') {
          toast.error('This phone number has already been submitted. We\'ll be in touch!');
        } else {
          toast.error('Submission failed — please try again.');
          console.error('Insert error:', insertErr);
        }
        setSubmitting(false);
        return;
      }
      supabase.functions.invoke('funnel-autoresponder', {
        body: { funnel: 'videography', recipientEmail: email.trim(), recipientName: name.trim() },
      }).catch((err) => console.error('Autoresponder failed:', err));

      supabase.functions.invoke('vapi-videography-outbound', {
        body: {
          action: 'trigger_call',
          phone: phone.trim(),
          full_name: name.trim(),
          event_type: eventType || 'general inquiry',
          message: message || '',
          assistant_id: '0045f12e-56e2-4245-971b-1f7dd2069282',
        },
      }).catch((err) => console.warn('Vapi trigger warning:', err));

      setSubmitted(true);
      navigate('/thankyou-videography');
      toast.success('Request submitted! We\'ll be in touch shortly.');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(0,0%,3%)] text-white selection:bg-emerald-500/30">
      {/* ─── Sticky header (matches AI Director) ─── */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-black/60 border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-3 sm:px-6 py-3 md:py-4">
          <Link to="/" className="flex flex-col leading-none">
            <span className="text-[9px] sm:text-[10px] md:text-xs tracking-[0.25em] uppercase text-emerald-400/70">Warren</span>
            <span className="text-base sm:text-lg md:text-xl font-light tracking-[0.15em] uppercase text-white/80 -mt-0.5">GURU</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5">
            <Link to="/" className="text-[10px] sm:text-xs tracking-[0.15em] uppercase text-white/40 hover:text-emerald-400 transition-colors">
              AI
            </Link>
            <Link to="/solana" className="text-[10px] sm:text-xs tracking-[0.15em] uppercase text-white/40 hover:text-emerald-400 transition-colors">
              Crypto
            </Link>
            <span className="text-[10px] sm:text-xs tracking-[0.15em] uppercase text-emerald-400">
              Video
            </span>
            <Link to="/web" className="text-[10px] sm:text-xs tracking-[0.15em] uppercase text-white/40 hover:text-emerald-400 transition-colors">
              Web
            </Link>
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] sm:text-xs tracking-wider uppercase hover:bg-emerald-500/20 transition-all"
            >
              <MessageCircle className="h-3 w-3" />
              <span className="hidden sm:inline">Discord</span>
            </a>
            <button
              onClick={() => navigate('/auth')}
              className="text-white/40 hover:text-white transition-colors"
            >
              <DoorOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </nav>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center md:bg-fixed" style={{ backgroundImage: `url(${heroImg})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }} className="relative text-center max-w-3xl px-6 pt-14">
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] mb-8">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs tracking-[0.3em] uppercase text-emerald-400/70">Las Vegas Streaming / Recording</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Las Vegas
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Streaming / Recording.</span>
          </h1>

          <p className="mt-8 text-base sm:text-lg text-white/40 max-w-xl mx-auto leading-relaxed font-light">
            Professional live streaming for weddings, funerals, and events across Las Vegas & Henderson — so every guest can be there, no matter where they are.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#get-started" className="group flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-500/20">
              Book Streaming / Recording
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a href="tel:+17023574528" className="group flex items-center gap-3 px-10 py-4 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400 text-sm tracking-[0.2em] uppercase font-medium hover:bg-emerald-500/[0.1] hover:border-emerald-500/30 transition-all">
              📞 (702) 357-4528
            </a>
          </div>

          <div className="mt-16 flex items-center justify-center gap-10 text-white/20">
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-400/70">500+</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Events Streamed</div>
            </div>
            <div className="w-px h-12 bg-emerald-500/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-400/70">4K</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Broadcast Quality</div>
            </div>
            <div className="w-px h-12 bg-emerald-500/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-400/70">99.9%</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Stream Uptime</div>
            </div>
          </div>
        </motion.div>

        <motion.div className="absolute bottom-8 left-1/2 -translate-x-1/2" animate={{ y: [0, 8, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
          <ChevronDown className="h-5 w-5 text-emerald-400/30" />
        </motion.div>
      </section>

      {/* ─── Parallax mid ─── */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center md:bg-fixed" style={{ backgroundImage: `url(${midImg})` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/80 to-black/60" />
        <div className="relative max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.05]">
              <Radio className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs tracking-[0.2em] uppercase text-emerald-400/70">Las Vegas Streaming Pros</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Vegas Events Deserve <span className="text-emerald-400">To Be Shared.</span>
            </h2>
            <p className="text-white/40 text-lg leading-relaxed">
              Whether it's a wedding, a celebration of life, or a corporate gala — our broadcast-quality streaming ensures no one misses a moment. Multi-camera, bonded internet, zero buffering.
            </p>
            <div className="space-y-3">
              {['Wedding Ceremony & Reception Streaming', 'Funeral & Memorial Live Broadcasts', 'Corporate Events & Galas', 'Multi-Camera HD/4K Coverage', 'Private Viewing Links for Families'].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-white/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden md:block" />
        </div>
      </section>

      {/* ─── Portfolio / Behind the Scenes ─── */}
      <VideoPortfolioSection />

      {/* ─── How It Works ─── */}
      <section className="py-24 px-6 border-t border-emerald-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="text-xs tracking-[0.4em] uppercase text-emerald-400/50 mb-5 text-center">
            The Process
          </motion.p>
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14">
            How It <span className="text-emerald-400">Works</span>
          </motion.h2>
          <div className="space-y-0">
            {steps.map((step, i) => (
              <motion.div key={step.num} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={fade} custom={i} className="group relative flex gap-6 py-10 border-b border-emerald-500/[0.06] last:border-0">
                <div className="flex-shrink-0 w-14 flex flex-col items-center">
                  <span className="text-xs tracking-wider text-emerald-400/30 font-mono">{step.num}</span>
                  <div className="mt-3 w-12 h-12 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/[0.1] flex items-center justify-center group-hover:border-emerald-500/30 group-hover:bg-emerald-500/[0.08] transition-all duration-500">
                    <CheckCircle className="h-5 w-5 text-emerald-400/50 group-hover:text-emerald-400 transition-colors duration-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold tracking-wide text-white/80 group-hover:text-white transition-colors duration-300">{step.title}</h3>
                  <p className="mt-2 text-sm sm:text-base text-white/30 leading-relaxed group-hover:text-white/40 transition-colors duration-300">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Services Grid ─── */}
      <section className="py-24 px-6 border-t border-emerald-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="text-xs tracking-[0.4em] uppercase text-emerald-400/50 mb-5 text-center">
            What We Offer
          </motion.p>
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14">
            Full Service. <span className="text-emerald-400">Live & On-Demand.</span>
          </motion.h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {services.map((f, i) => (
              <motion.div key={f.label} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={i} className="group p-6 rounded-xl border border-emerald-500/[0.06] bg-emerald-500/[0.02] hover:bg-emerald-500/[0.05] hover:border-emerald-500/20 transition-all duration-500 text-center">
                <f.icon className="h-6 w-6 mx-auto text-emerald-400/30 group-hover:text-emerald-400 transition-colors duration-500 mb-3" />
                <div className="text-sm tracking-wider uppercase font-medium text-white/60 group-hover:text-white/80 transition-colors">{f.label}</div>
                <div className="text-xs text-white/25 mt-2 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Lead Form ─── */}
      <section id="get-started" className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center md:bg-fixed" style={{ backgroundImage: `url(${funnelImg})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
        <div className="relative max-w-lg mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="text-center mb-10">
            <p className="text-xs tracking-[0.4em] uppercase text-emerald-400/50 mb-4">Get Started</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Book Live <span className="text-emerald-400">Streaming</span>
            </h2>
            <p className="mt-4 text-sm text-white/30">Tell us about your event and we'll handle the rest.</p>
          </motion.div>

          {submitted ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4 p-10 rounded-2xl border border-emerald-500/20 bg-black/60 backdrop-blur-sm">
              <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto" />
              <h3 className="text-xl font-bold">Thank You!</h3>
              <p className="text-white/40 text-sm">We've received your request and will reach out within 24 hours.</p>
            </motion.div>
          ) : (
            <motion.form onSubmit={handleSubmit} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="space-y-4 p-8 rounded-2xl border border-emerald-500/10 bg-black/60 backdrop-blur-sm">
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-emerald-500/10 text-white placeholder:text-white/20 focus:border-emerald-500/30 focus:outline-none transition-colors text-sm" placeholder="Your name" />
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-emerald-500/10 text-white placeholder:text-white/20 focus:border-emerald-500/30 focus:outline-none transition-colors text-sm" placeholder="you@email.com" />
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Phone *</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-emerald-500/10 text-white placeholder:text-white/20 focus:border-emerald-500/30 focus:outline-none transition-colors text-sm" placeholder="(555) 000-0000" />
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Event Type</label>
                <select value={eventType} onChange={e => setEventType(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-emerald-500/10 text-white focus:border-emerald-500/30 focus:outline-none transition-colors text-sm">
                  <option value="" className="bg-black">Select event type</option>
                  <option value="Wedding" className="bg-black">Wedding</option>
                  <option value="Funeral" className="bg-black">Funeral / Memorial</option>
                  <option value="Corporate Event" className="bg-black">Corporate Event / Gala</option>
                  <option value="Celebration of Life" className="bg-black">Celebration of Life</option>
                  <option value="Conference" className="bg-black">Conference / Summit</option>
                  <option value="Other" className="bg-black">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Event Details</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-emerald-500/10 text-white placeholder:text-white/20 focus:border-emerald-500/30 focus:outline-none transition-colors text-sm resize-none" placeholder="Date, location, estimated guest count..." />
              </div>
              <button type="submit" disabled={submitting} className="w-full group flex items-center justify-center gap-3 px-10 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Book Streaming <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" /></>}
              </button>
            </motion.form>
          )}
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-emerald-500/[0.08] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex flex-col leading-none">
            <span className="text-emerald-400/30 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/40 font-medium text-sm tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-xs tracking-wider uppercase text-white/20 hover:text-emerald-400/50 transition-colors">Terms</Link>
            <Link to="/web" className="text-xs tracking-wider uppercase text-white/20 hover:text-emerald-400/50 transition-colors">Web Design</Link>
            <Link to="/" className="text-xs tracking-wider uppercase text-white/20 hover:text-emerald-400/50 transition-colors">Home</Link>
          </div>
          <p className="text-xs text-white/15">© {new Date().getFullYear()} Warren Guru. All rights reserved.</p>
        </div>
      </footer>
      <ScrollToTopButton />
    </div>
  );
}
