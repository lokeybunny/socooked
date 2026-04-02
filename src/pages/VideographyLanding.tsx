import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ArrowRight, ChevronDown, Building2, Video, Camera, Film, Sparkles,
  Heart, Clock, Users, Star, CheckCircle, Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';

import heroImg from '@/assets/landing/parallax-videography-hero.jpg';
import midImg from '@/assets/landing/parallax-videography-mid.jpg';
import funnelImg from '@/assets/landing/parallax-videography-funnel.jpg';

const fade = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] },
  }),
};

const services = [
  { icon: Heart, label: 'Weddings', desc: 'Cinematic ceremony & reception films' },
  { icon: Film, label: 'Funerals', desc: 'Dignified memorial tribute videos' },
  { icon: Sparkles, label: 'AI Editing', desc: 'AI-enhanced color grading & cuts' },
  { icon: Camera, label: 'Drone Shots', desc: 'Aerial cinematography included' },
  { icon: Video, label: 'Highlight Reels', desc: '60-second social-ready edits' },
  { icon: Clock, label: 'Fast Turnaround', desc: 'AI-accelerated post-production' },
  { icon: Users, label: 'Vetted Crew', desc: 'Pre-screened professional videographers' },
  { icon: Star, label: 'Premium Quality', desc: '4K cinematic-grade delivery' },
];

const steps = [
  { num: '01', title: 'Tell Us About Your Event', desc: 'Fill out the form below with your event type, date, and location. We match you with the perfect videographer.' },
  { num: '02', title: 'AI-Matched Videographer', desc: 'Our AI analyzes your needs and matches you with a vetted professional who specializes in your event type.' },
  { num: '03', title: 'Cinematic Delivery', desc: 'Your videographer captures every moment. AI-enhanced editing delivers a polished final product in days, not weeks.' },
];

