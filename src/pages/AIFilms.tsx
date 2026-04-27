import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Sparkles, Zap, TrendingUp, Eye, Mail, Phone as PhoneIcon, Home as HomeIcon, Lock, ChevronDown } from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { BeforeAfterSlider } from '@/components/ai-films/BeforeAfterSlider';
import SEOHead from '@/components/SEOHead';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

import heroBefore from '@/assets/ai-films/hero-before.webp';
import heroAfter from '@/assets/ai-films/hero-after.png';
import heroVideographer3D from '@/assets/ai-films/hero-videographer-3d.png';

const demos = [
  {
    title: 'AI Drone Realty',
    src: '/videos/demo-shady-rim.mp4',
  },
  {
    title: 'AI Video Furniture Removal',
    src: '/videos/hero-ai-films.mp4',
  },
];


const benefits = [
  { icon: Eye, title: 'Listings stand out instantly', desc: 'Cut through the noise on Zillow, MLS and the feed.' },
  { icon: TrendingUp, title: 'Buyers spend more time viewing', desc: 'Cinematic visuals hold attention 3-5× longer.' },
  { icon: Sparkles, title: 'Higher perceived value', desc: 'Premium presentation drives stronger offers.' },
  { icon: Zap, title: 'Built for paid social', desc: 'Optimized for Zillow, MLS, IG Reels and TikTok ads.' },
];

function HeroShowcaseVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [userLocked, setUserLocked] = useState(false);

  const enableSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    setIsMuted(false);
    v.play().catch(() => {});
    setIsPlaying(true);
    setShowHint(false);
  };

  const muteSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    setIsMuted(true);
  };

  const handleMouseEnter = () => {
    if (userLocked) return;
    enableSound();
  };

  const handleMouseLeave = () => {
    if (userLocked) return;
    muteSound();
  };

  const handleClick = () => {
    setShowHint(false);
    if (userLocked) {
      // Already locked on — unlock and mute
      muteSound();
      setUserLocked(false);
    } else {
      // Lock sound ON regardless of hover state
      enableSound();
      setUserLocked(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="relative group mx-auto w-full flex justify-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        src="/videos/forsale.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onClick={handleClick}
        className="rounded-2xl border border-white/10 shadow-2xl cursor-pointer w-auto h-auto max-w-full max-h-[85vh] object-contain"
        style={{ boxShadow: '0 30px 60px -15px rgba(0,0,0,0.85), 0 15px 35px -10px rgba(34,211,238,0.25)' }}
      />

      {/* Sound / play indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-none">
        <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] tracking-[0.2em] uppercase text-white/90 flex items-center gap-1.5">
          {isMuted ? '🔇 Muted' : '🔊 Sound On'}
        </div>
        {!isPlaying && (
          <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] tracking-[0.2em] uppercase text-white/90">
            ⏸ Paused
          </div>
        )}
      </div>

      {/* Mobile/desktop hint */}
      {showHint && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] tracking-[0.2em] uppercase text-white/90 pointer-events-none"
        >
          <span className="hidden sm:inline">Hover for sound · Click to pause</span>
          <span className="sm:hidden">Tap to play / pause sound</span>
        </motion.div>
      )}

      <p className="text-center text-[10px] tracking-[0.3em] uppercase text-muted-foreground/70 mt-4">
        Real AI listing transformation
      </p>
    </motion.div>
  );
}

function DemoVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  const enableSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    setIsMuted(false);
    v.play().catch(() => {});
  };

  const muteSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    setIsMuted(true);
  };

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onClick={isMuted ? undefined : muteSound}
        className={`w-full h-full object-cover ${isMuted ? '' : 'cursor-pointer'}`}
      />
      {isMuted && (
        <button
          type="button"
          onClick={enableSound}
          aria-label="Play with sound"
          className="absolute inset-0 m-auto w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 transition-all hover:scale-110 hover:opacity-90 z-10"
          style={{ backgroundColor: 'rgba(178, 34, 52, 0.5)' }}
        >
          <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white drop-shadow-lg ml-1" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}
    </>
  );
}

