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
    const progressId = String(form.get("progress_id") || "").trim();

    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const broadcast = async (event: string, payload: Record<string, unknown>) => {
      if (!progressId) return;
      try {
        await fetch(`${SUPA_URL}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ topic: `upload:${progressId}`, event, payload, private: false }],
          }),
        });
      } catch (_) { /* ignore */ }
    };
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
    const nameKey = findKey(rows[0], ["full_name", "owner_name", "owner", "name"]);
    const firstNameKey = findKey(rows[0], ["first_name", "firstname", "given_name", "fname"]);
    const lastNameKey = findKey(rows[0], ["last_name", "lastname", "surname", "lname"]);
    const addrKey = findKey(rows[0], ["property_address", "address", "street", "street_address", "mailing_address"]);
    const cityKey = findKey(rows[0], ["city", "town"]);
    const zipKey = findKey(rows[0], ["zip", "zipcode", "postal", "postal_code"]);
    const emailKey = findKey(rows[0], ["email", "email_address", "e_mail", "owner_email", "contact_email", "mail"]);

    console.log("[process-state-upload] file:", file.name, "rows:", rows.length);
    console.log("[process-state-upload] headers:", Object.keys(rows[0] ?? {}));
    console.log("[process-state-upload] mapped keys:", { phoneKey, nameKey, firstNameKey, lastNameKey, addrKey, cityKey, zipKey, emailKey });

    if (!phoneKey) {
      return new Response(JSON.stringify({ error: "No phone_number column found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanStr = (v: unknown) => {
      if (v == null) return null;
      const s = String(v).trim();
      return s.length ? s : null;
    };
    const cleanEmail = (v: unknown) => {
      const s = cleanStr(v);
      if (!s) return null;
      const lower = s.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : null;
    };
    const deriveFirstName = (full: string | null, first: string | null) => {
      if (first) return first.split(/\s+/)[0];
      if (full) return full.split(/\s+/)[0];
      return null;
    };

    // Build candidate records, dedupe within file
    const seen = new Set<string>();
    type Cand = {
      phone_number: string; phone_e164: string; state: string;
      name: string | null; first_name: string | null; last_name?: string | null;
      address: string | null; property_address: string | null;
      city: string | null; zip: string | null; email: string | null;
      source: string; uploaded_file_name: string;
    };
    const preCandidates: Cand[] = [];

    for (const r of rows) {
      const e164 = toE164(r[phoneKey]);
      if (!e164 || seen.has(e164)) continue;
      seen.add(e164);

      const fullName = nameKey ? cleanStr(r[nameKey]) : null;
      const firstRaw = firstNameKey ? cleanStr(r[firstNameKey]) : null;
      const lastRaw = lastNameKey ? cleanStr(r[lastNameKey]) : null;
      const composedFull = fullName || [firstRaw, lastRaw].filter(Boolean).join(" ") || null;
      const firstName = deriveFirstName(composedFull, firstRaw);
      const lastName = lastRaw;
      const address = addrKey ? cleanStr(r[addrKey]) : null;
      const email = emailKey ? cleanEmail(r[emailKey]) : null;

      preCandidates.push({
        phone_number: String(r[phoneKey]).trim(),
        phone_e164: e164,
        state: selectedState,
        name: composedFull || [firstName, lastName].filter(Boolean).join(" ") || null,
        first_name: firstName,
        last_name: lastName,
        address,
        property_address: address,
        city: cityKey ? cleanStr(r[cityKey]) : null,
        zip: zipKey ? cleanStr(r[zipKey]) : null,
        email,
        source: "batch_upload",
        uploaded_file_name: file.name,
      });
    }

    const candidates: Cand[] = [...preCandidates];

    const totalRows = rows.length;
    let inserted = 0;
    let duplicates = totalRows - candidates.length;

    const chunkSize = 1000;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      const { data: insertedData, error: insErr } = await supabase
        .from("state_leads")
        .upsert(chunk.map(({ last_name: _ln, ...c }) => c), { onConflict: "phone_e164", ignoreDuplicates: true })
        .select("id");
      if (insErr) {
        console.error("insert error", insErr);
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const insertedThis = insertedData?.length ?? 0;
      inserted += insertedThis;
      duplicates += chunk.length - insertedThis;
    }
    console.log("[process-state-upload] inserted:", inserted, "duplicates:", duplicates);

    await supabase.from("upload_logs").insert({
      state: selectedState,
      file_name: file.name,
      total_rows: totalRows,
      inserted_count: inserted,
      duplicate_count: duplicates,
    });

    return new Response(
      JSON.stringify({
        total_rows: totalRows,
        inserted_count: inserted,
        duplicate_count: duplicates,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
