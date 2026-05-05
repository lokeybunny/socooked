import { Phone } from 'lucide-react';
import { motion } from 'framer-motion';

interface FloatingCallButtonProps {
  /** Tel number in E.164 (defaults to cell). */
  phone?: string;
  variant?: 'emerald' | 'cyan';
}

const styles = {
  emerald: 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/40 hover:from-emerald-400 hover:to-emerald-500',
  cyan: 'bg-gradient-to-r from-cyan-500 to-teal-500 shadow-cyan-500/40 hover:from-cyan-400 hover:to-teal-400',
};

/**
 * Mobile-only floating quick-call button.
 * Hidden on md+ screens — only shows on phones so users can call while scrolling.
 */
export default function FloatingCallButton({
  phone = '+14802200405',
  variant = 'emerald',
}: FloatingCallButtonProps) {
  return (
    <motion.a
      href={`tel:${phone}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.6, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className={`md:hidden fixed bottom-6 left-5 z-50 flex items-center justify-center h-12 w-12 rounded-full text-black shadow-lg active:scale-95 transition-all duration-300 ${styles[variant]}`}
      aria-label={`Call ${phone}`}
    >
      <Phone className="h-5 w-5" />
    </motion.a>
  );
}
