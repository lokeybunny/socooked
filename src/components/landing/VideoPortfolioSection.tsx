import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Film } from 'lucide-react';

import wedding1 from '@/assets/video-portfolio/wedding-1.jpg';
import wedding2 from '@/assets/video-portfolio/wedding-2.jpg';
import funeral1 from '@/assets/video-portfolio/funeral-1.jpg';
import event1 from '@/assets/video-portfolio/event-1.jpg';
import event2 from '@/assets/video-portfolio/event-2.jpg';
import event3 from '@/assets/video-portfolio/event-3.jpg';

const portfolioItems = [
  { img: wedding1, title: 'Las Vegas Wedding Ceremony', category: 'Wedding', desc: 'Full multi-camera coverage at a luxury Las Vegas venue — every vow captured in cinematic 4K.' },
  { img: wedding2, title: 'Sunset Reception on the Strip', category: 'Wedding', desc: 'Outdoor reception with the Vegas skyline glowing behind — streamed live to 200+ remote guests.' },
  { img: funeral1, title: 'Celebration of Life Memorial', category: 'Memorial', desc: 'Dignified, respectful broadcast allowing distant family members to grieve together in real time.' },
  { img: event1, title: 'Corporate Gala Production', category: 'Events', desc: 'Multi-camera live production for a 1,000-guest corporate awards ceremony on the Las Vegas Strip.' },
  { img: event2, title: 'Birthday Celebration', category: 'Events', desc: 'High-energy birthday party coverage with confetti, neon lights, and same-day highlight reel delivery.' },
  { img: event3, title: 'Live Concert & Music Events', category: 'Events', desc: 'Professional jib and crane coverage for Las Vegas concerts — broadcast-quality from every angle.' },
];

const fade = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] },
  }),
};

export default function VideoPortfolioSection() {
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

  return (
    <>
      <section className="py-24 px-6 border-t border-emerald-500/[0.08]">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={0} className="flex items-center justify-center gap-2 mb-5">
            <Film className="h-4 w-4 text-emerald-400/50" />
            <p className="text-xs tracking-[0.4em] uppercase text-emerald-400/50">Behind The Scenes</p>
          </motion.div>
          <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={1} className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-4">
            Real Events. <span className="text-emerald-400">Real Moments.</span>
          </motion.h2>
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fade} custom={2} className="text-white/35 text-center max-w-xl mx-auto mb-14 text-sm sm:text-base leading-relaxed">
            From Las Vegas weddings to memorial services and corporate galas — see how we capture every moment with broadcast-quality precision.
          </motion.p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {portfolioItems.map((item, i) => (
              <motion.button
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-30px' }}
                variants={fade}
                custom={i + 3}
                onClick={() => setDetailIndex(i)}
                className="group relative rounded-xl overflow-hidden aspect-[3/2] bg-black/40 border border-emerald-500/[0.06] hover:border-emerald-500/20 transition-all duration-500"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <img
                  src={item.img}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loading="lazy"
                  width={896}
                  height={576}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400 flex flex-col items-start justify-end p-3 sm:p-4">
                  <span className="text-[8px] sm:text-[9px] tracking-[0.3em] uppercase text-emerald-400/70 mb-1">{item.category}</span>
                  <span className="text-[10px] sm:text-xs tracking-wider text-white/90 font-medium leading-tight">{item.title}</span>
                </div>
                {/* BTS badge */}
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm border border-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="text-[7px] sm:text-[8px] tracking-[0.2em] uppercase text-emerald-400/80">BTS</span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {detailIndex !== null && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailIndex(null)}
            />
            <motion.div
              className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-8 pointer-events-none"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <button
                onClick={() => setDetailIndex((detailIndex - 1 + portfolioItems.length) % portfolioItems.length)}
                className="pointer-events-auto absolute left-2 sm:left-6 p-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/20 transition-all"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="pointer-events-auto relative w-full max-w-4xl">
                <button
                  onClick={() => setDetailIndex(null)}
                  className="absolute -top-2 -right-2 sm:top-3 sm:right-3 z-10 p-2 rounded-full bg-black/60 backdrop-blur-sm text-white/50 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
                <img
                  src={portfolioItems[detailIndex].img}
                  alt={portfolioItems[detailIndex].title}
                  className="w-full rounded-xl shadow-2xl shadow-emerald-500/5 object-contain max-h-[70vh]"
                />
                <div className="mt-5 text-center space-y-2">
                  <span className="text-[9px] tracking-[0.3em] uppercase text-emerald-400/50">{portfolioItems[detailIndex].category}</span>
                  <h3 className="text-sm sm:text-base tracking-[0.15em] uppercase font-medium text-white/90">
                    {portfolioItems[detailIndex].title}
                  </h3>
                  <p className="text-xs sm:text-sm text-white/40 leading-relaxed max-w-lg mx-auto">
                    {portfolioItems[detailIndex].desc}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setDetailIndex((detailIndex + 1) % portfolioItems.length)}
                className="pointer-events-auto absolute right-2 sm:right-6 p-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/20 transition-all"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