export default function AIFilms() {
  const [form, setForm] = useState({ name: '', phone: '', property: '' });
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { user } = useAuth();

  const faqs = [
    {
      q: 'What does "full edit included" cover?',
      a: 'Every video is fully edited end-to-end — color grading, cinematic transitions, music sync, AI furniture removal, and visual enhancements. You receive a finished, ready-to-post video. No additional editing fees, no extra charges for music or color work.',
    },
    {
      q: 'Why a 1-minute max length?',
      a: 'Videos are delivered in 9:16 Instagram format and capped at 60 seconds — the optimal length for Reels, TikTok, and Stories engagement. Shorter, punchier listings consistently outperform longer walkthroughs on social platforms where buyers actually scroll.',
    },
    {
      q: 'How is the +$50 per additional bedroom calculated?',
      a: 'Each package covers up to 4 bedrooms. For each bedroom beyond that, $50 is added to cover the extra shoot, AI processing, and edit time. Example: a 6-bedroom listing on the Single Listing tier is $299 + (2 × $50) = $399. The same math applies per listing on the Monthly Package.',
    },
  ];
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, 120]);
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0.4]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      toast.error('Name and phone are required.');
      return;
    }
    setSubmitting(true);
    try {
      const subject = `🎬 New AI Films Request — ${form.name}`;
      const body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
          <h2 style="color: #111;">New Project Request — AI Films Real Motion</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${form.name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="tel:${form.phone}">${form.phone}</a></td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Property:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${form.property || '(not provided)'}</td></tr>
            <tr><td style="padding: 8px;"><strong>Submitted:</strong></td><td style="padding: 8px;">${new Date().toLocaleString()}</td></tr>
          </table>
          <p style="color: #666; font-size: 12px; margin-top: 24px;">Sent from the AI Films Real Motion landing page (warren.guru / stu25.com)</p>
        </div>
      `.trim();

      const { data, error } = await supabase.functions.invoke('gmail-api?action=send', {
        body: { to: 'warren@stu25.com', subject, body },
      });

      if (error || (data as any)?.blocked) {
        throw new Error((data as any)?.error || error?.message || 'Send failed');
      }

      toast.success("Got it. Warren will reach out within 24 hours.");
      setForm({ name: '', phone: '', property: '' });
    } catch (err: any) {
      console.error('[AIFilms] Request submission error:', err);
      toast.error(err?.message || 'Could not send your request. Please call (424) 465-1253.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <SEOHead
        title="AI Films Real Motion — AI Marketing for Real Estate Listings"
        description="Turn any listing into a high-converting AI showcase. Furniture removal, virtual staging, and cinematic drone tours — directed by Warren Guru."
        canonical="/"
      />

      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="#top" className="flex flex-col leading-none">
            <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">AI Films</span>
            <span className="text-sm tracking-[0.2em] uppercase font-light">Real Motion</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
            <a href="#demos" className="hover:text-foreground transition-colors">Examples</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#why" className="hover:text-foreground transition-colors">Why</a>
            <a href="#pricing-faq" className="hover:text-foreground transition-colors">FAQ</a>
            <a href="#contact" className="hover:text-foreground transition-colors">Contact</a>
            <Link to={user ? '/dashboard' : '/auth'} className="hover:text-foreground transition-colors">
              {user ? 'Dashboard' : 'Login'}
            </Link>
          </nav>
          <a
            href="#pricing"
            className="px-4 py-2 text-[11px] tracking-[0.2em] uppercase bg-foreground text-background rounded-full hover:bg-foreground/90 transition-colors"
          >
            Get Started
          </a>
        </div>
      </header>

      {/* HERO */}
      <section id="top" ref={heroRef} className="relative min-h-screen flex items-center pt-20 overflow-hidden">
        {/* Full-screen hero image */}
        <motion.div className="absolute inset-0 z-0 pointer-events-none" style={{ y: heroY, opacity: heroOpacity }}>
          <img
            src={heroVideographer3D}
            alt="AI-augmented real estate videographer with cinema rig, drones, and HUD overlays"
            loading="eager"
            className="w-full h-full object-cover object-center"
          />
          {/* Cinematic gradient overlays — keep image visible while ensuring text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/10 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-background/60" />
        </motion.div>

        <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 w-full grid lg:grid-cols-2 gap-12 items-center py-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
            className="text-center lg:text-center flex flex-col items-center"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-background/40 backdrop-blur-sm mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Directed by Warren Guru</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05] mb-6">
              Turn Any Listing Into a{' '}
              <span className="italic text-muted-foreground">High-Converting</span>{' '}
              AI Showcase.
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground font-light max-w-xl mb-8 leading-relaxed mx-auto">
              Remove furniture. Add staging. Simulate drone tours. All powered by AI.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href="#pricing"
                className="group inline-flex items-center gap-2 px-6 py-4 bg-foreground text-background rounded-full text-sm tracking-[0.15em] uppercase hover:bg-foreground/90 transition-all hover:scale-[1.02]"
              >
                Transform My Listing
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="#demos"
                className="inline-flex items-center gap-2 px-6 py-4 border border-border rounded-full text-sm tracking-[0.15em] uppercase hover:bg-accent transition-colors"
              >
                See Real Examples
              </a>
            </div>
          </motion.div>

          {/* Hero showcase video */}
          <HeroShowcaseVideo />
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground/50">
          <span className="text-[9px] tracking-[0.4em] uppercase">Scroll</span>
          <div className="w-px h-10 bg-gradient-to-b from-muted-foreground/50 to-transparent" />
        </div>
      </section>

      {/* DEMOS */}
      <section id="demos" className="py-28 sm:py-36 px-5 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground mb-4">Proof, not portfolio</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight">
              Real listings. Real results.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 lg:gap-10 max-w-5xl mx-auto">
            {demos.map((demo, i) => (
              <motion.div
                key={demo.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: [0.23, 1, 0.32, 1] }}
                className="group"
              >
                <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-border/40 shadow-2xl mx-auto w-full max-h-[80vh] sm:max-h-[75vh]" style={{ maxWidth: 'calc(80vh * 9 / 16)' }}>
                  <DemoVideo src={demo.src} />
                  <span className="absolute top-4 left-4 px-2.5 py-1 text-[10px] tracking-[0.25em] uppercase bg-black/70 backdrop-blur-sm text-white rounded-full pointer-events-none z-10">
                    0{i + 1} / 0{demos.length}
                  </span>
                </div>
                <div className="mt-5 px-1 text-center">
                  <h3 className="text-xl sm:text-2xl font-light tracking-tight">{demo.title}</h3>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-14 flex flex-col items-center gap-3">
            <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">More work on Instagram</p>
            <a
              href="https://instagram.com/w4rr3nguru"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 border border-border rounded-full text-sm tracking-[0.15em] uppercase hover:bg-accent transition-colors"
            >
              @w4rr3nguru on Instagram
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-28 sm:py-36 px-5 sm:px-8 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground mb-4">Pricing</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight">Built for serious realtors.</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Single Listing */}
            <div className="relative p-8 sm:p-10 rounded-2xl border border-border bg-background flex flex-col items-center text-center">
              <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Single Listing</p>
              <h3 className="text-2xl font-light tracking-tight mt-2 mb-6">Listing Video</h3>
              <div className="flex items-baseline justify-center gap-2 mb-1">
                <span className="text-5xl font-light tracking-tight">$299</span>
                <span className="text-sm text-muted-foreground">per video</span>
              </div>
              <p className="text-xs text-muted-foreground mb-8">One-time, per property.</p>
              <ul className="space-y-3 mb-6 flex-1 w-full">
                {[
                  'Full edit included',
                  'Delivered in 9:16 Instagram format',
                  'Up to 1 minute max video length',
                  'Covers up to 4 bedrooms',
                  'AI furniture removal & visual enhancements',
                  '48-72 hour turnaround',
                ].map((f) => (
                  <li key={f} className="flex items-center justify-center gap-3 text-sm">
                    <Check className="h-4 w-4 text-foreground/70 shrink-0" />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground mb-6">+$50 per additional bedroom over 4.</p>
              <a
                href="#contact"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 border border-border rounded-full text-sm tracking-[0.15em] uppercase hover:bg-accent transition-colors"
              >
                Order Single Video
              </a>
            </div>

            {/* Pro Package — featured */}
            <div className="relative p-8 sm:p-10 rounded-2xl border-2 border-foreground bg-foreground text-background flex flex-col items-center text-center shadow-2xl">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500 text-black text-[10px] tracking-[0.25em] uppercase font-medium">
                Most Popular
              </div>
              <p className="text-[10px] tracking-[0.4em] uppercase text-background/60">Pro Realtor</p>
              <h3 className="text-2xl font-light tracking-tight mt-2 mb-6">Monthly Package</h3>
              <div className="flex items-baseline justify-center gap-2 mb-1">
                <span className="text-5xl font-light tracking-tight">$2,500</span>
                <span className="text-sm text-background/60">/month</span>
              </div>
              <p className="text-xs text-background/50 mb-8">Less than $250 per listing when fully utilized.</p>
              <ul className="space-y-3 mb-6 flex-1 w-full">
                {[
                  '10 AI-enhanced listing videos / month',
                  'Full edit included on every video',
                  'Delivered in 9:16 Instagram format',
                  'Up to 1 minute max per video',
                  'Covers up to 4 bedrooms per listing',
                  'Priority turnaround',
                  'Dedicated WhatsApp line',
                ].map((f) => (
                  <li key={f} className="flex items-center justify-center gap-3 text-sm">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-background/90">{f}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-background/60 mb-6">+$50 per additional bedroom over 4.</p>
              <a
                href="#contact"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-background text-foreground rounded-full text-sm tracking-[0.15em] uppercase hover:bg-background/90 transition-colors"
              >
                Start Monthly Package
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <p className="text-center text-[11px] tracking-[0.2em] uppercase text-muted-foreground mt-10 flex items-center justify-center gap-2">
            <Lock className="h-3 w-3" />
            Secure checkout (Authorize.net integration coming soon)
          </p>
        </div>
      </section>

      {/* PRICING FAQ */}
      <section id="pricing-faq" className="py-20 sm:py-24 px-5 sm:px-8 bg-muted/10">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground mb-4">Pricing FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-light tracking-tight">What's included, explained.</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={item.q}
                  className="rounded-2xl border border-border bg-background overflow-hidden transition-colors hover:border-foreground/20"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left"
                  >
                    <h3 className="text-base font-medium pr-2">{item.q}</h3>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
                        isOpen ? 'rotate-180 text-foreground' : ''
                      }`}
                    />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 sm:px-6 pb-5 sm:pb-6 text-sm text-muted-foreground font-light leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* WHY THIS WORKS */}
      <section id="why" className="py-28 sm:py-36 px-5 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground mb-4">Why this works</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight mb-4">
              The listings that win are the ones that look different.
            </h2>
            <p className="text-muted-foreground font-light">
              Built for competitive markets like Las Vegas and Los Angeles.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {benefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-7 rounded-2xl border border-border bg-card hover:border-foreground/20 transition-colors group text-center flex flex-col items-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-5 group-hover:bg-foreground group-hover:text-background transition-colors">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-medium mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground font-light leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="contact" className="py-28 sm:py-36 px-5 sm:px-8 bg-foreground text-background relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }} />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.1] mb-6">
              If your listing looks average…
              <br />
              <span className="italic text-background/60">it gets treated average.</span>
            </h2>
            <div className="flex flex-wrap gap-3 justify-center mt-8">
              <a
                href="#pricing"
                className="inline-flex items-center gap-2 px-7 py-4 bg-background text-foreground rounded-full text-sm tracking-[0.15em] uppercase hover:bg-background/90 transition-colors"
              >
                Upgrade My Listing
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#form"
                className="inline-flex items-center gap-2 px-7 py-4 border border-background/30 rounded-full text-sm tracking-[0.15em] uppercase hover:bg-background/10 transition-colors"
              >
                Get Started Today
              </a>
            </div>
          </div>

          <form
            id="form"
            onSubmit={handleSubmit}
            className="max-w-xl mx-auto p-8 sm:p-10 rounded-2xl bg-background/5 border border-background/10 backdrop-blur-sm"
          >
            <p className="text-[10px] tracking-[0.4em] uppercase text-background/50 mb-6 text-center">Request project</p>
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-background/40">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full pl-11 pr-4 py-3.5 bg-background/5 border border-background/15 rounded-full text-sm placeholder:text-background/40 focus:outline-none focus:border-background/40 transition-colors"
                />
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-background/40">
                  <PhoneIcon className="h-4 w-4" />
                </span>
                <input
                  type="tel"
                  required
                  placeholder="Phone number"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full pl-11 pr-4 py-3.5 bg-background/5 border border-background/15 rounded-full text-sm placeholder:text-background/40 focus:outline-none focus:border-background/40 transition-colors"
                />
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-background/40">
                  <HomeIcon className="h-4 w-4" />
                </span>
                <input
                  type="url"
                  placeholder="Property link (Zillow, MLS, etc.)"
                  value={form.property}
                  onChange={(e) => setForm({ ...form, property: e.target.value })}
                  className="w-full pl-11 pr-4 py-3.5 bg-background/5 border border-background/15 rounded-full text-sm placeholder:text-background/40 focus:outline-none focus:border-background/40 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-background text-foreground rounded-full text-sm tracking-[0.15em] uppercase hover:bg-background/90 transition-colors disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Request Project'}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-background/40 text-center mt-5 tracking-wide">
              Warren responds personally within 24 hours.
            </p>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-5 sm:px-8 border-t border-border/40">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-4 text-center text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
          <div>AI Films Real Motion · Directed by Warren Guru</div>
          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-foreground transition-colors">Client Login</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
