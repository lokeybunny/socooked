// Shared internal helper: batch phone-number Twilio Lookup with caching + concurrency.
// Callable directly OR imported by other edge functions (we re-export the helper).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_TTL_DAYS = 30;
const CONCURRENCY = 10;

export type LookupResult = {
  phone_e164: string;
  valid: boolean;
  line_type: string | null; // 'mobile' | 'landline' | 'voip' | 'unknown' | etc
  carrier_name: string | null;
  carrier_type: string | null;
  country_code: string | null;
  status: "success" | "failed";
  cached: boolean;
};

function normalizeLineType(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  const s = String(raw).toLowerCase();
  if (s === "mobile") return "mobile";
  if (s === "landline" || s === "fixed") return "landline";
  if (s.includes("voip")) return "voip";
  if (s === "tollfree" || s === "toll_free" || s === "toll-free") return "tollfree";
  if (s === "unknown") return "unknown";
  return s;
}

async function fetchTwilioLookup(e164: string, sid: string, token: string): Promise<LookupResult> {
  const auth = btoa(`${sid}:${token}`);
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
      if (res.status === 404) {
        return {
          phone_e164: e164, valid: false, line_type: "unknown",
          carrier_name: null, carrier_type: null, country_code: null,
          status: "success", cached: false,
        };
      }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      if (!res.ok) {
        return {
          phone_e164: e164, valid: false, line_type: null,
          carrier_name: null, carrier_type: null, country_code: null,
          status: "failed", cached: false,
        };
      }
      const data = await res.json();
      const lti = data.line_type_intelligence ?? {};
      return {
        phone_e164: e164,
        valid: !!data.valid,
        line_type: normalizeLineType(lti.type),
        carrier_name: lti.carrier_name ?? null,
        carrier_type: lti.type ?? null,
        country_code: data.country_code ?? null,
        status: "success",
        cached: false,
      };
    } catch (_e) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  return {
    phone_e164: e164, valid: false, line_type: null,
    carrier_name: null, carrier_type: null, country_code: null,
    status: "failed", cached: false,
  };
}

/** Run lookups for a list of E.164 numbers. Uses cache + concurrency 10. */
export async function lookupBatch(
  supabase: SupabaseClient,
  numbers: string[],
): Promise<{ results: Record<string, LookupResult>; cacheHits: number; newLookups: number }> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const unique = Array.from(new Set(numbers.filter(Boolean)));
  const results: Record<string, LookupResult> = {};
  let cacheHits = 0;
  let newLookups = 0;
  if (!unique.length) return { results, cacheHits, newLookups };

  // 1. Read cache (≤30 days old)
  const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 86400_000).toISOString();
  // Chunk IN clauses to avoid overlong query strings
  const cacheMap = new Map<string, any>();
  for (let i = 0; i < unique.length; i += 500) {
    const slice = unique.slice(i, i + 500);
    const { data } = await supabase
      .from("phone_lookups")
      .select("*")
      .in("phone_e164", slice)
      .gte("checked_at", cutoff);
    for (const row of data ?? []) cacheMap.set(row.phone_e164, row);
  }

  const todo: string[] = [];
  for (const e164 of unique) {
    const cached = cacheMap.get(e164);
    if (cached && cached.status === "success") {
      cacheHits++;
      results[e164] = {
        phone_e164: e164,
        valid: !!cached.valid,
        line_type: cached.line_type,
        carrier_name: cached.carrier_name,
        carrier_type: cached.carrier_type,
        country_code: cached.country_code,
        status: cached.status,
        cached: true,
      };
    } else {
      todo.push(e164);
    }
  }

  // 2. Fetch misses with concurrency
  const queue = [...todo];
  const fresh: LookupResult[] = [];
  async function worker() {
    while (queue.length) {
      const n = queue.shift();
      if (!n) break;
      const r = await fetchTwilioLookup(n, sid, token);
      fresh.push(r);
      results[n] = r;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  newLookups = fresh.filter((r) => r.status === "success").length;

  // 3. Upsert fresh results into cache (chunk 500)
  const cacheRows = fresh.map((r) => ({
    phone_e164: r.phone_e164,
    valid: r.valid,
    line_type: r.line_type,
    carrier_name: r.carrier_name,
    carrier_type: r.carrier_type,
    country_code: r.country_code,
    status: r.status,
    raw_response: null,
    checked_at: new Date().toISOString(),
  }));
  for (let i = 0; i < cacheRows.length; i += 500) {
    await supabase.from("phone_lookups").upsert(cacheRows.slice(i, i + 500), { onConflict: "phone_e164" });
  }

  return { results, cacheHits, newLookups };
}

