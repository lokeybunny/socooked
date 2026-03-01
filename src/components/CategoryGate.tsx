import { useState, useEffect, useCallback } from 'react';
import { Monitor, Store, ShoppingCart, UtensilsCrossed, Smartphone, ChevronLeft, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface CategoryInfo {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const SERVICE_CATEGORIES: CategoryInfo[] = [
  { id: 'digital-services', label: 'Digital Services', icon: Monitor, description: 'SaaS, agencies, consulting & digital service providers' },
  { id: 'brick-and-mortar', label: 'Brick and Mortar', icon: Store, description: 'Physical retail, offices & local businesses' },
  { id: 'digital-ecommerce', label: 'Digital E-Commerce', icon: ShoppingCart, description: 'Online stores, marketplaces & D2C brands' },
  { id: 'food-and-beverage', label: 'Food & Beverage', icon: UtensilsCrossed, description: 'Restaurants, cafés, catering & food brands' },
  { id: 'mobile-services', label: 'Mobile Services', icon: Smartphone, description: 'Mobile apps, on-demand & field services' },
  { id: 'potential', label: 'Potential', icon: Smartphone, description: 'Auto-generated leads from lead finder tools' },
  { id: 'other', label: 'Other', icon: Monitor, description: 'Uncategorized or miscellaneous items' },
];

// Placeholder notification counts per category — replace with real API data when connected
const CATEGORY_NOTIFICATIONS: Record<string, number> = {
  'digital-services': 0,
  'brick-and-mortar': 0,
  'digital-ecommerce': 0,
  'food-and-beverage': 0,
  'mobile-services': 0,
  'potential': 0,
  'other': 0,
};

interface CategoryGateProps {
  title: string;
  selectedCategory: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  children: React.ReactNode;
  categoryTitle?: string;
  totalCount?: number;
  countLabel?: string;
  /** Per-category item counts */
  categoryCounts?: Record<string, number>;
  /** Unique key for localStorage tracking (e.g. 'leads', 'deals') */
  pageKey?: string;
  /** Extra categories to display after the standard ones */
  extraCategories?: CategoryInfo[];
}

function getSeenKey(pageKey: string) {
  return `category-seen-${pageKey}`;
}

function getSeenCounts(pageKey: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(getSeenKey(pageKey)) || '{}');
  } catch { return {}; }
}

function setSeenCounts(pageKey: string, counts: Record<string, number>) {
  localStorage.setItem(getSeenKey(pageKey), JSON.stringify(counts));
}

export function CategoryGate({ title, selectedCategory, onSelect, onBack, children, categoryTitle, totalCount, countLabel, categoryCounts, pageKey, extraCategories }: CategoryGateProps) {
  const [seenCounts, setSeenCountsState] = useState<Record<string, number>>({});

  // Load seen counts on mount
  useEffect(() => {
    if (pageKey) setSeenCountsState(getSeenCounts(pageKey));
  }, [pageKey]);

  // When user selects a category, mark current count as seen
  const handleSelect = useCallback((id: string) => {
    if (pageKey && categoryCounts) {
      const updated = { ...getSeenCounts(pageKey), [id]: categoryCounts[id] || 0 };
      setSeenCounts(pageKey, updated);
      setSeenCountsState(updated);
    }
    onSelect(id);
  }, [pageKey, categoryCounts, onSelect]);
  if (!selectedCategory) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground">Select a category to continue</p>
          {typeof totalCount === 'number' && (
            <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full bg-muted/60 border border-border">
              <span className="text-2xl font-bold text-foreground">{totalCount.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">{countLabel || 'total'}</span>
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-4xl">
          {[...SERVICE_CATEGORIES, ...(extraCategories || [])].map((cat) => {
            const Icon = cat.icon;
            const notifCount = CATEGORY_NOTIFICATIONS[cat.id] || 0;
            const itemCount = categoryCounts?.[cat.id];
            const seenCount = seenCounts[cat.id];
            const hasNewData = pageKey && typeof itemCount === 'number' && (seenCount === undefined ? itemCount > 0 : itemCount > seenCount);
            return (
              <button
                key={cat.id}
                onClick={() => handleSelect(cat.id)}
                className={cn(
                  "group glass-card p-6 rounded-xl text-left space-y-3 hover:ring-2 hover:ring-primary/40 transition-all relative",
                  cat.id === 'telegram' && "ring-1 ring-blue-400/30 bg-blue-500/5",
                  cat.id === 'ai-generated' && "ring-1 ring-emerald-400/30 bg-emerald-500/5",
                )}
              >
                {notifCount > 0 ? (
                  <span className="absolute top-3 right-3 flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold animate-pulse">
                    {notifCount}
                  </span>
                ) : typeof itemCount === 'number' ? (
                  <span className={cn(
                    "absolute top-3 right-3 flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full text-xs font-semibold transition-colors",
                    hasNewData
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {itemCount}
                  </span>
                ) : (
                  <span className="absolute top-3 right-3 flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground/50">
                    <Bot className="h-3 w-3" />
                  </span>
                )}
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
                  cat.id === 'telegram' ? "bg-blue-500/15 group-hover:bg-blue-500/25" :
                  cat.id === 'ai-generated' ? "bg-emerald-500/15 group-hover:bg-emerald-500/25" :
                  "bg-primary/10 group-hover:bg-primary/20"
                )}>
                  <Icon className={cn(
                    "h-5 w-5",
                    cat.id === 'telegram' ? "text-blue-500" :
                    cat.id === 'ai-generated' ? "text-emerald-500" :
                    "text-primary"
                  )} />
                </div>
                <h3 className={cn(
                  "font-semibold",
                  cat.id === 'telegram' ? "text-blue-600 dark:text-blue-400" :
                  cat.id === 'ai-generated' ? "text-emerald-600 dark:text-emerald-400" :
                  "text-foreground"
                )}>{cat.label}</h3>
                <p className="text-sm text-muted-foreground">{cat.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const activeCat = [...SERVICE_CATEGORIES, ...(extraCategories || [])].find(c => c.id === selectedCategory);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {categoryTitle || `${activeCat?.label || ''} ${title}`}
          </h1>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Hook for category state */
export function useCategoryGate() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  return {
    selectedCategory,
    onSelect: setSelectedCategory,
    onBack: () => setSelectedCategory(null),
  };
}
