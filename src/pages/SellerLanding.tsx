import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useMetaPixel } from '@/hooks/useMetaPixel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Home, Phone, Star, Shield, Clock, CheckCircle, ArrowRight, Loader2,
  MapPin, Users, DollarSign, Handshake, Quote, ArrowDown, Building2
} from 'lucide-react';

import parallaxHero from '@/assets/landing/parallax-hero-ai-realestate.jpg';
import parallaxNeighborhood from '@/assets/landing/parallax-ai-neighborhood.jpg';
import parallaxAppraisal from '@/assets/landing/parallax-ai-appraisal.jpg';
import parallaxCommand from '@/assets/landing/parallax-ai-command.jpg';
import warrenLogo from '@/assets/landing/warren-logo.png';

interface LandingPage {
  id: string;
  slug: string;
  client_name: string;
  tagline: string;
  headline: string;
  sub_headline: string | null;
  photo_url: string | null;
  logo_url: string | null;
  accent_color: string;
  phone: string | null;
  email: string | null;
  reviews: Array<{ name: string; text: string; stars: number; location?: string }>;
  meta: Record<string, unknown>;
}

export default function SellerLanding() {
  useMetaPixel('1655620408789704');
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await supabase
        .from('lw_landing_pages')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      if (data) {
        setPage({
          ...data,
          reviews: (data.reviews as LandingPage['reviews']) || [],
          meta: (data.meta as Record<string, unknown>) || {},
        });
      } else {
        setNotFound(true);
      }
      setLoading(false);
    })();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !address.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    if (!page?.id) {
      toast.error('Landing page not loaded. Please refresh and try again.');
      return;
    }
    setSubmitting(true);
    const insertPayload = {
      landing_page_id: page.id,
      full_name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim(),
      property_address: address.trim(),
    };
    const { error } = await supabase.from('lw_landing_leads').insert(insertPayload);
    setSubmitting(false);
    if (error) {
      console.error('Landing lead insert error:', error.message, error.details, error.code);
      toast.error('Something went wrong. Please try again.');
    } else {
      // Send thank-you autoresponder via Gmail if email provided
      if (email.trim()) {
        supabase.functions.invoke('funnel-autoresponder', {
          body: { funnel: 'seller', recipientEmail: email.trim(), recipientName: name.trim() },
        }).catch((err) => console.error('Autoresponder failed:', err));
      }
      setSubmitted(true);
      setTimeout(async () => {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          await fetch(`${supabaseUrl}/functions/v1/vapi-outbound`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              action: 'trigger_call',
              phone: insertPayload.phone,
              landing_page_id: page.id,
              full_name: insertPayload.full_name,
              property_address: insertPayload.property_address,
            }),
          });
        } catch (err) {
          console.error('Vapi call trigger failed:', err);
        }
      }, 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-3">
          <Building2 className="h-12 w-12 mx-auto text-cyan-400/30" />
          <h1 className="text-2xl font-bold text-white">Page Not Found</h1>
          <p className="text-white/40">This landing page doesn't exist or is no longer active.</p>
        </div>
      </div>
    );
  }

  const accent = page.accent_color || '#06b6d4';

  const DEFAULT_REVIEWS = [
    { name: 'Maria G.', text: 'They made the entire process so simple. Got a fair cash offer and closed in just 12 days. No repairs, no stress!', stars: 5, location: 'Houston, TX' },
    { name: 'James T.', text: 'I was behind on payments and needed to sell fast. They treated me with respect and gave me a great deal.', stars: 5, location: 'Dallas, TX' },
    { name: 'Linda P.', text: 'Professional from start to finish. They explained everything clearly and I felt comfortable the whole time.', stars: 5, location: 'San Antonio, TX' },
    { name: 'Robert W.', text: 'After my divorce I needed a quick sale. They were compassionate, fast, and the price was fair. Highly recommend.', stars: 5, location: 'Austin, TX' },
    { name: 'Sarah K.', text: 'Inherited a property I couldn\'t maintain. They made the sale effortless and I got cash in under two weeks.', stars: 5, location: 'Fort Worth, TX' },
    { name: 'David M.', text: 'No hidden fees, no surprises. The offer they gave me was exactly what they paid. Transparent and honest.', stars: 5, location: 'Phoenix, AZ' },
  ];

  const reviews = page.reviews.length > 0 ? page.reviews : DEFAULT_REVIEWS;

  const scrollToForm = () => {
    document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden text-white">
      {/* Sticky Nav */}
      <nav className="bg-slate-950/90 backdrop-blur-md border-b border-cyan-500/10 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={warrenLogo} alt="Warren Guru" className="h-9 w-auto" />
            <div className="flex flex-col leading-none">
              <span className="text-lg font-semibold text-white">{page.client_name}</span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-cyan-400/60">Real Estate Investment Firm</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {page.phone && (
              <a href={`tel:${page.phone}`} className="hidden sm:flex items-center gap-2 text-sm font-medium text-white/60 hover:text-cyan-400 transition">
                <Phone className="h-4 w-4" />
                {page.phone}
              </a>
            )}
            <Button size="sm" onClick={scrollToForm} className="rounded-full px-5 bg-gradient-to-r from-cyan-500 to-teal-500 text-black font-medium hover:from-cyan-400 hover:to-teal-400">
              Get Offer
            </Button>
          </div>
        </div>
      </nav>

      {/* ═══════════ HERO with parallax ═══════════ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxHero})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/50" />
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(rgba(0,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

        <div className="relative max-w-6xl mx-auto px-4 py-20 grid lg:grid-cols-2 gap-12 items-center w-full">
          {/* Left */}
          <div className="space-y-7 text-center lg:text-left animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-cyan-500/10 backdrop-blur-sm border border-cyan-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-cyan-400">
              <Shield className="h-3.5 w-3.5" />
              Licensed Real Estate Investment Firm
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
              {page.headline}
            </h1>
            {page.sub_headline && (
              <p className="text-lg sm:text-xl text-white/40 max-w-lg mx-auto lg:mx-0 leading-relaxed">{page.sub_headline}</p>
            )}
            <div className="flex flex-wrap gap-5 justify-center lg:justify-start text-sm text-white/50">
              <span className="flex items-center gap-2"><Clock className="h-5 w-5 text-cyan-400" /> Close in 7–14 Days</span>
              <span className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-cyan-400" /> All Cash Offer</span>
              <span className="flex items-center gap-2"><Handshake className="h-5 w-5 text-cyan-400" /> Zero Fees</span>
            </div>

            {page.photo_url && (
              <div className="flex items-center gap-4 justify-center lg:justify-start pt-2">
                <img src={page.photo_url} alt={page.client_name} className="h-14 w-14 rounded-full object-cover border-2 border-cyan-500/30 shadow-lg" />
                <div className="text-left">
                  <p className="text-base font-semibold text-white">{page.client_name}</p>
                  <p className="text-sm text-cyan-400/60">Managing Partner</p>
                </div>
              </div>
            )}

            <button onClick={scrollToForm} className="hidden lg:flex items-center gap-2 text-cyan-400/40 hover:text-cyan-400 transition text-sm mt-4">
              <ArrowDown className="h-4 w-4 animate-bounce" /> Scroll to get your free offer
            </button>
          </div>

          {/* Right — Form card */}
          <div id="lead-form" className="bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-cyan-500/5 border border-cyan-500/10 p-7 sm:p-9 max-w-md mx-auto lg:mx-0 lg:ml-auto w-full animate-scale-in">
            {submitted ? (
              <div className="text-center space-y-4 py-8">
                <div className="h-[72px] w-[72px] rounded-full mx-auto flex items-center justify-center bg-cyan-500/10">
                  <CheckCircle className="h-9 w-9 text-cyan-400" />
                </div>
                <h3 className="text-2xl font-bold text-white">We Got Your Info!</h3>
                <p className="text-white/40 text-sm leading-relaxed">
                  Our acquisitions team will review your property details and give you a call shortly with a no-obligation cash offer.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1.5 mb-7">
                  <h2 className="text-2xl font-bold text-white">Get Your Cash Offer</h2>
                  <p className="text-sm text-white/40">Fill out the form — we'll call you within 24 hours</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-white/60 text-sm font-medium">Full Name</Label>
                    <Input id="name" placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-12 bg-slate-800/50 border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/40 text-base" maxLength={100} required />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-white/60 text-sm font-medium">Phone Number</Label>
                    <Input id="phone" type="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 h-12 bg-slate-800/50 border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/40 text-base" maxLength={20} required />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-white/60 text-sm font-medium">Email Address</Label>
                    <Input id="email" type="email" placeholder="john@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-12 bg-slate-800/50 border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/40 text-base" maxLength={255} />
                  </div>
                  <div>
                    <Label htmlFor="address" className="text-white/60 text-sm font-medium">Property Address</Label>
                    <Input id="address" placeholder="123 Main St, City, TX 75001" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1.5 h-12 bg-slate-800/50 border-cyan-500/10 text-white placeholder:text-white/20 focus:border-cyan-500/40 text-base" maxLength={255} required />
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full h-[52px] text-base font-semibold rounded-xl text-black shadow-lg shadow-cyan-500/20 hover:shadow-xl transition-all bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400">
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><span>Get My Cash Offer</span><ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                  <p className="text-[11px] text-white/20 text-center">
                    100% free and confidential. No obligation whatsoever.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════ Trust stats ═══════════ */}
      <section className="border-b border-cyan-500/10">
        <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { icon: Home, label: '500+', desc: 'Properties Acquired' },
            { icon: DollarSign, label: '$50M+', desc: 'Cash Deployed' },
            { icon: Clock, label: '14 Days', desc: 'Average Close Time' },
            { icon: Star, label: '4.9 ★', desc: 'Average Rating' },
          ].map((s, i) => (
            <div key={i} className="space-y-2">
              <s.icon className="h-7 w-7 mx-auto text-cyan-400" />
              <p className="text-3xl font-extrabold text-white">{s.label}</p>
              <p className="text-xs font-medium text-white/30 uppercase tracking-wide">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ Parallax: AI Neighborhood ═══════════ */}
      <section className="relative py-24 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxNeighborhood})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/85 to-slate-950/60" />
        <div className="relative max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">We Help Families <span className="text-cyan-400">Move Forward</span></h2>
            <p className="text-white/40 leading-relaxed text-lg">
              Whether you're facing foreclosure, divorce, relocation, or simply need to sell fast — our firm provides a simple, dignified way to sell your home for cash.
            </p>
            <div className="space-y-3">
              {['Facing Foreclosure or Behind on Payments', 'Inherited Property You Can\'t Maintain', 'Going Through Divorce', 'Relocating for Work', 'Tired of Being a Landlord'].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 flex-shrink-0 text-cyan-400" />
                  <span className="text-white/60">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden md:block" />
        </div>
      </section>

      {/* ═══════════ How It Works ═══════════ */}
      <section className="py-20 border-t border-cyan-500/10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center space-y-3 mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400/60">Simple Process</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">How It Works</h2>
            <p className="text-white/30 max-w-lg mx-auto">Selling your home doesn't have to be complicated. Three steps, that's it.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: '01', icon: Phone, title: 'Tell Us About Your Property', desc: 'Fill out the form or give us a call. Share your property details — no paperwork, no obligation.' },
              { step: '02', icon: DollarSign, title: 'Receive Your Cash Offer', desc: 'We\'ll review your property and present a fair, all-cash offer within 24 hours. No hidden fees ever.' },
              { step: '03', icon: Handshake, title: 'Close on Your Timeline', desc: 'Pick your closing date. We handle all paperwork, pay closing costs, and you walk away with cash.' },
            ].map((s, i) => (
              <div key={i} className="relative bg-slate-900/50 rounded-2xl border border-cyan-500/10 p-8 hover:border-cyan-500/30 transition-all duration-300 group">
                <div className="text-6xl font-black text-cyan-500/5 group-hover:text-cyan-500/10 transition-colors absolute top-4 right-5">{s.step}</div>
                <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-5 bg-cyan-500/10">
                  <s.icon className="h-6 w-6 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-white/30 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ Parallax: AI Command — CTA ═══════════ */}
      <section className="relative py-28 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxCommand})` }}
        />
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative max-w-3xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            Your Neighbors Trusted Us. <span className="text-cyan-400">You Can Too.</span>
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            We've helped hundreds of homeowners in your area sell quickly and move on with their lives. Let us do the same for you.
          </p>
          <Button size="lg" onClick={scrollToForm} className="rounded-full px-10 h-14 text-base font-semibold shadow-xl shadow-cyan-500/20 bg-gradient-to-r from-cyan-500 to-teal-500 text-black hover:from-cyan-400 hover:to-teal-400">
            Get My Free Cash Offer
          </Button>
        </div>
      </section>

      {/* ═══════════ Reviews ═══════════ */}
      <section className="py-20 border-t border-cyan-500/10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center space-y-3 mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400/60">Testimonials</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">What Homeowners Are Saying</h2>
            <p className="text-white/30">Real experiences from real sellers just like you</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((r, i) => (
              <div key={i} className="bg-slate-900/50 rounded-2xl p-7 border border-cyan-500/10 hover:border-cyan-500/20 transition-all relative">
                <Quote className="h-8 w-8 text-cyan-500/10 absolute top-5 right-5" />
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: r.stars || 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-white/50 leading-relaxed mb-5">"{r.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-black bg-gradient-to-br from-cyan-500 to-teal-500 shadow">
                    {r.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{r.name}</p>
                    {r.location && <p className="text-xs text-white/30">{r.location}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ Parallax: AI Appraisal ═══════════ */}
      <section className="relative py-24 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${parallaxAppraisal})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-l from-slate-950/95 via-slate-950/85 to-slate-950/50" />
        <div className="relative max-w-5xl mx-auto px-4 flex justify-end">
          <div className="max-w-lg space-y-5 text-right">
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              AI-Powered <span className="text-cyan-400">Property Analysis</span>
            </h2>
            <p className="text-white/40 text-lg leading-relaxed">
              Our advanced AI evaluates every property using market comps, condition analysis, and distress indicators — ensuring you get a fair, data-driven offer.
            </p>
            <Button size="lg" onClick={scrollToForm} className="rounded-full px-8 h-[52px] shadow-lg shadow-cyan-500/20 ml-auto bg-gradient-to-r from-cyan-500 to-teal-500 text-black font-semibold hover:from-cyan-400 hover:to-teal-400">
              Start Now <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════ Why Us ═══════════ */}
      <section className="py-20 border-t border-cyan-500/10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center space-y-3 mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400/60">The Difference</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Why Sell to Us?</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: DollarSign, title: 'Fair Cash Offers', desc: 'Competitive offers based on real market data — no lowball tactics.' },
              { icon: Clock, title: 'Fast Closings', desc: 'Close in as little as 7 days. We work on your schedule, always.' },
              { icon: Shield, title: 'No Repairs Needed', desc: 'Sell your home as-is. We buy houses in any condition.' },
              { icon: CheckCircle, title: 'No Fees or Commissions', desc: 'No realtor fees, no closing costs, no hidden charges.' },
              { icon: Users, title: 'Experienced Team', desc: 'Years of experience acquiring properties locally. We know your market.' },
              { icon: MapPin, title: 'Local Investors', desc: 'We live and invest in your community. Not a faceless corporation.' },
            ].map((item, i) => (
              <div key={i} className="bg-slate-900/50 flex gap-4 p-5 rounded-xl border border-cyan-500/10 hover:border-cyan-500/20 transition-all duration-300">
                <div className="h-11 w-11 rounded-lg flex-shrink-0 flex items-center justify-center bg-cyan-500/10">
                  <item.icon className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-0.5">{item.title}</h3>
                  <p className="text-sm text-white/30 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ Bottom CTA ═══════════ */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-teal-600" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url(${parallaxHero})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="relative max-w-3xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Ready to Get Your Cash Offer?</h2>
          <p className="text-white/70 text-lg max-w-lg mx-auto">
            No obligation. No pressure. Just a fair cash offer for your home.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={scrollToForm} className="bg-white text-slate-900 font-semibold px-8 h-14 rounded-full shadow-xl hover:shadow-2xl transition-all text-base hover:bg-white/90">
              Get My Offer Now <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            {page.phone && (
              <a href={`tel:${page.phone}`} className="inline-flex items-center justify-center gap-2 bg-white/20 backdrop-blur-sm text-white font-semibold px-8 h-14 rounded-full border border-white/30 hover:bg-white/30 transition text-base">
                <Phone className="h-4 w-4" />
                Call {page.phone}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-cyan-500/10 text-white/30 py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <img src={warrenLogo} alt="Warren Guru" className="h-6 w-auto opacity-60" />
            <span>© {new Date().getFullYear()} {page.client_name}. All rights reserved.</span>
          </div>
          <p className="text-white/20">AI-Powered Real Estate Investment Firm</p>
        </div>
      </footer>
    </div>
  );
}
