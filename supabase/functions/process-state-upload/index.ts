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
    const candidates: any[] = [];
    let lgmRejected = 0;
    let lgmChecked = 0;
    let lgmEnriched = 0;
    const LGM_KEY = Deno.env.get("LAGROWTHMACHINE_API_KEY") || "";
    const LGM_BASE = "https://apiv2.lagrowthmachine.com/flow";

    // Verify a single lead through LGM. Returns { ok, enrich? }.
    // Fail-open: network/5xx errors are treated as accepted so a flaky API doesn't drop rows.
    async function lgmVerify(payload: { email?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null; }): Promise<{ ok: boolean; enrich?: Record<string, any> }> {
      if (!LGM_KEY) return { ok: true };
      if (!payload.email && !payload.phone) return { ok: true };
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 7000);
        const body: Record<string, any> = {};
        if (payload.email) body.email = payload.email;
        if (payload.phone) body.phone = payload.phone;
        if (payload.firstName) body.firstName = payload.firstName;
        if (payload.lastName) body.lastName = payload.lastName;
        const r = await fetch(`${LGM_BASE}/leads/verify?apikey=${encodeURIComponent(LGM_KEY)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (r.status === 429) {
          await new Promise((res) => setTimeout(res, 1500));
          return { ok: true }; // rate-limited -> fail open
        }
        if (r.status >= 500) return { ok: true };
        const j = await r.json().catch(() => ({}));
        // Heuristic acceptance: explicit 'valid' / 'verified' / status===ok
        const valid = j?.valid === true
          || j?.verified === true
          || j?.status === "valid"
          || j?.status === "ok"
          || (j?.email?.valid === true)
          || (j?.phone?.valid === true);
        const invalid = j?.valid === false
          || j?.verified === false
          || j?.status === "invalid"
          || j?.status === "rejected"
          || (j?.email?.valid === false && !payload.phone)
          || (j?.phone?.valid === false && !payload.email);
        if (invalid) return { ok: false };
        if (valid) {
          const enrich: Record<string, any> = {};
          if (j?.firstName && !payload.firstName) enrich.first_name = j.firstName;
          if (j?.lastName) enrich.last_name = j.lastName;
          return { ok: true, enrich };
        }
        // 2xx but no clear signal -> accept
        return { ok: true };
      } catch (_e) {
        return { ok: true }; // network failure -> fail open
      }
    }


    for (const r of rows) {
      const e164 = toE164(r[phoneKey]);
      if (!e164 || seen.has(e164)) continue;
      seen.add(e164);

      const fullName = nameKey ? cleanStr(r[nameKey]) : null;
      const firstRaw = firstNameKey ? cleanStr(r[firstNameKey]) : null;
      const lastRaw = lastNameKey ? cleanStr(r[lastNameKey]) : null;
      const composedFull = fullName || [firstRaw, lastRaw].filter(Boolean).join(" ") || null;
      const firstName = deriveFirstName(composedFull, firstRaw);
      const address = addrKey ? cleanStr(r[addrKey]) : null;
      const email = emailKey ? cleanEmail(r[emailKey]) : null;

      candidates.push({
        phone_number: String(r[phoneKey]).trim(),
        phone_e164: e164,
        state: selectedState,
        name: composedFull,
        first_name: firstName,
        address,
        property_address: address,
        city: cityKey ? cleanStr(r[cityKey]) : null,
        zip: zipKey ? cleanStr(r[zipKey]) : null,
        email,
        source: "batch_upload",
        uploaded_file_name: file.name,
      });
    }

    const totalRows = rows.length;
    let inserted = 0;
    let duplicates = totalRows - candidates.length; // duplicates within file

    // Insert in chunks. For duplicates by phone_e164, backfill email/name/address fields
    // when the existing row is missing them (COALESCE-style merge via upsert without ignoreDuplicates).
    const chunkSize = 500;
    let emailBackfilled = 0;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);

      // Step 1: insert new rows only (ignore duplicates) to count true new inserts
      const { data: insertedData, error: insErr } = await supabase
        .from("state_leads")
        .upsert(chunk, { onConflict: "phone_e164", ignoreDuplicates: true })
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

      // Step 2: for rows in this chunk that have an email, backfill email on existing leads
      // where the stored email is null/empty. Same for first_name and address if missing.
      const enrichRows = chunk.filter((c) => c.email || c.first_name || c.name || c.address);
      for (const c of enrichRows) {
        const patch: Record<string, unknown> = {};
        if (c.email) patch.email = c.email;
        if (c.first_name) patch.first_name = c.first_name;
        if (c.name) patch.name = c.name;
        if (c.address) {
          patch.address = c.address;
          patch.property_address = c.address;
        }
        if (c.city) patch.city = c.city;
        if (c.zip) patch.zip = c.zip;
        if (Object.keys(patch).length === 0) continue;

        // Only update fields that are currently null on the existing row.
        // We can't do COALESCE in PostgREST easily, so fetch first.
        const { data: existing } = await supabase
          .from("state_leads")
          .select("id,email,first_name,name,address,city,zip")
          .eq("phone_e164", c.phone_e164)
          .maybeSingle();
        if (!existing) continue;

        const finalPatch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (!v) continue;
          if ((existing as any)[k] == null || (existing as any)[k] === "") {
            finalPatch[k] = v;
          }
        }
        if (Object.keys(finalPatch).length === 0) continue;

        const { error: upErr } = await supabase
          .from("state_leads")
          .update(finalPatch)
          .eq("id", (existing as any).id);
        if (!upErr && finalPatch.email) emailBackfilled += 1;
      }
    }
    console.log("[process-state-upload] inserted:", inserted, "duplicates:", duplicates, "email_backfilled:", emailBackfilled);

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
