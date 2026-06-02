import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Check, MessageCircle, Youtube, Mail, Sparkles,
  Shield, Users, BookOpen, TrendingUp, Wallet, Activity, Bell,
  ChevronDown, ChevronUp, X, Copy, Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import SEOHead from '@/components/SEOHead';
import bundlerScreenshot from '@/assets/bundler-screenshot.png.asset.json';
import rugsInfographic from '@/assets/warren-guru-rugs-infographic.png.asset.json';
import { markPurchasePending } from '@/components/DiscordTicketReminder';
import { useSolUsd } from '@/hooks/useSolUsd';

const bundlerFeatures = [
  { emoji: '⚡', title: 'Blazing Fast Terminal', desc: 'Major speed & UI performance improvements for rendering and interactions.' },
  { emoji: '🏷️', title: 'White Labeling', desc: 'Run your own crypto business — fully white-label with your branding, logo and colors.' },
  { emoji: '💰', title: 'Bags.fm Support', desc: 'Native integration with bags.fm alongside Pump.fun and PumpSwap.' },
  { emoji: '🔥', title: 'Burn Tokens', desc: 'Burn unwanted tokens and reclaim rent in one step.' },
  { emoji: '💸', title: 'Cashback Coins', desc: 'Full PumpFun cashback support on bonding curve and PumpSwap, auto-claimed.' },
  { emoji: '📊', title: 'Split Sells on Volume', desc: 'Volume tasks automatically sell after buying for realistic trading patterns.' },
  { emoji: '👛', title: 'Wallet Presets', desc: 'Fund, Withdraw, Redistribute, Tag and Warm wallets with saved configs.' },
  { emoji: '🧬', title: 'Redistribution Revamp', desc: 'Easily redistribute funds to new or existing wallets and groups.' },
  { emoji: '💎', title: 'Dust Recovery', desc: 'Automatically recover leftover SOL from intermediate wallets.' },
  { emoji: '📈', title: 'Per-Wallet PnL', desc: 'Realized + unrealized PnL tracked per wallet, per token, with historical drill-down.' },
  { emoji: '💝', title: 'Charity Fee Sharing', desc: 'Donate to charities directly through fee sharing at launch setup.' },
  { emoji: '🛡️', title: 'PumpFun V2 Ready', desc: 'Adapted to PumpFun program upgrades and new PDA accounts.' },
];

const feeRows = [
  { label: 'Buys', free: '0.5%', pro: '0%' },
  { label: 'Sells', free: '0.5%', pro: '0%' },
  { label: 'Mix Wallet', free: '0.001 SOL', pro: '0 SOL' },
  { label: 'Warm Wallet', free: '0.001 SOL', pro: '0 SOL' },
  { label: 'Tag Wallet', free: '0.001 SOL', pro: '0 SOL' },
  { label: 'Launch Token', free: '0.01 SOL', pro: '0 SOL' },
];

const nav = [
  { label: 'Bundler', href: '#bundler' },
  { label: 'Rugs', href: '#how-bundling-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Community', href: '#community' },
  { label: 'FAQ', href: '#faq' },
];

const benefits = [
  { icon: BookOpen, title: 'Premium Group Classes', desc: 'Learn launch preparation, wallet management concepts, liquidity mechanics, and token lifecycle strategies.' },
  { icon: Users, title: 'Private Discord Access', desc: 'Access members-only channels, discussions, and educational resources.' },
  { icon: TrendingUp, title: 'Launch Case Studies', desc: 'Analyze real launches and understand why projects succeed or fail.' },
  { icon: Sparkles, title: 'Opportunity Research', desc: 'Study market trends, narratives, and ecosystem opportunities.' },
];

const steps = [
  { n: '01', title: 'Join Membership', desc: 'Secure your seat with a one-time Solana payment.' },
  { n: '02', title: 'Connect Discord', desc: 'Get instant access to private member channels.' },
  { n: '03', title: 'Access Training', desc: 'Unlock premium classes, case studies, and resources.' },
  { n: '04', title: 'Participate', desc: 'Engage in live sessions and the active community.' },
];

const trust = [
  'Private Discord Community',
  'Premium Training Sessions',
  'Live Launch Breakdowns',
  'Advanced Solana Education',
];

const faqs = [
  { q: 'What payment methods do you accept?', a: 'Solana (SOL) payments processed securely through NOWPayments. Your membership activates automatically once payment is confirmed on-chain.' },
  { q: 'Is this financial advice?', a: 'No. Warren Guru Bundler Academy is an educational community. Nothing shared inside is financial, investment, or trading advice.' },
  { q: 'How do I access Discord?', a: 'After payment confirmation you receive a private invite link with role assignment to all member-only channels.' },
  { q: 'What happens after payment?', a: 'You are redirected to a confirmation page, receive a Discord invite, and gain immediate access to training archives and live sessions.' },
];

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.55, ease: [0.23, 1, 0.32, 1] as any } }),
};

