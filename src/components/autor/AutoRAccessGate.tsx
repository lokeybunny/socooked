import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLoadingScreen } from "@/components/app/AppLoadingScreen";

/**
 * Restricts access to AutoR live rooms and recordings.
 * Allowed: warren@stu25.com (owner) OR any user with role 'admin' or 'manager'.
 */
export function AutoRAccessGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!user) {
        if (active) { setAllowed(false); setChecking(false); }
        return;
      }
      if (user.email === "warren@stu25.com") {
        if (active) { setAllowed(true); setChecking(false); }
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "manager"])
        .limit(1);
      if (active) {
        setAllowed((data?.length ?? 0) > 0);
        setChecking(false);
      }
    };
    check();
    return () => { active = false; };
  }, [user]);

  if (loading || checking) return <AppLoadingScreen label="Checking access…" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
