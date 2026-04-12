import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMetaPixel } from '@/hooks/useMetaPixel';
import {
  ArrowRight, ChevronDown, Building2, Globe, Zap, Code, Palette,
  Smartphone, Search, Clock, Rocket, CheckCircle, Loader2, MessageCircle, DoorOpen, X
} from 'lucide-react';
import ScrollToTopButton from '@/components/landing/ScrollToTopButton';
import FloatingBookNow from '@/components/landing/FloatingBookNow';
import { motion } from 'framer-motion';

import heroImg from '@/assets/landing/web-hero.jpg';
import midImg from '@/assets/landing/parallax-webdesign-mid.jpg';
import funnelImg from '@/assets/landing/parallax-webdesign-funnel.jpg';
import nysonThumb from '@/assets/portfolio/nysonblack-thumb.jpg';
import xitThumb from '@/assets/portfolio/xitcash-thumb.jpg';
import batteryThumb from '@/assets/portfolio/battery-rescue-thumb.jpg';

const fade = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] },
  }),
};

const services = [
  { icon: Zap, label: 'AI Generated', desc: 'Websites built by AI in hours' },
  { icon: Smartphone, label: 'Mobile First', desc: 'Responsive on every device' },
  { icon: Search, label: 'SEO Ready', desc: 'Optimized to rank from day one' },
  { icon: Palette, label: 'Custom Design', desc: 'Branded to your business' },
  { icon: Globe, label: 'Domain Setup', desc: 'Your custom domain included' },
  { icon: Clock, label: '48hr Delivery', desc: 'Live website in under 2 days' },
  { icon: Code, label: 'Modern Stack', desc: 'Built with cutting-edge tech' },
  { icon: Rocket, label: 'Fast Loading', desc: 'Optimized for speed & performance' },
];

const steps = [
  { num: '01', title: 'Tell Us About Your Business', desc: 'Fill out the form with your business name, industry, and what you need. Our AI starts generating your site immediately.' },
  { num: '02', title: 'AI Builds Your Website', desc: 'Our AI engine generates a fully custom, mobile-responsive website tailored to your brand — complete with copy, images, and SEO.' },
  { num: '03', title: 'Review, Refine & Launch', desc: 'You review the site, request any tweaks, and we push it live on your custom domain. The entire process takes under 48 hours.' },
];

