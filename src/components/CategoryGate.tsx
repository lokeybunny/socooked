import { useState } from 'react';
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
];

// Placeholder notification counts per category — replace with real API data when connected
const CATEGORY_NOTIFICATIONS: Record<string, number> = {
  'digital-services': 0,
  'brick-and-mortar': 0,
  'digital-ecommerce': 0,
  'food-and-beverage': 0,
  'mobile-services': 0,
};

interface CategoryGateProps {
  /** Page title shown above category cards */
  title: string;
  /** Selected category ID, null = show picker */
  selectedCategory: string | null;
  /** Called when user selects a category */
  onSelect: (id: string) => void;
  /** Called when user clicks back */
  onBack: () => void;
  /** Content to render when a category is selected */
  children: React.ReactNode;
  /** Override page title when a category is selected */
  categoryTitle?: string;
  /** Total count to display as overview on the category picker */
  totalCount?: number;
  /** Label for the total count (e.g. "customers", "deals") */
  countLabel?: string;
}

export function CategoryGate({ title, selectedCategory, onSelect, onBack, children, categoryTitle, totalCount, countLabel }: CategoryGateProps) {
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
          {SERVICE_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const notifCount = CATEGORY_NOTIFICATIONS[cat.id] || 0;
            return (
              <button
                key={cat.id}
                onClick={() => onSelect(cat.id)}
                className="group glass-card p-6 rounded-xl text-left space-y-3 hover:ring-2 hover:ring-primary/40 transition-all relative"
              >
                {notifCount > 0 && (
                  <span className="absolute top-3 right-3 flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold animate-pulse">
                    {notifCount}
                  </span>
                )}
                {notifCount === 0 && (
                  <span className="absolute top-3 right-3 flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground/50">
                    <Bot className="h-3 w-3" />
                  </span>
                )}
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{cat.label}</h3>
                <p className="text-sm text-muted-foreground">{cat.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const activeCat = SERVICE_CATEGORIES.find(c => c.id === selectedCategory);

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
