import { Link, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface NavSection {
  title: string;
  items: { label: string; slug: string }[];
}

export const docsNav: NavSection[] = [
  {
    title: 'The Details',
    items: [{ label: 'Installation', slug: 'installation' }],
  },
  {
    title: 'Wallets',
    items: [
      { label: 'Overview', slug: 'wallets' },
      { label: 'Generate Wallets', slug: 'generate-wallets' },
      { label: 'Fund Wallets', slug: 'fund-wallets' },
      { label: 'Withdraw Funds', slug: 'withdraw-funds' },
      { label: 'Tag Wallets', slug: 'tag-wallets' },
      { label: 'Warm Wallets', slug: 'warm-wallets' },
      { label: 'Reclaim Rent', slug: 'reclaim-rent' },
      { label: 'Import', slug: 'import' },
      { label: 'Export', slug: 'export' },
      { label: 'Redistribute', slug: 'redistribute' },
      { label: 'Activate / Deactivate', slug: 'activate-deactivate' },
      { label: 'Grouping', slug: 'grouping' },
    ],
  },
  {
    title: 'Tokens',
    items: [
      { label: 'Overview', slug: 'tokens' },
      { label: 'New Launch', slug: 'new-launch' },
      { label: 'Copy Token', slug: 'copy-token' },
      { label: 'Import Token', slug: 'import-token' },
      { label: 'Launch Token', slug: 'launch-token' },
    ],
  },
  {
    title: 'Tasks',
    items: [
      { label: 'Volume', slug: 'volume' },
      { label: 'Bulk Sell', slug: 'bulk-sell' },
      { label: 'Bump', slug: 'bump' },
      { label: 'Sell Buyback', slug: 'sell-buyback' },
      { label: 'Automations', slug: 'automations' },
    ],
  },
  {
    title: 'Strategy',
    items: [
      { label: 'Blueprint', slug: 'blueprint' },
      { label: 'Vanities', slug: 'vanities' },
    ],
  },
  {
    title: 'Configuration',
    items: [{ label: 'Settings', slug: 'settings' }],
  },
];

// Flatten for prev/next
const allSlugs = docsNav.flatMap(s => s.items.map(i => i.slug));
const allLabels = docsNav.flatMap(s => s.items.map(i => i.label));

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const currentSlug = slug || 'installation';
  const [open, setOpen] = useState(false);

  const idx = allSlugs.indexOf(currentSlug);
  const prev = idx > 0 ? { slug: allSlugs[idx - 1], label: allLabels[idx - 1] } : null;
  const next = idx < allSlugs.length - 1 ? { slug: allSlugs[idx + 1], label: allLabels[idx + 1] } : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Mobile menu toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-md bg-card border border-border/50"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border/50 overflow-y-auto transition-transform md:translate-x-0 md:static md:shrink-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-5 border-b border-border/50">
          <Link to="/" className="text-xs font-mono text-primary tracking-widest uppercase">
            Warren Guru Bundler
          </Link>
          <p className="text-[10px] text-muted-foreground mt-0.5">Documentation</p>
        </div>

        <nav className="p-4 space-y-5">
          {docsNav.map(section => (
            <div key={section.title}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map(item => (
                  <li key={item.slug}>
                    <Link
                      to={`/bundler-docs/${item.slug}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'block px-3 py-1.5 rounded-md text-sm transition-colors',
                        currentSlug === item.slug
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Overlay for mobile */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <div className="max-w-4xl mx-auto px-6 py-10 md:py-14 space-y-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>

          {children}

          {/* Prev / Next */}
          <div className="flex items-center justify-between border-t border-border/50 pt-6 text-sm">
            {prev ? (
              <Link
                to={`/bundler-docs/${prev.slug}`}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                ← {prev.label}
              </Link>
            ) : <span />}
            {next ? (
              <Link
                to={`/bundler-docs/${next.slug}`}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                {next.label} →
              </Link>
            ) : <span />}
          </div>
        </div>
      </main>
    </div>
  );
}
