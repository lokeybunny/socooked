import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const FALLBACK = "+14802200405";

const fmt = (e164: string) => {
  const d = (e164 || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return "(480) 220-0405";
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

export function useCellNumber() {
  const [e164, setE164] = useState<string>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "business_numbers")
        .maybeSingle();
      const cell = (data?.value as any)?.cell;
      if (!cancelled && cell) setE164(cell);
    };
    load();

    const ch = supabase
      .channel("cell-number-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: "key=eq.business_numbers" },
        (payload: any) => {
          const cell = payload?.new?.value?.cell;
          if (cell) setE164(cell);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  return { e164, telHref: `tel:${e164}`, display: fmt(e164) };
}
