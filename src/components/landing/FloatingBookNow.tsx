import { CalendarCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function FloatingBookNow() {
  const handleClick = () => {
    const el = document.getElementById('get-started');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.5, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="fixed bottom-6 right-20 z-50 flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-black text-xs sm:text-sm font-semibold tracking-[0.15em] uppercase shadow-lg shadow-emerald-500/30 hover:from-emerald-400 hover:to-emerald-500 hover:shadow-emerald-500/40 hover:scale-105 transition-all duration-300"
      aria-label="Book Now"
    >
      <CalendarCheck className="h-4 w-4" />
      Book Now
    </motion.button>
  );
}
