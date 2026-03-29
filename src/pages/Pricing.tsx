import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

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

export default function Pricing() {
  const [agreed, setAgreed] = useState(false);

  const handleSubscribe = () => {
    if (!agreed) return;
    // TODO: Redirect to Square checkout
    window.open('https://warren.guru/auth', '_self');
  };

  return (
    <div className="bg-black text-white min-h-screen selection:bg-white/20">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="text-[10px] tracking-[0.2em] uppercase">Back</span>
          </Link>
          <div className="flex flex-col leading-none items-center">
            <span className="text-white/30 font-light text-[8px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/80 font-medium text-sm tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="pt-28 pb-24 px-6">
        <div className="max-w-lg mx-auto">
          {/* Title */}
          <motion.div initial="hidden" animate="visible" variants={fade} custom={0} className="text-center mb-12">
            <p className="text-[10px] tracking-[0.4em] uppercase text-white/30 mb-3">Pricing</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Simple. No surprises.
            </h1>
            <p className="mt-3 text-sm text-white/35 max-w-sm mx-auto">
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
                <span className="text-5xl sm:text-6xl font-bold">$599</span>
                <span className="text-white/30 text-sm">/mo</span>
              </div>
              <p className="mt-2 text-xs text-white/30">
                Introductory rate for the first 90 days — then <span className="text-white/50 font-medium">$799/mo</span>
              </p>
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] tracking-[0.2em] uppercase text-emerald-400/80">24-Hour Free Trial</span>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06] my-8" />

            {/* Included */}
            <div className="space-y-3">
              <p className="text-[10px] tracking-[0.3em] uppercase text-white/30 mb-4">What's Included</p>
              {included.map((item, i) => (
                <motion.div
                  key={item}
                  initial="hidden" animate="visible" variants={fade} custom={i + 2}
                  className="flex items-start gap-3"
                >
                  <Check className="h-3.5 w-3.5 mt-0.5 text-white/30 flex-shrink-0" />
                  <span className="text-xs text-white/50">{item}</span>
                </motion.div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06] my-8" />

            {/* Terms Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div
                className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                  agreed
                    ? 'bg-white border-white'
                    : 'border-white/20 group-hover:border-white/40'
                }`}
                onClick={() => setAgreed(!agreed)}
              >
                {agreed && <Check className="h-2.5 w-2.5 text-black" />}
              </div>
              <span className="text-[11px] text-white/35 leading-relaxed">
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
              disabled={!agreed}
              className={`mt-6 w-full flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-lg text-xs tracking-[0.2em] uppercase font-medium transition-all ${
                agreed
                  ? 'bg-white text-black hover:bg-white/90 cursor-pointer'
                  : 'bg-white/10 text-white/20 cursor-not-allowed'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              Start Free Trial
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <p className="mt-4 text-center text-[10px] text-white/20">
              Secure checkout powered by Square. Cancel anytime.
            </p>
          </motion.div>

          {/* FAQ-style notes */}
          <motion.div initial="hidden" animate="visible" variants={fade} custom={8} className="mt-12 space-y-6">
            <div>
              <h3 className="text-xs font-medium text-white/50 mb-1">How does the trial work?</h3>
              <p className="text-[11px] text-white/25 leading-relaxed">
                Your card is authorized during signup but not charged. You have 24 hours to explore the full platform. If you don't cancel, your subscription begins at $599/mo.
              </p>
            </div>
            <div>
              <h3 className="text-xs font-medium text-white/50 mb-1">What happens after 90 days?</h3>
              <p className="text-[11px] text-white/25 leading-relaxed">
                Your rate adjusts to $799/mo — reflecting the full value of the platform. You'll be notified before the change takes effect.
              </p>
            </div>
            <div>
              <h3 className="text-xs font-medium text-white/50 mb-1">Can I cancel?</h3>
              <p className="text-[11px] text-white/25 leading-relaxed">
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
            <span className="text-white/20 font-light text-[8px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/40 font-medium text-xs tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-[10px] tracking-wider uppercase text-white/20 hover:text-white/50 transition-colors">Terms</Link>
            <Link to="/" className="text-[10px] tracking-wider uppercase text-white/20 hover:text-white/50 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
