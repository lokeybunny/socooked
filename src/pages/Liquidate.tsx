import { useState } from 'react';
import { ShoppingBag, Phone, TrendingUp, Clock, Shield, Users, ChevronRight, CheckCircle2, Store, DollarSign, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const STEPS = [
  { icon: Phone, title: 'You Call or Text Us', desc: 'Tell us what items you have. We respond within 24 hours.' },
  { icon: TrendingUp, title: 'We Research & Price', desc: 'Our team finds the best market value for every item.' },
  { icon: DollarSign, title: 'We List & Sell', desc: 'Items go live on multiple platforms for maximum exposure.' },
  { icon: Truck, title: 'You Get Paid', desc: 'Fast payments once items sell. No risk on your end.' },
];

const BENEFITS = [
  { icon: Clock, title: 'Move Inventory Fast', desc: 'Items sitting on shelves lose value. We get them sold.' },
  { icon: Users, title: 'Reach More Buyers', desc: 'Our network spans eBay, Facebook, OfferUp and private buyers.' },
  { icon: Shield, title: 'Zero Risk', desc: 'No upfront cost to you. We only succeed when you do.' },
  { icon: Store, title: 'Built for Pawn Shops', desc: 'We understand your business. Quick turnarounds, no fluff.' },
];

export default function Liquidate() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) { toast.error('Name and phone are required'); return; }
    setSending(true);
    try {
      await supabase.from('customers').insert([{
        full_name: name.trim(),
        phone: phone.trim(),
        company: shopName.trim() || null,
        source: 'liquidate-landing',
        status: 'lead',
        notes: message.trim() || null,
        tags: ['pawn-shop', 'liquidation'],
      }]);
      setSubmitted(true);
      toast.success('Thanks! We\'ll reach out soon.');
    } catch {
      toast.error('Something went wrong');
    } finally { setSending(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      {/* Header */}
      <header className="border-b border-amber-200/40 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10">
              <ShoppingBag className="h-5 w-5 text-amber-600" />
            </div>
            <span className="font-bold text-lg text-foreground">LiquidateHQ</span>
          </div>
          <a href="tel:+1234567890" className="text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1">
            <Phone className="h-4 w-4" /> Call Us
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium mb-6">
          <Store className="h-3.5 w-3.5" /> Built for Pawn Shops & Resellers
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-foreground leading-tight max-w-3xl mx-auto">
          Turn Dead Inventory Into <span className="text-amber-600">Cash</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
          We help pawn shops liquidate stale inventory fast. No upfront costs, no risk — just results.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" className="bg-amber-600 hover:bg-amber-700 text-white px-8" onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}>
            Get Started <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button variant="outline" size="lg" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
            How It Works
          </Button>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 bg-white dark:bg-zinc-900/50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <div key={i} className="text-center space-y-3">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <step.icon className="h-6 w-6 text-amber-600" />
                </div>
                <div className="text-xs font-bold text-amber-600">STEP {i + 1}</div>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">Why Partner With Us?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {BENEFITS.map((b, i) => (
              <div key={i} className="flex gap-4 p-5 rounded-xl border bg-card hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 h-fit">
                  <b.icon className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{b.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-amber-600 dark:bg-amber-800">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-white">
          {[
            { val: '500+', label: 'Items Sold' },
            { val: '48h', label: 'Avg. Time to List' },
            { val: '30+', label: 'Store Partners' },
            { val: '$0', label: 'Upfront Cost' },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-3xl md:text-4xl font-extrabold">{s.val}</p>
              <p className="text-amber-100 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact Form */}
      <section id="contact" className="py-16">
        <div className="max-w-lg mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-foreground mb-2">Let's Talk</h2>
          <p className="text-center text-muted-foreground mb-8">Tell us about your shop and we'll reach out within 24 hours.</p>

          {submitted ? (
            <div className="text-center py-12 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <p className="text-xl font-bold text-foreground">We Got Your Info!</p>
              <p className="text-muted-foreground">Expect a call or text from our team shortly.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="Your Name *" value={name} onChange={e => setName(e.target.value)} required />
              <Input placeholder="Phone Number *" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
              <Input placeholder="Shop / Business Name" value={shopName} onChange={e => setShopName(e.target.value)} />
              <Textarea placeholder="What kind of items do you have? (optional)" value={message} onChange={e => setMessage(e.target.value)} rows={3} />
              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white" size="lg" disabled={sending}>
                {sending ? 'Sending...' : 'Get Started — It\'s Free'}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground">No obligation. No credit card. Just a conversation.</p>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} LiquidateHQ. All rights reserved.</p>
      </footer>
    </div>
  );
}
