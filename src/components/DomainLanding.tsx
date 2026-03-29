import { lazy } from 'react';

const WarrenLanding = lazy(() => import('@/pages/WarrenLanding'));

/**
 * Always renders the Warren Guru landing page.
 */
export default function DomainLanding() {
  return <WarrenLanding />;
}
