import { lazy } from 'react';

const Landing = lazy(() => import('@/pages/Landing'));
const WarrenLanding = lazy(() => import('@/pages/WarrenLanding'));

/**
 * Routes to the correct landing page based on the current hostname.
 * - warren.guru → WarrenLanding
 * - everything else (stu25.com, localhost, preview) → Landing
 */
export default function DomainLanding() {
  const host = window.location.hostname;
  const isWarren = host === 'warren.guru' || host === 'www.warren.guru';

  return isWarren ? <WarrenLanding /> : <Landing />;
}
