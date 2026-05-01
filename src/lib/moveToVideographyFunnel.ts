import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function normalizeLast10(raw: string | null | undefined) {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "").slice(-10);
}

/**
 * Move an SMS contact into the Videography funnel by creating
 * (or updating) a customer with source='videography-landing'.
 * That row shows up automatically in /videography hub.
 */
export async function moveToVideographyFunnel(opts: {
  phone: string;
  name?: string | null;
  email?: string | null;
  notes?: string | null;
}) {
  const last10 = normalizeLast10(opts.phone);
  if (last10.length !== 10) {
    toast.error("Invalid phone number");
    return { ok: false as const };
  }
  const e164 = `+1${last10}`;
  const fullName = (opts.name || "").trim() || `SMS Lead ${last10}`;

  try {
    // Check existing customer by phone
    const { data: existing } = await supabase
      .from("customers")
      .select("id, source, full_name, email, notes")
      .or(`phone.ilike.%${last10},phone.eq.${e164}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("customers")
        .update({
          source: "videography-landing",
          status: existing.source === "videography-landing" ? undefined : "lead",
          full_name: existing.full_name || fullName,
          email: existing.email || opts.email || null,
          notes: opts.notes
            ? `${existing.notes ? existing.notes + "\n\n" : ""}${opts.notes}`
            : existing.notes,
        })
        .eq("id", existing.id);
      if (error) throw error;
      toast.success("Moved to Videography funnel");
      return { ok: true as const, id: existing.id, updated: true };
    }

    const { data: created, error } = await supabase
      .from("customers")
      .insert({
        full_name: fullName,
        phone: e164,
        email: opts.email || null,
        source: "videography-landing",
        status: "lead",
        category: "videography",
        notes: opts.notes || `Moved from SMS thread on ${new Date().toLocaleString()}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    toast.success("Added to Videography funnel");
    return { ok: true as const, id: created.id, updated: false };
  } catch (e: any) {
    toast.error(e?.message || "Failed to move to funnel");
    return { ok: false as const };
  }
}
