// Process CSV/XLSX upload of phone numbers per state, dedupe globally on phone_e164.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseCsvFast(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = new Array(rows.length - 1);
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {};
    const row = rows[r];
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c] ?? "";
    out[r - 1] = obj;
  }
  return out;
}

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

    // Read file bytes BEFORE returning (the request body must be consumed in the request scope).
    const isCsv = /\.csv$/i.test(file.name) || (file.type || "").includes("csv");
    const fileName = file.name;
    const fileText = isCsv ? await file.text() : "";
    const fileBuf = isCsv ? null : new Uint8Array(await file.arrayBuffer());

    // Heavy work runs in the background so the HTTP response returns immediately
    // (avoids the 150s gateway 504). The client tracks progress via realtime broadcasts.
    const work = (async () => {
      try {
        await broadcast("status", { phase: "parsing", message: "Reading file…" });
        let rows: Record<string, any>[];
        if (isCsv) {
          rows = parseCsvFast(fileText);
        } else {
          const wb = XLSX.read(fileBuf!, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
        }
        await broadcast("status", { phase: "parsed", total_rows: rows.length, message: `Parsed ${rows.length} rows` });

        if (!rows.length) {
          await broadcast("complete", { total_rows: 0, inserted_count: 0, duplicate_count: 0 });
          return;
        }
        await processRows(rows, supabase, selectedState, fileName, broadcast);
      } catch (e) {
        console.error("[process-state-upload] background error", e);
        await broadcast("error", { message: String((e as Error).message || e) });
      }
    })();

    // @ts-ignore EdgeRuntime is available in Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

    return new Response(JSON.stringify({ accepted: true, progress_id: progressId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processRows(
  rows: Record<string, any>[],
  supabase: ReturnType<typeof createClient>,
  selectedState: string,
  fileName: string,
  broadcast: (event: string, payload: Record<string, unknown>) => Promise<void>,
) {
    const phoneKey = findKey(rows[0], ["phone_number", "phone", "mobile", "cell", "telephone"]);
    const nameKey = findKey(rows[0], ["full_name", "owner_name", "owner", "name"]);
    const firstNameKey = findKey(rows[0], ["first_name", "firstname", "given_name", "fname"]);
    const lastNameKey = findKey(rows[0], ["last_name", "lastname", "surname", "lname"]);
    const addrKey = findKey(rows[0], ["property_address", "address", "street", "street_address", "mailing_address"]);
    const cityKey = findKey(rows[0], ["city", "town"]);
    const zipKey = findKey(rows[0], ["zip", "zipcode", "postal", "postal_code"]);
    const emailKey = findKey(rows[0], ["email", "email_address", "e_mail", "owner_email", "contact_email", "mail"]);
    const officePhoneKey = findKey(rows[0], ["office_phone", "office phone", "office", "work_phone", "work phone", "landline"]);

    console.log("[process-state-upload] file:", fileName, "rows:", rows.length);
    console.log("[process-state-upload] mapped keys:", { phoneKey, nameKey, firstNameKey, lastNameKey, addrKey, cityKey, zipKey, emailKey });

    if (!phoneKey) {
      await broadcast("error", { message: "No phone_number column found" });
      return;
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

    const seen = new Set<string>();
    type Cand = {
      phone_number: string; phone_e164: string; state: string;
      name: string | null; first_name: string | null; last_name?: string | null;
      address: string | null; property_address: string | null;
      city: string | null; zip: string | null; email: string | null;
      source: string; uploaded_file_name: string;
    };
    const candidates: Cand[] = [];

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

      candidates.push({
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
        uploaded_file_name: fileName,
      });
    }

    const totalRows = rows.length;
    let inserted = 0;
    let duplicates = totalRows - candidates.length;

    const chunkSize = 1000;
    await broadcast("progress", {
      phase: "inserting", total_rows: totalRows, candidates: candidates.length,
      processed: 0, inserted: 0, duplicates,
    });
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      const { data: insertedData, error: insErr } = await supabase
        .from("state_leads")
        .upsert(chunk.map(({ last_name: _ln, ...c }) => c), { onConflict: "phone_e164", ignoreDuplicates: true })
        .select("id");
      if (insErr) {
        console.error("insert error", insErr);
        await broadcast("error", { message: insErr.message });
        return;
      }
      const insertedThis = insertedData?.length ?? 0;
      inserted += insertedThis;
      duplicates += chunk.length - insertedThis;
      await broadcast("progress", {
        phase: "inserting", total_rows: totalRows, candidates: candidates.length,
        processed: Math.min(i + chunk.length, candidates.length), inserted, duplicates,
      });
    }
    console.log("[process-state-upload] inserted:", inserted, "duplicates:", duplicates);

    await supabase.from("upload_logs").insert({
      state: selectedState, file_name: fileName,
      total_rows: totalRows, inserted_count: inserted, duplicate_count: duplicates,
    });

    await broadcast("complete", {
      total_rows: totalRows, inserted_count: inserted, duplicate_count: duplicates,
    });
}

