import { AppLayout } from '@/components/layout/AppLayout';
import MVPVideoPicker from '@/components/portal/MVPVideoPicker';
import { Layers } from 'lucide-react';

const NICHES = [
  { key: 'mv', label: 'Music Video (MV)', description: 'Vertical video showcase landing for MV clients' },
  // Future niches:
  // { key: 'realtor', label: 'Realtor', description: 'Property showcase landing for real estate agents' },
  // { key: 'barber', label: 'Barber', description: 'Portfolio landing for barber shops' },
];

export default function LandingPages() {
  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Landing</h1>
          <p className="text-muted-foreground mt-1">
            Manage niche landing pages for customer Custom-U portals.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NICHES.map(niche => (
            <div key={niche.key} className="glass-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{niche.label}</h3>
                  <p className="text-xs text-muted-foreground">{niche.description}</p>
                </div>
              </div>
              {niche.key === 'mv' && <MVPVideoPicker />}
            </div>
          ))}
        </div>

        <div className="glass-card p-5">
          <p className="text-sm text-muted-foreground">
            More niches coming soon — Realtor, Barber, and more. Each niche will have its own customizable landing page
            that customers see before their Custom-U upload portal.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
