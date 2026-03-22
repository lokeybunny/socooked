import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from './AppLayout';

/**
 * Wraps children in AppLayout when user is authenticated,
 * otherwise renders children standalone (no sidebar).
 */
export function AuthLayoutGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user) return <AppLayout>{children}</AppLayout>;
  return <>{children}</>;
}
