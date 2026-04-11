import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, MessageCircle, Loader2, AlertCircle, CheckCircle2, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/* ─── Configurable course price (cents) ─── */
const COURSE_PRICE_CENTS = 29900; // $299.00 — change this to adjust pricing
const COURSE_PRICE_DISPLAY = `$${(COURSE_PRICE_CENTS / 100).toFixed(2)}`;

type FunnelStep = 'capture' | 'payment' | 'success';

export default function CourseFunnel() {
  const [searchParams] = useSearchParams();
  const cidFromUrl = searchParams.get('cid');

  const [step, setStep] = useState<FunnelStep>(cidFromUrl ? 'success' : 'capture');
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If returning from Square with cid, show success
  useEffect(() => {
    if (cidFromUrl) setStep('success');
  }, [cidFromUrl]);

  /* ─── Step 1: Lead capture ─── */
  const handleLeadCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      // Insert lead into customers table
      const { data, error: insertError } = await supabase.from('customers').insert({
        full_name: formData.name.trim(),
        email: formData.email.trim(),
        source: 'ai-director-landing',
        status: 'lead',
        tags: ['ai-course'],
      }).select('id').single();

      if (insertError) throw insertError;

      // Create Square payment link
      const { data: checkoutData, error: fnError } = await supabase.functions.invoke('course-checkout', {
        body: {
          customer_id: data.id,
          email: formData.email.trim(),
          name: formData.name.trim(),
          amount_cents: COURSE_PRICE_CENTS,
        },
      });

      if (fnError) throw fnError;
      if (checkoutData?.error) throw new Error(checkoutData.error);

      setPaymentUrl(checkoutData.payment_url);
      setStep('payment');
    } catch (err: any) {
      console.error('Lead capture error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
      toast({ title: 'Error', description: 'Could not process your request.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(0,0%,3%)] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex flex-col leading-none">
            <span className="text-[9px] tracking-[0.25em] uppercase text-emerald-400/70">Warren</span>
            <span className="text-sm font-light tracking-[0.15em] uppercase text-white/80">GURU</span>
          </Link>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {(['capture', 'payment', 'success'] as FunnelStep[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-colors ${
                  step === s ? 'bg-emerald-400' : 
                  (['capture', 'payment', 'success'].indexOf(step) > i ? 'bg-emerald-400/40' : 'bg-white/10')
                }`} />
                {i < 2 && <div className="w-6 h-px bg-white/10" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          key={step}
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* ─── STEP 1: Lead Capture ─── */}
          {step === 'capture' && (
            <div className="p-6 sm:p-8 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-emerald-400" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
                  AI Filmmaking 2 Hour Master Course
                </h1>
                <p className="text-sm text-white/40">
                  2-hour step-by-step system · {COURSE_PRICE_DISPLAY}
                </p>
              </div>

              <form onSubmit={handleLeadCapture} className="space-y-4">
                <input
                  type="text"
                  placeholder="First name"
                  value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  required
                  maxLength={100}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors"
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={formData.email}
                  onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                  required
                  maxLength={255}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors"
                />

                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-black font-medium text-sm tracking-wide hover:bg-emerald-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      Get Access
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                <p className="text-[10px] text-white/20 text-center">
                  Secure checkout · No spam · Instant access after payment
                </p>
              </form>
            </div>
          )}

          {/* ─── STEP 2: Payment ─── */}
          {step === 'payment' && (
            <div className="p-6 sm:p-8 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CreditCard className="h-6 w-6 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">Complete Payment</h2>
              <p className="text-sm text-white/40 mb-6">
                You'll be redirected to our secure checkout powered by Square.
              </p>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/60">AI Filmmaking 2 Hour Master Course</span>
                  <span className="text-emerald-400 font-semibold">{COURSE_PRICE_DISPLAY}</span>
                </div>
              </div>

              {paymentUrl ? (
                <a
                  href={paymentUrl}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-black font-medium text-sm tracking-wide hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  Pay {COURSE_PRICE_DISPLAY} with Square
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing checkout…
                </div>
              )}

              <button
                onClick={() => { setStep('capture'); setError(null); }}
                className="mt-4 text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                ← Go back
              </button>
            </div>
          )}

          {/* ─── STEP 3: Success ─── */}
          {step === 'success' && (
            <div className="p-6 sm:p-8 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold mb-2">You're In! 🎬</h2>
              <p className="text-sm text-white/40 mb-6">
                Your enrollment is confirmed. Check your email for course access instructions.
              </p>

              <div className="space-y-3">
                <a
                  href="https://discord.gg/warrenguru"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-xl bg-emerald-500 text-black font-medium text-sm tracking-wide hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  Join the Discord Community
                </a>
                <Link
                  to="/course/login"
                  className="w-full py-3 rounded-xl border border-white/10 text-white/70 text-sm hover:border-emerald-500/30 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  Access Your Course →
                </Link>
              </div>

              <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 text-left">
                <h3 className="text-xs font-medium text-white/60 uppercase tracking-wider mb-2">What's Next</h3>
                <ul className="space-y-2 text-sm text-white/40">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">1.</span>
                    Check your email for the course link
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">2.</span>
                    Join the Discord for live support
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">3.</span>
                    Start creating AI films today
                  </li>
                </ul>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-4 px-4 text-center">
        <p className="text-[10px] text-white/20 tracking-wider uppercase">
          © {new Date().getFullYear()} Warren Guru · Secure payments by Square
        </p>
      </footer>
    </div>
  );
}
