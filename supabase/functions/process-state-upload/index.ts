// Process CSV/XLSX upload of phone numbers per state, dedupe globally on phone_e164.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toE164(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

function findKey(row: Record<string, any>, candidates: string[]): string | undefined {
  const map = new Map(Object.keys(row).map((k) => [k.toLowerCase().trim(), k]));
  for (const c of candidates) {
    const hit = map.get(c.toLowerCase());
    if (hit) return hit;
  }
  // partial match
  for (const c of candidates) {
    for (const [lk, orig] of map.entries()) {
      if (lk.includes(c.toLowerCase())) return orig;
    }
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const selectedState = String(form.get("selected_state") || "").trim();
    if (!file || !selectedState) {
      return new Response(JSON.stringify({ error: "file and selected_state are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

    if (!rows.length) {
      return new Response(JSON.stringify({ total_rows: 0, inserted_count: 0, duplicate_count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phoneKey = findKey(rows[0], ["phone_number", "phone", "mobile", "cell", "telephone"]);
    const nameKey = findKey(rows[0], ["name", "owner", "full_name", "first_name"]);
    const addrKey = findKey(rows[0], ["address", "street", "property_address"]);
    const cityKey = findKey(rows[0], ["city", "town"]);
    const zipKey = findKey(rows[0], ["zip", "zipcode", "postal", "postal_code"]);

    if (!phoneKey) {
      return new Response(JSON.stringify({ error: "No phone_number column found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build candidate records, dedupe within file
    const seen = new Set<string>();
    const candidates: any[] = [];
    for (const r of rows) {
      const e164 = toE164(r[phoneKey]);
      if (!e164 || seen.has(e164)) continue;
      seen.add(e164);
      candidates.push({
        phone_number: String(r[phoneKey]).trim(),
        phone_e164: e164,
        state: selectedState,
        name: nameKey ? String(r[nameKey] || "").trim() || null : null,
        address: addrKey ? String(r[addrKey] || "").trim() || null : null,
        city: cityKey ? String(r[cityKey] || "").trim() || null : null,
        zip: zipKey ? String(r[zipKey] || "").trim() || null : null,
        source: "batch_upload",
        uploaded_file_name: file.name,
      });
    }

    const totalRows = rows.length;
    let inserted = 0;
    let duplicates = totalRows - candidates.length; // duplicates within file

    // Insert in chunks; rely on UNIQUE(phone_e164) -> ignore duplicates
    const chunkSize = 500;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("state_leads")
        .upsert(chunk, { onConflict: "phone_e164", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.error("insert error", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const insertedThis = data?.length ?? 0;
      inserted += insertedThis;
      duplicates += chunk.length - insertedThis;
    }

    await supabase.from("upload_logs").insert({
      state: selectedState,
      file_name: file.name,
      total_rows: totalRows,
      inserted_count: inserted,
      duplicate_count: duplicates,
    });

    return new Response(
      JSON.stringify({ total_rows: totalRows, inserted_count: inserted, duplicate_count: duplicates }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
