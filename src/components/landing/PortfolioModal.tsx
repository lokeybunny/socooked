import { useState } from 'react';
import { Briefcase, X, Globe, Pen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';

// Web Dev images
import web1 from '@/assets/portfolio/web-1.jpg';
import web2 from '@/assets/portfolio/web-2.jpg';
import web3 from '@/assets/portfolio/web-3.jpg';
import web4 from '@/assets/portfolio/web-4.jpg';
import web5 from '@/assets/portfolio/web-5.jpg';
import web6 from '@/assets/portfolio/web-6.jpg';

// Brand logos — dark
import brand1Dark from '@/assets/portfolio/brand-1.jpg';
import brand2Dark from '@/assets/portfolio/brand-2.jpg';
import brand3Dark from '@/assets/portfolio/brand-3.jpg';
import brand4Dark from '@/assets/portfolio/brand-4.jpg';
import brand5Dark from '@/assets/portfolio/brand-5.jpg';
import brand6Dark from '@/assets/portfolio/brand-6.jpg';

// Brand logos — light
import brand1Light from '@/assets/portfolio/brand-1-light.jpg';
import brand2Light from '@/assets/portfolio/brand-2-light.jpg';
import brand3Light from '@/assets/portfolio/brand-3-light.jpg';
import brand4Light from '@/assets/portfolio/brand-4-light.jpg';
import brand5Light from '@/assets/portfolio/brand-5-light.jpg';
import brand6Light from '@/assets/portfolio/brand-6-light.jpg';

const webProjects = [
  { img: web1, title: 'Luxury E-Commerce', desc: 'Premium storefront with editorial aesthetic and seamless checkout flow.' },
  { img: web2, title: 'SaaS Dashboard', desc: 'Real-time analytics platform with intuitive data visualization.' },
  { img: web3, title: 'Restaurant Platform', desc: 'Reservation and ordering system with warm, inviting brand identity.' },
  { img: web4, title: 'Fitness Landing', desc: 'High-energy landing page with bold typography and conversion focus.' },
  { img: web5, title: 'Real Estate Portal', desc: 'Property listing platform with interactive maps and search filters.' },
  { img: web6, title: 'Agency Portfolio', desc: 'Minimalist creative agency site with editorial photography layout.' },
];

const logoNames = ['Oro Roasters', 'Lasilluny', 'NovaTech', 'Serene Spa', 'FoodDash', 'WaveStudio'];
const logoDark = [brand1Dark, brand2Dark, brand3Dark, brand4Dark, brand5Dark, brand6Dark];
const logoLight = [brand1Light, brand2Light, brand3Light, brand4Light, brand5Light, brand6Light];

type TabId = 'web' | 'logos';

export default function PortfolioModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('web');
  const [detailProject, setDetailProject] = useState<typeof webProjects[0] | null>(null);
  const [detailLogo, setDetailLogo] = useState<{ img: string; name: string } | null>(null);
  const { theme } = useTheme();

  const logoImages = theme === 'dark' ? logoDark : logoLight;
  const logoDesigns = logoNames.map((name, i) => ({ img: logoImages[i], name }));

  const tabs: { id: TabId; label: string; icon: typeof Globe }[] = [
    { id: 'web', label: 'Web Dev', icon: Globe },
    { id: 'logos', label: 'Logo Design', icon: Pen },
  ];

  const closeAll = () => { setOpen(false); setDetailProject(null); setDetailLogo(null); };
  const switchTab = (id: TabId) => { setActiveTab(id); setDetailProject(null); setDetailLogo(null); };

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
              onClick={closeAll}
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
                  onClick={closeAll}
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
                        onClick={() => switchTab(tab.id)}
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

                  {activeTab === 'logos' && (
                    <motion.div
                      key="logos"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-3"
                    >
                      {logoDesigns.map((logo, i) => (
                        <motion.button
                          key={i}
                          onClick={() => setDetailLogo(logo)}
                          className="group relative rounded-lg overflow-hidden aspect-square bg-muted/20 border border-foreground/5 hover:border-foreground/20 transition-all duration-300"
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <img
                            src={logo.img}
                            alt={logo.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <span className="text-[8px] sm:text-[9px] tracking-wider uppercase text-white/70 font-light">
                              {logo.name}
                            </span>
                          </div>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Full-screen detail popup for web projects */}
      <AnimatePresence>
        {detailProject && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setDetailProject(null)}
            />
            <motion.div
              className="fixed inset-0 z-[90] flex flex-col items-center justify-center p-4 sm:p-8 pointer-events-none"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="pointer-events-auto relative w-full max-w-5xl">
                <button
                  onClick={() => setDetailProject(null)}
                  className="absolute -top-2 -right-2 sm:top-3 sm:right-3 z-10 p-2 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors duration-300"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
                <img
                  src={detailProject.img}
                  alt={detailProject.title}
                  className="w-full rounded-lg shadow-2xl object-contain max-h-[70vh]"
                />
                <div className="mt-4 text-center space-y-1.5">
                  <h3 className="text-xs sm:text-sm tracking-[0.2em] uppercase font-light text-white">
                    {detailProject.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-white/50 leading-relaxed font-light max-w-md mx-auto">
                    {detailProject.desc}
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Full-screen detail popup for logo designs */}
      <AnimatePresence>
        {detailLogo && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setDetailLogo(null)}
            />
            <motion.div
              className="fixed inset-0 z-[90] flex items-center justify-center px-4 sm:px-8 pointer-events-none"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="pointer-events-auto relative">
                <button
                  onClick={() => setDetailLogo(null)}
                  className="absolute -top-3 -right-3 z-10 p-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white transition-colors duration-300"
                >
                  <X className="h-4 w-4" />
                </button>
                <img
                  src={detailLogo.img}
                  alt={detailLogo.name}
                  className="max-w-[80vw] max-h-[80vh] rounded-lg shadow-2xl object-contain"
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