export default function WebDesignLanding() {
  useMetaPixel('3210977432422611');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
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
      // Remove any drafted duplicate so testers can re-submit
      const { data: existing } = await supabase
        .from('customers')
        .select('id, meta')
        .eq('phone', phone.trim())
        .eq('source', 'webdesign-landing')
        .maybeSingle();
      if (existing) {
        const meta = (existing.meta as Record<string, unknown>) || {};
        if (meta.funnel_drafted_at) {
          await supabase.from('customers').delete().eq('id', existing.id);
        }
      }
      const { error: insertErr } = await supabase.from('customers').insert({
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        company: businessName.trim() || null,
        source: 'webdesign-landing',
        status: 'lead',
        notes: `Business: ${businessName || 'Not specified'}\n${message}`,
        tags: ['webdesign', 'ai-website'],
      });
      if (insertErr) {
        if (insertErr.message?.includes('customers_phone_unique') || insertErr.message?.includes('customers_phone_source_unique') || insertErr.code === '23505') {
          toast.error('This phone number has already been submitted for web design. We\'ll be in touch!');
        } else {
          toast.error('Submission failed — please try again.');
          console.error('Insert error:', insertErr);
        }
        setSubmitting(false);
        return;
      }
      // Send thank-you autoresponder via Gmail
      supabase.functions.invoke('funnel-autoresponder', {
        body: { funnel: 'webdesign', recipientEmail: email.trim(), recipientName: name.trim() },
      }).catch((err) => console.error('Autoresponder failed:', err));
      setSubmitted(true);
      navigate('/thankyou-webdesign');
      toast.success('Request submitted! We\'ll be in touch shortly.');
      // Trigger Vapi AI call after 3 seconds
      setTimeout(async () => {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          await fetch(`${supabaseUrl}/functions/v1/vapi-webdesign-outbound`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              action: 'trigger_call',
              phone: phone.trim(),
              full_name: name.trim(),
              business_name: businessName.trim() || '',
              message: message.trim(),
            }),
          });
        } catch (err) {
          console.error('Vapi web design call trigger failed:', err);
        }
      }, 3000);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-black text-white min-h-screen selection:bg-cyan-500/20">
      {/* Header (matches all pages) */}
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
            <Link to="/video" className="text-[10px] sm:text-xs tracking-[0.15em] uppercase text-white/40 hover:text-emerald-400 transition-colors">
              Video
            </Link>
            <span className="text-[10px] sm:text-xs tracking-[0.15em] uppercase text-emerald-400">
              Web
            </span>
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
            <span className="text-xs tracking-[0.3em] uppercase text-cyan-400/70">Las Vegas AI Web Design</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Warren Guru
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">Las Vegas Web Design.</span>
          </h1>

          <p className="mt-8 text-base sm:text-lg text-white/40 max-w-xl mx-auto leading-relaxed font-light">
            We build fast, beautiful, AI-generated websites for Las Vegas businesses — custom designed, SEO-optimized, and live in under 48 hours.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#get-started" className="group flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20">
              Get Your Website
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a href="tel:+17474949386" className="group flex items-center gap-3 px-10 py-4 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] text-cyan-400 text-sm tracking-[0.2em] uppercase font-medium hover:bg-cyan-500/[0.1] hover:border-cyan-500/30 transition-all">
              📞 (747) 494-9386
            </a>
          </div>

          <div className="mt-16 flex items-center justify-center gap-10 text-white/20">
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">200+</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Sites Launched</div>
            </div>
            <div className="w-px h-12 bg-cyan-500/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">48hr</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">Avg Delivery</div>
            </div>
            <div className="w-px h-12 bg-cyan-500/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400/70">100%</div>
              <div className="text-xs tracking-[0.2em] uppercase mt-1">AI Generated</div>
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
              <Code className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs tracking-[0.2em] uppercase text-cyan-400/70">Vegas Web Design</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Vegas Businesses <span className="text-cyan-400">Deserve Better Websites.</span>
            </h2>
            <p className="text-white/40 text-lg leading-relaxed">
              Traditional web design takes weeks and costs thousands. Our AI builds your Las Vegas business website — with custom branding, responsive layout, and SEO — in under 48 hours.
            </p>
            <div className="space-y-3">
              {['Custom Branding & Color Palette', 'Mobile-Responsive Design', 'SEO-Optimized Copy & Meta Tags', 'Contact Forms & Lead Capture', 'Google Analytics Integration'].map((item, i) => (
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

      {/* Portfolio Demo */}
      <section className="py-24 px-6 border-t border-cyan-500/[0.08]">
        <div className="max-w-5xl mx-auto">
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-5 text-center">
            Our Work
          </motion.p>
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-4">
            Websites We've <span className="text-cyan-400">Built.</span>
          </motion.h2>
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={2} className="text-white/35 text-center max-w-xl mx-auto mb-14 text-sm sm:text-base leading-relaxed">
            Real sites, real businesses — all designed and launched by our AI engine.
          </motion.p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { name: 'BCC.cash', url: 'https://bcc.cash', img: 'https://api.microlink.io/?url=https://bcc.cash&screenshot=true&meta=false&embed=screenshot.url' },
              { name: 'Red Pill Ville', url: 'https://redpillville.com', img: 'https://api.microlink.io/?url=https://redpillville.com&screenshot=true&meta=false&embed=screenshot.url' },
              { name: 'Nyson Black', url: 'https://nysonblack.com', img: nysonThumb },
              { name: 'XIT Cash', url: 'https://xit.cash', img: xitThumb },
              { name: 'Battery Rescue', url: 'https://quickstart-battery-rescue.lovable.app', img: batteryThumb },
              { name: 'BigTrout', url: 'https://bigtrout.fun', img: 'https://api.microlink.io/?url=https://bigtrout.fun&screenshot=true&meta=false&embed=screenshot.url' },
            ].map((site, i) => (
              <motion.div
                key={site.name}
                onClick={() => setIframeUrl(site.url)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-30px' }}
                variants={fade}
                custom={i + 3}
                className="group relative rounded-xl overflow-hidden aspect-video bg-black/40 border border-cyan-500/[0.06] hover:border-cyan-500/30 transition-all duration-500 cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <img
                  src={site.img}
                  alt={`${site.name} website screenshot`}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400 flex items-end p-4">
                  <div>
                    <span className="text-xs sm:text-sm font-medium tracking-wider text-white/90">{site.name}</span>
                    <div className="flex items-center gap-1 mt-1">
                      <DoorOpen className="h-3 w-3 text-cyan-400/60" />
                      <span className="text-[9px] tracking-[0.2em] uppercase text-cyan-400/60">Preview Site</span>
                    </div>
                  </div>
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
            What's Included
          </motion.p>
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-14">
            Everything You Need. <span className="text-cyan-400">Nothing You Don't.</span>
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
        <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${funnelImg})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
        <div className="relative max-w-lg mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="text-center mb-10">
            <p className="text-xs tracking-[0.4em] uppercase text-cyan-400/50 mb-4">Get Started</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Let's Begin <span className="text-cyan-400">Creating Your Website</span>
            </h2>
            <p className="mt-4 text-sm text-white/30">Tell us about your Las Vegas business and we'll have your site ready in 48 hours.</p>
          </motion.div>

          {submitted ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4 p-10 rounded-2xl border border-cyan-500/20 bg-black/60 backdrop-blur-sm">
              <CheckCircle className="h-12 w-12 text-cyan-400 mx-auto" />
              <h3 className="text-xl font-bold">Thank You!</h3>
              <p className="text-white/40 text-sm">We've received your request and will start building your website. Expect to hear from us within 24 hours.</p>
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
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Business Name</label>
                <input value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/30 focus:outline-none transition-colors text-sm" placeholder="Your business name" />
              </div>
              <div>
                <label className="block text-xs tracking-wider uppercase text-white/40 mb-2">Tell Us About Your Business</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-lg bg-white/5 border border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/30 focus:outline-none transition-colors text-sm resize-none" placeholder="Industry, what you offer, any design preferences..." />
              </div>
              <button type="submit" disabled={submitting} className="w-full group flex items-center justify-center gap-3 px-10 py-4 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-lg text-sm tracking-[0.2em] uppercase font-medium hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Get My Website <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" /></>}
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
            
            <Link to="/" className="text-xs tracking-wider uppercase text-white/20 hover:text-cyan-400/50 transition-colors">Home</Link>
          </div>
          <p className="text-xs text-white/15">© {new Date().getFullYear()} Warren Guru. All rights reserved.</p>
        </div>
      </footer>
      <FloatingBookNow variant="cyan" />
      <ScrollToTopButton />

      {/* Iframe Preview Modal */}
      {iframeUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setIframeUrl(null)}>
          <div className="relative w-[90vw] h-[85vh] max-w-6xl rounded-3xl overflow-hidden border border-cyan-500/20 shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setIframeUrl(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/70 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
            <iframe
              src={iframeUrl}
              className="w-full h-full bg-white rounded-3xl"
              title="Site Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
