import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Section = { id: string; label: string };

const sections: Section[] = [
  { id: 'top', label: 'Top' },
  { id: 'demos', label: 'Demos' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'pricing-faq', label: 'FAQ' },
  { id: 'why', label: 'Why Us' },
  { id: 'contact', label: 'Contact' },
];

export default function MobileSectionMenu() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 200);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="md:hidden">
      <AnimatePresence>
        {visible && (
          <motion.button
            key="trigger"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setOpen(true)}
            aria-label="Open quick navigation"
            className="fixed bottom-6 left-4 z-40 p-3.5 rounded-full border-2 border-foreground/20 bg-background/80 backdrop-blur-md text-foreground/80 hover:text-foreground shadow-lg"
          >
            <Menu className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border rounded-t-3xl p-5 pb-8"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground">Jump To</span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="p-2 rounded-full hover:bg-muted text-foreground/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => jump(s.id)}
                    className="px-4 py-4 text-sm font-medium rounded-2xl bg-muted/50 hover:bg-muted text-foreground text-left tracking-wide"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