export default function VideographyLanding() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [eventType, setEventType] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
      await supabase.from('customers').insert({
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        source: 'videography-landing',
        status: 'new',
        notes: `Event: ${eventType || 'Not specified'}\n${message}`,
        tags: ['videography', eventType?.toLowerCase() || 'general'],
      });
      setSubmitted(true);
      toast.success('Request submitted! We\'ll be in touch shortly.');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-black text-white min-h-screen selection:bg-cyan-500/20">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-cyan-400" />
            <div className="flex flex-col leading-none">
              <span className="text-cyan-400/60 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
              <span className="text-white/80 font-medium text-base tracking-[0.15em] uppercase -mt-0.5">GURU</span>
            </div>
          </Link>
          <div className="hidden sm:flex items-center gap-6">
            <a href="#get-started" className="text-white hover:text-cyan-400 text-xs tracking-[0.15em] uppercase transition-colors">
              Videography
            </a>
            <Link to="/webdesign#get-started" className="text-white/40 hover:text-white text-xs tracking-[0.15em] uppercase transition-colors">
              Web Design
            </Link>
          </div>
          <a href="#get-started" className="px-6 py-2 text-xs tracking-[0.25em] uppercase bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded font-medium hover:from-cyan-400 hover:to-teal-400 transition-all">
            Get Started
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${heroImg})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(0,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }} className="relative text-center max-w-3xl px-6 pt-14">
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-cyan-500/20 bg-cyan-500/[0.05] mb-8">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs tracking-[0.3em] uppercase text-cyan-400/70">AI-Powered Videography</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Cinematic Films.
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">AI Precision.</span>
          </h1>

          <p className="mt-8 text-base sm:text-lg text-white/40 max-w-xl mx-auto leading-relaxed font-light">
            We connect you with elite videographers specializing in weddings & funerals — enhanced by AI editing for breathtaking results delivered fast.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#get-started" className="group flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20">
              Book a Videographer
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>

          <div className="mt-16 flex items-center justify-center gap-10 text-white/20">
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">500+</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Events Filmed</div>
            </div>
            <div className="w-px h-12 bg-cyan-500/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">4K</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Cinematic Quality</div>
            </div>
            <div className="w-px h-12 bg-cyan-500/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">48hr</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">AI Turnaround</div>
            </div>
          </div>
        </motion.div>

        <motion.div className="absolute bottom-8 left-1/2 -translate-x-1/2" animate={{ y: [0, 8, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
          <ChevronDown className="h-5 w-5 text-cyan-400/30" />
        </motion.div>
      </section>

      {/* Parallax mid */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${midImg})` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/80 to-black/60" />
        <div className="relative max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.05]">
              <Camera className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs tracking-[0.2em] uppercase text-cyan-400/70">Weddings & Memorials</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Every Moment Deserves <span className="text-cyan-400">Cinematic Treatment.</span>
            </h2>
            <p className="text-white/40 text-lg leading-relaxed">
              From the first dance to the final farewell — our vetted videographers capture life's most important moments with artistry, while AI post-production delivers polished films in record time.
            </p>
            <div className="space-y-3">
              {['Wedding Ceremonies & Receptions', 'Memorial & Celebration of Life Videos', 'AI-Enhanced Color Grading', 'Drone Aerial Cinematography', 'Same-Day Highlight Edits'].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-white/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden md:block" />
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 border-t border-cyan-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5 text-center">
            The Process
          </motion.p>
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14">
            How It <span className="text-cyan-400">Works</span>
          </motion.h2>
          <div className="space-y-0">
            {steps.map((step, i) => (
              <motion.div key={step.num} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={fade} custom={i} className="group relative flex gap-6 py-10 border-b border-cyan-500/[0.06] last:border-0">
                <div className="flex-shrink-0 w-14 flex flex-col items-center">
                  <span className="text-xs tracking-wider text-cyan-400/30 font-mono">{step.num}</span>
                  <div className="mt-3 w-12 h-12 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/[0.1] flex items-center justify-center group-hover:border-cyan-500/30 group-hover:bg-cyan-500/[0.08] transition-all duration-500">
                    <CheckCircle className="h-5 w-5 text-cyan-400/50 group-hover:text-cyan-400 transition-colors duration-500" />
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

      {/* Services Grid */}
      <section className="py-24 px-6 border-t border-cyan-500/[0.08]">
        <div className="max-w-4xl mx-auto">
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5 text-center">
            What We Offer
          </motion.p>
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14">
            Full Service. <span className="text-cyan-400">AI Enhanced.</span>
          </motion.h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {services.map((f, i) => (
              <motion.div key={f.label} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={i} className="group p-6 rounded-xl border border-cyan-500/[0.06] bg-cyan-500/[0.02] hover:bg-cyan-500/[0.05] hover:border-cyan-500/20 transition-all duration-500 text-center">
                <f.icon className="h-6 w-6 mx-auto text-cyan-400/30 group-hover:text-cyan-400 transition-colors duration-500 mb-3" />
                <div className="text-sm tracking-wider uppercase font-medium text-white/60 group-hover:text-white/80 transition-colors">{f.label}</div>
                <div className="text-xs text-white/25 mt-2 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Lead Form */}
      <section id="get-started" className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${parallaxAppraisal})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
        <div className="relative max-w-lg mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="text-center mb-10">
            <p className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-4">Get Started</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Request Your <span className="text-cyan-400">Videographer</span>
            </h2>
            <p className="mt-4 text-sm text-white/30">Fill out the form and we'll match you with the perfect professional.</p>
          </motion.div>

          {submitted ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4 p-10 rounded-2xl border border-cyan-500/20 bg-black/60 backdrop-blur-sm">
              <CheckCircle className="h-12 w-12 text-cyan-400 mx-auto" />
              <h3 className="text-xl font-bold">Thank You!</h3>
              <p className="text-white/40 text-sm">We've received your request and will reach out within 24 hours to discuss your event.</p>
            </motion.div>
          ) : (
            <motion.form onSubmit={handleSubmit} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="space-y-4 p-8 rounded-2xl border border-cyan-500/10 bg-black/60 backdrop-blur-sm">
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/30 focus:outline-none transition-colors text-sm" placeholder="Your name" />
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/30 focus:outline-none transition-colors text-sm" placeholder="you@email.com" />
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Phone *</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/30 focus:outline-none transition-colors text-sm" placeholder="(555) 000-0000" />
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Event Type</label>
                <select value={eventType} onChange={e => setEventType(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-cyan-500/10 text-white focus:border-cyan-500/30 focus:outline-none transition-colors text-sm">
                  <option value="" className="bg-black">Select event type</option>
                  <option value="Wedding" className="bg-black">Wedding</option>
                  <option value="Funeral" className="bg-black">Funeral / Memorial</option>
                  <option value="Other" className="bg-black">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Additional Details</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/30 focus:outline-none transition-colors text-sm resize-none" placeholder="Date, location, any special requests..." />
              </div>
              <button type="submit" disabled={submitting} className="w-full group flex items-center justify-center gap-3 px-10 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Submit Request <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" /></>}
              </button>
            </motion.form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-cyan-500/[0.08] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-cyan-400/40" />
            <div className="flex flex-col leading-none">
              <span className="text-cyan-400/30 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
              <span className="text-white/40 font-medium text-sm tracking-[0.15em] uppercase -mt-0.5">GURU</span>
            </div>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">Terms</Link>
            <Link to="/webdesign" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">Web Design</Link>
            <Link to="/" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">Home</Link>
          </div>
          <p className="text-xs text-white/15">© {new Date().getFullYear()} Warren Guru. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
