import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Mail, Settings, Key, CheckCircle, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

const steps = [
  {
    icon: Mail,
    number: 1,
    title: 'Check Your Email',
    description: "We've sent your license key to the email address used during checkout. Check your inbox (and spam folder, just in case).",
  },
  {
    icon: Settings,
    number: 2,
    title: 'Open the License Widget',
    description: 'Launch FrogLabs Terminal and click the settings gear on the License widget.',
  },
  {
    icon: Key,
    number: 3,
    title: 'Enter Your License Key',
    description: 'Paste your license key into the "License Key" field, then click Save.',
  },
  {
    icon: CheckCircle,
    number: 4,
    title: "You're All Set",
    description: 'Once activated you will pay no fees!',
  },
];

export default function ThankYou() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Subtle grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02] z-0">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      {/* Nav */}
      <header className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 md:py-5 relative z-30">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 group">
          <ArrowLeft className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
          <div className="flex flex-col leading-none">
            <span className="text-foreground/40 font-light text-[9px] sm:text-[10px] md:text-xs tracking-[0.25em] uppercase">Warren</span>
            <span className="text-foreground/70 font-light text-base sm:text-lg md:text-xl tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
        </button>
        <ThemeToggle />
      </header>

      {/* Content */}
      <main className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-8 sm:pt-16 pb-20">
        <motion.div
          className="max-w-lg w-full text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[9px] sm:text-[10px] md:text-xs tracking-[0.3em] sm:tracking-[0.4em] uppercase text-muted-foreground/60 mb-3">
            FrogLabs Terminal
          </p>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-2">
            Thank You for Your Purchase!
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground/60 font-light mb-10 sm:mb-14">
            Follow these steps to activate your license and start using FrogLabs Terminal.
          </p>
        </motion.div>

        <div className="max-w-md w-full flex flex-col gap-4 sm:gap-5">
          {steps.map(({ icon: Icon, number, title, description }, i) => (
            <motion.div
              key={number}
              className="glass-card p-5 sm:p-6 flex items-start gap-4 sm:gap-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }}
            >
              <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-muted/50 flex items-center justify-center">
                <Icon className="h-4 w-4 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] sm:text-xs font-mono text-muted-foreground/40">{String(number).padStart(2, '0')}</span>
                  <h3 className="text-xs sm:text-sm tracking-wide uppercase font-light text-foreground">{title}</h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground/60 leading-relaxed font-light">{description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Discord CTA */}
        <motion.div
          className="mt-10 sm:mt-14 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          <p className="text-xs sm:text-sm text-muted-foreground/40 font-light">
            Need help?{' '}
            <a
              href="https://discord.gg/your-discord"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 hover:text-foreground underline underline-offset-4 transition-colors duration-300"
            >
              Join our Discord
            </a>{' '}
            for support.
          </p>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-4 sm:px-6 md:px-12 py-3 sm:py-4 flex items-center justify-between">
        <p className="text-[8px] sm:text-[9px] tracking-[0.2em] uppercase text-muted-foreground/30">GURU</p>
        <p className="text-[8px] sm:text-[9px] text-muted-foreground/30">&copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
