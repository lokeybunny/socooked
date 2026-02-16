import { useState } from 'react';
import { Briefcase, X, Globe, Share2, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const tabs = [
  {
    id: 'web',
    label: 'Web Dev',
    icon: Globe,
    items: [
      { title: 'E-Commerce Platform', desc: 'Full-stack storefront with real-time inventory and Stripe integration.' },
      { title: 'SaaS Dashboard', desc: 'Analytics dashboard with role-based access and live data visualization.' },
      { title: 'Portfolio CMS', desc: 'Headless CMS-powered site with dynamic content and SEO optimization.' },
    ],
  },
  {
    id: 'social',
    label: 'Social Media',
    icon: Share2,
    items: [
      { title: 'Brand Launch Campaign', desc: 'Multi-platform rollout generating 200k+ impressions in the first week.' },
      { title: 'Content Strategy', desc: 'Monthly content calendar with engagement-driven storytelling.' },
      { title: 'Community Growth', desc: 'Organic audience growth from 0 to 15k followers in 90 days.' },
    ],
  },
  {
    id: 'uiux',
    label: 'UI/UX',
    icon: Palette,
    items: [
      { title: 'Mobile Banking App', desc: 'Intuitive fintech interface with accessibility-first design principles.' },
      { title: 'Health & Wellness Platform', desc: 'User research-driven redesign increasing retention by 40%.' },
      { title: 'Design System', desc: 'Comprehensive component library with dark mode and responsive tokens.' },
    ],
  },
];

export default function PortfolioModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('web');

  const current = tabs.find((t) => t.id === activeTab)!;

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
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed inset-0 z-[70] flex items-center justify-center px-4 sm:px-8 pointer-events-none"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="glass-card p-5 sm:p-8 w-full max-w-md sm:max-w-lg pointer-events-auto relative">
                <button
                  onClick={() => setOpen(false)}
                  className="absolute top-4 right-4 text-muted-foreground/40 hover:text-foreground transition-colors duration-300"
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
                        onClick={() => setActiveTab(tab.id)}
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
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3"
                  >
                    {current.items.map((item, i) => (
                      <div
                        key={i}
                        className="p-3 sm:p-4 rounded-lg bg-muted/30 border border-foreground/5 hover:border-foreground/10 transition-colors duration-300"
                      >
                        <h3 className="text-xs sm:text-sm font-medium text-foreground mb-1">
                          {item.title}
                        </h3>
                        <p className="text-[10px] sm:text-xs text-muted-foreground/60 leading-relaxed font-light">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
