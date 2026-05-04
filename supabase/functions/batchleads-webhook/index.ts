// BatchLeads → CRM webhook receiver.
// Configure this URL in BatchLeads (Webhooks / Push destinations).
// Accepts any JSON payload, harvests phone numbers, dedupes against batchleads_phone_pulls.
// Optional security: send header "x-webhook-secret: <BATCHLEADS_WEBHOOK_SECRET>" if that secret is set.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

function toE164(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function harvestPhones(node: unknown, out: Array<{ phone: string; type?: string }>): void {
  if (!node) return;
  if (Array.isArray(node)) { for (const v of node) harvestPhones(v, out); return; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if ((key.includes("phone") || key === "mobile" || key === "cell" || key === "landline") &&
          (typeof v === "string" || typeof v === "number")) {
        const e = toE164(v);
        if (e) {
          let type: string | undefined;
          if (key.includes("mobile") || key.includes("cell")) type = "mobile";
          else if (key.includes("land")) type = "landline";
          out.push({ phone: e, type });
        }
      } else if (typeof v === "object") {
        harvestPhones(v, out);
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, service: "batchleads-webhook" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Optional shared-secret check
    const expectedSecret = Deno.env.get("BATCHLEADS_WEBHOOK_SECRET");
    if (expectedSecret) {
      const got = req.headers.get("x-webhook-secret") || "";
      if (got !== expectedSecret) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const harvested: Array<{ phone: string; type?: string }> = [];
    harvestPhones(body, harvested);

    // dedupe within payload
    const seen = new Set<string>();
    const unique = harvested.filter((h) => {
      if (seen.has(h.phone)) return false;
      seen.add(h.phone); return true;
    });

    let inserted = 0, duplicates = 0;
    if (unique.length) {
      const phones = unique.map((u) => u.phone);
      const { data: existing } = await supa
        .from("batchleads_phone_pulls")
        .select("phone_e164")
        .in("phone_e164", phones);
      const existingSet = new Set((existing || []).map((r) => r.phone_e164));

      const toInsert = unique
        .filter((u) => !existingSet.has(u.phone))
        .map((u) => ({
          phone_number: u.phone,
          phone_e164: u.phone,
          phone_type: u.type ?? null,
          location: typeof body?.location === "string" ? body.location : "webhook",
          radius_miles: null,
          source: "batchleads_webhook",
          status: "new",
          raw_response: { received_at: new Date().toISOString(), payload: body },
        }));
      duplicates = unique.length - toInsert.length;

      if (toInsert.length) {
        const { error } = await supa.from("batchleads_phone_pulls").insert(toInsert);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        inserted = toInsert.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      received: harvested.length,
      unique: unique.length,
      inserted,
      duplicates,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
