import { useNavigate } from 'react-router-dom';
import { Mail, CheckCircle, ArrowLeft, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMetaPixel } from '@/hooks/useMetaPixel';

export default function ThankYouVideography() {
  const navigate = useNavigate();
  useMetaPixel('945218684863625');

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 pointer-events-none opacity-[0.02] z-0">
        <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />
      </div>

      <header className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 md:py-5 relative z-30">
        <button onClick={() => navigate('/videography')} className="flex items-center gap-2 group">
          <ArrowLeft className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
          <span className="text-foreground/70 font-light text-base sm:text-lg tracking-[0.15em] uppercase">Back</span>
        </button>
      </header>

      <main className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-8 sm:pt-16 pb-20">
        <motion.div className="max-w-lg w-full text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="text-[9px] sm:text-[10px] md:text-xs tracking-[0.3em] sm:tracking-[0.4em] uppercase text-muted-foreground/60 mb-3">Videography Services</p>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-2">Thank You for Reaching Out!</h1>
          <p className="text-xs sm:text-sm text-muted-foreground/60 font-light mb-10 sm:mb-14">We've received your request. Here's what happens next.</p>
        </motion.div>

        <div className="max-w-md w-full flex flex-col gap-4 sm:gap-5">
          {[
            { icon: Mail, n: 1, title: 'Check Your Inbox', desc: "We've sent a confirmation email with details about your inquiry." },
            { icon: Phone, n: 2, title: "We'll Be in Touch", desc: 'Our team will reach out within 24 hours to discuss your project.' },
            { icon: CheckCircle, n: 3, title: "You're All Set", desc: "Sit back and relax — we'll handle the rest." },
          ].map(({ icon: Icon, n, title, desc }, i) => (
            <motion.div key={n} className="glass-card p-5 sm:p-6 flex items-start gap-4 sm:gap-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }}>
              <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-muted/50 flex items-center justify-center">
                <Icon className="h-4 w-4 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] sm:text-xs font-mono text-muted-foreground/40">{String(n).padStart(2, '0')}</span>
                  <h3 className="text-xs sm:text-sm tracking-wide uppercase font-light text-foreground">{title}</h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground/60 leading-relaxed font-light">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 px-4 sm:px-6 md:px-12 py-3 sm:py-4 flex items-center justify-between">
        <p className="text-[8px] sm:text-[9px] tracking-[0.2em] uppercase text-muted-foreground/30">GURU</p>
        <p className="text-[8px] sm:text-[9px] text-muted-foreground/30">&copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
