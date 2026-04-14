import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Shield, Loader2, MessageCircle, X, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const included = [
  'Branded Seller Landing Page',
  'AI Voice Agent (Inbound & Outbound)',
  'Full Wholesale CRM Dashboard',
  'Automated Lead Scoring & Analysis',
  'Distressed Property Data Feed',
  'Skip Tracing Integration',
  'Automated Email Follow-Ups',
  'Seller Pipeline Management',
  'Call Transcripts & AI Notes',
  'Deal Tracking & Agreements',
];

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.23, 1, 0.32, 1] },
  }),
};

const VALID_CODES = ['GOAT'];

export default function Pricing() {
  const [agreed, setAgreed] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [codeValid, setCodeValid] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  useEffect(() => {
    setShowBanner(true);
  }, []);

  const handleCodeCheck = (val: string) => {
    setInviteCode(val);
    const trimmed = val.trim();
    if (trimmed && VALID_CODES.includes(trimmed)) {
      setCodeValid(true);
      setCodeError('');
    } else {
      setCodeValid(false);
      setCodeError(trimmed.length > 0 ? 'Invalid invite code' : '');
    }
  };

  const handleSubscribe = async () => {
    if (!agreed || !codeValid) return;
    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('square-subscribe', {
        body: { email: email.trim(), name: name.trim() || undefined },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Subscribe error:', err);
      toast.error(err.message || 'Failed to create checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-black text-white min-h-screen selection:bg-white/20">
      {/* Invite-only banner */}
      {showBanner && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="relative max-w-md w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 text-center">
            <button onClick={() => setShowBanner(false)} className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-5">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs tracking-[0.2em] uppercase text-amber-400/90">Invite Only</span>
            </div>
            <h2 className="text-xl font-bold mb-3">We're Currently Invite Only</h2>
            <p className="text-sm text-white/40 leading-relaxed mb-6">
              Join our Discord and open a ticket to get onboarded, or call us directly.
            </p>
            <div className="flex flex-col gap-3">
              <a
                href="https://discord.gg/warrenguru"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 px-6 py-3 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-medium tracking-wider uppercase transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Join the Discord
              </a>
              <a
                href="tel:+17027016192"
                className="flex items-center justify-center gap-2.5 px-6 py-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/70 text-sm font-medium tracking-wider uppercase transition-colors"
              >
                <Phone className="h-4 w-4" />
                (702) 701-6192
              </a>
            </div>
            <button onClick={() => setShowBanner(false)} className="mt-5 text-xs text-white/20 hover:text-white/40 tracking-wider uppercase transition-colors">
              I already have a code
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm tracking-[0.2em] uppercase">Back</span>
          </Link>
          <div className="flex flex-col leading-none items-center">
            <span className="text-white/30 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/80 font-medium text-base tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
          <div className="w-20" />
        </div>
      </header>

      <main className="pt-28 pb-24 px-6">
        <div className="max-w-xl mx-auto">
          {/* Title */}
          <motion.div initial="hidden" animate="visible" variants={fade} custom={0} className="text-center mb-14">
            <p className="text-xs tracking-[0.4em] uppercase text-white/30 mb-4">Pricing</p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Simple. No surprises.
            </h1>
            <p className="mt-4 text-base text-white/35 max-w-md mx-auto">
              Everything you need to run a fully automated wholesale operation.
            </p>
          </motion.div>

          {/* Pricing Card */}
          <motion.div
            initial="hidden" animate="visible" variants={fade} custom={1}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 sm:p-10"
          >
            {/* Price */}
            <div className="text-center mb-8">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-6xl sm:text-7xl font-bold">$599</span>
                <span className="text-white/30 text-lg">/mo</span>
              </div>
              <p className="mt-3 text-sm text-white/30">
                Introductory rate for the first 90 days — then <span className="text-white/50 font-medium">$799/mo</span>
              </p>
              <div className="mt-5 inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs tracking-[0.2em] uppercase text-emerald-400/80">24-Hour Free Trial</span>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06] my-8" />

            {/* Included */}
            <div className="space-y-4">
              <p className="text-xs tracking-[0.3em] uppercase text-white/30 mb-5">What's Included</p>
              {included.map((item, i) => (
                <motion.div
                  key={item}
                  initial="hidden" animate="visible" variants={fade} custom={i + 2}
                  className="flex items-start gap-3"
                >
                  <Check className="h-4 w-4 mt-0.5 text-white/30 flex-shrink-0" />
                  <span className="text-sm text-white/50">{item}</span>
                </motion.div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06] my-8" />

            {/* Invite Code */}
            <div className="mb-6">
              <label className="text-xs tracking-[0.2em] uppercase text-white/30 mb-2 block">Invite Code <span className="text-white/50">*</span></label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => handleCodeCheck(e.target.value)}
                placeholder="Enter your invite code"
                className={`w-full px-4 py-3 bg-white/[0.04] border rounded-lg text-base text-white placeholder:text-white/20 focus:outline-none transition-colors ${
                  codeValid ? 'border-emerald-500/40 focus:border-emerald-500/60' : codeError ? 'border-red-500/40 focus:border-red-500/60' : 'border-white/[0.08] focus:border-white/20'
                }`}
              />
              {codeError && <p className="mt-1.5 text-xs text-red-400/70">{codeError}</p>}
              {codeValid && <p className="mt-1.5 text-xs text-emerald-400/70">✓ Code accepted</p>}
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06] my-6" />

            {/* Email & Name inputs */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs tracking-[0.2em] uppercase text-white/30 mb-2 block">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-lg text-base text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs tracking-[0.2em] uppercase text-white/30 mb-2 block">Email <span className="text-white/50">*</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-lg text-base text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>

            {/* Terms Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div
                className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                  agreed
                    ? 'bg-white border-white'
                    : 'border-white/20 group-hover:border-white/40'
                }`}
                onClick={() => setAgreed(!agreed)}
              >
                {agreed && <Check className="h-3 w-3 text-black" />}
              </div>
              <span className="text-sm text-white/35 leading-relaxed">
                I agree to the{' '}
                <Link to="/terms" className="text-white/60 underline underline-offset-2 hover:text-white transition-colors">
                  Terms & Conditions
                </Link>
                {' '}and authorize a charge of $599/mo after the 24-hour free trial period.
              </span>
            </label>

            {/* Subscribe Button */}
            <button
              onClick={handleSubscribe}
              disabled={!agreed || !codeValid || loading}
              className={`mt-8 w-full flex items-center justify-center gap-3 px-8 py-4 rounded-lg text-sm tracking-[0.2em] uppercase font-medium transition-all ${
                agreed && codeValid && !loading
                  ? 'bg-white text-black hover:bg-white/90 cursor-pointer'
                  : 'bg-white/10 text-white/20 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Discord CTA */}
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 w-full flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/20 hover:bg-[#5865F2]/20 text-[#5865F2] text-sm tracking-[0.15em] uppercase font-medium transition-all"
            >
              <MessageCircle className="h-4 w-4" />
              Join the Discord
            </a>

            <p className="mt-5 text-center text-xs text-white/20">
              Secure checkout powered by Square. Cancel anytime.
            </p>
          </motion.div>

          {/* FAQ */}
          <motion.div initial="hidden" animate="visible" variants={fade} custom={8} className="mt-14 space-y-8">
            <div>
              <h3 className="text-base font-medium text-white/50 mb-2">How does the trial work?</h3>
              <p className="text-sm text-white/25 leading-relaxed">
                Your card is authorized during signup but not charged. You have 24 hours to explore the full platform. If you don't cancel, your subscription begins at $599/mo.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-white/50 mb-2">What happens after 90 days?</h3>
              <p className="text-sm text-white/25 leading-relaxed">
                Your rate adjusts to $799/mo — reflecting the full value of the platform. You'll be notified before the change takes effect.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-white/50 mb-2">Can I cancel?</h3>
              <p className="text-sm text-white/25 leading-relaxed">
                Yes. Cancel anytime from your dashboard. No cancellation fees, no lock-in contracts.
              </p>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex flex-col leading-none">
            <span className="text-white/20 font-light text-[10px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/40 font-medium text-sm tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-xs tracking-wider uppercase text-white/20 hover:text-white/50 transition-colors">Terms</Link>
            <Link to="/" className="text-xs tracking-wider uppercase text-white/20 hover:text-white/50 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
