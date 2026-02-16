import { useState } from 'react';
import { Briefcase, X, Globe, Share2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Web Dev images
import web1 from '@/assets/portfolio/web-1.jpg';
import web2 from '@/assets/portfolio/web-2.jpg';
import web3 from '@/assets/portfolio/web-3.jpg';
import web4 from '@/assets/portfolio/web-4.jpg';
import web5 from '@/assets/portfolio/web-5.jpg';
import web6 from '@/assets/portfolio/web-6.jpg';

// Brand logos
import brand1 from '@/assets/portfolio/brand-1.jpg';
import brand2 from '@/assets/portfolio/brand-2.jpg';
import brand3 from '@/assets/portfolio/brand-3.jpg';
import brand4 from '@/assets/portfolio/brand-4.jpg';
import brand5 from '@/assets/portfolio/brand-5.jpg';
import brand6 from '@/assets/portfolio/brand-6.jpg';

const webProjects = [
  { img: web1, title: 'Luxury E-Commerce', desc: 'Premium storefront with editorial aesthetic and seamless checkout flow.' },
  { img: web2, title: 'SaaS Dashboard', desc: 'Real-time analytics platform with intuitive data visualization.' },
  { img: web3, title: 'Restaurant Platform', desc: 'Reservation and ordering system with warm, inviting brand identity.' },
  { img: web4, title: 'Fitness Landing', desc: 'High-energy landing page with bold typography and conversion focus.' },
  { img: web5, title: 'Real Estate Portal', desc: 'Property listing platform with interactive maps and search filters.' },
  { img: web6, title: 'Agency Portfolio', desc: 'Minimalist creative agency site with editorial photography layout.' },
];

const socialBrands = [
  { img: brand1, name: 'Oro Roasters', link: 'https://instagram.com' },
  { img: brand2, name: 'Lasilluny', link: 'https://instagram.com' },
  { img: brand3, name: 'NovaTech', link: 'https://facebook.com' },
  { img: brand4, name: 'Serene Spa', link: 'https://instagram.com' },
  { img: brand5, name: 'FoodDash', link: 'https://facebook.com' },
  { img: brand6, name: 'WaveStudio', link: 'https://instagram.com' },
];

type TabId = 'web' | 'social';

export default function PortfolioModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('web');
  const [detailProject, setDetailProject] = useState<typeof webProjects[0] | null>(null);

  const tabs: { id: TabId; label: string; icon: typeof Globe }[] = [
    { id: 'web', label: 'Web Dev', icon: Globe },
    { id: 'social', label: 'Social Media', icon: Share2 },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-full border border-foreground/10 bg-foreground/5 backdrop-blur-sm text-muted-foreground/60 hover:text-foreground hover:border-foreground/30 hover:bg-foreground/10 transition-all duration-300"
        aria-label="View portfolio"
      >
        <Briefcase className="h-3.5 w-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => { setOpen(false); setDetailProject(null); }}
            />
            <motion.div
              className="fixed inset-0 z-[70] flex items-center justify-center px-4 sm:px-8 pointer-events-none"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="glass-card p-5 sm:p-8 w-full max-w-md sm:max-w-2xl pointer-events-auto relative max-h-[85vh] overflow-y-auto">
                <button
                  onClick={() => { setOpen(false); setDetailProject(null); }}
                  className="absolute top-4 right-4 text-muted-foreground/40 hover:text-foreground transition-colors duration-300 z-10"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 className="text-xs sm:text-sm tracking-[0.25em] uppercase font-light text-foreground mb-5 text-center">
                  Our Work
                </h2>

                {/* Tabs */}
                <div className="flex justify-center gap-1 mb-6">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setDetailProject(null); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] sm:text-xs tracking-wider uppercase transition-all duration-300 ${
                          isActive
                            ? 'bg-foreground/10 text-foreground border border-foreground/20'
                            : 'text-muted-foreground/50 hover:text-muted-foreground border border-transparent'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Content */}
                <AnimatePresence mode="wait">
                  {activeTab === 'web' && (
                    <motion.div
                      key="web"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3"
                    >
                      {webProjects.map((project, i) => (
                        <motion.button
                          key={i}
                          onClick={() => setDetailProject(project)}
                          className="group relative rounded-lg overflow-hidden aspect-[3/2] bg-muted/20 border border-foreground/5 hover:border-foreground/20 transition-all duration-300"
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <img
                            src={project.img}
                            alt={project.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2 sm:p-3">
                            <span className="text-[9px] sm:text-[10px] tracking-wider uppercase text-white/90 font-light">
                              {project.title}
                            </span>
                          </div>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}

                  {activeTab === 'social' && (
                    <motion.div
                      key="social"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-3"
                    >
                      {socialBrands.map((brand, i) => (
                        <a
                          key={i}
                          href={brand.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative rounded-lg overflow-hidden aspect-square bg-muted/20 border border-foreground/5 hover:border-foreground/20 transition-all duration-300 block"
                        >
                          <img
                            src={brand.img}
                            alt={brand.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-1">
                            <ExternalLink className="h-3.5 w-3.5 text-white/80" />
                            <span className="text-[8px] sm:text-[9px] tracking-wider uppercase text-white/70 font-light">
                              {brand.name}
                            </span>
                          </div>
                        </a>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Detail popup for web projects */}
      <AnimatePresence>
        {detailProject && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setDetailProject(null)}
            />
            <motion.div
              className="fixed inset-0 z-[90] flex items-center justify-center px-4 sm:px-8 pointer-events-none"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="glass-card p-0 w-full max-w-sm sm:max-w-lg pointer-events-auto relative overflow-hidden">
                <button
                  onClick={() => setDetailProject(null)}
                  className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white transition-colors duration-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <img
                  src={detailProject.img}
                  alt={detailProject.title}
                  className="w-full aspect-[16/10] object-cover"
                />
                <div className="p-5 sm:p-6 space-y-2">
                  <h3 className="text-xs sm:text-sm tracking-[0.2em] uppercase font-light text-foreground">
                    {detailProject.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground/60 leading-relaxed font-light">
                    {detailProject.desc}
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