function HeroVisual() {
  return (
    <div className="relative w-full aspect-square max-w-[520px] mx-auto">
      {/* glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,136,0.18),transparent_60%)] blur-2xl" />
      {/* dashboard card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
        className="relative h-full w-full rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.01] backdrop-blur-xl p-5 shadow-[0_0_60px_-15px_rgba(0,255,136,0.35)]"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] tracking-[0.3em] uppercase text-emerald-300/70">Launch Console</span>
          </div>
          <Activity className="h-3.5 w-3.5 text-cyan-300/60" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Wallet, label: 'Wallets', val: '128' },
            { icon: TrendingUp, label: 'Volume', val: '$842K' },
            { icon: Bell, label: 'Alerts', val: '24' },
            { icon: Sparkles, label: 'Score', val: '98' },
          ].map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="rounded-xl border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center justify-between">
                <m.icon className="h-3.5 w-3.5 text-cyan-300/70" />
                <span className="text-[9px] tracking-wider uppercase text-white/30">{m.label}</span>
              </div>
              <div className="mt-2 text-lg font-semibold text-white/90">{m.val}</div>
            </motion.div>
          ))}
        </div>

        {/* chart */}
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 h-32 relative overflow-hidden">
          <svg viewBox="0 0 200 80" className="w-full h-full">
            <defs>
              <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#00ff88" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, ease: 'easeInOut' }}
              d="M0,60 L20,55 L40,58 L60,40 L80,45 L100,28 L120,35 L140,20 L160,25 L180,12 L200,18"
              fill="none" stroke="#00ff88" strokeWidth="1.5" />
            <path d="M0,60 L20,55 L40,58 L60,40 L80,45 L100,28 L120,35 L140,20 L160,25 L180,12 L200,18 L200,80 L0,80 Z" fill="url(#g)" />
          </svg>
          <div className="absolute top-2 left-3 text-[9px] tracking-wider uppercase text-emerald-300/60">Live Feed</div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2">
          <MessageCircle className="h-3.5 w-3.5 text-cyan-300" />
          <span className="text-[10px] text-cyan-200/70">Discord · 3 new launch breakdowns</span>
        </div>
      </motion.div>

      {/* floating particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-1 w-1 rounded-full bg-emerald-400"
          style={{ left: `${15 + i * 13}%`, top: `${20 + (i % 3) * 25}%` }}
          animate={{ y: [0, -12, 0], opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
        />
      ))}
    </div>
  );
}

type Payment = {
  payment_id: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id: string;
  network?: string;
};

// Prices are USD-canonical. SOL display values are derived from a live rate
// so the user always sees the correct SOL amount for the stated USD price.
const VIP_USD = 999;
const HOUR_USD = 250;

export default function BundlerAcademy() {
  const [loading, setLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [vipSelected, setVipSelected] = useState(true);
  const [hours, setHours] = useState(0);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [status, setStatus] = useState<string>('waiting');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const notifiedRef = useRef(false);
  const pollRef = useRef<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Single shared live-rate utility — VIP, Hour, checkout and receipts all use this.
  const { rate: solUsd, usdToSol } = useSolUsd();
  const solRate = solUsd ?? 0;
  const fmtSol = (usd: number) => usdToSol(usd, 4);

  // 1-on-1 hourly rate is SOL-canonical and depends on VIP selection
  const hourSol = vipSelected ? 1 : 2.5;
  const hoursUsd = solRate > 0 ? hours * hourSol * solRate : 0;
  const totalUsd = (vipSelected ? VIP_USD : 0) + hoursUsd;
  const totalSolDisplay = fmtSol(totalUsd);
  const canCheckout = totalUsd > 0 && !loading && (hours === 0 || solRate > 0);

  // ----- Dev 1-on-1 Training (SOL-canonical pricing) -----
  const TRAIN_SOL_STANDARD = 2.5;
  const TRAIN_SOL_LIFETIME = 1;
  const LIFETIME_COUPON = '112786';
  const [trainOpen, setTrainOpen] = useState(false);
  const [trainHours, setTrainHours] = useState(1);
  const [trainCoupon, setTrainCoupon] = useState('');
  const [trainLoading, setTrainLoading] = useState(false);
  const [trainPayment, setTrainPayment] = useState<Payment | null>(null);
  const [trainStatus, setTrainStatus] = useState<string>('waiting');
  const trainLifetime = trainCoupon.trim() === LIFETIME_COUPON;
  const trainRate = trainLifetime ? TRAIN_SOL_LIFETIME : TRAIN_SOL_STANDARD;
  const trainTotalSol = +(trainHours * trainRate).toFixed(4);

  const openTraining = () => {
    setTrainHours(1);
    setTrainCoupon('');
    setTrainPayment(null);
    setTrainStatus('waiting');
    setTrainOpen(true);
  };

  const startTraining = async () => {
    if (trainTotalSol <= 0) return;
    setTrainLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('nowpayments-create-invoice', {
        body: {
          action: 'create',
          price_amount: trainTotalSol,
          price_currency: 'sol',
          pay_currency: 'sol',
          order_description: `Warren Guru Dev 1-on-1 Training — ${trainHours}h${trainLifetime ? ' (Lifetime rate)' : ''}`,
        },
      });
      if (error) throw error;
      if (!data?.pay_address) throw new Error(data?.error || 'Could not create payment');
      setTrainPayment(data);
      setTrainStatus('waiting');
    } catch (e: any) {
      alert(`Payment error: ${e?.message || 'Could not start checkout'}`);
    } finally {
      setTrainLoading(false);
    }
  };

  // Poll training payment status
  useEffect(() => {
    if (!trainPayment?.payment_id) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { data } = await supabase.functions.invoke('nowpayments-create-invoice', {
          body: { action: 'status', payment_id: trainPayment.payment_id },
        });
        if (data?.payment_status && !stopped) setTrainStatus(data.payment_status);
      } catch {/* ignore */}
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [trainPayment?.payment_id]);

  const openBuilder = () => {
    setVipSelected(true);
    setHours(0);
    setPayment(null);
    setStatus('waiting');
    setTxHash(null);
    notifiedRef.current = false;
    setBuilderOpen(true);
  };

  const confirmCheckout = async () => {
    if (totalUsd <= 0) return;
    setLoading(true);
    try {
      const parts = [
        vipSelected ? 'VIP Access' : null,
        hours > 0 ? `${hours}× 1-on-1 Hour${hours > 1 ? 's' : ''}` : null,
      ].filter(Boolean).join(' + ');
      const { data, error } = await supabase.functions.invoke('nowpayments-create-invoice', {
        body: {
          action: 'create',
          price_amount: totalUsd,
          price_currency: 'usd',
          pay_currency: 'sol',
          order_description: `Warren Guru Bundler Academy — ${parts}`,
        },
      });
      if (error) throw error;
      if (!data?.pay_address) throw new Error(data?.error || 'Could not create payment');
      setPayment(data);
      setStatus('waiting');
    } catch (e: any) {
      alert(`Payment error: ${e?.message || 'Could not start checkout'}`);
    } finally {
      setLoading(false);
    }
  };

  // Poll for status while modal open
  useEffect(() => {
    if (!payment?.payment_id) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { data } = await supabase.functions.invoke('nowpayments-create-invoice', {
          body: { action: 'status', payment_id: payment.payment_id },
        });
        if (data?.payment_status && !stopped) setStatus(data.payment_status);
        if (data?.payin_hash && !stopped) setTxHash(data.payin_hash);
        if (data?.payment_status === 'finished' || data?.payment_status === 'confirmed') {
          if (!notifiedRef.current) {
            notifiedRef.current = true;
            markPurchasePending(data?.payin_hash || null);
            try {
              if ('Notification' in window) {
                if (Notification.permission === 'granted') {
                  new Notification('Payment Confirmed — Open your Discord ticket', {
                    body: 'Tap to join Warren Guru Discord and submit your Solscan receipt for verification.',
                  });
                } else if (Notification.permission !== 'denied') {
                  Notification.requestPermission().then((p) => {
                    if (p === 'granted') {
                      new Notification('Payment Confirmed — Open your Discord ticket', {
                        body: 'Tap to join Warren Guru Discord and submit your Solscan receipt for verification.',
                      });
                    }
                  });
                }
              }
            } catch { /* ignore */ }
          }
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      } catch { /* ignore */ }
    };
    tick();
    pollRef.current = window.setInterval(tick, 10000);
    return () => {
      stopped = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [payment?.payment_id]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  };

  const closeModal = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setPayment(null);
    setStatus('waiting');
    setBuilderOpen(false);
  };

  const startCheckout = openBuilder;


  return (
    <div className="relative min-h-screen bg-[#03060a] text-white selection:bg-emerald-400/20 overflow-hidden">
      <SEOHead
        title="Warren Guru — Crypto Rug Pulls, Token Launches & Launch Education"
        description="Learn crypto rug pull strategies, token launch mechanics, and Solana launch education. Join Warren Guru for private Discord access, premium training, and daily money-making opportunities."
        canonical="https://warren.guru"
        ogImage="https://warren.guru/images/og-crypto.png"
        keywords="crypto rug pulls, token launch, Solana education, crypto launches, rug pull strategies, launch education, Warren Guru, crypto community, Solana bundler, token lifecycle, wallet management"
      />

      {/* animated grid bg */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,255,136,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.4) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,255,136,0.08),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(0,180,255,0.06),transparent_60%)]" />

      {/* Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3.5">
          <Link to="/" className="flex flex-col leading-none">
            <span className="text-[9px] tracking-[0.3em] uppercase text-emerald-400/70">Warren</span>
            <span className="text-sm sm:text-base font-light tracking-[0.18em] uppercase text-white/90 -mt-0.5">GURU</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            {nav.map(n => (
              <a key={n.href} href={n.href} className="text-xs tracking-[0.15em] uppercase text-white/50 hover:text-emerald-300 transition-colors">{n.label}</a>
            ))}
            <a href="#how-it-works-video" className="text-xs tracking-[0.15em] uppercase text-white/50 hover:text-emerald-300 transition-colors">Video</a>
          </nav>
          <button
            onClick={startCheckout}
            className="group relative px-4 sm:px-5 py-2 rounded-full text-[11px] sm:text-xs tracking-[0.18em] uppercase font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-[0_0_24px_-4px_rgba(0,255,136,0.6)] hover:shadow-[0_0_36px_-2px_rgba(0,255,136,0.85)] transition-all"
          >
            Join Academy
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative pt-32 sm:pt-40 pb-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div initial="hidden" animate="visible" variants={fade}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.04] mb-6">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] tracking-[0.3em] uppercase text-emerald-300/80">Private Solana Academy</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
              Learn Solana Launch Strategy<br />
              <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">Before Everyone Else.</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-white/50 leading-relaxed max-w-xl">
              Private crypto education community teaching launch mechanics, wallet strategy, launch preparation, liquidity concepts, and market behavior analysis.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <button
                onClick={startCheckout}
                disabled={loading}
                className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 text-sm tracking-[0.15em] uppercase shadow-[0_0_30px_-5px_rgba(0,255,136,0.7)] hover:shadow-[0_0_45px_-3px_rgba(0,255,136,0.95)] transition-all disabled:opacity-60"
              >
                {loading ? 'Loading…' : 'Join For $999'}
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={openTraining}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 text-white/70 text-sm tracking-[0.15em] uppercase hover:border-emerald-400/40 hover:text-emerald-300 transition-all"
              >
                Dev 1 on 1 Training
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}>
            <HeroVisual />
          </motion.div>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="px-4 sm:px-6 py-12 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {trust.map((t, i) => (
            <motion.div
              key={t} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={i}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md px-5 py-5 text-center"
            >
              <Shield className="h-4 w-4 mx-auto text-emerald-300/70 mb-2" />
              <div className="text-xs sm:text-sm tracking-wider text-white/70">{t}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* BUNDLER SHOWCASE */}
      <section id="bundler" className="px-4 sm:px-6 py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} className="text-center mb-12">
            <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-400/60 mb-3">The Software</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Warren Guru <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">Bundler</span>
            </h2>
            <p className="mt-4 text-sm sm:text-base text-white/50 max-w-2xl mx-auto">
              The professional Solana launch terminal members use every day. Tokens, wallets, vanities, presets and blueprints — all in one premium UI.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
            className="relative rounded-3xl p-[1px] bg-gradient-to-br from-emerald-400/40 via-cyan-400/20 to-emerald-400/40 shadow-[0_0_80px_-15px_rgba(0,255,136,0.45)]"
          >
            <div className="rounded-3xl overflow-hidden bg-black/60 backdrop-blur-xl">
              <img
                src={bundlerScreenshot.url}
                alt="Warren Guru Bundler — Solana launch terminal with token chart, wallets and trading controls"
                className="w-full h-auto block"
                loading="lazy"
              />
            </div>
          </motion.div>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bundlerFeatures.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={fade} custom={i}
                className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-md p-5 hover:border-emerald-400/30 hover:bg-emerald-400/[0.03] transition-all duration-500"
              >
                <div className="text-2xl mb-3">{f.emoji}</div>
                <h3 className="text-sm font-semibold text-white/90 mb-1.5 tracking-wide">{f.title}</h3>
                <p className="text-xs text-white/45 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-center gap-5">
            <a
              href="https://discord.gg/warrenguru"
              target="_blank" rel="noopener noreferrer"
              className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 text-sm tracking-[0.18em] uppercase shadow-[0_0_30px_-5px_rgba(0,255,136,0.7)] hover:shadow-[0_0_50px_-3px_rgba(0,255,136,0.95)] transition-all"
            >
              <MessageCircle className="h-4 w-4" /> Download The Bundler
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                {/* Windows */}
                <svg className="h-12 w-12 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                {/* macOS */}
                <svg className="h-12 w-12 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              </div>
              <span className="text-[11px] tracking-[0.2em] uppercase text-white/40">Free to use · Available in Discord</span>
            </div>
          </div>
        </div>
      </section>

      {/* HOW BUNDLED LAUNCHES WORK */}
      <section id="how-bundling-works" className="px-4 sm:px-6 py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} className="text-center mb-14">
            <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-400/60 mb-3">The Mechanics</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              How <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">Bundled Launches</span> Work
            </h2>
            <p className="mt-4 text-sm sm:text-base text-white/50 max-w-2xl mx-auto">
              Atomic execution on Solana — token creation and buys land in the same block, before any sniper can react.
            </p>
          </motion.div>

          {/* Infographic */}
          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
            className="relative rounded-3xl p-[1px] bg-gradient-to-br from-purple-500/40 via-amber-400/20 to-red-500/40 shadow-[0_0_80px_-15px_rgba(168,85,247,0.45)] mb-14"
          >
            <div className="rounded-3xl overflow-hidden bg-black/60 backdrop-blur-xl">
              <img
                src={rugsInfographic.url}
                alt="Warren Guru VIP Members — how rugs work, why rugs happen, how we protect VIPs, and our VIP launch execution flow"
                className="w-full h-auto block"
                loading="lazy"
              />
            </div>
          </motion.div>

          {/* The simple version */}
          <div className="grid md:grid-cols-2 gap-5 mb-12">
            {[
              { n: '01', t: 'Create the token', d: 'Deployer wallet mints the new token on Solana.' },
              { n: '02', t: 'Prepare multi-wallet buys', d: 'Stage buy transactions from several wallets — this is where your liquidity goes.' },
              { n: '03', t: 'Send as one bundle', d: 'All transactions are submitted together as a single atomic bundle.' },
              { n: '04', t: 'Solana lands them in one block', d: 'The token gets created, your wallets instantly buy, and nobody can jump in between.' },
            ].map((step, i) => (
              <motion.div
                key={step.n}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={fade} custom={i}
                className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md p-6 hover:border-emerald-400/30 hover:bg-emerald-400/[0.03] transition-all duration-500"
              >
                <div className="flex items-start gap-4">
                  <div className="font-mono text-2xl font-bold bg-gradient-to-br from-emerald-300 to-cyan-300 bg-clip-text text-transparent shrink-0">{step.n}</div>
                  <div>
                    <h3 className="text-sm font-semibold text-white/90 tracking-wide mb-1.5">{step.t}</h3>
                    <p className="text-xs text-white/50 leading-relaxed">{step.d}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Typical bundled launch */}
          <div className="grid lg:grid-cols-2 gap-5 mb-12">
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={fade}
              className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.04] to-cyan-400/[0.02] p-7"
            >
              <p className="text-[10px] tracking-[0.3em] uppercase text-emerald-300/80 mb-4">A Typical Bundled Launch</p>
              <ul className="space-y-3 text-sm text-white/70">
                {[
                  '1 deployer wallet creates the token',
                  '5–20 wallets buy immediately',
                  'All buys happen in block 0',
                  'Price instantly moves up the bonding curve',
                  'Outsiders see volume + holders right away',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-emerald-300 mt-0.5 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={fade} custom={1}
              className="rounded-3xl border border-white/10 bg-white/[0.02] p-7"
            >
              <p className="text-[10px] tracking-[0.3em] uppercase text-white/60 mb-4">Why People Bundle</p>
              <ul className="space-y-3 text-sm text-white/70">
                {[
                  'Avoid sniper bots',
                  'Control early supply',
                  'Create instant momentum and FOMO',
                  'Make the chart look active immediately',
                  'Spread holdings across wallets instead of one giant wallet',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <p className="text-center text-xs tracking-[0.2em] uppercase text-white/40">
            Token created · Wallets buy · All in the same block — atomically
          </p>
        </div>
      </section>

      {/* WHAT MEMBERS GET */}
      <section id="membership" className="px-4 sm:px-6 py-24">

        <div className="max-w-6xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} className="text-center mb-14">
            <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-400/60 mb-3">Membership</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">What Members Get</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-5">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={fade} custom={i}
                className="group relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-xl p-7 hover:border-emerald-400/30 transition-all duration-500 overflow-hidden"
              >
                <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-emerald-400/0 via-cyan-400/0 to-emerald-400/0 group-hover:from-emerald-400/10 group-hover:via-cyan-400/5 group-hover:to-emerald-400/10 transition-all duration-500 pointer-events-none" />
                <div className="relative">
                  <div className="h-12 w-12 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mb-5 group-hover:bg-emerald-400/15 transition-colors">
                    <b.icon className="h-5 w-5 text-emerald-300" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-white/90 mb-2">{b.title}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">{b.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="community" className="px-4 sm:px-6 py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} className="text-center mb-14">
            <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-400/60 mb-3">The Path</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">How It Works</h2>
          </motion.div>
          <div className="grid md:grid-cols-4 gap-4 md:gap-6 relative">
            {steps.map((s, i) => (
              <motion.div
                key={s.n} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={i}
                className="relative rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md p-6"
              >
                <div className="text-[10px] tracking-[0.3em] text-emerald-400/60 font-mono">{s.n}</div>
                <h3 className="mt-3 text-base font-semibold text-white/90">{s.title}</h3>
                <p className="mt-2 text-xs text-white/40 leading-relaxed">{s.desc}</p>
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400/40" />
                )}
              </motion.div>
            ))}
          </div>

          {/* Video embed under step 01 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
            id="how-it-works-video"
            className="mt-10 scroll-mt-24"
          >
            <p className="text-[10px] tracking-[0.3em] uppercase text-emerald-400/60 mb-4 text-center">How It Works — This Video</p>
            <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/[0.08] bg-black shadow-[0_0_80px_-15px_rgba(0,255,136,0.25)]">
              <iframe
                src="https://www.youtube.com/embed/Tf4z5yVxnzk?rel=0&modestbranding=1"
                title="How It Works"
                className="absolute inset-0 w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="px-4 sm:px-6 py-24 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} className="text-center mb-12">
            <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-400/60 mb-3">Bundler Fees</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">Transparent Fee Structure</h2>
            <p className="mt-4 text-sm text-white/45 max-w-xl mx-auto">Use the bundler free with standard fees, or go fee-free with the Pro plan.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="rounded-3xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden mb-12"
          >
            <div className="grid grid-cols-3 px-6 py-4 border-b border-white/5 text-[10px] tracking-[0.25em] uppercase text-white/40">
              <div>Action</div>
              <div className="text-center">Free</div>
              <div className="text-center text-emerald-300/80">VIP · $999 Lifetime</div>
            </div>
            {feeRows.map((r, i) => (
              <div key={r.label} className={`grid grid-cols-3 px-6 py-4 text-sm ${i !== feeRows.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
                <div className="text-white/80">{r.label}</div>
                <div className="text-center text-white/50 font-mono">{r.free}</div>
                <div className="text-center text-emerald-300 font-mono">{r.pro}</div>
              </div>
            ))}
          </motion.div>

          <div className="text-center mb-12">
            <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-400/60 mb-3">Academy Membership</p>
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">One Membership. Full Access.</h3>
          </div>

          <div className="max-w-3xl mx-auto">

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} className="text-center mb-12">
            <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-400/60 mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">One Membership. Full Access.</h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
            className="relative rounded-3xl p-[1px] bg-gradient-to-br from-emerald-400/60 via-cyan-400/30 to-emerald-400/60"
          >
            <div className="rounded-3xl bg-[#04080d]/95 backdrop-blur-xl p-8 sm:p-10">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.05] mb-4">
                  <Sparkles className="h-3 w-3 text-emerald-300" />
                  <span className="text-[10px] tracking-[0.3em] uppercase text-emerald-300/80">VIP Access · Lifetime</span>
                </div>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">$999</span>
                  <span className="text-sm text-white/40 tracking-wider uppercase">One Time</span>
                </div>
                <div className="mt-2 text-[11px] tracking-[0.2em] uppercase text-emerald-300/70">Lifetime License</div>
              </div>

              <div className="mt-8 space-y-3 max-w-sm mx-auto">
                {[
                  'Discord Access',
                  'Premium Training',
                  'Community Access',
                  'Launch Education',
                  'Case Studies',
                  'Lifetime Warren Guru Bundler — No Fees',
                  'Daily Rug Pull Access',
                ].map(f => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3 text-emerald-300" />
                    </div>
                    <span className="text-sm text-white/70">{f}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={startCheckout}
                disabled={loading}
                className="mt-8 w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 text-sm tracking-[0.18em] uppercase shadow-[0_0_30px_-5px_rgba(0,255,136,0.7)] hover:shadow-[0_0_50px_-3px_rgba(0,255,136,0.95)] transition-all disabled:opacity-60"
              >
                {loading ? 'Generating Invoice…' : 'Pay With Solana'}
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="mt-6 pt-6 border-t border-white/5 text-center">
                <div className="text-xs tracking-[0.2em] uppercase text-white/40 mb-1">Add-On</div>
                <div className="text-sm text-white/70">1-on-1 Time · <span className="text-emerald-300">${HOUR_USD} / hour</span> · Add at checkout</div>
              </div>
            </div>
          </motion.div>
          </div>
        </div>
      </section>


      {/* FAQ */}
      <section id="faq" className="px-4 sm:px-6 py-24 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} className="text-center mb-12">
            <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-400/60 mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">Common Questions</h2>
          </motion.div>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <motion.div
                key={f.q} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={i}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-sm sm:text-base font-medium text-white/85">{f.q}</span>
                  <ChevronDown className={`h-4 w-4 text-emerald-300/70 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm text-white/50 leading-relaxed">{f.a}</div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="px-4 sm:px-6 py-12 border-t border-white/5">
        <div className="max-w-3xl mx-auto rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 text-center">
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 mb-3">Disclaimer</p>
          <p className="text-xs sm:text-sm text-white/40 leading-relaxed">
            Crypto markets involve risk. Educational purposes only. No guarantees of financial outcomes. Not investment advice.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5">
        {/* Discord CTA */}
        <div className="py-10 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-4 rounded-2xl border border-[#5865F2]/30 bg-[#5865F2]/[0.08] px-6 py-5 hover:bg-[#5865F2]/[0.14] hover:border-[#5865F2]/50 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-[#5865F2]/20 flex items-center justify-center shrink-0">
                  <MessageCircle className="h-5 w-5 text-[#5865F2]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90">Join the Warren Guru Discord</p>
                  <p className="text-xs text-white/45 mt-0.5">Get support, connect with the community, and download the bundler.</p>
                </div>
              </div>
              <div className="shrink-0 hidden sm:flex items-center gap-2 text-[#5865F2] text-xs font-medium group-hover:translate-x-1 transition-transform">
                Join Now <ArrowRight className="h-4 w-4" />
              </div>
            </a>
          </div>
        </div>

        {/* Footer links */}
        <div className="border-t border-white/5 py-10 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col leading-none">
              <span className="text-[9px] tracking-[0.3em] uppercase text-emerald-400/60">Warren</span>
              <span className="text-sm tracking-[0.18em] uppercase text-white/70 -mt-0.5">GURU</span>
            </div>
            <div className="flex items-center gap-5">
              <a href="https://discord.gg/warrenguru" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-emerald-300 transition-colors"><MessageCircle className="h-4 w-4" /></a>
              <a href="https://x.com/warrenguru" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-emerald-300 transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://youtube.com/@WarrenGuru" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-emerald-300 transition-colors"><Youtube className="h-4 w-4" /></a>
              <a href="mailto:support@warren.guru" className="text-white/40 hover:text-emerald-300 transition-colors"><Mail className="h-4 w-4" /></a>
            </div>
            <p className="text-[10px] tracking-wider text-white/25">© {new Date().getFullYear()} Warren Guru</p>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-4 inset-x-4 z-40">
        <button
          onClick={startCheckout}
          disabled={loading}
          className="w-full px-6 py-3.5 rounded-xl font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 text-xs tracking-[0.2em] uppercase shadow-[0_0_30px_-3px_rgba(0,255,136,0.8)] disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Join Academy · $999'}
        </button>
      </div>

      {/* In-app Solana payment modal */}
      <AnimatePresence>
        {(builderOpen || payment) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md px-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-[#0a0f14] to-[#04080c] p-6 sm:p-8 shadow-[0_0_80px_-10px_rgba(0,255,136,0.4)]"
            >
              <button onClick={closeModal} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>

              {!payment ? (
                <>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 mb-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[10px] tracking-[0.25em] uppercase text-white/70">Awaiting Payment</span>
                    </div>
                    <h3 className="text-xl font-semibold text-white">Build Your Order</h3>
                    <p className="text-xs text-white/40 mt-1">All payments are made in SOL.</p>
                  </div>

                  {/* VIP Access toggle */}
                  <button
                    onClick={() => setVipSelected(v => !v)}
                    className={`w-full text-left rounded-2xl border p-4 mb-3 transition-all ${
                      vipSelected
                        ? 'border-emerald-400/40 bg-emerald-400/[0.06] shadow-[0_0_24px_-8px_rgba(0,255,136,0.5)]'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                        vipSelected ? 'bg-emerald-400 border-emerald-400' : 'border-white/30'
                      }`}>
                        {vipSelected && <Check className="h-3.5 w-3.5 text-black" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white/90">VIP Access</span>
                          <div className="text-right">
                            <span className="font-mono text-emerald-300 text-sm">${VIP_USD}</span>
                            {solRate > 0 && <div className="text-[10px] text-white/40 font-mono">~{fmtSol(VIP_USD)} SOL</div>}
                          </div>
                        </div>
                        <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
                          Lifetime license · Discord, premium training, case studies, daily rug pulls, and the Warren Guru Bundler with zero fees.
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* 1-on-1 hours stepper */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white/90">1-on-1 Time</div>
                        <div className="text-[11px] text-white/45 mt-0.5">
                          <span className="font-mono text-emerald-300/90">{hourSol} SOL</span> / hour with Warren
                          {!vipSelected && <span className="text-white/30"> · VIP unlocks 1 SOL/hr</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setHours(h => Math.max(0, h - 1))}
                          disabled={hours <= 0}
                          className="h-8 w-8 rounded-lg border border-white/10 text-white/70 hover:border-emerald-400/40 hover:text-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >−</button>
                        <span className="w-8 text-center font-mono text-white/90">{hours}</span>
                        <button
                          onClick={() => setHours(h => Math.min(24, h + 1))}
                          className="h-8 w-8 rounded-lg border border-white/10 text-white/70 hover:border-emerald-400/40 hover:text-emerald-300 transition-all"
                        >+</button>
                      </div>
                    </div>
                    {hours > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
                        <span className="text-white/40">{hours} × {hourSol} SOL</span>
                        <span className="font-mono text-emerald-300">{(hours * hourSol).toFixed(2)} SOL</span>
                      </div>
                    )}
                  </div>

                  {/* Total */}
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 mb-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/80">Total</span>
                      <div className="text-right">
                        <span className="font-mono text-2xl font-bold text-white">${totalUsd.toLocaleString()}</span>
                        <div className="text-[11px] text-emerald-300/80 font-mono mt-0.5">{solRate > 0 ? `~${totalSolDisplay} SOL` : 'loading SOL rate…'}</div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={confirmCheckout}
                    disabled={!canCheckout}
                    className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 text-xs tracking-[0.2em] uppercase shadow-[0_0_30px_-5px_rgba(0,255,136,0.7)] hover:shadow-[0_0_50px_-3px_rgba(0,255,136,0.95)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Generate Invoice <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  {totalUsd <= 0 && (
                    <p className="mt-3 text-center text-[10px] text-white/40">Select VIP Access or add 1-on-1 hours to continue.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 mb-3">
                      <div className={`h-1.5 w-1.5 rounded-full ${
                        status === 'finished' || status === 'confirmed' ? 'bg-emerald-400' :
                        status === 'failed' || status === 'expired' ? 'bg-red-400' :
                        'bg-amber-400 animate-pulse'
                      }`} />
                      <span className="text-[10px] tracking-[0.25em] uppercase text-white/70">
                        {status === 'finished' || status === 'confirmed' ? 'Payment Confirmed' :
                         status === 'confirming' ? 'Confirming On-Chain' :
                         status === 'partially_paid' ? 'Partially Paid' :
                         status === 'failed' ? 'Payment Failed' :
                         status === 'expired' ? 'Payment Expired' :
                         'Awaiting Payment'}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold text-white">Pay with Solana</h3>
                    <p className="text-xs text-white/40 mt-1">Send the exact amount to the address below</p>
                  </div>

                  {status === 'finished' || status === 'confirmed' ? (
                    <div className="text-center py-6">
                      <div className="mx-auto h-16 w-16 rounded-full bg-emerald-400/15 border border-emerald-400/40 flex items-center justify-center mb-4">
                        <Check className="h-8 w-8 text-emerald-400" />
                      </div>
                      <p className="text-white/90 text-sm font-medium mb-1">Payment Confirmed</p>
                      <p className="text-white/50 text-xs mb-5">Open a verification ticket in Discord and paste your Solscan receipt below.</p>

                      {txHash && (
                        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 mb-4 text-left">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/70">Solscan Receipt</span>
                            <button onClick={() => copy(`https://solscan.io/tx/${txHash}`, 'rcpt')} className="text-white/40 hover:text-white">
                              {copied === 'rcpt' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <a
                            href={`https://solscan.io/tx/${txHash}`}
                            target="_blank" rel="noopener noreferrer"
                            className="font-mono text-[11px] text-emerald-300 hover:text-emerald-200 break-all underline-offset-2 hover:underline"
                          >
                            https://solscan.io/tx/{txHash}
                          </a>
                        </div>
                      )}

                      <div className="rounded-xl border border-white/10 bg-black/40 p-3 mb-4 text-left">
                        <p className="text-[11px] text-white/60 leading-relaxed">
                          <span className="text-white font-medium">Next step:</span> Join the Discord, open a
                          <span className="text-emerald-300"> #verify </span>ticket, and paste your Solscan receipt link to get your role assigned.
                        </p>
                      </div>

                      <a
                        href="https://discord.gg/warrenguru"
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs tracking-[0.2em] uppercase font-medium w-full justify-center"
                      >
                        <MessageCircle className="h-4 w-4" /> Open Ticket in Discord
                      </a>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-center mb-5">
                        <div className="rounded-2xl bg-white p-3">
                          <img
                            alt="Solana payment QR"
                            width={200} height={200}
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(`solana:${payment.pay_address}?amount=${payment.pay_amount}`)}`}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/40 p-3 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] tracking-[0.25em] uppercase text-white/40">Amount</span>
                          <button onClick={() => copy(String(payment.pay_amount), 'amt')} className="text-white/30 hover:text-white">
                            {copied === 'amt' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <div className="mt-1 font-mono text-emerald-300 text-lg">{payment.pay_amount} SOL</div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/40 p-3 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] tracking-[0.25em] uppercase text-white/40">Solana Address</span>
                          <button onClick={() => copy(payment.pay_address, 'addr')} className="text-white/30 hover:text-white">
                            {copied === 'addr' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-white/80 break-all">{payment.pay_address}</div>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-[11px] text-white/40 mb-3">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Waiting for on-chain confirmation…</span>
                      </div>

                      <button
                        onClick={() => { setPayment(null); setStatus('waiting'); setBuilderOpen(true); }}
                        className="w-full text-[11px] tracking-[0.2em] uppercase text-white/50 hover:text-emerald-300 border border-white/10 hover:border-emerald-400/30 rounded-xl py-2.5 transition-all"
                      >
                        ← Edit Order / Add 1-on-1 Time
                      </button>

                      <p className="mt-3 text-center text-[10px] text-white/30 leading-relaxed">
                        Send exactly the amount shown. Payment auto-confirms once the network sees it.
                      </p>
                    </>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DEV 1-ON-1 TRAINING MODAL */}
      <AnimatePresence>
        {trainOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => !trainLoading && setTrainOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-black to-emerald-950/20 p-6 shadow-[0_0_60px_-10px_rgba(0,255,136,0.3)]"
            >
              <button
                onClick={() => setTrainOpen(false)}
                className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 mb-3">
                  <Sparkles className="h-3 w-3 text-emerald-300" />
                  <span className="text-[10px] tracking-[0.25em] uppercase text-emerald-300">Live 1-on-1</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Dev 1 on 1 Training</h2>
                <p className="mt-1.5 text-sm text-white/50">Private screen-share session with Warren.</p>
              </div>

              {!trainPayment ? (
                <>
                  {/* Hours */}
                  <div className="mb-4">
                    <label className="text-[10px] tracking-[0.25em] uppercase text-white/40 mb-2 block">Hours</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setTrainHours(Math.max(1, trainHours - 1))}
                        className="h-10 w-10 rounded-lg border border-white/10 hover:border-emerald-400/40 text-white/60 hover:text-emerald-300 transition-all"
                      >−</button>
                      <div className="flex-1 text-center font-mono text-xl text-white">{trainHours}</div>
                      <button
                        onClick={() => setTrainHours(Math.min(12, trainHours + 1))}
                        className="h-10 w-10 rounded-lg border border-white/10 hover:border-emerald-400/40 text-white/60 hover:text-emerald-300 transition-all"
                      >+</button>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="mb-5">
                    <label className="text-[10px] tracking-[0.25em] uppercase text-white/40 mb-2 block">Lifetime Member Coupon (optional)</label>
                    <input
                      type="text"
                      value={trainCoupon}
                      onChange={(e) => setTrainCoupon(e.target.value)}
                      placeholder="Enter coupon code"
                      className={`w-full px-4 py-2.5 bg-white/[0.04] border rounded-lg text-sm text-white placeholder:text-white/20 focus:outline-none transition-colors font-mono ${
                        trainLifetime ? 'border-emerald-400/50 focus:border-emerald-400/80' : 'border-white/10 focus:border-white/30'
                      }`}
                    />
                    {trainLifetime && (
                      <p className="mt-1.5 text-[11px] text-emerald-300/90">✓ Lifetime rate unlocked — 1 SOL/hour</p>
                    )}
                  </div>

                  {/* Rate + Total */}
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 mb-5 space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Rate</span>
                      <span className="text-white font-mono">
                        {trainRate} SOL / hour
                        {trainLifetime && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-300/80">Lifetime</span>}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">{trainHours} × {trainRate} SOL</span>
                      <span className="text-white/70 font-mono">{trainTotalSol} SOL</span>
                    </div>
                    <div className="h-px bg-white/[0.06]" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs tracking-[0.2em] uppercase text-white/40">Total</span>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-emerald-300 font-mono">{trainTotalSol} SOL</div>
                        {solRate > 0 && (
                          <div className="text-[10px] text-white/40 font-mono">≈ ${(trainTotalSol * solRate).toFixed(2)} USD</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={startTraining}
                    disabled={trainLoading || trainTotalSol <= 0}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 text-sm tracking-[0.15em] uppercase shadow-[0_0_30px_-5px_rgba(0,255,136,0.7)] hover:shadow-[0_0_45px_-3px_rgba(0,255,136,0.95)] transition-all disabled:opacity-60"
                  >
                    {trainLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Pay {trainTotalSol} SOL <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <p className="mt-3 text-center text-[10px] text-white/30 tracking-wider uppercase">Secure Solana checkout via NOWPayments</p>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
                    <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/80 mb-1">Send Exactly</div>
                    <div className="text-2xl font-bold text-emerald-300 font-mono">{trainPayment.pay_amount} SOL</div>
                    <div className="text-[10px] text-white/40 mt-1">Network: Solana</div>
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.25em] uppercase text-white/40 mb-1.5">Pay Address</div>
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <code className="flex-1 text-[11px] text-white/80 font-mono break-all">{trainPayment.pay_address}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(trainPayment.pay_address); }}
                        className="text-white/40 hover:text-emerald-300 transition-colors"
                      ><Copy className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />
                    Status: <span className="font-mono text-emerald-300">{trainStatus}</span>
                  </div>
                  {(trainStatus === 'finished' || trainStatus === 'confirmed') && (
                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 space-y-3">
                      <div className="text-sm font-semibold text-emerald-200">✓ Payment confirmed</div>
                      <div className="text-xs text-white/70 leading-relaxed">
                        Next, <span className="text-emerald-300 font-medium">book your 1-on-1 session</span> on Calendly, then <span className="text-emerald-300 font-medium">open a ticket in Discord</span> so Warren is ready for you.
                      </div>
                      <a
                        href="https://calendly.com/warrensappt/xit"
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-400 text-black text-xs font-semibold tracking-[0.15em] uppercase hover:bg-emerald-300 transition-all"
                      >
                        Book Session on Calendly <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href="https://discord.gg/warrenguru"
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#5865F2]/15 border border-[#5865F2]/30 text-[#a5adf7] hover:bg-[#5865F2]/25 text-xs font-medium tracking-[0.15em] uppercase transition-all"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> Open Ticket in Discord
                      </a>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll to top */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll to top"
            className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full border border-emerald-400/30 bg-black/70 backdrop-blur-xl text-emerald-300 hover:text-black hover:bg-emerald-400 hover:border-emerald-400 shadow-[0_0_30px_-5px_rgba(0,255,136,0.6)] flex items-center justify-center transition-colors"
          >
            <ChevronUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>

    </div>
  );
}
