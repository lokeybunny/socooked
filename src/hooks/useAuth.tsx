import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_BOOT_TIMEOUT_MS = 3500;
const AUTH_REQUEST_TIMEOUT_MS = 12000;

const authTimeoutError = () =>
  new Error('Login is taking too long. Please try again in a moment.');

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(authTimeoutError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const bootFallback = setTimeout(() => {
      if (active) setLoading(false);
    }, AUTH_BOOT_TIMEOUT_MS);

    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      clearTimeout(bootFallback);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    withTimeout(supabase.auth.getSession(), AUTH_BOOT_TIMEOUT_MS)
      .then(({ data: { session } }) => applySession(session))
      .catch(() => applySession(null));

    return () => {
      active = false;
      clearTimeout(bootFallback);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      AUTH_REQUEST_TIMEOUT_MS,
    );
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
