import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Home, Phone, Star, Shield, Clock, CheckCircle, ArrowRight, Loader2,
  MapPin, Users, DollarSign, Handshake, Quote, ArrowDown, Heart, Play
} from 'lucide-react';

import aiTechThumb from '@/assets/landing/ai-tech-thumbnail.jpg';

import heroHomeImg from '@/assets/landing/hero-home.jpg';
import happyFamilyImg from '@/assets/landing/happy-family.jpg';
import neighborhoodImg from '@/assets/landing/neighborhood-aerial.jpg';
import happySellersImg from '@/assets/landing/happy-sellers.jpg';

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
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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
    setSubmitting(true);
    const { data: insertedLead, error } = await supabase.from('lw_landing_leads').insert({
      landing_page_id: page?.id,
      full_name: name.trim(),
      phone: phone.trim(),
      property_address: address.trim(),
    }).select('id').single();
    setSubmitting(false);
    if (error) {
      toast.error('Something went wrong. Please try again.');
    } else {
      setSubmitted(true);
      // Trigger Vapi AI call after 3 seconds
      if (insertedLead?.id) {
        setTimeout(async () => {
          try {
            await supabase.functions.invoke('vapi-outbound', {
              body: { action: 'trigger_call', lead_id: insertedLead.id },
            });
          } catch (err) {
            console.error('Vapi call trigger failed:', err);
          }
        }, 3000);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <Home className="h-12 w-12 mx-auto text-slate-300" />
          <h1 className="text-2xl font-bold text-slate-800">Page Not Found</h1>
          <p className="text-slate-500">This landing page doesn't exist or is no longer active.</p>
        </div>
      </div>
    );
  }

  const accent = page.accent_color || '#2563eb';

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
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Sticky Nav */}
      <nav className="bg-white/95 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white" style={{ background: accent }}>
              <Home className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold text-slate-800">{page.client_name}</span>
          </div>
          <div className="flex items-center gap-3">
            {page.phone && (
              <a href={`tel:${page.phone}`} className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition">
                <Phone className="h-4 w-4" />
                {page.phone}
              </a>
            )}
            <Button size="sm" onClick={scrollToForm} className="text-white rounded-full px-5" style={{ background: accent }}>
              Get Offer
            </Button>
          </div>
        </div>
      </nav>

      {/* ═══════════ HERO with parallax background ═══════════ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Parallax BG */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${heroHomeImg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/75 to-slate-900/50" />

        <div className="relative max-w-6xl mx-auto px-4 py-20 grid lg:grid-cols-2 gap-12 items-center w-full">
          {/* Left */}
          <div className="space-y-7 text-center lg:text-left animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-xs font-medium text-white/90">
              <Shield className="h-3.5 w-3.5" />
              Trusted Local Home Buyer
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
              {page.headline}
            </h1>
            {page.sub_headline && (
              <p className="text-lg sm:text-xl text-slate-300 max-w-lg mx-auto lg:mx-0 leading-relaxed">{page.sub_headline}</p>
            )}
            <div className="flex flex-wrap gap-5 justify-center lg:justify-start text-sm text-slate-300">
              <span className="flex items-center gap-2"><Clock className="h-5 w-5" style={{ color: accent }} /> Close in 7–14 Days</span>
              <span className="flex items-center gap-2"><DollarSign className="h-5 w-5" style={{ color: accent }} /> All Cash Offer</span>
              <span className="flex items-center gap-2"><Handshake className="h-5 w-5" style={{ color: accent }} /> Zero Fees</span>
            </div>

            {/* Client avatar */}
            {page.photo_url && (
              <div className="flex items-center gap-4 justify-center lg:justify-start pt-2">
                <img src={page.photo_url} alt={page.client_name} className="h-14 w-14 rounded-full object-cover border-[3px] border-white/30 shadow-lg" />
                <div className="text-left">
                  <p className="text-base font-semibold text-white">{page.client_name}</p>
                  <p className="text-sm text-slate-400">Real Estate Investor</p>
                </div>
              </div>
            )}

            {/* Scroll CTA */}
            <button onClick={scrollToForm} className="hidden lg:flex items-center gap-2 text-white/60 hover:text-white/90 transition text-sm mt-4">
              <ArrowDown className="h-4 w-4 animate-bounce" /> Scroll to get your free offer
            </button>
          </div>

          {/* Right — Form card */}
          <div id="lead-form" className="bg-white rounded-2xl shadow-2xl p-7 sm:p-9 max-w-md mx-auto lg:mx-0 lg:ml-auto w-full animate-scale-in">
            {submitted ? (
              <div className="text-center space-y-4 py-8">
                <div className="h-18 w-18 rounded-full mx-auto flex items-center justify-center" style={{ background: accent + '15', width: 72, height: 72 }}>
                  <CheckCircle className="h-9 w-9" style={{ color: accent }} />
                </div>
                <h3 className="text-2xl font-bold text-slate-800">We Got Your Info!</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Our team will review your property details and give you a call shortly with a no-obligation cash offer.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1.5 mb-7">
                  <h2 className="text-2xl font-bold text-slate-800">Get Your Cash Offer</h2>
                  <p className="text-sm text-slate-500">Fill out the form — we'll call you within 24 hours</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-slate-700 text-sm font-medium">Full Name</Label>
                    <Input id="name" placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-12 border-slate-200 focus:border-blue-400 text-base" maxLength={100} required />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-slate-700 text-sm font-medium">Phone Number</Label>
                    <Input id="phone" type="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 h-12 border-slate-200 focus:border-blue-400 text-base" maxLength={20} required />
                  </div>
                  <div>
                    <Label htmlFor="address" className="text-slate-700 text-sm font-medium">Property Address</Label>
                    <Input id="address" placeholder="123 Main St, City, TX 75001" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1.5 h-12 border-slate-200 focus:border-blue-400 text-base" maxLength={255} required />
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full h-13 text-base font-semibold rounded-xl text-white shadow-lg hover:shadow-xl transition-all" style={{ background: accent, height: 52 }}>
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><span>Get My Cash Offer</span><ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                  <p className="text-[11px] text-slate-400 text-center">
                    100% free and confidential. No obligation whatsoever.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════ Trust stats ═══════════ */}
      <section className="bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { icon: Home, label: '500+', desc: 'Homes Purchased' },
            { icon: DollarSign, label: '$50M+', desc: 'Cash Paid to Sellers' },
            { icon: Clock, label: '14 Days', desc: 'Average Close Time' },
            { icon: Star, label: '4.9 ★', desc: 'Average Rating' },
          ].map((s, i) => (
            <div key={i} className="space-y-2">
              <s.icon className="h-7 w-7 mx-auto" style={{ color: accent }} />
              <p className="text-3xl font-extrabold text-slate-800">{s.label}</p>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ Parallax Happy Family Section ═══════════ */}
      <section className="relative py-24 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${happyFamilyImg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/85 to-white/60" />
        <div className="relative max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-800 leading-tight">We Help Families Move Forward</h2>
            <p className="text-slate-600 leading-relaxed text-lg">
              Whether you're facing foreclosure, divorce, relocation, or simply need to sell fast — we provide a simple, dignified way to sell your home for cash. No judgment, just solutions.
            </p>
            <div className="space-y-3">
              {['Facing Foreclosure or Behind on Payments', 'Inherited Property You Can\'t Maintain', 'Going Through Divorce', 'Relocating for Work', 'Tired of Being a Landlord'].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: accent }} />
                  <span className="text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden md:block" />
        </div>
      </section>

      {/* ═══════════ Demo Video ═══════════ */}
      <section className="bg-white py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center space-y-3 mb-10">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>See It In Action</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-800">Watch How We Work</h2>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-xl group">
            {!videoPlaying ? (
              <div className="relative cursor-pointer" onClick={() => setVideoPlaying(true)}>
                <img
                  src={aiTechThumb}
                  alt="See how our process works"
                  className="w-full aspect-video object-cover"
                  loading="lazy"
                  width={1920}
                  height={1080}
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform" style={{ backgroundColor: accent + 'dd' }}>
                    <Play className="h-8 w-8 text-white ml-1" fill="white" />
                  </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="h-1 bg-black/10 rounded-full overflow-hidden">
                    <div className="h-full w-0 rounded-full" style={{ backgroundColor: accent }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-white/60">0:00</span>
                    <span className="text-[10px] text-white/60">2:34</span>
                  </div>
                </div>
              </div>
            ) : (
              <video
                ref={videoRef}
                className="w-full aspect-video object-cover"
                controls
                autoPlay
                playsInline
                poster={aiTechThumb}
              >
                <source src="" type="video/mp4" />
              </video>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════ How It Works ═══════════ */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center space-y-3 mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>Simple Process</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-800">How It Works</h2>
            <p className="text-slate-500 max-w-lg mx-auto">Selling your home doesn't have to be complicated. Three steps, that's it.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: '01', icon: Phone, title: 'Tell Us About Your Property', desc: 'Fill out the form or give us a call. Share your property details — no paperwork, no obligation.' },
              { step: '02', icon: DollarSign, title: 'Receive Your Cash Offer', desc: 'We\'ll review your property and present a fair, all-cash offer within 24 hours. No hidden fees ever.' },
              { step: '03', icon: Handshake, title: 'Close on Your Timeline', desc: 'Pick your closing date. We handle all paperwork, pay closing costs, and you walk away with cash.' },
            ].map((s, i) => (
              <div key={i} className="relative bg-white rounded-2xl border border-slate-100 p-8 shadow-sm hover:shadow-lg transition-all duration-300 group">
                <div className="text-6xl font-black text-slate-50 group-hover:text-slate-100 transition-colors absolute top-4 right-5">{s.step}</div>
                <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-5 shadow-sm" style={{ background: accent + '12' }}>
                  <s.icon className="h-6 w-6" style={{ color: accent }} />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ Parallax Neighborhood — CTA ═══════════ */}
      <section className="relative py-28 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${neighborhoodImg})` }}
        />
        <div className="absolute inset-0 bg-slate-900/70" />
        <div className="relative max-w-3xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            Your Neighbors Trusted Us.<br />You Can Too.
          </h2>
          <p className="text-lg text-white/80 max-w-xl mx-auto">
            We've helped hundreds of homeowners in your area sell quickly and move on with their lives. Let us do the same for you.
          </p>
          <Button size="lg" onClick={scrollToForm} className="text-white rounded-full px-10 h-14 text-base font-semibold shadow-xl hover:shadow-2xl transition-all" style={{ background: accent }}>
            <Heart className="h-5 w-5 mr-2" /> Get My Free Cash Offer
          </Button>
        </div>
      </section>

      {/* ═══════════ Reviews ═══════════ */}
      <section className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center space-y-3 mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>Testimonials</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-800">What Homeowners Are Saying</h2>
            <p className="text-slate-500">Real experiences from real sellers just like you</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((r, i) => (
              <div key={i} className="bg-slate-50 rounded-2xl p-7 border border-slate-100 hover:shadow-md transition-shadow relative">
                <Quote className="h-8 w-8 text-slate-200 absolute top-5 right-5" />
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: r.stars || 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">"{r.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow" style={{ background: accent }}>
                    {r.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                    {r.location && <p className="text-xs text-slate-400">{r.location}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ Happy Sellers Parallax ═══════════ */}
      <section className="relative py-24 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url(${happySellersImg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-l from-white/95 via-white/85 to-white/50" />
        <div className="relative max-w-5xl mx-auto px-4 flex justify-end">
          <div className="max-w-lg space-y-5 text-right">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-800 leading-tight">
              Join Hundreds of Happy Sellers
            </h2>
            <p className="text-slate-600 text-lg leading-relaxed">
              Our sellers walk away with cash in hand and peace of mind. No lengthy listings, no open houses, no uncertainty — just a fair deal and a fresh start.
            </p>
            <Button size="lg" onClick={scrollToForm} className="text-white rounded-full px-8 h-13 shadow-lg ml-auto" style={{ background: accent, height: 52 }}>
              Start Now <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════ Why Us ═══════════ */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center space-y-3 mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>The Difference</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-800">Why Sell to Us?</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: DollarSign, title: 'Fair Cash Offers', desc: 'Competitive offers based on real market data — no lowball tactics.' },
              { icon: Clock, title: 'Fast Closings', desc: 'Close in as little as 7 days. We work on your schedule, always.' },
              { icon: Shield, title: 'No Repairs Needed', desc: 'Sell your home as-is. We buy houses in any condition.' },
              { icon: CheckCircle, title: 'No Fees or Commissions', desc: 'No realtor fees, no closing costs, no hidden charges.' },
              { icon: Users, title: 'Experienced Team', desc: 'Years of experience buying homes locally. We know your market.' },
              { icon: MapPin, title: 'Local Investors', desc: 'We live and invest in your community. Not a faceless corporation.' },
            ].map((item, i) => (
              <div key={i} className="bg-white flex gap-4 p-5 rounded-xl border border-slate-100 hover:shadow-md transition-all duration-300">
                <div className="h-11 w-11 rounded-lg flex-shrink-0 flex items-center justify-center shadow-sm" style={{ background: accent + '12' }}>
                  <item.icon className="h-5 w-5" style={{ color: accent }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-0.5">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ Bottom CTA ═══════════ */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }} />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url(${heroHomeImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="relative max-w-3xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Ready to Get Your Cash Offer?</h2>
          <p className="text-white/80 text-lg max-w-lg mx-auto">
            No obligation. No pressure. Just a fair cash offer for your home.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={scrollToForm} className="bg-white text-slate-800 font-semibold px-8 h-14 rounded-full shadow-xl hover:shadow-2xl transition-all text-base">
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
      <footer className="bg-slate-900 text-slate-500 py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            {page.logo_url ? (
              <img src={page.logo_url} alt={page.client_name} className="h-6 w-auto opacity-60" />
            ) : (
              <div className="h-6 w-6 rounded flex items-center justify-center text-white/60 text-[10px] font-bold" style={{ background: accent + '40' }}>
                {page.client_name.charAt(0)}
              </div>
            )}
            <span>© {new Date().getFullYear()} {page.client_name}. All rights reserved.</span>
          </div>
          <p className="text-slate-600">Fair. Fast. Professional.</p>
        </div>
      </footer>
    </div>
  );
}
