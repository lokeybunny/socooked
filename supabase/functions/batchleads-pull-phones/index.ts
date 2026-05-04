// BatchLeads Phone Puller — extracts ONLY phone numbers from BatchLeads property/lead search.
// Stores all results into batchleads_phone_pulls. Caps every pull at 50.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HARD_LIMIT = 50;

function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

// Walk an arbitrary JSON tree pulling out anything that looks like a phone field.
function harvestPhones(node: unknown, out: Array<{ phone: string; type?: string }>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const v of node) harvestPhones(v, out);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (
        (key.includes("phone") || key === "mobile" || key === "cell" || key === "landline") &&
        (typeof v === "string" || typeof v === "number")
      ) {
        const e = toE164(String(v));
        if (e) {
          let type: string | undefined;
          if (key.includes("mobile") || key.includes("cell")) type = "mobile";
          else if (key.includes("land")) type = "landline";
          else if (key.includes("type") && typeof v === "string") type = v;
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

  try {
    const apiKey = Deno.env.get("BATCHLEADS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: "BATCHLEADS_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const location: string = (body.location || "Las Vegas, NV").toString().trim();
    const radius_miles: number = Math.max(1, Math.min(100, Number(body.radius_miles) || 25));
    const max_results: number = Math.max(1, Math.min(HARD_LIMIT, Number(body.max_results) || HARD_LIMIT));

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Call BatchLeads search-property endpoint. Try v1 first, fall back to legacy if 404.
    const endpoints = [
      "https://api.batchdata.com/api/v1/property/search",
      "https://api.batchleads.io/api/v1/property/search",
    ];

    const payload = {
      searchCriteria: {
        query: location,
        radius: radius_miles,
      },
      options: {
        skip: 0,
        take: max_results,
      },
    };

    let apiData: unknown = null;
    let apiStatus = 0;
    let apiText = "";
    let usedEndpoint = "";

    for (const url of endpoints) {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      apiStatus = resp.status;
      apiText = await resp.text();
      usedEndpoint = url;
      if (resp.ok) {
        try { apiData = JSON.parse(apiText); } catch { apiData = null; }
        break;
      }
      // try next endpoint on 404/401, otherwise stop
      if (resp.status !== 404) break;
    }

    if (!apiData) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `BatchLeads API error ${apiStatus}: ${apiText.slice(0, 400)}`,
          endpoint: usedEndpoint,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Harvest phones
    const harvested: Array<{ phone: string; type?: string }> = [];
    harvestPhones(apiData, harvested);

    // Dedupe within this pull
    const seen = new Set<string>();
    const unique: Array<{ phone: string; type?: string }> = [];
    for (const h of harvested) {
      if (seen.has(h.phone)) continue;
      seen.add(h.phone);
      unique.push(h);
      if (unique.length >= max_results) break;
    }

    // Check existing in DB
    const phones = unique.map((u) => u.phone);
    const { data: existing } = phones.length
      ? await supa.from("batchleads_phone_pulls").select("phone_e164").in("phone_e164", phones)
      : { data: [] as Array<{ phone_e164: string }> };
    const existingSet = new Set((existing || []).map((r) => r.phone_e164));

    const results: Array<{
      phone_number: string;
      phone_e164: string;
      phone_type: string | null;
      status: "new" | "duplicate";
    }> = [];

    const toInsert: Array<Record<string, unknown>> = [];
    for (const u of unique) {
      const isDup = existingSet.has(u.phone);
      results.push({
        phone_number: u.phone,
        phone_e164: u.phone,
        phone_type: u.type ?? null,
        status: isDup ? "duplicate" : "new",
      });
      if (!isDup) {
        toInsert.push({
          phone_number: u.phone,
          phone_e164: u.phone,
          phone_type: u.type ?? null,
          location,
          radius_miles,
          source: "batchleads",
          status: "new",
          raw_response: { endpoint: usedEndpoint, sample: u },
        });
      }
    }

    if (toInsert.length) {
      const { error: insErr } = await supa.from("batchleads_phone_pulls").insert(toInsert);
      if (insErr) {
        return new Response(
          JSON.stringify({ ok: false, error: `DB insert error: ${insErr.message}`, results }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        location,
        radius_miles,
        max_results,
        total_found: harvested.length,
        unique_returned: results.length,
        new_count: results.filter((r) => r.status === "new").length,
        duplicate_count: results.filter((r) => r.status === "duplicate").length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
