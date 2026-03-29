import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Home, Phone, Star, Shield, Clock, CheckCircle, ArrowRight, Loader2,
  MapPin, Users, DollarSign, Handshake
} from 'lucide-react';

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

  // Form
  const [name, setName] = useState('');
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
    setSubmitting(true);
    const { error } = await supabase.from('lw_landing_leads').insert({
      landing_page_id: page?.id,
      full_name: name.trim(),
      phone: phone.trim(),
      property_address: address.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error('Something went wrong. Please try again.');
    } else {
      setSubmitted(true);
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
  ];

  const reviews = page.reviews.length > 0 ? page.reviews : DEFAULT_REVIEWS;

  return (
    <div className="min-h-screen bg-white" style={{ '--accent': accent, '--accent-light': accent + '15' } as React.CSSProperties}>
      {/* Nav bar */}
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {page.logo_url ? (
              <img src={page.logo_url} alt={page.client_name} className="h-9 w-auto" />
            ) : (
              <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: accent }}>
                {page.client_name.charAt(0)}
              </div>
            )}
            <span className="text-lg font-semibold text-slate-800">{page.client_name}</span>
          </div>
          {page.phone && (
            <a href={`tel:${page.phone}`} className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition">
              <Phone className="h-4 w-4" />
              {page.phone}
            </a>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left – copy */}
          <div className="space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-xs font-medium text-white/90">
              <Shield className="h-3.5 w-3.5" />
              Trusted Local Home Buyer
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
              {page.headline}
            </h1>
            {page.sub_headline && (
              <p className="text-lg text-slate-300 max-w-lg mx-auto lg:mx-0">{page.sub_headline}</p>
            )}
            <div className="flex flex-wrap gap-4 justify-center lg:justify-start text-sm text-slate-300">
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" style={{ color: accent }} /> Close in 7–14 Days</span>
              <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4" style={{ color: accent }} /> All Cash Offer</span>
              <span className="flex items-center gap-1.5"><Handshake className="h-4 w-4" style={{ color: accent }} /> Zero Fees or Commissions</span>
            </div>
            {page.photo_url && (
              <div className="flex items-center gap-3 justify-center lg:justify-start pt-2">
                <img src={page.photo_url} alt={page.client_name} className="h-12 w-12 rounded-full object-cover border-2 border-white/30" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">{page.client_name}</p>
                  <p className="text-xs text-slate-400">Real Estate Investor</p>
                </div>
              </div>
            )}
          </div>

          {/* Right – form */}
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md mx-auto lg:mx-0 lg:ml-auto w-full">
            {submitted ? (
              <div className="text-center space-y-4 py-6">
                <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center" style={{ background: accent + '15' }}>
                  <CheckCircle className="h-8 w-8" style={{ color: accent }} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">We Got Your Info!</h3>
                <p className="text-slate-500 text-sm">
                  Our team will review your property details and give you a call shortly with a no-obligation cash offer.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1 mb-6">
                  <h2 className="text-xl font-bold text-slate-800">Get Your Cash Offer</h2>
                  <p className="text-sm text-slate-500">Fill out the form and we'll call you within 24 hours</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-slate-700 text-sm font-medium">Full Name</Label>
                    <Input id="name" placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 border-slate-200 focus:border-blue-400" maxLength={100} required />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-slate-700 text-sm font-medium">Phone Number</Label>
                    <Input id="phone" type="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 border-slate-200 focus:border-blue-400" maxLength={20} required />
                  </div>
                  <div>
                    <Label htmlFor="address" className="text-slate-700 text-sm font-medium">Property Address</Label>
                    <Input id="address" placeholder="123 Main St, City, TX 75001" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 border-slate-200 focus:border-blue-400" maxLength={255} required />
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full h-12 text-base font-semibold rounded-xl text-white" style={{ background: accent }}>
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><span>Get My Cash Offer</span><ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                  <p className="text-[11px] text-slate-400 text-center">
                    100% free and confidential. No obligation.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { icon: Home, label: '500+', desc: 'Homes Purchased' },
            { icon: DollarSign, label: '$50M+', desc: 'Cash Paid to Sellers' },
            { icon: Clock, label: '14 Days', desc: 'Average Close Time' },
            { icon: Star, label: '4.9 ★', desc: 'Average Rating' },
          ].map((s, i) => (
            <div key={i} className="space-y-1">
              <s.icon className="h-6 w-6 mx-auto" style={{ color: accent }} />
              <p className="text-2xl font-bold text-slate-800">{s.label}</p>
              <p className="text-xs text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center space-y-2 mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">How It Works</h2>
          <p className="text-slate-500 max-w-lg mx-auto">Selling your home doesn't have to be complicated. We've simplified the process down to three simple steps.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            { step: '01', icon: Phone, title: 'Tell Us About Your Property', desc: 'Fill out the form above or give us a call. Share your property details — no paperwork required.' },
            { step: '02', icon: DollarSign, title: 'Receive Your Cash Offer', desc: 'We\'ll review your property and present a fair, all-cash offer within 24 hours. No hidden fees.' },
            { step: '03', icon: Handshake, title: 'Close on Your Timeline', desc: 'Pick a closing date that works for you. We handle all the paperwork and pay all closing costs.' },
          ].map((s, i) => (
            <div key={i} className="relative bg-white rounded-xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl font-black text-slate-100 absolute top-4 right-5">{s.step}</div>
              <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-4" style={{ background: accent + '12' }}>
                <s.icon className="h-5 w-5" style={{ color: accent }} />
              </div>
              <h3 className="text-base font-semibold text-slate-800 mb-1">{s.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Reviews */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="text-center space-y-2 mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">What Homeowners Are Saying</h2>
            <p className="text-slate-500">Real experiences from real sellers</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((r, i) => (
              <div key={i} className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: r.stars || 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-4">"{r.text}"</p>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: accent }}>
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

      {/* Why us */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center space-y-2 mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Why Sell to Us?</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: DollarSign, title: 'Fair Cash Offers', desc: 'We provide competitive offers based on real market data — no lowball tactics.' },
            { icon: Clock, title: 'Fast Closings', desc: 'Close in as little as 7 days. We work on your schedule.' },
            { icon: Shield, title: 'No Repairs Needed', desc: 'Sell your home as-is. We buy houses in any condition.' },
            { icon: CheckCircle, title: 'No Fees or Commissions', desc: 'No realtor fees, no closing costs, no hidden charges.' },
            { icon: Users, title: 'Experienced Team', desc: 'Years of experience buying homes locally. We know your market.' },
            { icon: MapPin, title: 'Local Investors', desc: 'We live and invest in your community. Not a faceless corporation.' },
          ].map((item, i) => (
            <div key={i} className="flex gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: accent + '12' }}>
                <item.icon className="h-5 w-5" style={{ color: accent }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{item.title}</h3>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="text-white py-16" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)` }}>
        <div className="max-w-3xl mx-auto px-4 text-center space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to Get Your Cash Offer?</h2>
          <p className="text-white/80 max-w-lg mx-auto">
            No obligation. No pressure. Just a fair cash offer for your home. Scroll up and fill out the form, or call us directly.
          </p>
          {page.phone && (
            <a href={`tel:${page.phone}`} className="inline-flex items-center gap-2 bg-white text-slate-800 font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition">
              <Phone className="h-4 w-4" />
              Call {page.phone}
            </a>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-center py-6 text-xs">
        <p>© {new Date().getFullYear()} {page.client_name}. All rights reserved.</p>
      </footer>
    </div>
  );
}
